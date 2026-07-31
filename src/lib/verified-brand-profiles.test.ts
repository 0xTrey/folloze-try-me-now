import { describe, expect, it } from "vitest";

import {
  brandPresentationFor,
  verifiedBrandProfileFor
} from "@/lib/verified-brand-profiles";

describe("verified browser-backed brand profiles", () => {
  it("restores ServiceNow design DNA when the public site blocks a server fetch", () => {
    const profile = verifiedBrandProfileFor("https://www.servicenow.com/");

    expect(profile).toMatchObject({
      domain: "servicenow.com",
      companyName: "ServiceNow",
      primaryColor: "#032D42",
      accentColor: "#63DF4E",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "Instrument Sans",
      bodyFontFamily: "Inter",
      displayFontUrl: expect.stringMatching(/^https:\/\/fonts\.gstatic\.com\/.+\.woff2$/),
      bodyFontUrl: expect.stringMatching(/^https:\/\/fonts\.gstatic\.com\/.+\.woff2$/),
      source: "brand-harvester"
    });
    expect(profile?.imageUrls[0]).toContain("servicenow-assets");
    expect(profile?.logoUrl).toContain("servicenow-header-logo-white.svg");
    expect(profile && brandPresentationFor(profile)).toMatchObject({
      heroTheme: "dark",
      supportingAccentColor: "#52B8FF",
      lightSurfaceAccentColor: "#1A610E",
      lightTextColor: "#1D1D1D",
      primaryButtonHover: "#9FE793",
      focusColor: "#3EAA2B",
      buttonRadiusPx: 500,
      buttonHeightPx: 56,
      buttonBorderWidthPx: 2,
      fontFallback: "sans"
    });
  });

  it("does not pretend an unverified domain has a browser-backed profile", () => {
    expect(verifiedBrandProfileFor("unknown-example.test")).toBeUndefined();
  });
});
