import { describe, expect, it } from "vitest";

import { rankMessageFrameworks } from "@/lib/generation/message-spine";
import {
  compileMessageStrategyCandidates,
  compileMessagingArtifact,
  compileMessagingPagePlan,
  evaluateMessageStrategy,
  productionArgumentFromStrategy,
  selectMessageStrategy
} from "@/lib/generation/message-strategy-compiler";
import type {
  CompileMessagingArtifactInput,
  FamilyArgumentBaseline,
  StrategyEvaluationContext
} from "@/lib/generation/message-strategy-compiler";
import {
  MESSAGE_STRATEGY_ANGLES,
  MESSAGE_STRATEGY_VERSION,
  STRATEGY_DIMENSION_WEIGHTS,
  STRATEGY_EVALUATION_DIMENSIONS,
  compilerEvidencePermissions,
  validateMessagingCompilerArtifact
} from "@/lib/generation/messaging-compiler-contracts";
import type {
  CompilerEvidenceConfidence,
  CompilerEvidenceItem,
  CompilerEvidenceKind,
  MessageStrategyCandidate
} from "@/lib/generation/messaging-compiler-contracts";
import type { RequiredProductionArgument } from "@/lib/generation/production-message-spine";
import { defaultSectionPlanV2 } from "@/lib/generation/three-family-contract";
import type { SectionRoleV2, SectionSlotV2 } from "@/lib/generation/three-family-contract";

const revision = 1_204;

const ranking = rankMessageFrameworks({
  motion: "account",
  audience: "Cold-chain lane planners at pharma distributors",
  objective: "Book a lane audit",
  cta: "Book a lane audit",
  offerMaturity: "confirmed",
  proofDensity: "moderate",
  contentVolume: "standard",
  decisionComplexity: "high"
});

const frameworkOrder = [ranking.selected.id, ...ranking.alternatives.map(({ id }) => id)];

const laneAuditClaim =
  "Northbridge quality logs recorded excursions above eight degrees on twelve of forty pharma lanes.";

const zeroedDimensions = STRATEGY_EVALUATION_DIMENSIONS.map(() => 0);

function ledgerItem(
  id: string,
  kind: CompilerEvidenceKind,
  confidence: CompilerEvidenceConfidence,
  overrides: Partial<CompilerEvidenceItem> = {}
): CompilerEvidenceItem {
  return {
    id,
    kind,
    claim: laneAuditClaim,
    sourceAuthority: "seller-official",
    sourceRef: `https://cryolane.example/${id}`,
    confidence,
    ...compilerEvidencePermissions(kind, confidence),
    ...overrides
  };
}

const ledger: CompilerEvidenceItem[] = [
  ledgerItem("ev-lane-audit", "fact", "high"),
  ledgerItem("ev-reefer-telemetry", "fact", "medium", {
    claim:
      "Cryolane reefer telemetry samples every validated lane segment at four minute intervals."
  }),
  ledgerItem("brief:audience", "visitor-context", "high", {
    claim:
      "Buyer audience and owned job: Cold-chain lane planners, keep pharma freight inside its window."
  })
];

const baseline: FamilyArgumentBaseline = {
  promise:
    "Lane Assurance keeps every validated pharma lane inside its temperature window from dock to dock.",
  mechanism:
    "Lane Assurance reads reefer telemetry at each lane segment, flags a drifting compressor before the pallet warms, and reroutes the load through the nearest validated cross-dock.",
  decisionHelp:
    "Compare the flagged lanes against your own excursion log before committing any budget.",
  nextAction: "Book a lane audit for the two lanes carrying the most excursions.",
  tension: "Excursions are found after the pallet lands rather than while it is still moving."
};

function compilerInput(
  overrides: Partial<CompileMessagingArtifactInput> = {}
): CompileMessagingArtifactInput {
  return {
    ranking,
    family: "launch",
    baseline,
    ledger,
    sellerName: "Cryolane",
    targetName: "Northbridge Pharma",
    offer: "Lane Assurance",
    audienceLabel: "Cold-chain lane planners",
    audienceJob:
      "Hold every validated pharma lane inside its temperature window without adding manual dock checks.",
    objective: "Book a lane audit",
    ctaLabel: "Book a lane audit",
    unknowns: [],
    briefRevision: revision,
    sectionPlan: defaultSectionPlanV2("launch"),
    ...overrides
  };
}

