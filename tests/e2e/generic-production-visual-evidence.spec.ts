import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type { ExperienceDraft } from "../../src/lib/generation/experience-schema";
import type { BrandProfile } from "../../src/lib/types";
import { experienceDraft } from "./generated-experience-fixture";

const assetOrigin = "https://assets.production-evidence.test";
const evidenceDirectory = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-22-generic-builder-production-engine/evidence"
);

type VisualFixture = {
  id: "apple" | "adp" | "servicetitan" | "no-logo-recovery";
  brand: BrandProfile;
  headline: string;
  expected: {
    buttonColor: string;
    buttonRadius: string;
    logoMode: "image" | "fallback";
    noAsset: boolean;
  };
};

function brand(
  input: Pick<BrandProfile, "domain" | "companyName" | "primaryColor" | "accentColor"> & {
    id: string;
    surfaceColor?: string;
    imageLed?: boolean;
    logo?: boolean;
    designDna: NonNullable<BrandProfile["designDna"]>;
  }
): BrandProfile {
  const surfaceColor = input.surfaceColor ?? "#FFFFFF";
  return {
    domain: input.domain,
    canonicalDomain: input.domain,
    domainAliases: [],
    companyName: input.companyName,
    title: `${input.companyName} buyer experience`,
    description: `A guided evaluation experience for ${input.companyName}.`,
    publicContext: "A bounded local visual fixture with no provider or external mutation.",
    publicTopics: ["guided evaluation"],
    logoUrl: input.logo === false ? undefined : `${assetOrigin}/${input.id}-logo.svg`,
    imageUrls: input.imageLed ? [`${assetOrigin}/${input.id}-product.svg`] : [],
    colors: [input.primaryColor, input.accentColor, surfaceColor],
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    surfaceColor,
    sourceUrl: `https://${input.domain}/`,
    source: input.logo === false ? "fast-extractor" : "brand-harvester",
    designDna: input.designDna,
    diagnostics: {
      logo: {
        strategy: input.logo === false ? "none" : "official-remote-portable",
        imageCandidateCount: input.logo === false ? 0 : 1,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0,
        resolutionComplete: true
      },
      palette: {
        strategy: "semantic-tokens",
        confidence: "high",
        candidateCount: 3,
        semanticCandidateCount: 3,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    }
  };
}

const fixtures: VisualFixture[] = [
  {
    id: "apple",
    brand: brand({
      id: "apple",
      domain: "apple.com",
      companyName: "Apple",
      primaryColor: "#1D1D1F",
      accentColor: "#0071E3",
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "high",
        theme: { hero: "light", motif: "none" },
        typography: { fallback: "sans", headingWeight: 600, bodyWeight: 400 },
        buttons: { primaryBackground: "#0071E3", radiusPx: 20, heightPx: 44, borderWidthPx: 0 },
        cards: { radiusPx: 0, borderWidthPx: 1, shadow: "none" },
        spacing: { contentMaxWidthPx: 1024, sectionBlockPx: 120, gridGapPx: 28 }
      }
    }),
    headline: "Explore the next Apple deployment decision.",
    expected: {
      buttonColor: "rgb(0, 113, 227)",
      buttonRadius: "20px",
      logoMode: "image",
      noAsset: true
    }
  },
  {
    id: "adp",
    brand: brand({
      id: "adp",
      domain: "adp.com",
      companyName: "ADP",
      primaryColor: "#202428",
      accentColor: "#ED1C2E",
      imageLed: true,
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "high",
        theme: { hero: "light", motif: "none" },
        typography: { fallback: "sans", headingWeight: 600, bodyWeight: 400 },
        buttons: { primaryBackground: "#ED1C2E", radiusPx: 4, heightPx: 48, borderWidthPx: 0 },
        cards: { radiusPx: 2, borderWidthPx: 1, shadow: "none" },
        spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 72, gridGapPx: 32 }
      }
    }),
    headline: "Make the next workforce decision easier to evaluate.",
    expected: {
      buttonColor: "rgb(237, 28, 46)",
      buttonRadius: "4px",
      logoMode: "image",
      noAsset: false
    }
  },
  {
    id: "servicetitan",
    brand: brand({
      id: "servicetitan",
      domain: "servicetitan.com",
      companyName: "ServiceTitan",
      primaryColor: "#040404",
      accentColor: "#0265DC",
      imageLed: true,
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "high",
        theme: { hero: "light", motif: "technical-grid" },
        typography: { fallback: "sans", headingWeight: 700, bodyWeight: 400 },
        buttons: { primaryBackground: "#0265DC", radiusPx: 6, heightPx: 40, borderWidthPx: 0 },
        cards: { radiusPx: 6, borderWidthPx: 1, shadow: "soft" },
        spacing: { contentMaxWidthPx: 1180, sectionBlockPx: 88, gridGapPx: 24 }
      }
    }),
    headline: "Give service operations leaders a clear evaluation path.",
    expected: {
      buttonColor: "rgb(2, 101, 220)",
      buttonRadius: "6px",
      logoMode: "image",
      noAsset: false
    }
  },
  {
    id: "no-logo-recovery",
    brand: brand({
      id: "no-logo-recovery",
      domain: "no-logo.example",
      companyName: "No Logo Co.",
      primaryColor: "#18202A",
      accentColor: "#2C6BED",
      logo: false,
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "medium",
        theme: { hero: "light", motif: "none" },
        typography: { fallback: "sans", headingWeight: 650, bodyWeight: 400 },
        buttons: { primaryBackground: "#2C6BED", radiusPx: 10, heightPx: 46, borderWidthPx: 0 },
        cards: { radiusPx: 10, borderWidthPx: 1, shadow: "none" },
        spacing: { contentMaxWidthPx: 1120, sectionBlockPx: 80, gridGapPx: 20 }
      }
    }),
    headline: "Turn the next buying decision into a guided path.",
    expected: {
      buttonColor: "rgb(44, 107, 237)",
      buttonRadius: "10px",
      logoMode: "fallback",
      noAsset: true
    }
  }
];

