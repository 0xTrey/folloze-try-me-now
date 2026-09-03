import { beforeEach, describe, expect, it } from "vitest";

import type { TryMeSession } from "@/lib/types";

import {
  analyticsIdentityWithAttributionFromRequest,
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

  it("captures bounded UTM attribution with the server-side session identity", () => {
    const request = new Request("https://try.example/api/sessions", { headers: {
      "X-Try-Me-Visitor-Id": identity.visitorId,
      "X-Try-Me-Browser-Session-Id": identity.browserSessionId,
      "X-Try-Me-Utm-Source": "linkedin",
      "X-Try-Me-Utm-Campaign": "fall-launch"
    } });
    expect(analyticsIdentityWithAttributionFromRequest(request)).toMatchObject({
      ...identity, utm: { source: "linkedin", campaign: "fall-launch" }
    });
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
    expect(() => parseProductEventBatch({
      events: [{
        eventId: "tme_personalize234567",
        ...identity,
        event: "personalization_targets_submitted",
        category: "conversion",
        properties: { target_count: 3, selection_mode: "representative" }
      }]
    })).not.toThrow();
  });

  it("rejects unknown events, arbitrary nested data, contact data, and raw domains", () => {
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
    expect(() => parseProductEventBatch({
      events: [{ ...base, event: "ui_click", properties: { label: "cisco.com" } }]
    })).toThrow();
    expect(() => parseProductEventBatch({
      events: [{ ...base, event: "domain_stabilized", category: "input", properties: { domain: "acme.com" } }]
    })).toThrow();
  });

  it("accepts unified builder events under their property contracts", () => {
    expect(() => parseProductEventBatch({
      events: [{
        eventId: "tme_unified123456789",
        ...identity,
        event: "personalization_variant_viewed",
        category: "interaction",
        properties: { variant_id: "account_industry_persona_a", has_evidence: true }
      }]
    })).not.toThrow();
  });

  it("tracks the three-account funnel without accepting account identity", () => {
    expect(() => parseProductEventBatch({
      events: [{
        eventId: "tme_personalize123456",
        ...identity,
        event: "personalization_batch_status_changed",
        category: "workflow",
        properties: {
          request_status: "partial",
          ready_count: 1,
          review_count: 1,
          failed_count: 1
        }
      }]
    })).not.toThrow();
    expect(() => parseProductEventBatch({
      events: [{
        eventId: "tme_personalize654321",
        ...identity,
        event: "personalization_targets_submitted",
        category: "conversion",
        properties: { target_count: 3, target_domain: "acme.com" }
      }]
    })).toThrow();
  });

  it("keeps only bounded presence signals in the behavior session snapshot", async () => {
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

    expect(userInputSnapshot(session.answers)).toEqual({
      campaignType: "product",
      hasOfferSourceUrl: true,
      sourceType: "pdf-upload"
    });
    expect(userInputSnapshot(session.answers)).not.toHaveProperty("sourceOpenAIFileId");
    expect(userInputSnapshot(session.answers)).not.toHaveProperty("offerSourceUrl");
    expect(productSessionSnapshot(session).visitorId).toBe(identity.visitorId);
    expect(productSessionSnapshot(session)).toMatchObject({
      companyDomain: "redacted",
      inputSnapshot: {
        campaignType: "product",
        hasOfferSourceUrl: true,
        sourceType: "pdf-upload"
      }
    });
    expect(productSessionSnapshot(session)).not.toHaveProperty("targetDomain");
    expect(productSessionSnapshot(session)).not.toHaveProperty("businessEmail");
    await recordProductSessionSnapshot(session);
    expect(getMemoryProductSessionForTest(session.id)?.inputSnapshot).toMatchObject({
      campaignType: "product"
    });
    expect(JSON.stringify(getMemoryProductSessionForTest(session.id))).not.toMatch(
      /6sense\.com|revvyai|file-secret|upload-secret/i
    );
  });

  it("accepts legacy referrer host input but removes the raw domain before storage", () => {
    const [event] = parseProductEventBatch({
      events: [{
        eventId: "tme_referrerredact01",
        ...identity,
        event: "visitor_session_started",
        category: "navigation",
        path: "/",
        landing: {
          path: "/",
          referrerHost: "private.example",
          deviceClass: "desktop",
          browserFamily: "Chrome"
        }
      }]
    });

    expect(event.landing).not.toHaveProperty("referrerHost");
    expect(JSON.stringify(event)).not.toContain("private.example");
  });
});
