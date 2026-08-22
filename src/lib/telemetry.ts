import { randomUUID } from "node:crypto";

import { sanitizeObservabilityText, supportRefForTraceId } from "@/lib/observability";
import type { SessionEvent, TryMeSession } from "@/lib/types";

/**
 * Operational session-event names for the unified builder receipts timeline.
 * These feed `try_me_traces` after commit. They are not product-analytics events.
 */
export const UNIFIED_OPERATIONAL_EVENT_NAMES = [
  "support_reference_created",
  "worker_started",
  "worker_completed",
  "worker_timed_out",
  "worker_fell_back",
  "worker_failed",
  "composition_selected",
  "provisional_rendered",
  "final_rendered",
  "retry_requested"
] as const;

export type UnifiedOperationalEventName = (typeof UNIFIED_OPERATIONAL_EVENT_NAMES)[number];

export type UnifiedWorkerName =
  | "brand"
  | "audience"
  | "story"
  | "render"
  | "enrichment"
  | "composition"
  | "claim";

const privateSessionEventKey =
  /(email|html|content|copy|token|secret|sourceurl|offeresourceurl|prompt|response|filename|filepath|domain|hostname|host|cookie|authorization|password|apikey)$/i;

function sanitizeSessionEventMeta(meta: SessionEvent["meta"]): SessionEvent["meta"] {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => !privateSessionEventKey.test(key.replace(/[^a-z0-9]/gi, "")))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeObservabilityText(value, 160) : value
      ])
  );
}

export function appendEvent(
  session: TryMeSession,
  name: string,
  meta?: SessionEvent["meta"]
): TryMeSession {
  const event = {
    id: randomUUID(),
    name,
    at: new Date().toISOString(),
    meta: sanitizeSessionEventMeta(meta)
  };
  session.events = [...session.events.slice(-79), event];
  return session;
}

/** Ensures a public support reference exists on the operational timeline for a failed or recoverable session. */
export function appendSupportReferenceCreated(
  session: TryMeSession,
  meta?: SessionEvent["meta"]
): TryMeSession {
  const supportRef = session.traceId
    ? supportRefForTraceId(session.traceId)
    : undefined;
  return appendEvent(session, "support_reference_created", {
    ...meta,
    receiptKind: "support_reference",
    ...(supportRef ? { status: "available" } : { status: "unavailable" })
  });
}

export function appendWorkerReceipt(
  session: TryMeSession,
  outcome: "started" | "completed" | "timed_out" | "fell_back" | "failed",
  meta: {
    workerName: UnifiedWorkerName;
    attemptId?: string;
    durationMs?: number;
    fallbackReason?: string;
    requestId?: string;
  }
): TryMeSession {
  const name: UnifiedOperationalEventName =
    outcome === "started"
      ? "worker_started"
      : outcome === "completed"
        ? "worker_completed"
        : outcome === "timed_out"
          ? "worker_timed_out"
          : outcome === "fell_back"
            ? "worker_fell_back"
            : "worker_failed";
  return appendEvent(session, name, {
    workerName: meta.workerName,
    workerOutcome: outcome,
    ...(meta.attemptId ? { attemptId: meta.attemptId } : {}),
    ...(typeof meta.durationMs === "number" ? { durationMs: meta.durationMs } : {}),
    ...(meta.fallbackReason
      ? { fallbackReason: sanitizeObservabilityText(meta.fallbackReason, 120) }
      : {}),
    ...(meta.requestId ? { requestId: meta.requestId } : {})
  });
}
