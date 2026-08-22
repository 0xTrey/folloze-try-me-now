import { describe, expect, it } from "vitest";

import type { NormalizedCompanyIdentity } from "@/lib/domain-identity";
import type {
  AudienceAccountCandidate,
  AudienceRecommendationSet
} from "@/lib/generation/audience-recommendations";
import { recommendObjectiveCtas } from "@/lib/generation/objective-cta-recommendations";
import type {
  ProductionArtifact,
  WorkerKind
} from "@/lib/orchestration/worker-types";

import type {
  CompanyResearchBrief,
  CompanyResearchField,
  CompanyResearchSourceAuthority
} from "./company-research";
import {
  reconcileLiveBriefEvidence,
  type ReconcileLiveBriefEvidenceInput
} from "./evidence-reconciler";
import {
  rankOfferRecommendations,
  type OfferRecommendationSet
} from "./offer-recommendations";

const sessionId = "session-evidence-reconciler";
const revision = 4;
const startedAt = "2026-08-22T17:00:00.000Z";
const completedAt = "2026-08-22T17:00:01.000Z";

function artifact<T>(
  worker: WorkerKind,
  value: T,
  overrides: Partial<ProductionArtifact<T>> = {}
): ProductionArtifact<T> {
  return {
    worker,
    sessionId,
    revision,
    status: "complete",
    value,
    evidenceRefs: [],
    confidence: 0.9,
    startedAt,
    completedAt,
    ...overrides
  };
}

function identityArtifact(
  overrides: {
    revision?: number;
    status?: ProductionArtifact<NormalizedCompanyIdentity>["status"];
    name?: string;
    nameSource?: string;
    observedAt?: string;
    confidence?: number;
  } = {}
): ProductionArtifact<NormalizedCompanyIdentity> {
  const artifactRevision = overrides.revision ?? revision;
  const observedAt = overrides.observedAt ?? completedAt;
  const name = overrides.name ?? "Acme";
  const confidence = overrides.confidence ?? 0.95;
  const nameSource = overrides.nameSource ?? "official_metadata";
  return artifact("identity-normalizer", {
    name,
    canonicalDomain: "acme.example",
    aliases: [],
    rejectedAliases: [],
    revisionFingerprint: "identity-fingerprint",
    evidence: {
      name: {
        value: name,
        source: nameSource,
        confidence,
        observedAt,
        revision: artifactRevision
      },
      canonicalDomain: {
        value: "acme.example",
        source: "canonical_link",
        confidence: 0.96,
        observedAt,
        revision: artifactRevision
      },
      aliases: []
    }
  }, {
    revision: artifactRevision,
    status: overrides.status ?? "complete",
    confidence
  });
}

function offerArtifact(
  label = "Acme Revenue Platform",
  artifactRevision = revision,
  source: "official-page" | "visitor-input" = "official-page"
): ProductionArtifact<OfferRecommendationSet> {
  const value = rankOfferRecommendations({
    revision: artifactRevision,
    motion: "product",
    evidence: [{
      ref: `offer:${label}`,
      label,
      kind: "product",
      source,
      confidence: 0.94
    }]
  });
  return artifact("offer-researcher", value, {
    revision: artifactRevision,
    evidenceRefs: value.evidenceRefs,
    confidence: value.confidence
  });
}

function audienceCandidate(input: {
  id: string;
  label: string;
  entityRole?: "seller" | "target";
  confidence?: number;
}): AudienceAccountCandidate {
  const entityRole = input.entityRole ?? "seller";
  return {
    id: input.id,
    label: input.label,
    buyerRole: input.label,
    buyerJob: "evaluate fit, operating impact, and the next decision",
    rationale: "Bounded recommendation rationale",
    recommended: true,
    confidence: input.confidence ?? 0.85,
    confidenceBand: "high",
    provenance: [{
      evidenceRef: `${entityRole}:${input.id}`,
      entityRole,
      kind: "public-evidence",
      sourceUrl: entityRole === "target"
        ? "https://target.example/priorities"
        : "https://acme.example/offer",
      summary: "Bounded source summary",
      confidence: input.confidence ?? 0.85
    }],
    authority: {
      pageBrandOwner: "seller",
      offerOwner: "seller",
      sellerName: "Acme",
      sellerDomain: "acme.example",
      targetUse: entityRole === "target" ? "abm-context-only" : "none"
    }
  };
}

