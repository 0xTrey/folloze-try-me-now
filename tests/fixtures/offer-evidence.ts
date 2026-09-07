import type { SessionEvidenceItem } from "../../src/lib/types";

/** Synthetic first-party offer facts for lifecycle/contract tests, never live research. */
export function syntheticOfferEvidence(offer: string, domain: string): SessionEvidenceItem[] {
  return [
    { id: "fixture-offer-positioning", evidenceType: "positioning" as const,
      text: `${offer} gives operations leaders a governed way to move approved work forward.` },
    { id: "fixture-offer-capability", evidenceType: "capability" as const,
      text: `${offer} assigns request reviewers and records approval decisions in a shared queue.` },
    { id: "fixture-offer-workflow", evidenceType: "workflow" as const,
      text: `Operators submit a request to ${offer}; the designated owner reviews exceptions before releasing the approved record.` },
    { id: "fixture-offer-context", evidenceType: "workflow-context" as const,
      text: `Manual approval handoffs require operators to reconcile requests across separate queues.` }
  ].map((item) => ({ ...item, type: "public-positioning", label: "Synthetic official offer evidence",
    sourceUrl: `https://${domain}/offer`, signals: [], disposition: "available", entityRole: "seller",
    confidence: "high", subject: offer }));
}
