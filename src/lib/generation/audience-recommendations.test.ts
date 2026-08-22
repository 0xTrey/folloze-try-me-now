import { describe, expect, it } from "vitest";

import {
  buildAudienceRecommendations,
  dedupeNearIdenticalAudienceOptions,
  mergeAudienceRecommendationArtifact,
  type AudienceRecommendationState
} from "@/lib/generation/audience-recommendations";
import type { BrandProfile, SessionEvidenceItem } from "@/lib/types";

const generatedAt = "2026-08-22T17:00:00.000Z";

function profile(
  overrides: Partial<BrandProfile> & Pick<BrandProfile, "domain" | "companyName">
): BrandProfile {
  return {
    publicTopics: [],
    imageUrls: [],
    colors: ["#111827", "#F15A29", "#FFFFFF"],
    primaryColor: "#111827",
    accentColor: "#F15A29",
    surfaceColor: "#FFFFFF",
    sourceUrl: `https://${overrides.domain}`,
    source: "brand-harvester",
    ...overrides
  };
}

function evidence(
  overrides: Partial<SessionEvidenceItem> &
    Pick<SessionEvidenceItem, "id" | "text" | "sourceUrl" | "entityRole">
): SessionEvidenceItem {
  return {
    type: "public-focus-area",
    label: "Public focus area",
    signals: overrides.text.split(/\s+/).slice(0, 4),
    disposition: "available",
    confidence: "high",
    ...overrides
  };
}

const seller = profile({
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "An integration, automation, API management, and application platform.",
  publicContext: "Jitterbit helps organizations connect applications and automate workflows.",
  publicTopics: ["Application integration", "Workflow automation", "API management"]
});

describe("audience recommendation strategy", () => {
  it("produces three distinct, sourced role candidates for a generic campaign", () => {
    const artifact = buildAudienceRecommendations({
      sessionId: "generic-campaign",
      revision: 3,
      activeRevision: 3,
      route: "generic-campaign",
      seller,
      offerLabel: "Harmony",
      evidenceItems: [
        evidence({
          id: "seller-integration",
          text: "Application integration and API management",
          sourceUrl: "https://jitterbit.com/platform",
          entityRole: "seller"
        }),
        evidence({
          id: "seller-workflows",
          text: "Workflow automation across business processes",
          sourceUrl: "https://jitterbit.com/automation",
          entityRole: "seller",
          confidence: "medium"
        })
      ],
      generatedAt
    });

    expect(artifact.status).toBe("complete");
    expect(artifact.worker).toBe("audience-strategist");
    expect(artifact.value?.candidates).toHaveLength(3);
    expect(artifact.value?.candidates.filter(({ recommended }) => recommended)).toHaveLength(1);
    expect(artifact.value?.recommendedCandidateId).toBe(
      artifact.value?.candidates.find(({ recommended }) => recommended)?.id
    );
    expect(new Set(artifact.value?.candidates.map(({ id }) => id)).size).toBe(3);
    expect(new Set(artifact.value?.candidates.map(({ buyerRole }) => buyerRole)).size).toBe(3);
    expect(
      artifact.value?.candidates.every(
        (candidate) =>
          candidate.buyerJob.length > 20 &&
          candidate.rationale.length > 40 &&
          candidate.recommendationKind === "evidence-backed" &&
          candidate.provenance.length > 0 &&
          candidate.provenance.every(({ evidenceRef, confidence }) =>
            Boolean(evidenceRef) && confidence > 0
          ) &&
          candidate.authority.pageBrandOwner === "seller" &&
          candidate.authority.offerOwner === "seller" &&
          candidate.authority.targetUse === "none" &&
          !candidate.targetContext
      )
    ).toBe(true);
  });

  it("uses a named account only as sourced ABM context under seller authority", () => {
    const target = profile({
      domain: "cisco.com",
      companyName: "Cisco",
      description: "Networking, security, data center, and cloud operations.",
      publicContext: "Cisco supports secure networking and digital resilience.",
      publicTopics: ["Networking", "Security", "Cloud operations"]
    });
    const artifact = buildAudienceRecommendations({
      sessionId: "named-account",
      revision: 5,
      activeRevision: 5,
      route: "named-account",
      seller,
      target,
      offerLabel: "Harmony",
      evidenceItems: [
        evidence({
          id: "target-network",
          text: "Secure networking and cloud operations",
          sourceUrl: "https://cisco.com/solutions",
          entityRole: "target"
        }),
        evidence({
          id: "target-resilience",
          text: "Digital resilience across infrastructure",
          sourceUrl: "https://cisco.com/security",
          entityRole: "target",
          confidence: "medium"
        }),
        evidence({
          id: "wrong-role",
          text: "A seller-side signal must not become Cisco evidence",
          sourceUrl: "https://jitterbit.com/platform",
          entityRole: "seller"
        })
      ],
      generatedAt
    });

    expect(artifact.status).toBe("complete");
    expect(artifact.value?.sellerAuthority).toEqual({
      sellerName: "Jitterbit",
      sellerDomain: "jitterbit.com",
      targetUse: "abm-context-only"
    });
    expect(artifact.value?.candidates).toHaveLength(3);
    expect(
      artifact.value?.candidates.every(
        (candidate) =>
          candidate.authority.sellerName === "Jitterbit" &&
          candidate.authority.pageBrandOwner === "seller" &&
          candidate.authority.offerOwner === "seller" &&
          candidate.authority.targetUse === "abm-context-only" &&
          candidate.targetContext?.accountName === "Cisco" &&
          candidate.targetContext.evidenceRefs.includes("target-network") &&
          candidate.rationale.includes("Jitterbit remains the offer and page authority") &&
          candidate.provenance
            .filter(({ entityRole }) => entityRole === "target")
            .every(({ sourceUrl }) => sourceUrl?.includes("cisco.com"))
      )
    ).toBe(true);
    expect(artifact.evidenceRefs).not.toContain("wrong-role");
  });

  it("returns three explicit hypotheses instead of invented claims when evidence is sparse", () => {
    const sparseSeller = profile({
      domain: "unknown.example",
      companyName: "Unknown Seller",
      sourceUrl: "https://unknown.example",
      source: "fallback",
      description: undefined,
      publicContext: undefined,
      publicTopics: []
    });
    const artifact = buildAudienceRecommendations({
      sessionId: "sparse",
      revision: 1,
      activeRevision: 1,
      route: "generic-campaign",
      seller: sparseSeller,
      generatedAt
    });

    expect(artifact.status).toBe("fallback");
    expect(artifact.fallbackCode).toBe("audience_sparse_evidence");
    expect(artifact.value?.candidates).toHaveLength(3);
    expect(new Set(artifact.value?.candidates.map(({ buyerRole }) => buyerRole)).size).toBe(3);
    expect(
      artifact.value?.candidates.every(
        (candidate) =>
          candidate.confidenceBand === "hypothesis" &&
          candidate.recommendationKind === "fallback" &&
          candidate.confidence <= 0.4 &&
          candidate.rationale.startsWith("Hypothesis to confirm:") &&
          candidate.provenance.every(({ kind }) => kind === "deterministic-fallback")
      )
    ).toBe(true);
  });

  it("dedupes near-identical options before selecting alternatives", () => {
    expect(
      dedupeNearIdenticalAudienceOptions([
        "Cloud platform leaders responsible for infrastructure",
        "Cloud platform leaders responsible for infrastructure decisions",
        "Security and governance leaders",
        "Executive sponsors"
      ])
    ).toEqual([
      "Cloud platform leaders responsible for infrastructure",
      "Security and governance leaders",
      "Executive sponsors"
    ]);
  });
});

