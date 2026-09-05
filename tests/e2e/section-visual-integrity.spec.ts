import { expect, test, type Page } from "@playwright/test";

import {
  collectSectionVisualIntegrityMetrics,
  sectionVisualIntegrityPasses
} from "../../src/lib/generation/section-visual-integrity";
import {
  deterministicSvg,
  fixtureAssetOrigin,
  generatedExperienceHtml,
  sellerBrand
} from "./generated-experience-fixture";

const viewports = [
  { name: "desktop-narrow", width: 1280, height: 720 },
  { name: "desktop-standard", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
] as const;

async function fulfillFixtureAssets(page: Page): Promise<void> {
  await page.route(`${fixtureAssetOrigin}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: deterministicSvg
    });
  });
}

async function assertSectionVisualIntegrity(page: Page): Promise<void> {
  await page.locator("img").evaluateAll((images) => {
    for (const node of images) {
      const image = node as HTMLImageElement;
      image.loading = "eager";
      image.src = image.src;
    }
  });
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0)
  );
  const metrics = await page.evaluate(collectSectionVisualIntegrityMetrics);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth + 1);
  expect(metrics.horizontalOverflow).toBe(false);
  expect(metrics.sectionsOutsideViewport).toEqual([]);
  expect(metrics.clippedFocusTargets).toEqual([]);
  expect(metrics.clippedVisibleText).toEqual([]);
  expect(metrics.lowContrastText).toEqual([]);
  expect(metrics.emptyMediaContainers).toEqual([]);
  expect(metrics.brokenImages).toBe(0);
  expect(sectionVisualIntegrityPasses(metrics)).toBe(true);
}

test.describe("section visual integrity", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Section integrity evidence is desktop-only.");
  });

  for (const viewport of viewports) {
    test(`keeps the verified brand experience inside the viewport at ${viewport.name}`, async ({
      page
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await fulfillFixtureAssets(page);
      await page.setContent(generatedExperienceHtml(), { waitUntil: "domcontentloaded" });
      await expect(page.locator(".shell")).toBeVisible();
      await assertSectionVisualIntegrity(page);
    });
  }

  test("keeps readable content without placeholder figures when imagery is sparse", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fulfillFixtureAssets(page);
    const html = generatedExperienceHtml({
      seller: {
        ...sellerBrand,
        imageUrls: [`${fixtureAssetOrigin}/jitterbit-platform.svg`]
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
    await assertSectionVisualIntegrity(page);
    await expect(page.locator(".media-fallback, .media:not(:has(img))")).toHaveCount(0);
    await expect(page.locator(".hero h1")).toBeVisible();
    await expect(page.locator(".hero h1")).not.toHaveText("");
    await expect(page.locator(".media.has-asset img").count()).resolves.toBeLessThanOrEqual(1);
  });

  test("removes failed images and keeps readable content without empty media shells", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.route(`${fixtureAssetOrigin}/**`, (route) => route.abort("failed"));
    await page.setContent(generatedExperienceHtml(), { waitUntil: "domcontentloaded" });
    await page.locator("img").evaluateAll((images) => {
      for (const node of images) {
        const image = node as HTMLImageElement;
        image.loading = "eager";
        image.src = image.src;
      }
    });
    await expect.poll(() => page.locator(".media img").count()).toBe(0);
    await expect(page.locator(".media.has-asset")).toHaveCount(0);
    await expect(page.locator(".media, .media-fallback")).toHaveCount(0);
    await expect(page.locator(".hero h1")).toBeVisible();
    await expect(page.locator(".hero h1")).not.toHaveText("");
    await assertSectionVisualIntegrity(page);
  });

  test("gives each visible lens tab useful content and never repeats imagery", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fulfillFixtureAssets(page);
    await page.setContent(generatedExperienceHtml(), { waitUntil: "domcontentloaded" });
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);

    const mediaSignatures: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      await tabs.nth(index).click();
      const panel = page.locator(`#lens-panel-${index}`);
      await expect(panel).toBeVisible();
      await expect(panel.locator(".lens-copy h2")).toBeVisible();
      await expect(panel.locator(".lens-copy p").first()).not.toHaveText("");
      await expect(panel.locator(".media-fallback, .media:not(:has(img))")).toHaveCount(0);
      const signature = await panel.evaluate((node) => {
        const image = node.querySelector<HTMLImageElement>(".lens-media img");
        return image?.src ?? null;
      });
      if (signature) mediaSignatures.push(signature);
    }
    expect(new Set(mediaSignatures).size).toBe(mediaSignatures.length);
    await assertSectionVisualIntegrity(page);
  });
});
