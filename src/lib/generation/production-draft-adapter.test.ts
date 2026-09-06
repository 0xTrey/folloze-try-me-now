import { describe, expect, it } from "vitest";

import { bounded } from "./production-draft-adapter";

describe("production draft adapter bounds", () => {
  it("falls back instead of cutting a headline mid-clause", () => {
    expect(bounded("Connect teams with clearer operating context for every decision", 8, 24, "Explore the offer")).toBe("Explore the offer");
  });

  it("keeps the first complete sentence when it fits", () => {
    expect(bounded("Review the workflow. Then compare the next path.", 8, 32, "Fallback")).toBe("Review the workflow.");
  });
});
