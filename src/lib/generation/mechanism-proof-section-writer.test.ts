import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  type SectionEvidenceClaim,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

import { writeMechanismProofSections } from "./mechanism-proof-section-writer";

const revision = 12;
const startedAt = "2026-08-22T18:20:00.000Z";
const completedAt = "2026-08-22T18:20:01.000Z";

const mechanismSlot: SectionWriterSlot = {
  id: "section-mechanism",
  role: "mechanism",
  label: "How it works",
  wordBudget: { min: 65, max: 140 },
  componentSlots: ["process-diagram"],
  allowedInteractions: ["none"],
  evidenceRefs: ["mechanism-1", "mechanism-2"],
  required: true
};

const proofSlot: SectionWriterSlot = {
  id: "section-proof",
  role: "proof",
  label: "Evidence",
  wordBudget: { min: 45, max: 110 },
  componentSlots: ["proof-ledger"],
  allowedInteractions: ["open-source"],
  evidenceRefs: ["proof-1", "proof-2", "proof-3"],
  required: true
};

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

function input(
  overrides: Partial<SectionWriterInput> = {}
): SectionWriterInput {
  return {
    worker: "mechanism-proof-writer",
    sessionId: "session-mechanism-proof",
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots: [mechanismSlot, proofSlot],
    brief: {
      audience: "Operations leaders",
      promise: "Evaluate a governed workflow",
      mechanism: "Explain only the approved operating sequence.",
      proofPlan: "Use approved sources and identify what remains to validate.",
      decisionHelp: "Compare the approach with current operations.",
      nextAction: "Plan a workflow review.",
      unknowns: []
    },
    evidence: [
      claim(
        "mechanism-1",
        "The platform connects governed workflow steps across operating teams."
      ),
      claim(
        "mechanism-2",
        "Each approved step produces a recorded output for the next owner."
      ),
      claim(
        "proof-1",
        "The official product guide documents configurable workflow stages."
      ),
      claim(
        "proof-2",
        "The implementation guide identifies required owners and handoffs."
      ),
      claim(
        "proof-3",
        "The approved customer study reports a shorter review cycle."
      )
    ],
    objective: "Evaluate workflow fit",
    cta: {
      type: "book-meeting",
      label: "Plan a workflow review"
    },
    ...overrides
  };
}

function expectValidBudgets(
  result: ReturnType<typeof writeMechanismProofSections>,
  slots: readonly SectionWriterSlot[]
): void {
  expect(result.value).toHaveLength(slots.length);
  result.value?.forEach((candidate, index) => {
    if (candidate.status === "omitted") return;
    expect(candidate.wordCount).toBe(sectionCopyWordCount(candidate));
    expect(candidate.wordCount).toBeGreaterThanOrEqual(
      slots[index]!.wordBudget.min
    );
    expect(candidate.wordCount).toBeLessThanOrEqual(
      slots[index]!.wordBudget.max
    );
  });
}

describe("writeMechanismProofSections", () => {
  it("writes the mechanism from current evidence with exact claim refs", () => {
    const result = writeMechanismProofSections(
      input({ slots: [mechanismSlot] })
    );

    expect(result).toMatchObject({
      worker: "mechanism-proof-writer",
      status: "complete",
      evidenceRefs: ["mechanism-1", "mechanism-2"]
    });
    expect(result.value?.[0]).toMatchObject({
      sectionId: mechanismSlot.id,
      role: "mechanism",
      status: "complete",
      evidenceRefs: ["mechanism-1", "mechanism-2"]
    });
    expect(result.value?.[0]?.body).toContain(
      "The platform connects governed workflow steps across operating teams."
    );
    expectValidBudgets(result, [mechanismSlot]);
  });

  it("keeps proof-rich copy mapped to every approved claim it uses", () => {
    const result = writeMechanismProofSections(input({ slots: [proofSlot] }));

    expect(result.status).toBe("complete");
    expect(result.value?.[0]?.evidenceRefs).toEqual([
      "proof-1",
      "proof-2",
      "proof-3"
    ]);
    expect(result.value?.[0]?.body).toContain(
      "The approved customer study reports a shorter review cycle."
    );
    expectValidBudgets(result, [proofSlot]);
  });

  it("frames proof-sparse gaps as validation instead of adding claims", () => {
    const sparseSlot = {
      ...proofSlot,
      evidenceRefs: ["proof-1"]
    };
    const result = writeMechanismProofSections(
      input({ slots: [sparseSlot] })
    );

    expect(result.status).toBe("complete");
    expect(result.value?.[0]?.evidenceRefs).toEqual(["proof-1"]);
    expect(result.value?.[0]?.body).toMatch(/validation questions/i);
    expect(result.value?.[0]?.body).not.toMatch(/\d+%|\$\d+/);
    expectValidBudgets(result, [sparseSlot]);
  });

  it("fails soft to a validation plan when no proof exists", () => {
    const result = writeMechanismProofSections(
      input({
        slots: [{ ...proofSlot, evidenceRefs: [] }],
        evidence: []
      })
    );

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "mechanism_proof_writer_validation_required",
      evidenceRefs: [],
      confidence: 0
    });
    expect(result.value?.[0]).toMatchObject({
      status: "complete",
      evidenceRefs: []
    });
    expect(result.value?.[0]?.body).toMatch(
      /does not support a declarative proof claim/i
    );
    expect(result.value?.[0]?.body).toMatch(/none is asserted here/i);
    expectValidBudgets(result, [{ ...proofSlot, evidenceRefs: [] }]);
  });

  it("ignores invalid, stale, and code-like refs without leaking their text", () => {
    const guardedSlot = {
      ...proofSlot,
      evidenceRefs: ["proof-1", "missing-proof", "stale-proof", "code-proof"]
    };
    const result = writeMechanismProofSections(
      input({
        slots: [guardedSlot],
        evidence: [
          claim(
            "proof-1",
            "The official product guide documents configurable workflow stages."
          ),
          claim("stale-proof", "An old source claimed a 90 percent result.", {
            revision: revision - 1
          }),
          claim("code-proof", "const fakeMetric = '99 percent';")
        ]
      })
    );

    expect(result.status).toBe("complete");
    expect(result.value?.[0]?.evidenceRefs).toEqual(["proof-1"]);
    expect(result.value?.[0]?.body).not.toMatch(
      /90 percent|99 percent|fakeMetric/
    );
    expect(JSON.stringify(result)).not.toMatch(
      /<html|<style|className=|```|\bconst\b/i
    );
    expectValidBudgets(result, [guardedSlot]);
  });

  it("returns no copy for a stale revision", () => {
    const result = writeMechanismProofSections(
      input({ activeRevision: revision + 1 })
    );

    expect(result).toMatchObject({
      worker: "mechanism-proof-writer",
      status: "stale",
      errorCode: "mechanism_proof_writer_stale_revision",
      evidenceRefs: []
    });
    expect(result.value).toBeUndefined();
  });
});
