import { analyticsCorrelationKey } from "@/lib/analytics-correlation";
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

export function analyticsDwellBucket(dwellMs: number | undefined): string {
  const dwell = boundedDuration(dwellMs) ?? 0;
  if (dwell < 2_000) return "lt_2s";
  if (dwell < 10_000) return "lt_10s";
  if (dwell < 30_000) return "lt_30s";
  return "gte_30s";
}

export function projectResearchStartedBehaviorEvent(input: {
  traceId: string;
  scope: "seller" | "target" | "seller_and_target";
  sourceCount: number;
}): BehaviorAnalyticsProjection {
  return projection("research_started", {
    research_scope: input.scope,
    source_count: Math.max(0, Math.min(50, Math.round(input.sourceCount))),
    correlation_key: analyticsCorrelationKey(input.traceId)
  });
}

export function projectBuildStartedBehaviorEvent(input: {
  traceId: string;
  revision: number;
  routeFamily: string;
}): BehaviorAnalyticsProjection {
  return projection("build_started", {
    artifact_revision: input.revision,
    route_family: input.routeFamily,
    correlation_key: analyticsCorrelationKey(input.traceId)
  });
}

/**
 * Reports which option a reader took, never what it said.
 *
 * A value-proposition label is generated copy: reporting it would put the
 * seller's message text in a third-party sink, and a funnel keyed on copy
 * breaks the moment the copy changes. Kind and rank identify the option
 * durably and carry no content.
 */
export function projectRecommendationBehaviorEvent(input: {
  action: "viewed" | "selected";
  kind: "audience" | "objective" | "composition" | "value_prop";
  rank: number;
  optionCount?: number;
  wasDefault?: boolean;
}): BehaviorAnalyticsProjection {
  const rank = Math.max(0, Math.min(20, Math.round(input.rank)));
  if (input.action === "viewed") {
    return projection("recommendation_viewed", {
      recommendation_kind: input.kind,
      option_count: Math.max(0, Math.min(20, Math.round(input.optionCount ?? 0))),
      rank
    });
  }
  return projection("recommendation_selected", {
    recommendation_kind: input.kind,
    rank,
    was_default: input.wasDefault === true
  });
}

/** Semantic role and position locate the section; the title is its copy. */
export function projectSectionViewedBehaviorEvent(input: {
  sectionRole: string;
  position: number;
  dwellMs?: number;
}): BehaviorAnalyticsProjection {
  return projection("section_viewed", {
    section_role: input.sectionRole,
    position: Math.max(0, Math.min(32, Math.round(input.position))),
    dwell_bucket: analyticsDwellBucket(input.dwellMs)
  });
}

export function projectAssetInteractionBehaviorEvent(input: {
  interactionType: string;
  assetRole: string;
  area?: string;
}): BehaviorAnalyticsProjection {
  return projection("asset_interaction", {
    interaction_type: input.interactionType,
    asset_role: input.assetRole,
    ...(input.area ? { area: input.area } : {})
  });
}

export function projectAnalyticsPanelOpenedBehaviorEvent(input: {
  trigger: "final_section_reached" | "explicit_open";
}): BehaviorAnalyticsProjection {
  return projection("analytics_panel_opened", { trigger: input.trigger });
}

export function projectClaimBehaviorEvent(input: {
  action: "started" | "completed";
  traceId: string;
  step: string;
  trigger?: string;
  durationMs?: number;
}): BehaviorAnalyticsProjection {
  const correlation_key = analyticsCorrelationKey(input.traceId);
  if (input.action === "started") {
    return projection("claim_started", {
      claim_step: input.step,
      ...(input.trigger ? { trigger: input.trigger } : {}),
      correlation_key
    });
  }
  return projection(
    "claim_completed",
    {
      claim_step: input.step,
      duration_bucket: analyticsDurationBucket(input.durationMs),
      correlation_key
    },
    input.durationMs
  );
}

export function projectRecoverableFailureBehaviorEvent(input: {
  traceId: string;
  failureStage: string;
  errorCode: string;
  retryable: boolean;
}): BehaviorAnalyticsProjection {
  return projection("recoverable_failure", {
    failure_stage: input.failureStage,
    error_code: input.errorCode,
    retryable: input.retryable,
    correlation_key: analyticsCorrelationKey(input.traceId)
  });
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
