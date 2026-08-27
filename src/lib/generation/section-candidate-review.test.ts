import { describe, expect, it } from "vitest";

import {
  copySimilarity,
  evaluateCandidate,
  selectSectionCopy,
  NEAR_DUPLICATE_THRESHOLD
} from "@/lib/generation/section-candidate-review";
import {
  buildSectionWritingContracts,
  type SectionStrategyBinding
} from "@/lib/generation/section-writing-contract";
import {
  sectionCopyWordCount,
  type SectionCopyCandidate
} from "@/lib/generation/section-copy-types";
import type { SectionEvidenceClaim, SectionWriterBrief } from "@/lib/generation/section-copy-types";
import type {
  SectionRoleV2,
  SectionSlotV2,
  WireframeDecisionV2
} from "@/lib/generation/three-family-contract";

const revision = 5;

const brief: SectionWriterBrief = {
  audience: "Plant reliability managers",
  promise: "Fewer unplanned line stops",
  mechanism: "Vibration thresholds tied to work orders",
  proofPlan: "Published reliability benchmark",
  decisionHelp: "Compare against your current maintenance interval",
  nextAction: "Book a working session",
  unknowns: []
};

const evidence: SectionEvidenceClaim[] = [
  {
    id: "ev-seller-1",
    text: "Reliability teams reported 30% fewer unplanned stops in the first quarter.",
    confidence: 0.9,
    revision,
    sourceRole: "seller"
  },
  {
    id: "ev-seller-2",
    text: "Work orders open automatically when a vibration threshold is crossed.",
    confidence: 0.85,
    revision,
    sourceRole: "seller"
  }
];

function slot(
  id: string,
  role: SectionRoleV2,
  overrides: Partial<SectionSlotV2> = {}
): SectionSlotV2 {
  return {
    id,
    role,
    navigationLabel: id,
    buyerJob: `Understand ${id}`,
    claimType: "fact",
    requiredEvidenceKinds: ["seller_fact"],
    optional: false,
    wordBudget: { headline: [4, 12], body: [10, 60] },
    visualRole: "evidence-type",
    ...overrides
  } as SectionSlotV2;
}

const strategy: SectionStrategyBinding = {
  slots: {
    bigIdea: "Stop the line stopping",
    audienceJob: "Keep the plant running through the quarter",
    tension: "Maintenance intervals are set by calendar, not condition",
    promise: "Fewer unplanned line stops",
    mechanism: "Vibration thresholds tied to work orders",
    proofPlan: "Published reliability benchmark",
    objectionPlan: "Answer the retrofit question with the sensor list",
    ctaLogic: "Book a working session",
    whyNow: "Before the next shutdown window"
  },
  jobsBySectionId: { opening: ["big-idea"], mechanism: ["mechanism"] },
  audienceLabel: "Plant reliability managers",
  offerLabel: "Predictive maintenance programme"
};

function contractsFor(
  plan: readonly SectionSlotV2[],
  binding?: SectionStrategyBinding
) {
  return buildSectionWritingContracts({
    sessionId: "review-fixture",
    revision,
    decision: {
      version: 2,
      sessionId: "review-fixture",
      revision,
      family: "launch",
      subtype: "solution",
      confidence: "high",
      factors: [],
      evidenceRefs: ["ev-seller-1"],
      sectionPlan: plan,
      reasonCode: "fixture",
      locked: true
    } as WireframeDecisionV2,
    brief,
    evidence,
    ...(binding ? { strategy: binding } : {})
  });
}

function candidate(
  sectionId: string,
  headline: string,
  body: string,
  overrides: Partial<SectionCopyCandidate> = {}
): SectionCopyCandidate {
  const base: SectionCopyCandidate = {
    sectionId,
    role: "hero",
    family: "launch",
    v2Role: "buyer-outcome",
    claimType: "fact",
    status: "complete",
    headline,
    body,
    evidenceRefs: ["ev-seller-1"],
    wordCount: 0,
    ...overrides
  };
  return { ...base, wordCount: sectionCopyWordCount(base) };
}

