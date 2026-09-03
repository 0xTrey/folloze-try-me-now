import { describe, expect, it } from "vitest";

import {
  validateSectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

import { writeTeamCtaSections } from "./team-cta-section-writer";

const revision = 8;
const startedAt = "2026-08-22T18:20:00.000Z";
const completedAt = "2026-08-22T18:20:00.050Z";

const sellerSlot: SectionWriterSlot = {
  id: "section-5",
  role: "seller-validation",
  label: "Seller credibility",
  wordBudget: { min: 30, max: 70 },
  componentSlots: ["seller-facts"],
  allowedInteractions: [],
  evidenceRefs: ["seller-workflow"],
  required: true
};

const nextActionSlot: SectionWriterSlot = {
  id: "section-6",
  role: "next-action",
  label: "Next useful action",
  wordBudget: { min: 25, max: 55 },
  componentSlots: ["cta-panel"],
  allowedInteractions: ["primary-cta"],
  evidenceRefs: ["objective-selection", "cta-selection"],
  required: true
};

const evidence: SectionEvidenceClaim[] = [
  {
    id: "seller-workflow",
    text: "Acme connects governed workflow steps across operating teams.",
    confidence: 0.86,
    revision,
    sourceRole: "seller"
  },
  {
    id: "objective-selection",
    text: "The visitor selected a sales conversation objective.",
    confidence: 1,
    revision,
    sourceRole: "visitor"
  },
  {
    id: "cta-selection",
    text: "The visitor selected Book a meeting.",
    confidence: 1,
    revision,
    sourceRole: "visitor"
  }
];

function writerInput(
  overrides: Partial<SectionWriterInput> = {}
): SectionWriterInput {
  return {
    worker: "team-cta-writer",
    sessionId: "session-team-cta",
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots: [sellerSlot, nextActionSlot],
    brief: {
      audience: "Address operations leaders.",
      promise: "Frame a bounded path toward evaluation.",
      mechanism: "Explain only the supported operating model.",
      proofPlan: "Use referenced offer evidence only.",
      decisionHelp: "Help the team evaluate fit.",
      nextAction: "Use Book a meeting as the bounded next action.",
      unknowns: []
    },
    evidence,
    objective: "Start a sales conversation",
    cta: {
      type: "book-meeting",
      label: "Book a meeting"
    },
    ...overrides
  };
}

function expectValidCandidates(
  input: SectionWriterInput,
  result: ReturnType<typeof writeTeamCtaSections>
): void {
  expect(result.value).toBeDefined();
  for (const candidate of result.value ?? []) {
    const slot = input.slots.find(({ id }) => id === candidate.sectionId);
    expect(slot).toBeDefined();
    expect(
      validateSectionCopyCandidate(
        candidate,
        slot!,
        input.revision,
        input.evidence
      )
    ).toEqual([]);
  }
}

describe("writeTeamCtaSections", () => {
  it("writes evidence-backed team validation and the default meeting action", () => {
    const input = writerInput();
    const result = writeTeamCtaSections(input);

    expect(result).toMatchObject({
      worker: "team-cta-writer",
      sessionId: input.sessionId,
      revision,
      status: "complete",
      evidenceRefs: ["seller-workflow"],
      confidence: 0.86
    });
    expect(result.value?.map(({ role }) => role)).toEqual([
      "seller-validation",
      "next-action"
    ]);
    const seller = result.value?.[0];
    expect(seller?.body).toContain(evidence[0]!.text);
    expect(seller?.evidenceRefs).toEqual(["seller-workflow"]);
    const nextAction = result.value?.[1];
    expect(nextAction?.cta).toEqual({
      type: "book-meeting",
      label: "Book a meeting"
    });
    expect(nextAction?.body).toContain(input.objective);
    expectValidCandidates(input, result);
    expect(JSON.stringify(result)).not.toMatch(
      /<html|<style|className=|guarantee|limited time|will deliver/i
    );
  });

  it("preserves an evidence-backed event registration CTA", () => {
    const input = writerInput({
      slots: [nextActionSlot],
      objective: "Drive registrations",
      cta: { type: "register", label: "Register for the event" }
    });
    const result = writeTeamCtaSections(input);

    expect(result).toMatchObject({
      status: "complete",
      evidenceRefs: [],
      value: [{
        role: "next-action",
        headline: "Register for the event",
        cta: { type: "register", label: "Register for the event" }
      }]
    });
    expect(result.value?.[0]?.body).toContain("Drive registrations");
    expectValidCandidates(input, result);
  });

  it("keeps the ABM working-session action aligned to the selected objective", () => {
    const input = writerInput({
      slots: [nextActionSlot],
      objective: "Align the buying group",
      cta: {
        type: "book-meeting",
        label: "Plan an account working session"
      }
    });
    const result = writeTeamCtaSections(input);

    expect(result.value?.[0]).toMatchObject({
      headline: "Plan an account working session",
      cta: {
        type: "book-meeting",
        label: "Plan an account working session"
      }
    });
    expect(result.value?.[0]?.body).toContain("Align the buying group");
    expect(result.value?.[0]?.body).not.toMatch(
      /agreement|consensus|approval|decision achieved/i
    );
    expectValidCandidates(input, result);
  });

  it("uses cited account context to personalize the first decision", () => {
    const targetEvidence: SectionEvidenceClaim = {
      id: "target-focus",
      text: "Cisco describes secure networking across hybrid infrastructure.",
      confidence: 0.9,
      revision,
      sourceRole: "target",
      kind: "target_fact"
    };
    const firstDecisionSlot: SectionWriterSlot = {
      ...nextActionSlot,
      family: "align",
      v2Role: "first-decision",
      claimType: "instruction",
      headlineWordBudget: { min: 5, max: 12 },
      evidenceRefs: ["objective-selection", "cta-selection", "target-focus"],
      wordBudget: { min: 30, max: 72 }
    };
    const input = writerInput({
      slots: [firstDecisionSlot],
      evidence: [...evidence, targetEvidence],
      brief: {
        ...writerInput().brief,
        nextAction: "Plan a working session around secure networking"
      },
      objective: "Evaluate workflow fit"
    });
    const result = writeTeamCtaSections(input);
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.headline).toBe("Plan a working session around secure networking");
    expect(candidate?.body).toMatch(/evaluate workflow fit against the cited public context/i);
    expect(candidate?.evidenceRefs).toEqual(["target-focus"]);
    expectValidCandidates(input, result);
  });

  it("uses a validation plan instead of role or seller claims when evidence is sparse", () => {
    const input = writerInput({ evidence: [] });
    const result = writeTeamCtaSections(input);

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "team_cta_writer_sparse_evidence",
      evidenceRefs: [],
      confidence: 0.45
    });
    const seller = result.value?.find(
      ({ role }) => role === "seller-validation"
    );
    expect(seller).toMatchObject({
      status: "complete",
      headline: "Set the validation questions",
      evidenceRefs: []
    });
    expect(seller?.body).toMatch(/review the available evidence/i);
    expect(seller?.body).not.toMatch(/Acme|guarantee|customer|percent|%/i);
    expectValidCandidates(input, result);
  });

  it("omits an optional seller slot when its references are invalid", () => {
    const optionalSeller = {
      ...sellerSlot,
      evidenceRefs: ["missing-ref"],
      required: false
    };
    const input = writerInput({
      slots: [optionalSeller, nextActionSlot]
    });
    const result = writeTeamCtaSections(input);

    expect(result).toMatchObject({
      status: "fallback",
      evidenceRefs: []
    });
    expect(result.value?.[0]).toMatchObject({
      sectionId: optionalSeller.id,
      role: "seller-validation",
      status: "omitted",
      omissionReason: "no_current_evidence",
      evidenceRefs: []
    });
    expect(JSON.stringify(result)).not.toContain(evidence[0]!.text);
    expectValidCandidates(input, result);
  });

  it("does not emit unsafe or guaranteed role value from referenced evidence", () => {
    const unsafeEvidence: SectionEvidenceClaim[] = [{
      id: "seller-workflow",
      text: "<strong>Acme guarantees every team a 50% result.</strong>",
      confidence: 0.99,
      revision,
      sourceRole: "seller"
    }];
    const input = writerInput({ evidence: unsafeEvidence });
    const result = writeTeamCtaSections(input);

    expect(result.status).toBe("fallback");
    expect(result.evidenceRefs).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/<strong>|guarantee|50%/i);
    expectValidCandidates(input, result);
  });

  it("returns no value when the input revision is stale", () => {
    const result = writeTeamCtaSections(
      writerInput({ activeRevision: revision + 1 })
    );

    expect(result).toMatchObject({
      status: "stale",
      errorCode: "team_cta_writer_stale_revision",
      evidenceRefs: [],
      confidence: 0
    });
    expect(result.value).toBeUndefined();
  });
});
