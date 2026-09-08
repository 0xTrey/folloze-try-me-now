import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  type SectionEvidenceClaim,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

import { writeMechanismProofSections } from "./mechanism-proof-section-writer";

describe("selected event explanation", () => {
  it("allows an assigned event statement to explain the session", () => {
    const current = input();
    current.brief.offerKind = "event";
    current.slots = [{ ...mechanismSlot, wordBudget: { min: 0, max: 100 }, claimType: "fact", evidenceRefs: ["source-detail"] }];
    current.evidence = [claim("source-detail", "The session explains the request review sequence and the decision record produced at each step.", { evidenceType: "resource" })];
    const result = writeMechanismProofSections(current);
    expect(result.value?.[0]).toMatchObject({ status: "complete", evidenceRefs: ["source-detail"] });
    expect(result.value?.[0]?.body).toContain(current.evidence[0]!.text);
  });
});

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
    expect(candidate.wordCount).toBeLessThanOrEqual(
      slots[index]!.wordBudget.max
    );
  });
}

describe("writeMechanismProofSections", () => {
  it("never treats an offer name and tagline as a complete solution explanation", () => {
    const source = input({ slots: [{ ...mechanismSlot, v2Role: "solution-mapping", evidenceRefs: ["name", "tagline"] }],
      brief: { ...input().brief, offerLabel: "Audit & Assurance Solutions" },
      evidence: [claim("name", "Audit & Assurance Solutions", { evidenceType: "positioning" }),
        claim("tagline", "Account for Anything", { evidenceType: "positioning" })] });
    const result = writeMechanismProofSections(source);
    expect(result.status).toBe("fallback");
    expect(result.value?.[0]?.headline).toBe("Know what the work should deliver");
    expect(result.value?.[0]?.body).toContain("what information is needed, who does the work, and what you receive");
    expect(result.value?.[0]?.body).not.toContain("Account for Anything");
  });

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

  it("keeps sparse proof copy limited to its cited claim", () => {
    const sparseSlot = {
      ...proofSlot,
      evidenceRefs: ["proof-1"]
    };
    const result = writeMechanismProofSections(
      input({ slots: [sparseSlot] })
    );

    expect(result.status).toBe("complete");
    expect(result.value?.[0]?.evidenceRefs).toEqual(["proof-1"]);
    expect(result.value?.[0]?.body).toBe(
      "The official product guide documents configurable workflow stages."
    );
    expect(result.value?.[0]?.body).not.toMatch(/current evidence|approved sources/i);
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
    expect(result.value?.[0]?.body).toBe(
      "Ask to see the workflow, its output, and the requirements your team needs to validate."
    );
    expect(result.value?.[0]?.body).not.toMatch(/declarative|evidence|proof claim/i);
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

  it("turns cited target context into a concise shared-opportunity section", () => {
    const accountSlot: SectionWriterSlot = {
      ...mechanismSlot,
      id: "shared-opportunity",
      v2Role: "shared-opportunity",
      headlineWordBudget: { min: 4, max: 11 },
      evidenceRefs: ["target:focus"]
    };
    const targetClaim = claim(
      "target:focus",
      "Google describes responsible AI across enterprise platforms and cloud security programs.",
      { sourceRole: "target", kind: "target_fact" }
    );
    const result = writeMechanismProofSections(
      input({
        slots: [accountSlot],
        evidence: [targetClaim],
        brief: {
          ...input().brief,
          mechanism:
            "Connect responsible AI governance to one supported workflow, then validate ownership and outputs."
        }
      })
    );

    expect(result.value?.[0]?.headline).toBe(
      "Turn responsible AI into a testable workstream"
    );
    expect(result.value?.[0]?.body).toMatch(/^Connect responsible AI governance/);
    expect(result.value?.[0]?.body).not.toContain("Google describes responsible AI");
    expect(result.value?.[0]?.body).not.toMatch(/^Current evidence describes/);
    expect(result.value?.[0]?.evidenceRefs).toEqual(["target:focus"]);
  });

  it("never fragments supported sentences when the maximum budget is tight", () => {
    const tightSlot = { ...proofSlot, wordBudget: { min: 2, max: 18 } };
    const result = writeMechanismProofSections(input({ slots: [tightSlot] }));
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.body).toMatch(/[.!?]$/);
    expect(candidate?.wordCount).toBeLessThanOrEqual(tightSlot.wordBudget.max);
    expect(candidate?.evidenceRefs).toEqual(["proof-1"]);
  });
});
