import { describe, expect, it } from "vitest";

import { selectThreeFamilyDecision } from "@/lib/generation/three-family-contract";
import {
  projectAnalyticsPanelOpenedBehaviorEvent,
  projectAssetInteractionBehaviorEvent,
  projectBrandNeedsInputBehaviorEvent,
  projectBuildStartedBehaviorEvent,
  projectClaimBehaviorEvent,
  projectProductionPlanBehaviorEvent,
  projectRecommendationBehaviorEvent,
  projectRecoverableFailureBehaviorEvent,
  projectResearchStartedBehaviorEvent,
  projectSectionViewedBehaviorEvent,
  projectWorkerTimingBehaviorEvent
} from "@/lib/product-analytics-projection";
import { analyticsCorrelationKey } from "@/lib/analytics-correlation";
import {
  assertUnifiedProductEventProperties
} from "@/lib/product-analytics-contracts";
import { parseProductEventBatch } from "@/lib/product-analytics";

const identity = {
  visitorId: "tmv_1234567890abcdef",
  browserSessionId: "tmb_1234567890abcdef"
};

function payload(
  eventId: string,
  projection: ReturnType<typeof projectProductionPlanBehaviorEvent>
) {
  return {
    eventId,
    ...identity,
    category:
      projection.event === "production_plan_ready" ? "performance" as const : "workflow" as const,
    event: projection.event,
    durationMs: projection.durationMs,
    properties: projection.properties
  };
}

describe("behavior analytics telemetry projection", () => {
  it("projects family selection as revision, section count, and timing only", () => {
    const decision = selectThreeFamilyDecision({
      sessionId: "private-session",
      revision: 9,
      useCase: "abm",
      targetDomain: "target.example",
      firstDecision: "Review confidential account strategy",
      evidenceRefs: ["https://private.example/path?token=secret"]
    });
    const projected = projectProductionPlanBehaviorEvent(decision, 82);

    expect(projected).toEqual({
      event: "production_plan_ready",
      durationMs: 82,
      properties: {
        artifact_revision: 9,
        section_count: 6,
        duration_bucket: "lt_1s"
      }
    });
    expect(projected.properties).not.toHaveProperty("family");
    expect(projected.properties).not.toHaveProperty("reason_code");
    expect(projected.properties).not.toHaveProperty("section_plan");
    expect(projected.properties).not.toHaveProperty("evidence_ids");
    expect(JSON.stringify(projected)).not.toMatch(/target\.example|confidential|token=/i);
    expect(() => parseProductEventBatch({
      events: [payload("tme_planprojection01", projected)]
    })).not.toThrow();
  });

  it("projects brand needs-input without prompt text or uploaded content", () => {
    const projected = projectBrandNeedsInputBehaviorEvent({
      revision: 4,
      requestedInputKind: "brand_guide",
      durationMs: 12_500
    });

    expect(projected).toEqual({
      event: "brand_help_requested",
      durationMs: 12_500,
      properties: {
        artifact_revision: 4,
        requested_input_kind: "brand_guide",
        duration_bucket: "lt_15s"
      }
    });
    expect(() => parseProductEventBatch({
      events: [{
        ...payload("tme_brandhelpproj010", projected as ReturnType<
          typeof projectProductionPlanBehaviorEvent
        >),
        category: "workflow"
      }]
    })).not.toThrow();
  });

  it("keeps worker behavior timing coarse and operational codes absent", () => {
    const projected = projectWorkerTimingBehaviorEvent({
      workerName: "story",
      status: "fallback",
      durationMs: 35_000
    });

    expect(projected).toEqual({
      event: "worker_fell_back",
      durationMs: 35_000,
      properties: {
        worker_name: "story",
        duration_bucket: "lt_60s",
        fallback_kind: "typed_fallback"
      }
    });
    expect(projected.properties).not.toHaveProperty("fallback_code");
    expect(projected.properties).not.toHaveProperty("error_code");
    expect(projected.properties).not.toHaveProperty("evidence_ids");
  });
});

describe("behavior-only funnel coverage", () => {
  const traceId = "trace_behavior_funnel_001";

  it("carries a one-way correlation key that never reveals the trace id", () => {
    const started = projectResearchStartedBehaviorEvent({
      traceId,
      scope: "seller_and_target",
      sourceCount: 4
    });

    expect(started.properties.correlation_key).toMatch(/^ck_[a-f0-9]{16}$/);
    expect(JSON.stringify(started)).not.toContain(traceId);
    expect(analyticsCorrelationKey(traceId)).toBe(started.properties.correlation_key);
    expect(analyticsCorrelationKey("trace_behavior_funnel_002")).not.toBe(
      started.properties.correlation_key
    );
  });

  it("joins the build, claim, and failure funnel under one correlation key", () => {
    const key = analyticsCorrelationKey(traceId);
    const events = [
      projectBuildStartedBehaviorEvent({ traceId, revision: 3, routeFamily: "launch" }),
      projectClaimBehaviorEvent({ action: "started", traceId, step: "open" }),
      projectClaimBehaviorEvent({
        action: "completed",
        traceId,
        step: "submit",
        durationMs: 4_000
      }),
      projectRecoverableFailureBehaviorEvent({
        traceId,
        failureStage: "story",
        errorCode: "provider_timeout",
        retryable: true
      })
    ];

    expect(events.every(({ properties }) => properties.correlation_key === key)).toBe(true);
  });

  it("reports which option was taken without its copy", () => {
    const selected = projectRecommendationBehaviorEvent({
      action: "selected",
      kind: "value_prop",
      rank: 1,
      wasDefault: false
    });

    expect(selected.properties).toEqual({
      recommendation_kind: "value_prop",
      rank: 1,
      was_default: false
    });
    expect(JSON.stringify(selected)).not.toMatch(/label|title/i);
  });

  it("locates a viewed section by role and position rather than by title", () => {
    const viewed = projectSectionViewedBehaviorEvent({
      sectionRole: "current-friction",
      position: 2,
      dwellMs: 6_000
    });

    expect(viewed.properties).toEqual({
      section_role: "current-friction",
      position: 2,
      dwell_bucket: "lt_10s"
    });
  });

  it("records an asset interaction without the asset reference itself", () => {
    const event = projectAssetInteractionBehaviorEvent({
      interactionType: "expand",
      assetRole: "product",
      area: "preview"
    });

    expect(event.properties).toEqual({
      interaction_type: "expand",
      asset_role: "product",
      area: "preview"
    });
    expect(JSON.stringify(event)).not.toMatch(/https?:\/\//);
  });

  it("distinguishes an automatic panel reveal from an explicit open", () => {
    expect(
      projectAnalyticsPanelOpenedBehaviorEvent({ trigger: "final_section_reached" }).properties
        .trigger
    ).toBe("final_section_reached");
    expect(
      projectAnalyticsPanelOpenedBehaviorEvent({ trigger: "explicit_open" }).properties.trigger
    ).toBe("explicit_open");
  });

  it("refuses a correlation key that is not a one-way digest", () => {
    expect(() =>
      assertUnifiedProductEventProperties("build_started", {
        artifact_revision: 3,
        route_family: "launch",
        correlation_key: traceId
      })
    ).toThrow(/one-way analytics correlation digest/);
  });
});
