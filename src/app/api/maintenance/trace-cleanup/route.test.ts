import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasValidCronAuthorization } from "@/lib/cron-auth";
import { purgeExpiredBuildTraces } from "@/lib/build-trace-store";
import { purgeExpiredTraceEvents } from "@/lib/trace-store";

vi.mock("@/lib/cron-auth", () => ({ hasValidCronAuthorization: vi.fn() }));
vi.mock("@/lib/trace-store", () => ({
  purgeExpiredTraceEvents: vi.fn(),
  traceStoreMode: "memory-test"
}));
vi.mock("@/lib/build-trace-store", () => ({
  purgeExpiredBuildTraces: vi.fn(),
  buildTraceStoreMode: "neon-postgres"
}));

import { GET } from "./route";

describe("trace retention cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires cron authorization before deleting trace rows", async () => {
    vi.mocked(hasValidCronAuthorization).mockReturnValue(false);

    const response = await GET(
      new NextRequest("https://preview.example.com/api/maintenance/trace-cleanup")
    );

    expect(response.status).toBe(401);
    expect(purgeExpiredTraceEvents).not.toHaveBeenCalled();
    expect(purgeExpiredBuildTraces).not.toHaveBeenCalled();
  });

  it("deletes expired traces and returns request correlation headers", async () => {
    vi.mocked(hasValidCronAuthorization).mockReturnValue(true);
    vi.mocked(purgeExpiredTraceEvents).mockResolvedValue(17);
    vi.mocked(purgeExpiredBuildTraces).mockResolvedValue(4);

    const response = await GET(
      new NextRequest("https://preview.example.com/api/maintenance/trace-cleanup")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deleted: 17,
      buildTracesDeleted: 4
    });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports zero build traces purged when that sweep fails", async () => {
    vi.mocked(hasValidCronAuthorization).mockReturnValue(true);
    vi.mocked(purgeExpiredTraceEvents).mockResolvedValue(3);
    vi.mocked(purgeExpiredBuildTraces).mockRejectedValue(new Error("store_unreachable"));

    const response = await GET(
      new NextRequest("https://preview.example.com/api/maintenance/trace-cleanup")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deleted: 3,
      buildTracesDeleted: 0
    });
  });
});
