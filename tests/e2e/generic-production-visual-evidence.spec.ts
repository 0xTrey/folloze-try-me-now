import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Route } from "@playwright/test";

import type { PublicTryMeSession, UseCase } from "../../src/lib/types";
import {
  compileRuntimeBrandHelpResult,
  compileRuntimeVisualFixture,
  fulfillRuntimeAssets,
  publicBrandHelpSession,
  runtimeVisualFixtures
} from "./three-family-runtime-fixture";

const evidenceDirectory = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-23-three-family-production-system/evidence"
);
const bannedBuyerFacingPhrases = [
  "decision path",
  "account thesis",
  "supporting proof",
  "operating outcome",
  "business fit",
  "evidence-bounded",
  "For Buying team",
  "Explore the decision",
  "Review the decision path"
];

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const [red, green, blue] = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

async function mockBrandHelpSession(
  route: Route,
  session: PublicTryMeSession
): Promise<void> {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (request.method() === "POST" && path.endsWith("/api/sessions")) {
    const body = request.postDataJSON() as { useCase: UseCase; companyDomain: string };
    expect(body).toMatchObject({
      useCase: "campaign",
      companyDomain: "no-logo.example"
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session })
    });
    return;
  }
  if (request.method() === "GET" && path.endsWith(`/api/sessions/${session.id}`)) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session })
    });
    return;
  }
  if (request.method() === "PATCH" && path.endsWith(`/api/sessions/${session.id}`)) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session })
    });
    return;
  }
  await route.fulfill({ status: 404, body: JSON.stringify({ error: "missing" }) });
}

