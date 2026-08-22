import { createHash } from "node:crypto";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { hasDatabase } from "@/lib/config";
import {
  emitObservabilityLog,
  sanitizeObservabilityMeta,
  supportRefForTraceId,
  type ObservabilityMeta
} from "@/lib/observability";
import type { SessionEvent, TryMeSession } from "@/lib/types";

export const TRACE_RETENTION_DAYS = 30;
export const TRACE_EVENT_LIMIT = 200;
export const TRACE_WRITE_BUDGET_MS = 500;

export type TraceStage =
  | "session"
  | "brand"
  | "audience"
  | "story"
  | "render"
  | "preview"
  | "claim"
  | "maintenance";
export type TraceOutcome = "started" | "success" | "fallback" | "error" | "info";

export interface TraceEventRecord {
  eventId: string;
  traceId: string;
  supportRef: string;
  event: string;
  stage: TraceStage;
  outcome: TraceOutcome;
  at: string;
  requestId?: string;
  spanId?: string;
  durationMs?: number;
  meta?: ObservabilityMeta;
}

declare global {
  var __follozeTryMeTraceEvents: Map<string, TraceEventRecord> | undefined;
}

const memory = globalThis.__follozeTryMeTraceEvents ?? new Map<string, TraceEventRecord>();
globalThis.__follozeTryMeTraceEvents = memory;

const isTest = process.env.NODE_ENV === "test";
export const traceStoreMode = isTest
  ? "memory-test"
  : hasDatabase
    ? "neon-postgres"
    : "console-only";

let databaseClient: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

const traceMetaAllowlist = new Set([
  "attemptId",
  "priorAttemptId",
  "trigger",
  "revision",
  "requestId",
  "useCase",
  "source",
  "sourceKind",
  "priorSource",
  "identityConfidence",
  "identityFallback",
  "identityRejectionReason",
  "count",
  "categorySource",
  "sellerCategorySource",
  "targetCategorySource",
  "recommendationId",
  "status",
  "hasValue",
  "publishMode",
  "publishStatus",
  "emailStatus",
  "error",
  "durationMs",
  "fallbackReason",
  "model",
  "logoStrategy",
  "logoAvailable",
  "acceptedLogoAvailable",
  "logoCandidateCount",
  "inlineLogoCandidateCount",
  "logoSelectedSource",
  "logoAssetPath",
  "harvestedSource",
  "harvestedColorCount",
  "logoValidationAttempted",
  "logoValidationRejected",
  "brandPublicPageProvider",
  "brandPublicPageAttempts",
  "brandRemoteBrowserProvider",
  "brandfetchProvider",
  "brandfetchLogoApiProvider",
  "brandfetchBrandApiProvider",
  "brandfetchQualityTier",
  "brandfetchClaimed",
  "brandfetchColorCount",
  "brandfetchFontCount",
  "brandfetchImageCount",
  "brandfetchIndustryCount",
  "brandReadiness",
  "paletteConfidence",
  "brandDesignReady",
  "brandDesignFidelityScore",
  "brandDesignMissing",
  "brandHarvestRequestId",
  "brandDesignSource",
  "brandDesignConfidence",
  "designReady",
  "designFidelityScore",
  "designMissing",
  "verifiedBrandFallback",
  "remoteBrowserConfigured",
  "brandfetchConfigured",
  "verifiedFallbackAvailable",
  "stylesheetAttempted",
  "stylesheetSucceeded",
  "colorCount",
  "versionNumber",
  "artifactRevision",
  "generationEligibleToPreviewMs",
  "provisionalToFinalMs",
  "submissionToPreviewMs",
  "budgetMs",
  "finalizationReserveMs",
  "elapsedMs",
  "remainingMs",
  "remainingBeforeFinalizationMs",
  "deadlineAt",
  "finalizationAt",
  "requiredMs",
  "qualityGate",
  "reason",
  "byteSizeBucket",
  "mode",
  "workerName",
  "workerOutcome",
  "fieldKey",
  "fieldAction",
  "compositionId",
  "variantId",
  "modalKind",
  "interactionType",
  "interactionTarget",
  "entrySurface",
  "domainRole",
  "normalization",
  "interpretation",
  "retryScope",
  "receiptKind"
]);

