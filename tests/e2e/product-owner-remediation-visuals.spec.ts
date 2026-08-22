import { expect, test } from "@playwright/test";

import {
  deterministicSvg,
  fixtureAssetOrigin,
  generatedExperienceHtml,
  sellerBrand
} from "./generated-experience-fixture";

test.describe("product-owner remediation visual fixtures", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Remediation evidence is desktop-only.");
    testInfo.annotations.push({
      type: "fixture",
      description: "Deterministic local fixture; it does not prove live provider connectivity."
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route(`${fixtureAssetOrigin}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: deterministicSvg
      });
    });
  });

  test("captures a verified brand with distinct seller imagery", async ({ page }) => {
    const html = generatedExperienceHtml({
      seller: {
        ...sellerBrand,
        readiness: {
          status: "ready",
          identityReady: true,
          logoReady: true,
          paletteReady: true,
          designReady: true,
          sourceEvidenceReady: true,
          reasons: []
        }
      },
      target: null,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony",
        audience: "Integration platform leaders",
        objective: "Launch or announce"
      }
    });
    await page.setContent(html, { waitUntil: "networkidle" });

    const hero = page.locator(".hero-media img");
    const later = page.locator(".lens-media img").first();
    await expect(hero).toBeVisible();
    await expect(later).toBeVisible();
    const heroSrc = await hero.getAttribute("src");
    const laterSrc = await later.getAttribute("src");
    expect(heroSrc).toBeTruthy();
    expect(laterSrc).toBeTruthy();
    expect(heroSrc).not.toBe(laterSrc);
    await page.screenshot({
      path: "output/product-owner-remediation/verified-brand-with-imagery.png",
      fullPage: true
    });
  });

  test("captures the explicit neutral fallback when visual evidence is unavailable", async ({
    page
  }) => {
    const html = generatedExperienceHtml({
      seller: {
        ...sellerBrand,
        logoUrl: undefined,
        imageUrls: [],
        colors: ["#202124", "#5F6368", "#FFFFFF"],
        primaryColor: "#202124",
        accentColor: "#5F6368",
        surfaceColor: "#FFFFFF",
        source: "fallback",
        readiness: {
          status: "incomplete",
          identityReady: true,
          logoReady: false,
          paletteReady: false,
          designReady: false,
          sourceEvidenceReady: false,
          reasons: ["Visual providers are unavailable in this fixture."]
        }
      },
      target: null,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony",
        audience: "Integration platform leaders",
        objective: "Launch or announce"
      }
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await expect(page.locator("body")).toHaveAttribute(
      "data-brand-palette-treatment",
      "neutral-fallback"
    );
    await expect(page.getByText(/Brand colors are not yet verified/i)).toBeVisible();
    await expect(page.locator(".hero-media img")).toHaveCount(0);
    await expect(page.locator(".hero-media .media-fallback")).toBeVisible();
    await page.screenshot({
      path: "output/product-owner-remediation/partial-unavailable-brand-fallback.png",
      fullPage: true
    });
  });
});
