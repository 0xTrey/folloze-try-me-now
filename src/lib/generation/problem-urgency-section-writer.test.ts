import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

import { writeProblemUrgencySections } from "./problem-urgency-section-writer";

const revision = 4;
const contextSlot: SectionWriterSlot = {
  id: "section-context",
  role: "context",
  label: "Why it matters",
  wordBudget: { min: 18, max: 45 },
  componentSlots: ["narrative-copy"],
  allowedInteractions: ["none"],
  evidenceRefs: ["source:tension", "source:why-now"],
  required: false
};
const evidence: SectionEvidenceClaim[] = [
  {
    id: "source:tension",
    text: "Manual handoffs leave operations teams validating the same work twice.",
    confidence: 0.91,
    revision,
    sourceRole: "source"
  },
  {
    id: "source:why-now",
    text: "The approved rollout adds another workflow for the team to evaluate.",
    confidence: 0.84,
    revision,
    sourceRole: "source"
  }
];

function input(overrides: Partial<SectionWriterInput> = {}): SectionWriterInput {
  return {
    worker: "problem-urgency-writer",
    sessionId: "session-problem-urgency",
    revision,
    activeRevision: revision,
    startedAt: "2026-08-22T18:00:00.000Z",
    completedAt: "2026-08-22T18:00:01.000Z",
    slots: [
      contextSlot,
      {
        ...contextSlot,
        id: "section-hero",
        role: "hero",
        required: true
      }
    ],
    brief: {
      audience: "Operations leaders",
      promise: "Evaluate governed workflow coordination.",
      mechanism: "Review the approved workflow.",
      proofPlan: "Validate the cited source.",
      decisionHelp: "Compare fit with the team's operating requirements.",
      nextAction: "Plan a workflow review.",
      tension:
        "Manual handoffs leave operations teams validating the same work twice.",
      whyNow:
        "The approved rollout adds another workflow for the team to evaluate.",
      unknowns: []
    },
    evidence,
    objective: "Evaluate workflow fit",
    cta: {
      type: "book-meeting",
      label: "Plan a workflow review"
    },
    ...overrides
  };
}

describe("writeProblemUrgencySections", () => {
  it("writes supported tension and why-now copy for owned context slots", () => {
    const result = writeProblemUrgencySections(input());
    const candidate = result.value?.[0];

    expect(result).toMatchObject({
      worker: "problem-urgency-writer",
      status: "complete",
      evidenceRefs: ["source:tension", "source:why-now"],
      confidence: 0.84
    });
    expect(result.value).toHaveLength(1);
    expect(candidate).toMatchObject({
      sectionId: "section-context",
      role: "context",
      status: "complete",
      evidenceRefs: ["source:tension", "source:why-now"]
    });
    expect(candidate?.body).toContain("Manual handoffs");
    expect(candidate?.body).toContain("approved rollout");
    expect(candidate?.wordCount).toBe(sectionCopyWordCount(candidate!));
    expect(
      validateSectionCopyCandidate(candidate!, contextSlot, revision, evidence)
    ).toEqual([]);
  });

  it("omits an optional context slot when tension and why-now are unsupported", () => {
    const result = writeProblemUrgencySections(
      input({
        brief: {
          ...input().brief,
          tension: undefined,
          whyNow: undefined
        }
      })
    );

    expect(result).toMatchObject({
      status: "complete",
      evidenceRefs: [],
      confidence: 0,
      value: [
        {
          sectionId: "section-context",
          status: "omitted",
          omissionReason: "unsupported_optional_slot",
          evidenceRefs: [],
          wordCount: 0
        }
      ]
    });
  });

  it("uses neutral fail-soft framing when required context lacks support", () => {
    const result = writeProblemUrgencySections(
      input({
        slots: [{ ...contextSlot, required: true, evidenceRefs: [] }],
        brief: {
          ...input().brief,
          tension: undefined,
          whyNow: undefined
        },
        evidence: []
      })
    );
    const candidate = result.value?.[0];

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "problem_urgency_required_context_neutral",
      evidenceRefs: [],
      confidence: 0
    });
    expect(candidate).toMatchObject({
      status: "complete",
      role: "context",
      evidenceRefs: []
    });
    expect(`${candidate?.headline} ${candidate?.body}`).not.toMatch(
      /\b(?:urgent|urgency|deadline|trend|immediately)\b/i
    );
    expect(
      validateSectionCopyCandidate(
        candidate!,
        { ...contextSlot, required: true, evidenceRefs: [] },
        revision,
        []
      )
    ).toEqual([]);
  });

  it("rejects a stale writer revision without producing candidates", () => {
    const result = writeProblemUrgencySections(
      input({ activeRevision: revision + 1 })
    );

    expect(result).toMatchObject({
      status: "stale",
      errorCode: "problem_urgency_stale_revision",
      evidenceRefs: []
    });
    expect(result.value).toBeUndefined();
  });

  it("never carries invalid or stale evidence references into copy", () => {
    const result = writeProblemUrgencySections(
      input({
        slots: [
          {
            ...contextSlot,
            evidenceRefs: ["source:tension", "missing:evidence", "stale:evidence"]
          }
        ],
        evidence: [
          evidence[0]!,
          {
            id: "stale:evidence",
            text: "An old timing claim.",
            confidence: 1,
            revision: revision - 1,
            sourceRole: "source"
          }
        ]
      })
    );

    expect(result.status).toBe("complete");
    expect(result.evidenceRefs).toEqual(["source:tension"]);
    expect(result.value?.[0]?.evidenceRefs).toEqual(["source:tension"]);
    expect(
      validateSectionCopyCandidate(
        result.value![0]!,
        {
          ...contextSlot,
          evidenceRefs: ["source:tension", "missing:evidence", "stale:evidence"]
        },
        revision,
        [evidence[0]!]
      )
    ).toEqual([]);
  });
});