function evaluationContext(
  overrides: Partial<StrategyEvaluationContext> = {}
): StrategyEvaluationContext {
  return {
    ledger,
    offer: "Lane Assurance",
    audienceLabel: "Cold-chain lane planners",
    objective: "Book a lane audit",
    ctaLabel: "Book a lane audit",
    sellerName: "Cryolane",
    ...overrides
  };
}

function strategyCandidate(
  id: string,
  overrides: Partial<MessageStrategyCandidate> = {}
): MessageStrategyCandidate {
  return {
    id,
    version: MESSAGE_STRATEGY_VERSION,
    frameworkId: frameworkOrder[0]!,
    angle: "upside",
    audienceJob:
      "Hold every validated pharma lane inside its temperature window without adding manual dock checks.",
    bigIdea: "Lane Assurance turns a validated pharma lane into the default rather than the exception.",
    promise: baseline.promise,
    mechanism: baseline.mechanism,
    proofPlan: "Lead with the referenced lane audit and state plainly where it stops.",
    objectionPlan: baseline.decisionHelp,
    ctaLogic: baseline.nextAction,
    evidenceRefs: ["ev-lane-audit"],
    unknowns: [],
    ...overrides
  };
}

function sectionSlot(
  id: string,
  role: SectionRoleV2,
  overrides: Partial<SectionSlotV2> = {}
): SectionSlotV2 {
  return {
    id,
    role,
    navigationLabel: id,
    buyerJob: `Judge ${id}`,
    claimType: "fact",
    requiredEvidenceKinds: ["proof"],
    optional: false,
    wordBudget: { headline: [5, 12], body: [25, 60] },
    visualRole: "proof-artifact",
    ...overrides
  };
}

const baseArgument: RequiredProductionArgument = {
  audience: {
    directive: "Address cold-chain lane planners and the lanes they personally sign off.",
    evidenceRefs: ["brief:audience"],
    unknowns: ["Lane count per planner is unknown."]
  },
  promise: {
    directive: "Frame Lane Assurance as a bounded path toward a validated lane.",
    evidenceRefs: ["brief:offer"],
    unknowns: []
  },
  mechanism: {
    directive: "Explain only the supported reefer telemetry positioning.",
    evidenceRefs: ["ev-reefer-telemetry"],
    unknowns: ["Cross-dock integration depth is unknown."]
  },
  proofPlan: {
    directive: "Use the referenced lane audit and nothing else.",
    evidenceRefs: ["ev-lane-audit"],
    unknowns: []
  },
  decisionHelp: {
    directive: "Offer one validation question against the buyer's own excursion log.",
    evidenceRefs: ["brief:objective"],
    unknowns: ["Budget owner for lane remediation is unknown."]
  },
  nextAction: {
    directive: "Book a lane audit.",
    evidenceRefs: ["brief:cta"],
    unknowns: ["Preferred audit window is unknown."]
  }
};

describe("message strategy candidate compilation", () => {
  it("compiles one candidate per angle, each on a framework no other candidate holds", () => {
    const candidates = compileMessageStrategyCandidates(compilerInput());

    expect(candidates).toHaveLength(4);
    expect(candidates.map(({ angle }) => angle)).toEqual([...MESSAGE_STRATEGY_ANGLES]);
    expect(new Set(candidates.map(({ frameworkId }) => frameworkId)).size).toBe(4);
    expect(new Set(candidates.map(({ bigIdea }) => bigIdea)).size).toBe(4);
    expect(new Set(candidates.map(({ proofPlan }) => proofPlan)).size).toBe(4);
  });

  it("compiles and selects the same strategy across repeated runs of one input", () => {
    const first = compileMessageStrategyCandidates(compilerInput());
    const second = compileMessageStrategyCandidates(compilerInput());
    const context = evaluationContext();

    expect(first).toEqual(second);
    expect(selectMessageStrategy(first, context, ranking)).toEqual(
      selectMessageStrategy(second, context, ranking)
    );
    expect(selectMessageStrategy(first, context, ranking).selected?.id).toBe(
      selectMessageStrategy(second, context, ranking).selected?.id
    );
  });

  it("keeps every dimension inside its weight and every total inside a hundred points", () => {
    const context = evaluationContext();

    for (const candidate of compileMessageStrategyCandidates(compilerInput())) {
      const evaluation = evaluateMessageStrategy(candidate, context);

      expect(evaluation.total).toBeGreaterThanOrEqual(0);
      expect(evaluation.total).toBeLessThanOrEqual(100);
      for (const dimension of STRATEGY_EVALUATION_DIMENSIONS) {
        expect(evaluation.dimensions[dimension]).toBeGreaterThanOrEqual(0);
        expect(evaluation.dimensions[dimension]).toBeLessThanOrEqual(
          STRATEGY_DIMENSION_WEIGHTS[dimension]
        );
      }
    }
  });
});

