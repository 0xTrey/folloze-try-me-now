import { expect, test, type Page } from "@playwright/test";

import {
  canonicalDesktopExperiences,
  deterministicSvg,
  experienceDraft,
  fixtureAssetOrigin,
  generatedExperienceHtml,
  sellerBrand,
  targetBrand
} from "./generated-experience-fixture";

const viewports = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 }
] as const;

const forbiddenCopy = [
  "make the next move easier to believe",
  "brings the problem, proof, and next step together",
  "generic pages force buyers to do the translation",
  "relevance is a sequence, not a token swap",
  "every interaction should tell you what matters next",
  "unlock",
  "seamless",
  "robust",
  "innovative",
  "game-changing",
  "revolutionize",
  "supercharge",
  "tailored solutions",
  "cutting-edge",
  "grounded in",
  "aligned to",
  "public platform story",
  "prepared for"
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

async function loadGeneratedExperience(page: Page, html = generatedExperienceHtml()): Promise<void> {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".shell")).toBeVisible();
}

async function forceAssetResolution(page: Page): Promise<void> {
  await page.locator("img").evaluateAll((images) => {
    for (const node of images) {
      const image = node as HTMLImageElement;
      image.loading = "eager";
      image.src = image.src;
    }
  });
}

async function majorLayoutOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      ".shell",
      ".nav",
      ".hero",
      ".thesis",
      ".lens-lab",
      ".lens-panel:not([hidden])",
      ".journey",
      ".journey-card",
      ".close",
      ".footer"
    ];
    const tolerance = 1;
    return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        return rect.left < -tolerance || rect.right > window.innerWidth + tolerance;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}.${element.className}: ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`;
      });
  });
}

test.describe("generated 1:1 experience", () => {
  test("keeps shared desktop invariants across ABM, campaign, and content", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fulfillFixtureAssets(page);
    const fingerprints: Array<Record<string, unknown>> = [];
    const visibleHeadlines: string[] = [];

    for (const experience of canonicalDesktopExperiences) {
      await loadGeneratedExperience(page, experience.html);
      await forceAssetResolution(page);
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.locator(".media.has-asset").count()).toBe(4);

      const snapshot = await page.evaluate(() => {
        const coreRegionSelectors = [
          ".hero",
          ".signature-canonical",
          ".thesis",
          ".lens-lab",
          ".journey",
          ".close"
        ];
        const geometrySelectors = [
          ".hero",
          ".signature-canonical",
          ".lens-panel:not([hidden])",
          ".journey-grid",
          ".close"
        ];
        const coreRegions = Object.fromEntries(coreRegionSelectors.map((selector) => {
          const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
          return [selector, { x: Math.round(rect.x), width: Math.round(rect.width) }];
        }));
        const geometry = Object.fromEntries(geometrySelectors.map((selector) => {
          const style = getComputedStyle(document.querySelector<HTMLElement>(selector)!);
          return [selector, {
            columns: style.gridTemplateColumns,
            gap: style.gap,
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight,
            minHeight: style.minHeight
          }];
        }));
        return {
          wireframe: document.body.dataset.wireframe,
          shape: document.body.dataset.experienceShape,
          layout: document.body.dataset.layoutVariant,
          sectionOrder: Array.from(document.querySelectorAll<HTMLElement>("main > section")).map(
            (section) => section.id || section.className
          ),
          counts: {
            signature: document.querySelectorAll("[data-signature-lens-index]").length,
            tabs: document.querySelectorAll("[role=tab]").length,
            panels: document.querySelectorAll("[role=tabpanel]").length,
            cards: document.querySelectorAll(".journey-card").length,
            heroActions: document.querySelectorAll(".hero .actions > *").length,
            liveHeroLinks: document.querySelectorAll(".hero .actions a").length
          },
          overflow: Math.max(
            0,
            document.documentElement.scrollWidth - window.innerWidth,
            document.body.scrollWidth - window.innerWidth
          ),
          coreRegions,
          geometry
        };
      });

      fingerprints.push(snapshot);
      visibleHeadlines.push(await page.locator(".hero h1").innerText());
      expect(await majorLayoutOverflow(page)).toEqual([]);
    }

    for (const fingerprint of fingerprints) {
      expect(fingerprint).toMatchObject({
        wireframe: "canonical-desktop-experience",
        shape: "guided-buyer-experience",
        layout: "standard",
        counts: {
          signature: 3,
          tabs: 3,
          panels: 3,
          cards: 3,
          heroActions: 1,
          liveHeroLinks: 0
        },
        overflow: 0
      });
      expect(fingerprint.sectionOrder).toEqual(expect.arrayContaining([
        "experience-overview",
        "signature signature-canonical",
        "experience-thesis",
        "decision-path",
        "supporting-resources",
        "next-step"
      ]));
    }
    expect(new Set(fingerprints.map((fingerprint) => JSON.stringify(fingerprint.geometry))).size).toBeGreaterThan(1);
    expect(new Set(visibleHeadlines).size).toBe(3);
  });

  test("applies harvested design DNA to the rendered desktop experience", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fulfillFixtureAssets(page);
    await loadGeneratedExperience(page, generatedExperienceHtml({
      seller: {
        ...sellerBrand,
        designDna: {
          version: 1,
          source: "remote-harvester",
          confidence: "high",
          theme: { hero: "dark", motif: "technical-grid" },
          typography: {
            fallback: "sans",
            headingWeight: 720,
            bodyWeight: 410,
            headingLetterSpacingEm: -0.025,
            headingLineHeight: 1.04
          },
          buttons: { radiusPx: 13, heightPx: 50, borderWidthPx: 2 },
          cards: { radiusPx: 19, borderWidthPx: 1, shadow: "soft" },
          spacing: { contentMaxWidthPx: 1260, sectionBlockPx: 88, gridGapPx: 27 }
        }
      }
    }));

    await expect(page.locator("body")).toHaveAttribute("data-brand-design-source", "remote-harvester");
    await expect(page.locator("body")).toHaveAttribute("data-brand-design-confidence", "high");
    const applied = await page.evaluate(() => {
      const primary = getComputedStyle(document.querySelector<HTMLElement>(".primary")!);
      const card = getComputedStyle(document.querySelector<HTMLElement>(".journey-card")!);
      const shell = getComputedStyle(document.querySelector<HTMLElement>(".shell")!);
      const section = getComputedStyle(document.querySelector<HTMLElement>(".journey")!);
      return {
        buttonRadius: primary.borderRadius,
        buttonHeight: primary.minHeight,
        buttonBorderWidth: primary.borderTopWidth,
        cardRadius: card.borderRadius,
        cardBorderWidth: card.borderTopWidth,
        contentWidth: shell.maxWidth,
        sectionPaddingTop: section.paddingTop,
        gridGap: getComputedStyle(document.querySelector<HTMLElement>(".journey-grid")!).gap
      };
    });
    expect(applied).toEqual({
      buttonRadius: "13px",
      buttonHeight: "50px",
      buttonBorderWidth: "2px",
      cardRadius: "19px",
      cardBorderWidth: "1px",
      contentWidth: "1260px",
      sectionPaddingTop: "88px",
      gridGap: "27px"
    });
    expect(await majorLayoutOverflow(page)).toEqual([]);
  });

  for (const viewport of viewports) {
    test(`contains its major layout at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await fulfillFixtureAssets(page);
      await loadGeneratedExperience(page);
      await forceAssetResolution(page);

      await expect
        .poll(() =>
          page.locator("img").evaluateAll((images) =>
            images.every((node) => {
              const image = node as HTMLImageElement;
              return image.complete && image.naturalWidth > 0;
            })
          )
        )
        .toBe(true);

      const documentMetrics = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight
      }));
      expect(documentMetrics.rootScrollWidth).toBeLessThanOrEqual(documentMetrics.viewportWidth);
      expect(documentMetrics.bodyScrollWidth).toBeLessThanOrEqual(documentMetrics.viewportWidth);
      expect(documentMetrics.bodyScrollHeight).toBeLessThanOrEqual(
        viewport.width <= 620 ? 7000 : viewport.width <= 980 ? 6200 : 5200
      );
      expect(await majorLayoutOverflow(page)).toEqual([]);

      const headline = page.locator(".hero h1");
      await expect(headline).toBeVisible();
      const headlineBox = await headline.boundingBox();
      expect(headlineBox).not.toBeNull();
      expect(headlineBox!.x).toBeGreaterThanOrEqual(0);
      expect(headlineBox!.x + headlineBox!.width).toBeLessThanOrEqual(viewport.width + 1);

      const cta = page.locator(".hero .primary");
      await expect(cta).toBeVisible();
      expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      const gridColumns = await page.evaluate(() => ({
        hero: getComputedStyle(document.querySelector<HTMLElement>(".hero")!).gridTemplateColumns.split(" ").length,
        lens: getComputedStyle(document.querySelector<HTMLElement>(".lens-panel:not([hidden])")!).gridTemplateColumns.split(" ").length,
        journey: getComputedStyle(document.querySelector<HTMLElement>(".journey-grid")!).gridTemplateColumns.split(" ").length
      }));

      if (viewport.width <= 620) {
        expect(gridColumns).toEqual({ hero: 1, lens: 1, journey: 1 });
        await expect(page.locator(".target-wordmark")).toBeHidden();
      } else if (viewport.width <= 980) {
        expect(gridColumns.hero).toBe(1);
        expect(gridColumns.lens).toBe(2);
        expect(gridColumns.journey).toBe(1);
        await expect(page.locator(".target-wordmark")).toBeVisible();
      } else {
        expect(gridColumns).toEqual({ hero: 2, lens: 3, journey: 3 });
        await expect(page.locator(".target-wordmark")).toBeVisible();
      }
    });
  }

  // Regression: QA ISSUE-004. The journey links must shrink as a grid item so
  // their deliberate horizontal overflow stays scrollable on a phone.
  test("keeps every journey destination reachable at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fulfillFixtureAssets(page);
    await loadGeneratedExperience(page);

    const links = page.locator(".journey-links");
    const lastDestination = links.getByRole("button").last();
    await links.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    await expect.poll(() => links.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

    const [linksBox, destinationBox] = await Promise.all([
      links.boundingBox(),
      lastDestination.boundingBox()
    ]);
    expect(linksBox).not.toBeNull();
    expect(destinationBox).not.toBeNull();
    expect(destinationBox!.x).toBeGreaterThanOrEqual(linksBox!.x - 1);
    expect(destinationBox!.x + destinationBox!.width).toBeLessThanOrEqual(
      linksBox!.x + linksBox!.width + 1
    );
  });

  test("hands wheel scrolling cleanly between an embedded preview and its host page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Mouse-wheel preview behavior is desktop-only.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await fulfillFixtureAssets(page);
    await page.setContent(`
      <style>
        html,body{margin:0}
        .before{height:320px}
        iframe{width:100%;height:620px;display:block;border:0}
        .after{height:1200px}
      </style>
      <div class="before"></div>
      <iframe id="preview" title="Generated buyer experience preview"></iframe>
      <div class="after"></div>
      <script>
        window.addEventListener('message', function(event){
          var frame=document.getElementById('preview');
          var data=event.data;
          if(!frame||event.source!==frame.contentWindow||!data||data.source!=='folloze-experience'||data.action!=='preview_scroll_boundary')return;
          var delta=typeof data.deltaY==='number'&&Number.isFinite(data.deltaY)?Math.max(-1600,Math.min(1600,data.deltaY)):0;
          if(delta)window.scrollBy({top:delta,left:0,behavior:'auto'});
        });
      </script>
    `);

    const iframe = page.locator("#preview");
    await iframe.evaluate((node, html) => { (node as HTMLIFrameElement).srcdoc = html; }, generatedExperienceHtml());
    const frame = page.frameLocator("#preview");
    await expect(frame.locator(".shell")).toBeVisible();

    const childMetrics = () => frame.locator("html").evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return {
        top: root.scrollTop,
        max: Math.max(0, root.scrollHeight - root.clientHeight)
      };
    });

    await page.evaluate(() => window.scrollTo(0, 0));
    await frame.locator("html").evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(720, 560);
    await page.mouse.wheel(0, 700);
    await expect.poll(async () => (await childMetrics()).top).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await frame.locator("html").evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(720, 560);
    await page.mouse.wheel(0, 520);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const atEnd = await childMetrics();
    expect(atEnd.top).toBeGreaterThanOrEqual(atEnd.max - 1);

    await page.evaluate(() => window.scrollTo(0, 220));
    await frame.locator("html").evaluate(() => window.scrollTo(0, 0));
    const hostBeforeUpwardHandoff = await page.evaluate(() => window.scrollY);
    await page.mouse.move(720, 300);
    await page.mouse.wheel(0, -420);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(hostBeforeUpwardHandoff);
    expect((await childMetrics()).top).toBe(0);
  });

  test("implements an accessible, keyboard-operable tab set", async ({ page }) => {
    await fulfillFixtureAssets(page);
    await loadGeneratedExperience(page);

    const tabList = page.getByRole("tablist", { name: experienceDraft.sectionLabels.lenses });
    const tabs = tabList.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("tabpanel").nth(0)).toBeVisible();
    await expect(page.locator('[role="tabpanel"][hidden]')).toHaveCount(2);

    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#lens-panel-1")).toBeVisible();
    await expect(page.locator("#lens-panel-0")).toBeHidden();

    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toBeFocused();
    await expect(page.locator("#lens-panel-2")).toBeVisible();

    await page.keyboard.press("Home");
    await expect(tabs.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");

    for (let index = 0; index < 3; index += 1) {
      await expect(tabs.nth(index)).toHaveAttribute("aria-controls", `lens-panel-${index}`);
      await expect(page.locator(`#lens-panel-${index}`)).toHaveAttribute("aria-labelledby", `lens-tab-${index}`);
    }
  });

  test("falls back to accessible wordmarks and visual media when assets fail", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.route(`${fixtureAssetOrigin}/**`, (route) => route.abort("failed"));
    await loadGeneratedExperience(page);
    await forceAssetResolution(page);

    await expect.poll(() => page.locator(".wordmark img, .media img").count()).toBe(0);
    await expect(page.locator(".seller-wordmark .wordmark-fallback")).toHaveText("Jitterbit");
    await expect(page.locator(".seller-wordmark .wordmark-fallback")).toBeVisible();
    await expect(page.locator(".target-wordmark .wordmark-fallback")).toHaveText("Cisco");
    await expect(page.locator(".target-wordmark .wordmark-fallback")).toBeVisible();
    await expect(page.locator(".media.has-asset")).toHaveCount(0);
    await expect(page.locator(".media-fallback").first()).toHaveCSS("opacity", "1");
  });

  test("rejects unsafe asset URLs and renders fallbacks immediately", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const unsafeSeller = {
      ...sellerBrand,
      logoUrl: "http://assets.example.test/jitterbit-logo.svg",
      imageUrls: ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zy8+"]
    };
    const unsafeTarget = {
      ...targetBrand,
      logoUrl: "https://user:password@assets.example.test/cisco-logo.svg"
    };

    await loadGeneratedExperience(
      page,
      generatedExperienceHtml({ seller: unsafeSeller, target: unsafeTarget })
    );

    await expect(page.locator(".wordmark img, .media img")).toHaveCount(0);
    await expect(page.locator(".seller-wordmark .wordmark-fallback")).toBeVisible();
    await expect(page.locator(".target-wordmark .wordmark-fallback")).toBeVisible();
    await expect(page.locator(".media.has-asset")).toHaveCount(0);
  });

  test("contains account-specific copy and none of the forbidden generic phrases", async ({ page }) => {
    await fulfillFixtureAssets(page);
    await loadGeneratedExperience(page);

    const visibleCopy = (await page.locator("body").innerText()).toLowerCase();
    expect(visibleCopy).toContain("jitterbit");
    expect(visibleCopy).toContain("cisco");
    expect(visibleCopy).toContain("integration");
    expect(visibleCopy).toContain("automation");
    expect(visibleCopy).toContain(experienceDraft.audienceLabel.toLowerCase());

    for (const phrase of forbiddenCopy) {
      expect(visibleCopy, `forbidden copy found: ${phrase}`).not.toContain(phrase);
    }

    await expect(page.locator(".close .primary")).toHaveText(experienceDraft.primaryCta);
    const carryForwardQuestions = await page.locator(".journey-card h3").allTextContents();
    expect(carryForwardQuestions).toHaveLength(3);
    expect(carryForwardQuestions.every((question) => question.trim().endsWith("?"))).toBe(true);
    await expect(page.locator(".hero h1")).not.toHaveText(experienceDraft.closingHeadline);
    await expect(page.locator(".close h2")).not.toHaveText(experienceDraft.headline);
  });
});