describe("deterministic candidate evaluation", () => {
  it("accepts a candidate that satisfies its contract and cites scoped evidence", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Fewer unplanned line stops this quarter",
        "Vibration thresholds open work orders before a bearing fails, so the line keeps running."
      ),
      0
    );

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.rejections).toEqual([]);
    expect(evaluation.score).toBeGreaterThan(0);
  });

  it("rejects a numeric claim that no cited evidence supports", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Cut unplanned stops by 82% this quarter",
        "Vibration thresholds open work orders before a bearing fails, so the line keeps running."
      ),
      0
    );

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.rejections).toContain("unsupported_claim");
  });

  it("accepts a figure that the cited evidence actually states", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Reliability teams saw 30% fewer stops",
        "Vibration thresholds open work orders before a bearing fails, so the line keeps running."
      ),
      0
    );

    expect(evaluation.rejections).not.toContain("unsupported_claim");
  });

  it("rejects copy that exposes internal build vocabulary", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Decision Lens 2 for reliability leads",
        "Vibration thresholds open work orders before a bearing fails, so the line keeps running."
      ),
      0
    );

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.rejections).toContain("banned_internal_phrase");
  });

  it("rejects a candidate that violates its word budget", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate("opening", "Too short", "Short."),
      0
    );

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.rejections).toContain("contract_violation");
    expect(evaluation.score).toBe(0);
  });

  it("scores identically across repeated evaluations of the same candidate", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const subject = candidate(
      "opening",
      "Fewer unplanned line stops this quarter",
      "Vibration thresholds open work orders before a bearing fails, so the line keeps running."
    );

    expect(evaluateCandidate(contract!, subject, 0).score).toBe(
      evaluateCandidate(contract!, subject, 0).score
    );
  });
});

describe("cross-section review", () => {
  it("keeps the earlier section and rejects near-duplicate later copy", () => {
    const contracts = contractsFor([
      slot("opening", "buyer-outcome"),
      slot("mechanism", "mechanism")
    ]);
    const shared =
      "Vibration thresholds open work orders before a bearing fails, so the production line keeps running.";

    const selections = selectSectionCopy([
      {
        contract: contracts[0]!,
        candidates: [candidate("opening", "Fewer unplanned line stops", shared)]
      },
      {
        contract: contracts[1]!,
        candidates: [
          candidate("mechanism", "How the thresholds work", shared, {
            role: "mechanism",
            v2Role: "mechanism"
          })
        ]
      }
    ]);

    expect(selections[0]!.candidate).toBeDefined();
    expect(selections[1]!.candidate).toBeUndefined();
    expect(selections[1]!.selectionReasons).toContain("duplicate_across_sections");
  });

  it("prefers the second candidate when the first duplicates an earlier section", () => {
    const contracts = contractsFor([
      slot("opening", "buyer-outcome"),
      slot("mechanism", "mechanism")
    ]);
    const shared =
      "Vibration thresholds open work orders before a bearing fails, so the production line keeps running.";

    const selections = selectSectionCopy([
      {
        contract: contracts[0]!,
        candidates: [candidate("opening", "Fewer unplanned line stops", shared)]
      },
      {
        contract: contracts[1]!,
        candidates: [
          candidate("mechanism", "How the thresholds work", shared, {
            role: "mechanism",
            v2Role: "mechanism"
          }),
          candidate(
            "mechanism",
            "How the thresholds work",
            "Each sensor reports amplitude every minute and the maintenance queue reorders itself automatically.",
            { role: "mechanism", v2Role: "mechanism" }
          )
        ]
      }
    ]);

    expect(selections[1]!.candidate?.body).toContain("Each sensor reports amplitude");
    expect(selections[1]!.selectedIndex).toBe(1);
  });

  it("reviews sections in contract order regardless of input order", () => {
    const contracts = contractsFor([
      slot("opening", "buyer-outcome"),
      slot("mechanism", "mechanism")
    ]);
    const shared =
      "Vibration thresholds open work orders before a bearing fails, so the production line keeps running.";

    const selections = selectSectionCopy([
      {
        contract: contracts[1]!,
        candidates: [
          candidate("mechanism", "How the thresholds work", shared, {
            role: "mechanism",
            v2Role: "mechanism"
          })
        ]
      },
      {
        contract: contracts[0]!,
        candidates: [candidate("opening", "Fewer unplanned line stops", shared)]
      }
    ]);

    expect(selections.map(({ sectionId }) => sectionId)).toEqual(["opening", "mechanism"]);
    expect(selections[0]!.candidate).toBeDefined();
    expect(selections[1]!.candidate).toBeUndefined();
  });

  it("treats unrelated copy as distinct", () => {
    const similarity = copySimilarity(
      "Vibration thresholds open work orders before a bearing fails.",
      "Book a working session with the reliability engineering team."
    );

    expect(similarity).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
  });

  it("rejects a later section that repeats one claim under the duplicate threshold", () => {
    const contracts = contractsFor([
      slot("opening", "buyer-outcome"),
      slot("mechanism", "mechanism")
    ]);
    const repeated =
      "Work orders open automatically when a vibration threshold is crossed.";

    const selections = selectSectionCopy([
      {
        contract: contracts[0]!,
        candidates: [
          candidate(
            "opening",
            "Fewer unplanned line stops",
            `${repeated} Reliability managers keep the quarter's schedule intact.`
          )
        ]
      },
      {
        contract: contracts[1]!,
        candidates: [
          candidate("mechanism", "How the thresholds work", repeated, {
            role: "mechanism",
            v2Role: "mechanism"
          })
        ]
      }
    ]);

    expect(
      copySimilarity(selections[0]!.candidate!.body!, repeated)
    ).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
    expect(selections[1]!.candidate).toBeUndefined();
    expect(selections[1]!.selectionReasons).toContain("duplicate_claim_across_sections");
  });

  it("repairs a candidate once by dropping the sentence an earlier section used", () => {
    const contracts = contractsFor([
      slot("opening", "buyer-outcome"),
      slot("mechanism", "mechanism", { wordBudget: { headline: [4, 12], body: [8, 60] } })
    ]);
    const repeated =
      "Work orders open automatically when a vibration threshold is crossed.";

    const selections = selectSectionCopy([
      {
        contract: contracts[0]!,
        candidates: [
          candidate(
            "opening",
            "Fewer unplanned line stops",
            `${repeated} Reliability managers keep the quarter's schedule intact.`
          )
        ]
      },
      {
        contract: contracts[1]!,
        candidates: [
          candidate(
            "mechanism",
            "How the thresholds work",
            `${repeated} Each sensor reports amplitude every minute and the maintenance queue reorders itself.`,
            { role: "mechanism", v2Role: "mechanism" }
          )
        ]
      }
    ]);

    expect(selections[1]!.repaired).toBe(true);
    expect(selections[1]!.candidate?.body).not.toContain("Work orders open automatically");
    expect(selections[1]!.candidate?.body).toContain("Each sensor reports amplitude");
  });

  it("omits an optional section rather than filling it to reach a section count", () => {
    const contracts = contractsFor([
      slot("opening", "buyer-outcome"),
      slot("extra", "proof", { optional: true })
    ]);
    const shared =
      "Vibration thresholds open work orders before a bearing fails, so the production line keeps running.";

    const selections = selectSectionCopy([
      {
        contract: contracts[0]!,
        candidates: [candidate("opening", "Fewer unplanned line stops", shared)]
      },
      {
        contract: contracts[1]!,
        candidates: [
          candidate("extra", "Proof it holds up", shared, {
            role: "proof",
            v2Role: "proof"
          })
        ]
      }
    ]);

    expect(selections[1]!.candidate?.status).toBe("omitted");
    expect(selections[1]!.candidate?.omissionReason).toBe("unsupported_optional_slot");
    expect(selections[1]!.selectionReasons).toContain("omitted_rather_than_filled");
  });
});

