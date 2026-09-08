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
  it("never replaces an overlong visitor claim with internal evidence wording", () => {
    const evidence = [claim("long-visitor", "The visitor wants a careful evaluation of many operating requirements across finance and accounting teams before choosing which workflow to review next", { sourceRole: "visitor" })];
    const result = writeExplorationSections(input([slot("decision-support", ["long-visitor"])], evidence));
    expect(result.value?.[0]).toMatchObject({ status: "omitted", omissionReason: "no_current_evidence" });
    expect(JSON.stringify(result.value)).not.toContain("referenced visitor evidence");
    expect(result.value?.[0]?.evidenceRefs).toEqual([]);
  });

  it("keeps a complete service fact in applications when it cannot fit in a short card", () => {
    const statement = "The audit service reviews financial records and internal controls to help finance teams understand their reporting requirements and prepare for the next reporting cycle.";
    const evidence = [claim("service-scope", statement, { kind: "seller_fact", evidenceType: "capability" })];
    const application = slot("pathways", ["service-scope"], { family: "guide", v2Role: "applications", claimType: "implication", wordBudget: { min: 30, max: 72 } });
    const result = writeExplorationSections(input([application], evidence));
    expect(result.value?.[0]?.body).toBe(statement);
    expect(result.value?.[0]?.evidenceRefs).toEqual(["service-scope"]);
    expect(result.value?.[0]?.choices).toBeUndefined();
    expect(result.value?.[0]?.wordCount).toBeLessThanOrEqual(72);
    expect(JSON.stringify(result.value)).not.toContain("referenced source evidence");
  });

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
    expect(candidate?.choices?.map(({ body }) => body)).toEqual(evidence.map(({ text }) => text));
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
      headline: "Capabilities that shape the decision",
      choices: [
        { label: "identity requirements", evidenceRefs: ["tech-requirement"] },
        { label: "deployment constraints", evidenceRefs: ["tech-constraint"] },
        { label: "validation evidence", evidenceRefs: ["tech-validation"] }
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
        { label: "operating model", body: evidence[0]!.text },
        { label: "review sequence", body: evidence[1]!.text },
        { label: "evaluation questions", body: evidence[2]!.text }
      ]
    });
    expect(JSON.stringify(result)).not.toMatch(/<html|<style|className=|```/i);
  });

  it("keeps a single supported paragraph rather than inventing evaluation cards", () => {
    const evidence = [
      claim("single-source", "The brief confirms the evaluation objective")
    ];
    const result = writeExplorationSections(
      input([slot("pathways", ["single-source"])], evidence)
    );
    const choices = result.value?.[0]?.choices ?? [];

    expect(result.status).toBe("complete");
    expect(result.fallbackCode).toBeUndefined();
    expect(choices).toHaveLength(0);
    expect(result.value?.[0]?.body).toBe(evidence[0]!.text);
    expect(JSON.stringify(choices)).not.toMatch(/\buse case\b/i);
  });

  it("preserves two distinct account priorities without inventing a third", () => {
    const evidence = [
      claim(
        "target-focus",
        "Cisco describes secure networking across hybrid infrastructure and observability programs.",
        { sourceRole: "target", kind: "target_fact" }
      ),
      claim(
        "target-context",
        "Cisco emphasizes cross-team operations across network and security programs.",
        { sourceRole: "target", kind: "target_fact" }
      )
    ];
    const prioritySlot = slot("pathways", evidence.map(({ id }) => id), {
      family: "align",
      v2Role: "priority-paths",
      claimType: "hypothesis",
      headlineWordBudget: { min: 5, max: 12 },
      wordBudget: { min: 30, max: 72 }
    });
    const result = writeExplorationSections(
      input([prioritySlot], evidence, {
        brief: {
          ...input([], []).brief,
          sellerName: "Acme",
          targetName: "Cisco"
        }
      })
    );
    const candidate = result.value?.[0];

    expect(result.status).toBe("complete");
    expect(candidate?.headline).toContain("Cisco");
    expect(candidate?.body).toBeUndefined();
    expect(candidate?.choices).toEqual([
      expect.objectContaining({ body: evidence[0]!.text, evidenceRefs: ["target-focus"] }),
      expect.objectContaining({ body: evidence[1]!.text, evidenceRefs: ["target-context"] })
    ]);
    expect(candidate?.wordCount).toBeGreaterThanOrEqual(prioritySlot.wordBudget.min);
    expect(candidate?.wordCount).toBeLessThanOrEqual(prioritySlot.wordBudget.max);
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

    expect(result.status).toBe("complete");
    expect(new Set(choices.map(({ label }) => label)).size).toBe(2);
    expect(new Set(choices.map(({ body }) => body)).size).toBe(2);
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
