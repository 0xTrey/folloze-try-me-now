import { describe, expect, it } from "vitest";

import {
  editCopyForFactuality,
  type CopyFactualityEditorInput
} from "./copy-factuality-editor";
import { writeExplorationSections } from "./exploration-section-writer";
import { writeMechanismProofSections } from "./mechanism-proof-section-writer";
import { writeOpeningSections } from "./opening-section-writer";
import { writeProblemUrgencySections } from "./problem-urgency-section-writer";
import {
  argumentOrderForFamilyV2,
  compileFamilyProductionMessageSpine,
  writerSlotsFromFamilyMessageSpine,
  type FamilyProductionMessageSpine,
  type RequiredProductionArgument
} from "./production-message-spine";
import {
  boundedCtaV2,
  sectionCopyWordCount,
  type SectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterSlot
} from "./section-copy-types";
import { writeTeamCtaSections } from "./team-cta-section-writer";
import {
  selectThreeFamilyDecision,
  type WireframeDecisionV2,
  type WireframeFamilyV2
} from "./three-family-contract";

const revision = 31;
const startedAt = "2026-08-23T12:00:00.000Z";
const completedAt = "2026-08-23T12:00:01.000Z";

const argument: RequiredProductionArgument = {
  audience: {
    directive: "Address operations leaders evaluating governed workflow fit.",
    evidenceRefs: ["audience"],
    unknowns: []
  },
  tension: {
    directive: "Manual approval handoffs create repeated review work.",
    evidenceRefs: ["tension"],
    unknowns: []
  },
  promise: {
    directive: "Frame Acme FlowGrid as a path to governed workflow approvals.",
    evidenceRefs: ["offer"],
    unknowns: []
  },
  mechanism: {
    directive: "Explain how FlowGrid routes governed approvals to recorded outputs.",
    evidenceRefs: ["mechanism"],
    unknowns: []
  },
  proofPlan: {
    directive: "Use the approved FlowGrid implementation guide.",
    evidenceRefs: ["proof"],
    unknowns: []
  },
  decisionHelp: {
    directive: "Compare workflow ownership, approval rules, and recorded outputs.",
    evidenceRefs: ["audience", "mechanism"],
    unknowns: []
  },
  nextAction: {
    directive: "Book a bounded working session.",
    evidenceRefs: ["visitor"],
    unknowns: []
  },
  whyNow: {
    directive: "A planned workflow review creates a current evaluation point.",
    evidenceRefs: ["target"],
    unknowns: []
  }
};

function decision(family: WireframeFamilyV2): WireframeDecisionV2 {
  if (family === "launch") {
    return selectThreeFamilyDecision({
      sessionId: `session-${family}`,
      revision,
      useCase: "campaign",
      offerKind: "product",
      evidenceRefs: ["offer", "audience", "mechanism", "proof"]
    });
  }
  if (family === "guide") {
    return selectThreeFamilyDecision({
      sessionId: `session-${family}`,
      revision,
      useCase: "content",
      offerKind: "solution",
      evidenceRefs: ["offer", "audience", "mechanism", "proof"]
    });
  }
  return selectThreeFamilyDecision({
    sessionId: `session-${family}`,
    revision,
    useCase: "abm",
    targetDomain: "target.example",
    firstDecision: "Choose the workflow to validate first",
    evidenceRefs: ["offer", "audience", "mechanism", "proof", "target"]
  });
}

function spine(family: WireframeFamilyV2): FamilyProductionMessageSpine {
  const familyDecision = decision(family);
  const artifact = compileFamilyProductionMessageSpine({
    sessionId: familyDecision.sessionId,
    revision,
    activeRevision: revision,
    decision: familyDecision,
    argument,
    startedAt,
    completedAt
  });
  expect(artifact.value).toBeDefined();
  return artifact.value!;
}

function evidenceClaim(
  id: string,
  text: string,
  sourceRole: SectionEvidenceClaim["sourceRole"] = "seller"
): SectionEvidenceClaim {
  return {
    id,
    text,
    confidence: 0.9,
    revision,
    sourceRole
  };
}

