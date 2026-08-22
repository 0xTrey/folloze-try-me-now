import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearMemoryProductAnalyticsForTest,
  getMemoryProductEventsForTest
} from "@/lib/product-analytics";

import { POST } from "./route";

const validEvent = {
  eventId: "tme_1234567890abcdef",
  visitorId: "tmv_1234567890abcdef",
  browserSessionId: "tmb_1234567890abcdef",
  event: "page_viewed",
  category: "navigation",
  path: "/"
};

function request(body: unknown, origin = "https://preview.example.com") {
  return new NextRequest("https://preview.example.com/api/analytics/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    },
    body: JSON.stringify(body)
  });
}

function proxiedRequest(body: unknown, origin: string, headers: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/analytics/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "198.51.100.88",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/analytics/events", () => {
  beforeEach(() => {
    clearMemoryProductAnalyticsForTest();
    vi.restoreAllMocks();
  });

  it("stores a same-origin bounded event batch", async () => {
    const response = await POST(request({ events: [validEvent] }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: 1, inserted: 1, persistence: "stored" });
    expect(getMemoryProductEventsForTest()).toHaveLength(1);
  });

  it("accepts the browser-visible host behind local and production proxies", async () => {
    const local = await POST(proxiedRequest(
      { events: [validEvent] },
      "http://127.0.0.1:3000",
      { host: "127.0.0.1:3000" }
    ));
    expect(local.status).toBe(202);

    const proxied = await POST(proxiedRequest(
      { events: [{ ...validEvent, eventId: "tme_fedcba0987654321" }] },
      "https://try.folloze.example",
      {
        host: "internal-runtime:3000",
        "x-forwarded-host": "try.folloze.example",
        "x-forwarded-proto": "https"
      }
    ));
    expect(proxied.status).toBe(202);
  });

  it("rejects a forged origin even when a proxy host is present", async () => {
    const response = await POST(proxiedRequest(
      { events: [validEvent] },
      "https://attacker.example",
      {
        "x-forwarded-host": "try.folloze.example",
        "x-forwarded-proto": "https"
      }
    ));
    expect(response.status).toBe(403);
  });

  it("rejects cross-origin telemetry and unknown event names", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await POST(request({ events: [validEvent] }, "https://attacker.example"))).status).toBe(403);
    expect((await POST(request({ events: [{ ...validEvent, event: "raw_input_value" }] }))).status).toBe(400);
    expect(getMemoryProductEventsForTest()).toHaveLength(0);
  });

  it("rejects missing origins and mixed browser identities", async () => {
    const missingOrigin = request({ events: [validEvent] });
    missingOrigin.headers.delete("origin");
    expect((await POST(missingOrigin)).status).toBe(403);

    const response = await POST(request({
      events: [validEvent, {
        ...validEvent,
        eventId: "tme_fedcba0987654321",
        browserSessionId: "tmb_fedcba0987654321"
      }]
    }));
    expect(response.status).toBe(400);
    expect(getMemoryProductEventsForTest()).toHaveLength(0);
  });

  it("stores a same-origin unified analytics event", async () => {
    const response = await POST(request({
      events: [{
        ...validEvent,
        eventId: "tme_unifiedroute0001",
        event: "unified_entry_started",
        category: "navigation",
        properties: { entry_surface: "primary_cta", device_class: "desktop" }
      }]
    }));
    expect(response.status).toBe(202);
    expect(getMemoryProductEventsForTest()[0]?.event).toBe("unified_entry_started");
  });
});