function audienceArtifact(input: {
  label?: string;
  entityRole?: "seller" | "target";
  confidence?: number;
  completed?: string;
} = {}): ProductionArtifact<AudienceRecommendationSet> {
  const selected = audienceCandidate({
    id: input.entityRole === "target" ? "target-audience" : "seller-audience",
    label: input.label ?? "Revenue operations leaders",
    entityRole: input.entityRole,
    confidence: input.confidence
  });
  const alternatives = [
    { ...selected, id: `${selected.id}-2`, recommended: false },
    { ...selected, id: `${selected.id}-3`, recommended: false }
  ] as const;
  return artifact("audience-strategist", {
    route: input.entityRole === "target" ? "named-account" : "generic-campaign",
    candidates: [selected, ...alternatives],
    recommendedCandidateId: selected.id,
    sellerAuthority: {
      sellerName: "Acme",
      sellerDomain: "acme.example",
      targetUse: input.entityRole === "target" ? "abm-context-only" : "none"
    }
  }, {
    completedAt: input.completed ?? completedAt,
    confidence: input.confidence ?? 0.85
  });
}

function objectiveArtifact() {
  return recommendObjectiveCtas({
    sessionId,
    revision,
    activeRevision: revision,
    motion: "product",
    evidence: [{
      id: "official-product-evaluation",
      revision,
      signal: "product-evaluation",
      provenance: "official-seller-page",
      confidence: 0.91
    }],
    startedAt,
    completedAt
  });
}

function companyArtifact(input: {
  id: string;
  field: CompanyResearchField;
  value: string;
  authority?: CompanyResearchSourceAuthority;
  observedAt?: string;
  confidence?: number;
  completed?: string;
}): ProductionArtifact<CompanyResearchBrief> {
  const authority = input.authority ?? "company-official-site";
  if (authority === "third-party") {
    throw new Error("Reconciler fixtures use supported official company claims.");
  }
  return artifact("company-researcher", {
    revision,
    claims: {
      [input.field]: {
        value: input.value,
        evidenceRef: input.id,
        confidence: input.confidence ?? 0.8,
        revision,
        provenance: {
          authority,
          url: `https://acme.example/${input.id}`,
          observedAt: input.observedAt ?? completedAt,
          official: true
        }
      }
    },
    conflicts: []
  }, {
    completedAt: input.completed ?? completedAt,
    evidenceRefs: [input.id],
    confidence: input.confidence ?? 0.8
  });
}

function completeInput(
  overrides: Partial<ReconcileLiveBriefEvidenceInput> = {}
): ReconcileLiveBriefEvidenceInput {
  return {
    sessionId,
    revision,
    identityArtifacts: [identityArtifact()],
    offerRecommendationArtifacts: [offerArtifact()],
    audienceRecommendationArtifacts: [audienceArtifact()],
    objectiveCtaArtifacts: [objectiveArtifact()],
    startedAt,
    completedAt,
    ...overrides
  };
}

