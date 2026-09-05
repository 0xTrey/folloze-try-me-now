import { describe, expect, it } from "vitest";

import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import {
  brandWithFirstPartyImages,
  brandWithSessionLogoDelivery,
  imageDeliverySources
} from "@/lib/image-delivery";
import { portableBrandLogoFromSvg } from "@/lib/portable-brand-logo";
import type { BrandProfile } from "@/lib/types";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";

const draft: ExperienceDraft = {
  campaignRegister: "campaign-product",
  designRegister: "source-brand-editorial",
  wireframeName: "product-launch-landing-page",
  experienceShape: "interactive-workbench",
  sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
  sectionLabels: {
    thesis: "The operating shift",
    lenses: "Explore the platform",
    journey: "Questions to answer",
    close: "Choose the next move"
  },
  title: "ServiceNow | Put AI to work",
  eyebrow: "ServiceNow for transformation leaders",
  headline: "Put AI to work across every enterprise workflow.",
  subhead: "Connect data, workflows, experiences, intelligence, and security through one enterprise platform.",
  thesisHeadline: "AI creates value when it can act through governed workflows.",
  thesisBody: "Give business and technology leaders a clear path from an important operating question to evidence and a practical next move.",
  primaryCta: "Explore the path",
  audienceLabel: "Business transformation leaders",
  narrativeArc: "What should transformation leaders validate before choosing their first workflow?",
  sections: [
    {
      eyebrow: "Workflow",
      headline: "Connect the work already moving across the enterprise.",
      body: "Show how shared workflow context makes the first use case easier to understand and govern.",
      proof: "Which workflow has enough urgency and evidence to become the first path?"
    },
    {
      eyebrow: "Data",
      headline: "Ground every action in the right enterprise context.",
      body: "Bring business data and operating signals together without creating another disconnected experience.",
      proof: "Which systems and signals have to connect before the workflow can act?"
    },
    {
      eyebrow: "Control",
      headline: "Make governance visible from the first interaction.",
      body: "Give the buying group a practical way to examine security, accountability, and measurable value.",
      proof: "What does the buying group need to believe before it can move?"
    }
  ],
  signalLabels: ["Workflow", "Data", "Control"],
  closingHeadline: "Choose one workflow worth making real.",
  closingBody: "Start with the business question, connect the evidence, and make the first next step easy to see."
};

