import { expect, test, type Page, type Route } from "@playwright/test";

import type { PublicTryMeSession, SessionAnswers, UseCase } from "../../src/lib/types";

function publicSession(input: {
  id?: string;
  useCase: UseCase;
  companyDomain: string;
  answers?: SessionAnswers;
  status?: PublicTryMeSession["status"];
  brandName?: string;
}): PublicTryMeSession {
  const id = input.id ?? `e2e-${input.useCase}-${input.companyDomain.replace(/\W+/g, "")}`;
  const companyName = input.brandName ?? "Northpeak";
  return {
    id,
    supportRef: `TMN-${id.toUpperCase().slice(0, 12)}`,
    useCase: input.useCase,
    companyDomain: input.companyDomain,
    status: input.status ?? "collecting",
    createdAt: "2026-08-22T12:00:00.000Z",
    updatedAt: "2026-08-22T12:00:01.000Z",
    temporaryUrl: `https://example.test/e/${id}`,
    revision: 1,
    stages: {
      brand: { status: "complete", detail: "Brand matched" },
      audience: { status: "pending" },
      story: { status: "pending" }
    },
    answers: input.answers ?? {},
    brand: {
      domain: input.companyDomain,
      companyName,
      colors: ["#0B1F33", "#2F6FED", "#FFFFFF"],
      primaryColor: "#0B1F33",
      accentColor: "#2F6FED",
      surfaceColor: "#FFFFFF",
      source: "brand-harvester"
    },
    audienceSuggestions: ["Revenue leaders", "Platform architects", "Security owners"],
    audienceRecommendations: [
      {
        id: "rev",
        label: "Revenue leaders",
        confidence: "high",
        rationale: "Fit for the seller category",
        evidenceItemIds: [],
        source: "seller-category-fallback"
      },
      {
        id: "plat",
        label: "Platform architects",
        confidence: "medium",
        rationale: "Fit for platform owners",
        evidenceItemIds: [],
        source: "seller-public-evidence"
      }
    ]
  };
}

async function mockSessionApis(
  page: Page,
  sessions: Map<string, PublicTryMeSession>
): Promise<void> {
  await page.route("**/api/sessions**", async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "POST" && path.endsWith("/api/sessions")) {
      const body = request.postDataJSON() as { useCase: UseCase; companyDomain: string };
      const session = publicSession({
        useCase: body.useCase,
        companyDomain: body.companyDomain
      });
      sessions.set(session.id, session);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session })
      });
      return;
    }

    const match = path.match(/\/api\/sessions\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      const current = sessions.get(id);
      if (!current) {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: "missing" }) });
        return;
      }
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: current })
        });
        return;
      }
      if (method === "PATCH") {
        const patch = (request.postDataJSON() ?? {}) as SessionAnswers;
        const next: PublicTryMeSession = {
          ...current,
          answers: { ...current.answers, ...patch },
          revision: current.revision + 1,
          updatedAt: new Date().toISOString()
        };
        sessions.set(id, next);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: next })
        });
        return;
      }
    }

    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/analytics/events**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/events**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
}

async function startBuyerExperience(page: Page, domain = "northpeak.com"): Promise<void> {
  const primary = page.locator(".unifiedPrimaryCta");
  await expect(primary).toBeVisible();
  // SSR markup is clickable before React hydrates; retry until the domain stage mounts.
  await expect(async () => {
    if (await page.locator(".domainStage").count()) return;
    await primary.click({ trial: false });
    await expect(page.locator(".domainStage")).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Start with your company/i })).toBeVisible();
  await page.getByLabel("Company domain").fill(domain);
  await expect(page.getByRole("button", { name: /Use this company/i })).toBeEnabled();
  // Preflight delay is 750ms; wait for early research copy before confirming.
  await expect(page.locator("#domain-help")).toContainText(/matching the public brand|public brand scan|confirm this company|Ready to match/i, {
    timeout: 5_000
  });
  await expect(page.getByText(/Ready to match|Public brand scan/i).first()).toBeVisible();
  await page.getByRole("button", { name: /Use this company/i }).click();
  await expect(page.getByText(/Live brief/i).first()).toBeVisible({ timeout: 10_000 });
}

