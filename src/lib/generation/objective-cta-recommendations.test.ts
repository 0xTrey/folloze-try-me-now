import { describe, expect, it } from "vitest";

import {
  mergeObjectiveCtaRecommendations,
  recommendObjectiveCtas,
  type ObjectiveCtaEvidence,
  type ObjectiveCtaMotion,
  type ObjectiveCtaRecommendationInput,
  type ObjectiveCtaRecommendationSet,
  type ObjectiveCtaSelection
} from "@/lib/generation/objective-cta-recommendations";
import type { ProductionArtifact } from "@/lib/orchestration/worker-types";

const startedAt = "2026-08-22T17:00:00.000Z";
const completedAt = "2026-08-22T17:00:00.020Z";

function input(
  motion: ObjectiveCtaMotion,
  overrides: Partial<ObjectiveCtaRecommendationInput> = {}
): ObjectiveCtaRecommendationInput {
  return {
    sessionId: "session-objective-cta",
    revision: 4,
    activeRevision: 4,
    motion,
    startedAt,
    completedAt,
    ...overrides
  };
}

function valueOf(
  artifact: ProductionArtifact<ObjectiveCtaRecommendationSet>
): ObjectiveCtaRecommendationSet {
  expect(artifact.value).toBeDefined();
  return artifact.value!;
}

function recommended(
  artifact: ProductionArtifact<ObjectiveCtaRecommendationSet>
) {
  const value = valueOf(artifact);
  const candidate = value.candidates.find((item) => item.recommended);
  expect(candidate).toBeDefined();
  return candidate!;
}

function evidence(
  overrides: Partial<ObjectiveCtaEvidence> & Pick<ObjectiveCtaEvidence, "signal">
): ObjectiveCtaEvidence {
  return {
    id: `evidence-${overrides.signal}`,
    revision: 4,
    provenance: "visitor-input",
    confidence: 0.9,
    ...overrides
  };
}

