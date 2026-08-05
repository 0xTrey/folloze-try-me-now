import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.hoisted(() => {
  process.env.BRANDFETCH_MODE = "enrich";
  process.env.BRANDFETCH_CLIENT_ID = "testClient_12345";
  process.env.BRANDFETCH_API_KEY = "server-only-test-key-that-is-long-enough";
});

const safeFetchMocks = vi.hoisted(() => ({
  fetchPinnedPublicBytes: vi.fn(),
  fetchPinnedPublicText: vi.fn()
}));

vi.mock("@/lib/safe-fetch", () => safeFetchMocks);

import { harvestBrand } from "@/lib/integrations/brand-harvester";

const ciscoSvg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cisco logo" viewBox="0 0 100 52"><title>Cisco</title><path fill="#1BA0D7" d="M1 1h98v50H1z"/></svg>'
);
const samsungSvg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Samsung wordmark" viewBox="0 0 240 44"><title>Samsung</title><path fill="#1428A0" d="M1 1h238v42H1z"/></svg>'
);
const fordSvg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ford wordmark" viewBox="0 0 220 82"><title>Ford</title><path fill="#00095B" d="M1 1h218v80H1z"/></svg>'
);
const validWordmarkPng = new Uint8Array(readFileSync(join(
  process.cwd(),
  "public",
  "verified-brands",
  "servicenow",
  "homepage-header-logo.png"
)));

