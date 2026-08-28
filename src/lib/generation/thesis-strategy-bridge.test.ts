import { describe, expect, it } from "vitest";

import { compileCampaignThesis } from "@/lib/generation/campaign-thesis";
import type {
  CampaignThesis,
  ThesisEvidenceClaim,
  ThesisEvidenceInput,
  ThesisFieldProposal,
  ThesisFieldRole
} from "@/lib/generation/campaign-thesis";
import { rankMessageFrameworks } from "@/lib/generation/message-spine";
import type { FamilyArgumentBaseline } from "@/lib/generation/message-strategy-compiler";
import { selectPageRecipe } from "@/lib/generation/page-recipes";
import {
  REQUIRED_ARGUMENT_KINDS,
  compileThesisStrategy,
  compilerLedgerFromThesisEvidence,
  thesisStrategyReceipt
} from "@/lib/generation/thesis-strategy-bridge";
import type { ThesisStrategyInput } from "@/lib/generation/thesis-strategy-bridge";

const ALL_USES = ["hero", "credibility", "urgency", "choice", "mechanism", "team", "cta"] as const;
const revision = 7;

const ranking = rankMessageFrameworks({
  motion: "product",
  audience: "Cold-chain lane planners at pharma distributors",
  objective: "Book a lane audit",
  cta: "Book a lane audit",
  offerMaturity: "confirmed",
  proofDensity: "moderate",
  contentVolume: "standard",
  decisionComplexity: "high"
});

function claim(id: string, text: string, overrides: Partial<ThesisEvidenceClaim> = {}): ThesisEvidenceClaim {
  return {
    id,
    claim: text,
    status: "fact",
    confidence: "high",
    allowedUses: [...ALL_USES],
    prohibitedUses: [],
    buyerFacing: true,
    ...overrides
  };
}

const evidence: ThesisEvidenceInput = {
  revision,
  entities: [
    { id: "en-seller", kind: "seller", canonicalName: "Cryolane", aliases: ["Cryolane Logistics"] },
    { id: "en-offer", kind: "offer", canonicalName: "Lane Assurance" }
  ],
  claims: [
    claim("ev-seller", "Cryolane publishes validated pharma lane documentation."),
    claim("ev-offer", "Cryolane documents Lane Assurance for validated pharma lanes."),
    claim(
      "ev-excursions",
      "Cryolane quality logs recorded excursions above eight degrees on twelve of forty pharma lanes."
    ),
    claim(
      "ev-telemetry",
      "Lane Assurance samples reefer telemetry on every validated lane segment at four minute intervals.",
      { status: "inference", confidence: "high" }
    ),
    claim("ev-audience", "Cold-chain lane planners own the validated pharma lane window.", {
      status: "inference",
      confidence: "medium"
    }),
    claim("ev-cta", "Cryolane offers a documented lane audit engagement.", {
      status: "inference",
      confidence: "medium"
    })
  ],
  gaps: ["No published pricing for Lane Assurance."]
};

const specificProposals: Partial<Record<ThesisFieldRole, ThesisFieldProposal>> = {
  seller: { value: "Cryolane", claimIds: ["ev-seller"] },
  offer: { value: "Lane Assurance", claimIds: ["ev-offer"] },
  audience: { value: "Cold-chain lane planners", claimIds: ["ev-audience"] },
  audienceJob: {
    value: "Hold every validated pharma lane inside its temperature window without manual dock checks.",
    claimIds: ["ev-audience"]
  },
  currentState: {
    value: "Excursions surface after the pallet lands rather than while the reefer is still moving.",
    claimIds: ["ev-excursions"]
  },
  desiredOutcome: {
    value: "Book a lane audit on the two lanes carrying the most excursions.",
    claimIds: ["ev-offer"]
  },
  promise: {
    value: "Lane Assurance keeps every validated pharma lane inside its temperature window dock to dock.",
    claimIds: ["ev-offer", "ev-telemetry"]
  },
  mechanism: {
    value:
      "Lane Assurance reads reefer telemetry at each lane segment, flags a drifting compressor before the pallet warms, and reroutes through the nearest validated cross-dock.",
    claimIds: ["ev-telemetry"]
  },
  proof: {
    value: "Quality logs recorded excursions above eight degrees on twelve of forty pharma lanes.",
    claimIds: ["ev-excursions"]
  },
  objection: {
    value: "Retrofitting telemetry onto leased reefers before the audit.",
    claimIds: ["ev-telemetry"]
  },
  nextAction: {
    value: "Book a lane audit for the two lanes carrying the most excursions.",
    claimIds: ["ev-cta"]
  }
};

