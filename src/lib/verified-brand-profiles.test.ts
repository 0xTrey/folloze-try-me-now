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

  it("keeps Apple's harvested neutral system primary and blue interactive", () => {
    const apple = verifiedBrandProfileFor("https://www.apple.com/ipad/");

    expect(apple).toMatchObject({
      domain: "apple.com",
      companyName: "Apple",
      primaryColor: "#1D1D1F",
      accentColor: "#0071E3",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "SF Pro Display",
      bodyFontFamily: "SF Pro Text",
      source: "brand-harvester"
    });
    expect(apple && brandPresentationFor(apple)).toMatchObject({
      heroTheme: "light",
      softSurfaceColor: "#F5F5F7",
      lightTextColor: "#1D1D1F",
      mutedTextColor: "#6E6E73",
      primaryButtonBackground: "#0071E3",
      primaryButtonText: "#FFFFFF",
      lightSurfaceAccentColor: "#0066CC",
      cardRadiusPx: 28,
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

  it("restores the reviewed 6sense wordmark when Cloudflare blocks server fetches", () => {
    const sixsense = verifiedBrandProfileFor("https://www.6sense.com/platform/revvyai/");

    expect(sixsense).toMatchObject({
      domain: "6sense.com",
      companyName: "6sense",
      primaryColor: "#192232",
      accentColor: "#13BBB2",
      surfaceColor: "#FFFFFF",
      logoUrl: "https://6sense.com/wp-content/themes/6Sense-2025/assets/img/logos/logo.svg",
      source: "brand-harvester",
      diagnostics: {
        logo: {
          strategy: "verified-profile",
          resolutionComplete: true
        }
      }
    });
    expect(verifiedBrandLogoFallbackFor(sixsense!.domain, sixsense!.logoUrl!)).toEqual({
      path: "public/verified-brands/6sense/official-wordmark.png.b64",
      sourceUrl: sixsense!.logoUrl
    });
  });

  it("does not map near-match domains or substituted URLs to local files", () => {
    const medidata = verifiedBrandProfileFor("medidata.com")!;
    const folloze = verifiedBrandProfileFor("folloze.com")!;
    const sixsense = verifiedBrandProfileFor("6sense.com")!;

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
    expect(
      verifiedBrandLogoFallbackFor("6sense.com.attacker.example", sixsense.logoUrl!)
    ).toBeUndefined();
    expect(
      verifiedBrandLogoFallbackFor("6sense.com", "https://attacker.example/6sense.svg")
    ).toBeUndefined();
  });
});
