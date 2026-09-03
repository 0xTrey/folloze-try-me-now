import { describe, expect, it } from "vitest";

import { selectDefaultPersonalizationTargets } from "./personalization-default-targets";

describe("selectDefaultPersonalizationTargets", () => {
  it("selects exactly three distinct public accounts and excludes the seller", () => {
    const targets = selectDefaultPersonalizationTargets({
      requestId: "request-a",
      sellerDomain: "partners.cisco.com",
      audience: "Finance leaders in enterprise retail"
    });
    expect(targets).toHaveLength(3);
    expect(new Set(targets.map((target) => target.domain)).size).toBe(3);
    expect(targets.map((target) => target.domain)).not.toContain("cisco.com");
    expect(targets.every((target) => target.role === "Finance leader")).toBe(true);
  });

  it("is deterministic for retries of the same request", () => {
    const input = { requestId: "same-request", sellerDomain: "folloze.com" };
    expect(selectDefaultPersonalizationTargets(input)).toEqual(
      selectDefaultPersonalizationTargets(input)
    );
  });
});
