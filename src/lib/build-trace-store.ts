import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import {
  BUILD_TRACE_MAX_SERIALIZED_BYTES,
  BUILD_TRACE_SCHEMA_VERSION,
  canonicalJson,
  findBuildTracePrivacyViolations,
  parseBuildTrace,
  type BuildTraceV1
} from "@/lib/build-trace";
import { hasDatabase } from "@/lib/config";
import { emitObservabilityLog, supportRefForTraceId } from "@/lib/observability";

export const BUILD_TRACE_RETENTION_DAYS = 30;
export const BUILD_TRACE_WRITE_BUDGET_MS = 500;
/** Newest-first cap for a single support lookup. */
export const BUILD_TRACE_READ_LIMIT = 20;

export type BuildTraceSaveOutcome =
  | "saved"
  | "duplicate"
  | "stale_revision"
  | "privacy_rejected"
  | "oversized"
  | "invalid"
  | "unavailable"
  | "failed";

export interface BuildTraceSaveResult {
  outcome: BuildTraceSaveOutcome;
  attemptId: string;
  supportRef?: string;
  byteSize?: number;
  reason?: string;
}

export interface SaveBuildTraceInput {
  trace: BuildTraceV1;
  /**
   * Revision the session has actually committed. A trace is retained only once
   * its revision is live, so an abandoned attempt never becomes the record of
   * what the visitor saw.
   */
  committedRevision: number;
}

export interface StoredBuildTrace {
  attemptId: string;
  traceId: string;
  sessionId: string;
  supportRef: string;
  revision: number;
  terminalStatus: BuildTraceV1["terminalStatus"];
  createdAt: string;
  trace: BuildTraceV1;
}

declare global {
  var __follozeTryMeBuildTraces: Map<string, StoredBuildTrace> | undefined;
}

const memory = globalThis.__follozeTryMeBuildTraces ?? new Map<string, StoredBuildTrace>();
globalThis.__follozeTryMeBuildTraces = memory;

const isTest = process.env.NODE_ENV === "test";
export const buildTraceStoreMode = isTest
  ? "memory-test"
  : hasDatabase
    ? "neon-postgres"
    : "disabled";

let databaseClient: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  databaseClient ??= neon(process.env.DATABASE_URL);
  return databaseClient;
}

async function ensureStoreReady(): Promise<void> {
  if (buildTraceStoreMode !== "neon-postgres") return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDatabase();
      await sql`SELECT attempt_id, trace_id, created_at FROM try_me_build_traces LIMIT 0`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function withinBudget<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error("The build trace write exceeded its latency budget.");
        error.name = "BuildTraceWriteTimeoutError";
        reject(error);
      }, BUILD_TRACE_WRITE_BUDGET_MS);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function storedFrom(trace: BuildTraceV1, createdAt: string): StoredBuildTrace {
  return {
    attemptId: trace.attemptId,
    traceId: trace.traceId,
    sessionId: trace.sessionId,
    supportRef: supportRefForTraceId(trace.traceId),
    revision: trace.revision,
    terminalStatus: trace.terminalStatus,
    createdAt,
    trace
  };
}

/**
 * Persists one build attempt. Every rejection path is a normal return value:
 * a trace that cannot be stored must never interrupt a build the visitor is
 * waiting on.
 */
