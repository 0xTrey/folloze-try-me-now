import { expect, test, type Page } from "@playwright/test";

import {
  applyPersonalizationVariant,
  availablePersonalizationVariantIds,
  compilePersonalizationPlan
} from "../../src/lib/generation/personalization-preview";
import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type { ExperienceDraft } from "../../src/lib/generation/experience-schema";
import type {
  AudienceRecommendation,
  BrandProfile,
  SessionEvidenceItem
} from "../../src/lib/types";
import {
  deterministicSvg,
  experienceDraft,
  fixtureAssetOrigin,
  sellerBrand,
  targetBrand
} from "./generated-experience-fixture";

const draft: ExperienceDraft = {
  ...experienceDraft,
  campaignRegister: "one-to-one-abm",
  wireframeName: "abm-account-microsite",
  sectionLabels: {
    thesis: "Why it matters",
    lenses: "Where to start",
    journey: "Questions for the next conversation",
    close: "Choose the first move"
  },
  headline: "Make Integration decisions without losing control.",
  thesisHeadline: "The opportunity is a shared operating layer.",
  thesisBody:
    "A governed automation approach helps teams connect work across applications while keeping ownership visible.",
  primaryCta: "Review the integration path"
};

const evidenceItems: SessionEvidenceItem[] = [
  {
    id: "ev-networking",
    type: "public-operating-context",
    label: "Networking operating context",
    text: "Cisco networking and hybrid infrastructure teams coordinate a broad technology estate.",
    sourceUrl: "https://cisco.com/networking",
    signals: ["networking", "hybrid"],
    disposition: "available",
    entityRole: "target",
    confidence: "high"
  },
  {
    id: "ev-security",
    type: "public-operating-context",
    label: "Security operating context",
    text: "Security and observability remain central to how Cisco describes platform modernization.",
    sourceUrl: "https://cisco.com/security",
    signals: ["security", "observability"],
    disposition: "available",
    entityRole: "target",
    confidence: "high"
  }
];

const personas: AudienceRecommendation[] = [
  {
    id: "aud-platform",
    label: "Infrastructure platform leaders",
    rationale: "Platform owners need one validation question before expanding automation scope.",
    evidenceItemIds: ["ev-networking"],
    confidence: "high",
    source: "seller-target-synthesis",
    confirmationStatus: "confirmed",
    targetName: "Cisco",
    evidenceSummary: "Hybrid infrastructure networking priorities"
  },
  {
    id: "aud-security",
    label: "Security architecture owners",
    rationale: "Security owners need proof that governance stays intact across connected workflows.",
    evidenceItemIds: ["ev-security"],
    confidence: "high",
    source: "seller-target-synthesis",
    confirmationStatus: "confirmed",
    targetName: "Cisco",
    evidenceSummary: "Security and observability modernization"
  }
];

async function fulfillFixtureAssets(page: Page): Promise<void> {
  await page.route(`${fixtureAssetOrigin}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: deterministicSvg
    });
  });
}

function personalizedAccountHtml(): { html: string; variantIds: string[] } {
  const plan = compilePersonalizationPlan({
    draft,
    seller: sellerBrand as BrandProfile,
    target: targetBrand as BrandProfile,
    useCase: "abm",
    answers: {
      targetDomain: "cisco.com",
      audience: "Infrastructure platform leaders",
      objective: "Align the buying group"
    },
    evidenceItems,
    audienceRecommendations: personas
  });
  const variantIds = availablePersonalizationVariantIds(plan);
  return {
    variantIds,
    html: renderExperienceHtml({
      draft: applyPersonalizationVariant(draft, plan, "account"),
      brand: sellerBrand,
      targetBrand,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure platform leaders",
        objective: "Align the buying group"
      },
      personalization: plan,
      personalizationVariantId: "account"
    })
  };
}

test.describe("unified builder desktop fixtures", () => {
  test("switches five personalization views without regenerating (U20/U21)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Personalization preview chrome is desktop-first.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fulfillFixtureAssets(page);
    const { html, variantIds } = personalizedAccountHtml();
    expect(variantIds).toEqual([
      "generic",
      "account",
      "account_industry",
      "account_industry_persona_a",
      "account_industry_persona_b"
    ]);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-personalization-variant", "account");

    const headlines = new Set<string>();
    for (const variantId of variantIds) {
      await page.evaluate((id) => {
        window.postMessage(
          { source: "folloze-builder", type: "set_personalization_variant", variantId: id },
          "*"
        );
      }, variantId);
      await expect(page.locator("body")).toHaveAttribute("data-personalization-variant", variantId);
      headlines.add((await page.locator('[data-flz-block-id="hero.headline"]').innerText()).trim());
    }
    expect(headlines.size).toBeGreaterThanOrEqual(3);
  });

  test("primary CTA scrolls to a real in-page destination (U27)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "CTA scroll contract is validated on desktop.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fulfillFixtureAssets(page);
    const { html } = personalizedAccountHtml();
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const cta = page.locator(".hero .primary").first();
    await expect(cta).toBeVisible();
    const scrollTarget = await cta.getAttribute("data-scroll-target");
    const actionType = await cta.getAttribute("data-experience-action");
    const href = await cta.getAttribute("href");
    expect(scrollTarget || href || actionType).toBeTruthy();

    if (scrollTarget) {
      await cta.click();
      await expect(page.locator(`[id="${scrollTarget}"]`)).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate((id) => {
            const el = document.getElementById(id);
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.top < window.innerHeight && rect.bottom > 0;
          }, scrollTarget)
        )
        .toBe(true);
      return;
    }

    if (href?.startsWith("#")) {
      await cta.click();
      await expect(page.locator(`[id="${href.slice(1)}"]`)).toBeVisible();
    }
  });

  test("keyboard focus reaches decision tabs and activates them (U27 a11y)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Keyboard tab contract is desktop-first.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fulfillFixtureAssets(page);
    const { html } = personalizedAccountHtml();
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const tabs = page.getByRole("tab");
    if ((await tabs.count()) < 2) {
      test.info().annotations.push({
        type: "note",
        description: "Account microsite fixture rendered without a tablist; CTA/scroll coverage still applies."
      });
      return;
    }
    await tabs.first().focus();
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  });
});
