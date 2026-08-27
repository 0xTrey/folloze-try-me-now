import { describe, expect, it } from "vitest";

import {
  detectCopyClaims,
  unsupportedCopyClaims,
  type CopyClaimKind
} from "@/lib/generation/section-claim-coverage";
import type { SectionEvidenceClaim } from "@/lib/generation/section-copy-types";
import type { EvidenceKindV2 } from "@/lib/generation/three-family-contract";

const revision = 3;

function claim(
  id: string,
  text: string,
  kind: EvidenceKindV2,
  sourceRole: SectionEvidenceClaim["sourceRole"]
): SectionEvidenceClaim {
  return { id, text, confidence: 0.9, revision, sourceRole, kind };
}

const EVIDENCE: SectionEvidenceClaim[] = [
  claim(
    "ev-seller-1",
    "Vibration thresholds open work orders automatically across every packaging line.",
    "seller_fact",
    "seller"
  ),
  claim(
    "ev-proof-1",
    "Reliability teams recorded 30% fewer unplanned stops in the first quarter.",
    "proof",
    "source"
  ),
  claim(
    "ev-target-1",
    "The Dunmore consolidation programme merges three regional maintenance depots.",
    "target_fact",
    "target"
  ),
  claim(
    "ev-offer-1",
    "The reliability working session reviews your current maintenance interval.",
    "offer",
    "offer"
  ),
  claim(
    "ev-audience-1",
    "Plant reliability managers answer for downtime against production targets.",
    "audience",
    "visitor"
  )
];

function kindsOf(claims: readonly { kind: CopyClaimKind }[]): CopyClaimKind[] {
  return [...new Set(claims.map((detected) => detected.kind))].sort();
}

describe("claim detection covers every kind a reader would verify", () => {
  const cases: readonly { kind: CopyClaimKind; text: string }[] = [
    { kind: "numeric", text: "Teams cut 30% of unplanned stops." },
    { kind: "currency", text: "Recovering $1.2m of lost output." },
    { kind: "comparative", text: "Detects bearing wear faster than a monthly inspection." },
    { kind: "qualitative", text: "The only platform built for line reliability." },
    {
      kind: "product",
      text: "Vibration thresholds raise work orders on every packaging line."
    },
    {
      kind: "account",
      text: "Your Dunmore consolidation programme merges regional depots."
    },
    {
      kind: "offer",
      text: "The reliability working session reviews your maintenance interval."
    },
    {
      kind: "audience",
      text: "Reliability managers answer for downtime against production targets."
    }
  ];

  for (const { kind, text } of cases) {
    it(`detects a ${kind} claim`, () => {
      expect(kindsOf(detectCopyClaims(text, EVIDENCE))).toContain(kind);
    });
  }

  it("reads ordinary copy that asserts nothing as claim-free", () => {
    expect(detectCopyClaims("See how the approach works.", EVIDENCE)).toEqual([]);
  });
});

describe("claims must cite evidence of a kind that could support them", () => {
  it("accepts a numeric claim quoted from cited proof", () => {
    expect(
      unsupportedCopyClaims({
        text: "Reliability teams recorded 30% fewer unplanned stops.",
        citedRefs: ["ev-proof-1"],
        evidence: EVIDENCE
      })
    ).toEqual([]);
  });

  it("rejects a numeric claim that no cited evidence states", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Reliability teams recorded 80% fewer unplanned stops.",
          citedRefs: ["ev-proof-1"],
          evidence: EVIDENCE
        })
      )
    ).toEqual(["numeric"]);
  });

  it("rejects a numeric claim that cites nothing at all", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Cut 30% of unplanned stops.",
          citedRefs: [],
          evidence: EVIDENCE
        })
      )
    ).toEqual(["numeric"]);
  });

  it("rejects an invented currency figure", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Recover $1.2m of lost output every quarter.",
          citedRefs: ["ev-proof-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("currency");
  });

  it("rejects a comparative claim with no proof behind it", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Spots bearing wear faster than a monthly inspection round.",
          citedRefs: ["ev-proof-1"],
          evidence: EVIDENCE
        })
      )
    ).toEqual(["comparative"]);
  });

  it("rejects an unsupported qualitative superlative", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "The only platform built for plant reliability.",
          citedRefs: ["ev-proof-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("qualitative");
  });

  it("rejects a qualitative superlative citing only seller-supplied evidence", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Industry-leading coverage for every line.",
          citedRefs: ["ev-seller-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("qualitative");
  });

  it("accepts a product claim that cites the seller fact describing it", () => {
    expect(
      unsupportedCopyClaims({
        text: "Vibration thresholds raise work orders on every packaging line.",
        citedRefs: ["ev-seller-1"],
        evidence: EVIDENCE
      })
    ).toEqual([]);
  });

  it("rejects a product claim that cites unrelated evidence", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Vibration thresholds raise work orders on every packaging line.",
          citedRefs: ["ev-audience-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("product");
  });

  it("rejects an account claim that cites no account evidence", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Your Dunmore consolidation programme merges regional depots.",
          citedRefs: ["ev-seller-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("account");
  });

  it("accepts an account claim that cites the account fact", () => {
    expect(
      unsupportedCopyClaims({
        text: "Your Dunmore consolidation programme merges regional depots.",
        citedRefs: ["ev-target-1"],
        evidence: EVIDENCE
      })
    ).toEqual([]);
  });

  it("rejects an offer claim that cites no offer evidence", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "The reliability working session reviews your maintenance interval.",
          citedRefs: ["ev-seller-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("offer");
  });

  it("rejects an audience claim that cites no audience evidence", () => {
    expect(
      kindsOf(
        unsupportedCopyClaims({
          text: "Reliability managers answer for downtime against production targets.",
          citedRefs: ["ev-seller-1"],
          evidence: EVIDENCE
        })
      )
    ).toContain("audience");
  });

  it("treats an unlabelled claim as any kind its source role admits", () => {
    const unlabelled: SectionEvidenceClaim = {
      id: "ev-legacy-1",
      text: "Reliability teams recorded 30% fewer unplanned stops in the first quarter.",
      confidence: 0.8,
      revision,
      sourceRole: "source"
    };

    expect(
      unsupportedCopyClaims({
        text: "Reliability teams recorded 30% fewer unplanned stops.",
        citedRefs: ["ev-legacy-1"],
        evidence: [unlabelled]
      })
    ).toEqual([]);
  });
});
