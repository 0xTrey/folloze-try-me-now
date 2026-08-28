import { describe, expect, it } from "vitest";

import {
  EVIDENCE_USE,
  evidenceClaimId,
  evidenceSourceRef,
  type EvidenceClaim,
  type EvidenceClaimCandidate
} from "./evidence-graph";
import { reconcileEvidenceGraphClaims } from "./evidence-reconciler";

const subjectId = "ent_seller_0000000000000001";

function candidate(input: {
  topic: string;
  statement: string;
  laneId?: string;
  authority?: string;
  status?: EvidenceClaim["status"];
  confidence?: EvidenceClaim["confidence"];
  allowedUses?: string[];
  prohibitedUses?: string[];
  buyerFacing?: boolean;
  locator?: string;
}): EvidenceClaimCandidate {
  const authority = input.authority ?? "seller_official";
  return {
    topic: input.topic,
    laneId: input.laneId ?? "offer",
    claim: {
      id: evidenceClaimId({
        subjectId,
        topic: input.topic,
        claim: input.statement
      }),
      subjectId,
      claim: input.statement,
      status: input.status ?? "fact",
      confidence: input.confidence ?? "high",
      sourceAuthority: authority,
      sourceRef: evidenceSourceRef({
        authority,
        locator: input.locator ?? `${input.laneId ?? "offer"}:${input.statement}`
      }),
      allowedUses: input.allowedUses ?? [
        EVIDENCE_USE.headline,
        EVIDENCE_USE.internalReasoning
      ],
      prohibitedUses: input.prohibitedUses ?? [],
      buyerFacing: input.buyerFacing ?? true
    }
  };
}

describe("Evidence Graph claim reconciliation", () => {
  it("collapses duplicate statements into one claim and keeps the narrower permissions", () => {
    const statement = "Acme sells a workflow automation platform.";
    const result = reconcileEvidenceGraphClaims([
      candidate({
        topic: "offer",
        statement,
        laneId: "offer",
        allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.internalReasoning],
        prohibitedUses: [],
        buyerFacing: true
      }),
      candidate({
        topic: "offer",
        statement,
        laneId: "seller_identity",
        allowedUses: [EVIDENCE_USE.internalReasoning, EVIDENCE_USE.proofPoint],
        prohibitedUses: [EVIDENCE_USE.headline],
        buyerFacing: true
      })
    ]);

    expect(result.claims).toHaveLength(1);
    expect(result.duplicateCandidateCount).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(result.claims[0]).toMatchObject({
      claim: statement,
      allowedUses: [EVIDENCE_USE.internalReasoning],
      prohibitedUses: [EVIDENCE_USE.headline],
      buyerFacing: true
    });
  });

  it("revokes buyer-facing permission when any duplicate withholds it", () => {
    const statement = "Acme reports a measurable onboarding improvement.";
    const [claim] = reconcileEvidenceGraphClaims([
      candidate({ topic: "proof", statement, laneId: "proof", buyerFacing: true }),
      candidate({
        topic: "proof",
        statement,
        laneId: "source",
        buyerFacing: false,
        prohibitedUses: [EVIDENCE_USE.buyerFacingCopy]
      })
    ]).claims;

    expect(claim?.buyerFacing).toBe(false);
    expect(claim?.prohibitedUses).toContain(EVIDENCE_USE.buyerFacingCopy);
    expect(claim?.allowedUses).not.toContain(EVIDENCE_USE.buyerFacingCopy);
  });

  it("resolves a conflict deterministically by source authority", () => {
    const build = () =>
      reconcileEvidenceGraphClaims([
        candidate({
          topic: "category",
          statement: "Acme is a third-party listed analytics vendor.",
          authority: "third_party",
          confidence: "high",
          laneId: "source"
        }),
        candidate({
          topic: "category",
          statement: "Acme is a workflow automation platform.",
          authority: "seller_official",
          confidence: "medium",
          laneId: "seller_identity",
          prohibitedUses: [EVIDENCE_USE.proofPoint]
        })
      ]);

    const first = build();
    expect(build()).toEqual(first);
    expect(first.claims).toHaveLength(1);
    expect(first.claims[0]).toMatchObject({
      claim: "Acme is a workflow automation platform.",
      sourceAuthority: "seller_official",
      confidence: "medium"
    });
    expect(first.conflicts[0]).toMatchObject({
      topic: "category",
      resolution: "source_authority",
      confidenceDowngraded: false
    });
    expect(first.conflicts[0]?.supersededClaimIds).toHaveLength(1);
    expect(first.supersededClaimIds).toEqual(first.conflicts[0]?.supersededClaimIds);
  });

  it("narrows the winning claim to the losing candidate's permissions", () => {
    const [claim] = reconcileEvidenceGraphClaims([
      candidate({
        topic: "proof",
        statement: "Acme published a named customer result.",
        authority: "seller_official",
        allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.proofPoint],
        buyerFacing: true
      }),
      candidate({
        topic: "proof",
        statement: "Acme published an unnamed customer result.",
        authority: "third_party",
        allowedUses: [EVIDENCE_USE.proofPoint],
        prohibitedUses: [EVIDENCE_USE.headline],
        buyerFacing: false
      })
    ]).claims;

    expect(claim?.claim).toBe("Acme published a named customer result.");
    expect(claim?.allowedUses).toEqual([EVIDENCE_USE.proofPoint]);
    expect(claim?.prohibitedUses).toEqual([EVIDENCE_USE.headline]);
    expect(claim?.buyerFacing).toBe(false);
  });

  it("downgrades confidence when two equal-authority sources disagree", () => {
    const result = reconcileEvidenceGraphClaims([
      candidate({
        topic: "audience",
        statement: "Acme sells to revenue operations leaders.",
        confidence: "high",
        laneId: "audience"
      }),
      candidate({
        topic: "audience",
        statement: "Acme sells to customer support leaders.",
        confidence: "high",
        laneId: "seller_identity"
      })
    ]);

    expect(result.claims[0]?.confidence).toBe("medium");
    expect(result.conflicts[0]).toMatchObject({
      resolution: "stable_id",
      confidenceDowngraded: true
    });
  });

  it("rejects a candidate with no statement, subject, or source", () => {
    const valid = candidate({ topic: "offer", statement: "Acme sells a platform." });
    const result = reconcileEvidenceGraphClaims([
      valid,
      { ...valid, claim: { ...valid.claim, id: "clm_blank", claim: "  " } },
      { ...valid, claim: { ...valid.claim, id: "clm_nosource", sourceRef: "" } },
      { ...valid, topic: "  ", claim: { ...valid.claim, id: "clm_notopic" } }
    ]);

    expect(result.claims).toHaveLength(1);
    expect(result.rejectedClaimIds).toEqual([
      "clm_blank",
      "clm_nosource",
      "clm_notopic"
    ]);
  });

  it("reports which subject and topic pairs resolved", () => {
    const result = reconcileEvidenceGraphClaims([
      candidate({ topic: "Offer", statement: "Acme sells a platform." }),
      candidate({ topic: "audience", statement: "Acme sells to operations leaders." })
    ]);

    expect(result.coverage.map(({ topic }) => topic)).toEqual(["audience", "offer"]);
  });
});