function draftFor(fixture: VisualFixture): ExperienceDraft {
  return {
    ...structuredClone(experienceDraft),
    campaignRegister: "campaign-product",
    designRegister: fixture.expected.noAsset ? "source-brand-minimal" : "source-brand-image-led",
    title: `${fixture.brand.companyName} | Guided evaluation`,
    eyebrow: `${fixture.brand.companyName} buyer experience`,
    headline: fixture.headline,
    subhead:
      "A focused, evidence-bounded path for exploring the decision, comparing priorities, and choosing a practical next step.",
    audienceLabel: "Buying team",
    narrativeArc: "Explore the decision, compare the useful paths, and choose a supported next step.",
    primaryCta: "Review the decision path",
    thesisHeadline: "Start with the decision the buying team needs to make.",
    thesisBody:
      "Keep the experience focused on supported context, useful evaluation questions, and a clear next action.",
    closingHeadline: "Choose the next question worth answering together.",
    closingBody:
      "Use the guided path to identify the stakeholders, evidence, and next action needed for a productive conversation."
  };
}

async function fulfillLocalEvidenceAssets(page: Page): Promise<void> {
  await page.route(`${assetOrigin}/**`, async (route) => {
    const fileName = new URL(route.request().url()).pathname.split("/").at(-1) ?? "asset";
    const label = fileName
      .replace(/-(?:logo|product)\.svg$/i, "")
      .replace(/-/g, " ")
      .toUpperCase();
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img" aria-label="${label}"><rect width="1200" height="720" fill="#f4f5f7"/><path d="M90 560 360 220l210 250 170-170 370 260" fill="none" stroke="#68717d" stroke-width="28"/><text x="90" y="130" font-family="Arial,sans-serif" font-size="72" font-weight="700" fill="#202428">${label}</text></svg>`
    });
  });
}

test("captures bounded desktop visual evidence for materially different brands", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fulfillLocalEvidenceAssets(page);
  const manifest: Array<Record<string, unknown>> = [];

  for (const fixture of fixtures) {
    const html = renderExperienceHtml({
      draft: draftFor(fixture),
      brand: fixture.brand,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        audience: "Buying team",
        objective: "Evaluate the next step",
        ctaType: "book-meeting",
        ctaStyle: "solid"
      }
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(fixture.headline);
    await expect(page.locator(".primary").first()).toBeVisible();

    const metrics = await page.evaluate(() => {
      const primary = getComputedStyle(document.querySelector<HTMLElement>(".primary")!);
      const logoImage = document.querySelector<HTMLImageElement>(".seller-wordmark img");
      const fallback = document.querySelector<HTMLElement>(".seller-wordmark .wordmark-fallback");
      return {
        buttonColor: primary.backgroundColor,
        buttonRadius: primary.borderRadius,
        logoImageVisible: Boolean(
          logoImage && getComputedStyle(logoImage).display !== "none" && logoImage.naturalWidth > 0
        ),
        fallbackVisible: Boolean(
          fallback && getComputedStyle(fallback).display !== "none"
        ),
        noAssetTreatments: document.querySelectorAll(".no-asset-treatment").length,
        brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0)
          .length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        documentHeight: document.documentElement.scrollHeight
      };
    });

    expect(metrics.buttonColor).toBe(fixture.expected.buttonColor);
    expect(metrics.buttonRadius).toBe(fixture.expected.buttonRadius);
    expect(metrics.brokenImages).toBe(0);
    expect(metrics.horizontalOverflow).toBe(false);
    expect(metrics.logoImageVisible).toBe(fixture.expected.logoMode === "image");
    if (fixture.expected.logoMode === "fallback") {
      expect(metrics.fallbackVisible).toBe(true);
    }
    expect(metrics.noAssetTreatments > 0).toBe(fixture.expected.noAsset);

    if (process.env.CAPTURE_PRODUCTION_EVIDENCE === "1") {
      mkdirSync(evidenceDirectory, { recursive: true });
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
      brand: fixture.brand.companyName,
      fixture: fixture.id,
      viewport: { width: 1440, height: 1000 },
      source: "deterministic local fixture; no live provider requests",
      ...metrics
    });
  }

  if (process.env.CAPTURE_PRODUCTION_EVIDENCE === "1") {
    writeFileSync(
      resolve(evidenceDirectory, "visual-evidence-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }
});
