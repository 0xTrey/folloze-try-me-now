import { createHash } from "node:crypto";

import type { WireframeFamilyV2 } from "@/lib/generation/three-family-contract";
import { sanitizeObservabilityText } from "@/lib/observability";
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

export type NormalizedOperationalReceiptStatus = Exclude<
  OperationalReceiptStatus,
  "complete"
>;

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
const normalizedOperationalReceiptStatuses = new Set<NormalizedOperationalReceiptStatus>([
  "started",
  "completed",
  "fallback",
  "timed_out",
  "failed",
  "stale",
  "needs_input"
]);
const workerStatusByEvent = new Map<string, NormalizedOperationalReceiptStatus>([
  ["worker_started", "started"],
  ["worker_complete", "completed"],
  ["worker_completed", "completed"],
  ["worker_fallback", "fallback"],
  ["worker_fell_back", "fallback"],
  ["worker_timed_out", "timed_out"],
  ["worker_failed", "failed"],
  ["worker_stale", "stale"],
  ["worker_needs_input", "needs_input"]
]);
const receiptKeys = new Set([
  "version",
  "kind",
  "revision",
  "status",
  "durationMs",
  "evidenceIds",
  "worker",
  "family",
  "reasonCode",
  "sectionPlan",
  "fallbackCode",
  "errorCode"
]);
const sectionPlanKeys = new Set(["id", "role", "optional"]);
const wireframeFamilies = new Set<WireframeFamilyV2>(["launch", "guide", "align"]);

export function normalizeOperationalReceiptStatus(
  value: unknown
): NormalizedOperationalReceiptStatus | undefined {
  if (value === "complete" || value === "completed") return "completed";
  return typeof value === "string"
    && normalizedOperationalReceiptStatuses.has(value as NormalizedOperationalReceiptStatus)
    ? value as NormalizedOperationalReceiptStatus
    : undefined;
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== "string" || !safeCodePattern.test(value)) return undefined;
  const sanitized = sanitizeObservabilityText(value, 120);
  return sanitized === value && !/\[redacted-/i.test(sanitized) ? value : undefined;
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
  status: NormalizedOperationalReceiptStatus
): WorkerReceipt | undefined {
  const worker = workerForEvent(event);
  if (!worker) return undefined;
  return [...(session.workerReceipts ?? [])]
    .reverse()
    .find((receipt) =>
      receipt.worker === worker
      && receipt.status === status
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
  status: NormalizedOperationalReceiptStatus,
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
    status: "completed",
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
  const status = normalizeOperationalReceiptStatus(candidate.status);
  const kind = candidate.kind;
  const sectionPlan = parseSectionPlan(candidate.sectionPlan);
  if (
    Object.keys(candidate).some((key) => !receiptKeys.has(key))
    || candidate.version !== 2
    || !["worker", "family_selection", "brand_needs_input"].includes(String(kind))
    || !status
    || !Number.isSafeInteger(candidate.revision)
    || (candidate.revision ?? -1) < 0
    || typeof candidate.durationMs !== "number"
    || !Number.isSafeInteger(candidate.durationMs)
    || candidate.durationMs < 0
    || candidate.durationMs > 300_000
    || !Array.isArray(candidate.evidenceIds)
    || candidate.evidenceIds.length > 200
    || !candidate.evidenceIds.every((id) => /^ev_[a-f0-9]{20}$/.test(id))
    || (candidate.worker !== undefined && safeCode(candidate.worker) !== candidate.worker)
    || (candidate.reasonCode !== undefined && safeCode(candidate.reasonCode) !== candidate.reasonCode)
    || (candidate.fallbackCode !== undefined
      && safeCode(candidate.fallbackCode) !== candidate.fallbackCode)
    || (candidate.errorCode !== undefined && safeCode(candidate.errorCode) !== candidate.errorCode)
    || (candidate.family !== undefined && !wireframeFamilies.has(candidate.family))
    || !legalKindStatus(kind, status)
    || (kind === "family_selection" && (
      !candidate.family
      || !candidate.reasonCode
      || candidate.worker !== "wireframe-ranker"
      || !sectionPlan
    ))
    || (kind === "brand_needs_input" && candidate.worker !== "brand-compiler")
    || (kind !== "family_selection" && candidate.sectionPlan !== undefined)
    || (kind !== "family_selection" && candidate.family !== undefined)
    || (kind !== "family_selection" && candidate.reasonCode !== undefined)
  ) {
    return undefined;
  }
  return {
    ...(structuredClone(candidate) as OperationalTraceReceipt),
    status,
    ...(sectionPlan ? { sectionPlan } : {})
  };
}

function legalKindStatus(
  kind: OperationalTraceReceipt["kind"] | undefined,
  status: NormalizedOperationalReceiptStatus
): boolean {
  if (kind === "family_selection") return status === "completed";
  if (kind === "brand_needs_input") return status === "needs_input";
  return kind === "worker";
}

function parseSectionPlan(value: unknown): OperationalSectionPlanItem[] | undefined {
  if (!Array.isArray(value) || value.length < 4 || value.length > 8) return undefined;
  if (!value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const candidate = item as Partial<OperationalSectionPlanItem>;
    return !Object.keys(candidate).some((key) => !sectionPlanKeys.has(key))
      && safeCode(candidate.id) === candidate.id
      && safeCode(candidate.role) === candidate.role
      && typeof candidate.optional === "boolean";
  })) {
    return undefined;
  }
  return structuredClone(value as OperationalSectionPlanItem[]);
}
