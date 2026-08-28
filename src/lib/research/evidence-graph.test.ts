import { describe, expect, it } from "vitest";

import {
  EVIDENCE_GRAPH_SCHEMA_VERSION,
  EVIDENCE_USE,
  evidenceClaimId,
  evidenceGapCode,
  evidenceGraphClaimSet,
  evidenceGraphDigest,
  evidenceGraphTraceReceipt,
  evidenceSourceRef,
  narrowPermissions,
  normalizeClaimText,
  normalizePermissions,
  unknownEvidenceClaim,
  type EvidenceClaim,
  type EvidenceGraph
} from "./evidence-graph";

const subjectId = "ent_seller_00000000000000ab";

function claim(overrides: Partial<EvidenceClaim> = {}): EvidenceClaim {
  const statement = overrides.claim ?? "Acme sells a workflow automation platform.";
  return {
    id: evidenceClaimId({ subjectId, topic: "offer", claim: statement }),
    subjectId,
    claim: statement,
    status: "fact",
    confidence: "high",
    sourceAuthority: "seller_official",
    sourceRef: evidenceSourceRef({ authority: "seller_official", locator: "offer" }),
    allowedUses: [EVIDENCE_USE.headline],
    prohibitedUses: [],
    buyerFacing: true,
    ...overrides
  };
}

function graph(overrides: Partial<EvidenceGraph> = {}): EvidenceGraph {
  return {
    schemaVersion: EVIDENCE_GRAPH_SCHEMA_VERSION,
    revision: 2,
    inputFingerprint: "fp-acme",
    entities: [
      { id: subjectId, kind: "seller", canonicalName: "Acme", aliases: ["acme.example"] }
    ],
    claims: [claim()],
    relationships: [],
    gaps: [],
    timings: { total: 12 },
    ...overrides
  };
}

describe("normalizeClaimText", () => {
  it("strips markup and control characters and bounds the statement", () => {
    expect(normalizeClaimText("<p>Acme\u0000 sells\n\n a platform.</p>")).toBe(
      "Acme sells a platform."
    );
    expect(normalizeClaimText("a".repeat(400))).toHaveLength(240);
  });
});

describe("evidenceSourceRef", () => {
  it("hashes the locator so a query-bearing URL is never recoverable", () => {
    const ref = evidenceSourceRef({
      authority: "seller_official",
      locator: "https://acme.example/platform?utm_source=visitor"
    });

    expect(ref).toMatch(/^src_seller_official_[a-f0-9]{20}$/);
    expect(ref).not.toContain("acme");
    expect(ref).not.toContain("utm_source");
  });

  it("stays stable for one locator and differs across locators", () => {
    const first = evidenceSourceRef({ authority: "visitor", locator: "answers:offer" });
    expect(evidenceSourceRef({ authority: "visitor", locator: "answers:offer" })).toBe(first);
    expect(
      evidenceSourceRef({ authority: "visitor", locator: "answers:audience" })
    ).not.toBe(first);
  });
});

describe("permission handling", () => {
  it("removes an allowed use that is also prohibited on the same claim", () => {
    expect(
      normalizePermissions({
        allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.proofPoint],
        prohibitedUses: [EVIDENCE_USE.proofPoint],
        buyerFacing: true
      })
    ).toEqual({
      allowedUses: [EVIDENCE_USE.headline],
      prohibitedUses: [EVIDENCE_USE.proofPoint],
      buyerFacing: true
    });
  });

  it("intersects allowed uses and unions prohibited uses across members", () => {
    expect(
      narrowPermissions([
        {
          allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.internalReasoning],
          prohibitedUses: [],
          buyerFacing: true
        },
        {
          allowedUses: [EVIDENCE_USE.internalReasoning, EVIDENCE_USE.proofPoint],
          prohibitedUses: [EVIDENCE_USE.headline],
          buyerFacing: true
        }
      ])
    ).toEqual({
      allowedUses: [EVIDENCE_USE.internalReasoning],
      prohibitedUses: [EVIDENCE_USE.headline],
      buyerFacing: true
    });
  });

  it("never widens permissions, whatever the member order", () => {
    const members = [
      { allowedUses: [EVIDENCE_USE.headline], prohibitedUses: [], buyerFacing: true },
      { allowedUses: [], prohibitedUses: [EVIDENCE_USE.buyerFacingCopy], buyerFacing: false }
    ];

    expect(narrowPermissions(members)).toEqual(narrowPermissions([...members].reverse()));
    expect(narrowPermissions(members)).toEqual({
      allowedUses: [],
      prohibitedUses: [EVIDENCE_USE.buyerFacingCopy],
      buyerFacing: false
    });
  });
});

describe("unknownEvidenceClaim", () => {
  it("is an explicit unknown with no buyer-facing permission", () => {
    expect(unknownEvidenceClaim({ subjectId, topic: "proof" })).toMatchObject({
      status: "unknown",
      confidence: "low",
      buyerFacing: false,
      allowedUses: []
    });
  });
});

describe("evidenceGraphDigest", () => {
  it("ignores timings and member ordering", () => {
    const second = claim({ claim: "Acme serves regulated operations teams." });

    expect(
      evidenceGraphDigest(graph({ claims: [claim(), second], timings: { total: 1 } }))
    ).toBe(
      evidenceGraphDigest(graph({ claims: [second, claim()], timings: { total: 999 } }))
    );
  });

  it("changes when a claim, gap, revision, or fingerprint changes", () => {
    const base = evidenceGraphDigest(graph());

    expect(evidenceGraphDigest(graph({ claims: [] }))).not.toBe(base);
    expect(evidenceGraphDigest(graph({ gaps: [evidenceGapCode("proof", "timeout")] }))).not.toBe(base);
    expect(evidenceGraphDigest(graph({ revision: 3 }))).not.toBe(base);
    expect(evidenceGraphDigest(graph({ inputFingerprint: "fp-other" }))).not.toBe(base);
    expect(evidenceGraphDigest(graph({ claims: [claim({ buyerFacing: false })] }))).not.toBe(base);
  });
});

describe("evidenceGraphClaimSet", () => {
  it("sorts and encodes status, confidence, and buyer-facing permission", () => {
    expect(evidenceGraphClaimSet(graph())).toEqual([
      `${subjectId}|fact|high|public|${claim().id}`
    ]);
  });
});

describe("evidenceGraphTraceReceipt", () => {
  it("counts claims by status and hashes the input fingerprint", () => {
    const receipt = evidenceGraphTraceReceipt(
      graph({
        claims: [claim(), unknownEvidenceClaim({ subjectId, topic: "proof" })],
        gaps: ["proof:timeout"]
      }),
      [
        {
          laneId: "proof",
          outcome: "timeout",
          durationMs: 800,
          queryCount: 1,
          entityCount: 0,
          claimCount: 0,
          gapCount: 1
        }
      ]
    );

    expect(receipt).toMatchObject({
      claimCount: 2,
      factCount: 1,
      unknownCount: 1,
      buyerFacingClaimCount: 1,
      gaps: ["proof:timeout"]
    });
    expect(receipt.inputFingerprintDigest).toMatch(/^fp_[a-f0-9]{20}$/);
    expect(JSON.stringify(receipt)).not.toContain("Acme");
  });
});
