import { describe, expect, it } from "vitest";

import {
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterSlot
} from "./section-copy-types";

const slot: SectionWriterSlot = {
  id: "opening",
  role: "hero",
  label: "Opening",
  wordBudget: { min: 5, max: 14 },
  componentSlots: ["headline", "body"],
  allowedInteractions: [],
  evidenceRefs: ["seller-1"],
  required: true
};

const evidence: SectionEvidenceClaim[] = [{
  id: "seller-1",
  text: "Approved seller claim",
  confidence: 0.9,
  revision: 4,
  sourceRole: "seller"
}];

function completeCandidate(): SectionCopyCandidate {
  const candidate: SectionCopyCandidate = {
    sectionId: "opening",
    role: "hero",
    status: "complete",
    headline: "A clearer path forward",
    body: "Evaluate the approved mechanism with your team.",
    evidenceRefs: ["seller-1"],
    wordCount: 0
  };
  candidate.wordCount = sectionCopyWordCount(candidate);
  return candidate;
}

describe("section copy contracts", () => {
  it("accepts current-revision evidence within the assigned word budget", () => {
    expect(validateSectionCopyCandidate(completeCandidate(), slot, 4, evidence)).toEqual([]);
  });

  it("rejects stale evidence and false word counts", () => {
    const candidate = completeCandidate();
    candidate.evidenceRefs = ["stale-1"];
    candidate.wordCount += 1;
    expect(validateSectionCopyCandidate(candidate, slot, 4, evidence)).toEqual([
      "word_budget_violation",
      "invalid_evidence_ref"
    ]);
  });

  it("allows unsupported optional slots to be omitted but not required slots", () => {
    const omitted: SectionCopyCandidate = {
      sectionId: "opening",
      role: "hero",
      status: "omitted",
      evidenceRefs: [],
      wordCount: 0,
      omissionReason: "unsupported_optional_slot"
    };
    expect(validateSectionCopyCandidate(omitted, slot, 4, evidence)).toContain(
      "required_section_omitted"
    );
    expect(
      validateSectionCopyCandidate(omitted, { ...slot, required: false }, 4, evidence)
    ).toEqual([]);
  });

  it("allows an empty intro when two individually cited substantive cards carry the section", () => {
    const candidate: SectionCopyCandidate = {
      sectionId: "opening", role: "hero", status: "complete",
      headline: "Two operating details to review", body: undefined,
      choices: [
        { label: "Approval ownership", body: "Named owners review approval exceptions before release.", evidenceRefs: ["seller-1"] },
        { label: "Decision record", body: "The shared record preserves each approved decision for review.", evidenceRefs: ["seller-1"] }
      ],
      evidenceRefs: [], wordCount: 0
    };
    candidate.wordCount = sectionCopyWordCount(candidate);
    expect(validateSectionCopyCandidate(candidate, { ...slot, wordBudget: { min: 5, max: 40 } }, 4, evidence)).toEqual([]);
  });

  it("rejects empty, duplicate, or over-limit cards", () => {
    const malformed = completeCandidate();
    malformed.choices = [
      { label: "Same card", body: "Supported detail", evidenceRefs: ["seller-1"] },
      { label: "Same card", body: "", evidenceRefs: [] }
    ];
    malformed.wordCount = sectionCopyWordCount(malformed);
    expect(validateSectionCopyCandidate(malformed, slot, 4, evidence)).toEqual(expect.arrayContaining([
      "word_budget_violation", "invalid_choice", "duplicate_choices"
    ]));
  });
});
