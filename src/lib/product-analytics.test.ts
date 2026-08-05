import { beforeEach, describe, expect, it } from "vitest";

import type { TryMeSession } from "@/lib/types";

import {
  clearMemoryProductAnalyticsForTest,
  getMemoryProductEventsForTest,
  getMemoryProductSessionForTest,
  parseProductEventBatch,
  productSessionSnapshot,
  recordProductEvents,
  recordProductSessionSnapshot,
  userInputSnapshot
} from "./product-analytics";

const identity = {
  visitorId: "tmv_1234567890abcdef",
  browserSessionId: "tmb_1234567890abcdef"
};

describe("first-party product analytics", () => {
  beforeEach(clearMemoryProductAnalyticsForTest);

  it("accepts a bounded event batch and deduplicates event IDs", async () => {
    const events = parseProductEventBatch({
      events: [{
        eventId: "tme_1234567890abcdef",
        ...identity,
        event: "ui_click",
        category: "interaction",
        path: "/",
        properties: { element_id: "campaign-card", has_value: true }
      }]
    });
    await expect(recordProductEvents(events)).resolves.toBe(1);
    await expect(recordProductEvents(events)).resolves.toBe(0);
    expect(getMemoryProductEventsForTest()).toHaveLength(1);
  });

  it("accepts generated-preview interactions as bounded product events", () => {
    expect(() => parseProductEventBatch({
      events: [{
        eventId: "tme_preview123456789",
        ...identity,
        sessionId: "session_12345678",
        event: "preview_interaction",
        category: "interaction",
        path: "/",
        properties: {
          interaction_type: "section_view",
          interaction_target: "proof"
        }
      }]
    })).not.toThrow();
  });

  it("rejects unknown events, arbitrary nested data, and contact data", () => {
    const base = {
      eventId: "tme_1234567890abcdef",
      ...identity,
      category: "interaction",
      path: "/"
    };
    expect(() => parseProductEventBatch({ events: [{ ...base, event: "capture_everything" }] })).toThrow();
    expect(() => parseProductEventBatch({
      events: [{ ...base, event: "ui_click", properties: { nested: { unsafe: true } } }]
    })).toThrow();
    expect(() => parseProductEventBatch({
      events: [{ ...base, event: "ui_click", properties: { label: "person@example.com" } }]
    })).toThrow();
  });

  it("keeps exact submitted inputs in the private session snapshot but excludes provider IDs", async () => {
    const session = {
      id: "session_12345678",
      traceId: "trace_12345678",
      analytics: identity,
      editorTokenHash: "hash",
      useCase: "campaign",
      companyDomain: "6sense.com",
      status: "collecting",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:01:00.000Z",
      temporaryUrl: "https://example.test/e/session_12345678",
      revision: 2,
      stages: {
        brand: { status: "complete" },
        audience: { status: "running" },
        story: { status: "pending" }
      },
      answers: {
        campaignType: "product",
        offerSourceUrl: "https://6sense.com/platform/revvyai/",
        sourceOpenAIFileId: "file-secret",
        sourceUploadId: "upload-secret"
      },
      audienceSuggestions: [],
      events: []
    } satisfies TryMeSession;

    expect(userInputSnapshot(session.answers)).toMatchObject({
      campaignType: "product",
      offerSourceUrl: "https://6sense.com/platform/revvyai/",
      sourceType: "pdf-upload"
    });
    expect(userInputSnapshot(session.answers)).not.toHaveProperty("sourceOpenAIFileId");
    expect(productSessionSnapshot(session).visitorId).toBe(identity.visitorId);
    await recordProductSessionSnapshot(session);
    expect(getMemoryProductSessionForTest(session.id)?.inputSnapshot).toMatchObject({
      campaignType: "product"
    });
  });
});