describe("objective and CTA recommendations", () => {
  it("defaults a generic campaign to one recommended book-a-meeting candidate", () => {
    const artifact = recommendObjectiveCtas(input("campaign"));
    const value = valueOf(artifact);

    expect(artifact).toMatchObject({
      worker: "objective-cta-strategist",
      revision: 4,
      status: "complete",
      evidenceRefs: [],
      confidence: 0.6
    });
    expect(value.candidates).toHaveLength(3);
    expect(value.candidates.filter((candidate) => candidate.recommended)).toHaveLength(1);
    expect(recommended(artifact)).toMatchObject({
      id: value.recommendedCandidateId,
      objective: "Start a sales conversation",
      actionFamily: "engage",
      cta: { type: "book-meeting", label: "Book a meeting" },
      reasonCodes: [
        "generic-book-meeting-default",
        "campaign-motion",
        "action-family-engage"
      ],
      provenance: { strategy: "deterministic-policy", evidenceRefs: [] },
      revision: 4
    });
    expect(recommendObjectiveCtas(input("campaign"))).toEqual(artifact);
  });

  it.each([
    ["product", "Evaluate the product", "Book a product walkthrough", "product-motion"],
    [
      "industry",
      "Apply the industry perspective",
      "Book an industry working session",
      "industry-motion"
    ]
  ] as const)(
    "keeps the %s objective aligned to a meeting CTA by default",
    (motion, objective, label, reasonCode) => {
      const artifact = recommendObjectiveCtas(input(motion));
      const choice = recommended(artifact);

      expect(valueOf(artifact).candidates).toHaveLength(3);
      expect(choice).toMatchObject({
        objective,
        actionFamily: "engage",
        cta: { type: "book-meeting", label },
        reasonCodes: expect.arrayContaining([
          "generic-book-meeting-default",
          reasonCode,
          "action-family-engage"
        ])
      });
    }
  );

  it("exposes three distinct action families for default campaign candidates", () => {
    const artifact = recommendObjectiveCtas(input("campaign"));
    const families = valueOf(artifact).candidates.map(({ actionFamily }) => actionFamily);

    expect(new Set(families)).toEqual(new Set(["evaluate", "engage", "offer-specific"]));
    expect(valueOf(artifact).candidates.map(({ cta }) => cta.type)).toEqual([
      "explore",
      "book-meeting",
      "download"
    ]);
  });

  it("uses visitor-backed ABM buying-group evidence for the account working-session exception", () => {
    const artifact = recommendObjectiveCtas(
      input("abm", {
        evidence: [evidence({ signal: "abm-buying-group-alignment", id: "brief-buying-group" })]
      })
    );
    const choice = recommended(artifact);

    expect(artifact).toMatchObject({
      status: "complete",
      evidenceRefs: ["brief-buying-group"],
      confidence: 0.9
    });
    expect(choice).toMatchObject({
      objective: "Align the buying group",
      actionFamily: "engage",
      cta: { type: "book-meeting", label: "Plan an account working session" },
      reasonCodes: ["abm-motion", "abm-buying-group-evidence", "action-family-engage"],
      provenance: {
        strategy: "evidence-backed",
        evidenceRefs: ["brief-buying-group"]
      },
      revision: 4
    });
  });

  it("recommends registration only from current, authoritative event evidence", () => {
    const artifact = recommendObjectiveCtas(
      input("event", {
        evidence: [
          evidence({
            signal: "event-registration-open",
            id: "official-event-registration",
            provenance: "official-event-page",
            confidence: 0.94
          })
        ]
      })
    );

    expect(recommended(artifact)).toMatchObject({
      objective: "Drive registrations",
      actionFamily: "offer-specific",
      cta: { type: "register", label: "Register for the event" },
      reasonCodes: ["event-motion", "event-registration-evidence", "action-family-offer-specific"],
      provenance: {
        strategy: "evidence-backed",
        evidenceRefs: ["official-event-registration"]
      }
    });
    expect(artifact.status).toBe("complete");
  });

  it.each([
    ["webinar-registration-open", "Register for the webinar", "webinar-registration-evidence"],
    ["webinar-on-demand", "Watch the webinar", "webinar-on-demand-evidence"]
  ] as const)(
    "supports the evidence-backed webinar %s path",
    (signal, ctaLabel, reasonCode) => {
      const artifact = recommendObjectiveCtas(
        input("webinar", {
          evidence: [
            evidence({
              signal,
              id: `official-${signal}`,
              provenance: "official-event-page"
            })
          ]
        })
      );

      expect(recommended(artifact)).toMatchObject({
        actionFamily: signal === "webinar-on-demand" ? "offer-specific" : "offer-specific",
        cta: { label: ctaLabel },
        reasonCodes: ["webinar-motion", reasonCode, "action-family-offer-specific"]
      });
      expect(artifact.status).toBe("complete");
    }
  );

  it("falls back to book a meeting when event evidence is weak or non-authoritative", () => {
    const artifact = recommendObjectiveCtas(
      input("event", {
        evidence: [
          evidence({
            signal: "event-registration-open",
            id: "weak-registration-claim",
            provenance: "reliable-third-party",
            confidence: 0.65
          })
        ]
      })
    );

    expect(artifact).toMatchObject({
      status: "fallback",
      fallbackCode: "objective_cta_weak_evidence_default",
      evidenceRefs: [],
      confidence: 0.45
    });
    expect(recommended(artifact)).toMatchObject({
      cta: { type: "book-meeting", label: "Book a meeting" },
      actionFamily: "engage",
      reasonCodes: [
        "generic-book-meeting-default",
        "event-motion",
        "action-family-engage",
        "weak-evidence-book-meeting-fallback"
      ],
      provenance: { strategy: "deterministic-policy", evidenceRefs: [] }
    });
  });

  it("does not let stale evidence enable an ABM or event exception", () => {
    const artifact = recommendObjectiveCtas(
      input("abm", {
        evidence: [
          evidence({
            signal: "abm-active-evaluation",
            id: "old-opportunity-signal",
            revision: 3
          })
        ]
      })
    );

    expect(artifact.status).toBe("fallback");
    expect(artifact.evidenceRefs).toEqual([]);
    expect(recommended(artifact).cta.type).toBe("book-meeting");
    expect(recommended(artifact).objective).toBe("Discuss account priorities");
  });

  it("returns a stale ProductionArtifact when the worker revision is no longer active", () => {
    const artifact = recommendObjectiveCtas(
      input("event", { revision: 3, activeRevision: 4 })
    );

    expect(artifact).toEqual({
      worker: "objective-cta-strategist",
      sessionId: "session-objective-cta",
      revision: 3,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      startedAt,
      completedAt,
      errorCode: "objective_cta_stale_revision"
    });
    expect(artifact.value).toBeUndefined();
  });

  it("never emits urgency or a destination in any candidate", () => {
    const artifacts = [
      recommendObjectiveCtas(input("campaign")),
      recommendObjectiveCtas(input("product")),
      recommendObjectiveCtas(input("industry")),
      recommendObjectiveCtas(
        input("abm", { evidence: [evidence({ signal: "abm-active-evaluation" })] })
      ),
      recommendObjectiveCtas(
        input("event", {
          evidence: [
            evidence({
              signal: "event-registration-open",
              provenance: "official-event-page"
            })
          ]
        })
      ),
      recommendObjectiveCtas(
        input("webinar", {
          evidence: [
            evidence({ signal: "webinar-on-demand", provenance: "official-event-page" })
          ]
        })
      )
    ];

    for (const artifact of artifacts) {
      for (const candidate of valueOf(artifact).candidates) {
        expect(`${candidate.objective} ${candidate.cta.label}`).not.toMatch(
          /\b(?:urgent|hurry|deadline|limited time|act now|today|before it's too late)\b/i
        );
        expect(Object.keys(candidate.cta)).toEqual(["type", "label"]);
        expect(JSON.stringify(candidate)).not.toMatch(/destination|href|url/i);
      }
    }
  });
});

describe("objective and CTA recommendation merge behavior", () => {
  it("updates recommendations while preserving a visitor-selected candidate snapshot", () => {
    const first = recommendObjectiveCtas(input("campaign"));
    const incoming = recommendObjectiveCtas(
      input("product", {
        evidence: [evidence({ signal: "product-evaluation", id: "product-evidence" })]
      })
    );
    const selection: ObjectiveCtaSelection = {
      origin: "visitor-candidate",
      candidateId: "campaign-explore-offer",
      objective: "Build offer interest",
      cta: { type: "explore", label: "Explore the offer" },
      revision: 4
    };

    const merged = mergeObjectiveCtaRecommendations({
      activeRevision: 4,
      current: { recommendations: first, selection },
      incoming
    });

    expect(merged).toMatchObject({
      applied: true,
      reasonCode: "visitor-selection-preserved",
      state: { recommendations: incoming, selection }
    });
    expect(merged.state.selection).toBe(selection);
  });

  it("preserves free-form visitor input across a current-revision refresh", () => {
    const custom: ObjectiveCtaSelection = {
      origin: "visitor-custom",
      objective: "Validate the operating model",
      cta: { type: "custom", label: "Scope the review" },
      revision: 4
    };
    const incoming = recommendObjectiveCtas(input("industry"));
    const merged = mergeObjectiveCtaRecommendations({
      activeRevision: 4,
      current: { selection: custom },
      incoming
    });

    expect(merged.reasonCode).toBe("visitor-custom-preserved");
    expect(merged.state.selection).toBe(custom);
    expect(merged.state.recommendations).toBe(incoming);
  });

  it("refreshes only a system-managed recommendation selection", () => {
    const initial = recommendObjectiveCtas(input("campaign"));
    const prior = recommended(initial);
    const incoming = recommendObjectiveCtas(
      input("event", {
        evidence: [
          evidence({
            signal: "event-registration-open",
            provenance: "official-event-page"
          })
        ]
      })
    );
    const merged = mergeObjectiveCtaRecommendations({
      activeRevision: 4,
      current: {
        recommendations: initial,
        selection: {
          origin: "recommended",
          candidateId: prior.id,
          objective: prior.objective,
          cta: prior.cta,
          revision: 4
        }
      },
      incoming
    });

    expect(merged.reasonCode).toBe("recommended-selection-refreshed");
    expect(merged.state.selection).toMatchObject({
      origin: "recommended",
      candidateId: "event-register",
      objective: "Drive registrations",
      cta: { type: "register" },
      revision: 4
    });
  });

  it("ignores a stale recommendation artifact without mutating current state", () => {
    const current = {
      recommendations: recommendObjectiveCtas(input("campaign"))
    };
    const stale = recommendObjectiveCtas(
      input("event", { revision: 3, activeRevision: 4 })
    );
    const merged = mergeObjectiveCtaRecommendations({
      activeRevision: 4,
      current,
      incoming: stale
    });

    expect(merged).toEqual({
      state: current,
      applied: false,
      reasonCode: "stale-revision-ignored"
    });
    expect(merged.state).toBe(current);
  });
});
