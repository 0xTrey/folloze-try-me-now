import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  type SectionCopyCandidate,
  type SectionCopyChoice,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterKind,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

import {
  editCopyForFactuality,
  type CopyFactualityEditorInput,
  type CopyFactualityIssueCode
} from "./copy-factuality-editor";

const revision = 19;
const sessionId = "session-copy-editor";
const startedAt = "2026-08-22T18:30:00.000Z";
const completedAt = "2026-08-22T18:30:01.000Z";

function claim(
  id: string,
  text: string,
  overrides: Partial<SectionEvidenceClaim> = {}
): SectionEvidenceClaim {
  return {
    id,
    text,
    confidence: 0.9,
    revision,
    sourceRole: "seller",
    ...overrides
  };
}

function slot(
  id: string,
  role: SectionWriterSlot["role"],
  evidenceRefs: readonly string[] = [],
  overrides: Partial<SectionWriterSlot> = {}
): SectionWriterSlot {
  return {
    id,
    role,
    label: role,
    wordBudget: { min: 1, max: 120 },
    componentSlots: [],
    allowedInteractions: [],
    evidenceRefs,
    required: true,
    ...overrides
  };
}

function candidate(
  sectionSlot: SectionWriterSlot,
  overrides: Partial<SectionCopyCandidate> = {}
): SectionCopyCandidate {
  const result: SectionCopyCandidate = {
    sectionId: sectionSlot.id,
    role: sectionSlot.role,
    status: "complete",
    headline: "Review the supported workflow",
    body: "Compare the current evidence with the stated objective.",
    evidenceRefs: [...sectionSlot.evidenceRefs],
    wordCount: 0,
    ...overrides
  };
  result.wordCount = sectionCopyWordCount(result);
  return result;
}

function artifact(
  worker: SectionWriterKind,
  value: readonly SectionCopyCandidate[],
  overrides: Partial<SectionWriterArtifact> = {}
): SectionWriterArtifact {
  return {
    worker,
    sessionId,
    revision,
    status: "complete",
    value,
    evidenceRefs: [...new Set(value.flatMap((item) => item.evidenceRefs))],
    confidence: 0.9,
    startedAt,
    completedAt,
    ...overrides
  };
}

function input(
  slots: readonly SectionWriterSlot[],
  writerArtifacts: readonly SectionWriterArtifact[],
  evidence: readonly SectionEvidenceClaim[],
  overrides: Partial<CopyFactualityEditorInput> = {}
): CopyFactualityEditorInput {
  return {
    sessionId,
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots,
    evidence,
    objective: "Evaluate workflow fit",
    cta: {
      type: "book-meeting",
      label: "Plan a workflow review"
    },
    writerArtifacts,
    ...overrides
  };
}

function threeChoices(
  evidenceRefs: readonly [string, string, string]
): [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice] {
  return [
    {
      label: "Outcome fit",
      body: "Compare the intended outcome with the first supported point.",
      evidenceRefs: [evidenceRefs[0]]
    },
    {
      label: "Operating fit",
      body: "Compare operating requirements with the second supported point.",
      evidenceRefs: [evidenceRefs[1]]
    },
    {
      label: "Evidence fit",
      body: "Identify what the third supported point establishes.",
      evidenceRefs: [evidenceRefs[2]]
    }
  ];
}

