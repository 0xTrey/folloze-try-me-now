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