describe("merge-safe recommendation updates", () => {
  it("marks revision mismatches stale and leaves the current projection untouched", () => {
    const current: AudienceRecommendationState = {
      revision: 2,
      candidates: [],
      recommendedCandidateId: "current-recommendation",
      visitorChoice: {
        value: "Enterprise architects who own integration governance",
        mode: "freeform",
        editedAtRevision: 2
      }
    };
    const staleArtifact = buildAudienceRecommendations({
      sessionId: "revision-mismatch",
      revision: 1,
      activeRevision: 2,
      route: "generic-campaign",
      seller,
      generatedAt
    });

    expect(staleArtifact.status).toBe("stale");
    expect(staleArtifact.value).toBeUndefined();
    expect(mergeAudienceRecommendationArtifact(current, staleArtifact, 2)).toBe(current);
  });

  it("refreshes current recommendations without overwriting a visitor edit", () => {
    const current: AudienceRecommendationState = {
      revision: 4,
      candidates: [],
      recommendedCandidateId: "older-recommendation",
      visitorChoice: {
        value: "Enterprise architects who own integration governance",
        mode: "freeform",
        editedAtRevision: 4
      }
    };
    const artifact = buildAudienceRecommendations({
      sessionId: "merge-current",
      revision: 4,
      activeRevision: 4,
      route: "generic-campaign",
      seller,
      generatedAt
    });
    const merged = mergeAudienceRecommendationArtifact(current, artifact, 4);

    expect(merged?.candidates).toHaveLength(3);
    expect(merged?.recommendedCandidateId).toBe(artifact.value?.recommendedCandidateId);
    expect(merged?.visitorChoice).toBe(current.visitorChoice);
    expect(merged?.visitorChoice?.value).toBe(
      "Enterprise architects who own integration governance"
    );
  });
});
