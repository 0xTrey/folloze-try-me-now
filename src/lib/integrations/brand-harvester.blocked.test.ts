import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-fetch", () => ({
  fetchPinnedPublicText: vi.fn().mockRejectedValue(new Error("Akamai returned 403"))
}));

import { harvestBrand } from "@/lib/integrations/brand-harvester";
import { fetchPinnedPublicText } from "@/lib/safe-fetch";
import { brandPresentationFor } from "@/lib/verified-brand-profiles";

describe("blocked public brand sites", () => {
  beforeEach(() => {
    vi.mocked(fetchPinnedPublicText).mockRejectedValue(new Error("Akamai returned 403"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("uses the reviewed browser-backed ServiceNow profile instead of a generic fallback", async () => {
    const profile = await harvestBrand("servicenow.com");

    expect(profile).toMatchObject({
      companyName: "ServiceNow",
      primaryColor: "#032D42",
      accentColor: "#63DF4E",
      displayFontFamily: "Instrument Sans",
      bodyFontFamily: "Inter",
      displayFontUrl: expect.stringContaining("fonts.gstatic.com/s/instrumentsans/"),
      bodyFontUrl: expect.stringContaining("fonts.gstatic.com/s/inter/"),
      source: "brand-harvester"
    });
    expect(brandPresentationFor(profile)).toMatchObject({
      heroTheme: "dark",
      buttonRadiusPx: 500,
      cardRadiusPx: 32
    });
  });

  it("keeps the licensed fallback font delivery URLs when the fast extractor succeeds", async () => {
    vi.mocked(fetchPinnedPublicText).mockResolvedValueOnce({
      status: 200,
      headers: { "content-type": "text/html" },
      text: "<!doctype html><title>ServiceNow</title><h1>Put AI to work</h1>",
      finalUrl: new URL("https://www.servicenow.com/"),
      truncated: false
    });

    const profile = await harvestBrand("servicenow.com");

    expect(profile.displayFontUrl).toContain("fonts.gstatic.com/s/instrumentsans/");
    expect(profile.bodyFontUrl).toContain("fonts.gstatic.com/s/inter/");
  });

  it("uses reviewed real logos when Medidata or Lilly blocks the fast fetch", async () => {
    const medidata = await harvestBrand("medidata.com");
    const lilly = await harvestBrand("lilly.com");

    expect(medidata).toMatchObject({
      companyName: "Medidata",
      logoUrl: expect.stringContaining("3DS_MEDIDATA_Logotype_Navy-2.png"),
      primaryColor: "#002855",
      source: "brand-harvester"
    });
    expect(lilly).toMatchObject({
      companyName: "Lilly",
      logoUrl: expect.stringContaining("LillyLogo_RGB_Red_v3.svg"),
      primaryColor: "#D31710",
      source: "brand-harvester"
    });
  });

  it("does not mislabel an unknown blocked site as verified", async () => {
    await expect(harvestBrand("unknown-example.test")).rejects.toThrow("Akamai returned 403");
    const logged = vi.mocked(console.error).mock.calls
      .map(([entry]) => JSON.parse(String(entry)) as { type: string; requestId: string; code: string; operation: string })
      .at(-1);
    expect(logged).toMatchObject({
      type: "try_me_error",
      code: "brand_harvest_failed",
      operation: "brand_harvest_public_fallback"
    });
    expect(logged?.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
