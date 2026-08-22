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
});
