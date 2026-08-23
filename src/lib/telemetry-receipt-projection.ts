import { createHash } from "node:crypto";

import type { WireframeFamilyV2 } from "@/lib/generation/three-family-contract";
import type { WorkerReceipt } from "@/lib/orchestration/worker-types";
import type { SessionEvent, TryMeSession } from "@/lib/types";

export type OperationalReceiptStatus =
  | "started"
  | "complete"
  | "completed"
  | "fallback"
  | "timed_out"
  | "failed"
  | "stale"
  | "needs_input";

export interface OperationalSectionPlanItem {
  id: string;
  role: string;
  optional: boolean;
}

export interface OperationalTraceReceipt {
  version: 2;
  kind: "worker" | "family_selection" | "brand_needs_input";
  revision: number;
  status: OperationalReceiptStatus;
  durationMs: number;
  evidenceIds: string[];
  worker?: string;
  family?: WireframeFamilyV2;
  reasonCode?: string;
  sectionPlan?: OperationalSectionPlanItem[];
  fallbackCode?: string;
  errorCode?: string;
}

const safeCodePattern = /^[a-z0-9][a-z0-9_.:-]{0,119}$/i;
const workerStatusByEvent = new Map<string, OperationalReceiptStatus>([
  ["worker_started", "started"],
  ["worker_complete", "complete"],
  ["worker_completed", "completed"],
  ["worker_fallback", "fallback"],
  ["worker_fell_back", "fallback"],
  ["worker_timed_out", "timed_out"],
  ["worker_failed", "failed"],
  ["worker_stale", "stale"],
  ["worker_needs_input", "needs_input"]
]);

function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && safeCodePattern.test(value) ? value : undefined;
}

function boundedDuration(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(300_000, Math.max(0, Math.round(value)))
    : 0;
}

function safeRevision(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : Math.max(0, fallback);
}

function opaqueEvidenceId(traceId: string, evidenceId: string): string {
  return `ev_${createHash("sha256")
    .update(`try-me-evidence-v2\u0000${traceId}\u0000${evidenceId}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function evidenceIds(
  traceId: string,
  refs: readonly (string | { id: string })[]
): string[] {
  return [...new Set(refs.map((ref) => typeof ref === "string" ? ref : ref.id))]
    .filter(Boolean)
    .map((id) => opaqueEvidenceId(traceId, id))
    .sort();
}

function workerForEvent(event: SessionEvent): string | undefined {
  return safeCode(event.meta?.worker) ?? safeCode(event.meta?.workerName);
}

function receiptForWorkerEvent(
  session: TryMeSession,
  event: SessionEvent,
  status: OperationalReceiptStatus
): WorkerReceipt | undefined {
  const worker = workerForEvent(event);
  if (!worker) return undefined;
  const matchingStatus = status === "complete" ? "completed" : status;
  return [...(session.workerReceipts ?? [])]
    .reverse()
    .find((receipt) =>
      receipt.worker === worker
      && (receipt.status === matchingStatus || (
        matchingStatus === "fallback" && receipt.status === "fallback"
      ))
    );
}

function safeFailureCode(
  event: SessionEvent,
  receipt: WorkerReceipt | undefined,
  kind: "fallback" | "error"
): string | undefined {
  const eventValue = kind === "fallback"
    ? event.meta?.fallbackCode ?? event.meta?.fallbackReason
    : event.meta?.errorCode ?? event.meta?.error;
  if (kind === "fallback") {
    return safeCode(eventValue) ?? safeCode(receipt?.fallback);
  }
  return safeCode(eventValue)
    ?? safeCode(receipt?.error?.message)
    ?? safeCode(receipt?.error?.name);
}

function projectWorkerReceipt(
  session: TryMeSession,
  event: SessionEvent,
  status: OperationalReceiptStatus,
  traceId: string
): OperationalTraceReceipt {
  const receipt = receiptForWorkerEvent(session, event, status);
  const worker = safeCode(receipt?.worker) ?? workerForEvent(event);
  const kind =
    status === "needs_input" && worker === "brand-compiler"
      ? "brand_needs_input"
      : "worker";
  return {
    version: 2,
    kind,
    revision: safeRevision(event.meta?.revision, session.revision),
    status,
    durationMs: boundedDuration(event.meta?.durationMs ?? receipt?.durationMs),
    evidenceIds: evidenceIds(traceId, receipt?.evidenceRefs ?? []),
    ...(worker ? { worker } : {}),
    ...(safeFailureCode(event, receipt, "fallback")
      ? { fallbackCode: safeFailureCode(event, receipt, "fallback") }
      : {}),
    ...(safeFailureCode(event, receipt, "error")
      ? { errorCode: safeFailureCode(event, receipt, "error") }
      : {})
  };
}

function projectFamilySelectionReceipt(
  session: TryMeSession,
  event: SessionEvent,
  traceId: string
): OperationalTraceReceipt | undefined {
  if (session.experienceSpec?.schemaVersion !== "2.0") return undefined;
  const decision = session.experienceSpec.wireframeDecisionV2;
  const workerReceipt = [...(session.workerReceipts ?? [])]
    .reverse()
    .find((receipt) => receipt.worker === "wireframe-ranker");
  return {
    version: 2,
    kind: "family_selection",
    revision: safeRevision(decision.revision, session.revision),
    status: "complete",
    durationMs: boundedDuration(event.meta?.durationMs ?? workerReceipt?.durationMs),
    evidenceIds: evidenceIds(traceId, decision.evidenceRefs),
    worker: "wireframe-ranker",
    family: decision.family,
    reasonCode: decision.reasonCode,
    sectionPlan: decision.sectionPlan.map((section) => ({
      id: safeCode(section.id) ?? "redacted_section",
      role: section.role,
      optional: section.optional
    })),
    ...(safeCode(workerReceipt?.fallback) ? { fallbackCode: workerReceipt?.fallback } : {}),
    ...(safeCode(workerReceipt?.error?.message)
      ? { errorCode: workerReceipt?.error?.message }
      : {})
  };
}

export function projectOperationalTraceReceipt(
  session: TryMeSession,
  event: SessionEvent,
  traceId: string
): OperationalTraceReceipt | undefined {
  const workerStatus = workerStatusByEvent.get(event.name);
  if (workerStatus) return projectWorkerReceipt(session, event, workerStatus, traceId);
  if (event.name === "wireframe_selected" || event.name === "family_locked") {
    return projectFamilySelectionReceipt(session, event, traceId);
  }
  return undefined;
}

export function parseOperationalTraceReceipt(
  value: unknown
): OperationalTraceReceipt | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<OperationalTraceReceipt>;
  if (
    candidate.version !== 2
    || !["worker", "family_selection", "brand_needs_input"].includes(String(candidate.kind))
    || !workerStatusByEvent.has(`worker_${String(candidate.status)}`)
    || !Number.isSafeInteger(candidate.revision)
    || typeof candidate.durationMs !== "number"
    || !Array.isArray(candidate.evidenceIds)
    || !candidate.evidenceIds.every((id) => /^ev_[a-f0-9]{20}$/.test(id))
  ) {
    return undefined;
  }
  return structuredClone(candidate as OperationalTraceReceipt);
}
