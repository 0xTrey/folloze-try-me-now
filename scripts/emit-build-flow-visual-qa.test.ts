// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vitest";

import { buildExperienceSpec } from "../src/lib/experience-contract";
import { buildRenderDesign } from "../src/lib/generation/build-render-design";
import { renderExperienceHtml } from "../src/lib/generation/experience-template";
import { applyProductionPageToDraft } from "../src/lib/generation/production-draft-adapter";
import { compileSessionProductionPage } from "../src/lib/generation/session-production-engine";
import { deterministicDraft } from "../src/lib/integrations/openai";
import { BRAND_ARCHETYPE_FIXTURES } from "../tests/fixtures/brand-fidelity/archetypes";
import {
  archetypeRuntimeFixture,
  assetSvg,
  runtimeAssetOrigin,
  runtimeVisualFixtures,
  type RuntimeVisualFixture
} from "../tests/e2e/three-family-runtime-fixture";

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT = resolve("output/build-flow-visual-qa", runId);
const EMIT = process.env.EMIT_BUILD_FLOW_VISUAL_QA === "1";

type RenderedFixture = {
  fixture: RuntimeVisualFixture;
  html: string;
  actionLabels: string[];
  sourceLabels: string[];
};

async function renderFixture(fixture: RuntimeVisualFixture): Promise<RenderedFixture> {
  const result = await compileSessionProductionPage({
    session: fixture.session,
    brand: fixture.brand,
    targetBrand: fixture.targetBrand,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000
  });
  if (result.outcome !== "production-page" || !result.artifact.value) {
    throw new Error(`Visual QA fixture ${fixture.id} did not compile: ${result.outcome}`);
  }
  const page = result.artifact.value;
  const draft = applyProductionPageToDraft(
    deterministicDraft({
      brand: fixture.brand,
      targetBrand: fixture.targetBrand,
      useCase: fixture.session.useCase,
      answers: fixture.session.answers
    }),
    page
  );
  const spec = buildExperienceSpec(
    fixture.session,
    draft,
    fixture.brand,
    fixture.targetBrand,
    page
  );
  const html = renderExperienceHtml({
    draft,
    brand: fixture.brand,
    targetBrand: fixture.targetBrand,
    useCase: fixture.session.useCase,
    answers: fixture.session.answers,
    wireframeSelection: spec.wireframeSelection,
    productionSections: spec.production?.sections,
    actions: spec.actions,
    ...(result.buildPlan ? { buildDesign: buildRenderDesign(result.buildPlan, page.sections) } : {})
  });
  const actionLabels = spec.actions.map(({ label }) => label);
  const sourceLabels = (fixture.session.evidenceItems ?? [])
    .filter(({ disposition }) => disposition !== "excluded")
    .map(({ label }) => label);
  return { fixture, html, actionLabels, sourceLabels };
}

function localizeRuntimeAssets(html: string): { html: string; assets: string[] } {
  const assets = [...new Set([...html.matchAll(new RegExp(`${runtimeAssetOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^"'<\\s]+)`, "g"))]
    .map((match) => decodeURIComponent(match[1]!)))].sort();
  return {
    html: html.replace(new RegExp(`${runtimeAssetOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^"'<\\s]+)`, "g"), "assets/$1"),
    assets
  };
}

function reviewWrapper(files: readonly string[]): string {
  const panes = files.map((file) => `<section><h2>${file}</h2><div class="desktop"><iframe title="${file} desktop" src="${file}"></iframe></div><div class="mobile"><iframe title="${file} mobile" src="${file}"></iframe></div></section>`).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Build flow visual QA</title><style>body{margin:0;background:#eef2f5;color:#172033;font:16px system-ui,sans-serif}header,section{padding:24px;max-width:1500px;margin:auto}h1,h2{margin:0 0 14px}.notice{max-width:900px;line-height:1.5}.desktop,.mobile{background:#fff;border:1px solid #ccd5df;overflow:auto;margin:14px 0}.desktop iframe{width:1440px;height:960px;border:0}.mobile{width:390px}.mobile iframe{width:390px;height:844px;border:0}</style><header><h1>Build flow visual QA</h1><p class="notice">Synthetic local fixtures only. No human visual score is claimed. Review the desktop and 390px mobile frames against the manifest before relying on any outcome.</p></header>${panes}</html>`;
}

it("emits four structurally ready local pages for visual QA when explicitly enabled", async () => {
  const richLaunch = runtimeVisualFixtures.find(({ id }) => id === "adp-launch")!;
  const richGuide = runtimeVisualFixtures.find(({ id }) => id === "apple-guide")!;
  const richAlign = runtimeVisualFixtures.find(({ id }) => id === "servicetitan-align")!;
  const sparseArchetype = BRAND_ARCHETYPE_FIXTURES.find(({ id }) => id === "sparse-logo-only")!;
  const sparseLaunch = archetypeRuntimeFixture(sparseArchetype, "launch");
  const rendered = await Promise.all([richLaunch, richGuide, richAlign, sparseLaunch].map(renderFixture));

  for (const item of rendered) {
    expect(item.html).toMatch(/^<!doctype html>/i);
    expect(item.html).toContain("data-journey-section=");
    expect(item.html).toContain("window.flzAnalytic");
    expect(item.actionLabels.length).toBeGreaterThan(0);
    expect([...item.html.matchAll(/data-journey-section=/g)].length).toBeGreaterThanOrEqual(4);
    const document = new DOMParser().parseFromString(item.html, "text/html");
    const paragraphs = [...document.querySelectorAll('main p')].filter((paragraph) => !paragraph.closest("dialog"))
      .map((paragraph) => paragraph.textContent!.trim()).filter((text) => text.length >= 80);
    expect(new Set(paragraphs).size, `${item.fixture.id}: ${paragraphs.filter((text, index) => paragraphs.indexOf(text) !== index).join(" | ")}`).toBe(paragraphs.length);
    if (item.fixture.id === "apple-guide") {
      expect(item.html).not.toContain("Continue the evaluation with a focused working session");
    }
  }
  if (!EMIT) return;

  mkdirSync(resolve(OUTPUT, "assets"), { recursive: true });
  const manifest = rendered.map((item) => {
    const file = `${item.fixture.id}.html`;
    const localized = localizeRuntimeAssets(item.html);
    expect(localized.html).not.toContain(runtimeAssetOrigin);
    for (const asset of localized.assets) writeFileSync(resolve(OUTPUT, "assets", asset), assetSvg(asset));
    writeFileSync(resolve(OUTPUT, file), localized.html.replace(/[ \t]+$/gm, ""));
    return {
      page: file,
      family: item.fixture.expectedFamily,
      brand: item.fixture.brand.companyName,
      targetBrand: item.fixture.targetBrand?.companyName ?? null,
      sourceLabels: item.sourceLabels,
      actionLabels: item.actionLabels,
      localAssets: localized.assets,
      desktopViewport: { width: 1440, height: 960 },
      mobileViewport: { width: 390, height: 844 }
    };
  });
  writeFileSync(resolve(OUTPUT, "review.html"), reviewWrapper(manifest.map(({ page }) => page)));
  writeFileSync(resolve(OUTPUT, "manifest.json"), JSON.stringify({
    generatedFor: "local visual QA only",
    syntheticData: true,
    browserQACompleted: false,
    humanVisualScores: null,
    pages: manifest
  }, null, 2));
});