test.describe("unified guided first-run experience", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Try Me Now V1 is a desktop-first experience.");
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("shows one dominant buyer-experience door, Northpeak examples, and no legacy paths (U01-U04)", async ({
    page
  }, testInfo) => {
    await expect(page.getByRole("heading", { name: "Build a buyer experience." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Build a buyer experience/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Content Magic/i })).toBeVisible();

    await expect(page.getByRole("button", { name: "Build a 1:1 account experience" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Launch a campaign landing page" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Make content interactive" })).toHaveCount(0);
    await expect(page.getByText(/Aprio|ServiceNow|Cisco Hybrid Mesh|Worked Example|Watch Me Build/i)).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const northpeak = page.locator('aside[aria-label="Optional Northpeak worked states"] a');
    await expect(northpeak).toHaveCount(2);
    await expect(northpeak.nth(0)).toHaveAttribute(
      "href",
      "https://experience.folloze.com/northpeak--folloze"
    );
    await expect(northpeak.nth(1)).toHaveAttribute("href", "https://engage.folloze.com/120367");
    await expect(northpeak.nth(0)).toHaveText(/Northpeak account experience/i);
    await expect(northpeak.nth(1)).toHaveText(/Northpeak personalized campaign/i);

    await page.screenshot({
      path: testInfo.outputPath("unified-entry-u01.png"),
      fullPage: false
    });
  });

  test("campaign happy path: domain research starts early and brief stays editable before preview (U05-U08, U10, U22)", async ({
    page
  }) => {
    const sessions = new Map<string, PublicTryMeSession>();
    await mockSessionApis(page, sessions);

    await startBuyerExperience(page, "northpeak.com");

    expect([...sessions.values()].some((session) => session.useCase === "campaign")).toBe(true);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/Preview waits on the material brief|Live Brief|What are you taking to market/i).first()).toBeVisible();

    const intent = page.getByLabel(/What are you taking to market/i);
    await expect(intent).toBeVisible();
    await intent.fill("Launch Harmony for operations leaders who need governed automation.");
    await intent.press("Enter");

    await expect(page.getByText(/Seller/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live Brief" })).toBeVisible();
    await expect(page.getByText(/Harmony|operations leaders/i).first()).toBeVisible();

    // Selecting / answering must not reveal a final preview while brief incomplete.
    await expect(page.locator("iframe[title*='preview' i], iframe[title*='experience' i]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Start over/i })).toBeVisible();

    // Edit a Live Brief field without triggering generation reveal.
    const editOffer = page.getByRole("button", { name: /Edit Offer/i });
    if (await editOffer.count()) {
      await editOffer.click();
      await expect(page.getByLabel(/What are you taking to market/i)).toBeVisible();
    }
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("event signal is captured inside the unified campaign conversation (U05 event)", async ({ page }) => {
    const sessions = new Map<string, PublicTryMeSession>();
    await mockSessionApis(page, sessions);
    await startBuyerExperience(page, "jitterbit.com");

    const intent = page.getByLabel(/What are you taking to market/i);
    await intent.fill(
      "Promote our September customer webinar for revenue leaders about governed automation registration."
    );
    await intent.press("Enter");

    await expect
      .poll(() => {
        const session = [...sessions.values()][0];
        return session?.answers.campaignType;
      })
      .toBe("event");
    await expect(page.getByText(/Event landing page|Event|Drive registrations/i).first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("Content Magic remains reachable as a secondary route (U04)", async ({ page }) => {
    const sessions = new Map<string, PublicTryMeSession>();
    await mockSessionApis(page, sessions);

    const secondary = page.locator(".unifiedSecondaryCta");
    await expect(secondary).toBeVisible();
    await expect(async () => {
      if (await page.locator(".domainStage").count()) return;
      await secondary.click();
      await expect(page.locator(".domainStage")).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByLabel("Company domain")).toBeVisible();
    await page.getByLabel("Company domain").fill("northpeak.com");
    await page.getByRole("button", { name: /Use this company/i }).click();
    await expect(page.getByText(/Live brief|content|URL or PDF/i).first()).toBeVisible({
      timeout: 10_000
    });
    expect([...sessions.values()].some((session) => session.useCase === "content")).toBe(true);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("Start over is prominent and returns to the unified door", async ({ page }) => {
    const sessions = new Map<string, PublicTryMeSession>();
    await mockSessionApis(page, sessions);
    await startBuyerExperience(page, "northpeak.com");

    const startOver = page.getByRole("button", { name: /Start over/i }).first();
    await expect(startOver).toBeVisible();
    const box = await startOver.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    await startOver.click();
    await expect(page.locator(".unifiedPrimaryCta")).toBeVisible();
  });

  test("keyboard focus reaches the primary CTA and domain field", async ({ page }) => {
    const primary = page.locator(".unifiedPrimaryCta");
    await expect(primary).toBeVisible();
    await primary.focus();
    await expect(primary).toBeFocused();
    await expect(async () => {
      if (await page.locator(".domainStage").count()) return;
      await primary.press("Enter");
      await expect(page.locator(".domainStage")).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel("Company domain").focus();
    await expect(page.getByLabel("Company domain")).toBeFocused();
  });
});
