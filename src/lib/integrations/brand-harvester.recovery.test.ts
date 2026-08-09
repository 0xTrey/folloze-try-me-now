import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMocks = vi.hoisted(() => ({
  fetchPinnedPublicBytes: vi.fn(),
  fetchPinnedPublicText: vi.fn()
}));

vi.mock("@/lib/safe-fetch", () => safeFetchMocks);

import { assessBrandReadiness } from "@/lib/brand-readiness";
import { harvestBrand } from "@/lib/integrations/brand-harvester";

const validWordmark = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NorthStar logo" viewBox="0 0 240 48"><title>NorthStar</title><path d="M0 0h240v48H0z"/></svg>'
);
const invalidHtml = new TextEncoder().encode("<!doctype html><title>Not an image</title>");

function publicPage(domain: string) {
  const company = domain
    .split(".")[0]!
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  return {
    status: 200,
    headers: { "content-type": "text/html" },
    text: `<!doctype html><html><head>
      <title>${company}</title>
      <meta property="og:site_name" content="${company}">
      <meta name="theme-color" content="#112244">
    </head><body><header>
      <img class="header-logo" src="/broken-northstar-logo.svg" alt="${company} logo" width="240" height="48">
      <img class="site-logo" src="/working-northstar-wordmark.svg" alt="${company} logo" width="210" height="42">
    </header></body></html>`,
    finalUrl: new URL(`https://${domain}/`),
    truncated: false
  };
}

describe("validation-first logo recovery", () => {
  beforeEach(() => {
    vi.stubEnv("BRANDFETCH_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    safeFetchMocks.fetchPinnedPublicBytes.mockReset();
    safeFetchMocks.fetchPinnedPublicText.mockReset();
  });

  it("rejects a broken top-ranked candidate and promotes a validated runner-up", async () => {
    const domain = "northstar-runner-up.test";
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue(publicPage(domain));
    safeFetchMocks.fetchPinnedPublicBytes.mockImplementation(async (url: URL | string) => {
      const source = String(url);
      const valid = source.endsWith("/working-northstar-wordmark.svg");
      return {
        status: 200,
        headers: { "content-type": valid ? "image/svg+xml" : "text/html" },
        bytes: valid ? validWordmark : invalidHtml,
        finalUrl: new URL(source),
        truncated: false
      };
    });

    const profile = await harvestBrand(domain);

    expect(profile.logoUrl).toBe(
      `https://${domain}/working-northstar-wordmark.svg`
    );
    expect(profile.portableLogo).toMatchObject({
      mediaType: "image/svg+xml",
      source: "official-remote-asset"
    });
    expect(profile.diagnostics?.logo).toMatchObject({
      strategy: "official-remote-portable",
      validationAttempted: 2,
      validationRejected: 1,
      resolutionComplete: true
    });
    expect(profile.diagnostics?.providers).toEqual({
      publicPage: "succeeded",
      publicPageAttempts: 1,
      remoteBrowser: "not_configured",
      brandfetch: "not_configured",
      brandfetchLogoApi: "not_configured",
      brandfetchBrandApi: "not_configured",
      verifiedFallback: false
    });
  });

  it("retries one transient public-page block before falling through to providers", async () => {
    const domain = "northstar-transient-block.test";
    safeFetchMocks.fetchPinnedPublicText
      .mockResolvedValueOnce({ ...publicPage(domain), status: 403 })
      .mockResolvedValueOnce(publicPage(domain));
    safeFetchMocks.fetchPinnedPublicBytes.mockImplementation(async (url: URL | string) => ({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bytes: validWordmark,
      finalUrl: new URL(String(url)),
      truncated: false
    }));

    const profile = await harvestBrand(domain);

    expect(safeFetchMocks.fetchPinnedPublicText).toHaveBeenCalledTimes(2);
    expect(profile.diagnostics?.providers).toMatchObject({
      publicPage: "succeeded",
      publicPageAttempts: 2,
      verifiedFallback: false
    });
  });

  it("does not mark a URL as logo-ready when every candidate returns non-image bytes", async () => {
    const domain = "northstar-all-invalid.test";
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue(publicPage(domain));
    safeFetchMocks.fetchPinnedPublicBytes.mockImplementation(async (url: URL | string) => ({
      status: 200,
      headers: { "content-type": "text/html" },
      bytes: invalidHtml,
      finalUrl: new URL(String(url)),
      truncated: false
    }));

    const profile = await harvestBrand(domain);

    expect(profile.logoUrl).toBeUndefined();
    expect(profile.portableLogo).toBeUndefined();
    expect(profile.diagnostics?.logo).toMatchObject({
      strategy: "none",
      validationAttempted: 2,
      validationRejected: 2,
      resolutionComplete: true
    });
    expect(assessBrandReadiness(profile)).toMatchObject({
      status: "incomplete",
      logoReady: false
    });
  });

  it("singleflights the same official logo validation across concurrent harvests", async () => {
    const domain = "northstar-singleflight.test";
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue(publicPage(domain));
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bytes: validWordmark,
      finalUrl: new URL(`https://${domain}/broken-northstar-logo.svg`),
      truncated: false
    });

    await Promise.all([harvestBrand(domain), harvestBrand(domain)]);

    // Both harvests discover two candidates, but each URL is validated once.
    expect(safeFetchMocks.fetchPinnedPublicBytes).toHaveBeenCalledTimes(2);
  });
});
