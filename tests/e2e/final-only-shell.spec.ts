import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

import type { BuildProgressState, PublicTryMeSession } from "../../src/lib/types";

const SESSION_ID = "e2e-final-only-shell";
const RELEASE_EVIDENCE_DIRECTORY = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-27-v2-final-only-base-experience/evidence/screenshots"
);

async function captureReleaseEvidence(page: Page, name: string): Promise<void> {
  if (process.env.CAPTURE_V2_RELEASE_EVIDENCE !== "1") return;
  mkdirSync(RELEASE_EVIDENCE_DIRECTORY, { recursive: true });
  await page.screenshot({
    path: resolve(RELEASE_EVIDENCE_DIRECTORY, `${name}.png`),
    fullPage: true
  });
}

function baseSession(): PublicTryMeSession {
  return {
    id: SESSION_ID,
    supportRef: "TMN-FINALONLY",
    useCase: "campaign",
    companyDomain: "northpeak.com",
    status: "generating",
    createdAt: "2099-08-23T12:00:00.000Z",
    updatedAt: "2099-08-23T12:00:20.000Z",
    expiresAt: "2099-08-23T12:30:00.000Z",
    temporaryUrl: `https://example.test/e/${SESSION_ID}`,
    revision: 2,
    stages: {
      brand: { status: "complete", detail: "Brand matched" },
      audience: { status: "complete", detail: "Audience mapped" },
      story: { status: "running", detail: "Composing" }
    },
    answers: {
      campaignType: "product",
      promotedOffer: "Pipeline Command Center",
      audience: "Revenue leaders",
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
    audienceSuggestions: ["Revenue leaders"],
    audienceRecommendations: [],
    offerRecommendations: []
  };
}

const workingProgress: BuildProgressState = {
  phase: "writing",
  startedAt: "2099-08-23T12:00:00.000Z",
  updatedAt: "2099-08-23T12:00:20.000Z",
  slow: false,
  receipts: [
    { phase: "queued", status: "complete", detail: "Prepared the build from your brief" },
    { phase: "researching", status: "complete", detail: "Read the public brand, offer, and buyer context" },
    { phase: "planning", status: "complete", detail: "Chose the strongest story for this buyer" },
    { phase: "writing", status: "active", detail: "Writing each step of the buyer journey" }
  ]
};

function sessionFor(state: "collecting" | "working" | "slow" | "failed" | "ready"): PublicTryMeSession {
  const base = baseSession();
  if (state === "collecting") {
    return {
      ...base,
      status: "collecting",
      answers: {},
      stages: {
        brand: { status: "complete", detail: "Brand matched" },
        audience: { status: "running", detail: "Building audience recommendations" },
        story: { status: "pending", detail: "Waiting for the audience and objective" }
      },
      buildProgress: undefined,
      audienceSuggestions: ["Data and AI platform leaders"]
    };
  }
  if (state === "working") return { ...base, buildProgress: workingProgress };
  if (state === "slow") return { ...base, buildProgress: { ...workingProgress, slow: true } };
  if (state === "failed") {
    return {
      ...base,
      status: "generation_failed",
      stages: { ...base.stages, story: { status: "failed" } },
      buildProgress: {
        ...workingProgress,
        phase: "failed",
        receipts: [
          ...workingProgress.receipts.slice(0, 3),
          { phase: "checking", status: "failed", detail: "The claims check did not pass" }
        ],
        failure: {
          code: "truth_gate_failed",
          nextAction: "Add one proof point to the brief, then run the build again.",
          retryable: true
        }
      }
    };
  }
  return {
    ...base,
    status: "preview_ready_unclaimed",
    stages: { ...base.stages, story: { status: "complete" } },
    buildProgress: { ...workingProgress, phase: "ready", receipts: [] },
    experience: {
      ready: true,
      title: "Northpeak Pipeline Command Center",
      headline: "Give revenue teams a governed command center.",
      readiness: "final",
      generationSource: "deterministic-fallback",
      artifactRevision: 3
    },
    experienceSpec: { schemaVersion: "2.0" } as PublicTryMeSession["experienceSpec"],
    finalArtifact: {
      readiness: "final",
      artifactRevision: 3,
      structuralGate: "passed",
      truthGate: "passed",
      persistedAt: "2099-08-23T12:00:52.000Z",
      readBackAt: "2099-08-23T12:00:53.000Z"
    }
  };
}

async function mockShell(
  page: Page,
  state: "collecting" | "working" | "slow" | "failed" | "ready"
): Promise<void> {
  const session = sessionFor(state);
  await page.route(`**/e/${SESSION_ID}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><main><section>Fixture experience</section></main></body></html>"
    });
  });
  await page.route("**/api/sessions**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session })
    });
  });
  await page.route("**/api/analytics/events**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/events**", (route) => route.fulfill({ status: 204, body: "" }));
}

async function startBuild(page: Page): Promise<void> {
  const primary = page.locator(".unifiedPrimaryCta");
  await expect(async () => {
    if (await page.locator(".domainStage").count()) return;
    await primary.click();
    await expect(page.locator(".domainStage")).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Company domain").fill("northpeak.com");
  await page.getByRole("button", { name: /Use this company/i }).click();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("final-only visible shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The builder shell is a desktop-first surface.");
  });

  for (const width of [1280, 1440]) {
    test(`build shell holds at ${width} without leaking partial HTML`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockShell(page, "working");
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".entryHero .sectionKicker")).toHaveCount(0);
      await expect(page.locator(".unifiedPrimaryCta > span")).toHaveCount(0);
      if (width === 1440) await captureReleaseEvidence(page, "intake");
      await startBuild(page);

      const shell = page.locator("[data-build-shell]");
      await expect(shell).toHaveAttribute("data-build-shell", "working");
      await expect(shell).toHaveAttribute("aria-busy", "true");
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(page.locator(".assembly")).toHaveCount(0);
      await expect(page.locator("[data-phase]")).toHaveCount(6);
      await expect(page.locator('[data-phase="writing"]')).toHaveAttribute("data-status", "active");
      await expect(page.locator('[data-phase="finalizing"]')).toHaveAttribute("data-status", "queued");
      await expect(page.getByText(/%/)).toHaveCount(0);
      await expect(page.locator('[role="progressbar"], progress')).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      if (width === 1440) await captureReleaseEvidence(page, "active-build");
    });
  }

  test("background research keeps the guided conversation visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShell(page, "collecting");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect(page.locator("[data-build-shell]")).toHaveCount(0);
    await expect(page.getByText("Live brief").first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: /What are you taking to market/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit Audience/i })).toContainText("Waiting");
    await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
  });

  test("slow state names the current work and preserves the brief", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShell(page, "slow");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect(page.locator("[data-build-shell]")).toHaveAttribute("data-build-shell", "slow");
    await expect(page.locator("[data-build-slow]")).toContainText("This one is taking longer than usual.");
    await expect(page.locator("[data-build-slow]")).toContainText("Writing each step of the buyer journey");
    await expect(page.locator("iframe")).toHaveCount(0);
    await captureReleaseEvidence(page, "slow-build");
  });

  test("failed state reports one next action and a retry affordance", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShell(page, "failed");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect(page.locator("[data-build-shell]")).toHaveAttribute("data-build-shell", "failed");
    await expect(page.getByRole("heading", { name: "The build stopped before it finished." })).toBeVisible();
    await expect(page.locator("[data-build-failure]")).toContainText(
      "Add one proof point to the brief, then run the build again."
    );
    await expect(page.getByRole("button", { name: /Try the build again/i })).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await captureReleaseEvidence(page, "failed-build");
  });

  test("reduced motion keeps every build state legible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShell(page, "working");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect(page.locator("[data-build-shell]")).toBeVisible();
    await expect(page.locator('[data-phase="researching"]')).toContainText("Done");
    await expect(page.locator('[data-phase="writing"]')).toContainText("Working");
    await expect(page.locator('[data-phase="checking"]')).toContainText("Queued");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("the finished experience is the only HTML the visitor receives", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShell(page, "ready");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect(page.locator(".revealStage")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-build-shell]")).toHaveCount(0);
    const frame = page.frameLocator('iframe[title="Generated buyer experience preview"]');
    await expect(frame.locator("section")).toContainText("Fixture experience");
    await expect(page.locator(".revealIntroCopy .sectionKicker")).toHaveCount(0);
    await expect(page.locator("[data-final-only-reveal='true'] .previewReadinessStatus")).toHaveCount(0);
    await expect(page.getByText(/Save this preview|See live engagement|Preview ready|Temporary URL|Expires 30 minutes|Preview as/i)).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(page.locator(".revealStage")).toHaveCSS("opacity", "1", { timeout: 5_000 });
    await captureReleaseEvidence(page, "final-reveal");
  });
});
