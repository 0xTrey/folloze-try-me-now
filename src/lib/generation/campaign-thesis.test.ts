import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_THESIS_SCHEMA_VERSION,
  campaignThesisDigest,
  campaignThesisDigestSource,
  compileCampaignThesis,
  THESIS_FIELD_ROLES,
  thesisEvidenceRefs,
  thesisFieldValue,
  validateCampaignThesis
} from "@/lib/generation/campaign-thesis";
import type {
  CampaignThesisInput,
  ThesisEvidenceClaim,
  ThesisFieldProposal,
  ThesisFieldRole,
  ThesisRequirement
} from "@/lib/generation/campaign-thesis";

const revision = 41;

const ALL_USES = [
  "hero",
  "credibility",
  "urgency",
  "choice",
  "mechanism",
  "team",
  "cta"
] as const;

function claim(id: string, overrides: Partial<ThesisEvidenceClaim> = {}): ThesisEvidenceClaim {
  return {
    id,
    claim: `Cryolane published documentation for ${id}.`,
    status: "fact",
    confidence: "high",
    allowedUses: [...ALL_USES],
    prohibitedUses: [],
    buyerFacing: true,
    ...overrides
  };
}

const proposals: Record<ThesisFieldRole, ThesisFieldProposal> = {
  seller: { value: "Cryolane", claimIds: ["ev-seller"] },
  offer: { value: "Lane Assurance", claimIds: ["ev-offer"] },
  audience: { value: "Cold-chain lane planners", claimIds: ["ev-audience"] },
  audienceJob: {
    value: "Hold every validated pharma lane inside its temperature window.",
    claimIds: ["ev-audience"]
  },
  currentState: {
    value: "Excursions surface after the pallet lands rather than while it moves.",
    claimIds: ["ev-excursions"]
  },
  desiredOutcome: { value: "Catch a drifting reefer before the pallet warms.", claimIds: ["ev-offer"] },
  promise: {
    value: "Lane Assurance keeps each validated lane inside its window dock to dock.",
    claimIds: ["ev-offer", "ev-positioning"]
  },
  mechanism: {
    value: "Lane Assurance reads reefer telemetry at each segment and reroutes through the nearest validated cross-dock.",
    claimIds: ["ev-positioning"]
  },
  proof: { value: "Twelve of forty pharma lanes recorded excursions above eight degrees.", claimIds: ["ev-excursions"] },
  objection: { value: "Retrofitting telemetry onto leased reefers.", claimIds: ["ev-positioning"] },
  nextAction: { value: "Book a lane audit for the two highest-excursion lanes.", claimIds: ["ev-cta"] },
  whyNow: { value: "The validated-lane review closes this quarter.", claimIds: ["ev-excursions"] }
};

function thesisInput(overrides: Partial<CampaignThesisInput> = {}): CampaignThesisInput {
  return {
    revision,
    evidence: {
      revision,
      entities: [
        { id: "en-seller", kind: "seller", canonicalName: "Cryolane", aliases: ["Cryolane Logistics"] }
      ],
      claims: [
        claim("ev-seller"),
        claim("ev-offer"),
        claim("ev-audience", { status: "inference", confidence: "medium" }),
        claim("ev-excursions"),
        claim("ev-positioning", { status: "inference", confidence: "high" }),
        claim("ev-cta", { status: "inference", confidence: "medium" })
      ],
      gaps: ["No published pricing for Lane Assurance."]
    },
    proposals,
    ...overrides
  };
}

const productSolutionRequirement: ThesisRequirement = {
  requiredFields: [
    "seller",
    "offer",
    "audience",
    "audienceJob",
    "promise",
    "mechanism",
    "nextAction"
  ],
  proofPolicy: "evidence-or-validation-question"
};

