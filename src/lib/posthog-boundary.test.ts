/** @vitest-environment jsdom */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() }
}));

import posthog from "posthog-js";

import { postHogBrowserConfig, sanitizePostHogCapture } from "@/lib/posthog-config";
import { postHogEventPayload, postHogSafeProperties } from "@/lib/posthog-payload";

type Client = typeof import("@/lib/product-analytics-client");

let client: Client;

/** Everything a capture call is allowed to carry. Nothing else may appear. */
const ALLOWED_KEYS = new Set([
  "$insert_id",
  "event_category",
  "event_outcome",
  "duration_ms",
  "correlation_key",
  "recommendation_kind",
  "option_count",
  "rank",
  "was_default",
  "section_role",
  "position",
  "dwell_bucket",
  "interaction_type",
  "asset_role",
  "area",
  "route_family",
  "artifact_revision",
  "research_scope",
  "source_count",
  "claim_step",
  "trigger",
  "element_type",
  "element_id",
  "error_name",
  "field_type",
  "has_value",
  "length_bucket",
  "identity_source"
]);

const FORBIDDEN_VALUE =
  /buyer@|acme\.example|https?:\/\/|TMN-|tmv_|tmb_|<[a-z]|Cut unplanned dwell|Where the dwell/i;

function captures(): { event: string; payload: Record<string, unknown> }[] {
  return vi
    .mocked(posthog.capture)
    .mock.calls.map(([event, payload]) => ({
      event: String(event),
      payload: (payload ?? {}) as Record<string, unknown>
    }));
}

describe("PostHog carries behavior and nothing else", () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_boundary_fixture";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://posthog.example";
    client = await import("@/lib/product-analytics-client");
  });

  beforeEach(() => {
    vi.mocked(posthog.capture).mockClear();
    vi.mocked(posthog.identify).mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 202 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends only allowlisted keys on a captured event", () => {
    client.captureProductEvent("page_viewed", {
      category: "navigation",
      outcome: "info",
      durationMs: 1_200,
      properties: { route_family: "launch", position: 2 },
      sessionId: "session_boundary_fixture"
    });

    const [capture] = captures();
    expect(capture).toBeDefined();
    expect(Object.keys(capture!.payload).every((key) => ALLOWED_KEYS.has(key))).toBe(true);
    expect(capture!.payload).toMatchObject({
      route_family: "launch",
      position: 2,
      event_category: "navigation",
      event_outcome: "info",
      duration_ms: 1_200
    });
  });

  it("omits visitor, browser-session, and product-session identity", () => {
    client.setProductAnalyticsSessionId("session_boundary_fixture");
    client.captureProductEvent("page_viewed", { category: "navigation" });
    const identity = client.productAnalyticsIdentity()!;

    const serialized = JSON.stringify(captures());
    expect(serialized).not.toContain(identity.visitorId);
    expect(serialized).not.toContain(identity.browserSessionId);
    expect(serialized).not.toContain("session_boundary_fixture");
    expect(serialized).not.toMatch(/visitor|browser_session|session_id/i);
  });

  it("drops a forbidden property injected at the call site", () => {
    client.captureProductEvent("page_viewed", {
      category: "navigation",
      properties: {
        section_title: "Where the dwell time goes",
        value_prop_label: "Cut unplanned dwell time",
        try_me_visitor_id: "tmv_0123456789abcdef",
        trace_id: "trace_boundary_fixture",
        support_ref: "TMN-ABCDEFGH",
        email: "buyer@acme.example",
        source_url: "https://acme.example/pricing",
        body: "<p>Generated body copy</p>",
        section_role: "current-friction"
      }
    });

    const [capture] = captures();
    expect(capture!.payload.section_role).toBe("current-friction");
    expect(JSON.stringify(capture)).not.toMatch(FORBIDDEN_VALUE);
    for (const key of ["section_title", "value_prop_label", "try_me_visitor_id", "trace_id",
      "support_ref", "email", "source_url", "body"]) {
      expect(capture!.payload[key]).toBeUndefined();
    }
  });

  it("keeps free-text click labels and error messages out of the sink", () => {
    client.captureProductEvent("ui_click", {
      category: "interaction",
      properties: { element_type: "button", label: "Book a meeting with Acme", area: "preview" }
    });
    client.captureProductEvent("browser_error", {
      category: "error",
      outcome: "failure",
      properties: { error_name: "TypeError", message: "Cannot read x of undefined" }
    });

    const serialized = JSON.stringify(captures());
    expect(serialized).not.toContain("Book a meeting with Acme");
    expect(serialized).not.toContain("Cannot read x of undefined");
    expect(captures()[1]!.payload.error_name).toBe("TypeError");
  });

  it("keeps the approved one-way correlation key", () => {
    client.captureProductEvent("page_viewed", {
      category: "navigation",
      properties: { correlation_key: "ck_0123456789abcdef" } // gitleaks:allow
    });

    expect(captures()[0]!.payload.correlation_key).toBe("ck_0123456789abcdef");
  });

  it("never identifies a person before an explicit claim completes", () => {
    client.captureProductEvent("page_viewed", { category: "navigation" });
    client.captureProductEvent("claim_started", { category: "conversion" });

    expect(posthog.identify).not.toHaveBeenCalled();

    client.identifyProductVisitor("buyer@acme.example");

    expect(posthog.identify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(posthog.identify).mock.calls)).not.toContain("buyer@");
  });

  it("holds identification at the claim boundary through a failed and retried claim", () => {
    const email = "buyer@acme.example";

    client.captureProductEvent("page_viewed", { category: "navigation" });
    client.captureProductEvent("claim_attempted", {
      category: "conversion",
      properties: { claim_step: "submit", has_value: true }
    });
    client.captureProductEvent("claim_failed", {
      category: "conversion",
      outcome: "failure",
      properties: { error_name: "claim_conflict" }
    });

    expect(posthog.identify).not.toHaveBeenCalled();

    client.captureProductEvent("claim_attempted", {
      category: "conversion",
      properties: { claim_step: "retry", has_value: true }
    });

    expect(posthog.identify).not.toHaveBeenCalled();

    client.identifyProductVisitor(email);
    client.identifyProductVisitor(email);

    expect(posthog.identify).toHaveBeenCalledTimes(2);
    for (const [distinctId, properties] of vi.mocked(posthog.identify).mock.calls) {
      // The opaque first-party visitor ID, and nothing that describes a person.
      expect(String(distinctId)).toMatch(/^tmv_[a-z0-9]{8,}$/);
      expect(properties).toEqual({ identity_source: "business_email_claim" });
      const sent = sanitizePostHogCapture({
        uuid: "identify-uuid",
        event: "$identify",
        properties: { distinct_id: distinctId, $set: { ...properties, email } }
      });
      expect(JSON.stringify(sent)).not.toContain(email);
      expect(sent?.properties.$set).toEqual({ identity_source: "business_email_claim" });
    }
    const everything = JSON.stringify([
      captures(),
      vi.mocked(posthog.identify).mock.calls
    ]);
    expect(everything).not.toContain(email);
    expect(everything).not.toContain("acme.example");
    expect(everything).not.toContain("buyer");
  });

  it("keeps a capture failure from reaching the caller", () => {
    vi.mocked(posthog.capture).mockImplementationOnce(() => {
      throw new Error("posthog_unavailable");
    });

    expect(() =>
      client.captureProductEvent("page_viewed", { category: "navigation" })
    ).not.toThrow();
  });
});