function candidate(
  slot: SectionWriterSlot,
  overrides: Partial<SectionCopyCandidate> = {}
): SectionCopyCandidate {
  const result: SectionCopyCandidate = {
    sectionId: slot.id,
    role: slot.role,
    family: slot.family,
    v2Role: slot.v2Role,
    claimType: slot.claimType,
    status: "complete",
    headline: "Acme FlowGrid connects each governed approval step",
    body:
      "Acme FlowGrid coordinates governed workflow approvals, records each approved output, and gives operations leaders a concrete mechanism to compare with current ownership and review requirements.",
    evidenceRefs: [...slot.evidenceRefs],
    wordCount: 0,
    ...overrides
  };
  result.wordCount = sectionCopyWordCount(result);
  return result;
}

function writerArtifact(
  value: readonly SectionCopyCandidate[]
): SectionWriterArtifact {
  return {
    worker: "opening-writer",
    sessionId: "editor-session",
    revision,
    status: "complete",
    value,
    evidenceRefs: [...new Set(value.flatMap(({ evidenceRefs }) => evidenceRefs))],
    confidence: 0.9,
    startedAt,
    completedAt
  };
}

function editorInput(
  slots: readonly SectionWriterSlot[],
  candidates: readonly SectionCopyCandidate[],
  evidence: readonly SectionEvidenceClaim[],
  family: WireframeFamilyV2,
  overrides: Partial<CopyFactualityEditorInput> = {}
): CopyFactualityEditorInput {
  return {
    sessionId: "editor-session",
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots,
    evidence,
    objective: "Evaluate governed workflow fit",
    cta: boundedCtaV2(
      family === "launch" ? "book_meeting" : "book_working_session"
    ),
    familyContext: {
      family,
      sellerName: "Acme",
      ...(family === "align" ? { targetName: "TargetCo" } : {})
    },
    writerArtifacts: [writerArtifact(candidates)],
    ...overrides
  };
}

const commonEvidence = [
  evidenceClaim("audience", "Operations leaders evaluate governed workflow fit."),
  evidenceClaim("tension", "Manual approval handoffs create repeated review work."),
  evidenceClaim(
    "offer",
    "Acme FlowGrid coordinates governed workflow approvals and recorded outputs.",
    "offer"
  ),
  evidenceClaim(
    "mechanism",
    "FlowGrid routes governed approvals to a recorded output for the next owner.",
    "offer"
  ),
  evidenceClaim(
    "proof",
    "The approved FlowGrid guide documents configurable approval stages."
  ),
  evidenceClaim(
    "target",
    "TargetCo publicly describes a planned workflow governance review.",
    "target"
  ),
  evidenceClaim("visitor", "The visitor selected a bounded working session.", "visitor")
];

function writerInputFor(
  family: WireframeFamilyV2,
  worker: SectionWriterInput["worker"]
): SectionWriterInput {
  const compiled = spine(family);
  const selectedCta = boundedCtaV2(
    family === "launch" ? "book_meeting" : "book_working_session"
  );
  return {
    worker,
    sessionId: `writer-${family}`,
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots: writerSlotsFromFamilyMessageSpine(compiled),
    brief: {
      audience: argument.audience.directive,
      promise: argument.promise.directive,
      mechanism: argument.mechanism.directive,
      proofPlan: argument.proofPlan.directive,
      decisionHelp: argument.decisionHelp.directive,
      nextAction: argument.nextAction.directive,
      tension: argument.tension?.directive,
      whyNow: argument.whyNow?.directive,
      unknowns: []
    },
    evidence: commonEvidence,
    objective: "Evaluate governed workflow fit",
    cta: selectedCta
  };
}

