import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { assetSvg, compileRuntimeVisualFixture, runtimeVisualFixtures } from "../tests/e2e/three-family-runtime-fixture";
import { createBlindedReviewExport, type ReviewItem } from "../src/lib/generation/buyer-journey-evaluation";

// Synthetic, provider-free regression fixtures. Never publish these as customer claims.
it("exports representative compiled journeys for local visual and blind review", async () => {
  const output = resolve("output/buyer-journey-validation");
  const emit = process.env.EMIT_BUYER_JOURNEY_EVIDENCE === "1";
  const items: ReviewItem[] = [];
  const manifest: { file: string; family?: string; sections: number; traffic: string }[] = [];
  if (emit) mkdirSync(output, { recursive: true });
  for (const [index, fixture] of runtimeVisualFixtures.entries()) {
    for (const traffic of ["cold-outreach", "post-demo"] as const) {
      const variant = structuredClone(fixture);
      variant.session.answers.trafficIntent = traffic;
      variant.session.answers.buyerStage = traffic === "cold-outreach" ? "awareness" : "evaluation";
      const compiled = await compileRuntimeVisualFixture(variant);
      expect(compiled.page.sections.length).toBeGreaterThanOrEqual(4);
      expect(compiled.page.sections.length).toBeLessThanOrEqual(8);
      const retained = compiled.page.sections.filter((section) => section.status !== "omitted");
      expect([...compiled.html.matchAll(/data-journey-section="[^"]+"/g)]).toHaveLength(retained.length);
      expect(compiled.html).not.toContain("Verified fact</span><p");
      expect(compiled.html).not.toContain("<dt>You leave with</dt>");
      const prose = retained.map((section) => [section.headline, section.body, section.choices?.map((choice) => `${choice.label}: ${choice.body}`).join("\n")].filter(Boolean).join("\n")).join("\n\n");
      expect(prose).not.toMatch(/\u2014|Confirm scope|Check applicability/);
      const file = `journey-${index + 1}-${traffic}.html`;
      const html = compiled.html.replace(/https:\/\/runtime-first-party\.test\/[^"'<>\s]+/g, (url) => {
        const name = new URL(url).pathname.split("/").at(-1)!;
        return `data:image/svg+xml;base64,${Buffer.from(assetSvg(name)).toString("base64")}`;
      });
      if (emit) writeFileSync(resolve(output, file), html.replace(/[ \t]+$/gm, ""));
      items.push({ headline: compiled.page.sections[0]?.headline, sections: prose,
        sourceSnippets: variant.session.evidenceItems?.map((item) => item.text).join("\n") });
      manifest.push({ file, family: compiled.page.familyDecision?.family, sections: retained.length, traffic });
    }
  }
  expect(items).toHaveLength(6);
  if (emit) {
    writeFileSync(resolve(output, "blind-review.json"), JSON.stringify(createBlindedReviewExport({ items }).publicExport, null, 2));
    writeFileSync(resolve(output, "manifest.json"), JSON.stringify({ fixtureOnly: true, liveProvider: false,
      humanReviewed: false, conversionExperimentActive: false, variants: manifest }, null, 2));
  }
});
