import { describe, expect, it } from "vitest";

import {
  CANONICAL_EXPERIENCE_STRUCTURE,
  compileCampaignContext
} from "@/lib/generation/campaign-context";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import { deterministicDraft } from "@/lib/integrations/openai";
import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";

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
  experienceShape: "offer-landing-page",
  sectionSequence: [...CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence],
  sectionLabels: {
    thesis: "The operating shift",
    lenses: "Explore what changes",
    journey: "Proof for the first use case",
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
    expect(html).toContain('<link rel="icon" href="/brand/folloze-symbol.png" type="image/png">');
    expect(html).toContain('<link rel="stylesheet" href="https://assets.folloze.com/theme.css">');
    expect(html).toContain("<style>");
    expect(html).toContain("<script data-flz-runtime>");
  });

  // Regression: QA ISSUE-004. A grid child with its default intrinsic minimum
  // width expands past a phone viewport instead of becoming a scrollable nav.
  it("contains the journey links so mobile buyers can scroll to every section", () => {
    expect(html).toContain(".journey-links{min-width:0;width:100%");
    expect(html).toContain("overflow-x:auto;overscroll-behavior-inline:contain");
  });

  it("keeps wheel scrolling monotonic and hands preview boundaries to the host page", () => {
    expect(html).toContain("html{scroll-behavior:auto;");
    expect(html).toContain("scrollIntoView({behavior:reducedMotion?'auto':'smooth'");
    expect(html).toContain("function handOffPreviewWheel(event)");
    expect(html).toContain("boundaryWheelDelta+=event.deltaY");
    expect(html).toContain("window.requestAnimationFrame(flushPreviewWheel)");
    expect(html).toContain("action:'preview_scroll_boundary'");
    expect(html).toContain("function scrollInlineIntoView(node)");
    expect(html).toContain("if(active)scrollInlineIntoView(link)");
    expect(html).toContain("scrollInlineIntoView(tab)");
    expect(html).not.toContain("link.scrollIntoView");
    expect(html).not.toContain("tab.scrollIntoView");
  });

  // Regression: QA ISSUE-005. Protected Vercel previews require their SSO
  // cookie on same-origin telemetry requests; the event body remains allowlisted.
  it("keeps preview event delivery same-origin and credential bounded", () => {
    expect(html).toContain("credentials:'same-origin'");
    expect(html).not.toContain("credentials:'include'");
  });

  it("keeps asset fallback behavior inside the nonced runtime", () => {
    expect(html).not.toMatch(/\son(?:load|error)=/i);
    expect(html).toContain("function settleImage(image,readyClass)");
    expect(html).toContain("settleImage(image,'has-image')");
    expect(html).toContain("settleImage(image,'has-asset')");
  });

  it("uses an intentional experience blueprint when approved imagery is unavailable", () => {
    const withoutImages = renderExperienceHtml({
      draft,
      brand: { ...brand, imageUrls: [] },
      useCase: "campaign",
      answers: {}
    });

    expect(withoutImages).toContain('data-fallback-kind="experience-blueprint"');
    expect(withoutImages).toContain("Experience blueprint");
    expect(withoutImages).toContain("Context.<br>Proof.<br>Next step.");
    expect(withoutImages).toContain(".media.media .media-fallback:before,.media.media .media-fallback:after{display:none}");
    expect(withoutImages).not.toContain("<div class=\"media-fallback\" aria-hidden=\"true\"><span></span><span></span><span></span></div>");
    expect(withoutImages).not.toMatch(/<figure[^>]*>\s*<img/i);
  });

  it("uses the harvested seller palette, typography, wordmark, and imagery", () => {
    expect(html).toContain("--brand-ink:#1B3E51");
    expect(html).toContain("--brand-accent:#F44414");
    expect(html).toContain('--display:"Roboto Slab"');
    expect(html).toContain("Jitterbit-logo-2.svg");
    expect(html).toContain("HarmonyTitle-HeroImage-Ring.jpg");
  });

  it("renders the reviewed ServiceNow design DNA instead of the generic indigo and serif fallback", () => {
    const serviceNow = verifiedBrandProfileFor("servicenow.com");
    expect(serviceNow).toBeDefined();

    const serviceNowHtml = renderExperienceHtml({
      draft: {
        ...draft,
        title: "ServiceNow | Put AI to work",
        headline: "Put AI to work across every enterprise workflow."
      },
      brand: serviceNow!,
      useCase: "campaign",
      answers: { ctaStyle: "solid" },
      fontDeliveryUrls: {
        display: "/api/sessions/servicenow-font/font/display",
        body: "/api/sessions/servicenow-font/font/body"
      }
    });

    expect(serviceNowHtml).toContain("brand-hero-dark");
    expect(serviceNowHtml).toContain(
      "body.brand-hero-dark .hero h1::first-line{-webkit-text-fill-color:var(--brand-accent)"
    );
    expect(serviceNowHtml).not.toContain(
      "background:linear-gradient(180deg,var(--brand-accent) 0 31%"
    );
    expect(serviceNowHtml).toContain('data-hero-theme="dark"');
    expect(serviceNowHtml).toContain("--brand-ink:#032D42");
    expect(serviceNowHtml).toContain("--brand-accent:#63DF4E");
    expect(serviceNowHtml).toContain("--brand-accent-on-light:#1A610E");
    expect(serviceNowHtml).toContain("--brand-support:#52B8FF");
    expect(serviceNowHtml).toContain("--text:#1D1D1D");
    expect(serviceNowHtml).toContain("--button-radius:500px");
    expect(serviceNowHtml).not.toContain(
      "body.design-source-brand-technical .primary,body.design-source-brand-technical .secondary"
    );
    expect(serviceNowHtml).not.toContain(
      "body.style-technical .primary,body.style-technical .secondary"
    );
    expect(serviceNowHtml).toContain("--button-height:56px");
    expect(serviceNowHtml).toContain("--button-border-width:2px");
    expect(serviceNowHtml).toContain("--card-radius:32px");
    expect(serviceNowHtml).toContain(
      '--display:"Instrument Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto'
    );
    expect(serviceNowHtml).toContain(
      '@font-face{font-family:"Instrument Sans";src:url("/api/sessions/servicenow-font/font/display") format("woff2")'
    );
    expect(serviceNowHtml).toContain(
      '@font-face{font-family:"Inter";src:url("/api/sessions/servicenow-font/font/body") format("woff2")'
    );
    expect(serviceNowHtml).not.toContain("fonts.gstatic.com");
    expect(serviceNowHtml).toContain("servicenow-header-logo.svg");
    expect(serviceNowHtml).toContain("hp-put-ai-to-work-og-image.jpg");
    expect(serviceNowHtml).toContain("radial-gradient(ellipse 80% 48%");
    expect(serviceNowHtml).toContain(
      ".eyebrow,.journey-index{color:var(--brand-accent-on-light)}"
    );
    expect(serviceNowHtml).toContain(
      "body.brand-hero-dark .hero .eyebrow,.close .eyebrow{color:var(--brand-accent)}"
    );
    expect(serviceNowHtml).toContain("body.brand-hero-dark .hero{background:radial-gradient");
    expect(serviceNowHtml).not.toContain("body.brand-hero-dark .hero{grid-template-columns:1fr");
    expect(serviceNowHtml).not.toContain("--brand-accent:#5B5BFF");
    expect(serviceNowHtml).not.toContain('--display:"Instrument Sans",ui-serif');
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

  it("includes three functional decision lenses, three source-backed resource cards, and analytics hooks", () => {
    expect(html.match(/<button[^>]*role="tab"/g)).toHaveLength(3);
    expect(html.match(/class="lens-panel"/g)).toHaveLength(3);
    expect(html.match(/<article class="journey-card resource-card/g)).toHaveLength(3);
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
    expect(html).toContain('data-flz-block-id="resource.2.headline" data-flz-block-kind="proof-point"');
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

  it("keeps the generated analytics runtime syntactically valid", () => {
    const runtime = html.match(/<script data-flz-runtime>([\s\S]*?)<\/script>/)?.[1];
    expect(runtime).toBeTruthy();
    expect(() => new Function(runtime ?? "")).not.toThrow();
  });

  it("captures visibility-aware engagement depth through the non-blocking API sink", () => {
    expect(html).toContain("section_dwell:true");
    expect(html).toContain("page_heartbeat:true");
    expect(html).toContain("experience_view:true");
    expect(html).toContain("window.fetch('/api/events'");
    expect(html).not.toContain("window.fetch('/events'");
    expect(html).toContain("credentials:'same-origin',keepalive:true");
    expect(html).toContain("eventId:makeEventId()");
    expect(html).toContain("return ('evt_'+randomPart+'_'+eventSequence.toString(36)).slice(0,128)");
    expect(html).toContain("body:JSON.stringify(envelope)");
    expect(html).toContain("sendEvent(envelope,1)");
    expect(html).toContain("sendEvent(envelope,retriesRemaining-1)");
    expect(html).toContain("document.visibilityState==='visible'");
    expect(html).toContain("document.addEventListener('visibilitychange',visibilityChanged)");
    expect(html).toContain("window.setInterval(heartbeat,15000)");
    expect(html).toContain("entry.intersectionRatio>=.35");
    expect(html).toContain("if(emit&&seconds>=3)");
    expect(html).not.toContain("email:");
  });

  it("delegates interaction feedback to the host so the preview has one notification system", () => {
    expect(html).not.toContain('data-signal-toast role="status"');
    expect(html).not.toContain('data-folloze-invite aria-label="Folloze engagement insight"');
    expect(html).not.toContain('data-folloze-insight aria-label="Engagement signals captured by Folloze"');
    expect(html).toContain("window.parent.postMessage");
    expect(html).toContain("@media(prefers-reduced-motion:reduce)");
    expect(html).toContain("transition:none!important");
    expect(html).toContain("@media(forced-colors:active)");
  });

  it("deduplicates rapid semantic events without suppressing dwell or heartbeat depth", () => {
    expect(html).toContain("var recentSemanticEvents={}");
    expect(html).toContain("function semanticEventKey(action,payload)");
    expect(html).toContain("now-recentSemanticEvents[semanticKey]<1200");
    expect(html).toContain("action!=='page_heartbeat'&&action!=='section_dwell'");
  });

  it("uses content provenance without turning the preview into a live source CTA", () => {
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

    expect(content).toContain('data-template-family="content-source"');
    expect(content).toContain('data-source-reference="Automation guide"');
    expect(content).toContain("Built from Automation guide.");
    expect(content.match(/<article class="journey-card resource-card/g)).toHaveLength(3);
    expect(content).not.toContain('href="https://example.com/guides/automation"');
    expect(content.match(/class="actions"/g)).toHaveLength(1);
    expect(content.match(/class="primary" data-demo-cta/g)).toHaveLength(2);
    expect(content).not.toContain('class="secondary"');
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

  it("uses the campaign register to select a campaign composition and preserves its wireframe metadata", () => {
    expect(html).toContain('class="register-campaign-product design-source-brand-editorial template-campaign-launch variant-standard style-standard cta-solid brand-hero-light"');
    expect(html).toContain('data-wireframe="product-launch-landing-page"');
    expect(html).toContain('data-experience-shape="offer-landing-page"');
    expect(html).toContain('data-template-fingerprint="v3-campaign-routes-proof-thesis"');
    expect(html).toContain('data-layout-variant="standard"');
    expect(html).toContain('data-style-variant="standard"');
    expect(html.indexOf('id="decision-path"')).toBeLessThan(html.indexOf('id="supporting-resources"'));
    expect(html.indexOf('id="supporting-resources"')).toBeLessThan(html.indexOf('id="experience-thesis"'));
    expect(html).toContain("Explore what changes");
  });

  it("ignores legacy layout selections, preserves style, and keeps workspace receipts out of buyer chrome", () => {
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

    expect(enhanced).toContain('class="register-content-magic design-source-brand-editorial template-content-source variant-standard style-editorial cta-solid brand-hero-light"');
    expect(enhanced).toContain('data-layout-variant="standard"');
    expect(enhanced).toContain('data-style-variant="editorial"');
    expect(enhanced).not.toContain('data-quality-receipt="true"');
    expect(enhanced).not.toContain("Grounded &amp; reviewed");
    expect(enhanced).not.toContain("alert(&quot;receipt&quot;)");
    expect(enhanced).not.toContain("/100 quality");
    expect(enhanced).not.toContain('href="https://example.com/report"');
    expect(enhanced).not.toContain("token=remove");
    expect(enhanced).not.toContain("Ignored");
    expect(html).not.toContain('data-quality-receipt="true"');
  });

  it("normalizes every legacy layout choice into the canonical geometry while retaining safe style choices", () => {
    for (const variant of ["narrative", "modular", "immersive", "compact"] as const) {
      const variantHtml = renderExperienceHtml({
        draft,
        brand,
        useCase: "campaign",
        answers: Object.assign({}, { layoutVariant: variant, styleVariant: "technical" as const })
      });
      expect(variantHtml).toContain("variant-standard style-technical");
      expect(variantHtml).toContain('data-layout-variant="standard"');
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

  it("does not leak the workspace quality receipt into the generated buyer page", () => {
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

    expect(checked).not.toContain("Experience receipt");
    expect(checked).not.toContain("Quality checks passed");
    expect(checked).not.toContain("Copy quality");
    expect(checked).not.toContain("CTA path");
  });

  it("renders CTA visual treatment from intent-only preview input", () => {
    const outline = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: { ctaType: "book-meeting", ctaStyle: "outline" }
    });
    const text = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: { ctaType: "download", ctaStyle: "text" }
    });
    const fallback = renderExperienceHtml({
      draft,
      brand,
      useCase: "campaign",
      answers: Object.assign({}, { ctaStyle: "<script>alert(1)</script>" }) as unknown as Parameters<
        typeof renderExperienceHtml
      >[0]["answers"]
    });

    expect(outline).toContain("cta-outline");
    expect(outline).toContain('data-cta-style="outline"');
    expect(text).toContain("cta-text");
    expect(text).toContain('data-cta-style="text"');
    expect(fallback).toContain("cta-solid");
    expect(fallback).not.toContain("<script>alert(1)</script>");
  });

  it("shares primitives across product, ABM, and content while selecting distinct template fingerprints", () => {
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
        sectionSequence: ["guided-questions", "thesis", "decision-lenses"],
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
        narrativeArc: "How should buyers explore the enterprise automation guide?",
        sectionLabels: {
          thesis: "The idea worth carrying forward",
          lenses: "Choose your reading path",
          journey: "Questions raised by the source",
          close: "Keep exploring"
        }
      },
      brand,
      useCase: "content",
      answers: {
        sourceName: "Enterprise automation guide",
        sourceUrl: "https://example.com/enterprise-automation-guide",
        audience: draft.audienceLabel
      }
    });

    const fingerprint = (output: string) => ({
      wireframe: output.match(/data-wireframe="([^"]+)"/)?.[1],
      shape: output.match(/data-experience-shape="([^"]+)"/)?.[1],
      family: output.match(/data-template-family="([^"]+)"/)?.[1],
      template: output.match(/data-template-fingerprint="([^"]+)"/)?.[1],
      sharedPrimitives: output.match(/data-shared-primitives="([^"]+)"/)?.[1],
      layout: output.match(/data-layout-variant="([^"]+)"/)?.[1],
      signatureButtons: output.match(/data-signature-lens-index=/g)?.length,
      heroActions: output.match(/<div class="actions">([\s\S]*?)<\/div>/)?.[1].match(/<(?:button|a)\b/g)?.length,
      liveHeroLinks: output.match(/<div class="actions">([\s\S]*?)<\/div>/)?.[1].match(/<a\b/g)?.length ?? 0,
      lensTabs: output.match(/<button[^>]*role="tab"/g)?.length,
      lensPanels: output.match(/class="lens-panel"/g)?.length,
      resourceCards: output.match(/<article class="journey-card resource-card/g)?.length,
      sectionOrder: [...output.matchAll(/<section class="(?:thesis|lens-lab|journey) experience-region" id="([^"]+)"/g)].map((match) => match[1])
    });

    const productFingerprint = fingerprint(html);
    const abmFingerprint = fingerprint(abm);
    const contentFingerprint = fingerprint(content);
    expect(new Set([productFingerprint.sharedPrimitives, abmFingerprint.sharedPrimitives, contentFingerprint.sharedPrimitives])).toEqual(
      new Set(["brand-lockup,hero,signature-paths,thesis,lenses,resources,close,analytics"])
    );
    expect(new Set([productFingerprint.template, abmFingerprint.template, contentFingerprint.template]).size).toBe(3);
    for (const candidate of [productFingerprint, abmFingerprint, contentFingerprint]) {
      expect(candidate.layout).toBe("standard");
      expect(candidate.signatureButtons).toBe(3);
      expect(candidate.heroActions).toBe(1);
      expect(candidate.liveHeroLinks).toBe(0);
      expect(candidate.lensTabs).toBe(3);
      expect(candidate.lensPanels).toBe(3);
      expect(candidate.resourceCards).toBe(3);
    }
    expect(productFingerprint).toMatchObject({
      wireframe: "product-launch-landing-page",
      shape: "offer-landing-page",
      family: "campaign-launch",
      template: "v3-campaign-routes-proof-thesis",
      sectionOrder: ["decision-path", "supporting-resources", "experience-thesis"]
    });
    expect(abmFingerprint).toMatchObject({
      wireframe: "abm-account-microsite",
      shape: "narrative-workflow",
      family: "account-abm",
      template: "v3-account-thesis-paths-proof",
      sectionOrder: ["experience-thesis", "decision-path", "supporting-resources"]
    });
    expect(contentFingerprint).toMatchObject({
      wireframe: "content-resource-companion",
      shape: "resource-companion",
      family: "content-source",
      template: "v3-content-source-findings-paths",
      sectionOrder: ["supporting-resources", "experience-thesis", "decision-path"]
    });
    expect(abm).toContain("Jitterbit × Cisco");
    expect(abm).toContain("Decision paths for Cisco");
    expect(html).toContain("Three ways in for Enterprise architects and platform owners");
    expect(content).toContain("Choose how to explore the source");
    expect(content).toContain("How should buyers explore the enterprise automation guide?");
    expect(html).not.toContain("How should buyers explore the enterprise automation guide?");
  });

  it("renders all five registers through three compositions with shared primitives and preview-only CTAs", () => {
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
    const cases: Array<{
      useCase: UseCase;
      answers: SessionAnswers;
      targetBrand?: BrandProfile;
    }> = [
      {
        useCase: "abm",
        targetBrand: target,
        answers: {
          targetDomain: "cisco.com",
          audience: "Infrastructure platform leaders",
          objective: "Book a meeting"
        }
      },
      {
        useCase: "campaign",
        answers: {
          campaignType: "demand",
          promotedOffer: "Enterprise automation platform",
          audience: "Demand generation leaders",
          objective: "Generate demand"
        }
      },
      {
        useCase: "campaign",
        answers: {
          campaignType: "product",
          promotedOffer: "Governed AI automation",
          audience: "Enterprise architects",
          objective: "Launch or announce"
        }
      },
      {
        useCase: "campaign",
        answers: {
          campaignType: "event",
          promotedOffer: "Enterprise Automation Summit",
          eventSource: "https://example.com/enterprise-automation-summit",
          audience: "Automation leaders",
          objective: "Drive registrations"
        }
      },
      {
        useCase: "content",
        answers: {
          sourceName: "The governed automation field guide.pdf",
          sourceUrl: "https://example.com/governed-automation-guide",
          audience: "Application leaders",
          objective: "Educate buyers"
        }
      }
    ];
    const outputs = cases.map(({ useCase, answers, targetBrand }) => {
      const context = compileCampaignContext({ brand, targetBrand, useCase, answers });
      const generatedDraft = deterministicDraft({ brand, targetBrand, useCase, answers, context });
      return renderExperienceHtml({ draft: generatedDraft, brand, targetBrand, useCase, answers });
    });
    const geometryFingerprint = (output: string) => ({
      wireframe: output.match(/data-wireframe="([^"]+)"/)?.[1],
      shape: output.match(/data-experience-shape="([^"]+)"/)?.[1],
      family: output.match(/data-template-family="([^"]+)"/)?.[1],
      template: output.match(/data-template-fingerprint="([^"]+)"/)?.[1],
      sharedPrimitives: output.match(/data-shared-primitives="([^"]+)"/)?.[1],
      layout: output.match(/data-layout-variant="([^"]+)"/)?.[1],
      sectionOrder: [...output.matchAll(/<section class="(?:thesis|lens-lab|journey) experience-region" id="([^"]+)"/g)].map((match) => match[1]),
      signatureButtons: output.match(/data-signature-lens-index=/g)?.length,
      lensPanels: output.match(/class="lens-panel"/g)?.length,
      resourceCards: output.match(/<article class="journey-card resource-card/g)?.length,
      heroActions: output.match(/<div class="actions">([\s\S]*?)<\/div>/)?.[1].match(/<(?:button|a)\b/g)?.length
    });

    const fingerprints = outputs.map(geometryFingerprint);
    expect(new Set(fingerprints.map(({ family }) => family))).toEqual(
      new Set(["account-abm", "campaign-launch", "content-source"])
    );
    expect(new Set(fingerprints.map(({ template }) => template)).size).toBe(3);
    expect(new Set(fingerprints.map(({ sharedPrimitives }) => sharedPrimitives))).toEqual(
      new Set(["brand-lockup,hero,signature-paths,thesis,lenses,resources,close,analytics"])
    );
    expect(new Set(outputs.map((output) => output.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1])).size).toBe(5);
    expect(new Set(outputs.map((output) => output.match(/<style>([\s\S]*?)<\/style>/)?.[1])).size).toBe(1);
    for (const [index, output] of outputs.entries()) {
      const fingerprint = fingerprints[index];
      expect(output).not.toContain("body.register-");
      expect(output).toContain('class="signature signature-canonical"');
      expect(output).not.toContain('class="secondary"');
      expect(fingerprint.layout).toBe("standard");
      expect(fingerprint.signatureButtons).toBe(3);
      expect(fingerprint.lensPanels).toBe(3);
      expect(fingerprint.resourceCards).toBe(3);
      expect(fingerprint.heroActions).toBe(1);
      expect(output).not.toContain("Experience receipt");
      expect(output).not.toContain('id="guided-questions"');
    }
    expect(fingerprints[0]?.sectionOrder).toEqual(["experience-thesis", "decision-path", "supporting-resources"]);
    expect(fingerprints[1]?.sectionOrder).toEqual(["decision-path", "supporting-resources", "experience-thesis"]);
    expect(fingerprints[2]?.sectionOrder).toEqual(["decision-path", "supporting-resources", "experience-thesis"]);
    expect(fingerprints[3]?.sectionOrder).toEqual(["decision-path", "supporting-resources", "experience-thesis"]);
    expect(fingerprints[4]?.sectionOrder).toEqual(["supporting-resources", "experience-thesis", "decision-path"]);
  });

  it("makes external links safe and avoids raw fragment links", () => {
    const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
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
    expect(html).toContain("Proof for the first use case");
    expect(html).not.toContain("Experience receipt");
    expect(html).not.toContain('id="guided-questions"');
    expect(html).toContain(`>${draft.primaryCta}</button>`);
  });

  it("keeps the configured CTA as an in-preview style demonstration without a live destination", () => {
    expect(html).toContain('data-demo-cta="true" data-flz-cta-id="hero-primary"');
    expect(html).toContain('data-demo-cta="true" data-flz-cta-id="close-primary"');
    expect(html).not.toMatch(/data-scroll-target="[^"]+"[^>]+data-flz-cta-id="hero-primary"/);
    expect(html).not.toMatch(/<a class="primary"[^>]+data-flz-cta-id="close-primary"/);
    expect(html).not.toContain("window.location=");
    expect(html).not.toContain("showSignal(");
    expect(html).toContain("window.flzAnalytic('cta_click'");
  });
});
