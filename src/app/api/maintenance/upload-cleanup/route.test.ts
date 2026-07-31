import { del, list } from "@vercel/blob";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return { ...actual, del: vi.fn(), list: vi.fn() };
});

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, hasBlob: true };
});

import { GET } from "./route";

const sessionId = "abcdefghijklmnopqrstuvwx12345678";
const uploadId = "123e4567-e89b-42d3-a456-426614174000";

function request(authorization?: string) {
  return new NextRequest("https://preview.example.com/api/maintenance/upload-cleanup", {
    headers: authorization ? { Authorization: authorization } : undefined
  });
}

describe("upload cleanup maintenance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(del).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it.each([undefined, "Bearer wrong-secret"])(
    "fails closed without the exact cron bearer secret",
    async (authorization) => {
      const response = await GET(request(authorization));
      const body = (await response.json()) as { code: string; requestId: string };

      expect(response.status).toBe(401);
      expect(body.code).toBe("cron_unauthorized");
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(list).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
    }
  );

  it("paginates and deletes only expired upload artifacts while logging aggregate counts", async () => {
    const stalePdf = `try-me/uploads/${sessionId}/${uploadId}.pdf`;
    const secondUploadId = "223e4567-e89b-42d3-a456-426614174000";
    const stalePdfPageTwo = `try-me/uploads/${sessionId}/${secondUploadId}.pdf`;
    const staleStatus = `try-me/upload-status/${sessionId}/${uploadId}.json`;
    const now = Date.now();
    vi.mocked(list).mockImplementation(async (options) => {
      const prefix = options?.prefix;
      if (prefix === "try-me/uploads/" && !options?.cursor) {
        return {
          blobs: [{ pathname: stalePdf, uploadedAt: new Date(now - 48 * 60 * 60 * 1000) }],
          cursor: "upload-page-2",
          hasMore: true
        } as never;
      }
      if (prefix === "try-me/uploads/") {
        return {
          blobs: [
            { pathname: stalePdfPageTwo, uploadedAt: new Date(now - 48 * 60 * 60 * 1000) }
          ],
          cursor: undefined,
          hasMore: false
        } as never;
      }
      return {
        blobs: [{ pathname: staleStatus, uploadedAt: new Date(now - 48 * 60 * 60 * 1000) }],
        cursor: undefined,
        hasMore: false
      } as never;
    });

    const response = await GET(request("Bearer test-cron-secret"));
    const body = (await response.json()) as { ok: boolean; scanned: number; deleted: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, scanned: 3, deleted: 3 });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "try-me/uploads/", cursor: "upload-page-2" })
    );
    const deleted = vi.mocked(del).mock.calls.flatMap(([paths]) =>
      Array.isArray(paths) ? paths : [paths]
    );
    expect(deleted).toEqual(expect.arrayContaining([stalePdf, stalePdfPageTwo, staleStatus]));
    const logged = String(vi.mocked(console.info).mock.calls[0]?.[0]);
    expect(logged).toContain('"pdfsDeleted":2');
    expect(logged).toContain('"statusRecordsDeleted":1');
    expect(logged).not.toContain(sessionId);
    expect(logged).not.toContain(uploadId);
  });

  it("returns a correlated 500 when Blob listing fails", async () => {
    vi.mocked(list).mockRejectedValue(new Error("Blob listing unavailable."));

    const response = await GET(request("Bearer test-cron-secret"));
    const body = (await response.json()) as { code: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe("internal_error");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain("pdf_upload_cleanup");
  });

  it("returns a correlated 500 when Blob deletion fails", async () => {
    const stalePdf = `try-me/uploads/${sessionId}/${uploadId}.pdf`;
    vi.mocked(list).mockImplementation(async (options) => ({
      blobs:
        options?.prefix === "try-me/uploads/"
          ? [{ pathname: stalePdf, uploadedAt: new Date(0) }]
          : [],
      cursor: undefined,
      hasMore: false
    }) as never);
    vi.mocked(del).mockRejectedValue(new Error("Blob deletion unavailable."));

    const response = await GET(request("Bearer test-cron-secret"));
    const body = (await response.json()) as { code: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe("internal_error");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain("pdf_upload_cleanup");
  });
});
