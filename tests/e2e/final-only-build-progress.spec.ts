import { expect, test, type Page, type Route } from "@playwright/test";

import { BUILD_PHASE_COPY, BUILD_PHASE_ORDER } from "../../src/lib/preview-lifecycle";
import type { BuildPhaseReceipt, BuildProgressState, PublicTryMeSession } from "../../src/lib/types";

const SESSION_ID = "e2e-final-only-build-progress";

function buildProgressForActivePhase(
  activeIndex: number,
  notes?: Partial<Record<(typeof BUILD_PHASE_ORDER)[number], string>>
): BuildProgressState {
  const active = BUILD_PHASE_ORDER[activeIndex];
  const receipts: BuildPhaseReceipt[] = BUILD_PHASE_ORDER.map((phase, index) => {
    const status =
      index < activeIndex ? "complete" : phase === active ? "active" : "queued";
    return {
      phase,
      status,
      detail: BUILD_PHASE_COPY[phase].detail,
      ...(notes?.[phase] ? { evidenceNote: notes[phase] } : {})
    };
  });
  return {
    phase: active,
    startedAt: "2099-08-23T12:00:00.000Z",
    updatedAt: `2099-08-23T12:00:${String(activeIndex + 10).padStart(2, "0")}.000Z`,
    slow: activeIndex >= 4,
    receipts
  };
}

function baseSession(buildProgress: BuildProgressState): PublicTryMeSession {
  return {
    id: SESSION_ID,
    supportRef: "TMN-BUILDPROGRESS",
    useCase: "campaign",
    companyDomain: "northpeak.com",
    status: "generating",
    createdAt: "2099-08-23T12:00:00.000Z",
    updatedAt: buildProgress.updatedAt,
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
    offerRecommendations: [],
    buildProgress
  };
}

async function mockProgressiveBuildSession(page: Page): Promise<{ observedPhases: string[] }> {
  let pollCount = 0;
  const observedPhases: string[] = [];

  await page.route(`**/e/${SESSION_ID}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><main><section>Fixture experience</section></main></body></html>"
    });
  });

  await page.route("**/api/sessions**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "POST" && url.endsWith("/api/sessions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            ...baseSession(buildProgressForActivePhase(0)),
            status: "collecting"
          },
          editorToken: "editor-token",
          traceId: "trace-build-progress"
        })
      });
      return;
    }

    if (!url.includes(`/api/sessions/${SESSION_ID}`)) {
      await route.continue();
      return;
    }

    if (method === "PATCH") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: baseSession(buildProgressForActivePhase(1))
        })
      });
      return;
    }

    if (method !== "GET") {
      await route.continue();
      return;
    }

    const activeIndex = Math.min(pollCount, BUILD_PHASE_ORDER.length - 1);
    pollCount += 1;
    const notes =
      BUILD_PHASE_ORDER[activeIndex] === "writing"
        ? { writing: "Writing section 2 of 5" }
        : BUILD_PHASE_ORDER[activeIndex] === "checking"
          ? { checking: "5 sections checked" }
          : undefined;
    const session = baseSession(buildProgressForActivePhase(activeIndex, notes));
    observedPhases.push(session.buildProgress!.phase);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session })
    });
  });

  await page.route("**/api/analytics/events**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/events**", (route) => route.fulfill({ status: 204, body: "" }));

  return { observedPhases };
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

test.describe("final-only build progress polling", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Build progress evidence is desktop-only.");
  });

  test("polls all six build phases in order through the public session API", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { observedPhases } = await mockProgressiveBuildSession(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect(page.locator("[data-build-shell]")).toHaveAttribute("data-build-shell", "working");

    await expect.poll(async () => {
      const activePhase = await page.locator('[data-phase][data-status="active"]').first().getAttribute("data-phase");
      return activePhase;
    }, { timeout: 8_000 }).toBe("finalizing");

    expect(observedPhases.length).toBeGreaterThanOrEqual(BUILD_PHASE_ORDER.length);
    for (let index = 1; index < BUILD_PHASE_ORDER.length; index += 1) {
      const previous = BUILD_PHASE_ORDER.indexOf(
        observedPhases[index - 1] as (typeof BUILD_PHASE_ORDER)[number]
      );
      const current = BUILD_PHASE_ORDER.indexOf(
        observedPhases[index] as (typeof BUILD_PHASE_ORDER)[number]
      );
      expect(current).toBeGreaterThanOrEqual(previous);
    }
    expect([...new Set(observedPhases.slice(0, BUILD_PHASE_ORDER.length))]).toEqual([
      ...BUILD_PHASE_ORDER
    ]);
  });

  test("keeps the shell on the newest polled phase instead of regressing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const responses: BuildProgressState[] = [
      buildProgressForActivePhase(3, { writing: "Writing section 1 of 5" }),
      buildProgressForActivePhase(4, { checking: "5 sections checked" })
    ];
    let responseIndex = 0;

    await page.route("**/api/sessions**", async (route: Route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "POST" && url.endsWith("/api/sessions")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: baseSession(responses[0]!),
            editorToken: "editor-token",
            traceId: "trace-build-progress"
          })
        });
        return;
      }

      if (!url.includes(`/api/sessions/${SESSION_ID}`)) {
        await route.continue();
        return;
      }

      if (method === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: baseSession(responses[0]!) })
        });
        return;
      }

      if (method !== "GET") {
        await route.continue();
        return;
      }

      const buildProgress = responses[Math.min(responseIndex, responses.length - 1)]!;
      responseIndex += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: baseSession(buildProgress) })
      });
    });
    await page.route("**/api/analytics/events**", (route) => route.fulfill({ status: 204, body: "" }));
    await page.route("**/api/events**", (route) => route.fulfill({ status: 204, body: "" }));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await startBuild(page);

    await expect.poll(async () =>
      page.locator('[data-phase="checking"][data-status="active"]').count()
    ).toBe(1);
    await expect(page.locator('[data-phase="writing"]')).toHaveAttribute("data-status", "complete");
    await expect(page.locator('[data-phase="planning"]')).toHaveAttribute("data-status", "complete");
  });
});
