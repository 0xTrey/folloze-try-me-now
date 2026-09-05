/** Opt-in browser fixtures reuse the actual renderer; normal tests write nothing. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { compileCampaignContext } from "@/lib/generation/campaign-context";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { upgradeStoredExperiencePresentation } from "@/lib/generation/experience-presentation";
import { selectWireframe, wireframeLibrary } from "@/lib/generation/wireframe-library";
import { deterministicDraft } from "@/lib/integrations/openai";
import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";

const brand: BrandProfile = {
  domain: "northwind.example", companyName: "Northwind", description: "Cloud operations for distributed teams.",
  publicTopics: ["Cloud operations"], imageUrls: [], colors: ["#434343", "#2877E8", "#FFFFFF"],
  primaryColor: "#434343", accentColor: "#2877E8", surfaceColor: "#FFFFFF",
  displayFontFamily: "Helvetica Neue", bodyFontFamily: "Helvetica Neue",
  sourceUrl: "https://northwind.example", source: "fast-extractor"
};

it.each(wireframeLibrary)("keeps $id headline-led and shares responsive media across render paths", metadata => {
  const useCase: UseCase = metadata.family === "account" ? "abm" : metadata.family === "content" ? "content" : "campaign";
  const answers: SessionAnswers = { campaignType: "product", promotedOffer: "Cloud operations", audience: "Infrastructure leaders", objective: "Evaluate the product", sourceTitle: "Cloud operations guide" };
  const targetBrand = useCase === "abm" ? { ...brand, companyName: "Example Buyer", domain: "buyer.example" } : undefined;
  const context = compileCampaignContext({ brand, targetBrand, useCase, answers });
  const draft = deterministicDraft({ brand, targetBrand, useCase, answers, context });
  const selection = selectWireframe({ family: metadata.family }, { requestedArchetypeId: metadata.id });
  for (const framework of [true, false]) {
    const html = renderExperienceHtml({
      draft: framework ? draft : { ...draft, persuasionFramework: undefined }, brand, targetBrand, useCase, answers,
      wireframeSelection: selection, assetPlan: { version: "asset-render-plan-v1", placements: [], treatments: [] }
    });
    expect(html).not.toMatch(/<p\b[^>]*class="[^"]*\beyebrow\b/);
    expect(html).not.toContain('<span class="media-fallback-kicker">');
    expect(html).toContain('id="experience-headline"');
    expect(html).toContain('data-flz-presentation="content-led-media-v2"');
    expect(html).toContain(`data-wireframe-archetype="${metadata.id}"`);
    expect(html).not.toMatch(/<figure\b/);
    expect(html).not.toMatch(/class="(?:lens-number|journey-index|signature-index|step-index|role-index)"[^>]*>0[1-9]</);
    expect(html).not.toContain('content:"0" counter(chapter)');
    if (framework && metadata.family !== "content") {
      expect(html).toContain("Verified fact");
      expect(html).toContain("What it means");
    }
    if (process.env.EMIT_WIREFRAME_PRESENTATION === "1" && (framework || metadata.id === "campaign-product")) {
      const out = process.env.WIREFRAME_PRESENTATION_OUTPUT ?? join(process.cwd(), "output", "playwright", "wireframe-presentation");
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${metadata.id}${framework ? "" : "-legacy"}.html`), html);
    }
  }
});

it.runIf(process.env.EMIT_WIREFRAME_PRESENTATION === "1" && Boolean(process.env.PRESENTATION_SOURCE_URL))("emits an upgraded copy of an existing public experience for browser QA", async () => {
  const source = new URL(process.env.PRESENTATION_SOURCE_URL!);
  expect(source.origin).toBe("https://folloze-try-me-now.vercel.app");
  expect(source.pathname).toMatch(/^\/e\/[a-z0-9_-]{8,128}$/i);
  expect(source.search).toBe("");
  const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
  expect(response.status).toBe(200);
  const html = upgradeStoredExperiencePresentation(await response.text());
  expect(html).not.toMatch(/<p\b[^>]*class="[^"]*\beyebrow\b/);
  const out = process.env.WIREFRAME_PRESENTATION_OUTPUT ?? join(process.cwd(), "output", "playwright", "wireframe-presentation");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "reported-experience.html"), html);
});
