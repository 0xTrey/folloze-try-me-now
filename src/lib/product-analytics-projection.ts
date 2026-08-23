import type { WireframeDecisionV2 } from "@/lib/generation/three-family-contract";
import {
  assertUnifiedProductEventProperties,
  type UnifiedProductEventName
} from "@/lib/product-analytics-contracts";

type ProductProperty = string | number | boolean | null;

export interface BehaviorAnalyticsProjection {
  event: UnifiedProductEventName;
  durationMs?: number;
  properties: Record<string, ProductProperty>;
}

export type AnalyticsWorkerName =
  | "brand"
  | "audience"
  | "story"
  | "render"
  | "enrichment"
  | "composition"
  | "claim";

export type AnalyticsWorkerStatus =
  | "started"
  | "completed"
  | "timed_out"
  | "fallback"
  | "failed";

function boundedDuration(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(300_000, Math.max(0, Math.round(value)))
    : undefined;
}

export function analyticsDurationBucket(durationMs: number | undefined): string {
  const duration = boundedDuration(durationMs) ?? 0;
  if (duration < 1_000) return "lt_1s";
  if (duration < 5_000) return "lt_5s";
  if (duration < 15_000) return "lt_15s";
  if (duration < 30_000) return "lt_30s";
  if (duration < 60_000) return "lt_60s";
  return "gte_60s";
}

function projection(
  event: UnifiedProductEventName,
  properties: Record<string, ProductProperty>,
  durationMs?: number
): BehaviorAnalyticsProjection {
  return {
    event,
    ...(boundedDuration(durationMs) !== undefined
      ? { durationMs: boundedDuration(durationMs) }
      : {}),
    properties: assertUnifiedProductEventProperties(event, properties) ?? {}
  };
}

/**
 * Projects an internal family decision to behavior analytics without family,
 * reason, evidence IDs, section IDs, factors, or buyer-facing copy.
 */
export function projectProductionPlanBehaviorEvent(
  decision: Pick<WireframeDecisionV2, "revision" | "sectionPlan">,
  durationMs?: number
): BehaviorAnalyticsProjection {
  return projection(
    "production_plan_ready",
    {
      artifact_revision: decision.revision,
      section_count: decision.sectionPlan.length,
      duration_bucket: analyticsDurationBucket(durationMs)
    },
    durationMs
  );
}

export function projectBrandNeedsInputBehaviorEvent(input: {
  revision: number;
  requestedInputKind: "logo" | "brand_guide" | "screenshot" | "source_url";
  durationMs?: number;
}): BehaviorAnalyticsProjection {
  return projection(
    "brand_help_requested",
    {
      artifact_revision: input.revision,
      requested_input_kind: input.requestedInputKind,
      duration_bucket: analyticsDurationBucket(input.durationMs)
    },
    input.durationMs
  );
}

export function projectWorkerTimingBehaviorEvent(input: {
  workerName: AnalyticsWorkerName;
  status: AnalyticsWorkerStatus;
  durationMs?: number;
  attempt?: number;
  retryable?: boolean;
}): BehaviorAnalyticsProjection {
  if (input.status === "started") {
    return projection("worker_started", {
      worker_name: input.workerName,
      attempt_bucket: String(Math.min(3, Math.max(1, Math.round(input.attempt ?? 1))))
    });
  }
  const event =
    input.status === "completed"
      ? "worker_completed"
      : input.status === "timed_out"
        ? "worker_timed_out"
        : input.status === "fallback"
          ? "worker_fell_back"
          : "worker_failed";
  const common = {
    worker_name: input.workerName,
    duration_bucket: analyticsDurationBucket(input.durationMs)
  };
  if (event === "worker_fell_back") {
    return projection(event, { ...common, fallback_kind: "typed_fallback" }, input.durationMs);
  }
  if (event === "worker_failed") {
    return projection(event, {
      ...common,
      error_code: "worker_failed",
      retryable: input.retryable === true
    }, input.durationMs);
  }
  return projection(event, {
    ...common,
    attempt_bucket: String(Math.min(3, Math.max(1, Math.round(input.attempt ?? 1))))
  }, input.durationMs);
}