describe("PostHog browser configuration", () => {
  it("disables native exception capture, autocapture, pageviews, and replay", () => {
    const config = postHogBrowserConfig({
      apiHost: "https://posthog.example",
      replayEnabled: false
    });

    expect(config.capture_exceptions).toBe(false);
    expect(config.autocapture).toBe(false);
    expect(config.capture_pageview).toBe(false);
    expect(config.capture_pageleave).toBe(false);
    expect(config.disable_session_recording).toBe(true);
    expect(config.respect_dnt).toBe(true);
    expect(config.person_profiles).toBe("identified_only");
  });
});

describe("payload projection rules", () => {
  it("drops a value that reads as prose rather than as a code", () => {
    expect(
      postHogSafeProperties({ area: "preview panel", asset_role: "product" })
    ).toEqual({ asset_role: "product" });
  });

  it("drops a value that reads as a hostname or a support reference", () => {
    expect(
      postHogSafeProperties({ route_family: "acme.example", trigger: "TMN-ABCDEFGH" })
    ).toEqual({});
  });

  it("bounds duration and always carries a per-event insert id", () => {
    const payload = postHogEventPayload(undefined, {
      insertId: "tme_0123456789abcdef",
      durationMs: 10_000_000
    });

    expect(payload).toEqual({ $insert_id: "tme_0123456789abcdef", duration_ms: 300_000 });
  });

  it("caps the number of properties that can reach the sink", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [`code_${index}`, index])
    );

    expect(Object.keys(postHogSafeProperties(wide))).toHaveLength(24);
  });
});
