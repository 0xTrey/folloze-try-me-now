import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterInput,
  type SectionWriterSlot
} from "./section-copy-types";
import { writeOpeningSections } from "./opening-section-writer";

const revision = 8;
const startedAt = "2026-08-22T18:20:00.000Z";
const completedAt = "2026-08-22T18:20:01.000Z";

const richEvidence: SectionEvidenceClaim[] = [
  {
    id: "audience-1",
    text: "Operations leaders evaluate workflow fit and implementation risk.",
    confidence: 0.92,
    revision,
    sourceRole: "visitor"
  },
  {
    id: "offer-1",
    text: "Acme Workflow Cloud connects governed workflow steps across operating teams.",
    confidence: 0.88,
    revision,
    sourceRole: "offer"
  },
  {
    id: "objective-1",
    text: "The selected objective is to evaluate workflow automation.",
    confidence: 0.9,
    revision,
    sourceRole: "visitor"
  }
];

function heroSlot(
  overrides: Partial<SectionWriterSlot> = {}
): SectionWriterSlot {
  return {
    id: "section-1",
    role: "hero",
    label: "Opening",
    wordBudget: { min: 35, max: 55 },
    componentSlots: ["headline-group", "typographic-hero"],
    allowedInteractions: ["anchor-scroll"],
    evidenceRefs: richEvidence.map(({ id }) => id),
    required: true,
    ...overrides
  };
}

function input(
  overrides: Partial<SectionWriterInput> = {}
): SectionWriterInput {
  return {
    worker: "opening-writer",
    sessionId: "session-opening-writer",
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots: [
      heroSlot(),
      {
        ...heroSlot({
          id: "section-2",
          role: "context",
          componentSlots: ["narrative-copy"]
        })
      }
    ],
    brief: {
      audience: "Operations leaders",
      promise: "Evaluate workflow automation through governed steps across operating teams",
      mechanism: "Governed workflow steps connect operating teams.",
      proofPlan: "Review current offer evidence.",
      decisionHelp: "Assess workflow fit and implementation risk.",
      nextAction: "Plan a workflow review.",
      unknowns: []
    },
    evidence: richEvidence,
    objective: "Evaluate workflow automation",
    cta: {
      type: "book-meeting",
      label: "Plan a workflow review"
    },
    ...overrides
  };
}

