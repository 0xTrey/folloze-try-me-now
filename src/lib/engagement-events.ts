import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { hasDatabase } from "@/lib/config";

export const ENGAGEMENT_EVENT_NAMES = [
  "anchor_click",
  "topic_select",
  "cta_click",
  "signature_select",
  "question_select",
  "section_dwell",
  "page_heartbeat",
  "experience_view"
] as const;

export type EngagementEventName = (typeof ENGAGEMENT_EVENT_NAMES)[number];

const safeContextText = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9 _.,:+-]+$/i)
  .refine((value) => !value.includes("@"), "Context cannot contain contact information.");

export const engagementEventPayloadSchema = z
  .object({
    sessionId: z.string().trim().min(8).max(128).regex(/^[a-z0-9_-]+$/i),
    event: z.enum(ENGAGEMENT_EVENT_NAMES),
    context: z
      .object({
        sectionId: safeContextText.optional(),
        label: safeContextText.optional(),
        area: safeContextText.optional(),
        ctaId: safeContextText.optional(),
        lensId: safeContextText.optional(),
        seconds: z.number().int().min(1).max(3600).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export type EngagementEventPayload = z.infer<typeof engagementEventPayloadSchema>;

export interface EngagementEventRecord extends EngagementEventPayload {
  createdAt: string;
}

declare global {
  var __follozeTryMeEngagementEvents: EngagementEventRecord[] | undefined;
}

const memory = globalThis.__follozeTryMeEngagementEvents ?? [];
globalThis.__follozeTryMeEngagementEvents = memory;

const isTest = process.env.NODE_ENV === "test";
export const engagementEventStoreMode = isTest
  ? "memory-test"
  : hasDatabase
    ? "neon-postgres"
    : "drop-unavailable";

let databaseClient: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  databaseClient ??= neon(process.env.DATABASE_URL);
  return databaseClient;
}

async function ensureEventStoreReady(): Promise<void> {
  if (engagementEventStoreMode !== "neon-postgres") return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDatabase();
      await sql`SELECT session_id, event_name, context, created_at FROM try_me_events LIMIT 0`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export function parseEngagementEventPayload(value: unknown): EngagementEventPayload {
  return engagementEventPayloadSchema.parse(value);
}

export async function recordEngagementEvent(payload: EngagementEventPayload): Promise<boolean> {
  const record: EngagementEventRecord = {
    ...payload,
    context: payload.context ? { ...payload.context } : undefined,
    createdAt: new Date().toISOString()
  };

  if (engagementEventStoreMode === "memory-test") {
    memory.push(structuredClone(record));
    return true;
  }
  if (engagementEventStoreMode !== "neon-postgres") return false;

  await ensureEventStoreReady();
  const sql = getDatabase();
  await sql`
    INSERT INTO try_me_events (session_id, event_name, context, created_at)
    VALUES (
      ${record.sessionId},
      ${record.event},
      CAST(${JSON.stringify(record.context ?? {})} AS jsonb),
      ${record.createdAt}
    )
  `;
  return true;
}

export function getMemoryEngagementEventsForTest(): EngagementEventRecord[] {
  return structuredClone(memory);
}

export function clearMemoryEngagementEventsForTest(): void {
  memory.length = 0;
}
