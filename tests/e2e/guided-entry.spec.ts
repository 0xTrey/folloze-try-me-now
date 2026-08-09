import { expect, test } from "@playwright/test";

test.describe("guided first-run experience", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Try Me Now V1 is a desktop-first experience.");
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("starts with three plain-language paths and no premature email gate", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Build a buyer-ready experience." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Build a 1:1 account experience" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch a campaign landing page" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make content interactive" })).toBeVisible();
    await expect(page.getByText("Start with a guided brief")).toBeVisible();
    await expect(page.getByText("First preview in about a minute")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);

    const examples = page.locator('a[target="_blank"][rel="noopener noreferrer"]');
    await expect(examples).toHaveCount(3);
    await expect(examples.nth(0)).toHaveAttribute(
      "href",
      "https://experience.folloze.com/aprio-for-georgia-pacific"
    );
    await expect(examples.nth(2)).toHaveAttribute(
      "href",
      "https://engage.folloze.com/cisco-hmf-example"
    );

    const contentPreview = page.locator('article[aria-label="Content: Make content interactive"] video');
    await expect(contentPreview).toHaveAttribute("autoplay", "");
    await expect(contentPreview).toHaveAttribute("loop", "");
    await expect(contentPreview).toHaveAttribute("muted", "");
    await expect(contentPreview).toHaveAttribute("playsinline", "");
    await expect(contentPreview.locator("source")).toHaveAttribute(
      "src",
      "https://images.folloze.com/video/upload/c_scale,w_720,q_auto:eco,f_mp4/v1777151497/zgkmcphemqnjt3ivxifq.mp4"
    );
  });

  test("asks for one company signal before exposing the three-decision flow", async ({ page }) => {
    await page.getByRole("button", { name: "Build a 1:1 account experience" }).click();

    await expect(page.getByRole("heading", { name: "Start with your company." })).toBeVisible();
    await expect(page.getByText(/start matching the logo, colors, and public brand cues/i)).toBeVisible();
    const domain = page.getByLabel("Company domain");
    const confirm = page.getByRole("button", { name: "Use this company" });
    await expect(confirm).toBeDisabled();

    await domain.fill("folloze.com");
    await expect(confirm).toBeEnabled();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Choose another path" }).click();
    await expect(page.getByRole("heading", { name: "Build a buyer-ready experience." })).toBeVisible();
  });
});