describe("hard failures remove a candidate from selection", () => {
  it("drops every candidate when the baseline next action never names the CTA label", () => {
    const result = compileMessagingArtifact(
      compilerInput({
        baseline: { ...baseline, nextAction: "Talk to the cold-chain network team when convenient." }
      })
    );

    expect(result.selection.selected).toBeUndefined();
    for (const evaluation of result.selection.evaluations) {
      expect(evaluation.hardFailures).toContain("cta_mismatch");
      expect(evaluation.total).toBe(0);
      expect(Object.values(evaluation.dimensions)).toEqual(zeroedDimensions);
    }
  });

  it("drops every candidate when the offer contributes no distinctive term to the argument", () => {
    const result = compileMessagingArtifact(compilerInput({ offer: "Ice" }));

    expect(result.selection.selected).toBeUndefined();
    for (const evaluation of result.selection.evaluations) {
      expect(evaluation.hardFailures).toContain("offer_identity_missing");
      expect(evaluation.total).toBe(0);
      expect(Object.values(evaluation.dimensions)).toEqual(zeroedDimensions);
    }
  });

  it("drops every candidate when the ledger holds no evidence at all", () => {
    const result = compileMessagingArtifact(compilerInput({ ledger: [] }));

    expect(result.selection.selected).toBeUndefined();
    for (const evaluation of result.selection.evaluations) {
      expect(evaluation.hardFailures).toContain("angle_without_supporting_evidence");
      expect(evaluation.total).toBe(0);
      expect(Object.values(evaluation.dimensions)).toEqual(zeroedDimensions);
    }
  });

  it("drops a proof candidate whose only referenced evidence is an inference", () => {
    const context = evaluationContext({
      ledger: [
        ledgerItem("ev-lane-audit", "fact", "high"),
        ledgerItem("ev-route-inference", "inference", "high", {
          claim: "Lane volumes suggest the northern corridor carries the most pharma freight."
        })
      ]
    });
    const selection = selectMessageStrategy(
      [
        strategyCandidate("strategy-proof", {
          angle: "proof",
          evidenceRefs: ["ev-route-inference"]
        }),
        strategyCandidate("strategy-upside")
      ],
      context,
      ranking
    );
    const rejected = selection.evaluations.find(
      ({ candidateId }) => candidateId === "strategy-proof"
    );

    expect(rejected!.hardFailures).toContain("proof_angle_without_proof_evidence");
    expect(rejected!.total).toBe(0);
    expect(Object.values(rejected!.dimensions)).toEqual(zeroedDimensions);
    expect(selection.selected?.id).toBe("strategy-upside");
  });

  it("drops a tension candidate whose tension shares no term with its referenced evidence", () => {
    const selection = selectMessageStrategy(
      [
        strategyCandidate("strategy-tension", {
          angle: "tension",
          tension: "Refrigerated trailers idle at the dock while the paperwork clears."
        }),
        strategyCandidate("strategy-upside")
      ],
      evaluationContext(),
      ranking
    );
    const rejected = selection.evaluations.find(
      ({ candidateId }) => candidateId === "strategy-tension"
    );

    expect(rejected!.hardFailures).toContain("tension_not_evidence_bound");
    expect(rejected!.total).toBe(0);
    expect(Object.values(rejected!.dimensions)).toEqual(zeroedDimensions);
    expect(selection.selected?.id).toBe("strategy-upside");
  });

  it("drops every candidate when the baseline argument is stuffed with swappable vendor language", () => {
    const result = compileMessagingArtifact(
      compilerInput({
        baseline: {
          ...baseline,
          promise:
            "A best-in-class, world-class, industry-leading Lane Assurance programme for pharma freight."
        }
      })
    );

    expect(result.selection.selected).toBeUndefined();
    for (const evaluation of result.selection.evaluations) {
      expect(evaluation.hardFailures).toContain("competitor_swappable_argument");
      expect(evaluation.total).toBe(0);
      expect(Object.values(evaluation.dimensions)).toEqual(zeroedDimensions);
    }
  });
});

