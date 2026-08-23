import { describe, expect, it } from "vitest";

import { selectThreeFamilyDecision } from "@/lib/generation/three-family-contract";
import {
  projectBrandNeedsInputBehaviorEvent,
  projectProductionPlanBehaviorEvent,
  projectWorkerTimingBehaviorEvent
} from "@/lib/product-analytics-projection";
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
