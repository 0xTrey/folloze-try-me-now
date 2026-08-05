import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const tinyPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("credentialed Brandfetch logo fallback", () => {
  beforeEach(() => {
    vi.stubEnv("BRANDFETCH_API_KEY", "server-only-test-key");
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

  it("copies a validated logo into the server profile without returning a Brandfetch hotlink or secret", async () => {
    const profile = await harvestBrand("cisco.com");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.brandfetch.io/v2/brands/cisco.com",
      expect.objectContaining({
        headers: { Authorization: "Bearer server-only-test-key" },
        redirect: "error"
      })
    );
    expect(safeFetchMocks.fetchPinnedPublicBytes).toHaveBeenCalledWith(
      "https://cdn.brandfetch.io/cisco/logo.svg",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() })
      })
    );
    expect(profile).toMatchObject({
      companyName: "Cisco",
      logoUrl: undefined,
      portableLogo: {
        mediaType: "image/svg+xml",
        source: "brandfetch"
      },
      source: "brand-harvester",
      diagnostics: {
        logo: {
          strategy: "brandfetch-portable",
          resolutionComplete: true
        }
      }
    });
    expect(JSON.stringify(profile)).not.toContain("server-only-test-key");
    expect(JSON.stringify(profile)).not.toContain("cdn.brandfetch.io");
  });

  it("upgrades a small Samsung icon to the Brandfetch wordmark", async () => {
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
      colors: [{ hex: "#1428A0" }, { hex: "#000000" }, { hex: "#FFFFFF" }],
      logos: [{
        type: "logo",
        formats: [{ src: "https://cdn.brandfetch.io/samsung/wordmark.svg", format: "svg" }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const profile = await harvestBrand("samsung.com");

    expect(profile).toMatchObject({
      companyName: "Samsung",
      portableLogo: { source: "brandfetch" },
      diagnostics: { logo: { strategy: "brandfetch-portable" } }
    });
    expect(profile.logoSourceUrl).toBeUndefined();
    expect(profile.logoUrl).toBeUndefined();
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
      portableLogo: { source: "brandfetch" },
      diagnostics: {
        logo: { strategy: "brandfetch-portable" },
        palette: { strategy: "brandfetch", confidence: "high" }
      }
    });
  });

  it("copies TechTarget's semantic navigation wordmark for reliable first-party delivery", async () => {
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
      bytes: tinyPng,
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
