import { describe, expect, it } from "vitest";

import {
  rankOfferRecommendations,
  type ExtractedOfferEvidence,
  type OfferCampaignMotion
} from "./offer-recommendations";

function evidence(
  overrides: Partial<ExtractedOfferEvidence> & Pick<ExtractedOfferEvidence, "ref" | "label">
): ExtractedOfferEvidence {
  return {
    kind: "topic",
    source: "homepage",
    confidence: 0.75,
    ...overrides
  };
}

describe("rankOfferRecommendations", () => {
  it("discovers and ranks three product offers from homepage evidence", () => {
    const result = rankOfferRecommendations({
      revision: 4,
      motion: "product",
      evidence: [
        evidence({
          ref: "home:revenue-platform",
          label: "Revenue Intelligence Platform",
          kind: "product",
          confidence: 0.93
        }),
        evidence({
          ref: "home:signal-suite",
          label: "Buying Signal Suite",
          kind: "product",
          confidence: 0.81
        }),
        evidence({
          ref: "home:account-data",
          label: "Account Data",
          kind: "product",
          confidence: 0.7
        })
      ]
    });

    expect(result).toMatchObject({
      revision: 4,
      motion: "product",
      status: "complete"
    });
    expect(result.candidates.map(({ label }) => label)).toEqual([
      "Revenue Intelligence Platform",
      "Buying Signal Suite",
      "Account Data"
    ]);
    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every(
        ({ recommendationKind }) => recommendationKind === "evidence-backed"
      )
    ).toBe(true);
    expect(result.candidates.filter(({ recommended }) => recommended)).toHaveLength(1);
    expect(result.recommendedId).toBe(result.candidates[0].id);
    expect(result.candidates[0].reasonCodes).toEqual(
      expect.arrayContaining(["homepage_discovery", "motion_match"])
    );
  });

  it.each([
    ["solution", "Pipeline Orchestration", "solution"],
    ["industry", "Financial Services", "industry"]
  ] as const)(
    "prefers evidence matching the %s motion",
    (motion, expectedLabel, matchingKind) => {
      const result = rankOfferRecommendations({
        revision: 2,
        motion: motion as OfferCampaignMotion,
        evidence: [
          evidence({
            ref: `${motion}:matching`,
            label: expectedLabel,
            kind: matchingKind,
            source: "official-page",
            confidence: 0.72
          }),
          evidence({
            ref: `${motion}:other`,
            label: "General Platform",
            kind: "product",
            source: "official-page",
            confidence: 0.95
          }),
          evidence({
            ref: `${motion}:topic`,
            label: "Buyer Priorities",
            kind: "topic",
            confidence: 0.8
          })
        ]
      });

      expect(result.candidates[0]).toMatchObject({
        label: expectedLabel,
        recommended: true
      });
      expect(result.candidates[0].reasonCodes).toContain("motion_match");
    }
  );

  it("lets evidence from the supplied URL outrank homepage discovery", () => {
    const suppliedUrl = "https://example.com/solutions/governed-ai/";
    const result = rankOfferRecommendations({
      revision: 7,
      motion: "product",
      suppliedUrl: "https://example.com/solutions/governed-ai?campaign=ignored",
      evidence: [
        evidence({
          ref: "home:flagship",
          label: "Flagship Data Platform",
          kind: "product",
          confidence: 0.99
        }),
        evidence({
          ref: "source:governed-ai",
          label: "Governed AI",
          kind: "solution",
          source: "official-page",
          sourceUrl: suppliedUrl,
          confidence: 0.62
        }),
        evidence({
          ref: "home:analytics",
          label: "Analytics Cloud",
          kind: "product",
          confidence: 0.88
        })
      ]
    });

    expect(result.candidates[0]).toMatchObject({
      label: "Governed AI",
      source: "supplied-url",
      recommended: true
    });
    expect(result.candidates[0].reasonCodes).toContain("supplied_url_match");
  });

  it("treats an explicit visitor offer as the strongest supported override", () => {
    const result = rankOfferRecommendations({
      revision: 8,
      motion: "solution",
      visitorOverride: {
        label: "Data Residency Readiness",
        evidenceRef: "visitor:offer",
        kind: "solution"
      },
      evidence: [
        evidence({
          ref: "official:automation",
          label: "Workflow Automation",
          kind: "solution",
          source: "official-page",
          confidence: 0.98
        })
      ]
    });

    expect(result.candidates[0]).toMatchObject({
      label: "Data Residency Readiness",
      source: "visitor-input",
      recommendationKind: "fallback",
      recommended: true,
      evidenceRefs: ["visitor:offer"]
    });
    expect(result.candidates[0].reasonCodes).toContain("visitor_override");
  });

  it("removes duplicate labels and merges their evidence references", () => {
    const result = rankOfferRecommendations({
      revision: 1,
      motion: "solution",
      evidence: [
        evidence({
          ref: "home:automation",
          label: "Workflow Automation",
          kind: "solution",
          confidence: 0.72
        }),
        evidence({
          ref: "page:automation",
          label: " workflow automation! ",
          kind: "solution",
          source: "official-page",
          confidence: 0.9
        }),
        evidence({
          ref: "page:integration",
          label: "Integration Management",
          kind: "solution",
          source: "official-page",
          confidence: 0.8
        })
      ]
    });

    expect(
      result.candidates.filter(({ label }) => /workflow automation/i.test(label))
    ).toHaveLength(1);
    expect(result.candidates[0].evidenceRefs).toEqual([
      "home:automation",
      "page:automation"
    ]);
    expect(result.candidates[0].reasonCodes).toContain("duplicate_evidence_merged");
    expect(new Set(result.candidates.map(({ label }) => label.toLowerCase())).size).toBe(3);
  });

  it("falls back to generic topics instead of naming weakly supported offers", () => {
    const result = rankOfferRecommendations({
      revision: 3,
      motion: "industry",
      evidence: [
        evidence({
          ref: "home:weak",
          label: "Unverified Healthcare Cloud",
          kind: "industry",
          confidence: 0.2
        })
      ]
    });

    expect(result.status).toBe("fallback");
    expect(result.candidates.map(({ label }) => label)).toEqual([
      "Industry priorities",
      "Industry use cases",
      "Industry evaluation questions"
    ]);
    expect(result.candidates.every(({ source }) => source === "fallback")).toBe(true);
    expect(
      result.candidates.every(
        ({ recommendationKind }) => recommendationKind === "fallback"
      )
    ).toBe(true);
    expect(result.candidates.some(({ label }) => label.includes("Unverified"))).toBe(false);
    expect(result.evidenceRefs).toEqual([]);
    expect(result.reasonCodes).toEqual(["weak_evidence_fallback"]);
  });

  it("uses the webinar subtype to rank webinar evidence above generic event evidence", () => {
    const result = rankOfferRecommendations({
      revision: 5,
      motion: "event",
      eventSubtype: "webinar",
      evidence: [
        evidence({
          ref: "events:summit",
          label: "Data Leadership Summit",
          kind: "event",
          source: "official-page",
          confidence: 0.9
        }),
        evidence({
          ref: "events:webinar",
          label: "AI Governance Webinar",
          kind: "webinar",
          source: "official-page",
          confidence: 0.85
        })
      ]
    });

    expect(result.eventSubtype).toBe("webinar");
    expect(result.candidates[0]).toMatchObject({
      label: "AI Governance Webinar",
      kind: "webinar",
      recommended: true
    });
    expect(result.candidates[0].reasonCodes).toContain("event_subtype_match");
    expect(result.candidates[2]).toMatchObject({
      label: "Webinar overview",
      source: "fallback"
    });
  });
});