function traceMeta(meta: SessionEvent["meta"]): ObservabilityMeta | undefined {
  const sanitized = sanitizeObservabilityMeta(meta);
  if (!sanitized) return undefined;
  return Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => traceMetaAllowlist.has(key))
  );
}

function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  databaseClient ??= neon(process.env.DATABASE_URL);
  return databaseClient;
}

async function ensureTraceStoreReady(): Promise<void> {
  if (traceStoreMode !== "neon-postgres") return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDatabase();
      await sql`SELECT event_id, trace_id, event_name, created_at FROM try_me_traces LIMIT 0`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export function traceIdForSession(session: Pick<TryMeSession, "id" | "traceId">): string {
  return session.traceId ?? `legacy_${createHash("sha256")
    .update(`try-me-trace-v1\u0000${session.id}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function stageForEvent(name: string, meta?: SessionEvent["meta"]): TraceStage {
  if (/^(?:brand|company_domain)/.test(name)) return "brand";
  if (/^(?:target|audience|account_evidence)/.test(name)) return "audience";
  if (/^(?:generation|source|offer_source|message_spine|cta_|creative_|asset_|block_|curated_|composition_)/.test(name)) {
    return "story";
  }
  if (/^upload_/.test(name)) return "story";
  if (/^render_/.test(name)) return "render";
  if (/^(?:preview_|provisional_|final_rendered)/.test(name)) return "preview";
  if (/^(?:claim|lead_|followup_)/.test(name)) return "claim";
  if (/^(?:cleanup|reconciliation|maintenance)/.test(name)) return "maintenance";
  if (/^worker_/.test(name)) {
    const worker = typeof meta?.workerName === "string" ? meta.workerName : "";
    if (worker === "brand") return "brand";
    if (worker === "audience") return "audience";
    if (worker === "render") return "render";
    if (worker === "claim") return "claim";
    return "story";
  }
  return "session";
}

function outcomeForEvent(name: string, meta: SessionEvent["meta"]): TraceOutcome {
  if (/(?:failed|rejected|timed_out)$/.test(name) || name === "worker_failed") return "error";
  if (/(?:started|submitted)$/.test(name) || name === "worker_started") return "started";
  if (/fallback|fell_back/.test(name) || meta?.fallbackReason) return "fallback";
  if (
    /(?:completed|ready|created|captured|sent|selected|updated|refined|issued|rendered)$/.test(name)
    || name === "worker_completed"
  ) {
    return "success";
  }
  return "info";
}

function boundedDuration(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(300_000, Math.max(0, Math.round(value)))
    : undefined;
}

function recordForEvent(session: TryMeSession, event: SessionEvent): TraceEventRecord | null {
  if (!event.id) return null;
  const meta = traceMeta(event.meta);
  const requestId = typeof event.meta?.requestId === "string" ? event.meta.requestId : undefined;
  const spanId = typeof event.meta?.attemptId === "string" ? event.meta.attemptId : undefined;
  return {
    eventId: event.id,
    traceId: traceIdForSession(session),
    supportRef: supportRefForTraceId(traceIdForSession(session)),
    event: event.name,
    stage: stageForEvent(event.name, event.meta),
    outcome: outcomeForEvent(event.name, event.meta),
    at: event.at,
    requestId,
    spanId,
    durationMs: boundedDuration(event.meta?.durationMs),
    meta
  };
}

async function persistRecords(records: TraceEventRecord[]): Promise<void> {
  if (!records.length) return;
  if (traceStoreMode === "memory-test") {
    for (const record of records) memory.set(record.eventId, structuredClone(record));
    return;
  }
  if (traceStoreMode !== "neon-postgres") return;

  await ensureTraceStoreReady();
  const sql = getDatabase();
  const payload = records.map((record) => ({
    event_id: record.eventId,
    trace_id: record.traceId,
    support_ref: record.supportRef,
    event_name: record.event,
    stage: record.stage,
    outcome: record.outcome,
    request_id: record.requestId ?? null,
    span_id: record.spanId ?? null,
    duration_ms: record.durationMs ?? null,
    metadata: record.meta ?? {},
    created_at: record.at,
    expires_at: new Date(
      Date.parse(record.at) + TRACE_RETENTION_DAYS * 86_400_000
    ).toISOString()
  }));
  await sql`
    INSERT INTO try_me_traces (
      event_id, trace_id, support_ref, event_name, stage, outcome, request_id, span_id,
      duration_ms, metadata, created_at, expires_at
    )
    SELECT event_id, trace_id, support_ref, event_name, stage, outcome, request_id, span_id,
           duration_ms, metadata, created_at, expires_at
    FROM jsonb_to_recordset(CAST(${JSON.stringify(payload)} AS jsonb)) AS event_rows(
      event_id text,
      trace_id text,
      support_ref text,
      event_name text,
      stage text,
      outcome text,
      request_id text,
      span_id text,
      duration_ms integer,
      metadata jsonb,
      created_at timestamptz,
      expires_at timestamptz
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

async function persistWithinBudget(records: TraceEventRecord[]): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      persistRecords(records),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("The trace write exceeded its latency budget.");
          error.name = "TraceWriteTimeoutError";
          reject(error);
        }, TRACE_WRITE_BUDGET_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function recordCommittedSessionEvents(
  session: TryMeSession,
  previousEvents: SessionEvent[] = []
): Promise<void> {
  const priorIds = new Set(previousEvents.map((event) => event.id).filter(Boolean));
  const records = (session.events ?? [])
    .filter((event) => event.id && !priorIds.has(event.id))
    .map((event) => recordForEvent(session, event))
    .filter((record): record is TraceEventRecord => Boolean(record));

  for (const record of records) {
    emitObservabilityLog("info", {
      type: "try_me_trace",
      event: record.event,
      eventId: record.eventId,
      traceId: record.traceId,
      supportRef: record.supportRef,
      stage: record.stage,
      outcome: record.outcome,
      requestId: record.requestId,
      spanId: record.spanId,
      durationMs: record.durationMs,
      details: record.meta
    });
  }
  try {
    await persistWithinBudget(records);
  } catch (error) {
    const first = records[0];
    emitObservabilityLog("error", {
      type: "try_me_error",
      event: "trace_persist_failed",
      traceId: first?.traceId,
      supportRef: first?.supportRef,
      stage: "maintenance",
      outcome: "error",
      errorName: error instanceof Error ? error.name : "UnknownError",
      details: { count: records.length }
    });
  }
}

export async function readTraceEvents(traceId: string): Promise<TraceEventRecord[]> {
  if (traceStoreMode === "memory-test") {
    return [...memory.values()]
      .filter((record) => record.traceId === traceId)
      .sort((left, right) => left.at.localeCompare(right.at))
      .slice(-TRACE_EVENT_LIMIT)
      .map((record) => structuredClone(record));
  }
  if (traceStoreMode !== "neon-postgres") return [];

  await ensureTraceStoreReady();
  const sql = getDatabase();
  const rows = await sql`
    SELECT * FROM (
      SELECT event_id, trace_id, support_ref, event_name, stage, outcome, request_id, span_id,
             duration_ms, metadata, created_at
      FROM try_me_traces
      WHERE trace_id = ${traceId} AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT ${TRACE_EVENT_LIMIT}
    ) AS recent_events
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    eventId: String(row.event_id),
    traceId: String(row.trace_id),
    supportRef: String(row.support_ref),
    event: String(row.event_name),
    stage: row.stage as TraceStage,
    outcome: row.outcome as TraceOutcome,
    at: new Date(String(row.created_at)).toISOString(),
    requestId: row.request_id ? String(row.request_id) : undefined,
    spanId: row.span_id ? String(row.span_id) : undefined,
    durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
    meta: row.metadata && typeof row.metadata === "object"
      ? (row.metadata as ObservabilityMeta)
      : undefined
  }));
}

export async function purgeExpiredTraceEvents(): Promise<number> {
  if (traceStoreMode === "memory-test") {
    const cutoff = Date.now() - TRACE_RETENTION_DAYS * 86_400_000;
    let deleted = 0;
    for (const [eventId, record] of memory) {
      if (Date.parse(record.at) < cutoff) {
        memory.delete(eventId);
        deleted += 1;
      }
    }
    return deleted;
  }
  if (traceStoreMode !== "neon-postgres") return 0;

  await ensureTraceStoreReady();
  const sql = getDatabase();
  const rows = await sql`DELETE FROM try_me_traces WHERE expires_at <= now() RETURNING event_id`;
  return rows.length;
}

export function clearMemoryTraceEventsForTest(): void {
  memory.clear();
}
