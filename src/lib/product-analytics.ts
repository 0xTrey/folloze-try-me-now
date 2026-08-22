import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { hasDatabase } from "@/lib/config";
import {
  emitObservabilityLog,
  sanitizeObservabilityText,
  supportRefForTraceId
} from "@/lib/observability";
import {
  assertUnifiedProductEventProperties,
  isPrivateAnalyticsPropertyKey,
  PRODUCT_EVENT_CATEGORIES,
  PRODUCT_EVENT_NAMES,
  UNIFIED_PRODUCT_EVENT_NAMES,
  UNSAFE_ANALYTICS_PROPERTY_VALUE_PATTERN,
  type UnifiedProductEventName
} from "@/lib/product-analytics-contracts";
import type { SessionAnalyticsIdentity, SessionAnswers, TryMeSession, UseCase } from "@/lib/types";

export {
  assertUnifiedProductEventProperties,
  isPrivateAnalyticsPropertyKey,
  PRODUCT_EVENT_CATEGORIES,
  PRODUCT_EVENT_NAMES,
  productEventCategoryFor,
  UNIFIED_BRIEF_FIELD_KEYS,
  UNIFIED_PRODUCT_EVENT_CONTRACTS,
  UNIFIED_PRODUCT_EVENT_NAMES,
  UNIFIED_VARIANT_IDS,
  UNIFIED_WORKER_NAMES
} from "@/lib/product-analytics-contracts";
export type {
  ProductEventCategory,
  ProductEventName,
  UnifiedProductEventName
} from "@/lib/product-analytics-contracts";

const analyticsId = (prefix: "tmv" | "tmb" | "tme") =>
  z.string().trim().regex(new RegExp(`^${prefix}_[a-zA-Z0-9_-]{16,128}$`));
const safeText = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !value.includes("@"), "Analytics properties cannot contain contact information.")
  .refine(
    (value) =>
      !UNSAFE_ANALYTICS_PROPERTY_VALUE_PATTERN.test(value) || /^TMN-[A-Z0-9]{8,16}$/.test(value),
    "Analytics properties cannot contain domains, URLs, or contact information."
  )
  .transform((value) => sanitizeObservabilityText(value, 160));
const safePropertyValue = z.union([safeText, z.number().finite(), z.boolean(), z.null()]);

export const analyticsIdentitySchema = z.object({
  visitorId: analyticsId("tmv"),
  browserSessionId: analyticsId("tmb")
}).strict();
export type AnalyticsIdentity = z.infer<typeof analyticsIdentitySchema>;

export const productEventPayloadSchema = z.object({
  eventId: analyticsId("tme"),
  visitorId: analyticsId("tmv"),
  browserSessionId: analyticsId("tmb"),
  sessionId: z.string().trim().min(8).max(128).regex(/^[a-z0-9_-]+$/i).optional(),
  event: z.enum(PRODUCT_EVENT_NAMES),
  category: z.enum(PRODUCT_EVENT_CATEGORIES),
  path: z.string().trim().min(1).max(240).regex(/^\/[a-z0-9/_-]*$/i).optional(),
  outcome: z.enum(["started", "success", "failure", "cancelled", "info"]).optional(),
  durationMs: z.number().int().min(0).max(300000).optional(),
  properties: z
    .record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), safePropertyValue)
    .refine((value) => Object.keys(value).length <= 24, "Analytics events accept at most 24 properties.")
    .refine(
      (value) => !Object.keys(value).some((key) => isPrivateAnalyticsPropertyKey(key)),
      "Analytics properties cannot use private or identifying keys."
    )
    .optional(),
  occurredAt: z.string().datetime().optional(),
  landing: z.object({
    path: z.string().trim().min(1).max(240).regex(/^\/[a-z0-9/_-]*$/i),
    referrerHost: z.string().trim().min(1).max(253).regex(/^[a-z0-9.-]+$/i).optional(),
    utm: z.partialRecord(z.enum(["source", "medium", "campaign", "term", "content"]), safeText).optional(),
    deviceClass: z.enum(["desktop", "tablet", "mobile", "unknown"]),
    browserFamily: z.string().trim().min(1).max(40).regex(/^[a-z0-9 ._-]+$/i)
  }).strict().optional()
}).strict().superRefine((payload, context) => {
  if (!(UNIFIED_PRODUCT_EVENT_NAMES as readonly string[]).includes(payload.event)) return;
  try {
    assertUnifiedProductEventProperties(
      payload.event as UnifiedProductEventName,
      payload.properties as Record<string, string | number | boolean | null> | undefined
    );
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Unified analytics contract violated.",
      path: ["properties"]
    });
  }
});

export type ProductEventPayload = z.infer<typeof productEventPayloadSchema>;

