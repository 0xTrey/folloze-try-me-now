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
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`
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

  it("rejects cross-origin telemetry and unknown event names", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await POST(request({ events: [validEvent] }, "https://attacker.example"))).status).toBe(403);
    expect((await POST(request({ events: [{ ...validEvent, event: "raw_input_value" }] }))).status).toBe(400);
    expect(getMemoryProductEventsForTest()).toHaveLength(0);
  });
});
