import { expect, test, type Page, type Route } from "@playwright/test";
import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type { ExperienceDraft } from "../../src/lib/generation/experience-schema";
import type { BrandProfile, PublicTryMeSession, UseCase } from "../../src/lib/types";

const generatedBrand: BrandProfile = {
  domain: "northpeak.com",
  companyName: "Northpeak",
  description: "Governed automation for enterprise platform teams.",
  publicTopics: ["Governed automation", "Platform operations", "Workflow orchestration"],
  imageUrls: [],
  colors: ["#0B1F33", "#2F6FED", "#FFFFFF"],
  primaryColor: "#0B1F33",
  accentColor: "#2F6FED",
  surfaceColor: "#FFFFFF",
  sourceUrl: "https://northpeak.com",
  source: "fast-extractor"
};

const generatedAnswers = {
  campaignType: "product" as const,
  promotedOffer: "Governed automation",
  audience: "Platform architects",
  objective: "Generate demand"
};

const generatedDraft: ExperienceDraft = {
  campaignRegister: "campaign-product",
  designRegister: "source-brand-editorial",
  wireframeName: "product-launch-landing-page",
  experienceShape: "offer-landing-page",
  sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
  sectionLabels: {
    thesis: "The operating shift",
    lenses: "Explore what changes",
    journey: "Proof for the first workflow",
    close: "Choose the first workflow"
  },
  title: "Northpeak | Governed automation",
  eyebrow: "Northpeak | Governed automation",
  headline: "Make governed automation easier to evaluate.",
  subhead: "Give platform architects a practical route from workflow questions to a governed first deployment.",
  thesisHeadline: "Automation speed and operating control belong in the same plan.",
  thesisBody: "Connect the people, workflows, and guardrails required to prove a useful first operating boundary.",
  primaryCta: "Choose the first workflow",
  audienceLabel: "Platform architects",
  narrativeArc: "What should platform architects validate before expanding automation?",
  sections: [
    { eyebrow: "Workflow", headline: "Start with the workflow the team can prove.", body: "Frame the first deployment around a bounded operating outcome.", proof: "Which workflow defines the clearest starting point?" },
    { eyebrow: "Governance", headline: "Keep controls visible as automation expands.", body: "Show how the team can move faster without losing accountability.", proof: "Where should governance stay explicit?" },
    { eyebrow: "Evidence", headline: "Give the buying group a shared proof plan.", body: "Turn product interest into a focused evaluation sequence.", proof: "What evidence should the first working session produce?" }
  ],
  signalLabels: ["Workflow", "Governance", "Evidence"],
  closingHeadline: "Choose the first workflow worth proving.",
  closingBody: "Bring the operating question, the governance boundary, and the desired outcome into one working session."
};

const generatedExperienceHtml = renderExperienceHtml({
  draft: generatedDraft,
  brand: generatedBrand,
  useCase: "campaign",
  answers: generatedAnswers
});

function readySession(): PublicTryMeSession {
  return {
    id: "analytics-contract-session",
    supportRef: "TMN-ANALYTICS-CONTRACT",
    useCase: "campaign" as UseCase,
    companyDomain: "northpeak.com",
    status: "preview_ready_unclaimed",
    createdAt: "2099-08-23T12:00:00.000Z",
    updatedAt: "2099-08-23T12:00:01.000Z",
    expiresAt: "2099-08-23T12:30:00.000Z",
    temporaryUrl: "https://example.test/e/analytics-contract-session",
    revision: 1,
    stages: {
      brand: { status: "complete", detail: "Brand matched" },
      audience: { status: "complete", detail: "Audience mapped" },
      story: { status: "complete", detail: "Experience composed" }
    },
    answers: {
      campaignType: "product",
      promotedOffer: "Governed automation",
      audience: "Platform architects",
      objective: "Generate demand"
    },
    brand: {
      domain: "northpeak.com",
      companyName: "Northpeak",
      colors: ["#0B1F33", "#2F6FED", "#FFFFFF"],
      primaryColor: "#0B1F33",
      accentColor: "#2F6FED",
      surfaceColor: "#FFFFFF",
      source: "brand-harvester",
      readiness: {
        status: "ready",
        identityReady: true,
        logoReady: true,
        paletteReady: true,
        designReady: true,
        sourceEvidenceReady: true,
        reasons: []
      }
    },
    audienceSuggestions: ["Platform architects"],
    audienceRecommendations: [],
    offerRecommendations: [],
    experience: {
      ready: true,
      title: "Northpeak Governed Automation",
      headline: "Make governed automation easier to evaluate.",
      readiness: "final",
      generationSource: "deterministic-fallback",
      artifactRevision: 2
    }
  };
}

