import { describe, expect, it } from "vitest";
import { experienceResumeTarget, parseExperienceHandoff } from "./experience-handoff";

describe("owned experience return links", () => {
  it("accepts only session locators and the two known panels", () => {
    expect(experienceResumeTarget("?session=ready-session&panel=analytics")).toEqual({ sessionId: "ready-session", panel: "analytics" });
    expect(experienceResumeTarget("?session=ready-session&panel=personalize")?.panel).toBe("personalize");
    for (const search of ["?session=../admin&panel=analytics", "?session=short&panel=analytics", "?session=ready-session&panel=edit", "?session=ready-session"]) expect(experienceResumeTarget(search)).toBeUndefined();
  });
  it("keeps only bounded, recent non-contact activity from this tab", () => {
    const now = 1_000_000;
    const raw = JSON.stringify({ savedAt: now, engagedSeconds: 43, token: "never retained", events: [
      { action: "section_view", at: now - 500, context: { sectionId: "value", sectionTitle: "Value story", email: "private@example.com", lensTitle: "private@example.com" } },
      { action: "unknown_action", at: now - 500, context: {} },
      { action: "cta_click", at: now + 100, context: {} }
    ] });
    expect(parseExperienceHandoff(raw, now)).toEqual({ engagedSeconds: 43, events: [{ action: "section_view", at: now - 500, context: { sectionId: "value", sectionTitle: "Value story" } }] });
  });
  it("ignores malformed, oversized and stale handoffs", () => {
    for (const raw of [null, "not json", "x".repeat(40_001), JSON.stringify({ savedAt: 1, events: [] })]) expect(parseExperienceHandoff(raw, 1_000_000)).toEqual({ events: [], engagedSeconds: 0 });
  });
});
