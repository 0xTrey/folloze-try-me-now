import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearMemoryEngagementEventsForTest,
  getMemoryEngagementEventsForTest
} from "@/lib/engagement-events";

import { OPTIONS, POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://preview.example.com/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/events", () => {
  beforeEach(() => {
    clearMemoryEngagementEventsForTest();
    vi.restoreAllMocks();
  });

  it("accepts a privacy-bounded event without returning stored context", async () => {
    const response = await POST(request({
      eventId: "heartbeat_abcdefgh",
      sessionId: "session_abcdefgh",
      event: "page_heartbeat",
      context: { seconds: 15 }
    }));

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      persisted: true,
      persistence: "stored"
    });
    expect(getMemoryEngagementEventsForTest()).toEqual([
      expect.objectContaining({ event: "page_heartbeat", context: { seconds: 15 } })
    ]);
  });

  it("deduplicates a retried generated-experience event by eventId", async () => {
    const payload = {
      eventId: "evt_retry_abcdefgh",
      sessionId: "session_abcdefgh",
      event: "cta_click",
      context: { ctaId: "hero-primary" }
    };

    const first = await POST(request(payload));
    const retry = await POST(request(payload));

    await expect(first.json()).resolves.toMatchObject({
      accepted: true,
      persisted: true,
      persistence: "stored"
    });
    await expect(retry.json()).resolves.toMatchObject({
      accepted: true,
      persisted: false,
      persistence: "duplicate"
    });
    expect(getMemoryEngagementEventsForTest()).toHaveLength(1);
  });

  it("allows a sandboxed generated experience to complete its CORS preflight", () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type");
  });

  it("rejects non-allowlisted events before persistence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request({
      sessionId: "session_abcdefgh",
      event: "email_captured",
      context: { label: "buyer@example.com" }
    }));

    expect(response.status).toBe(400);
    expect(getMemoryEngagementEventsForTest()).toHaveLength(0);
  });
});
