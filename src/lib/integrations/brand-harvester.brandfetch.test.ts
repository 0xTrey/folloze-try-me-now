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
});
