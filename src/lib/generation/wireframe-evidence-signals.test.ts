import { describe, expect, it } from "vitest";
import { deriveWireframeEvidenceSignals } from "./wireframe-evidence-signals";
import type { CompilerEvidenceItem } from "./messaging-compiler-contracts";

const item = (overrides: Partial<CompilerEvidenceItem> = {}): CompilerEvidenceItem => ({
  id: "e1", kind: "fact", claim: "Customers improved conversion by 24%", sourceAuthority: "source", sourceRef: "https://example.com/proof", confidence: "high", allowedUses: ["credibility"], prohibitedUses: [], evidenceType: "quantified-outcome", entityRole: "source", ...overrides
});

describe("deriveWireframeEvidenceSignals", () => {
  it("requires typed, sourced outcome proof", () => {
    expect(deriveWireframeEvidenceSignals([item()])).toMatchObject({ approvedQuantifiedProof: true, approvedProofItemCount: 1, approvedProofRefs: ["e1"] });
    expect(deriveWireframeEvidenceSignals([item({ evidenceType: "positioning", claim: "We help customers" }), item({ sourceRef: "not-a-url" }), item({ sourceRef: "https://user:pass@example.com/proof" })]).approvedProofItemCount).toBe(0);
    expect(deriveWireframeEvidenceSignals([item({ claim: "A customer uses the platform" })]).approvedProofItemCount).toBe(0);
  });

  it("rejects target and visitor metrics, while retaining limited evidence", () => {
    const result = deriveWireframeEvidenceSignals([item({ entityRole: "target" }), item({ entityRole: "visitor", claim: "Target reduced cost by 30%" }), item({ entityRole: undefined })]);
    expect(result).toMatchObject({ approvedProofItemCount: 0, proofAvailability: "limited" });
  });

  it("keeps typed customer outcomes separate from quantified outcomes", () => {
    const result = deriveWireframeEvidenceSignals([
      item({ evidenceType: "customer-outcome", claim: "The program improved adoption", id: "story" }),
      item({ evidenceType: "customer-outcome", claim: "Customer improved adoption by 40%", id: "story-number" })
    ]);
    expect(result).toMatchObject({ approvedCustomerStory: true, approvedQuantifiedProof: false, approvedProofRefs: ["story", "story-number"] });
  });

  it("isolates proof by selected offer and allows an explicit product mention in customer evidence", () => {
    expect(deriveWireframeEvidenceSignals([item({ subject: "Acme CRM" })], "Acme Analytics").approvedProofItemCount).toBe(0);
    expect(deriveWireframeEvidenceSignals([item({ subject: "Acme Analytics" })], "Acme Analytics").approvedProofItemCount).toBe(1);
    expect(deriveWireframeEvidenceSignals([item({ subject: "Customer", claim: "A customer improved conversion by 24% using Acme Analytics" })], "Acme Analytics").approvedProofItemCount).toBe(1);
  });
});
