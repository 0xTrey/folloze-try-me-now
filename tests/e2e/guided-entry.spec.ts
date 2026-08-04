import { expect, test } from "@playwright/test";

test.describe("guided first-run experience", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Try Me Now V1 is a desktop-first experience.");
    await page.goto("/", { waitUntil: "networkidle" });
  });

  test("starts with three plain-language paths and no premature email gate", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "What do you want to build?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Personalize for an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch a campaign" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transform my content" })).toBeVisible();
    await expect(page.getByText("No blank canvas")).toBeVisible();
    await expect(page.getByText("Usually 30–60 seconds")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);

    const examples = page.locator('a[target="_blank"][rel="noopener noreferrer"]');
    await expect(examples).toHaveCount(3);
    await expect(examples.nth(0)).toHaveAttribute(
      "href",
      "https://experience.folloze.com/folloze-for-nvidia"
    );
    await expect(examples.nth(2)).toHaveAttribute(
      "href",
      "https://engage.folloze.com/cisco-hmf-example"
    );
  });

  test("asks for one company signal before exposing the three-decision flow", async ({ page }) => {
    await page.getByRole("button", { name: "Personalize for an account" }).click();

    await expect(page.getByRole("heading", { name: "What is your company domain?" })).toBeVisible();
    await expect(page.getByText("We confirm before we compose.")).toBeVisible();
    const domain = page.getByLabel("Company domain");
    const confirm = page.getByRole("button", { name: "Confirm this company" });
    await expect(confirm).toBeDisabled();

    await domain.fill("folloze.com");
    await expect(confirm).toBeEnabled();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Choose another path" }).click();
    await expect(page.getByRole("heading", { name: "What do you want to build?" })).toBeVisible();
  });
});