const baseline: FamilyArgumentBaseline = {
  promise:
    "Lane Assurance keeps every validated pharma lane inside its temperature window from dock to dock.",
  mechanism:
    "Lane Assurance reads reefer telemetry at each lane segment, flags a drifting compressor before the pallet warms, and reroutes the load through the nearest validated cross-dock.",
  decisionHelp: "Compare the flagged lanes against your own excursion log before committing budget.",
  nextAction: "Book a lane audit for the two lanes carrying the most excursions.",
  tension: "Excursions are found after the pallet lands rather than while it is still moving."
};

function thesisFrom(
  overrides: Partial<Record<ThesisFieldRole, ThesisFieldProposal>> = {},
  evidenceOverride: ThesisEvidenceInput = evidence
): CampaignThesis {
  return compileCampaignThesis({
    revision,
    evidence: evidenceOverride,
    proposals: { ...specificProposals, ...overrides }
  }).thesis;
}

function strategyInput(overrides: Partial<ThesisStrategyInput> = {}): ThesisStrategyInput {
  return {
    thesis: thesisFrom(),
    evidence,
    recipeId: "product-solution",
    ranking,
    family: "launch",
    baseline,
    ctaLabel: "Book a lane audit",
    objective: "Book a lane audit",
    ...overrides
  };
}

describe("compilerLedgerFromThesisEvidence", () => {
  it("excludes unknown and internal claims and preserves upstream permissions", () => {
    const ledger = compilerLedgerFromThesisEvidence({
      ...evidence,
      claims: [
        ...evidence.claims,
        claim("ev-internal", "Internal note about the excursion backlog.", { buyerFacing: false }),
        claim("ev-open", "Unresolved question about lane coverage.", { status: "unknown" })
      ]
    });

    expect(ledger.map(({ id }) => id)).not.toContain("ev-internal");
    expect(ledger.map(({ id }) => id)).not.toContain("ev-open");
    expect(ledger.find(({ id }) => id === "ev-telemetry")).toMatchObject({
      kind: "inference",
      confidence: "high"
    });
  });

  it("keeps a prohibition the graph declared", () => {
    const ledger = compilerLedgerFromThesisEvidence({
      ...evidence,
      claims: evidence.claims.map((item) =>
        item.id === "ev-excursions" ? { ...item, prohibitedUses: ["proof-point"] } : item
      )
    });

    expect(ledger.find(({ id }) => id === "ev-excursions")?.prohibitedUses).toEqual(["proof-point"]);
  });
});

