import { expect, test, type Frame, type Page, type Route } from "@playwright/test";

import type { PublicTryMeSession } from "../../src/lib/types";
import {
  deterministicSvg,
  fixtureAssetOrigin,
  generatedExperienceHtml
} from "./generated-experience-fixture";

const SESSION_ID = "e2e-final-only-scroll";
const SCROLLABLE_EXPERIENCE_HTML = generatedExperienceHtml();

const readySession: PublicTryMeSession = {
  id: SESSION_ID,
  supportRef: "TMN-FINALSCROLL",
  useCase: "campaign",
  companyDomain: "northpeak.com",
  status: "preview_ready_unclaimed",
  createdAt: "2099-08-23T12:00:00.000Z",
  updatedAt: "2099-08-23T12:00:20.000Z",
  expiresAt: "2099-08-23T12:30:00.000Z",
  temporaryUrl: `https://example.test/e/${SESSION_ID}`,
  revision: 2,
  stages: {
    brand: { status: "complete", detail: "Brand matched" },
    audience: { status: "complete", detail: "Audience mapped" },
    story: { status: "complete", detail: "Experience composed" }
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
  offerRecommendations: [],
  buildProgress: {
    phase: "ready",
    startedAt: "2099-08-23T12:00:00.000Z",
    updatedAt: "2099-08-23T12:00:20.000Z",
    slow: false,
    receipts: []
  },
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

async function fulfillFixtureAssets(page: Page): Promise<void> {
  await page.route(`${fixtureAssetOrigin}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: deterministicSvg
    });
  });
}

async function mockReadyShell(page: Page): Promise<void> {
  await fulfillFixtureAssets(page);
  await page.route(`**/e/${SESSION_ID}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: SCROLLABLE_EXPERIENCE_HTML
    });
  });
  await page.route("**/api/sessions**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: readySession })
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

async function openFinalReveal(page: Page): Promise<Frame> {
  await mockReadyShell(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await startBuild(page);
  await expect(page.locator(".revealStage")).toBeVisible({ timeout: 10_000 });
  const iframe = page.locator('iframe[title="Generated buyer experience preview"]');
  await expect(iframe).toBeVisible();
  await expect(page.frameLocator('iframe[title="Generated buyer experience preview"]').locator(".shell")).toBeVisible();
  let frame: Frame | undefined;
  await expect.poll(() => {
    frame = page.frames().find((candidate) => candidate.url().includes(`/e/${SESSION_ID}`));
    return frame ?? null;
  }).not.toBeNull();
  return frame!;
}

function childScrollMetrics(frame: Frame) {
  return frame.locator("html").evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      top: root.scrollTop,
      max: Math.max(0, root.scrollHeight - root.clientHeight)
    };
  });
}

async function resetScrollPositions(page: Page, frame: Frame): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await frame.locator("html").evaluate(() => window.scrollTo(0, 0));
}

async function movePointerOverPreview(page: Page): Promise<void> {
  const box = await page.locator('iframe[title="Generated buyer experience preview"]').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function ensureHostScrollRoom(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("e2e-scroll-spacer")) return;
    const spacer = document.createElement("div");
    spacer.id = "e2e-scroll-spacer";
    spacer.style.height = "1200px";
    document.querySelector(".appShell")?.appendChild(spacer);
  });
}

test.describe("final-only preview scroll in real app shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Preview scroll behavior is desktop-only.");
  });

  test("wheel, PageDown, and ArrowDown scroll the preview while the host stays stable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const frame = await openFinalReveal(page);
    await resetScrollPositions(page, frame);

    await movePointerOverPreview(page);
    const hostBeforeWheel = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 700);
    await expect.poll(async () => (await childScrollMetrics(frame)).top).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(hostBeforeWheel);

    await page.locator('iframe[title="Generated buyer experience preview"]').focus();
    const hostBeforePageDown = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("PageDown");
    await expect.poll(async () => (await childScrollMetrics(frame)).top).toBeGreaterThan(50);
    expect(await page.evaluate(() => window.scrollY)).toBe(hostBeforePageDown);

    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await childScrollMetrics(frame)).top).toBeGreaterThan(80);
    expect(await page.evaluate(() => window.scrollY)).toBe(hostBeforePageDown);
  });

  test("hands wheel scrolling to the host at top and bottom boundaries", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const frame = await openFinalReveal(page);
    await resetScrollPositions(page, frame);

    await movePointerOverPreview(page);
    await page.mouse.wheel(0, 700);
    await expect.poll(async () => (await childScrollMetrics(frame)).top).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await frame.locator("html").evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      window.scrollTo(0, root.scrollHeight);
    });
    await ensureHostScrollRoom(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await movePointerOverPreview(page);
    await frame.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      root.scrollTop = root.scrollHeight;
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 520, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const atEnd = await childScrollMetrics(frame);
    expect(atEnd.top).toBeGreaterThanOrEqual(atEnd.max - 1);

    await page.evaluate(() => window.scrollTo(0, 220));
    await frame.locator("html").evaluate(() => window.scrollTo(0, 0));
    const hostBeforeUpwardHandoff = await page.evaluate(() => window.scrollY);
    await movePointerOverPreview(page);
    await frame.evaluate(() => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: -420, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(hostBeforeUpwardHandoff);
    expect((await childScrollMetrics(frame)).top).toBe(0);
  });

  test("stays usable through a transient cross-origin preview load and same-origin recovery", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await mockReadyShell(page);

    let crossOrigin = true;
    await page.route(`**/e/${SESSION_ID}**`, async (route) => {
      if (crossOrigin) {
        await route.fulfill({
          status: 302,
          headers: { location: "https://preview-external.example/experience" },
          body: ""
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: SCROLLABLE_EXPERIENCE_HTML
      });
    });
    await page.route("https://preview-external.example/experience", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body style="margin:0"><main style="height:4200px;background:linear-gradient(#fff,#ccd8ef)">External preview loading</main></body></html>'
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);
    const iframe = page.locator('iframe[title="Generated buyer experience preview"]');
    await expect(iframe).toBeVisible();
    const transientFrame = await iframe.contentFrame();
    expect(transientFrame).toBeTruthy();

    await movePointerOverPreview(page);
    const hostBeforeTransientWheel = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 700);
    expect(await page.evaluate(() => window.scrollY)).toBe(hostBeforeTransientWheel);
    expect(pageErrors).toEqual([]);

    crossOrigin = false;
    await iframe.evaluate((node, sessionId) => {
      (node as HTMLIFrameElement).src = `/e/${sessionId}?embed=1&recovered=1`;
    }, SESSION_ID);
    let recoveredFrame: Frame | undefined;
    await expect.poll(() => {
      recoveredFrame = page.frames().find(
        (frame) => frame.url().includes(`/e/${SESSION_ID}`) && frame.url().includes("recovered=1")
      );
      return recoveredFrame ?? null;
    }).not.toBeNull();
    await expect(recoveredFrame!.locator(".shell")).toBeVisible();
    await resetScrollPositions(page, recoveredFrame!);
    await movePointerOverPreview(page);
    await page.mouse.wheel(0, 700);
    await expect.poll(async () => (await childScrollMetrics(recoveredFrame!)).top).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
});