describe("approved three-family copy contract", () => {
  it("C01 creates the locked message spine before writer slots", () => {
    const compiled = spine("launch");
    const slots = writerSlotsFromFamilyMessageSpine(compiled);

    expect(compiled.writerBoundary).toEqual({
      messageSpineRequired: true,
      familyLocked: true
    });
    expect(slots.map(({ spineOrder }) => spineOrder)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(slots.map(({ v2Role }) => v2Role)).toEqual(
      compiled.sections.map(({ role }) => role)
    );
  });

  it.each(["launch", "guide", "align"] as const)(
    "keeps %s writer output inside the locked family slots",
    (family) => {
      const artifacts = [
        writeOpeningSections(writerInputFor(family, "opening-writer")),
        writeProblemUrgencySections(
          writerInputFor(family, "problem-urgency-writer")
        ),
        writeExplorationSections(writerInputFor(family, "exploration-writer")),
        writeMechanismProofSections(
          writerInputFor(family, "mechanism-proof-writer")
        ),
        writeTeamCtaSections(writerInputFor(family, "team-cta-writer"))
      ];
      const candidates = artifacts.flatMap((artifact) => artifact.value ?? []);

      expect(artifacts.every(({ status }) => status !== "failed")).toBe(true);
      expect(candidates).toHaveLength(6);
      expect(
        candidates.every((item) => {
          const headlineWords = item.headline?.trim().split(/\s+/).length ?? 0;
          return (
            item.family === family &&
            headlineWords >= 5 &&
            headlineWords <= 12
          );
        })
      ).toBe(true);
      expect(candidates.map(({ v2Role }) => v2Role)).toEqual(
        decision(family).sectionPlan.map(({ role }) => role)
      );
    }
  );

  it("C02 requires evidence for facts and accepts explicit hypotheses", () => {
    const launchSlot = writerSlotsFromFamilyMessageSpine(spine("launch"))[4]!;
    const unsupportedFact = candidate(launchSlot, { evidenceRefs: [] });
    unsupportedFact.wordCount = sectionCopyWordCount(unsupportedFact);
    const factResult = editCopyForFactuality(
      editorInput([launchSlot], [unsupportedFact], commonEvidence, "launch")
    );
    expect(factResult.value?.issueReceipts[0]?.after).toContain(
      "fact_without_evidence"
    );

    const alignSlot = writerSlotsFromFamilyMessageSpine(spine("align"))[0]!;
    const hypothesis = candidate(alignSlot, {
      headline: "TargetCo and Acme can test this shared priority",
      body:
        "For TargetCo, Acme could use a focused working session to test the shared workflow priority, identify open governance questions, and decide which evidence should guide the first validation step.",
      evidenceRefs: []
    });
    hypothesis.wordCount = sectionCopyWordCount(hypothesis);
    const hypothesisResult = editCopyForFactuality(
      editorInput([alignSlot], [hypothesis], commonEvidence, "align")
    );
    expect(hypothesisResult.value?.acceptedSections).toHaveLength(1);
    expect(
      hypothesisResult.value?.claimToEvidence[0]
    ).toMatchObject({ claimType: "hypothesis", evidence: [] });
  });

  it("C03 rejects headlines outside the five-to-twelve-word budget", () => {
    const slot = writerSlotsFromFamilyMessageSpine(spine("launch"))[0]!;
    const draft = candidate(slot, { headline: "Choose workflow fit now" });
    draft.wordCount = sectionCopyWordCount(draft);
    const result = editCopyForFactuality(
      editorInput([slot], [draft], commonEvidence, "launch")
    );
    expect(result.value?.issueReceipts[0]?.after).toContain(
      "headline_word_budget_violation"
    );
  });

  it("C04 rejects a later section that adds no material information", () => {
    const slots = writerSlotsFromFamilyMessageSpine(spine("launch")).slice(0, 2);
    const first = candidate(slots[0]!);
    const second = candidate(slots[1]!, {
      headline: "Acme FlowGrid connects governed approval work clearly",
      body:
        "Acme FlowGrid coordinates governed workflow approvals, records every approved output, and gives operations leaders a concrete mechanism to compare against current ownership and review requirements."
    });
    second.wordCount = sectionCopyWordCount(second);
    const result = editCopyForFactuality(
      editorInput(slots, [first, second], commonEvidence, "launch")
    );
    expect(result.value?.issueReceipts[1]?.after).toContain(
      "insufficient_section_novelty"
    );
  });

  it("C05 runs the competitor-swap rejection gate", () => {
    const slot = writerSlotsFromFamilyMessageSpine(spine("launch"))[1]!;
    const generic = candidate(slot, {
      headline: "Improve the workflow without avoidable review friction",
      body:
        "A coordinated approach could help the team review its process, compare open questions, and choose a practical next step without making unsupported outcome claims.",
      evidenceRefs: []
    });
    generic.wordCount = sectionCopyWordCount(generic);
    const result = editCopyForFactuality(
      editorInput([slot], [generic], commonEvidence, "launch")
    );
    expect(result.value?.issueReceipts[0]?.after).toContain(
      "competitor_swap_risk"
    );
  });

  it("C06 runs the Align account-swap rejection gate", () => {
    const slot = writerSlotsFromFamilyMessageSpine(spine("align"))[0]!;
    const genericAccount = candidate(slot, {
      headline: "Acme FlowGrid supports a shared workflow priority",
      body:
        "Acme FlowGrid coordinates governed workflow approvals and could help a buyer compare ownership, review requirements, and the evidence needed for a first validation decision.",
      evidenceRefs: ["offer"]
    });
    genericAccount.wordCount = sectionCopyWordCount(genericAccount);
    const result = editCopyForFactuality(
      editorInput([slot], [genericAccount], commonEvidence, "align")
    );
    expect(result.value?.issueReceipts[0]?.after).toContain("account_swap_risk");
  });

  it("C07 rejects invented metrics, quotes, deadlines, and urgency", () => {
    const slot = writerSlotsFromFamilyMessageSpine(spine("launch"))[4]!;
    const unsafe = candidate(slot, {
      body:
        'Acme FlowGrid coordinates governed approvals and cuts review time by 40%. A customer said "Every team wins." Act now before the deadline to secure the result.',
      evidenceRefs: ["proof"]
    });
    unsafe.wordCount = sectionCopyWordCount(unsafe);
    const result = editCopyForFactuality(
      editorInput([slot], [unsafe], commonEvidence, "launch")
    );
    expect(result.value?.issueReceipts[0]?.after).toEqual(
      expect.arrayContaining([
        "unsupported_numeric_claim",
        "unsupported_quote",
        "unsupported_urgency"
      ])
    );
  });

  it("C08 permits only the bounded CTA ID and exact label", () => {
    const slot = writerSlotsFromFamilyMessageSpine(spine("guide"))[5]!;
    const unbounded = candidate(slot, {
      headline: "Continue the evaluation with a focused working session",
      body:
        "Use a focused session to compare the available FlowGrid evidence, resolve open workflow questions, and leave with a bounded validation step for the evaluation team.",
      evidenceRefs: [],
      cta: { type: "book-meeting", label: "Talk now" }
    });
    unbounded.wordCount = sectionCopyWordCount(unbounded);
    const result = editCopyForFactuality(
      editorInput([slot], [unbounded], commonEvidence, "guide")
    );
    expect(result.value?.issueReceipts[0]?.after).toEqual(
      expect.arrayContaining(["cta_mismatch", "cta_unbounded"])
    );
  });

  it("C09 produces materially different deterministic family arguments", () => {
    const launch = spine("launch");
    const guide = spine("guide");
    const align = spine("align");

    expect(argumentOrderForFamilyV2("launch")).not.toEqual(
      argumentOrderForFamilyV2("guide")
    );
    expect(argumentOrderForFamilyV2("guide")).not.toEqual(
      argumentOrderForFamilyV2("align")
    );
    expect(
      [launch, guide, align].map((item) =>
        item.sections.map(({ role, argumentRoles }) => ({ role, argumentRoles }))
      )
    ).toEqual([
      expect.arrayContaining([
        expect.objectContaining({ role: "buyer-outcome" }),
        expect.objectContaining({ role: "current-friction" })
      ]),
      expect.arrayContaining([
        expect.objectContaining({ role: "market-change" }),
        expect.objectContaining({ role: "evaluation-criteria" })
      ]),
      expect.arrayContaining([
        expect.objectContaining({ role: "shared-priority" }),
        expect.objectContaining({ role: "account-relevance" })
      ])
    ]);
  });

  it("C10 records issues and bounded repairs without regenerating the page", () => {
    const slot = writerSlotsFromFamilyMessageSpine(spine("launch"))[0]!;
    const repairable = candidate(slot, {
      headline: "Acme FlowGrid connects each governed approval step",
      body:
        "The Launch family uses robust FlowGrid workflow evidence to help operations leaders compare approval ownership, recorded outputs, open questions, and the next practical review step."
    });
    repairable.wordCount = sectionCopyWordCount(repairable);
    const result = editCopyForFactuality(
      editorInput([slot], [repairable], commonEvidence, "launch")
    );
    const receipt = result.value?.issueReceipts[0];

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "copy_factuality_editor_repaired_copy"
    });
    expect(receipt).toMatchObject({
      outcome: "accepted",
      before: expect.arrayContaining([
        "banned_prospect_phrase",
        "generic_filler"
      ]),
      after: []
    });
    expect(receipt?.repairs.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "replaced_banned_prospect_phrase",
        "replaced_generic_filler",
        "recalculated_word_count"
      ])
    );
  });
});
