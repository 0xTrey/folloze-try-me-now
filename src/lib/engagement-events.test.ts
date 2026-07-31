import { beforeEach, describe, expect, it } from "vitest";

import {
  clearMemoryEngagementEventsForTest,
  getMemoryEngagementEventsForTest,
  parseEngagementEventPayload,
  recordEngagementEvent
} from "@/lib/engagement-events";

describe("engagement event sink", () => {
  beforeEach(clearMemoryEngagementEventsForTest);

  it("accepts only the analytics proof allowlist and stores bounded context", async () => {
    const payload = parseEngagementEventPayload({
      sessionId: "session_12345678",
      event: "section_dwell",
      context: { sectionId: "decision-path", seconds: 19 }
    });

    await expect(recordEngagementEvent(payload)).resolves.toBe(true);
    expect(getMemoryEngagementEventsForTest()).toEqual([
      expect.objectContaining({
        sessionId: "session_12345678",
        event: "section_dwell",
        context: { sectionId: "decision-path", seconds: 19 },
        createdAt: expect.any(String)
      })
    ]);
  });

  it("rejects unknown events and unbounded or sensitive payload fields", () => {
    expect(() => parseEngagementEventPayload({
      sessionId: "session_12345678",
      event: "raw_form_submit",
      context: {}
    })).toThrow();
    expect(() => parseEngagementEventPayload({
      sessionId: "session_12345678",
      event: "cta_click",
      context: { label: "person@example.com" }
    })).toThrow();
    expect(() => parseEngagementEventPayload({
      sessionId: "session_12345678",
      event: "cta_click",
      context: { html: "<main>generated experience</main>" }
    })).toThrow();
  });
});