const productEventBatchSchema = z.object({
  events: z.array(productEventPayloadSchema).min(1).max(20)
}).strict();

export function parseProductEventBatch(value: unknown): ProductEventPayload[] {
  return productEventBatchSchema.parse(value).events;
}

declare global {
  var __follozeTryMeProductEvents: ProductEventPayload[] | undefined;
  var __follozeTryMeProductSessions: Map<string, ProductSessionSnapshot> | undefined;
}

const eventMemory = globalThis.__follozeTryMeProductEvents ?? [];
globalThis.__follozeTryMeProductEvents = eventMemory;
const sessionMemory = globalThis.__follozeTryMeProductSessions ?? new Map<string, ProductSessionSnapshot>();
globalThis.__follozeTryMeProductSessions = sessionMemory;

const isTest = process.env.NODE_ENV === "test";
export const productAnalyticsStoreMode = isTest
  ? "memory-test"
  : hasDatabase
    ? "neon-postgres"
    : "console-only";

let databaseClient: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  databaseClient ??= neon(process.env.DATABASE_URL);
  return databaseClient;
}

async function ensureSchemaReady(): Promise<void> {
  if (productAnalyticsStoreMode !== "neon-postgres") return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDatabase();
      await sql`SELECT event_id FROM try_me_product_events LIMIT 0`;
      await sql`SELECT session_id FROM try_me_product_sessions LIMIT 0`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function boundedDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > 86_400_000) {
    return new Date().toISOString();
  }
  return new Date(parsed).toISOString();
}

export async function recordProductEvents(events: ProductEventPayload[]): Promise<number> {
  if (productAnalyticsStoreMode === "memory-test") {
    let inserted = 0;
    for (const event of events) {
      if (eventMemory.some((candidate) => candidate.eventId === event.eventId)) continue;
      eventMemory.push(structuredClone(event));
      inserted += 1;
    }
    return inserted;
  }
  if (productAnalyticsStoreMode === "console-only") {
    emitObservabilityLog("info", {
      type: "try_me_trace",
      event: "product_analytics_console_only",
      details: { count: events.length }
    });
    return 0;
  }

  await ensureSchemaReady();
  const sql = getDatabase();
  let inserted = 0;
  for (const event of events) {
    const createdAt = boundedDate(event.occurredAt);
    const landing = event.landing;
    await sql`
      INSERT INTO try_me_visitors (
        visitor_id, first_seen_at, last_seen_at, first_landing_path,
        first_referrer_host, first_utm
      ) VALUES (
        ${event.visitorId}, ${createdAt}, ${createdAt}, ${landing?.path ?? event.path ?? null},
        ${landing?.referrerHost ?? null}, CAST(${JSON.stringify(landing?.utm ?? {})} AS jsonb)
      )
      ON CONFLICT (visitor_id) DO UPDATE SET
        last_seen_at = GREATEST(try_me_visitors.last_seen_at, EXCLUDED.last_seen_at),
        expires_at = GREATEST(try_me_visitors.expires_at, now() + interval '365 days')
    `;
    await sql`
      INSERT INTO try_me_browser_sessions (
        browser_session_id, visitor_id, started_at, last_activity_at, landing_path,
        referrer_host, utm, device_class, browser_family
      ) VALUES (
        ${event.browserSessionId}, ${event.visitorId}, ${createdAt}, ${createdAt},
        ${landing?.path ?? event.path ?? null}, ${landing?.referrerHost ?? null},
        CAST(${JSON.stringify(landing?.utm ?? {})} AS jsonb),
        ${landing?.deviceClass ?? null}, ${landing?.browserFamily ?? null}
      )
      ON CONFLICT (browser_session_id) DO UPDATE SET
        last_activity_at = GREATEST(try_me_browser_sessions.last_activity_at, EXCLUDED.last_activity_at),
        expires_at = GREATEST(try_me_browser_sessions.expires_at, now() + interval '180 days')
    `;
    const rows = await sql`
      INSERT INTO try_me_product_events (
        event_id, visitor_id, browser_session_id, session_id, event_name,
        category, source, path, outcome, duration_ms, properties, created_at
      ) VALUES (
        ${event.eventId}, ${event.visitorId}, ${event.browserSessionId}, ${event.sessionId ?? null},
        ${event.event}, ${event.category}, 'builder', ${event.path ?? null},
        ${event.outcome ?? null}, ${event.durationMs ?? null},
        CAST(${JSON.stringify(event.properties ?? {})} AS jsonb), ${createdAt}
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `;
    const returnedRows = Array.isArray(rows) ? rows : rows.rows;
    inserted += returnedRows.length;
  }
  return inserted;
}