describe("writeOpeningSections", () => {
  it("writes only evidence-rich hero copy and preserves typographic/no-image intent", () => {
    const source = input();
    const result = writeOpeningSections(source);

    expect(result).toMatchObject({
      worker: "opening-writer",
      sessionId: source.sessionId,
      revision,
      status: "complete",
      confidence: 0.88
    });
    expect(result.value).toHaveLength(1);
    const candidate = result.value?.[0];
    expect(candidate).toMatchObject({
      sectionId: "section-1",
      role: "hero",
      status: "complete",
      eyebrow: "Operations leaders",
      headline: "Evaluate workflow automation through governed steps across operating teams",
      cta: {
        type: "book-meeting",
        label: "Plan a workflow review"
      }
    });
    expect(candidate?.evidenceRefs).toEqual([
      "audience-1",
      "objective-1",
      "offer-1"
    ]);
    expect(
      validateSectionCopyCandidate(candidate!, source.slots[0]!, revision, source.evidence)
    ).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/<img|<style|className=|https?:\/\//i);
  });

  it("uses the account argument for the shared-priority body without repeating raw evidence", () => {
    const targetEvidence: SectionEvidenceClaim = {
      id: "target-focus",
      text: "Cisco describes secure networking across hybrid infrastructure and observability programs.",
      confidence: 0.9,
      revision,
      sourceRole: "target",
      kind: "target_fact"
    };
    const source = input({
      slots: [heroSlot({
        family: "align",
        v2Role: "shared-priority",
        claimType: "hypothesis",
        headlineWordBudget: { min: 5, max: 12 },
        evidenceRefs: ["offer-1", "target-focus"],
        wordBudget: { min: 25, max: 72 }
      })],
      evidence: [richEvidence[1]!, targetEvidence],
      brief: {
        ...input().brief,
        promise: "Evaluate Acme Workflow Cloud for Cisco's secure networking focus.",
        whyNow:
          "Cisco's public focus gives operations leaders a concrete lens for the evaluation while timing and ownership remain open questions."
      }
    });
    const result = writeOpeningSections(source);
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.headline).toMatch(/Cisco's secure networking/i);
    expect(candidate?.body).toMatch(/^Cisco's public focus/);
    expect(candidate?.body).not.toContain("Cisco describes secure networking");
    expect(candidate?.evidenceRefs).toEqual(["offer-1", "target-focus"]);
    expect(
      validateSectionCopyCandidate(candidate!, source.slots[0]!, revision, source.evidence)
    ).toEqual([]);
  });

  it("uses a non-factual decision prompt to meet the budget with sparse evidence", () => {
    const sparseEvidence = [richEvidence[1]!];
    const source = input({
      evidence: sparseEvidence,
      slots: [
        heroSlot({
          evidenceRefs: ["offer-1"],
          wordBudget: { min: 35, max: 40 }
        })
      ]
    });
    const result = writeOpeningSections(source);
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.evidenceRefs).toEqual(["offer-1"]);
    expect(candidate?.wordCount).toBeGreaterThanOrEqual(35);
    expect(candidate?.wordCount).toBeLessThanOrEqual(40);
    expect(candidate?.body).toMatch(/assess|evaluate/i);
    expect(
      validateSectionCopyCandidate(candidate!, source.slots[0]!, revision, source.evidence)
    ).toEqual([]);
  });

  it("trims optional copy while honoring a narrow assigned word budget", () => {
    const source = input({
      slots: [heroSlot({ wordBudget: { min: 12, max: 14 } })]
    });
    const result = writeOpeningSections(source);
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.wordCount).toBeGreaterThanOrEqual(12);
    expect(candidate?.wordCount).toBeLessThanOrEqual(14);
    expect(candidate?.wordCount).toBe(sectionCopyWordCount(candidate!));
    expect(candidate?.cta).toBeUndefined();
    expect(
      validateSectionCopyCandidate(candidate!, source.slots[0]!, revision, source.evidence)
    ).toEqual([]);
  });

  it("ignores invalid and stale refs while retaining current evidence", () => {
    const staleClaim: SectionEvidenceClaim = {
      id: "stale-1",
      text: "A prior-revision claim must not appear.",
      confidence: 1,
      revision: revision - 1,
      sourceRole: "seller"
    };
    const source = input({
      slots: [
        heroSlot({
          evidenceRefs: ["offer-1", "missing-1", "stale-1"]
        })
      ],
      evidence: [richEvidence[1]!, staleClaim]
    });
    const result = writeOpeningSections(source);

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "opening_writer_invalid_evidence_refs_ignored",
      evidenceRefs: ["offer-1"]
    });
    expect(result.value?.[0]?.evidenceRefs).toEqual(["offer-1"]);
    expect(JSON.stringify(result)).not.toContain("prior-revision");
  });

  it("removes banned generic language instead of presenting it as opening copy", () => {
    const source = input({
      brief: {
        ...input().brief,
        promise: "Unlock value with a best-in-class workflow"
      },
      slots: [
        heroSlot({
          evidenceRefs: ["offer-1"],
          wordBudget: { min: 20, max: 40 }
        })
      ],
      evidence: [richEvidence[1]!]
    });
    const result = writeOpeningSections(source);

    expect(result.status).toBe("complete");
    expect(result.value?.[0]?.headline).toBe(richEvidence[1]!.text);
    expect(JSON.stringify(result)).not.toMatch(/unlock value|best-in-class/i);
  });

  it("returns stale with no value when the input revision is inactive", () => {
    const result = writeOpeningSections(input({ activeRevision: revision + 1 }));

    expect(result).toMatchObject({
      status: "stale",
      errorCode: "opening_writer_stale_revision",
      evidenceRefs: [],
      confidence: 0
    });
    expect(result.value).toBeUndefined();
  });
});
