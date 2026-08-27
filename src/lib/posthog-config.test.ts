import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { postHogBrowserConfig, sanitizePostHogCapture } from "@/lib/posthog-config";

function capture(event: string, properties: Record<string, unknown>): CaptureResult {
  return {
    uuid: "event-uuid",
    event,
    properties
  };
}

describe("PostHog browser privacy", () => {
  it("keeps deterministic custom events and maximum-privacy replay defaults", () => {
    const config = postHogBrowserConfig({ apiHost: "/signal-dock", replayEnabled: false });

    expect(config).toMatchObject({
      api_host: "/signal-dock",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: true,
      respect_dnt: true,
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*"
      }
    });
  });

  it("redacts contact data, credentials, and URL details before native errors leave the browser", () => {
    const sanitized = sanitizePostHogCapture(capture("$exception", {
      $exception_message: "Request for buyer@example.com failed at https://example.com/path?token=private#fragment",
      nested: { authorization: "Bearer private-token", key: "phx_1234567890abcdefghijklmnop" } // gitleaks:allow
    }));

    expect(JSON.stringify(sanitized)).not.toContain("buyer@example.com");
    expect(JSON.stringify(sanitized)).not.toContain("token=private");
    expect(JSON.stringify(sanitized)).not.toContain("private-token");
    expect(JSON.stringify(sanitized)).not.toContain("phx_1234567890abcdefghijklmnop");
    expect(JSON.stringify(sanitized)).toContain("[email]");
  });

  it("allows the explicit claim email only on PostHog identify", () => {
    const identified = sanitizePostHogCapture({
      ...capture("$identify", { note: "claimed by buyer@example.com" }),
      $set: { email: "buyer@example.com" }
    });
    const ordinary = sanitizePostHogCapture(capture("try_me_ui_click", {
      email: "buyer@example.com"
    }));

    expect(identified?.$set?.email).toBe("buyer@example.com");
    expect(identified?.properties.note).toBe("claimed by [email]");
    expect(ordinary?.properties.email).toBe("[email]");
  });
});
