import { expect, test, type Page } from "@playwright/test";

import {
  collectSectionVisualIntegrityMetrics,
  sectionVisualIntegrityPasses
} from "../../src/lib/generation/section-visual-integrity";
import {
  compileRuntimeVisualFixture,
  fulfillRuntimeAssets,
  noLogoBrand,
  runtimeAssetOrigin,
  runtimeVisualFixtures
} from "./three-family-runtime-fixture";
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
  await fulfillRuntimeAssets(page);
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
  expect(metrics.sectionsOutsideViewport).toEqual([]);
  expect(metrics.clippedFocusTargets).toEqual([]);
  expect(metrics.clippedVisibleText).toEqual([]);
  expect(metrics.lowContrastText).toEqual([]);
  expect(metrics.emptyMediaContainers).toEqual([]);
  expect(metrics.brokenImages).toBe(0);
  expect(sectionVisualIntegrityPasses(metrics)).toBe(true);
}

async function assertInteractiveLensTabs(page: Page): Promise<void> {
  const tabs = page.getByRole("tab");
  if ((await tabs.count()) === 0) return;
  await expect(tabs).toHaveCount(3);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#lens-panel-1")).toBeVisible();
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#lens-panel-2")).toBeVisible();
}

test.describe("section visual integrity matrix", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Section integrity evidence is desktop-only.");
  });

  test("passes for the default generated experience across viewports", async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await fulfillFixtureAssets(page);
      await page.setContent(generatedExperienceHtml(), { waitUntil: "domcontentloaded" });
      await assertSectionVisualIntegrity(page);
      await assertInteractiveLensTabs(page);
      await page.screenshot({ path: testInfo.outputPath(`default-${viewport.name}.png`), fullPage: true });
    }
  });

  test("passes for sparse seller inventory with designed fallbacks", async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
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
      await expect(page.locator(".media-fallback").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`sparse-${viewport.name}.png`), fullPage: true });
    }
  });

  for (const fixture of runtimeVisualFixtures) {
    test(`passes for ${fixture.id} (${fixture.expectedFamily})`, async ({ page }, testInfo) => {
      const compiled = await compileRuntimeVisualFixture(fixture);
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await fulfillFixtureAssets(page);
        await page.setContent(compiled.html, { waitUntil: "domcontentloaded" });
        await assertSectionVisualIntegrity(page);
        await assertInteractiveLensTabs(page);
        await page.screenshot({ path: testInfo.outputPath(`${fixture.id}-${viewport.name}.png`), fullPage: true });
      }
    });
  }

  test("removes failed imagery into designed fallbacks across the family matrix", async ({ page }, testInfo) => {
    for (const fixture of runtimeVisualFixtures) {
      const compiled = await compileRuntimeVisualFixture(fixture);
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.route(`${runtimeAssetOrigin}/**`, (route) => route.abort("failed"));
        await page.setContent(compiled.html, { waitUntil: "domcontentloaded" });
        await expect.poll(() => page.locator(".media img").count()).toBe(0);
        await expect(page.locator(".media.has-asset")).toHaveCount(0);
        await expect(page.locator(".media-fallback").first()).toBeVisible();
        await assertInteractiveLensTabs(page);
        await assertSectionVisualIntegrity(page);
        await page.screenshot({ path: testInfo.outputPath(`failed-${fixture.expectedFamily}-${viewport.name}.png`), fullPage: true });
        await page.unrouteAll({ behavior: "ignoreErrors" });
      }
    }
  });

  test("passes for sparse no-logo recovery inventory", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await fulfillFixtureAssets(page);
    const html = generatedExperienceHtml({
      seller: {
        ...noLogoBrand,
        imageUrls: []
      },
      target: null,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Operations Platform",
        audience: "Operations leaders",
        objective: "Evaluate the operating model"
      }
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await assertSectionVisualIntegrity(page);
  });
});
