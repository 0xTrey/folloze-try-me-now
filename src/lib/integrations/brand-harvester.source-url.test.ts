import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BRAND_MODE = "remote";
  process.env.BRAND_HARVESTER_URL = "https://harvester.example/brand";
  process.env.BRANDFETCH_MODE = "disabled";
  process.env.BRANDFETCH_CLIENT_ID = "";
  process.env.BRANDFETCH_API_KEY = "";
});

const safeFetchMocks = vi.hoisted(() => ({
  fetchPinnedPublicBytes: vi.fn(),
  fetchPinnedPublicText: vi.fn()
}));

vi.mock("@/lib/safe-fetch", () => safeFetchMocks);

import {
  harvestBrand,
  normalizeOfficialBrandSourceUrl
} from "@/lib/integrations/brand-harvester";

describe("official brand source URL authority", () => {
  beforeEach(() => {
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: `<!doctype html><html><head>
        <title>ServiceTitan Platform</title>
        <meta property="og:site_name" content="ServiceTitan">
        <meta name="theme-color" content="#0265DC">
      </head><body><main><h1>Platform for the trades</h1></main></body></html>`,
      finalUrl: new URL(
        "https://www.servicetitan.com/solutions/commercial/?campaign=brand%20recovery"
      ),
      truncated: false
    });
    safeFetchMocks.fetchPinnedPublicBytes.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile: {
        companyName: "ServiceTitan",
        colors: ["#040404", "#0265DC", "#FFFFFF"],
        primaryColor: "#040404",
        accentColor: "#0265DC",
        surfaceColor: "#FFFFFF",
        publicTopics: ["Commercial service operations"],
        imageUrls: [],
        sourceUrl:
          "https://www.servicetitan.com/solutions/commercial/?campaign=brand%20recovery"
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    safeFetchMocks.fetchPinnedPublicText.mockReset();
    safeFetchMocks.fetchPinnedPublicBytes.mockReset();
  });

  it("sends the same normalized caller source to local and remote harvesters", async () => {
    const supplied =
      "  https://WWW.ServiceTitan.com/solutions/commercial/?campaign=brand%20recovery#overview  ";
    const normalized =
      "https://www.servicetitan.com/solutions/commercial/?campaign=brand%20recovery";

    await harvestBrand("servicetitan.com", supplied);

    expect(safeFetchMocks.fetchPinnedPublicText).toHaveBeenCalledWith(
      new URL(normalized),
      expect.objectContaining({ maxBytes: 1_000_000 })
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://harvester.example/brand",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          domain: "servicetitan.com",
          sourceUrl: normalized,
          capture: "progressive"
        })
      })
    );
  });

  it("accepts regional hosts and explicitly approved canonical aliases", () => {
    expect(
      normalizeOfficialBrandSourceUrl(
        "philips.com",
        "https://www.usa.philips.com/healthcare/solutions"
      )
    ).toBe("https://www.usa.philips.com/healthcare/solutions");
    expect(
      normalizeOfficialBrandSourceUrl(
        "datadoghq.com",
        "https://www.datadog.com/product/",
        ["datadog.com"]
      )
    ).toBe("https://www.datadog.com/product/");
  });

  it.each([
    "https://attacker.example/brand",
    "http://www.philips.com/healthcare",
    "https://user:password@www.philips.com/healthcare",
    "https://www.philips.com:8443/healthcare",
    "https://127.0.0.1/healthcare",
    "https://[::1]/healthcare",
    "https://localhost/healthcare"
  ])("rejects unsafe or cross-brand source %s", (sourceUrl) => {
    expect(() =>
      normalizeOfficialBrandSourceUrl("philips.com", sourceUrl)
    ).toThrow("Use a public HTTPS page on the seller company domain.");
  });

  it("does not infer a cross-domain alias without verified approval", () => {
    expect(() =>
      normalizeOfficialBrandSourceUrl(
        "datadoghq.com",
        "https://www.datadog.com/product/"
      )
    ).toThrow("Use a public HTTPS page on the seller company domain.");
  });
});