describe("generated experience image delivery", () => {
  it("renders the verified ServiceNow logo and hero only through first-party slots", () => {
    const source = verifiedBrandProfileFor("servicenow.com");
    expect(source).toBeDefined();
    const sources = imageDeliverySources({ answers: {}, brand: source });
    const delivered = brandWithFirstPartyImages("servicenow-session", source!, sources, 7);

    const html = renderExperienceHtml({
      draft,
      brand: delivered,
      useCase: "campaign",
      answers: {}
    });

    expect(html).toContain("/api/sessions/servicenow-session/image/seller-logo?v=7");
    expect(html).toContain("/api/sessions/servicenow-session/image/seller-image-0?v=7");
    expect(html).not.toContain(source!.logoUrl);
    for (const rawUrl of source!.imageUrls) expect(html).not.toContain(rawUrl);
  });

  it("renders distinct Medidata and Lilly logos in the ABM lockup", () => {
    const seller = verifiedBrandProfileFor("medidata.com")!;
    const target = verifiedBrandProfileFor("lilly.com")!;
    const sources = imageDeliverySources({
      answers: {},
      brand: seller,
      targetBrand: target
    });
    const deliveredSeller = brandWithFirstPartyImages(
      "medidata-lilly-session",
      seller,
      sources,
      9
    );
    const deliveredTarget = brandWithFirstPartyImages(
      "medidata-lilly-session",
      target,
      sources,
      9
    );

    const html = renderExperienceHtml({
      draft: { ...draft, campaignRegister: "one-to-one-abm" },
      brand: deliveredSeller,
      targetBrand: deliveredTarget,
      useCase: "abm",
      answers: { targetDomain: "lilly.com" }
    });

    expect(html).toContain(
      '<img src="/api/sessions/medidata-lilly-session/image/seller-logo?v=9" alt="" aria-hidden="true">'
    );
    expect(html).toContain(
      '<img src="/api/sessions/medidata-lilly-session/image/target-logo?v=9" alt="" aria-hidden="true">'
    );
    expect(html).toContain('class="wordmark seller-wordmark" role="img" aria-label="Medidata"');
    expect(html).toContain('class="wordmark target-wordmark" role="img" aria-label="Lilly"');
    expect(html).not.toContain(seller.logoUrl);
    expect(html).not.toContain(target.logoUrl);
  });

  it("preserves portable inline seller and target logos through stored profiles and generated HTML", () => {
    const portableLogo = portableBrandLogoFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cisco logo"><title>Cisco</title><path fill="#1BA0D7" d="M1 1h98v50H1z"/></svg>'
    );
    expect(portableLogo).toBeDefined();
    const profile = (domain: string, companyName: string): BrandProfile => ({
      domain,
      companyName,
      publicTopics: [],
      portableLogo,
      imageUrls: [],
      colors: ["#07182D", "#1BA0D7"],
      primaryColor: "#07182D",
      accentColor: "#1BA0D7",
      surfaceColor: "#FFFFFF",
      sourceUrl: `https://${domain}`,
      source: "brand-harvester"
    });
    const storedSeller = brandWithSessionLogoDelivery(
      "portable-session",
      "seller",
      profile("cisco.com", "Cisco")
    );
    const storedTarget = brandWithSessionLogoDelivery(
      "portable-session",
      "target",
      profile("target.example", "Target")
    );
    const sources = imageDeliverySources({
      answers: {},
      brand: storedSeller,
      targetBrand: storedTarget
    });

    expect(storedSeller.logoUrl).toBe("/api/sessions/portable-session/image/seller-logo");
    expect(storedTarget.logoUrl).toBe("/api/sessions/portable-session/image/target-logo");
    expect(sources.sellerLogo).toBe(storedSeller.logoUrl);
    expect(sources.targetLogo).toBe(storedTarget.logoUrl);

    const renderedSeller = brandWithFirstPartyImages(
      "portable-session",
      storedSeller,
      sources,
      11
    );
    const renderedTarget = brandWithFirstPartyImages(
      "portable-session",
      storedTarget,
      sources,
      11
    );
    const html = renderExperienceHtml({
      draft: { ...draft, campaignRegister: "one-to-one-abm" },
      brand: renderedSeller,
      targetBrand: renderedTarget,
      useCase: "abm",
      answers: { targetDomain: "target.example" }
    });

    expect(renderedSeller.logoUrl).toBe(
      "/api/sessions/portable-session/image/seller-logo?v=11"
    );
    expect(renderedTarget.logoUrl).toBe(
      "/api/sessions/portable-session/image/target-logo?v=11"
    );
    expect(html).toContain(renderedSeller.logoUrl);
    expect(html).toContain(renderedTarget.logoUrl);
    expect(html).not.toContain(portableLogo!.bytesBase64);
  });

  it("does not accept arbitrary same-origin paths that resemble image delivery", () => {
    const source = verifiedBrandProfileFor("servicenow.com")!;
    const html = renderExperienceHtml({
      draft,
      brand: {
        ...source,
        logoUrl: "/api/sessions/servicenow-session/image/seller-logo?raw=https://attacker.example",
        imageUrls: [
          "/uploads/brand-image.jpg",
          "/api/sessions/servicenow-session/image/seller-image-6"
        ]
      },
      useCase: "campaign",
      answers: {}
    });

    expect(html).not.toContain("attacker.example");
    expect(html).not.toContain("/uploads/brand-image.jpg");
    expect(html).not.toContain("seller-image-6");
    expect(html).not.toMatch(/<figure\b/);
  });
});