describe("editCopyForFactuality", () => {
  it("accepts clean current-revision copy in slot order and maps claims to evidence", () => {
    const evidence = [
      claim("offer-1", "Acme documents governed workflow stages."),
      claim("path-1", "The guide identifies the intended workflow outcome."),
      claim("path-2", "The guide describes operating requirements."),
      claim("path-3", "The guide lists evidence needed for approval.")
    ];
    const hero = slot("section-1", "hero", ["offer-1"]);
    const pathways = slot("section-2", "pathways", ["path-1", "path-2", "path-3"]);
    const nextAction = slot("section-3", "next-action");
    const pathwayCandidate = candidate(pathways, {
      headline: "Choose what to evaluate first",
      body: "Compare the available evidence before selecting an evaluation focus.",
      choices: threeChoices(["path-1", "path-2", "path-3"]),
      evidenceRefs: ["path-1", "path-2", "path-3"]
    });
    pathwayCandidate.wordCount = sectionCopyWordCount(pathwayCandidate);
    const nextCandidate = candidate(nextAction, {
      headline: "Plan a workflow review",
      body: "Bring the current evidence and open questions into the review.",
      cta: { type: "book-meeting", label: "Plan a workflow review" },
      evidenceRefs: []
    });
    nextCandidate.wordCount = sectionCopyWordCount(nextCandidate);

    const result = editCopyForFactuality(
      input(
        [hero, pathways, nextAction],
        [
          artifact("team-cta-writer", [nextCandidate]),
          artifact("exploration-writer", [pathwayCandidate]),
          artifact("opening-writer", [candidate(hero)])
        ],
        evidence
      )
    );

    expect(result).toMatchObject({
      worker: "copy-factuality-editor",
      sessionId,
      revision,
      status: "complete",
      evidenceRefs: ["offer-1", "path-1", "path-2", "path-3"]
    });
    expect(result.value?.acceptedSections.map(({ sectionId }) => sectionId)).toEqual([
      "section-1",
      "section-2",
      "section-3"
    ]);
    expect(result.value?.omittedSectionIds).toEqual([]);
    expect(result.value?.rejectedSectionIds).toEqual([]);
    expect(result.value?.issueReceipts.every(({ after }) => after.length === 0)).toBe(
      true
    );
    expect(
      result.value?.claimToEvidence.find(
        ({ claimId }) => claimId === "section-1:headline"
      )?.evidence
    ).toEqual([
      {
        id: "offer-1",
        confidence: 0.9,
        sourceRole: "seller"
      }
    ]);
  });

  it("repairs deterministic filler and buyer-facing strategy jargon", () => {
    const evidence = [claim("offer-1", "Acme documents governed workflows.")];
    const hero = slot("section-1", "hero", ["offer-1"]);
    const draft = candidate(hero, {
      headline: "Unlock value with an account thesis",
      body: "Use the decision path to make progress with confidence."
    });
    draft.wordCount = sectionCopyWordCount(draft);

    const result = editCopyForFactuality(
      input([hero], [artifact("opening-writer", [draft])], evidence)
    );
    const receipt = result.value?.issueReceipts[0];

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "copy_factuality_editor_repaired_copy"
    });
    expect(receipt).toMatchObject({
      outcome: "accepted",
      before: ["buyer_facing_jargon", "generic_filler"],
      after: []
    });
    expect(receipt?.repairs.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "replaced_buyer_facing_jargon",
        "replaced_generic_filler",
        "recalculated_word_count"
      ])
    );
    expect(JSON.stringify(result.value?.acceptedSections)).not.toMatch(
      /account thesis|decision path|unlock value|make progress with confidence/i
    );
  });

  it("keeps the first valid section and rejects duplicate headlines and bodies", () => {
    const evidence = [
      claim("one", "The first source describes a workflow."),
      claim("two", "The second source describes another workflow.")
    ];
    const first = slot("section-1", "hero", ["one"]);
    const second = slot("section-2", "mechanism", ["two"]);
    const shared = {
      headline: "Review workflow fit",
      body: "Compare current evidence before deciding."
    };

    const result = editCopyForFactuality(
      input(
        [first, second],
        [
          artifact("opening-writer", [candidate(first, shared)]),
          artifact("mechanism-proof-writer", [candidate(second, shared)])
        ],
        evidence
      )
    );

    expect(result.value?.acceptedSections.map(({ sectionId }) => sectionId)).toEqual([
      "section-1"
    ]);
    expect(result.value?.rejectedSectionIds).toEqual(["section-2"]);
    expect(result.value?.issueReceipts[1]).toMatchObject({
      outcome: "rejected",
      before: [],
      after: ["duplicate_headline", "duplicate_body"]
    });
  });

  it.each([
    ["unsupported_numeric_claim", "Teams cut review time by 40%."],
    ["unsupported_quote", 'A customer said "Every team wins."'],
    ["unsupported_guarantee", "Acme guarantees the result."],
    ["unsupported_urgency", "Act now before it's too late."]
  ] as const)("rejects %s instead of repairing the factual defect", (issue, body) => {
    const evidence = [claim("source-1", "Acme documents governed workflows.")];
    const proof = slot("section-proof", "proof", ["source-1"]);
    const draft = candidate(proof, { body });
    draft.wordCount = sectionCopyWordCount(draft);

    const result = editCopyForFactuality(
      input(
        [proof],
        [artifact("mechanism-proof-writer", [draft])],
        evidence
      )
    );

    expect(result.status).toBe("failed");
    expect(result.value?.acceptedSections).toEqual([]);
    expect(result.value?.rejectedSectionIds).toEqual(["section-proof"]);
    expect(result.value?.issueReceipts[0]?.after).toContain(
      issue as CopyFactualityIssueCode
    );
    expect(result.value?.issueReceipts[0]?.repairs).toEqual([]);
  });

  it("rejects a CTA that does not match the selected objective action", () => {
    const nextAction = slot("section-next", "next-action");
    const draft = candidate(nextAction, {
      headline: "Register for the event",
      body: "Review the current evidence before proceeding.",
      cta: { type: "register", label: "Register for the event" },
      evidenceRefs: []
    });
    draft.wordCount = sectionCopyWordCount(draft);

    const result = editCopyForFactuality(
      input(
        [nextAction],
        [artifact("team-cta-writer", [draft])],
        []
      )
    );

    expect(result.value?.rejectedSectionIds).toEqual(["section-next"]);
    expect(result.value?.issueReceipts[0]?.after).toContain("cta_mismatch");
  });

  it("returns stale without copy when any writer artifact is from another revision", () => {
    const hero = slot("section-1", "hero");
    const result = editCopyForFactuality(
      input(
        [hero],
        [
          artifact("opening-writer", [candidate(hero)], {
            revision: revision - 1
          })
        ],
        []
      )
    );

    expect(result).toMatchObject({
      worker: "copy-factuality-editor",
      status: "stale",
      errorCode: "copy_factuality_editor_stale_writer_artifact",
      evidenceRefs: [],
      confidence: 0
    });
    expect(result.value).toBeUndefined();
  });

  it("preserves valid sections when omitted and unsafe sections are mixed in", () => {
    const evidence = [
      claim("safe-1", "The guide documents a governed workflow."),
      claim("unsafe-1", "The guide documents a review sequence.")
    ];
    const hero = slot("section-1", "hero", ["safe-1"]);
    const context = slot("section-2", "context", [], { required: false });
    const proof = slot("section-3", "proof", ["unsafe-1"]);
    const omitted: SectionCopyCandidate = {
      sectionId: context.id,
      role: context.role,
      status: "omitted",
      evidenceRefs: [],
      wordCount: 0,
      omissionReason: "unsupported_optional_slot"
    };
    const unsafe = candidate(proof, {
      body: "<style>.proof { color: red; }</style>"
    });
    unsafe.wordCount = sectionCopyWordCount(unsafe);

    const result = editCopyForFactuality(
      input(
        [hero, context, proof],
        [
          artifact("opening-writer", [candidate(hero)]),
          artifact("problem-urgency-writer", [omitted]),
          artifact("mechanism-proof-writer", [unsafe])
        ],
        evidence
      )
    );

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "copy_factuality_editor_partial_acceptance"
    });
    expect(result.value?.acceptedSections.map(({ sectionId }) => sectionId)).toEqual([
      "section-1"
    ]);
    expect(result.value?.omittedSectionIds).toEqual(["section-2"]);
    expect(result.value?.rejectedSectionIds).toEqual(["section-3"]);
    expect(result.value?.issueReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "section-2",
          outcome: "omitted",
          before: [],
          after: []
        }),
        expect.objectContaining({
          sectionId: "section-3",
          outcome: "rejected",
          after: expect.arrayContaining(["unsafe_markup_or_code"])
        })
      ])
    );
  });

  it("enforces assigned evidence, word budgets, and three distinct choices", () => {
    const evidence = [
      claim("path-1", "The guide identifies an outcome."),
      claim("other", "An unrelated source identifies another point.")
    ];
    const pathways = slot("section-paths", "pathways", ["path-1"], {
      wordBudget: { min: 1, max: 20 }
    });
    const duplicatedChoice: SectionCopyChoice = {
      label: "Same choice",
      body: "Review the same point.",
      evidenceRefs: ["other"]
    };
    const draft = candidate(pathways, {
      headline: "Choose an evaluation focus",
      body: "Compare the evidence before deciding.",
      choices: [
        duplicatedChoice,
        duplicatedChoice
      ] as unknown as [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice],
      evidenceRefs: ["path-1"]
    });
    draft.wordCount = sectionCopyWordCount(draft);

    const result = editCopyForFactuality(
      input(
        [pathways],
        [artifact("exploration-writer", [draft])],
        evidence
      )
    );
    const issues = result.value?.issueReceipts[0]?.after;

    expect(issues).toEqual(
      expect.arrayContaining([
        "word_budget_violation",
        "choice_evidence_mismatch",
        "choice_count_invalid"
      ])
    );
  });
});
