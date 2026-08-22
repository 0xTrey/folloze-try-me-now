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
      eventId: "event_12345678",
      sessionId: "session_12345678",
      event: "section_dwell",
      context: { sectionId: "decision-path", seconds: 19 }
    });

    await expect(recordEngagementEvent(payload)).resolves.toBe(true);
    expect(getMemoryEngagementEventsForTest()).toEqual([
      expect.objectContaining({
        sessionId: "session_12345678",
        eventId: "event_12345678",
        event: "section_dwell",
        context: { sectionId: "decision-path", seconds: 19 },
        createdAt: expect.any(String)
      })
    ]);
  });

  it("deduplicates a retried event by its bounded idempotency key", async () => {
    const payload = parseEngagementEventPayload({
      eventId: "event_retry_12345678",
      sessionId: "session_12345678",
      event: "cta_click",
      context: { ctaId: "primary-cta" }
    });

    await expect(recordEngagementEvent(payload)).resolves.toBe(true);
    await expect(recordEngagementEvent(payload)).resolves.toBe(false);
    expect(getMemoryEngagementEventsForTest()).toHaveLength(1);
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
    expect(() => parseEngagementEventPayload({
      sessionId: "session_12345678",
      event: "experience_view",
      context: { sourceBody: "Private source document body" }
    })).toThrow();
  });

  it("accepts resource clicks as generated-experience engagement, separate from product analytics", async () => {
    const payload = parseEngagementEventPayload({
      eventId: "event_resource_123456",
      sessionId: "session_12345678",
      event: "resource_click",
      context: { resourceId: "proof-deck", area: "resources" }
    });
    await expect(recordEngagementEvent(payload)).resolves.toBe(true);
    expect(getMemoryEngagementEventsForTest()).toEqual([
      expect.objectContaining({
        event: "resource_click",
        context: { resourceId: "proof-deck", area: "resources" }
      })
    ]);
  });
});