describe("reconcileLiveBriefEvidence", () => {
  it("returns one exactly-current-revision material Live Brief evidence artifact", () => {
    const result = reconcileLiveBriefEvidence(completeInput({
      companyResearchArtifacts: [
        companyArtifact({
          id: "company-description",
          field: "company",
          value: "Acme builds revenue software."
        })
      ]
    }));

    expect(result).toMatchObject({
      worker: "evidence-reconciler",
      sessionId,
      revision,
      status: "complete",
      value: {
        revision,
        materialCompleteness: "complete",
        unresolvedFields: []
      }
    });
    expect(Object.values(result.value?.fields ?? {})).not.toHaveLength(0);
    expect(
      Object.values(result.value?.fields ?? {}).every(
        (field) =>
          field.revision === revision &&
          Array.isArray(field.evidenceRefs) &&
          typeof field.confidence === "number" &&
          Array.isArray(field.provenance) &&
          typeof field.visitorEdited === "boolean"
      )
    ).toBe(true);
    expect(result.value?.fields.offer?.value.label).toBe("Acme Revenue Platform");
    expect(result.value?.fields.audience?.value.buyerRole).toBe(
      "Revenue operations leaders"
    );
    expect(result.value?.fields.cta?.value).toEqual({
      type: "book-meeting",
      label: "Book a product walkthrough"
    });
    expect(JSON.stringify(result)).not.toContain("Bounded source summary");
    expect(JSON.stringify(result)).not.toContain("Bounded recommendation rationale");
  });

  it("resolves authority, semantic-role, freshness, and confidence conflicts in order", () => {
    const result = reconcileLiveBriefEvidence(completeInput({
      identityArtifacts: [
        identityArtifact({
          name: "Official Acme",
          nameSource: "official_metadata",
          observedAt: "2026-08-01T17:00:00.000Z",
          confidence: 0.5
        }),
        identityArtifact({
          name: "Directory Acme",
          nameSource: "directory_listing",
          observedAt: "2026-08-22T17:00:00.000Z",
          confidence: 0.99
        })
      ],
      companyResearchArtifacts: [
        companyArtifact({
          id: "category-new-official",
          field: "category",
          value: "New official category",
          observedAt: "2026-08-22T17:00:00.000Z",
          confidence: 0.99
        }),
        companyArtifact({
          id: "category-visitor-official",
          field: "category",
          value: "Visitor supplied category",
          authority: "visitor-supplied-official",
          observedAt: "2026-08-01T17:00:00.000Z",
          confidence: 0.5
        }),
        companyArtifact({
          id: "positioning-old-high",
          field: "positioning",
          value: "Older positioning",
          observedAt: "2026-08-01T17:00:00.000Z",
          confidence: 0.99
        }),
        companyArtifact({
          id: "positioning-new-low",
          field: "positioning",
          value: "Current positioning",
          observedAt: "2026-08-22T17:00:00.000Z",
          confidence: 0.55
        }),
        companyArtifact({
          id: "company-low",
          field: "company",
          value: "Lower confidence description",
          confidence: 0.55
        }),
        companyArtifact({
          id: "company-high",
          field: "company",
          value: "Higher confidence description",
          confidence: 0.95
        })
      ],
      audienceRecommendationArtifacts: [
        audienceArtifact({
          label: "Seller-derived audience",
          entityRole: "seller",
          confidence: 0.99
        }),
        audienceArtifact({
          label: "Target-context audience",
          entityRole: "target",
          confidence: 0.6
        })
      ]
    }));

    expect(result.value?.fields.companyName?.value).toBe("Official Acme");
    expect(result.value?.fields.category?.value).toBe("Visitor supplied category");
    expect(result.value?.fields.positioning?.value).toBe("Current positioning");
    expect(result.value?.fields.company?.value).toBe("Higher confidence description");
    expect(result.value?.fields.audience?.value.label).toBe("Target-context audience");
    expect(result.value?.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "companyName",
        resolution: "official-source-authority"
      }),
      expect.objectContaining({
        field: "category",
        resolution: "visitor-authority"
      }),
      expect.objectContaining({ field: "positioning", resolution: "freshness" }),
      expect.objectContaining({ field: "company", resolution: "confidence" }),
      expect.objectContaining({ field: "audience", resolution: "semantic-role" })
    ]));
  });

  it("ignores stale artifacts and never projects their revision or values", () => {
    const result = reconcileLiveBriefEvidence({
      sessionId,
      revision,
      identityArtifacts: [identityArtifact()],
      offerRecommendationArtifacts: [
        offerArtifact("Stale named offer", revision - 1)
      ],
      startedAt,
      completedAt
    });

    expect(result.revision).toBe(revision);
    expect(result.value?.revision).toBe(revision);
    expect(result.value?.fields.offer).toBeUndefined();
    expect(result.value?.unresolvedFields).toContain("offer");
    expect(JSON.stringify(result)).not.toContain("Stale named offer");
    expect(
      Object.values(result.value?.fields ?? {}).every(
        (field) => field.revision === revision
      )
    ).toBe(true);
  });

  it("keeps material completeness when optional evidence is missing", () => {
    const result = reconcileLiveBriefEvidence(completeInput());

    expect(result.status).toBe("complete");
    expect(result.value?.materialCompleteness).toBe("complete");
    expect(result.value?.unresolvedFields).toEqual([]);
    expect(result.value?.optionalEvidenceMissing).toEqual([
      "company",
      "category",
      "positioning",
      "brandVisual"
    ]);
  });

  it("preserves a visitor edit over fresher, higher-confidence research", () => {
    const result = reconcileLiveBriefEvidence(completeInput({
      offerRecommendationArtifacts: [
        offerArtifact("Fresh official platform")
      ],
      visitorEdits: {
        offer: {
          value: {
            label: "Visitor-selected operating model review",
            kind: "solution"
          },
          evidenceRef: "visitor:offer-edit",
          confidence: 0.7,
          editedAt: "2026-08-20T10:00:00.000Z",
          editedAtRevision: revision - 1
        }
      }
    }));

    expect(result.value?.fields.offer).toMatchObject({
      revision,
      value: {
        label: "Visitor-selected operating model review",
        kind: "solution"
      },
      evidenceRefs: ["visitor:offer-edit"],
      confidence: 0.7,
      visitorEdited: true
    });
    expect(result.value?.fields.offer?.provenance).toEqual([
      expect.objectContaining({
        authority: "visitor",
        semanticRole: "visitor-edit",
        worker: "visitor"
      })
    ]);
    expect(result.value?.conflicts).toContainEqual(
      expect.objectContaining({
        field: "offer",
        resolution: "visitor-authority"
      })
    );
  });
});
