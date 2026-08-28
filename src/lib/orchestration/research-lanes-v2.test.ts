import { describe, expect, it } from "vitest";

import {
  buildResearchQueryPlanV2,
  planResearchLanesV2,
  researchLaneOrderV2,
  researchSourceAuthorityRankV2
} from "@/lib/orchestration/research-query-plan-v2";

describe("planResearchLanesV2", () => {
  it("derives independent lanes in a stable order from a bounded plan", () => {
    const lanes = planResearchLanesV2(
      buildResearchQueryPlanV2({
        sessionId: "session-lanes",
        revision: 1,
        sellerDomain: "acme.example",
        companyName: "Acme",
        sourceUrls: ["https://acme.example/platform"],
        targetDomain: "target.example"
      })
    );

    expect(lanes.map(({ id }) => id)).toEqual([
      "seller_identity",
      "offer",
      "audience",
      "proof",
      "target",
      "source"
    ]);
    expect(lanes.map(({ id }) => id)).toEqual(
      [...lanes].sort(
        (left, right) =>
          researchLaneOrderV2.indexOf(left.id) - researchLaneOrderV2.indexOf(right.id)
      ).map(({ id }) => id)
    );
    expect(lanes.find((lane) => lane.id === "target")?.authority).toBe("target_official");
    expect(lanes.find((lane) => lane.id === "source")?.sourceUrls).toEqual([
      "https://acme.example/platform"
    ]);
  });

  it("omits lanes with no queries and no source URLs", () => {
    const lanes = planResearchLanesV2(
      buildResearchQueryPlanV2({
        sessionId: "session-lanes",
        revision: 1,
        sellerDomain: "acme.example"
      })
    );

    expect(lanes.map(({ id }) => id)).not.toContain("target");
    expect(lanes.map(({ id }) => id)).not.toContain("source");
  });
});

describe("researchSourceAuthorityRankV2", () => {
  it("ranks visitor above official and official above third party", () => {
    expect(researchSourceAuthorityRankV2("visitor")).toBeGreaterThan(
      researchSourceAuthorityRankV2("seller_official")
    );
    expect(researchSourceAuthorityRankV2("seller_official")).toBeGreaterThan(
      researchSourceAuthorityRankV2("third_party")
    );
  });

  it("gives an unrecognized authority the lowest rank", () => {
    expect(researchSourceAuthorityRankV2("mystery_blog")).toBe(0);
  });
});
