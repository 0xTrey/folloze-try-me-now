import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyticsCorrelationKey } from "@/lib/analytics-correlation";
import { supportRefForTraceId } from "@/lib/observability";
import {
  assertUnifiedProductEventProperties,
  clearMemoryProductAnalyticsForTest,
  getMemoryProductEventsForTest,
  parseProductEventBatch,
  PRODUCT_EVENT_NAMES,
  productEventCategoryFor,
  recordProductEvents,
  UNIFIED_PRODUCT_EVENT_CONTRACTS,
  UNIFIED_PRODUCT_EVENT_NAMES
} from "@/lib/product-analytics";
import {
  appendSupportReferenceCreated,
  appendWorkerReceipt
} from "@/lib/telemetry";
import {
  clearMemoryTraceEventsForTest,
  readTraceEvents,
  recordCommittedSessionEvents
} from "@/lib/trace-store";
import type { TryMeSession } from "@/lib/types";

const identity = {
  visitorId: "tmv_1234567890abcdef",
  browserSessionId: "tmb_1234567890abcdef"
};

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "tme_1234567890abcdef",
    ...identity,
    category: "interaction",
    path: "/",
    ...overrides
  };
}

function failedSession(): TryMeSession {
  return {
    id: "session_failure_001",
    traceId: "trace_failure_rebuild_001",
    editorTokenHash: "private",
    useCase: "abm",
    companyDomain: "servicetitan.com",
    status: "generation_failed",
    createdAt: "2026-08-22T12:00:00.000Z",
    updatedAt: "2026-08-22T12:01:00.000Z",
    temporaryUrl: "https://preview.example/e/session_failure_001",
    revision: 3,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "failed" }
    },
    answers: {},
    audienceSuggestions: [],
    events: []
  };
}

