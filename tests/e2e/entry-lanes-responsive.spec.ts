import { expect, test } from "@playwright/test";

test.describe("Try Me Now launch lanes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("keeps all four launch lanes visible without horizontal overflow", async ({ page }) => {
    await expect(page.locator("[data-entry-lane]")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Build an account microsite", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Build a campaign page", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Build an event page", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Content Magic", exact: true })).toBeVisible();
    await expect(page.locator(".entryLaneIndex")).toHaveText(["1", "2", "3", "4"]);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      cardsInsideViewport: Array.from(document.querySelectorAll<HTMLElement>("[data-entry-lane]"))
        .every((card) => {
          const bounds = card.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= window.innerWidth + 1;
        })
    }));

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.cardsInsideViewport).toBe(true);
  });
});