const userInputKeys: (keyof SessionAnswers)[] = [
  "sellerConfirmed", "targetDomain", "targetConfirmed", "audience", "customAudience",
  "objective", "campaignType", "eventSource", "sourceUrl", "sourceTitle", "promotedOffer",
  "promotedOfferConfirmed", "offerSourceUrl", "offerSourceTitle", "offerSourceConfirmed",
  "exampleMode", "exampleKey", "sourceConfirmed", "sourceTopicConfirmed", "messageBelief",
  "messageAction", "ctaType", "ctaStyle", "styleVariant", "toneVariant", "layoutVariant",
  "selectedAssetIds"
];

export function userInputSnapshot(answers: SessionAnswers): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of userInputKeys) {
    const value = answers[key];
    if (value !== undefined && value !== "") snapshot[key] = structuredClone(value);
  }
  if (answers.sourceUploadId || answers.sourceName) snapshot.sourceType = "pdf-upload";
  return snapshot;
}

export interface ProductSessionSnapshot {
  sessionId: string;
  visitorId?: string;
  browserSessionId?: string;
  traceId?: string;
  supportRef?: string;
  useCase: UseCase;
  status: string;
  companyDomain: string;
  targetDomain?: string;
  businessEmail?: string;
  inputSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  previewReadyAt?: string;
  identifiedAt?: string;
}

export function productSessionSnapshot(session: TryMeSession): ProductSessionSnapshot {
  const previewReadyEvent = session.events.find((event) => event.name === "generation_completed");
  return {
    sessionId: session.id,
    visitorId: session.analytics?.visitorId,
    browserSessionId: session.analytics?.browserSessionId,
    traceId: session.traceId,
    supportRef: session.traceId ? supportRefForTraceId(session.traceId) : undefined,
    useCase: session.useCase,
    status: session.status,
    companyDomain: session.companyDomain,
    targetDomain: session.answers.targetDomain,
    businessEmail: session.claim?.email,
    inputSnapshot: userInputSnapshot(session.answers),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    previewReadyAt: previewReadyEvent?.at,
    identifiedAt: session.claimedAt
  };
}

export async function recordProductSessionSnapshot(session: TryMeSession): Promise<void> {
  const snapshot = productSessionSnapshot(session);
  if (productAnalyticsStoreMode === "memory-test") {
    sessionMemory.set(session.id, structuredClone(snapshot));
    return;
  }
  if (productAnalyticsStoreMode === "console-only") return;
  await ensureSchemaReady();
  const sql = getDatabase();
  if (snapshot.visitorId && snapshot.browserSessionId) {
    await sql`
      INSERT INTO try_me_visitors (visitor_id, first_seen_at, last_seen_at)
      VALUES (${snapshot.visitorId}, ${snapshot.createdAt}, ${snapshot.updatedAt})
      ON CONFLICT (visitor_id) DO UPDATE SET last_seen_at = GREATEST(try_me_visitors.last_seen_at, EXCLUDED.last_seen_at)
    `;
    await sql`
      INSERT INTO try_me_browser_sessions (
        browser_session_id, visitor_id, started_at, last_activity_at
      ) VALUES (
        ${snapshot.browserSessionId}, ${snapshot.visitorId}, ${snapshot.createdAt}, ${snapshot.updatedAt}
      )
      ON CONFLICT (browser_session_id) DO UPDATE SET
        last_activity_at = GREATEST(try_me_browser_sessions.last_activity_at, EXCLUDED.last_activity_at)
    `;
  }
  await sql`
    INSERT INTO try_me_product_sessions (
      session_id, visitor_id, browser_session_id, trace_id, support_ref, use_case, status, company_domain,
      target_domain, business_email, input_snapshot, created_at, last_activity_at,
      preview_ready_at, identified_at
    ) VALUES (
      ${snapshot.sessionId}, ${snapshot.visitorId ?? null}, ${snapshot.browserSessionId ?? null},
      ${snapshot.traceId ?? null}, ${snapshot.supportRef ?? null},
      ${snapshot.useCase}, ${snapshot.status}, ${snapshot.companyDomain}, ${snapshot.targetDomain ?? null},
      ${snapshot.businessEmail ?? null}, CAST(${JSON.stringify(snapshot.inputSnapshot)} AS jsonb),
      ${snapshot.createdAt}, ${snapshot.updatedAt}, ${snapshot.previewReadyAt ?? null},
      ${snapshot.identifiedAt ?? null}
    )
    ON CONFLICT (session_id) DO UPDATE SET
      visitor_id = COALESCE(EXCLUDED.visitor_id, try_me_product_sessions.visitor_id),
      browser_session_id = COALESCE(EXCLUDED.browser_session_id, try_me_product_sessions.browser_session_id),
      trace_id = COALESCE(EXCLUDED.trace_id, try_me_product_sessions.trace_id),
      support_ref = COALESCE(EXCLUDED.support_ref, try_me_product_sessions.support_ref),
      status = EXCLUDED.status,
      target_domain = EXCLUDED.target_domain,
      business_email = COALESCE(EXCLUDED.business_email, try_me_product_sessions.business_email),
      input_snapshot = EXCLUDED.input_snapshot,
      last_activity_at = GREATEST(try_me_product_sessions.last_activity_at, EXCLUDED.last_activity_at),
      preview_ready_at = COALESCE(EXCLUDED.preview_ready_at, try_me_product_sessions.preview_ready_at),
      identified_at = COALESCE(EXCLUDED.identified_at, try_me_product_sessions.identified_at),
      expires_at = GREATEST(try_me_product_sessions.expires_at, now() + interval '365 days')
  `;
  if (snapshot.visitorId && snapshot.businessEmail) {
    await sql`
      UPDATE try_me_visitors
      SET identified_at = COALESCE(identified_at, ${snapshot.identifiedAt ?? snapshot.updatedAt}),
          claimed_session_id = ${snapshot.sessionId},
          last_seen_at = GREATEST(last_seen_at, ${snapshot.updatedAt})
      WHERE visitor_id = ${snapshot.visitorId}
    `;
  }
}