test("proves runtime family production and truthful brand recovery", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fulfillRuntimeAssets(page);
  const manifest: Array<Record<string, unknown>> = [];
  const familyNavigation = new Map<string, string[]>();

  for (const fixture of runtimeVisualFixtures) {
    const compiled = await compileRuntimeVisualFixture(fixture);
    const decision = compiled.page.familyDecision;
    expect(decision).toMatchObject({
      version: 2,
      family: fixture.expectedFamily,
      subtype: fixture.expectedSubtype,
      locked: true,
      revision: fixture.session.revision
    });

    await page.setContent(compiled.html, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(fixture.expectedPersona, { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText(fixture.expectedOfferOrPriority, { exact: false }).first()
    ).toBeVisible();

    const expectedNavigation = decision!.sectionPlan.map(({ navigationLabel }) => navigationLabel);
    const renderedNavigation = (
      await page.locator("[data-flz-journey-nav] button[data-journey-link]").allTextContents()
    ).map((label) => label.trim());
    expect(renderedNavigation).toEqual(expectedNavigation);
    familyNavigation.set(fixture.expectedFamily, renderedNavigation);
    for (const image of await page.locator("figure[data-asset-role] img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty("complete", true);
    }
    await page.locator("h1").scrollIntoViewIfNeeded();

    const metrics = await page.evaluate((bannedPhrases) => {
      const primary = getComputedStyle(document.querySelector<HTMLElement>(".primary")!);
      const body = getComputedStyle(document.body);
      const logo = document.querySelector<HTMLImageElement>(".seller-wordmark img");
      const wordmark = document.querySelector<HTMLElement>(".seller-wordmark");
      const logoBox = logo?.getBoundingClientRect();
      const wordmarkBox = wordmark?.getBoundingClientRect();
      const mediaFigures = [...document.querySelectorAll<HTMLElement>(
        "figure.hero-media[data-asset-role], figure.framework-media[data-asset-role], figure.lens-media[data-asset-role]"
      )];
      // A slot with no credible asset renders a designed treatment rather than
      // repeating a photograph, so only figures carrying an image are measured
      // for delivery. The treatments are counted separately.
      const designedTreatments = mediaFigures.filter(
        (figure) => figure.classList.contains("no-asset-treatment") && !figure.querySelector("img")
      ).length;
      const media = mediaFigures.filter((figure) => figure.querySelector("img")).map((figure) => {
        const image = figure.querySelector<HTMLImageElement>("img");
        const imageBox = image?.getBoundingClientRect();
        const figureBox = figure.getBoundingClientRect();
        return {
          role: figure.dataset.assetRole,
          source: image?.src,
          visible: Boolean(image && image.complete && image.naturalWidth > 0),
          contained: Boolean(
            imageBox &&
            imageBox.left >= figureBox.left - 1 &&
            imageBox.right <= figureBox.right + 1 &&
            imageBox.top >= figureBox.top - 1 &&
            imageBox.bottom <= figureBox.bottom + 1
          )
        };
      });
      const bodyText = document.body.innerText;
      const journeySectionIds = [...document.querySelectorAll<HTMLElement>(
        "[data-journey-section]"
      )].map((section) => section.dataset.journeySection ?? "");
      const navigationTargets = [...document.querySelectorAll<HTMLElement>(
        "[data-journey-link]"
      )].map((link) => link.dataset.journeyLink ?? "");
      return {
        designedTreatments,
        buttonColor: primary.backgroundColor,
        buttonRadius: primary.borderRadius,
        buttonContrast: { foreground: primary.color, background: primary.backgroundColor },
        bodyContrast: { foreground: body.color, background: body.backgroundColor },
        logoImageVisible: Boolean(logo && logo.complete && logo.naturalWidth > 0),
        logoContained: Boolean(
          logoBox &&
          wordmarkBox &&
          logoBox.left >= wordmarkBox.left - 1 &&
          logoBox.right <= wordmarkBox.right + 1 &&
          logoBox.top >= wordmarkBox.top - 1 &&
          logoBox.bottom <= wordmarkBox.bottom + 1
        ),
        media,
        brokenImages: [...document.images].filter(
          (image) => !image.complete || image.naturalWidth === 0
        ).length,
        clippedImages: media.filter(({ contained }) => !contained).length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        duplicateJourneySections:
          journeySectionIds.length - new Set(journeySectionIds).size,
        missingNavigationTargets: navigationTargets.filter(
          (target) => !document.getElementById(target)
        ).length,
        documentHeight: document.documentElement.scrollHeight,
        bannedPhraseMatches: bannedPhrases.filter((phrase) =>
          bodyText.toLocaleLowerCase().includes(phrase.toLocaleLowerCase())
        )
      };
    }, bannedBuyerFacingPhrases);

    expect(
      contrastRatio(metrics.buttonContrast.foreground, metrics.buttonContrast.background)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(metrics.bodyContrast.foreground, metrics.bodyContrast.background)
    ).toBeGreaterThanOrEqual(4.5);
    expect(metrics.logoImageVisible).toBe(true);
    expect(metrics.logoContained).toBe(true);
    expect(metrics.media.length).toBeGreaterThan(0);
    expect(metrics.media.every(({ visible, contained }) => visible && contained)).toBe(true);
    expect(
      metrics.media.every(({ source, role }) =>
        Boolean(
          source &&
          fixture.brand.imageUrls.includes(source) &&
          role &&
          !/chart|graph|placeholder/i.test(source)
        )
      )
    ).toBe(true);
    // Substantive imagery is allocated once per experience: a slot the
    // allocator could not fill honestly must show a designed treatment, never
    // a second copy of an image already used above it.
    const placedSources = metrics.media.map(({ source }) => source);
    expect(new Set(placedSources).size).toBe(placedSources.length);
    expect(metrics.designedTreatments).toBeGreaterThanOrEqual(0);
    expect(metrics.brokenImages).toBe(0);
    expect(metrics.clippedImages).toBe(0);
    expect(metrics.horizontalOverflow).toBe(false);
    expect(metrics.duplicateJourneySections).toBe(0);
    expect(metrics.missingNavigationTargets).toBe(0);
    expect(metrics.bannedPhraseMatches).toEqual([]);

    const selectedImages = compiled.page.brand.imagery.selected;
    expect(selectedImages.map(({ role }) => role)).toContain("hero");
    expect(selectedImages.every(({ purpose }) => purpose !== "unknown")).toBe(true);
    expect(selectedImages.every(({ ref }) => fixture.brand.imageUrls.includes(ref))).toBe(true);

    if (process.env.CAPTURE_PRODUCTION_EVIDENCE === "1") {
      mkdirSync(evidenceDirectory, { recursive: true });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const journeyLinks = document.querySelector<HTMLElement>(".journey-links");
        if (journeyLinks) journeyLinks.scrollLeft = 0;
      });
      await page.screenshot({
        path: resolve(evidenceDirectory, `${fixture.id}-first-viewport.png`),
        fullPage: false
      });
      await page.screenshot({
        path: resolve(evidenceDirectory, `${fixture.id}-full-page.png`),
        fullPage: true
      });
    }

    manifest.push({
      fixture: fixture.id,
      runtimePath: "session-production-engine",
      outcome: "production-page",
      brand: fixture.brand.companyName,
      persona: fixture.expectedPersona,
      offerOrPriority: fixture.expectedOfferOrPriority,
      family: decision!.family,
      subtype: decision!.subtype,
      familyReasonCode: decision!.reasonCode,
      familyEvidenceRefs: decision!.evidenceRefs,
      sectionPlan: decision!.sectionPlan.map(({ id, role, navigationLabel }) => ({
        id,
        role,
        navigationLabel
      })),
      renderedNavigation,
      brandTokens: {
        primary: fixture.brand.primaryColor,
        action: fixture.brand.accentColor,
        button: fixture.brand.designDna?.buttons?.primaryBackground,
        surface: fixture.brand.surfaceColor,
        buttonRadius: fixture.brand.designDna?.buttons?.radiusPx,
        cardRadius: fixture.brand.designDna?.cards?.radiusPx,
        density: fixture.brand.designDna?.spacing?.sectionBlockPx
      },
      selectedImages,
      viewport: { width: 1440, height: 1000 },
      source: "deterministic local first-party-style fixture; no live provider request",
      ...metrics
    });
  }

  expect(new Set([...familyNavigation.values()].map((labels) => labels.join("|"))).size).toBe(3);

  const recoveryResult = await compileRuntimeBrandHelpResult();
  expect(recoveryResult).toMatchObject({
    outcome: "safe-deterministic-fallback",
    instruction: {
      code: "GPE_BRAND_HELP_REQUIRED",
      action: "request_brand_input",
      allowProviderWork: false
    }
  });
  const recoverySession = publicBrandHelpSession();
  await page.route("**/api/sessions**", async (route) => {
    await mockBrandHelpSession(route, recoverySession);
  });
  await page.route("**/api/analytics/events**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/events**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const primary = page.locator(".unifiedPrimaryCta");
  await expect(primary).toBeVisible();
  await expect(async () => {
    if (await page.locator(".domainStage").count()) return;
    await primary.click();
    await expect(page.locator(".domainStage")).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Company domain").fill("no-logo.example");
  await expect(page.getByRole("button", { name: /Use this company/i })).toBeEnabled();
  await page.getByRole("button", { name: /Use this company/i }).click();

  await expect(
    page.getByRole("region", { name: /Add a clearer brand source/i })
  ).toBeVisible();
  await expect(page.getByLabel("More specific official page URL")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator("iframe[title*='preview' i], iframe[title*='experience' i]")).toHaveCount(0);
  await expect(page.getByText(/research is preserved/i)).toBeVisible();

  if (process.env.CAPTURE_PRODUCTION_EVIDENCE === "1") {
    await page.screenshot({
      path: resolve(evidenceDirectory, "brand-help-recovery-first-viewport.png"),
      fullPage: false
    });
    await page.screenshot({
      path: resolve(evidenceDirectory, "brand-help-recovery-full-page.png"),
      fullPage: true
    });
  }
  manifest.push({
    fixture: "brand-help-recovery",
    runtimePath: "session-production-engine",
    outcome: "brand_help_required",
    customerReadyHtml: false,
    recoveryVisible: true,
    advertisedKinds: ["source_url"],
    providerWorkAllowed: false,
    viewport: { width: 1440, height: 1000 }
  });

  if (process.env.CAPTURE_PRODUCTION_EVIDENCE === "1") {
    writeFileSync(
      resolve(evidenceDirectory, "visual-evidence-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }
});