describe("stable strategy tie-breaking", () => {
  it("breaks an exact score tie on the framework ranker order", () => {
    const selection = selectMessageStrategy(
      [
        strategyCandidate("strategy-fourth-framework", { frameworkId: frameworkOrder[3]! }),
        strategyCandidate("strategy-second-framework", { frameworkId: frameworkOrder[1]! })
      ],
      evaluationContext(),
      ranking
    );

    expect(selection.evaluations[0]!.total).toBe(selection.evaluations[1]!.total);
    expect(selection.selected?.id).toBe("strategy-second-framework");
  });

  it("breaks a framework rank tie on the fixed angle order", () => {
    const selection = selectMessageStrategy(
      [
        strategyCandidate("strategy-mechanism-angle", { angle: "mechanism" }),
        strategyCandidate("strategy-upside-angle", { angle: "upside" })
      ],
      evaluationContext(),
      ranking
    );

    expect(selection.evaluations[0]!.total).toBe(selection.evaluations[1]!.total);
    expect(new Set(selection.evaluations.map(({ candidateId }) => candidateId)).size).toBe(2);
    expect(selection.selected?.id).toBe("strategy-upside-angle");
  });
});

describe("messaging page plan", () => {
  it("binds each section to exactly one job that no other section claims", () => {
    const [strategy] = compileMessageStrategyCandidates(compilerInput());
    const plan = compileMessagingPagePlan({
      family: "launch",
      sectionPlan: defaultSectionPlanV2("launch"),
      strategy: strategy!
    });
    const jobs = plan.flatMap(({ strategyJobs }) => strategyJobs);

    expect(plan).toHaveLength(6);
    expect(plan.map(({ strategyJobs }) => strategyJobs.length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(new Set(jobs).size).toBe(jobs.length);
  });

  it("falls back to a section-specific support job once the job vocabulary is exhausted", () => {
    const [strategy] = compileMessageStrategyCandidates(compilerInput());
    const sectionPlan = Array.from({ length: 12 }, (_unused, index) =>
      sectionSlot(`proof-${index + 1}`, "proof")
    );
    const plan = compileMessagingPagePlan({ family: "launch", sectionPlan, strategy: strategy! });
    const jobs = plan.flatMap(({ strategyJobs }) => strategyJobs);

    expect(jobs.slice(0, 2)).toEqual(["proof", "objection"]);
    expect(jobs.slice(2)).toEqual(
      Array.from({ length: 10 }, (_unused, index) => `proof-${index + 3}-support`)
    );
    expect(new Set(jobs).size).toBe(jobs.length);
  });
});

describe("production argument mapping", () => {
  const mapped = (strategy: MessageStrategyCandidate) =>
    productionArgumentFromStrategy({ base: baseArgument, strategy, ledger });

  it("emits every required argument role and omits the optional roles the strategy left out", () => {
    const argument = mapped(strategyCandidate("strategy-upside"));

    expect(Object.keys(argument).sort()).toEqual([
      "audience",
      "decisionHelp",
      "mechanism",
      "nextAction",
      "promise",
      "proofPlan"
    ]);
    expect(argument.tension).toBeUndefined();
    expect(argument.whyNow).toBeUndefined();
  });

  it("keeps the base refs for a slot the strategy left at the route's own wording", () => {
    const strategy = strategyCandidate("strategy-upside", {
      promise: baseArgument.promise.directive,
      mechanism: baseArgument.mechanism.directive
    });
    const argument = mapped(strategy);

    for (const role of ["promise", "mechanism"] as const) {
      expect(argument[role].evidenceRefs).toEqual(baseArgument[role].evidenceRefs);
      expect(argument[role].unknowns).toEqual(baseArgument[role].unknowns);
    }
  });

  it("binds a rewritten tension only to referenced evidence about that tension", () => {
    const argument = mapped(
      strategyCandidate("strategy-tension", {
        angle: "tension",
        tension:
          "Excursions above eight degrees surface in the quality logs only after the pallet lands.",
        evidenceRefs: ["ev-lane-audit"]
      })
    );

    expect(argument.tension?.evidenceRefs).toEqual(["ev-lane-audit"]);
    expect(argument.tension?.unknowns).toEqual([]);
  });

  it("never lends a slot the baseline promise and mechanism refs it did not earn", () => {
    const argument = mapped(
      strategyCandidate("strategy-tension", {
        angle: "tension",
        tension:
          "Excursions above eight degrees surface in the quality logs only after the pallet lands.",
        whyNow: "The lane audit window closes before the next validation cycle.",
        proofPlan: "Lead with the excursion count the quality logs recorded across pharma lanes.",
        objectionPlan: "Answer the excursion question with the quality logs themselves.",
        evidenceRefs: ["ev-lane-audit"]
      })
    );

    expect(argument.tension?.evidenceRefs).not.toContain("brief:offer");
    expect(argument.tension?.evidenceRefs).not.toContain("ev-reefer-telemetry");
    expect(argument.whyNow?.evidenceRefs ?? []).not.toContain("brief:offer");
    // Proof and objection keep their own reconciled refs, never the promise or
    // mechanism ones that the earlier mapping handed to every rewritten slot.
    expect(argument.proofPlan.evidenceRefs).toEqual(baseArgument.proofPlan.evidenceRefs);
    expect(argument.decisionHelp.evidenceRefs).toEqual(baseArgument.decisionHelp.evidenceRefs);
    expect(argument.proofPlan.evidenceRefs).not.toContain("brief:offer");
    expect(argument.decisionHelp.evidenceRefs).not.toContain("ev-reefer-telemetry");
  });

  it("drops a rewritten tension whose referenced evidence is about something else", () => {
    const argument = mapped(
      strategyCandidate("strategy-tension", {
        angle: "tension",
        tension: "Manual dock paperwork slows every handover between carriers.",
        evidenceRefs: ["ev-reefer-telemetry"]
      })
    );

    expect(argument.tension).toBeUndefined();
  });

  it("drops a why-now backed only by evidence that may not carry an urgency claim", () => {
    const argument = mapped(
      strategyCandidate("strategy-upside", {
        whyNow:
          "Cold-chain lane planners are committing next quarter's pharma freight window right now.",
        evidenceRefs: ["brief:audience"]
      })
    );

    expect(ledger.find(({ id }) => id === "brief:audience")?.allowedUses).not.toContain("urgency");
    expect(argument.whyNow).toBeUndefined();
  });

  it("says on the proof slot when the strategy found nothing it may present as proof", () => {
    const withProof = mapped(strategyCandidate("strategy-proof", { angle: "proof" }));
    const withoutProof = mapped(
      strategyCandidate("strategy-proof", {
        angle: "proof",
        unknowns: ["No referenced evidence supports a declarative proof claim."]
      })
    );

    expect(withProof.proofPlan.unknowns).toEqual(baseArgument.proofPlan.unknowns);
    expect(withoutProof.proofPlan.unknowns).toContain(
      "No referenced evidence supports a declarative proof claim."
    );
  });

  it("ignores a referenced id that is not in the ledger at all", () => {
    const argument = mapped(
      strategyCandidate("strategy-tension", {
        angle: "tension",
        tension:
          "Excursions above eight degrees surface in the quality logs only after the pallet lands.",
        evidenceRefs: ["ev-lane-audit", "ev-does-not-exist"]
      })
    );

    expect(argument.tension?.evidenceRefs).toEqual(["ev-lane-audit"]);
  });

  it("carries the strategy's own directives into every rewritten slot", () => {
    const strategy = strategyCandidate("strategy-upside");
    const argument = mapped(strategy);

    expect(argument.audience.directive).toBe(strategy.audienceJob);
    expect(argument.promise.directive).toBe(strategy.promise);
    expect(argument.decisionHelp.directive).toBe(strategy.objectionPlan);
    expect(argument.nextAction.directive).toBe(strategy.ctaLogic);
  });
});

describe("messaging artifact assembly", () => {
  it("returns no artifact when every candidate hard-fails its own argument", () => {
    const result = compileMessagingArtifact(compilerInput({ ledger: [] }));

    expect(result.artifact).toBeUndefined();
    expect(result.candidates).toHaveLength(4);
    expect(result.selection.reasonCodes).toContain("no_eligible_strategy");
  });

  it("returns an artifact that passes its own validation on a healthy input", () => {
    const result = compileMessagingArtifact(compilerInput());

    expect(result.artifact).toBeDefined();
    expect(validateMessagingCompilerArtifact(result.artifact!)).toEqual([]);
    expect(result.artifact!.briefRevision).toBe(revision);
    expect(result.artifact!.visibility).toBe("internal");
    expect(result.artifact!.strategies).toHaveLength(4);
    expect(result.artifact!.pagePlan.sectionPlan).toHaveLength(6);
  });
});