export function getMemoryProductEventsForTest(): ProductEventPayload[] {
  return structuredClone(eventMemory);
}

export function getMemoryProductSessionForTest(id: string): ProductSessionSnapshot | undefined {
  const value = sessionMemory.get(id);
  return value ? structuredClone(value) : undefined;
}

export function clearMemoryProductAnalyticsForTest(): void {
  eventMemory.length = 0;
  sessionMemory.clear();
}

export async function purgeExpiredProductAnalytics(): Promise<{
  eventsDeleted: number;
  sessionsDeleted: number;
  browserSessionsDeleted: number;
  visitorsDeleted: number;
}> {
  if (productAnalyticsStoreMode === "memory-test") {
    const eventsDeleted = eventMemory.length;
    const sessionsDeleted = sessionMemory.size;
    eventMemory.length = 0;
    sessionMemory.clear();
    return { eventsDeleted, sessionsDeleted, browserSessionsDeleted: 0, visitorsDeleted: 0 };
  }
  if (productAnalyticsStoreMode !== "neon-postgres") {
    return { eventsDeleted: 0, sessionsDeleted: 0, browserSessionsDeleted: 0, visitorsDeleted: 0 };
  }
  await ensureSchemaReady();
  const sql = getDatabase();
  const eventRows = await sql`DELETE FROM try_me_product_events WHERE expires_at <= now() RETURNING event_id`;
  const sessionRows = await sql`DELETE FROM try_me_product_sessions WHERE expires_at <= now() RETURNING session_id`;
  const browserRows = await sql`DELETE FROM try_me_browser_sessions WHERE expires_at <= now() RETURNING browser_session_id`;
  const visitorRows = await sql`DELETE FROM try_me_visitors WHERE expires_at <= now() RETURNING visitor_id`;
  const count = (rows: unknown): number => {
    if (Array.isArray(rows)) return rows.length;
    if (rows && typeof rows === "object" && "rows" in rows) {
      const nested = (rows as { rows?: unknown }).rows;
      return Array.isArray(nested) ? nested.length : 0;
    }
    return 0;
  };
  return {
    eventsDeleted: count(eventRows),
    sessionsDeleted: count(sessionRows),
    browserSessionsDeleted: count(browserRows),
    visitorsDeleted: count(visitorRows)
  };
}

export function analyticsIdentityFromRequest(request: Request): AnalyticsIdentity | undefined {
  const parsed = analyticsIdentitySchema.safeParse({
    visitorId: request.headers.get("x-try-me-visitor-id"),
    browserSessionId: request.headers.get("x-try-me-browser-session-id")
  });
  return parsed.success ? parsed.data : undefined;
}

export function analyticsIdentityWithAttributionFromRequest(request: Request):
  | (AnalyticsIdentity & { utm?: SessionAnalyticsIdentity["utm"] })
  | undefined {
  const identity = analyticsIdentityFromRequest(request);
  if (!identity) return undefined;
  const entries = (["source", "medium", "campaign", "term", "content"] as const)
    .map((key) => [key, request.headers.get(`x-try-me-utm-${key}`)?.trim()] as const)
    .filter((entry): entry is readonly [typeof entry[0], string] =>
      Boolean(entry[1] && entry[1].length <= 160 && !entry[1].includes("@")));
  return entries.length ? { ...identity, utm: Object.fromEntries(entries) } : identity;
}