export async function saveBuildTrace(
  input: SaveBuildTraceInput
): Promise<BuildTraceSaveResult> {
  const parsed = parseBuildTrace(input.trace);
  if (!parsed) {
    return { outcome: "invalid", attemptId: "", reason: "unparseable_trace" };
  }
  if (parsed.schemaVersion !== BUILD_TRACE_SCHEMA_VERSION) {
    return { outcome: "invalid", attemptId: parsed.attemptId, reason: "unsupported_schema" };
  }
  if (parsed.revision !== input.committedRevision) {
    return {
      outcome: "stale_revision",
      attemptId: parsed.attemptId,
      reason: "revision_not_committed"
    };
  }

  const violations = findBuildTracePrivacyViolations(parsed);
  if (violations.length) {
    emitObservabilityLog("error", {
      type: "try_me_error",
      event: "build_trace_privacy_rejected",
      traceId: parsed.traceId,
      supportRef: supportRefForTraceId(parsed.traceId),
      stage: "maintenance",
      outcome: "error",
      details: { count: violations.length, reason: violations[0]?.reason }
    });
    return { outcome: "privacy_rejected", attemptId: parsed.attemptId };
  }

  const serialized = canonicalJson(parsed);
  const byteSize = Buffer.byteLength(serialized, "utf8");
  if (byteSize > BUILD_TRACE_MAX_SERIALIZED_BYTES) {
    return { outcome: "oversized", attemptId: parsed.attemptId, byteSize };
  }

  const supportRef = supportRefForTraceId(parsed.traceId);
  const createdAt = parsed.completedAt ?? parsed.startedAt;

  if (buildTraceStoreMode === "disabled") {
    return { outcome: "unavailable", attemptId: parsed.attemptId, supportRef, byteSize };
  }

  try {
    if (buildTraceStoreMode === "memory-test") {
      if (memory.has(parsed.attemptId)) {
        return { outcome: "duplicate", attemptId: parsed.attemptId, supportRef, byteSize };
      }
      memory.set(parsed.attemptId, storedFrom(parsed, createdAt));
      return { outcome: "saved", attemptId: parsed.attemptId, supportRef, byteSize };
    }

    const inserted = await withinBudget(
      (async () => {
        await ensureStoreReady();
        const sql = getDatabase();
        return sql`
          INSERT INTO try_me_build_traces (
            attempt_id, trace_id, session_id, support_ref, schema_version, pipeline_version,
            revision, terminal_status, section_count, fallback_count, byte_size, trace,
            created_at, expires_at
          ) VALUES (
            ${parsed.attemptId}, ${parsed.traceId}, ${parsed.sessionId}, ${supportRef},
            ${parsed.schemaVersion}, ${parsed.pipelineVersion}, ${parsed.revision},
            ${parsed.terminalStatus}, ${parsed.sections.length}, ${parsed.fallbacks.length},
            ${byteSize}, CAST(${serialized} AS jsonb), ${createdAt},
            ${new Date(
              Date.parse(createdAt) + BUILD_TRACE_RETENTION_DAYS * 86_400_000
            ).toISOString()}
          )
          ON CONFLICT (attempt_id) DO NOTHING
          RETURNING attempt_id
        `;
      })()
    );
    return {
      outcome: inserted.length ? "saved" : "duplicate",
      attemptId: parsed.attemptId,
      supportRef,
      byteSize
    };
  } catch (error) {
    emitObservabilityLog("error", {
      type: "try_me_error",
      event: "build_trace_persist_failed",
      traceId: parsed.traceId,
      supportRef,
      stage: "maintenance",
      outcome: "error",
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return { outcome: "failed", attemptId: parsed.attemptId, supportRef, byteSize };
  }
}

function fromRow(row: Record<string, unknown>): StoredBuildTrace | undefined {
  const trace = parseBuildTrace(row.trace);
  if (!trace) return undefined;
  return {
    attemptId: String(row.attempt_id),
    traceId: String(row.trace_id),
    sessionId: String(row.session_id),
    supportRef: String(row.support_ref),
    revision: Number(row.revision),
    terminalStatus: trace.terminalStatus,
    createdAt: new Date(String(row.created_at)).toISOString(),
    trace
  };
}

async function readBy(
  column: "trace_id" | "support_ref",
  value: string
): Promise<StoredBuildTrace[]> {
  if (buildTraceStoreMode === "memory-test") {
    return [...memory.values()]
      .filter((stored) => (column === "trace_id" ? stored.traceId : stored.supportRef) === value)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, BUILD_TRACE_READ_LIMIT)
      .map((stored) => structuredClone(stored));
  }
  if (buildTraceStoreMode !== "neon-postgres") return [];

  await ensureStoreReady();
  const sql = getDatabase();
  const rows =
    column === "trace_id"
      ? await sql`
          SELECT attempt_id, trace_id, session_id, support_ref, revision, created_at, trace
          FROM try_me_build_traces
          WHERE trace_id = ${value} AND expires_at > now()
          ORDER BY created_at DESC
          LIMIT ${BUILD_TRACE_READ_LIMIT}
        `
      : await sql`
          SELECT attempt_id, trace_id, session_id, support_ref, revision, created_at, trace
          FROM try_me_build_traces
          WHERE support_ref = ${value} AND expires_at > now()
          ORDER BY created_at DESC
          LIMIT ${BUILD_TRACE_READ_LIMIT}
        `;
  return rows
    .map((row) => fromRow(row as Record<string, unknown>))
    .filter((stored): stored is StoredBuildTrace => Boolean(stored));
}

export async function readBuildTracesByTraceId(traceId: string): Promise<StoredBuildTrace[]> {
  return readBy("trace_id", traceId);
}

export async function readBuildTracesBySupportRef(
  supportRef: string
): Promise<StoredBuildTrace[]> {
  return readBy("support_ref", supportRef.trim().toUpperCase());
}

export async function purgeExpiredBuildTraces(): Promise<number> {
  if (buildTraceStoreMode === "memory-test") {
    const cutoff = Date.now() - BUILD_TRACE_RETENTION_DAYS * 86_400_000;
    let deleted = 0;
    for (const [attemptId, stored] of memory) {
      if (Date.parse(stored.createdAt) < cutoff) {
        memory.delete(attemptId);
        deleted += 1;
      }
    }
    return deleted;
  }
  if (buildTraceStoreMode !== "neon-postgres") return 0;

  await ensureStoreReady();
  const sql = getDatabase();
  const rows = await sql`
    DELETE FROM try_me_build_traces WHERE expires_at <= now() RETURNING attempt_id
  `;
  return rows.length;
}

export function clearMemoryBuildTracesForTest(): void {
  memory.clear();
}
