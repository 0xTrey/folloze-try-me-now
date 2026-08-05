/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn()
  }
}));

import {
  captureProductEvent,
  flushProductAnalytics,
  initializeProductAnalytics,
  productAnalyticsIdentity,
  resetProductAnalyticsVisitor
} from "@/lib/product-analytics-client";

function acceptedResponse(status = 202): Response {
  return new Response("{}", {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function capturedBodies(fetchMock: ReturnType<typeof vi.fn>): Array<{ events: Array<Record<string, unknown>> }> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

describe("product analytics browser queue", () => {
  let dispose: () => void;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    dispose = () => undefined;
  });

  afterEach(() => {
    dispose();
    vi.restoreAllMocks();
  });

  it("never derives click labels from rendered buyer copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(acceptedResponse());
    vi.stubGlobal("fetch", fetchMock);
    dispose = initializeProductAnalytics();

    const button = document.createElement("button");
    button.textContent = "Cisco security leaders should buy the private launch offer";
    document.body.append(button);
    button.click();
    await flushProductAnalytics();

    const click = capturedBodies(fetchMock)
      .flatMap((body) => body.events)
      .find((event) => event.event === "ui_click") as { properties?: Record<string, unknown> };
    expect(click.properties?.label).toBe("button");
    expect(JSON.stringify(click)).not.toContain("Cisco security leaders");
    button.remove();
  });

  it("scrubs landing attribution before it reaches the first-party endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(acceptedResponse());
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?utm_campaign=buyer@example.com&utm_source=launch");

    dispose = initializeProductAnalytics();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const started = capturedBodies(fetchMock)
      .flatMap((body) => body.events)
      .find((event) => event.event === "visitor_session_started");
    expect(JSON.stringify(started)).not.toContain("buyer@example.com");
    expect(JSON.stringify(started)).toContain("[email]");
  });

  it("drops a non-retryable rejected batch so later events can flow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(acceptedResponse(400))
      .mockResolvedValueOnce(acceptedResponse());
    vi.stubGlobal("fetch", fetchMock);

    captureProductEvent("ui_click", { properties: { element_id: "first" } });
    await flushProductAnalytics();
    captureProductEvent("page_viewed", { category: "navigation" });
    await flushProductAnalytics();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBatch = capturedBodies(fetchMock)[1].events;
    expect(secondBatch).toHaveLength(1);
    expect(secondBatch[0].event).toBe("page_viewed");
  });

  it("rotates the first-party visitor and browser-session identifiers on start over", () => {
    const before = productAnalyticsIdentity();
    resetProductAnalyticsVisitor();
    const after = productAnalyticsIdentity();

    expect(after?.visitorId).not.toBe(before?.visitorId);
    expect(after?.browserSessionId).not.toBe(before?.browserSessionId);
  });
});
