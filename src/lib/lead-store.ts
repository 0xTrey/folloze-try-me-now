import { createHash } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { get, list, put } from "@vercel/blob";

import { hasBlob, hasDatabase } from "@/lib/config";
import type { TryMeSession } from "@/lib/types";

export interface LeadRecord {
  sessionId: string;
  claimAttemptId: string;
  claimAttemptStartedAt: string;
  email: string;
  emailDomain: string;
  companyDomain: string;
  targetDomain?: string;
  useCase: TryMeSession["useCase"];
  audience?: string;
  objective?: string;
  campaignType?: string;
  sourceKind: "url" | "pdf" | "none";
  experienceUrl: string;
  artifactRevision: number;
  artifactDigest: string;
  generationSource?: string;
  claimStatus: "captured" | "claimed" | "failed";
  publishStatus: "pending" | "not-attempted" | "published" | "preview-only" | "failed";
  emailStatus: "pending" | "not-attempted" | "sent" | "skipped" | "failed";
  consentScope: "transactional_experience_delivery";
  capturedAt: string;
  claimedAt?: string;
  updatedAt: string;
}

declare global {
  var __follozeTryMeLeads: Map<string, LeadRecord> | undefined;
}

const memory = globalThis.__follozeTryMeLeads ?? new Map<string, LeadRecord>();
globalThis.__follozeTryMeLeads = memory;

const isTest = process.env.NODE_ENV === "test";
export const leadStoreMode = isTest
  ? "memory-test"
  : hasDatabase
    ? "neon-postgres"
    : hasBlob
      ? "vercel-blob"
      : "memory-demo";

const blobPathFor = (sessionId: string) => `try-me/leads/${sessionId}.json`;
let databaseClient: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  databaseClient ??= neon(process.env.DATABASE_URL);
  return databaseClient;
}