describe("unified product analytics contracts", () => {
  beforeEach(() => {
    clearMemoryProductAnalyticsForTest();
    clearMemoryTraceEventsForTest();
    vi.restoreAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("registers every required unified event name with a category contract", () => {
    for (const event of UNIFIED_PRODUCT_EVENT_NAMES) {
      expect(PRODUCT_EVENT_NAMES).toContain(event);
      expect(UNIFIED_PRODUCT_EVENT_CONTRACTS[event].category).toBe(productEventCategoryFor(event));
    }
  });

  it("accepts the full privacy-safe unified event batch", async () => {
    const supportRef = supportRefForTraceId("trace_failure_rebuild_001");
    const correlationKey = analyticsCorrelationKey("trace_failure_rebuild_001");
    const payloads = [
        {
          ...baseEvent({
            eventId: "tme_unifiedentry0001",
            event: "unified_entry_started",
            category: "navigation",
            properties: { entry_surface: "primary_cta", device_class: "desktop" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_domainstabilized01",
            event: "domain_stabilized",
            category: "input",
            properties: { domain_role: "seller", normalization: "accepted", has_value: true }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_inputinterpret01",
            event: "input_interpreted",
            category: "input",
            properties: {
              interpretation: "account_brief",
              field_count: 4,
              has_offer: true,
              has_objective: true
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_briefconfirmed01",
            event: "brief_field_confirmed",
            category: "input",
            properties: { field_key: "objective", has_value: true }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_briefedited00001",
            event: "brief_field_edited",
            category: "input",
            properties: { field_key: "audience", has_value: true }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_briefskipped0001",
            event: "brief_field_skipped",
            category: "input",
            properties: { field_key: "offer" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_brandhelprequest",
            event: "brand_help_requested",
            category: "workflow",
            properties: {
              artifact_revision: 3,
              requested_input_kind: "brand_guide",
              duration_bucket: "lt_15s"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_workerstarted001",
            event: "worker_started",
            category: "workflow",
            properties: { worker_name: "brand", attempt_bucket: "1" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_workercompleted1",
            event: "worker_completed",
            category: "workflow",
            properties: { worker_name: "brand", duration_bucket: "lt_5s", attempt_bucket: "1" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_workertimeout001",
            event: "worker_timed_out",
            category: "workflow",
            properties: { worker_name: "enrichment", duration_bucket: "gt_30s" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_workerfallback01",
            event: "worker_fell_back",
            category: "workflow",
            properties: { worker_name: "story", fallback_kind: "provisional", duration_bucket: "lt_60s" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_workerfailed0001",
            event: "worker_failed",
            category: "error",
            properties: {
              worker_name: "story",
              error_code: "provider_timeout",
              duration_bucket: "gt_30s",
              retryable: true
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_composition00001",
            event: "composition_selected",
            category: "workflow",
            properties: { composition_id: "account_proof_spine", route_family: "abm", rank: 1 }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_planready0000010",
            event: "production_plan_ready",
            category: "performance",
            properties: {
              artifact_revision: 3,
              section_count: 6,
              duration_bucket: "lt_1s"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_provisional00001",
            event: "provisional_rendered",
            category: "performance",
            properties: {
              artifact_revision: 1,
              duration_bucket: "lt_15s",
              quality_gate: "pass"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_finalrendered001",
            event: "final_rendered",
            category: "performance",
            properties: {
              artifact_revision: 2,
              duration_bucket: "lt_60s",
              quality_gate: "pass"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_variantviewed001",
            event: "personalization_variant_viewed",
            category: "interaction",
            properties: { variant_id: "account_industry", has_evidence: true }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_resourceinteract1",
            event: "resource_interaction",
            category: "interaction",
            properties: {
              interaction_type: "open",
              interaction_target: "proof_resource",
              area: "preview"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_ctainteraction01",
            event: "cta_interaction",
            category: "interaction",
            properties: {
              interaction_type: "click",
              interaction_target: "primary_cta",
              area: "preview",
              cta_kind: "scroll"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_modaldisplayed01",
            event: "modal_displayed",
            category: "conversion",
            properties: { modal_kind: "claim", trigger: "preview_engagement" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_claimattempted01",
            event: "claim_attempted",
            category: "conversion",
            properties: { claim_step: "submit", has_value: true }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_retryrequested01",
            event: "retry_requested",
            category: "workflow",
            properties: { retry_scope: "worker", worker_name: "story" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_supportrefcreated",
            event: "support_reference_created",
            category: "error",
            properties: { support_ref: supportRef, failure_stage: "story" }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_researchstarted0001",
            event: "research_started",
            category: "workflow",
            properties: {
              research_scope: "seller_and_target",
              source_count: 4,
              correlation_key: correlationKey
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_recommendviewed0001",
            event: "recommendation_viewed",
            category: "interaction",
            properties: {
              recommendation_kind: "value_prop",
              option_count: 3,
              rank: 0,
              value_prop_label: "Cut unplanned dwell time"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_recommendpicked0001",
            event: "recommendation_selected",
            category: "interaction",
            properties: {
              recommendation_kind: "value_prop",
              rank: 0,
              value_prop_label: "Cut unplanned dwell time",
              was_default: true
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_buildstarted00000001",
            event: "build_started",
            category: "workflow",
            properties: {
              artifact_revision: 3,
              route_family: "launch",
              correlation_key: correlationKey
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_sectionviewed00000001",
            event: "section_viewed",
            category: "interaction",
            properties: {
              section_title: "Where the dwell time goes",
              section_role: "current-friction",
              position: 2,
              dwell_bucket: "lt_10s"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_assetinteraction0001",
            event: "asset_interaction",
            category: "interaction",
            properties: {
              interaction_type: "expand",
              asset_role: "product",
              section_title: "Where the dwell time goes",
              area: "preview"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_analyticspanelopen001",
            event: "analytics_panel_opened",
            category: "interaction",
            properties: {
              trigger: "final_section_reached",
              section_title: "Choose the first move"
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_claimstarted00000001",
            event: "claim_started",
            category: "conversion",
            properties: {
              claim_step: "open",
              trigger: "preview_engagement",
              correlation_key: correlationKey
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_claimcompleted000001",
            event: "claim_completed",
            category: "conversion",
            properties: {
              claim_step: "submit",
              duration_bucket: "lt_15s",
              correlation_key: correlationKey
            }
          })
        },
        {
          ...baseEvent({
            eventId: "tme_recoverablefailure01",
            event: "recoverable_failure",
            category: "error",
            properties: {
              failure_stage: "story",
              error_code: "provider_timeout",
              retryable: true,
              correlation_key: correlationKey
            }
          })
        }
    ];
    const first = parseProductEventBatch({ events: payloads.slice(0, 20) });
    const second = parseProductEventBatch({ events: payloads.slice(20) });
    const events = [...first, ...second];

    await expect(recordProductEvents(first)).resolves.toBe(first.length);
    await expect(recordProductEvents(second)).resolves.toBe(second.length);
    expect(getMemoryProductEventsForTest().map((event) => event.event)).toEqual(
      expect.arrayContaining([...UNIFIED_PRODUCT_EVENT_NAMES])
    );
    expect(JSON.stringify(getMemoryProductEventsForTest())).not.toMatch(
      /servicetitan|https?:\/\/|@|prompt|generated copy|<html/i
    );
    expect(events).toHaveLength(UNIFIED_PRODUCT_EVENT_NAMES.length);
  });

  it("rejects raw domains, emails, URLs, prompts, and private property keys", () => {
    expect(() => parseProductEventBatch({
      events: [baseEvent({
        event: "domain_stabilized",
        category: "input",
        properties: { domain_role: "seller", company_domain: "cisco.com" }
      })]
    })).toThrow();
    expect(() => parseProductEventBatch({
      events: [baseEvent({
        event: "brief_field_confirmed",
        category: "input",
        properties: { field_key: "seller", has_value: true, label: "buyer@example.com" }
      })]
    })).toThrow();
    expect(() => parseProductEventBatch({
      events: [baseEvent({
        event: "resource_interaction",
        category: "interaction",
        properties: {
          interaction_type: "open",
          interaction_target: "https://private.example/resource",
          area: "preview"
        }
      })]
    })).toThrow();
    expect(() => parseProductEventBatch({
      events: [baseEvent({
        event: "input_interpreted",
        category: "input",
        properties: { interpretation: "prompt about acme.com" }
      })]
    })).toThrow();
    expect(() => assertUnifiedProductEventProperties("worker_failed", {
      worker_name: "story",
      error_code: "timeout",
      prompt: "secret prompt body"
    })).toThrow(/not allow property|not permitted/i);
    expect(() => assertUnifiedProductEventProperties("production_plan_ready", {
      artifact_revision: 3,
      section_count: 6,
      duration_bucket: "lt_1s",
      family: "align",
      reason_code: "v2-named-account-align",
      evidence_ids: "ev_private"
    })).toThrow(/not allow property|not permitted/i);
  });

  it("reconstructs a failed session timeline from the public support reference", async () => {
    const session = failedSession();
    const supportRef = supportRefForTraceId(session.traceId!);

    appendWorkerReceipt(session, "started", {
      workerName: "story",
      attemptId: "attempt-story-1",
      requestId: "req_failure_1"
    });
    appendWorkerReceipt(session, "failed", {
      workerName: "story",
      attemptId: "attempt-story-1",
      durationMs: 42_000,
      requestId: "req_failure_1",
      fallbackReason: "provider_timeout"
    });
    appendSupportReferenceCreated(session, { reason: "generation_failed" });

    await recordCommittedSessionEvents(session);

    const timeline = await readTraceEvents(session.traceId!);
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(timeline.every((record) => record.supportRef === supportRef)).toBe(true);
    expect(timeline.map((record) => record.event)).toEqual(
      expect.arrayContaining([
        "worker_started",
        "worker_failed",
        "support_reference_created"
      ])
    );
    expect(timeline.find((record) => record.event === "worker_failed")).toMatchObject({
      stage: "story",
      outcome: "error",
      supportRef,
      spanId: "attempt-story-1",
      meta: expect.objectContaining({
        workerName: "story",
        workerOutcome: "failed"
      })
    });
    expect(JSON.stringify(timeline)).not.toContain("servicetitan.com");
    expect(JSON.stringify(timeline)).not.toContain(session.id);
    expect(JSON.stringify(timeline)).not.toContain("buyer@");
  });
});