describe("strategy-bound specificity review", () => {
  it("gives a role only the strategy slots its job needs", () => {
    const [opening, mechanism] = contractsFor(
      [slot("opening", "buyer-outcome"), slot("mechanism", "mechanism")],
      strategy
    );

    expect(Object.keys(opening!.strategySlots).sort()).toEqual([
      "audienceJob",
      "bigIdea",
      "promise"
    ]);
    expect(Object.keys(mechanism!.strategySlots).sort()).toEqual(["mechanism", "promise"]);
    expect(opening!.strategyJobs).toEqual(["big-idea"]);
  });

  it("rejects a section that owns the audience job but names no audience", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")], strategy);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Better outcomes for everyone",
        "Teams everywhere get more done with less effort across the whole business."
      ),
      0
    );

    expect(evaluation.rejections).toContain("audience_free_claim");
  });

  it("keeps the evidence-specific alternative that names its audience and offer", () => {
    const [contract] = contractsFor([slot("mechanism", "mechanism")], strategy);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "mechanism",
        "How the maintenance programme works",
        "The predictive maintenance programme opens a work order the moment a vibration threshold is crossed.",
        { role: "mechanism", v2Role: "mechanism", evidenceRefs: ["ev-seller-2"] }
      ),
      0
    );

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.rejections).toEqual([]);
  });

  it("rejects a section that argues the offer without ever naming it", () => {
    const [contract] = contractsFor([slot("mechanism", "mechanism")], strategy);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "mechanism",
        "How it works",
        "A threshold is crossed and then the right people are told about it right away.",
        { role: "mechanism", v2Role: "mechanism", evidenceRefs: [] }
      ),
      0
    );

    expect(evaluation.rejections).toContain("offer_free_claim");
  });

  it("rejects placeholder scaffolding that survived into copy", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Fewer unplanned line stops",
        "TODO: describe how vibration thresholds open work orders for {{company}} before failure."
      ),
      0
    );

    expect(evaluation.rejections).toContain("placeholder_language");
  });

  it("rejects a rank claim no cited evidence can support", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "The only reliability platform that works",
        "Guaranteed to be the fastest way to open a work order before a bearing fails."
      ),
      0
    );

    expect(evaluation.rejections).toContain("unsupported_superlative");
  });

  it("judges specificity only when a strategy was bound", () => {
    const [contract] = contractsFor([slot("opening", "buyer-outcome")]);
    const evaluation = evaluateCandidate(
      contract!,
      candidate(
        "opening",
        "Better outcomes for everyone",
        "Vibration thresholds open work orders before a bearing fails, so the line keeps running."
      ),
      0
    );

    expect(contract!.strategySubject).toBeUndefined();
    expect(evaluation.rejections).toEqual([]);
  });
});