describe("compileCampaignThesis", () => {
  it("gives every field evidence refs, status, confidence, and buyer-facing permission", () => {
    const { thesis } = compileCampaignThesis(thesisInput());

    expect(thesis.schemaVersion).toBe(CAMPAIGN_THESIS_SCHEMA_VERSION);
    expect(thesis.revision).toBe(revision);
    for (const role of THESIS_FIELD_ROLES) {
      const field = thesis[role];
      if (!field) continue;
      expect(field.status).toMatch(/^(?:fact|inference|unknown)$/);
      expect(field.confidence).toMatch(/^(?:high|medium|low)$/);
      expect(typeof field.buyerFacing).toBe("boolean");
      expect(Array.isArray(field.evidenceRefs)).toBe(true);
    }
    expect(thesis.seller).toEqual({
      value: "Cryolane",
      evidenceRefs: ["ev-seller"],
      confidence: "high",
      status: "fact",
      buyerFacing: true
    });
    // Only inference support is available, so the field is asserted as one.
    expect(thesis.mechanism.status).toBe("inference");
    expect(thesisEvidenceRefs(thesis)).toContain("ev-positioning");
  });

  it("omits whyNow entirely when nothing supports it", () => {
    const input = thesisInput();
    const compilation = compileCampaignThesis({
      ...input,
      proposals: { ...input.proposals, whyNow: { claimIds: [] } }
    });

    expect("whyNow" in compilation.thesis).toBe(false);
    expect(compilation.omittedFields).toContain("whyNow");
    expect(compilation.thesis.unknowns).toContain(
      "The why now is not supported by current-revision evidence."
    );
  });

  it("keeps a required field present as an explicit unknown with no value", () => {
    const input = thesisInput();
    const { thesis, unsupportedFields } = compileCampaignThesis({
      ...input,
      proposals: { ...input.proposals, objection: { value: "Retrofitting cost.", claimIds: [] } }
    });

    expect(thesis.objection).toEqual({
      evidenceRefs: [],
      confidence: "low",
      status: "unknown",
      buyerFacing: false
    });
    expect(thesis.objection.value).toBeUndefined();
    expect(unsupportedFields).toContain("objection");
    expect(thesisFieldValue(thesis, "objection")).toBeUndefined();
  });

  it("drops evidence that prohibits the use the field would make of it", () => {
    const input = thesisInput();
    const compilation = compileCampaignThesis({
      ...input,
      evidence: {
        ...input.evidence,
        claims: input.evidence.claims.map((item) =>
          item.id === "ev-excursions"
            ? { ...item, prohibitedUses: ["proof-point", "urgency-claim"] }
            : item
        )
      }
    });

    expect(compilation.thesis.proof.status).toBe("unknown");
    expect(compilation.thesis.proof.value).toBeUndefined();
    expect(compilation.proofMode).toBe("validation-question");
    expect(compilation.droppedEvidenceRefs).toContain("ev-excursions");
    expect(compilation.reasonCodes).toContain("thesis_evidence_use_prohibited_proof");
    // The same claim still backs the constraint, which asserts no proof point.
    expect(compilation.thesis.currentState.status).toBe("fact");
  });

  it("marks a field internal when any claim behind it is not buyer-facing", () => {
    const input = thesisInput();
    const { thesis } = compileCampaignThesis({
      ...input,
      evidence: {
        ...input.evidence,
        claims: input.evidence.claims.map((item) =>
          item.id === "ev-positioning" ? { ...item, buyerFacing: false } : item
        )
      }
    });

    expect(thesis.mechanism.buyerFacing).toBe(false);
    expect(thesis.promise.buyerFacing).toBe(false);
    expect(thesis.seller.buyerFacing).toBe(true);
  });

  it("drops a dangling ref and records it rather than resolving it", () => {
    const input = thesisInput();
    const compilation = compileCampaignThesis({
      ...input,
      proposals: {
        ...input.proposals,
        offer: { value: "Lane Assurance", claimIds: ["ev-offer", "ev-missing"] }
      }
    });

    expect(compilation.thesis.offer.evidenceRefs).toEqual(["ev-offer"]);
    expect(compilation.droppedEvidenceRefs).toContain("ev-missing");
    expect(compilation.reasonCodes).toContain("thesis_dangling_evidence_ref_offer");
  });

  it("is deterministic for identical inputs", () => {
    const first = compileCampaignThesis(thesisInput());
    const second = compileCampaignThesis(thesisInput());

    expect(second.thesis).toEqual(first.thesis);
    expect(second.digest).toBe(first.digest);
    expect(campaignThesisDigest(second.thesis)).toBe(first.digest);
  });

  it("moves the digest when a field's wording changes", () => {
    const input = thesisInput();
    const changed = compileCampaignThesis({
      ...input,
      proposals: {
        ...input.proposals,
        promise: { ...input.proposals.promise!, value: "Lane Assurance holds the window on every leg." }
      }
    });

    expect(changed.digest).not.toBe(compileCampaignThesis(input).digest);
  });
});

describe("campaignThesisDigestSource", () => {
  it("carries field wording only as a hash", () => {
    const { thesis } = compileCampaignThesis(thesisInput());
    const serialized = JSON.stringify(campaignThesisDigestSource(thesis));

    expect(serialized).not.toContain("Lane Assurance");
    expect(serialized).not.toContain("Cryolane");
    expect(serialized).toContain("valueDigest");
  });
});

describe("validateCampaignThesis", () => {
  it("accepts a supported thesis with a missing whyNow", () => {
    const input = thesisInput();
    const { thesis } = compileCampaignThesis({
      ...input,
      proposals: { ...input.proposals, whyNow: { claimIds: [] } }
    });

    expect(validateCampaignThesis(thesis, productSolutionRequirement)).toEqual({
      valid: true,
      issues: []
    });
  });

  it("reports a missing required field with a reason code instead of filling it in", () => {
    const input = thesisInput();
    const { thesis } = compileCampaignThesis({
      ...input,
      proposals: { ...input.proposals, promise: { claimIds: [] } }
    });
    const validation = validateCampaignThesis(thesis, productSolutionRequirement);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain("missing_required_thesis_field_promise");
    expect(thesis.promise.value).toBeUndefined();
  });

  it("allows an unsupported proof only where the recipe permits a validation question", () => {
    const input = thesisInput();
    const { thesis } = compileCampaignThesis({
      ...input,
      proposals: { ...input.proposals, proof: { claimIds: [] } }
    });

    expect(validateCampaignThesis(thesis, productSolutionRequirement).valid).toBe(true);
    expect(
      validateCampaignThesis(thesis, {
        ...productSolutionRequirement,
        proofPolicy: "evidence-required"
      }).issues
    ).toContain("missing_required_thesis_field_proof");
  });

  it("rejects a value that no evidence supports", () => {
    const { thesis } = compileCampaignThesis(thesisInput());
    const invented = {
      ...thesis,
      proof: { ...thesis.proof, value: "Cut excursions by 63 percent.", evidenceRefs: [] }
    };

    expect(validateCampaignThesis(invented, productSolutionRequirement).issues).toContain(
      "unsupported_thesis_field_value_proof"
    );
  });
});