export async function ensureLeadStoreReady(): Promise<void> {
  if (leadStoreMode !== "neon-postgres") return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDatabase();
      // Runtime requests only verify the migrated contract. Schema mutation belongs in
      // db/migrations so an application instance never needs DDL privileges.
      await sql`
        SELECT session_id, claim_attempt_id, claim_attempt_started_at,
               artifact_revision, artifact_digest,
               claim_status, publish_status, email_status
        FROM try_me_leads
        LIMIT 0
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function sourceKind(session: TryMeSession): LeadRecord["sourceKind"] {
  if (session.answers.sourceName) return "pdf";
  if (session.answers.sourceUrl) return "url";
  return "none";
}

function leadFromSession(session: TryMeSession, email: string): LeadRecord {
  if (!session.claim?.attemptId || !session.claim.startedAt) {
    throw new Error("Lead capture requires an active claim attempt.");
  }
  const now = new Date().toISOString();
  const artifactRevision = session.experience?.artifactRevision ?? session.revision;
  const artifactDigest =
    session.experience?.artifactDigest ??
    createHash("sha256").update(session.experience?.html ?? "").digest("hex");
  return {
    sessionId: session.id,
    claimAttemptId: session.claim.attemptId,
    claimAttemptStartedAt: session.claim.startedAt,
    email,
    emailDomain: email.split("@")[1] ?? "",
    companyDomain: session.companyDomain,
    targetDomain: session.answers.targetDomain,
    useCase: session.useCase,
    audience: session.answers.customAudience || session.answers.audience,
    objective: session.answers.objective,
    campaignType: session.answers.campaignType,
    sourceKind: sourceKind(session),
    experienceUrl: session.temporaryUrl,
    artifactRevision,
    artifactDigest,
    generationSource: session.experience?.generationSource,
    claimStatus: "captured",
    publishStatus: "pending",
    emailStatus: "pending",
    consentScope: "transactional_experience_delivery",
    capturedAt: now,
    updatedAt: now
  };
}

async function writeBlobLead(record: LeadRecord): Promise<void> {
  await put(blobPathFor(record.sessionId), JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json"
  });
}

async function readBlobLead(sessionId: string): Promise<LeadRecord | undefined> {
  const result = await get(blobPathFor(sessionId), { access: "private", useCache: false });
  return result?.statusCode === 200
    ? ((await new Response(result.stream).json()) as LeadRecord)
    : undefined;
}

export async function recordLeadCapture(session: TryMeSession, email: string): Promise<LeadRecord> {
  const record = leadFromSession(session, email);
  if (leadStoreMode === "neon-postgres") {
    await ensureLeadStoreReady();
    const sql = getDatabase();
    const rows = await sql`
      INSERT INTO try_me_leads (
        session_id, claim_attempt_id, claim_attempt_started_at,
        email, email_domain, company_domain, target_domain, use_case,
        audience, objective, campaign_type, source_kind, experience_url,
        artifact_revision, artifact_digest, generation_source, claim_status, publish_status, email_status,
        consent_scope, captured_at, updated_at
      ) VALUES (
        ${record.sessionId}, ${record.claimAttemptId}, ${record.claimAttemptStartedAt},
        ${record.email}, ${record.emailDomain}, ${record.companyDomain},
        ${record.targetDomain ?? null}, ${record.useCase}, ${record.audience ?? null},
        ${record.objective ?? null}, ${record.campaignType ?? null}, ${record.sourceKind},
        ${record.experienceUrl}, ${record.artifactRevision}, ${record.artifactDigest},
        ${record.generationSource ?? null}, ${record.claimStatus},
        ${record.publishStatus}, ${record.emailStatus}, ${record.consentScope},
        ${record.capturedAt}, ${record.updatedAt}
      )
      ON CONFLICT (session_id) DO UPDATE SET
        claim_attempt_id = EXCLUDED.claim_attempt_id,
        claim_attempt_started_at = EXCLUDED.claim_attempt_started_at,
        email_domain = EXCLUDED.email_domain,
        company_domain = EXCLUDED.company_domain,
        target_domain = EXCLUDED.target_domain,
        use_case = EXCLUDED.use_case,
        audience = EXCLUDED.audience,
        objective = EXCLUDED.objective,
        campaign_type = EXCLUDED.campaign_type,
        source_kind = EXCLUDED.source_kind,
        experience_url = EXCLUDED.experience_url,
        artifact_revision = EXCLUDED.artifact_revision,
        artifact_digest = EXCLUDED.artifact_digest,
        generation_source = EXCLUDED.generation_source,
        claim_status = CASE
          WHEN try_me_leads.claim_attempt_id = EXCLUDED.claim_attempt_id
            THEN try_me_leads.claim_status
          ELSE EXCLUDED.claim_status
        END,
        publish_status = CASE
          WHEN try_me_leads.claim_attempt_id = EXCLUDED.claim_attempt_id
            THEN try_me_leads.publish_status
          ELSE EXCLUDED.publish_status
        END,
        email_status = CASE
          WHEN try_me_leads.claim_attempt_id = EXCLUDED.claim_attempt_id
            THEN try_me_leads.email_status
          ELSE EXCLUDED.email_status
        END,
        claimed_at = CASE
          WHEN try_me_leads.claim_attempt_id = EXCLUDED.claim_attempt_id
            THEN try_me_leads.claimed_at
          ELSE NULL
        END,
        updated_at = EXCLUDED.updated_at
      WHERE try_me_leads.email = EXCLUDED.email
        AND (
          try_me_leads.claim_attempt_id = EXCLUDED.claim_attempt_id
          OR try_me_leads.claim_attempt_started_at < EXCLUDED.claim_attempt_started_at
        )
      RETURNING session_id
    `;
    const returnedRows = Array.isArray(rows) ? rows : rows.rows;
    if (returnedRows.length !== 1) {
      throw new Error("This lead capture was superseded or belongs to a different business email.");
    }
  } else if (leadStoreMode === "vercel-blob") {
    const existing = await readBlobLead(record.sessionId);
    if (
      existing &&
      (existing.email !== record.email ||
        (existing.claimAttemptId !== record.claimAttemptId &&
          Date.parse(existing.claimAttemptStartedAt) >= Date.parse(record.claimAttemptStartedAt)))
    ) {
      throw new Error("This lead capture was superseded or belongs to a different business email.");
    }
    await writeBlobLead(
      existing?.claimAttemptId === record.claimAttemptId
        ? {
            ...record,
            claimStatus: existing.claimStatus,
            publishStatus: existing.publishStatus,
            emailStatus: existing.emailStatus,
            capturedAt: existing.capturedAt,
            claimedAt: existing.claimedAt
          }
        : record
    );
  } else {
    const existing = memory.get(record.sessionId);
    if (
      existing &&
      (existing.email !== record.email ||
        (existing.claimAttemptId !== record.claimAttemptId &&
          Date.parse(existing.claimAttemptStartedAt) >= Date.parse(record.claimAttemptStartedAt)))
    ) {
      throw new Error("This lead capture was superseded or belongs to a different business email.");
    }
    memory.set(
      record.sessionId,
      structuredClone(
        existing?.claimAttemptId === record.claimAttemptId
          ? {
              ...record,
              claimStatus: existing.claimStatus,
              publishStatus: existing.publishStatus,
              emailStatus: existing.emailStatus,
              capturedAt: existing.capturedAt,
              claimedAt: existing.claimedAt
            }
          : record
      )
    );
  }
  return record;
}

export async function updateLeadOutcome(input: {
  sessionId: string;
  claimAttemptId: string;
  experienceUrl: string;
  claimStatus: LeadRecord["claimStatus"];
  publishStatus: LeadRecord["publishStatus"];
  emailStatus: LeadRecord["emailStatus"];
  claimedAt?: string;
}): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  if (leadStoreMode === "neon-postgres") {
    await ensureLeadStoreReady();
    const sql = getDatabase();
    const rows = await sql`
      UPDATE try_me_leads
      SET experience_url = ${input.experienceUrl},
          claim_status = ${input.claimStatus},
          publish_status = ${input.publishStatus},
          email_status = ${input.emailStatus},
          claimed_at = ${input.claimedAt ?? null},
          updated_at = ${updatedAt}
      WHERE session_id = ${input.sessionId}
        AND claim_attempt_id = ${input.claimAttemptId}
      RETURNING session_id
    `;
    const returnedRows = Array.isArray(rows) ? rows : rows.rows;
    if (returnedRows.length === 1) return true;
    const existing = await sql`
      SELECT claim_attempt_id
      FROM try_me_leads
      WHERE session_id = ${input.sessionId}
      LIMIT 1
    `;
    const existingRows = Array.isArray(existing) ? existing : existing.rows;
    if (existingRows.length === 0) {
      throw new Error(`Lead outcome cannot be updated before capture: ${input.sessionId}`);
    }
    return false;
  }

  let current: LeadRecord | undefined;
  if (leadStoreMode === "vercel-blob") {
    current = await readBlobLead(input.sessionId);
  } else {
    current = memory.get(input.sessionId);
  }
  if (!current) {
    throw new Error(`Lead outcome cannot be updated before capture: ${input.sessionId}`);
  }
  if (current.claimAttemptId !== input.claimAttemptId) return false;
  const next: LeadRecord = { ...current, ...input, updatedAt };
  if (leadStoreMode === "vercel-blob") await writeBlobLead(next);
  else memory.set(next.sessionId, structuredClone(next));
  return true;
}

export function getMemoryLeadForTest(sessionId: string): LeadRecord | undefined {
  return memory.get(sessionId);
}

export function clearMemoryLeadsForTest(): void {
  memory.clear();
}

export async function listLeadsNeedingReconciliation(limit = 100): Promise<string[]> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  if (leadStoreMode === "neon-postgres") {
    await ensureLeadStoreReady();
    const sql = getDatabase();
    const rows = await sql`
      SELECT session_id
      FROM try_me_leads
      WHERE claim_status = 'captured'
        AND updated_at < now() - interval '30 seconds'
      ORDER BY updated_at ASC
      LIMIT ${boundedLimit}
    `;
    const resultRows = Array.isArray(rows) ? rows : rows.rows;
    return resultRows
      .map((row) => {
        if (!row || Array.isArray(row) || typeof row !== "object") return undefined;
        return typeof row.session_id === "string" ? row.session_id : undefined;
      })
      .filter((sessionId): sessionId is string => Boolean(sessionId));
  }

  if (leadStoreMode === "vercel-blob") {
    const sessionIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "try-me/leads/", cursor, limit: 1000 });
      const records = await Promise.all(
        page.blobs.map(async (blob) => {
          const id = blob.pathname.split("/").at(-1)?.replace(/\.json$/, "") ?? "";
          return id ? readBlobLead(id) : undefined;
        })
      );
      for (const record of records) {
        if (
          record?.claimStatus === "captured" &&
          Date.now() - Date.parse(record.updatedAt) >= 30_000
        ) {
          sessionIds.push(record.sessionId);
          if (sessionIds.length >= boundedLimit) return sessionIds;
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return sessionIds;
  }

  return [...memory.values()]
    .filter((record) => record.claimStatus === "captured")
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(0, boundedLimit)
    .map((record) => record.sessionId);
}
