import { describe, expect, it } from "vitest";

import { renderExperienceHtml } from "@/lib/generation/experience-template";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import type { BrandProfile } from "@/lib/types";

const brand: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Integration, workflow automation, and app development on one platform.",
  publicTopics: ["Automation with AI accountability at its core"],
  logoUrl: "https://www.jitterbit.com/Jitterbit-logo-2.svg",
  imageUrls: [
    "https://www.jitterbit.com/HarmonyTitle-HeroImage-Ring.jpg",
    "https://www.jitterbit.com/Harmony-Marketecture.png"
  ],
  colors: ["#1B3E51", "#F44414", "#FFFFFF"],
  primaryColor: "#1B3E51",
  accentColor: "#F44414",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "Roboto Slab",
  bodyFontFamily: "Roboto",
  displayFontUrl: "https://www.jitterbit.com/fonts/roboto-slab.woff2",
  bodyFontUrl: "https://www.jitterbit.com/fonts/roboto.woff",
  sourceUrl: "https://jitterbit.com",
  source: "fast-extractor"
};

const draft: ExperienceDraft = {
  campaignRegister: "campaign-product",
  designRegister: "source-brand-editorial",
  wireframeName: "product-launch-landing-page",
  experienceShape: "interactive-workbench",
  sectionSequence: ["decision-lenses", "guided-questions", "thesis"],
  sectionLabels: {
    thesis: "The operating shift",
    lenses: "Explore what changes",
    journey: "Questions for the first use case",
    close: "Choose the first use case"
  },
  title: "Jitterbit | Integration and automation",
  eyebrow: "Jitterbit | Integration and automation",
  headline: "Connect systems. Automate workflows. Keep AI accountable.",
  subhead: "Jitterbit helps enterprise architects connect applications, data, APIs, and workflows without creating another operational silo.",
  thesisHeadline: "Integration, automation, and AI governance belong in one operating model.",
  thesisBody: "Give technical and business teams a shared way to connect systems, govern interactions, and prove the first workflow.",
  primaryCta: "See how it works",
  audienceLabel: "Enterprise architects and platform owners",
  narrativeArc: "What should enterprise architects and platform owners validate next?",
  sections: [
    { eyebrow: "Architecture", headline: "Connect the systems already carrying the business.", body: "Frame integration around the applications, data, and workflows the audience owns.", proof: "Which systems and data flows define the first integration boundary?" },
    { eyebrow: "Automation", headline: "Put governance around automation and AI interactions.", body: "Show how orchestration, APIs, and application development work together.", proof: "Where do automation speed and operating control need to meet?" },
    { eyebrow: "First use case", headline: "Move from architecture questions to a practical first path.", body: "Give technical and business stakeholders a clear validation route.", proof: "Which use case can prove the architecture without widening the scope?" }
  ],
  signalLabels: ["Architecture", "Automation", "First use case"],
  closingHeadline: "Start with one workflow worth simplifying.",
  closingBody: "Map the systems, controls, and desired outcome, then choose the first path that can prove value."
};