describe("compileThesisStrategy", () => {
  it("compiles the three required arguments and selects one", () => {
    const selection = compileThesisStrategy(strategyInput());
    const complete = selection.records.filter((record) => record.hardFailures.length === 0);

    for (const kind of REQUIRED_ARGUMENT_KINDS) {
      expect(complete.map(({ argumentKind }) => argumentKind)).toContain(kind);
    }
    expect(selection.selected).toBeDefined();
    expect(selection.selectedId).toBe(selection.selected?.id);
    expect(selection.rejectedIds).not.toContain(selection.selectedId);
    expect(selection.visibility).toBe("internal");

    const winner = selection.records.find(({ candidateId }) => candidateId === selection.selectedId);
    expect(winner?.total).toBeGreaterThan(0);
    expect(Object.keys(winner?.dimensions ?? {})).toContain("audienceRelevance");
    expect(winner?.reasonCodes.length).toBeGreaterThan(0);
  });

  it("keeps the losing arguments and their dimension results", () => {
    const selection = compileThesisStrategy(strategyInput());

    expect(selection.rejectedIds.length).toBeGreaterThanOrEqual(2);
    for (const id of selection.rejectedIds) {
      const record = selection.records.find(({ candidateId }) => candidateId === id);
      expect(record).toBeDefined();
      expect(record!.hardFailures.length > 0 || typeof record!.total === "number").toBe(true);
    }
  });

  it("hard-fails a candidate citing prohibited evidence use before ranking", () => {
    const prohibited: ThesisEvidenceInput = {
      ...evidence,
      claims: evidence.claims.map((item) =>
        item.id === "ev-excursions"
          ? { ...item, prohibitedUses: ["declarative-claim", "urgency-claim"] }
          : item
      )
    };
    const selection = compileThesisStrategy(
      strategyInput({ thesis: thesisFrom({}, prohibited), evidence: prohibited })
    );
    const blocked = selection.records.filter((record) =>
      record.hardFailures.includes("prohibited_evidence_use")
    );

    expect(blocked.length).toBeGreaterThan(0);
    for (const record of blocked) {
      expect(record.total).toBeUndefined();
      expect(record.dimensions).toBeUndefined();
      expect(record.reasonCodes).toContain("hard_failure_prohibited_evidence_use");
    }
    expect(selection.selectedId).not.toBe(blocked[0]!.candidateId);
    expect(selection.reasonCodes).toContain("rejected_prohibited_evidence_use");
  });

  it("hard-fails everything when a required thesis field is missing", () => {
    const selection = compileThesisStrategy(
      strategyInput({ thesis: thesisFrom({ mechanism: { claimIds: [] } }) })
    );

    expect(selection.selected).toBeUndefined();
    expect(selection.candidates).toEqual([]);
    expect(selection.reasonCodes).toContain("hard_failure_missing_required_thesis_field");
    expect(selection.reasonCodes).toContain("missing_required_thesis_field_mechanism");
  });

  it("hard-fails an argument whose seller is not the resolved identity", () => {
    const selection = compileThesisStrategy(
      strategyInput({ thesis: thesisFrom({ seller: { value: "Northwind Cold", claimIds: ["ev-seller"] } }) })
    );

    expect(selection.selected).toBeUndefined();
    for (const record of selection.records) {
      expect(record.hardFailures).toContain("wrong_identity");
    }
  });

  it("ranks a deliberately generic argument below a specific one", () => {
    const specific = compileThesisStrategy(strategyInput());
    const generic = compileThesisStrategy(
      strategyInput({
        thesis: thesisFrom({
          promise: { value: "Lane Assurance helps teams do more.", claimIds: ["ev-offer"] },
          mechanism: { value: "Lane Assurance helps teams do more.", claimIds: ["ev-telemetry"] }
        }),
        baseline: {
          ...baseline,
          promise: "Lane Assurance helps teams do more.",
          mechanism: "Lane Assurance helps teams do more."
        }
      })
    );

    const specificWinner = specific.records.find(
      ({ candidateId }) => candidateId === specific.selectedId
    );
    const genericWinner = generic.records.find(
      ({ candidateId }) => candidateId === generic.selectedId
    );

    expect(specificWinner?.total).toBeDefined();
    expect(genericWinner?.total ?? 0).toBeLessThan(specificWinner!.total!);
  });

  it("is deterministic across thesis, strategy, and recipe selection", () => {
    const runOnce = () => {
      const compilation = compileCampaignThesis({
        revision,
        evidence,
        proposals: specificProposals
      });
      const strategy = compileThesisStrategy(strategyInput({ thesis: compilation.thesis }));
      const recipe = selectPageRecipe({
        thesis: compilation.thesis,
        signals: { useCase: "campaign", campaignType: "product", strategicFamily: "launch" }
      });
      return { compilation, strategy, recipe };
    };

    const first = runOnce();
    const second = runOnce();

    expect(second.compilation).toEqual(first.compilation);
    expect(second.compilation.digest).toBe(first.compilation.digest);
    expect(second.strategy).toEqual(first.strategy);
    expect(second.strategy.selectedId).toBe(first.strategy.selectedId);
    expect(second.strategy.digest).toBe(first.strategy.digest);
    expect(second.recipe).toEqual(first.recipe);
    expect(second.recipe.digest).toBe(first.recipe.digest);
  });
});

describe("thesisStrategyReceipt", () => {
  it("carries ids, dimensions, and codes but no argument or claim text", () => {
    const selection = compileThesisStrategy(strategyInput());
    const serialized = JSON.stringify(thesisStrategyReceipt(selection));

    expect(serialized).not.toContain("Lane Assurance");
    expect(serialized).not.toContain("reefer telemetry");
    expect(serialized).not.toContain("Cryolane");
    expect(serialized).toContain(selection.thesisDigest);
    expect(serialized).toContain(selection.digest);
    expect(serialized).toContain("audienceRelevance");
  });
});
