import { describe, expect, it } from "vitest";

import { isGenerationReady } from "@/lib/orchestrator";

describe("isGenerationReady", () => {
  const common = {
    audience: "Demand generation leaders",
    objective: "Book meetings"
  };

  it("requires a target account for 1:1 ABM", () => {
    expect(isGenerationReady("abm", common)).toBe(false);
    expect(isGenerationReady("abm", { ...common, targetDomain: "target.com" })).toBe(true);
  });

  it("keeps events inside the campaign path and requires event facts", () => {
    expect(isGenerationReady("campaign", { ...common, campaignType: "product" })).toBe(true);
    expect(isGenerationReady("campaign", { ...common, campaignType: "event" })).toBe(false);
    expect(
      isGenerationReady("campaign", {
        ...common,
        campaignType: "event",
        eventSource: "September 12 webinar for revenue leaders"
      })
    ).toBe(true);
  });

  it("requires a content URL or uploaded source", () => {
    expect(isGenerationReady("content", common)).toBe(false);
    expect(isGenerationReady("content", { ...common, sourceUrl: "https://example.com/report" })).toBe(true);
    expect(isGenerationReady("content", { ...common, sourceName: "report.pdf" })).toBe(true);
  });
});
