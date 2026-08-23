import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { fetchPinnedPublicBytes } from "@/lib/safe-fetch";
import { getSession } from "@/lib/session-store";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";
import { portableBrandLogoFromSvg } from "@/lib/portable-brand-logo";
import type { PortableBrandLogo } from "@/lib/types";

vi.mock("@/lib/safe-fetch", () => ({ fetchPinnedPublicBytes: vi.fn() }));
vi.mock("@/lib/session-store", () => ({ getSession: vi.fn() }));

import { GET, OPTIONS } from "./route";

const routeUrl = "https://try.example/api/sessions/image-session/image/seller-logo";
const request = new Request(routeUrl);
const svg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path fill="#fff" d="M0 0h20v10H0z"/></svg>'
);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
]);

function context(slot: string = "seller-logo", id: string = "image-session") {
  return { params: Promise.resolve({ id, slot }) };
}

function installSession(overrides: {
  sellerLogo?: string;
  sellerImages?: string[];
  targetLogo?: string;
  targetImages?: string[];
  sellerPortableLogo?: PortableBrandLogo;
  targetPortableLogo?: PortableBrandLogo;
  artifactRevision?: number;
  experienceArtifactRevision?: number;
} = {}) {
  vi.mocked(getSession).mockResolvedValue({
    answers: {},
    brand: {
      logoUrl: overrides.sellerLogo ?? "https://cdn.example/seller/logo.svg",
      portableLogo: overrides.sellerPortableLogo,
      imageUrls: overrides.sellerImages ?? ["https://cdn.example/seller/hero.jpg"]
    },
    targetBrand: {
      logoUrl: overrides.targetLogo ?? "https://cdn.example/target/logo.svg",
      portableLogo: overrides.targetPortableLogo,
      imageUrls: overrides.targetImages ?? ["https://cdn.example/target/hero.jpg"]
    },
    qualityReceipt: overrides.artifactRevision
      ? { artifactRevision: overrides.artifactRevision }
      : undefined,
    experience: overrides.experienceArtifactRevision
      ? { artifactRevision: overrides.experienceArtifactRevision }
      : undefined
  } as never);
}

function installImage(input: {
  bytes?: Uint8Array;
  contentType?: string;
  finalUrl?: string;
  status?: number;
  truncated?: boolean;
} = {}) {
  vi.mocked(fetchPinnedPublicBytes).mockResolvedValue({
    status: input.status ?? 200,
    headers: { "content-type": input.contentType ?? "image/svg+xml" },
    bytes: input.bytes ?? svg,
    finalUrl: new URL(input.finalUrl ?? "https://cdn.example/seller/logo.svg"),
    truncated: input.truncated ?? false
  });
}

