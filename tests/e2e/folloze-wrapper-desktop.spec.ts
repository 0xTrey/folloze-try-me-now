import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const themeFixture = resolve("tests/fixtures/folloze-wrapper/theme-tokens.css");
const runtimeFixture = resolve("tests/fixtures/folloze-wrapper/runtime-components.css");

type Contract = Awaited<ReturnType<typeof renderContract>>;

async function renderContract(page: Page) {
  return page.evaluate(() => {
    const measurement = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing contract selector: ${selector}`);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        color: style.color,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        padding: style.padding,
        margin: style.margin,
        borderRadius: style.borderRadius,
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2))
      };
    };
    return {
      nav: measurement(".nav.fz-navs-1"),
      cta: measurement(".header-cta.fz-btn"),
      stageTitle: measurement(".stage-title.fz-heading-2"),
      pathTab: measurement('.path-tabs.fz-tabs-2 .path-tab[aria-selected="false"]'),
      modalClose: measurement(".modal-close.fz-btn-circle"),
      documentHeight: document.documentElement.scrollHeight,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      sectionOrder: Array.from(document.querySelectorAll<HTMLElement>("main > section")).map(
        (section) => section.id || section.className
      )
    };
  });
}

function expectContractParity(wrapped: Contract, standalone: Contract) {
  expect(wrapped.sectionOrder).toEqual(standalone.sectionOrder);
  expect(wrapped.overflow).toBe(0);
  expect(Math.abs(wrapped.documentHeight - standalone.documentHeight)).toBeLessThanOrEqual(1);

  for (const key of ["nav", "cta", "stageTitle", "pathTab", "modalClose"] as const) {
    expect(wrapped[key]).toMatchObject({
      color: standalone[key].color,
      fontWeight: standalone[key].fontWeight,
      lineHeight: standalone[key].lineHeight,
      padding: standalone[key].padding,
      margin: standalone[key].margin,
      borderRadius: standalone[key].borderRadius
    });
    expect(Math.abs(wrapped[key].width - standalone[key].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(wrapped[key].height - standalone[key].height)).toBeLessThanOrEqual(1);
  }
}

test("keeps the NVIDIA desktop artifact stable inside the frozen Folloze wrapper", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The public Try Me Now demo is desktop-only.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://cdn.folloze.com/theme/**", async (route) => {
    await route.fulfill({ path: themeFixture, contentType: "text/css" });
  });

  await page.goto("/examples/folloze-for-nvidia-1to1.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("[data-open-sprint]").first().click();
  await expect(page.getByRole("dialog", { name: "The first account sprint." })).toBeVisible();
  const standalone = await renderContract(page);
  await page.locator("[data-close-sprint]").first().click();
  await expect(page.locator("#sprintModal")).not.toHaveAttribute("open", "");

  await page.evaluate(() => document.body.classList.add("folloze-runtime"));
  await page.addStyleTag({ path: runtimeFixture });
  await page.locator("[data-open-sprint]").first().click();
  await expect(page.getByRole("dialog", { name: "The first account sprint." })).toBeVisible();
  const wrapped = await renderContract(page);

  expectContractParity(wrapped, standalone);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  await page.locator("[data-close-sprint]").first().click();
  await expect(page.locator("#sprintModal")).not.toHaveAttribute("open", "");

  const secondPath = page.locator('[role="tab"][data-path="enterprise"]');
  await secondPath.click();
  await expect(secondPath).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pathTitle")).toContainText("production confidence");

  if (process.env.CAPTURE_QA_ARTIFACT === "1") {
    await page.screenshot({
      path: "output/playwright/folloze-wrapper-nvidia-desktop.png",
      fullPage: true
    });
  }
});
