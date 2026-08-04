import { describe, expect, it } from "vitest";

import {
  brandPresentationFor,
  verifiedBrandLogoFallbackFor,
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
    expect(profile?.logoUrl).toContain("servicenow-header-logo.svg");
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

  it("maps Folloze to the reviewed first-party navbar wordmark", () => {
    const folloze = verifiedBrandProfileFor("https://www.folloze.com/");

    expect(folloze).toMatchObject({
      domain: "folloze.com",
      companyName: "Folloze",
      primaryColor: "#1C293F",
      accentColor: "#5B5BFF",
      logoUrl: expect.stringContaining("_folloze-logo.svg"),
      source: "brand-harvester"
    });
    expect(verifiedBrandLogoFallbackFor(folloze!.domain, folloze!.logoUrl!)).toEqual({
      path: "public/brand/folloze-logo.svg",
      sourceUrl: folloze!.logoUrl
    });
  });

  it("provides exact reviewed Medidata and Lilly wordmarks", () => {
    const medidata = verifiedBrandProfileFor("https://www.medidata.com/en/logo/");
    const lilly = verifiedBrandProfileFor("www.lilly.com");

    expect(medidata).toMatchObject({
      companyName: "Medidata",
      primaryColor: "#002855",
      accentColor: "#009CDE",
      logoUrl: expect.stringContaining("3DS_MEDIDATA_Logotype_Navy-2.png"),
      source: "brand-harvester"
    });
    expect(lilly).toMatchObject({
      companyName: "Lilly",
      primaryColor: "#D31710",
      logoUrl: expect.stringContaining("LillyLogo_RGB_Red_v3.svg"),
      source: "brand-harvester"
    });
    expect(verifiedBrandLogoFallbackFor(medidata!.domain, medidata!.logoUrl!)).toEqual({
      path: "public/verified-brands/medidata/official-wordmark.svg",
      sourceUrl: medidata!.logoUrl
    });
    expect(verifiedBrandLogoFallbackFor(lilly!.domain, lilly!.logoUrl!)).toEqual({
      path: "public/verified-brands/lilly/official-wordmark.svg",
      sourceUrl: lilly!.logoUrl
    });
  });

  it("does not map near-match domains or substituted URLs to local files", () => {
    const medidata = verifiedBrandProfileFor("medidata.com")!;
    const folloze = verifiedBrandProfileFor("folloze.com")!;

    expect(
      verifiedBrandLogoFallbackFor("medidata.com.attacker.example", medidata.logoUrl!)
    ).toBeUndefined();
    expect(
      verifiedBrandLogoFallbackFor("medidata.com", "https://attacker.example/logo.svg")
    ).toBeUndefined();
    expect(
      verifiedBrandLogoFallbackFor("folloze.com.attacker.example", folloze.logoUrl!)
    ).toBeUndefined();
    expect(
      verifiedBrandLogoFallbackFor("folloze.com", "https://attacker.example/folloze-logo.svg")
    ).toBeUndefined();
  });
});