describe("harvested image delivery route", () => {
  beforeEach(() => {
    vi.mocked(fetchPinnedPublicBytes).mockReset();
    vi.mocked(getSession).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installSession();
    installImage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers the session-bound SVG logo with browser-safe headers", async () => {
    const response = await GET(request, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(svg);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledWith(
      "https://cdn.example/seller/logo.svg",
      expect.objectContaining({
        timeoutMs: 6_500,
        maxBytes: 5_000_000,
        maxRedirects: 2,
        headers: expect.objectContaining({ Accept: expect.stringContaining("image/svg+xml") })
      })
    );
  });

  it("redirects a validated Brandfetch logo for legacy session image URLs", async () => {
    const logoUrl = "https://cdn.brandfetch.io/domain/amazon.com/w/320/h/96/theme/light/fallback/404/type/logo?c=abcdefgh";
    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: { domain: "amazon.com", canonicalDomain: "amazon.com", logoUrl }
    } as never);

    const response = await GET(request, context());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(logoUrl);
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("redirects an opaque Brand API asset only with a server-side Brandfetch receipt", async () => {
    const logoUrl = "https://cdn.brandfetch.io/idj3Bp2d82/theme/dark/logo.svg?c=asset_client_12345";
    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: {
        domain: "amazon.com",
        canonicalDomain: "amazon.com",
        logoUrl,
        diagnostics: {
          logo: {
            strategy: "brandfetch-brand-api",
            imageCandidateCount: 1,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          }
        }
      }
    } as never);

    const response = await GET(request, context());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(logoUrl);
  });

  it("does not trust an opaque Brandfetch asset URL without provider provenance", async () => {
    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: {
        domain: "amazon.com",
        canonicalDomain: "amazon.com",
        logoUrl: "https://cdn.brandfetch.io/idWrongBrand/theme/dark/logo.svg?c=asset_client_12345"
      }
    } as never);

    const response = await GET(request, context());

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("delivers a validated inline Cisco-style logo from the session without hotlinking", async () => {
    const portable = portableBrandLogoFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cisco logo" viewBox="0 0 100 52"><title>Cisco</title><path fill="#1BA0D7" d="M1 1h98v50H1z"/></svg>'
    );
    expect(portable).toBeDefined();
    installSession({
      sellerLogo: "/api/sessions/image-session/image/seller-logo",
      sellerPortableLogo: portable
    });

    const response = await GET(request, context());
    const delivered = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(delivered).toContain("Cisco logo");
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("rejects a tampered portable logo instead of serving unverified session bytes", async () => {
    const portable = portableBrandLogoFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cisco logo"><title>Cisco</title><path fill="#1BA0D7" d="M1 1h98v50H1z"/></svg>'
    );
    expect(portable).toBeDefined();
    installSession({
      sellerLogo: "/api/sessions/image-session/image/seller-logo",
      sellerPortableLogo: {
        ...portable!,
        sha256: "0".repeat(64)
      }
    });

    const response = await GET(request, context());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("serves a versioned image only when v matches the current quality receipt revision", async () => {
    installSession({ artifactRevision: 7 });

    const response = await GET(new Request(`${routeUrl}?v=7`), context());

    expect(response.status).toBe(200);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledOnce();
  });

  it("rejects stale or arbitrary positive revisions before fetching the upstream image", async () => {
    installSession({ artifactRevision: 7 });

    const response = await GET(new Request(`${routeUrl}?v=8`), context());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("supports a legacy experience artifact revision when no quality receipt exists", async () => {
    installSession({ experienceArtifactRevision: 4 });

    const response = await GET(new Request(`${routeUrl}?v=4`), context());

    expect(response.status).toBe(200);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledOnce();
  });

  it("rejects malformed, duplicate, and unrelated query parameters before session or upstream work", async () => {
    for (const query of ["?v=0", "?v=07", "?v=7&v=7", "?v=7&cache=1", "?cache=7"]) {
      expect((await GET(new Request(`${routeUrl}${query}`), context())).status).toBe(404);
    }

    expect(getSession).not.toHaveBeenCalled();
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("delivers the ServiceNow-style hero as an exact JPEG response instead of an ORB-prone upstream load", async () => {
    const informativeJpeg = new Uint8Array(await sharp({
      create: {
        width: 320,
        height: 180,
        channels: 3,
        background: { r: 248, g: 250, b: 252 }
      }
    }).composite([{
      input: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect x="32" y="28" width="110" height="124" rx="18" fill="#52B8FF"/><rect x="162" y="48" width="126" height="24" rx="12" fill="#001E2B"/><rect x="162" y="92" width="92" height="18" rx="9" fill="#62D84E"/></svg>'
      )
    }]).jpeg().toBuffer());
    installImage({
      bytes: informativeJpeg,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example/seller/hero.jpg"
    });

    const response = await GET(request, context("seller-image-0"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe(String(informativeJpeg.byteLength));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(informativeJpeg);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledWith(
      "https://cdn.example/seller/hero.jpg",
      expect.any(Object)
    );
  });

  it("rejects a visually empty hero image so the generated fallback remains visible", async () => {
    const blankPng = new Uint8Array(await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      }
    }).png().toBuffer());
    installImage({
      bytes: blankPng,
      contentType: "image/png",
      finalUrl: "https://cdn.example/seller/blank-hero.png"
    });

    const response = await GET(request, context("seller-image-0"));
    const body = (await response.json()) as { code: string; requestId: string };
    const logged = String(vi.mocked(console.error).mock.calls[0]?.[0]);

    expect(response.status).toBe(415);
    expect(body.code).toBe("image_visually_empty");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(logged).toContain("image_proxy_low_information");
    expect(logged).toContain('"contrastPermille":0');
    expect(logged).not.toContain("cdn.example");
  });

  it("selects target assets only through the requested target slot", async () => {
    installImage({ finalUrl: "https://cdn.example/target/logo.svg" });

    const response = await GET(request, context("target-logo"));

    expect(response.status).toBe(200);
    expect(fetchPinnedPublicBytes).toHaveBeenCalledWith(
      "https://cdn.example/target/logo.svg",
      expect.any(Object)
    );
  });

  it("delivers copied target wordmarks without a target CDN hotlink", async () => {
    const portable = portableBrandLogoFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TechTarget logo" viewBox="0 0 100 20"><title>TechTarget</title><path fill="#008080" d="M0 0h100v20H0z"/></svg>',
      "official-remote-asset"
    );
    installSession({
      targetLogo: "/api/sessions/image-session/image/target-logo",
      targetPortableLogo: portable
    });

    const response = await GET(request, context("target-logo"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("TechTarget logo");
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("returns the reviewed ServiceNow homepage logo crop when the exact verified CDN asset is forbidden", async () => {
    const verified = verifiedBrandProfileFor("servicenow.com");
    expect(verified).toBeDefined();
    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: verified
    } as never);
    installImage({ status: 403 });

    const logoResponse = await GET(request, context("seller-logo"));
    const logo = new Uint8Array(await logoResponse.arrayBuffer());
    const heroResponse = await GET(request, context("seller-image-0"));
    const hero = await heroResponse.text();

    expect(logoResponse.status).toBe(200);
    expect(logoResponse.headers.get("content-type")).toBe("image/png");
    expect(logoResponse.headers.get("referrer-policy")).toBe("no-referrer");
    expect([...logo.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(logo.byteLength).toBeGreaterThan(3_000);

    expect(heroResponse.status).toBe(200);
    expect(heroResponse.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(hero).toContain("From enterprise signal to governed action.");
    expect(hero).toContain("Governed workflow");
    expect(hero).toContain("#52B8FF");
    expect(hero).not.toContain("https://www.servicenow.com");
  });

  it("keeps the reviewed ServiceNow logo available when the source CDN times out", async () => {
    const verified = verifiedBrandProfileFor("servicenow.com");
    vi.mocked(getSession).mockResolvedValue({ answers: {}, brand: verified } as never);
    vi.mocked(fetchPinnedPublicBytes).mockRejectedValueOnce(new Error("Image request timed out."));

    const response = await GET(request, context("seller-logo"));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("serves the reviewed Folloze wordmark locally without touching its public CDN", async () => {
    const folloze = verifiedBrandProfileFor("folloze.com")!;
    vi.mocked(getSession).mockResolvedValue({ answers: {}, brand: folloze } as never);

    const response = await GET(request, context("seller-logo"));
    const logo = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(logo).toContain('viewBox="0 0 99 24"');
    expect(logo).toContain('fill="#2C3D59"');
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("serves reviewed Medidata and Lilly logos from immutable local assets", async () => {
    const medidata = verifiedBrandProfileFor("medidata.com")!;
    vi.mocked(getSession).mockResolvedValue({ answers: {}, brand: medidata } as never);

    const sellerResponse = await GET(request, context("seller-logo"));
    const sellerSvg = await sellerResponse.text();
    expect(sellerResponse.status).toBe(200);
    expect(sellerResponse.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(sellerSvg).toContain("<title id=\"title\">Medidata</title>");

    const lilly = verifiedBrandProfileFor("lilly.com")!;
    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: medidata,
      targetBrand: lilly
    } as never);
    const targetResponse = await GET(request, context("target-logo"));
    const targetSvg = await targetResponse.text();
    expect(targetResponse.status).toBe(200);
    expect(targetResponse.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(targetSvg).toContain("<title id=\"title\">Lilly</title>");
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("serves the official 6sense media-kit wordmark when its site blocks server delivery", async () => {
    const sixsense = verifiedBrandProfileFor("6sense.com")!;
    vi.mocked(getSession).mockResolvedValue({ answers: {}, brand: sixsense } as never);

    const response = await GET(request, context("seller-logo"));
    const logo = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...logo.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(logo.byteLength).toBeGreaterThan(50_000);
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("accepts a CDN-negotiated WebP when declared MIME and detected bytes agree", async () => {
    installImage({
      bytes: webp,
      contentType: "image/webp",
      finalUrl: "https://cdn.example/official-logo.png"
    });

    const response = await GET(request, context("seller-logo"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp);
  });

  it("does not activate the original fallback for near-match domains or unverified asset URLs", async () => {
    const verified = verifiedBrandProfileFor("servicenow.com")!;
    installImage({ status: 403 });
    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: { ...verified, domain: "servicenow.com.attacker.example" }
    } as never);
    expect((await GET(request, context("seller-logo"))).status).toBe(502);

    vi.mocked(getSession).mockResolvedValue({
      answers: {},
      brand: { ...verified, logoUrl: "https://cdn.example/unverified-logo.svg" }
    } as never);
    expect((await GET(request, context("seller-logo"))).status).toBe(502);
  });

  it("blocks private destinations through the pinned public-address fetch boundary", async () => {
    installSession({ sellerLogo: "https://127.0.0.1/internal.svg" });
    vi.mocked(fetchPinnedPublicBytes).mockRejectedValue(
      new Error("The URL resolves to a private or reserved address: https://127.0.0.1/internal.svg")
    );

    const response = await GET(request, context());
    const logged = String(vi.mocked(console.error).mock.calls[0]?.[0]);

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(logged).toContain("image_proxy_failed");
    expect(logged).not.toContain("127.0.0.1");
    expect(logged).not.toContain("internal.svg");
  });

  it("returns a request ID and structured sanitized log for non-success upstream responses", async () => {
    installImage({ status: 503 });

    const response = await GET(request, context());
    const body = (await response.json()) as { requestId: string };
    const logged = String(vi.mocked(console.error).mock.calls[0]?.[0]);

    expect(response.status).toBe(502);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(logged).toContain(body.requestId);
    expect(logged).toContain("image_proxy_upstream_status");
    expect(logged).toContain('"upstreamStatus":503');
    expect(logged).not.toContain("cdn.example");
  });

  it("returns a request ID and structured log when MIME validation fails", async () => {
    installImage({ contentType: "text/html" });

    const response = await GET(request, context());
    const body = (await response.json()) as { requestId: string };
    const logged = String(vi.mocked(console.error).mock.calls[0]?.[0]);

    expect(response.status).toBe(415);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(logged).toContain(body.requestId);
    expect(logged).toContain("image_proxy_invalid_payload");
    expect(logged).toContain('"contentTypeHint":"invalid"');
    expect(logged).not.toContain("cdn.example");
  });

  it("rejects over-limit, MIME-confused, untyped extension-confused, and bad-magic payloads", async () => {
    installImage({ truncated: true });
    expect((await GET(request, context())).status).toBe(413);

    installImage({ contentType: "text/html" });
    expect((await GET(request, context())).status).toBe(415);

    installImage({ bytes: jpeg, contentType: "image/png", finalUrl: "https://cdn.example/image.png" });
    expect((await GET(request, context())).status).toBe(415);

    installImage({ bytes: jpeg, contentType: "image/jpeg", finalUrl: "https://cdn.example/image.png" });
    expect((await GET(request, context())).status).toBe(200);

    installImage({
      bytes: jpeg,
      contentType: "application/octet-stream",
      finalUrl: "https://cdn.example/image.png"
    });
    expect((await GET(request, context())).status).toBe(415);

    installImage({
      bytes: new TextEncoder().encode("<html>not an image</html>"),
      contentType: "application/octet-stream",
      finalUrl: "https://cdn.example/opaque"
    });
    expect((await GET(request, context())).status).toBe(415);
  });

  it("rejects active or externally referential SVG even when the MIME and extension look valid", async () => {
    for (const unsafe of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><path onclick="alert(1)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://attacker.example/a.svg#x"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>'
    ]) {
      installImage({ bytes: new TextEncoder().encode(unsafe) });
      expect((await GET(request, context())).status).toBe(415);
    }
  });

  it("fails closed for unknown slots, absent images, and non-HTTPS source URLs", async () => {
    expect((await GET(request, context("seller-image-6"))).status).toBe(404);
    expect((await GET(request, context("seller-image-0", "../escape"))).status).toBe(404);

    installSession({ sellerImages: [] });
    expect((await GET(request, context("seller-image-0"))).status).toBe(404);

    installSession({ sellerLogo: "http://cdn.example/logo.svg" });
    expect((await GET(request, context())).status).toBe(404);
    expect(fetchPinnedPublicBytes).not.toHaveBeenCalled();
  });

  it("answers preflight without credentials", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  });
});
