import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearMemoryEngagementEventsForTest,
  getMemoryEngagementEventsForTest
} from "@/lib/engagement-events";

import { POST } from "./route";

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
      sessionId: "session_abcdefgh",
      event: "page_heartbeat",
      context: { seconds: 15 }
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, persisted: true });
    expect(getMemoryEngagementEventsForTest()).toEqual([
      expect.objectContaining({ event: "page_heartbeat", context: { seconds: 15 } })
    ]);
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

