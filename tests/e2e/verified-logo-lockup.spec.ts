import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import {
  brandWithFirstPartyImages,
  imageDeliverySources
} from "../../src/lib/image-delivery";
import { verifiedBrandProfileFor } from "../../src/lib/verified-brand-profiles";
import { experienceDraft } from "./generated-experience-fixture";

test("renders the real Medidata and Lilly logo pair without distortion or text fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const seller = verifiedBrandProfileFor("medidata.com")!;
  const target = verifiedBrandProfileFor("lilly.com")!;
  const sources = imageDeliverySources({ answers: {}, brand: seller, targetBrand: target });
  const renderedSeller = brandWithFirstPartyImages("verified-logo-pair", seller, sources, 1);
  const renderedTarget = brandWithFirstPartyImages("verified-logo-pair", target, sources, 1);
  const html = renderExperienceHtml({
    draft: { ...experienceDraft, campaignRegister: "one-to-one-abm" },
    brand: renderedSeller,
    targetBrand: renderedTarget,
    useCase: "abm",
    answers: {
      targetDomain: "lilly.com",
      audience: "Clinical development and trial operations leaders",
      objective: "Build consensus around a clinical trial modernization path"
    }
  });
  const [medidataSvg, lillySvg] = await Promise.all([
    readFile(join(process.cwd(), "public/verified-brands/medidata/official-wordmark.svg"), "utf8"),
    readFile(join(process.cwd(), "public/verified-brands/lilly/official-wordmark.svg"), "utf8")
  ]);

  await page.route("http://try.example/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/image/seller-logo")) {
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: medidataSvg });
      return;
    }
    if (url.pathname.endsWith("/image/target-logo")) {
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: lillySvg });
      return;
    }
    if (url.pathname === "/api/events") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.pathname === "/e/verified-logo-pair") {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
      return;
    }
    await route.fulfill({ status: 404, body: "" });
  });

  await page.goto("http://try.example/e/verified-logo-pair", { waitUntil: "domcontentloaded" });
  const sellerWordmark = page.locator(".seller-wordmark");
  const targetWordmark = page.locator(".target-wordmark");
  await expect(sellerWordmark).toHaveClass(/has-image/);
  await expect(targetWordmark).toHaveClass(/has-image/);
  await expect(sellerWordmark.locator("img")).toBeVisible();
  await expect(targetWordmark.locator("img")).toBeVisible();
  await expect(sellerWordmark.locator(".wordmark-fallback")).toBeHidden();
  await expect(targetWordmark.locator(".wordmark-fallback")).toBeHidden();

  const metrics = await page.evaluate(() => {
    const measurement = (selector: string) => {
      const image = document.querySelector<HTMLImageElement>(`${selector} img`)!;
      const rect = image.getBoundingClientRect();
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: rect.width,
        renderedHeight: rect.height,
        src: image.getAttribute("src")
      };
    };
    const lockup = document.querySelector<HTMLElement>(".brand-lockup")!.getBoundingClientRect();
    const action = document.querySelector<HTMLElement>(".nav-action")!.getBoundingClientRect();
    return {
      seller: measurement(".seller-wordmark"),
      target: measurement(".target-wordmark"),
      lockup: { left: lockup.left, right: lockup.right, width: lockup.width },
      action: { left: action.left }
    };
  });

  for (const logo of [metrics.seller, metrics.target]) {
    expect(logo.naturalWidth).toBeGreaterThan(0);
    expect(logo.naturalHeight).toBeGreaterThan(0);
    const naturalRatio = logo.naturalWidth / logo.naturalHeight;
    const renderedRatio = logo.renderedWidth / logo.renderedHeight;
    expect(Math.abs(renderedRatio - naturalRatio) / naturalRatio).toBeLessThanOrEqual(0.02);
  }
  expect(metrics.seller.src).toContain("/image/seller-logo?v=1");
  expect(metrics.target.src).toContain("/image/target-logo?v=1");
  expect(metrics.lockup.width).toBeLessThanOrEqual(380);
  expect(metrics.lockup.left).toBeGreaterThanOrEqual(0);
  expect(metrics.lockup.right).toBeLessThan(metrics.action.left);

  if (process.env.CAPTURE_QA_ARTIFACT === "1") {
    await page.locator(".nav").screenshot({
      path: "output/playwright/medidata-lilly-logo-lockup.png"
    });
  }
});
