import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPinnedPublicBytes } from "@/lib/safe-fetch";
import { getSession } from "@/lib/session-store";

vi.mock("@/lib/safe-fetch", () => ({ fetchPinnedPublicBytes: vi.fn() }));
vi.mock("@/lib/session-store", () => ({ getSession: vi.fn() }));

import { GET, OPTIONS } from "./route";

const request = new Request("https://try.example/api/sessions/font-session/font/display");
const woff2 = new Uint8Array(48);
woff2.set([0x77, 0x4f, 0x46, 0x32]);
new DataView(woff2.buffer).setUint32(8, woff2.byteLength, false);

function context(slot: string = "display") {
  return { params: Promise.resolve({ id: "font-session", slot }) };
}

function installSession(input: { display?: string; body?: string } = {}) {
  vi.mocked(getSession).mockResolvedValue({
    brand: {
      displayFontUrl: input.display ?? "https://cdn.example/fonts/brand-display.woff2",
      bodyFontUrl: input.body ?? "https://cdn.example/fonts/brand-body.woff2"
    }
  } as never);
}

function installFont(input: {
  bytes?: Uint8Array;
  contentType?: string;
  finalUrl?: string;
  status?: number;
  truncated?: boolean;
} = {}) {
  vi.mocked(fetchPinnedPublicBytes).mockResolvedValue({
    status: input.status ?? 200,
    headers: { "content-type": input.contentType ?? "font/woff2" },
    bytes: input.bytes ?? woff2,
    finalUrl: new URL(input.finalUrl ?? "https://cdn.example/fonts/brand-display.woff2"),
    truncated: input.truncated ?? false
  });
}

describe("harvested font delivery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installSession();
    installFont();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns CORS-safe cacheable font bytes from the session-bound display slot", async () => {
    const response = await GET(request, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...woff2]);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledWith(
      "https://cdn.example/fonts/brand-display.woff2",
      expect.objectContaining({
        timeoutMs: 4_500,
        maxRedirects: 2,
        maxBytes: 1_500_000,
        headers: expect.objectContaining({ Accept: expect.stringContaining("font/woff2") })
      })
    );
  });

  it("serves only the explicit harvested font slot and never accepts a client URL", async () => {
    installSession({
      display: "https://cdn.example/fonts/display.woff2",
      body: "https://cdn.example/fonts/body.woff2"
    });
    installFont({ finalUrl: "https://cdn.example/fonts/body.woff2" });

    const response = await GET(request, context("body"));

    expect(response.status).toBe(200);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledWith(
      "https://cdn.example/fonts/body.woff2",
      expect.any(Object)
    );
  });

  it("accepts a signature-verified font from an opaque CDN URL with a generic MIME", async () => {
    installFont({
      contentType: "application/octet-stream",
      finalUrl: "https://cdn.example/assets/font?id=brand-display"
    });

    const response = await GET(request, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
  });

  it("fails cleanly for unknown slots, absent fonts, and non-HTTPS sources", async () => {
    expect((await GET(request, context("unknown"))).status).toBe(404);

    installSession({ display: "" });
    expect((await GET(request, context())).status).toBe(404);

    installSession({ display: "http://cdn.example/fonts/display.woff2" });
    const insecure = await GET(request, context());
    expect(insecure.status).toBe(404);
    expect(insecure.headers.get("access-control-allow-origin")).toBe("*");
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("rejects oversized, mislabeled, and invalid font responses", async () => {
    installFont({ truncated: true });
    expect((await GET(request, context())).status).toBe(413);

    installFont({ contentType: "text/html" });
    expect((await GET(request, context())).status).toBe(415);

    installFont({ finalUrl: "https://cdn.example/fonts/mislabeled.woff" });
    expect((await GET(request, context())).status).toBe(415);

    installFont({ bytes: new TextEncoder().encode("not a font") });
    const invalid = await GET(request, context());
    expect(invalid.status).toBe(415);
    expect(invalid.headers.get("cache-control")).toContain("no-store");
  });

  it("logs only a sanitized failure and never the upstream URL or credentials", async () => {
    installSession({ display: "https://cdn.example/fonts/display.woff2" });
    vi.mocked(fetchPinnedPublicBytes).mockRejectedValue(
      new Error("https://user:secret@cdn.example/private-font.woff2 failed")
    );
    const errorLog = vi.mocked(console.error);

    const response = await GET(request, context());

    expect(response.status).toBe(502);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const logged = String(errorLog.mock.calls[0]?.[0]);
    expect(logged).toContain("font_proxy_failed");
    expect(logged).not.toContain("private-font");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("cdn.example");
  });

  it("answers preflight without credentials", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  });
});