describe("renderExperienceHtml", () => {
  const html = renderExperienceHtml({
    draft,
    brand,
    useCase: "campaign",
    answers: { campaignType: "product", audience: draft.audienceLabel, objective: "Generate demand" },
    themeUrl: "https://assets.folloze.com/theme.css",
    fontDeliveryUrls: {
      display: "https://try.example/api/sessions/font-session/font/display",
      body: "https://try.example/api/sessions/font-session/font/body"
    }
  });

  it("renders a complete self-contained document with metadata and the optional theme link", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.match(/<html\b/g)).toHaveLength(1);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(html).toContain("<title>Jitterbit | Integration and automation</title>");
    expect(html).toContain('<link rel="stylesheet" href="https://assets.folloze.com/theme.css">');
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
  });

  it("uses the harvested seller palette, typography, wordmark, and imagery", () => {
    expect(html).toContain("--brand-ink:#1B3E51");
    expect(html).toContain("--brand-accent:#F44414");
    expect(html).toContain('--display:"Roboto Slab"');
    expect(html).toContain("Jitterbit-logo-2.svg");
    expect(html).toContain("HarmonyTitle-HeroImage-Ring.jpg");
  });

  it("puts the strongest evergreen product visual in the hero", () => {
    const heroStart = html.indexOf('<section class="hero"');
    const hero = html.slice(heroStart, html.indexOf("</section>", heroStart));
    expect(hero).toContain("HarmonyTitle-HeroImage-Ring.jpg");
    expect(html).toContain("Harmony-Marketecture.png");
  });

  it("loads harvested fonts only through the CORS-safe session delivery route", () => {
    expect(html).toContain(
      'src:url("https://try.example/api/sessions/font-session/font/display") format("woff2")'
    );
    expect(html).toContain(
      'src:url("https://try.example/api/sessions/font-session/font/body") format("woff")'
    );
    expect(html).not.toContain("www.jitterbit.com/fonts/roboto-slab.woff2");
    expect(html).not.toContain("www.jitterbit.com/fonts/roboto.woff");

    const withoutDeliveryRoute = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: {}
    });
    expect(withoutDeliveryRoute).not.toContain("@font-face");
    expect(withoutDeliveryRoute).toContain('--display:"Roboto Slab",ui-serif,Georgia,serif');

    const arbitraryDeliveryUrl = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: {},
      fontDeliveryUrls: { display: brand.displayFontUrl }
    });
    expect(arbitraryDeliveryUrl).not.toContain("@font-face");

    const relativeDeliveryRoute = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: {},
      fontDeliveryUrls: {
        display: "/api/sessions/font-session/font/display",
        body: "/api/sessions/font-session/font/body"
      }
    });
    expect(relativeDeliveryRoute).toContain(
      'src:url("/api/sessions/font-session/font/display") format("woff2")'
    );
    expect(relativeDeliveryRoute).toContain(
      'src:url("/api/sessions/font-session/font/body") format("woff")'
    );
  });

  it("includes three functional decision lenses, three compact question cards, and analytics hooks", () => {
    expect(html.match(/<button[^>]*role="tab"/g)).toHaveLength(3);
    expect(html.match(/class="lens-panel"/g)).toHaveLength(3);
    expect(html.match(/<article class="journey-card/g)).toHaveLength(3);
    expect(html).toContain("flzAnalytic('cta_click'");
    expect(html).toContain("flzAnalytic('anchor_click'");
    expect(html).toContain("flzAnalytic('topic_select'");
    expect(html).toContain("ArrowRight");
    expect(html).toContain("aria-selected");
    expect(html).toContain(".lens-panel[hidden]{display:none}");
  });

  it("adds a compact sticky journey navigator with active-section and fullscreen behavior", () => {
    expect(html).toContain('<nav class="journey-nav" aria-label="Experience journey"');
    expect(html.match(/data-journey-link=/g)).toHaveLength(5);
    expect(html).toContain('data-journey-link="experience-overview" aria-current="location"');
    expect(html).toContain('data-journey-section="decision-path"');
    expect(html).toContain("position:sticky;top:0");
    expect(html).toContain("IntersectionObserver");
    expect(html).toContain('data-fullscreen-toggle aria-pressed="false"');
    expect(html).toContain("document.documentElement.requestFullscreen");
    expect(html).toContain("body.classList.toggle('is-fullscreen',active)");
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  it("identifies editable copy with stable block IDs and kinds", () => {
    expect(html.match(/data-flz-editable="true"/g)?.length).toBeGreaterThan(20);
    expect(html).toContain('data-flz-block-id="hero.headline" data-flz-block-kind="headline"');
    expect(html).toContain('data-flz-block-id="lens.0.body" data-flz-block-kind="body"');
    expect(html).toContain('data-flz-block-id="question.2.prompt" data-flz-block-kind="question"');
    expect(html).toContain('data-flz-block-id="close.primaryCta" data-flz-block-kind="cta"');
    expect(html).toContain("editable_block_select:true");
  });

  it("emits versioned, allowlisted parent events without raw copy or URLs", () => {
    expect(html).toContain("source:'folloze-experience',version:1,event:action,action:action");
    expect(html).toContain("section_view:true");
    expect(html).toContain("topic_select:true");
    expect(html).toContain("cta_click:true");
    expect(html).toContain("fullscreen_change:true");
    expect(html).toContain("document.referrer");
    expect(html).toContain("parentOrigin=referrer.origin");
    expect(html).toContain("cleanPayload(data)");
    expect(html).not.toContain("text:this.innerText");
    expect(html).not.toContain("url:this.href");
  });

  it("captures visibility-aware engagement depth through the non-blocking API sink", () => {
    expect(html).toContain("section_dwell:true");
    expect(html).toContain("page_heartbeat:true");
    expect(html).toContain("experience_view:true");
    expect(html).toContain("window.fetch('/api/events'");
    expect(html).not.toContain("window.fetch('/events'");
    expect(html).toContain("credentials:'omit',keepalive:true");
    expect(html).toContain("request.catch(function(){})");
    expect(html).toContain("document.visibilityState==='visible'");
    expect(html).toContain("document.addEventListener('visibilitychange',visibilityChanged)");
    expect(html).toContain("window.setInterval(heartbeat,15000)");
    expect(html).toContain("entry.intersectionRatio>=.35");
    expect(html).toContain("if(emit&&seconds>=3)");
    expect(html).not.toContain("email:");
  });

  it("shows a polite first-interaction signal once and honors motion preferences", () => {
    expect(html).toContain('data-signal-toast role="status" aria-live="polite" aria-atomic="true" hidden');
    expect(html).toContain("var signalShown=false");
    expect(html).toContain("if(signalShown||!toast||!toastCopy)return");
    expect(html).toContain("toastCopy.textContent=message");
    expect(html).toContain("@media(prefers-reduced-motion:reduce)");
    expect(html).toContain("transition:none!important");
    expect(html).toContain("@media(forced-colors:active)");
  });

  it("links content experiences back to a sanitized public original", () => {
    const content = renderExperienceHtml({
      draft: {
        ...draft,
        campaignRegister: "content-magic",
        wireframeName: "content-resource-companion",
        experienceShape: "resource-companion"
      },
      brand,
      useCase: "content",
      answers: {
        sourceUrl: "https://example.com/guides/automation?utm_source=private#section",
        sourceName: "Automation guide"
      }
    });

    expect(content).toContain('href="https://example.com/guides/automation"');
    expect(content).toContain(">Open original</a>");
    expect(content).not.toContain("utm_source=private");
    expect(content).not.toContain("#section");
  });

  it("prioritizes evergreen product imagery over awards and event promotion art", () => {
    const prioritized = renderExperienceHtml({
      draft,
      brand: {
        ...brand,
        imageUrls: [
          "https://jitterbit.com/g2-implementation-benchmark.png",
          "https://jitterbit.com/infinite-roadshow-event.png",
          "https://jitterbit.com/HarmonyTitle-HeroImage-Ring.jpg",
          "https://jitterbit.com/2026-Harmony-Marketecture.png"
        ]
      },
      useCase: "campaign",
      answers: {}
    });

    const harmonyHero = prioritized.indexOf("HarmonyTitle-HeroImage-Ring.jpg");
    const marketecture = prioritized.indexOf("2026-Harmony-Marketecture.png");
    expect(harmonyHero).toBeGreaterThan(-1);
    expect(harmonyHero).toBeLessThan(marketecture);
    expect(prioritized).not.toMatch(/g2-implementation|roadshow-event/i);
  });

  it("uses the approved register and wireframe to change page shape", () => {
    expect(html).toContain('class="register-campaign-product design-source-brand-editorial variant-standard style-standard"');
    expect(html).toContain('data-wireframe="product-launch-landing-page"');
    expect(html).toContain('data-layout-variant="standard"');
    expect(html).toContain('data-style-variant="standard"');
    expect(html.indexOf('id="decision-path"')).toBeLessThan(html.indexOf('id="guided-questions"'));
    expect(html.indexOf('id="guided-questions"')).toBeLessThan(html.indexOf('id="campaign-thesis"'));
    expect(html).toContain("Explore what changes");
  });

  it("supports a selected layout variant and an optional escaped quality receipt", () => {
    const enhancedAnswers = Object.assign(
      { sourceUrl: "https://example.com/report?token=remove#private" },
      {
        layoutVariant: "immersive" as const,
        styleVariant: "editorial" as const,
        qualityReceipt: {
          title: "Grounded & reviewed",
          detail: '<script>alert("receipt")</script>',
          sourceUrl: "https://example.com/report?token=remove#private",
          score: 108,
          signals: ["Claims mapped", "Brand checked", "Responsive QA", "Ignored"]
        }
      }
    );
    const enhanced = renderExperienceHtml({
      draft: { ...draft, campaignRegister: "content-magic" },
      brand,
      useCase: "content",
      answers: enhancedAnswers
    });

    expect(enhanced).toContain('class="register-content-magic design-source-brand-editorial variant-immersive style-editorial"');
    expect(enhanced).toContain('data-layout-variant="immersive"');
    expect(enhanced).toContain('data-style-variant="editorial"');
    expect(enhanced).toContain('data-quality-receipt="true"');
    expect(enhanced).toContain("Grounded &amp; reviewed");
    expect(enhanced).toContain("&lt;script&gt;alert(&quot;receipt&quot;)&lt;/script&gt;");
    expect(enhanced).toContain("<strong>100</strong>/100 quality");
    expect(enhanced).toContain('href="https://example.com/report"');
    expect(enhanced).not.toContain("token=remove");
    expect(enhanced).not.toContain("Ignored");
    expect(html).not.toContain('data-quality-receipt="true"');
  });

  it("maps every supported layout and style selection into safe presentation classes", () => {
    for (const variant of ["narrative", "modular", "immersive", "compact"] as const) {
      const variantHtml = renderExperienceHtml({
        draft,
        brand,
        useCase: "campaign",
        answers: Object.assign({}, { layoutVariant: variant, styleVariant: "technical" as const })
      });
      expect(variantHtml).toContain(`variant-${variant} style-technical`);
      expect(variantHtml).toContain(`data-layout-variant="${variant}"`);
      expect(variantHtml).toContain('data-style-variant="technical"');
    }

    const rejected = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: Object.assign({}, { layoutVariant: "</style><script>" }) as unknown as Parameters<
        typeof renderExperienceHtml
      >[0]["answers"]
    });
    expect(rejected).toContain("variant-standard style-standard");
    expect(rejected).not.toContain("</style><script>");
  });

  it("renders the workspace quality receipt shape when supplied", () => {
    const checked = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: {},
      qualityReceipt: {
        status: "passed",
        checkedAt: "2026-07-31T10:00:00.000Z",
        artifactRevision: 4,
        checks: [
          { id: "copy", label: "Copy quality", status: "passed", detail: "Complete" },
          { id: "cta", label: "CTA path", status: "passed", detail: "Complete" },
          { id: "structure", label: "Structure", status: "not-applicable", detail: "Skipped" }
        ]
      }
    });

    expect(checked).toContain("Quality checks passed");
    expect(checked).toContain("2 of 2 applicable experience checks passed.");
    expect(checked).toContain("<strong>100</strong>/100 quality");
    expect(checked).toContain("Copy quality");
    expect(checked).toContain("CTA path");
  });

  it("renders materially different signature interactions for product, ABM, and content", () => {
    const target: BrandProfile = {
      ...brand,
      domain: "cisco.com",
      companyName: "Cisco",
      logoUrl: "https://www.cisco.com/cisco-logo.svg",
      imageUrls: [],
      primaryColor: "#0D274D",
      accentColor: "#049FD9",
      sourceUrl: "https://cisco.com"
    };
    const abm = renderExperienceHtml({
      draft: {
        ...draft,
        campaignRegister: "one-to-one-abm",
        wireframeName: "abm-account-microsite",
        experienceShape: "narrative-workflow",
        sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
        sectionLabels: {
          thesis: "The account-level case",
          lenses: "Choose the decision lens",
          journey: "Questions for the next conversation",
          close: "Put the first question on the table"
        }
      },
      brand,
      targetBrand: target,
      useCase: "abm",
      answers: { targetDomain: "cisco.com", audience: draft.audienceLabel }
    });
    const content = renderExperienceHtml({
      draft: {
        ...draft,
        campaignRegister: "content-magic",
        wireframeName: "content-resource-companion",
        experienceShape: "resource-companion",
        sectionSequence: ["decision-lenses", "guided-questions", "thesis"],
        sectionLabels: {
          thesis: "The idea worth carrying forward",
          lenses: "Choose your reading path",
          journey: "Questions raised by the source",
          close: "Keep exploring"
        }
      },
      brand,
      useCase: "content",
      answers: { sourceName: "Enterprise automation guide", audience: draft.audienceLabel }
    });

    expect(html).toContain('class="signature signature-product"');
    expect(abm).toContain('class="signature signature-abm"');
    expect(abm).toContain("Three decisions for Cisco");
    expect(content).toContain('class="signature signature-content"');
    expect(content).toContain('aria-label="Choose a reading path"');
    expect(html.match(/data-signature-lens-index=/g)).toHaveLength(3);
    expect(abm.match(/data-signature-lens-index=/g)).toHaveLength(3);
    expect(content.match(/data-signature-lens-index=/g)).toHaveLength(3);
    expect(html.split(draft.narrativeArc)).toHaveLength(2);
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

  it("rejects harvested font names that could break out of the style block", () => {
    const hostileFont = renderExperienceHtml({
      draft,
      brand: { ...brand, displayFontFamily: '</style><script>alert("font")</script>' },
      useCase: "campaign",
      answers: {}
    });
    expect(hostileFont).not.toContain('</style><script>alert("font")</script>');
    expect(hostileFont).toContain("--display:ui-serif,Georgia,serif");
  });

  it("uses distinct closing copy instead of repeating the hero", () => {
    expect(html).toContain(draft.headline);
    expect(html).toContain(draft.closingHeadline);
    expect(draft.closingHeadline).not.toBe(draft.headline);
  });

  it("keeps internal build mechanics out of buyer-facing chrome", () => {
    expect(html).not.toMatch(/Prepared for|>Source:|Continue the evaluation|guided content/i);
    expect(html).toContain("Questions for the first use case");
    expect(html).toContain(`>${draft.primaryCta}</a>`);
  });
});
