import { describe, expect, it } from "vitest";

import {
  buildResearchQueryPlanV2,
  reconcileEvidenceRecordsV2,
  type EvidenceRecordV2
} from "@/lib/orchestration/research-query-plan-v2";

describe("ResearchQueryPlanV2", () => {
  it("starts deterministic seller, offer, audience, and proof work from a stable domain", () => {
    const build = () =>
      buildResearchQueryPlanV2({
        sessionId: "session-research",
        revision: 2,
        sellerDomain: "www.example.com",
        companyName: "Example",
        officialNavigationTerms: ["Products", "Industries", "Products"],
        sourceUrls: ["https://example.com/product?ref=visitor#details"],
        targetDomain: "target.example"
      });
    expect(build()).toEqual(build());
    expect(build()).toMatchObject({
      sellerDomain: "example.com",
      revision: 2,
      sourceUrls: ["https://example.com/product?ref=visitor"]
    });
    expect(build().sellerQueries.length).toBeGreaterThanOrEqual(5);
    expect(build().offerQueries.length).toBeGreaterThanOrEqual(2);
    expect(build().audienceQueries[0]?.intent).toBe("buyer_roles_and_jobs");
    expect(build().proofQueries[0]?.intent).toBe("proof_and_demonstrations");
    expect(build().targetQueries?.[0]).toMatchObject({
      intent: "target_priorities",
      authority: "target_official"
    });
  });

  it("rejects an input that has not stabilized to a recognizable domain", () => {
    expect(() =>
      buildResearchQueryPlanV2({
        sessionId: "session-research",
        revision: 1,
        sellerDomain: "example"
      })
    ).toThrow(/recognizable seller domain/i);
  });
});

describe("EvidenceRecordV2 reconciliation", () => {
  const base: EvidenceRecordV2 = {
    id: "seller:offer",
    revision: 3,
    kind: "offer",
    statement: "Example provides a verified workflow product.",
    sourceAuthority: "seller_official",
    confidence: 0.8,
    observedAt: "2026-08-23T12:00:00.000Z",
    supports: ["copy:offer"]
  };

  it("keeps the current revision and lets official evidence outrank third-party context", () => {
    const records = reconcileEvidenceRecordsV2([
      {
        ...base,
        id: "third-party:offer",
        sourceAuthority: "third_party",
        confidence: 0.99
      },
      base,
      {
        ...base,
        id: "stale:offer",
        revision: 2,
        sourceAuthority: "visitor",
        confidence: 1
      }
    ], 3);
    expect(records).toEqual([base]);
  });

  it("preserves target facts separately from seller facts", () => {
    const target: EvidenceRecordV2 = {
      ...base,
      id: "target:priority",
      kind: "target_fact",
      statement: "Target names a public initiative.",
      sourceAuthority: "target_official",
      supports: ["copy:target-observation"]
    };
    const records = reconcileEvidenceRecordsV2([base, target], 3);
    expect(records.map(({ kind }) => kind)).toEqual(["offer", "target_fact"]);
  });
});
