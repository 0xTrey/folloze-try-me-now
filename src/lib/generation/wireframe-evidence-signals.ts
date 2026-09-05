import { evidenceSupportsProof, type CompilerEvidenceItem } from "@/lib/generation/messaging-compiler-contracts";

/**
 * Converts compiler evidence into conservative layout signals. Inference and
 * visitor context may inform structure, but only high-confidence facts with a
 * proof-point allowance count as approved proof.
 */
export function deriveWireframeEvidenceSignals(items: readonly CompilerEvidenceItem[]) {
  const approvedProofItems = items.filter(
    evidenceSupportsProof
  );
  const facts = items.filter((item) => item.kind === "fact");
  return {
    approvedQuantifiedProof: approvedProofItems.some((item) => item.evidenceType === "quantified-outcome"),
    approvedCustomerStory: approvedProofItems.some((item) => item.evidenceType === "customer-outcome"),
    proofAvailability: approvedProofItems.length > 0 ? "strong" as const : facts.length > 0 ? "limited" as const : "none" as const,
    evidenceItemCount: items.length,
    approvedProofItemCount: approvedProofItems.length,
    approvedProofRefs: approvedProofItems.map((item) => item.id)
  };
}
