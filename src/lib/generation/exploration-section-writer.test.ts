import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  type SectionEvidenceClaim,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

import { writeExplorationSections } from "./exploration-section-writer";

const revision = 8;
const startedAt = "2026-08-22T18:00:00.000Z";
const completedAt = "2026-08-22T18:00:01.000Z";

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
    sourceRole: "source",
    ...overrides
  };
}

function slot(
  role: SectionWriterSlot["role"],
  evidenceRefs: readonly string[],
  overrides: Partial<SectionWriterSlot> = {}
): SectionWriterSlot {
  return {
    id: `section-${role}`,
    role,
    label: role,
    wordBudget: { min: 35, max: 105 },
    componentSlots: ["choice-cards"],
    allowedInteractions: ["select-path"],
    evidenceRefs,
    required: true,
    ...overrides
  };
}

function input(
  slots: readonly SectionWriterSlot[],
  evidence: readonly SectionEvidenceClaim[],
  overrides: Partial<SectionWriterInput> = {}
): SectionWriterInput {
  return {
    worker: "exploration-writer",
    sessionId: "session-exploration",
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    slots,
    brief: {
      audience: "Operations leaders",
      promise: "Evaluate a supported operating path",
      mechanism: "Compare current workflow evidence",
      proofPlan: "Use only referenced evidence",
      decisionHelp: "Validate fit before choosing a path",
      nextAction: "Plan the next review",
      unknowns: []
    },
    evidence,
    objective: "Evaluate workflow fit",
    cta: {
      type: "book-meeting",
      label: "Plan a review"
    },
    ...overrides
  };
}

describe("writeExplorationSections", () => {
  it("returns exactly three distinct evidence-mapped choices within the slot budget", () => {
    const evidence = [
      claim("source-outcome", "The source defines the intended workflow outcome"),
      claim("source-process", "The source describes the current review process"),
      claim("source-proof", "The source identifies evidence needed for approval")
    ];
    const pathwaySlot = slot(
      "pathways",
      evidence.map(({ id }) => id)
    );

    const result = writeExplorationSections(input([pathwaySlot], evidence));
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.choices).toHaveLength(3);
    expect(new Set(candidate?.choices?.map(({ label }) => label)).size).toBe(3);
    expect(new Set(candidate?.choices?.map(({ body }) => body)).size).toBe(3);
    expect(candidate?.choices?.flatMap(({ evidenceRefs }) => evidenceRefs)).toEqual([
      "source-outcome",
      "source-process",
      "source-proof"
    ]);
    expect(candidate?.wordCount).toBe(sectionCopyWordCount(candidate!));
    expect(candidate?.wordCount).toBeGreaterThanOrEqual(pathwaySlot.wordBudget.min);
    expect(candidate?.wordCount).toBeLessThanOrEqual(pathwaySlot.wordBudget.max);
  });

  it("writes technical decision help as requirements, constraints, and validation", () => {
    const evidence = [
      claim("tech-requirement", "The architecture guide lists identity requirements"),
      claim("tech-constraint", "The implementation guide names deployment constraints"),
      claim("tech-validation", "The security brief defines validation evidence")
    ];
    const result = writeExplorationSections(
      input([slot("decision-support", evidence.map(({ id }) => id))], evidence, {
        objective: "Complete a technical architecture evaluation"
      })
    );

    expect(result.status).toBe("complete");
    expect(result.value?.[0]).toMatchObject({
      headline: "Resolve the technical decision",
      choices: [
        { label: "Requirements check", evidenceRefs: ["tech-requirement"] },
        { label: "Constraint review", evidenceRefs: ["tech-constraint"] },
        { label: "Validation evidence", evidenceRefs: ["tech-validation"] }
      ]
    });
  });

  it("builds an evidence-bounded webinar agenda", () => {
    const evidence = [
      claim("webinar-topic", "The webinar introduces the operating model"),
      claim("webinar-demo", "The recording examines the review sequence"),
      claim("webinar-close", "The speaker closes with evaluation questions")
    ];
    const result = writeExplorationSections(
      input(
        [slot("agenda", evidence.map(({ id }) => id), { wordBudget: { min: 40, max: 95 } })],
        evidence,
        { objective: "Help visitors evaluate the webinar" }
      )
    );

    expect(result.status).toBe("complete");
    expect(result.value?.[0]).toMatchObject({
      headline: "A focused agenda for the session",
      choices: [
        { label: "Opening context" },
        { label: "Core discussion" },
        { label: "Questions to resolve" }
      ]
    });
    expect(JSON.stringify(result)).not.toMatch(/<html|<style|className=|```/i);
  });

  it("uses bounded evaluation questions when evidence is sparse", () => {
    const evidence = [
      claim("single-source", "The brief confirms the evaluation objective")
    ];
    const result = writeExplorationSections(
      input([slot("pathways", ["single-source"])], evidence)
    );
    const choices = result.value?.[0]?.choices ?? [];

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "exploration_writer_sparse_evidence"
    });
    expect(choices).toHaveLength(3);
    expect(choices.every(({ body }) => body.endsWith("?"))).toBe(true);
    expect(JSON.stringify(choices)).not.toMatch(/\buse case\b/i);
  });

  it("prevents duplicate evidence from producing duplicate choices", () => {
    const evidence = [
      claim("duplicate-a", "The source confirms one supported point"),
      claim("duplicate-b", "  The source confirms one supported point  "),
      claim("different", "The source confirms a second supported point")
    ];
    const result = writeExplorationSections(
      input(
        [slot("resources", evidence.map(({ id }) => id), { wordBudget: { min: 30, max: 80 } })],
        evidence
      )
    );
    const choices = result.value?.[0]?.choices ?? [];

    expect(result.status).toBe("fallback");
    expect(new Set(choices.map(({ label }) => label)).size).toBe(3);
    expect(new Set(choices.map(({ body }) => body)).size).toBe(3);
  });

  it("rejects slot evidence references that are not current", () => {
    const result = writeExplorationSections(
      input(
        [slot("decision-support", ["missing-ref"])],
        [claim("available-ref", "A current supported point")]
      )
    );

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "exploration_writer_invalid_evidence_ref",
      evidenceRefs: []
    });
    expect(result.value).toBeUndefined();
  });

  it("rejects stale revisions without returning copy", () => {
    const result = writeExplorationSections(
      input([], [], { activeRevision: revision + 1 })
    );

    expect(result).toMatchObject({
      status: "stale",
      errorCode: "exploration_writer_stale_revision",
      evidenceRefs: []
    });
    expect(result.value).toBeUndefined();
  });
});