describe("Brandfetch Logo API and Brand API enrichment", () => {
  beforeEach(() => {
    vi.stubEnv("BRANDFETCH_MODE", "enrich");
    vi.stubEnv("BRANDFETCH_CLIENT_ID", "testClient_12345");
    vi.stubEnv("BRANDFETCH_API_KEY", "server-only-test-key-that-is-long-enough");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    safeFetchMocks.fetchPinnedPublicText.mockRejectedValue(new Error("Official site blocked"));
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bytes: ciscoSvg,
      finalUrl: new URL("https://cdn.brandfetch.io/cisco/logo.svg"),
      truncated: false
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "Cisco",
      domain: "cisco.com",
      colors: [{ hex: "#07182D" }, { hex: "#1BA0D7" }],
      logos: [{
        type: "logo",
        formats: [{ src: "https://cdn.brandfetch.io/cisco/logo.svg", format: "svg" }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    safeFetchMocks.fetchPinnedPublicBytes.mockReset();
    safeFetchMocks.fetchPinnedPublicText.mockReset();
  });

  it("hotlinks the Logo API in the browser while keeping the Brand API key server-only", async () => {
    const profile = await harvestBrand("cisco.com");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.brandfetch.io/v2/brands/domain/cisco.com?allowNsfw=false",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer server-only-test-key-that-is-long-enough"
        },
        redirect: "error"
      })
    );
    expect(safeFetchMocks.fetchPinnedPublicBytes).not.toHaveBeenCalled();
    expect(profile).toMatchObject({
      companyName: "Cisco",
      logoUrl: expect.stringContaining("cdn.brandfetch.io/domain/cisco.com"),
      logoUrlOnDark: expect.stringContaining("theme/light"),
      source: "brand-harvester",
      diagnostics: {
        logo: {
          strategy: "brandfetch-logo-api",
          resolutionComplete: true
        },
        providers: {
          brandfetchLogoApi: "configured",
          brandfetchBrandApi: "succeeded"
        }
      }
    });
    expect(JSON.stringify(profile)).not.toContain("server-only-test-key-that-is-long-enough");
    expect(profile.logoUrl).toContain("type/logo?c=testClient_12345");
  });

  it("uses the Logo API wordmark and retains validated first-party bytes as fallback evidence", async () => {
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: `<!doctype html><html><head>
        <title>Samsung Electronics</title>
        <meta property="og:site_name" content="Samsung">
        <meta name="theme-color" content="#1428A0">
      </head><body><header>
        <img class="header-logo" src="/assets/samsung-logo-icon.svg" alt="Samsung logo" width="64" height="64">
      </header></body></html>`,
      finalUrl: new URL("https://www.samsung.com/"),
      truncated: false
    });
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bytes: samsungSvg,
      finalUrl: new URL("https://cdn.brandfetch.io/samsung/wordmark.svg"),
      truncated: false
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "Samsung",
      domain: "samsung.com",
      colors: [{ hex: "#1428A0" }, { hex: "#000000" }, { hex: "#FFFFFF" }],
      logos: [{
        type: "logo",
        formats: [{ src: "https://cdn.brandfetch.io/samsung/wordmark.svg", format: "svg" }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const profile = await harvestBrand("samsung.com");

    expect(profile).toMatchObject({
      companyName: "Samsung",
      logoUrl: expect.stringContaining("/domain/samsung.com/"),
      portableLogo: { source: "official-remote-asset" },
      diagnostics: { logo: { strategy: "brandfetch-logo-api" } }
    });
    expect(profile.logoSourceUrl).toBeUndefined();
  });

  it("uses a validated Brandfetch palette when Ford's public page yields only low-confidence colors", async () => {
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: `<!doctype html><html><head>
        <title>Ford Motor Company</title>
        <meta property="og:site_name" content="Ford">
        <link rel="icon" href="/favicon.ico">
      </head><body><main><h1>Built Ford Proud</h1></main></body></html>`,
      finalUrl: new URL("https://www.ford.com/"),
      truncated: false
    });
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bytes: fordSvg,
      finalUrl: new URL("https://cdn.brandfetch.io/ford/wordmark.svg"),
      truncated: false
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "Ford",
      domain: "ford.com",
      colors: [{ hex: "#00095B" }, { hex: "#066FEF" }, { hex: "#FFFFFF" }],
      logos: [{
        type: "logo",
        formats: [{ src: "https://cdn.brandfetch.io/ford/wordmark.svg", format: "svg" }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const profile = await harvestBrand("ford.com");

    expect(profile).toMatchObject({
      companyName: "Ford",
      primaryColor: "#00095B",
      accentColor: "#066FEF",
      surfaceColor: "#FFFFFF",
      colors: ["#00095B", "#066FEF", "#FFFFFF"],
      diagnostics: {
        logo: { strategy: "brandfetch-logo-api" },
        palette: { strategy: "brandfetch", confidence: "high" }
      }
    });
  });

  it("surfaces an explicit provider error and refuses to treat generic colors as brand evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 403,
      headers: { "content-type": "application/json" }
    })));

    const profile = await harvestBrand("brand-api-denied.example");

    expect(profile.diagnostics?.providers).toMatchObject({
      brandfetchLogoApi: "configured",
      brandfetchBrandApi: "unauthorized"
    });
    expect(profile.readiness?.paletteReady).toBe(false);
    expect(profile.readiness?.reasons.join(" ")).toMatch(/Brandfetch color enrichment was rejected/i);
    expect(profile.diagnostics?.palette?.strategy).toBe("fallback");
  });

  it("trusts a first-party redirect as a canonical-domain alias and retries Brandfetch there", async () => {
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: `<!doctype html><html><head>
        <title>Canonical Company</title>
        <meta property="og:site_name" content="Canonical Company">
      </head><body><main><h1>Canonical Company</h1></main></body></html>`,
      finalUrl: new URL("https://canonical-company.example/"),
      truncated: false
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/domain/submitted-alias.example")) {
        return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        name: "Canonical Company",
        domain: "canonical-company.example",
        colors: [
          { hex: "#10243E", type: "dark" },
          { hex: "#FF5C35", type: "accent" },
          { hex: "#FFFFFF", type: "light" }
        ],
        logos: []
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const profile = await harvestBrand("submitted-alias.example");

    expect(profile).toMatchObject({
      domain: "submitted-alias.example",
      canonicalDomain: "canonical-company.example",
      domainAliases: ["canonical-company.example"],
      primaryColor: "#10243E",
      accentColor: "#FF5C35",
      surfaceColor: "#FFFFFF"
    });
    expect(profile.logoUrl).toContain("/domain/canonical-company.example/");
    expect(profile.readiness?.sourceEvidenceReady).toBe(true);
  });

  it("resolves a regional subdomain through the parent Brandfetch brand", async () => {
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: `<!doctype html><html><head>
        <title>Philips - United States</title>
        <meta property="og:site_name" content="Philips">
      </head><body><main><h1>Philips</h1></main></body></html>`,
      finalUrl: new URL("https://www.usa.philips.com/"),
      truncated: false
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/domain/usa.philips.com")) {
        return new Response(JSON.stringify({
          name: "Philips",
          domain: "philips.com",
          colors: []
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      expect(url).toContain("/domain/philips.com");
      return new Response(JSON.stringify({
        name: "Philips",
        domain: "philips.com",
        claimed: false,
        colors: [
          { hex: "#0B5ED7", type: "dark" },
          { hex: "#1474E4", type: "accent" },
          { hex: "#FFFFFF", type: "light" }
        ],
        logos: []
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const profile = await harvestBrand("usa.philips.com");

    expect(profile).toMatchObject({
      domain: "usa.philips.com",
      canonicalDomain: "philips.com",
      companyName: "Philips",
      domainAliases: ["philips.com"]
    });
    expect(profile.logoUrl).toContain("/domain/philips.com/");
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/domain/usa.philips.com"),
      expect.any(Object)
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/domain/philips.com"),
      expect.any(Object)
    );
  });

  it("copies TechTarget's semantic navigation wordmark for reliable first-party delivery", async () => {
    vi.stubEnv("BRANDFETCH_MODE", "disabled");
    vi.stubEnv("BRANDFETCH_CLIENT_ID", "");
    vi.stubEnv("BRANDFETCH_API_KEY", "");
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: `<!doctype html><html><head>
        <title>TechTarget | Enterprise Technology Research</title>
        <meta property="og:site_name" content="TechTarget">
        <meta name="theme-color" content="#008080">
      </head><body><header>
        <img class="header-logo-desktop replace_2x" alt="TechTarget" width="210" height="35"
          src="https://cdn.ttgtmedia.com/rms/ux/responsive/img/nav_logo.png">
      </header><main><h1>Enterprise technology intelligence for buyers</h1></main></body></html>`,
      finalUrl: new URL("https://www.techtarget.com/"),
      truncated: false
    });
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/png" },
      bytes: validWordmarkPng,
      finalUrl: new URL("https://cdn.ttgtmedia.com/rms/ux/responsive/img/nav_logo.png"),
      truncated: false
    });

    const profile = await harvestBrand("techtarget.com");

    expect(profile).toMatchObject({
      companyName: "TechTarget",
      logoUrl: "https://cdn.ttgtmedia.com/rms/ux/responsive/img/nav_logo.png",
      logoSourceUrl: "https://cdn.ttgtmedia.com/rms/ux/responsive/img/nav_logo.png",
      portableLogo: {
        mediaType: "image/png",
        source: "official-remote-asset"
      },
      diagnostics: {
        logo: {
          strategy: "official-remote-portable",
          resolutionComplete: true
        }
      }
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
