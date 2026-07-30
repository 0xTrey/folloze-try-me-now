import { describe, expect, it } from "vitest";

import { renderExperienceHtml } from "@/lib/generation/experience-template";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import type { BrandProfile } from "@/lib/types";

const brand: BrandProfile = {
  domain: "folloze.com",
  companyName: "Folloze",
  logoUrl: "https://www.folloze.com/logo.svg",
  colors: ["#1C293F", "#5B5BFF"],
  primaryColor: "#1C293F",
  accentColor: "#5B5BFF",
  sourceUrl: "https://folloze.com",
  source: "fast-extractor"
};

const draft: ExperienceDraft = {
  title: "Folloze campaign experience",
  eyebrow: "Built for demand teams",
  headline: "Give every buyer a more relevant next step.",
  subhead: "Connect the story, proof, and action around the decision your audience is already making.",
  primaryCta: "See the path forward",
  audienceLabel: "Demand generation leaders",
  narrativeArc: "Pressure first, value second, proof next, then one clear action.",
  sections: [
    { eyebrow: "Pressure", headline: "Generic pages lose the thread.", body: "The buyer has to translate a broad campaign into their own decision context.", proof: "A focused opening keeps the problem recognizable." },
    { eyebrow: "Value", headline: "Relevance creates momentum.", body: "The story connects the audience's pressure to an outcome they can defend.", proof: "Audience and objective shape the sequence." },
    { eyebrow: "Signal", headline: "Engagement guides the next move.", body: "Meaningful interactions show what the buyer explored and what should happen next.", proof: "Every important action emits a Folloze signal." }
  ],
  signalLabels: ["Business case", "How it works", "Next step"]
};

describe("renderExperienceHtml", () => {
  const html = renderExperienceHtml({
    draft,
    brand,
    useCase: "campaign",
    answers: { campaignType: "product", audience: draft.audienceLabel, objective: "Generate demand" },
    themeUrl: "https://assets.folloze.com/theme.css"
  });

  it("renders a single self-contained Folloze document with only the theme link in head", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.match(/<html\b/g)).toHaveLength(1);
    expect(html.match(/<head>([\s\S]*?)<\/head>/)?.[1]).toBe(
      '<link rel="stylesheet" href="https://assets.folloze.com/theme.css">'
    );
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
  });

  it("includes three narrative modules and direct Folloze analytics hooks", () => {
    expect(html.match(/<article class="story-card">/g)).toHaveLength(3);
    expect(html).toContain("flzAnalytic('cta_click'");
    expect(html).toContain("flzAnalytic('anchor_click'");
    expect(html).toContain("flzAnalytic('topic_select'");
    for (const control of html.match(/<button\b[^>]*(?:data-scroll-target|data-signal)[^>]*>/g) ?? []) {
      expect(control).toContain('onclick="');
      expect(control).toContain("flzAnalytic(");
    }
  });

  it("makes external links safe and avoids raw fragment links", () => {
    const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener"');
      expect(anchor).not.toMatch(/href="#/);
    }
  });

  it("escapes generated copy before placing it into HTML", () => {
    const hostile = renderExperienceHtml({
      draft: { ...draft, headline: '<script>alert("x")</script>' },
      brand,
      useCase: "campaign",
      answers: {}
    });
    expect(hostile).not.toContain('<script>alert("x")</script>');
    expect(hostile).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});