type RecordedPreviewOperation = { operation?: string; event?: string; elementId?: string };

async function mockReadySession(page: Page): Promise<RecordedPreviewOperation[]> {
  const session = readySession();
  const previewOperations: RecordedPreviewOperation[] = [];
  await page.route("**/api/sessions**", async (route: Route) => {
    if (route.request().method() === "POST") {
      try {
        const body = route.request().postDataJSON() as RecordedPreviewOperation;
        if (body.operation === "preview-interaction") previewOperations.push(body);
      } catch {
        // Session creation requests are intentionally outside this assertion.
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session }) });
  });
  await page.route("**/api/analytics/events**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/events**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/e/analytics-contract-session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: generatedExperienceHtml
    });
  });
  return previewOperations;
}

test.describe("analytics experience completion contract", () => {
  let previewOperations: RecordedPreviewOperation[];
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Analytics acceptance is desktop-first.");
    previewOperations = await mockReadySession(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("opens once only at journey completion, uses the titled value proposition, and discloses simulation", async ({ page }, testInfo) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const primary = page.getByRole("button", { name: /Build a buyer experience/i });
    await expect(primary).toBeVisible();
    await expect(async () => {
      if (await page.locator(".domainStage").count()) return;
      await primary.click();
      await expect(page.locator(".domainStage")).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel("Company domain").fill("northpeak.com");
    await page.getByRole("button", { name: /Use this company/i }).click();

    const engagement = page.getByRole("button", { name: /See live engagement/i });
    await expect(engagement).toBeVisible({ timeout: 10_000 });
    const frame = page.locator("iframe");
    await expect(frame).toHaveCount(1);
    const previewFrame = page.frames().find((candidate) => candidate.url().includes("/e/analytics-contract-session"));
    expect(previewFrame).toBeDefined();
    const dialog = page.getByRole("dialog", { name: /See what buyers engage with/i });
    await expect(dialog).toHaveCount(0);

    const selectedLens = previewFrame!.getByRole("tab").nth(1);
    const selectedLensTitle = (await selectedLens.innerText()).trim();
    await selectedLens.click();
    const finalSection = previewFrame!.locator("[data-journey-section]").last();
    const finalSectionTitle = (await finalSection.locator("h1,h2,h3").first().innerText()).trim();
    await previewFrame!.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(finalSectionTitle);
    await expect(dialog).toContainText(selectedLensTitle);

    await expect(dialog.getByText(/Simulated|Illustrative examples/i).first()).toBeVisible();
    await expect(dialog.getByText(/Not captured leads/i)).toBeVisible();
    await expect(dialog.getByText(/\b\d+s engaged\b/i)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("analytics-panel-open.png"), fullPage: false });

    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await previewFrame!.evaluate(({ sectionTitle, lensTitle }) => window.parent.postMessage({
      source: "folloze-experience",
      action: "journey_complete",
      payload: {
        sectionId: "next-step",
        sectionTitle,
        lensTitle,
        position: "final",
        completionKey: "analytics-contract-session:next-step"
      }
    }, "*"), { sectionTitle: finalSectionTitle, lensTitle: selectedLensTitle });
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => previewOperations.filter((operation) => operation.event === "journey-complete").length).toBe(1);
    await engagement.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(engagement).toBeFocused();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
