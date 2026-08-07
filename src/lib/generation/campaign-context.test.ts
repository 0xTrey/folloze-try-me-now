import { describe, expect, it } from "vitest";

import {
  CANONICAL_EXPERIENCE_STRUCTURE,
  cleanSourceTitle,
  compileCampaignContext,
  experienceShapes,
  wireframeNames
} from "@/lib/generation/campaign-context";
import type { BrandProfile } from "@/lib/types";

const seller: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Enterprise integration, API management, and workflow automation.",
  publicContext: "Harmony connects integration, orchestration, applications, and governed AI.",
  publicTopics: ["Integration", "Workflow automation", "API management"],
  imageUrls: ["https://jitterbit.com/one.png", "https://jitterbit.com/two.png", "https://jitterbit.com/three.png"],
  colors: ["#1B3E51", "#F44414", "#FFFFFF"],
  primaryColor: "#1B3E51",
  accentColor: "#F44414",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "Roboto Slab",
  bodyFontFamily: "Roboto",
  sourceUrl: "https://jitterbit.com",
  source: "brand-harvester"
};

const target: BrandProfile = {
  ...seller,
  domain: "cisco.com",
  companyName: "Cisco",
  description: "Networking, security, collaboration, and observability technology.",
  publicContext: "Cisco operates across enterprise infrastructure, security, and applications.",
  publicTopics: ["Networking", "Security", "Infrastructure", "Observability"],
  imageUrls: [],
  primaryColor: "#0D274D",
  accentColor: "#049FD9",
  sourceUrl: "https://cisco.com"
};

describe("compileCampaignContext", () => {
  it("turns SEO titles into concise editorial source names", () => {
    expect(cleanSourceTitle("AI-Powered Enterprise Automation & Integration | Jitterbit")).toBe(
      "AI-Powered Enterprise Automation & Integration"
    );
    expect(cleanSourceTitle("Integration readiness scorecard.pdf")).toBe(
      "Integration readiness scorecard"
    );
    expect(cleanSourceTitle("A buyer's guide - Resources")).toBe("A buyer's guide");
  });

  it("builds a safe, account-specific ABM brief without manufacturing strategic axes", () => {
    const context = compileCampaignContext({
      brand: seller,
      targetBrand: target,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure, security, and application leaders",
        objective: "Book a meeting"
      }
    });

    expect(context.brief).toMatchObject({
      campaignRegister: "one-to-one-abm",
      targetAccount: { domain: "cisco.com", name: "Cisco" },
      primaryAction: "Plan the working session",
      accountEvidence: {
        personalizationLevel: "safe-public-context",
        unresolvedAxes: [
          "business priorities",
          "strategic operational challenges",
          "market and innovation focus"
        ]
      }
    });
    expect(context.brief.accountEvidence.evidenceItems).toHaveLength(3);
    expect(context.brief.accountEvidence.evidenceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "public-positioning",
          label: "Public positioning",
          text: target.description,
          sourceUrl: target.sourceUrl,
          signals: expect.any(Array)
        }),
        expect.objectContaining({ type: "public-focus-area", text: "Networking" }),
        expect.objectContaining({ type: "public-focus-area", text: "Security" })
      ])
    );
    expect(
      context.brief.accountEvidence.evidenceItems.every(
        (item) => item.signals.length > 0 && item.signals.every((signal) => signal.length >= 3)
      )
    ).toBe(true);
    expect(context.brief.messageSpine.recognizableContext).toContain("Cisco");
    expect(context.brief.messageSpine.whyNow).toBeNull();
    expect(context.designContext).toMatchObject({
      brandOwner: "Jitterbit",
      designRegister: "source-brand-image-led",
      typography: { display: "Roboto Slab", body: "Roboto" },
      colorSystem: { primary: "#1B3E51", accent: "#F44414", surface: "#FFFFFF" }
    });
    expect(context.wireframe).toMatchObject({
      name: "abm-account-microsite",
      experienceShape: "narrative-workflow",
      heroMode: "account-thesis",
      sectionSequence: CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence
    });
  });

  it("uses visitor-supplied product context in an ABM introduction without treating it as public proof", () => {
    const context = compileCampaignContext({
      brand: seller,
      targetBrand: target,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure and security architects",
        objective: "Introduce a product",
        messageBelief: "Harmony connects governed integration and automation in one operating layer."
      }
    });

    expect(context.brief.messageSpine.whyNow).toContain("Visitor-supplied product context");
    expect(context.brief.messageSpine.sellerPromise).toContain("Harmony connects governed integration");
    expect(context.brief.messageSpine.proofPolicy).toMatch(/Do not invent|Use seller mechanisms/i);
    expect(context.brief.offerOrSource.provenance).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "public-page" })
    ]));
  });

  it("never promotes navigation labels into target-account evidence", () => {
    const navigationHeavyTarget: BrandProfile = {
      ...target,
      description: "Secure networking, observability, and enterprise infrastructure.",
      publicContext:
        "Secure networking, observability, and enterprise infrastructure. Products and Services Featured Resources",
      publicTopics: [
        "Products and Services",
        "Featured Resources",
        "Secure networking",
        "Enterprise observability"
      ]
    };
    const context = compileCampaignContext({
      brand: seller,
      targetBrand: navigationHeavyTarget,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure and security architects",
        objective: "Book a meeting"
      }
    });
    const evidence = JSON.stringify(context.brief.accountEvidence.evidenceItems);

    expect(evidence).toMatch(/networking|observability|infrastructure/i);
    expect(evidence).not.toMatch(/Products and Services|Featured Resources/i);
  });

  it("keeps one shared block contract while selecting a deliberate template for every register", () => {
    const abm = compileCampaignContext({
      brand: seller,
      targetBrand: target,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure leaders",
        objective: "Book a meeting"
      }
    });
    const demand = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: { campaignType: "demand", audience: "Integration leaders", objective: "Generate demand" }
    });
    const product = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: { campaignType: "product", audience: "Enterprise architects", objective: "Launch a product" }
    });
    const event = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: {
        campaignType: "event",
        eventSource: "Enterprise Automation Summit",
        audience: "Platform owners",
        objective: "Continue event engagement"
      }
    });
    const content = compileCampaignContext({
      brand: seller,
      useCase: "content",
      answers: {
        sourceName: "The governed automation field guide.pdf",
        audience: "Application leaders",
        objective: "Educate buyers"
      }
    });
    const contexts = [abm, demand, product, event, content];
    expect(new Set(contexts.map(({ brief }) => brief.campaignRegister)).size).toBe(5);
    expect(contexts.map(({ wireframe }) => wireframe.name)).toEqual([
      "abm-account-microsite",
      "demand-generation-landing-page",
      "product-launch-landing-page",
      "event-awareness-follow-up",
      "content-resource-companion"
    ]);
    expect(new Set(contexts.map(({ wireframe }) => wireframe.experienceShape)).size).toBe(4);
    expect(new Set(contexts.map(({ wireframe }) => wireframe.heroMode)).size).toBe(5);
    expect(new Set(contexts.map(({ wireframe }) => wireframe.sectionSequence.join("|")))).toEqual(
      new Set([CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence.join("|")])
    );
    expect(new Set(contexts.map(({ wireframe }) => JSON.stringify(wireframe.labels))).size).toBe(5);
    expect(new Set(contexts.map(({ wireframe }) => wireframe.signatureMoment)).size).toBe(5);
    expect(new Set(contexts.map(({ wireframe }) => wireframe.finalCtaPattern)).size).toBe(5);
    expect(contexts.map(({ brief }) => brief.primaryAction)).toEqual([
      "Plan the working session",
      "Explore the offer",
      "Explore the first use case",
      "Continue the event conversation",
      "Explore the key ideas"
    ]);
    expect(event.brief.eventContext).toBe("Enterprise Automation Summit");
  });

  it("keeps legacy wireframe and shape literals parseable for stored sessions", () => {
    expect(wireframeNames).toEqual(expect.arrayContaining([
      "abm-account-microsite",
      "demand-generation-landing-page",
      "product-launch-landing-page",
      "event-awareness-follow-up",
      "content-resource-companion",
      "content-assessment-workbench"
    ]));
    expect(experienceShapes).toEqual(expect.arrayContaining([
      "narrative-workflow",
      "offer-landing-page",
      "interactive-workbench",
      "event-cohort",
      "resource-companion",
      "assessment-workbench"
    ]));
  });

  it("turns a registration objective into an attendance experience instead of post-event follow-up", () => {
    const event = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: {
        campaignType: "event",
        eventSource: "Live webinar: Governed automation in practice",
        audience: "Platform owners",
        objective: "Drive registrations"
      }
    });

    expect(event.brief.primaryAction).toBe("Save your place");
    expect(event.wireframe.labels).toMatchObject({
      thesis: "Why this session is worth the time",
      lenses: "Three reasons to attend or keep exploring",
      close: "Register or continue the conversation"
    });
    expect(event.wireframe.finalCtaPattern).toMatch(/register, watch/i);
    expect(event.wireframe.selection).toMatchObject({
      archetypeId: "campaign-event",
      compositionId: "chapter-journey",
      selectedBy: "system",
      locked: true
    });
  });

  it("keeps a promoted campaign offer first-class in the brief and message spine", () => {
    const ford: BrandProfile = {
      ...seller,
      domain: "ford.com",
      companyName: "Ford",
      description: "Vehicles, commercial fleets, connected services, and electric mobility.",
      publicContext: "Ford supports commercial fleet operations with vehicles and connected services.",
      publicTopics: ["Commercial fleets", "Connected services", "Electric vehicles"],
      sourceUrl: "https://www.ford.com/",
      imageUrls: []
    };
    const context = compileCampaignContext({
      brand: ford,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Ford Pro Intelligence",
        promotedOfferConfirmed: true,
        offerSourceUrl: "https://www.fordpro.com/en-us/intelligence/",
        offerSourceConfirmed: true,
        audience: "Fleet operations leaders evaluating Ford Pro Intelligence",
        objective: "Launch or announce"
      }
    });

    expect(context.brief.offerOrSource).toMatchObject({
      kind: "offer",
      name: "Ford Pro Intelligence",
      sourceHost: "fordpro.com",
      confirmationStatus: "confirmed"
    });
    expect(context.brief.messageSpine.recognizableContext).toContain("Ford Pro Intelligence");
    expect(context.brief.messageSpine.sellerPromise).toContain("Ford Pro Intelligence");
    expect(context.brief.messageSpine.sellerPromise).toContain("without adding unsupported product claims");
    expect(context.brief.messageSpine.whyNow).toContain("promoted offer");
    expect(context.brief.authority.content).toContain("public source");
    expect(JSON.stringify(context.brief)).not.toMatch(/software platform/i);
  });

  it("treats the content as message authority and the seller brand as design authority", () => {
    const resource = compileCampaignContext({
      brand: seller,
      useCase: "content",
      answers: { audience: "Application leaders", objective: "Educate buyers" },
      sourceContent: {
        sourceUrl: "https://example.com/guide",
        title: "The governed automation field guide",
        excerpt: "A framework for choosing, governing, and validating an automation path."
      }
    });
    const assessment = compileCampaignContext({
      brand: seller,
      useCase: "content",
      answers: {
        sourceName: "Integration readiness scorecard.pdf",
        sourceTitle: "Integration Readiness Assessment",
        audience: "Application leaders",
        objective: "Capture qualified demand"
      }
    });

    expect(resource.brief).toMatchObject({
      campaignRegister: "content-magic",
      sourceTitle: "The governed automation field guide",
      proofMode: "source-content"
    });
    expect(resource.brief.authority.content).toContain("The governed automation field guide");
    expect(resource.brief.authority.design).toContain(seller.sourceUrl);
    expect(resource.wireframe.name).toBe("content-resource-companion");
    expect(assessment.wireframe.name).toBe("content-assessment-workbench");
    expect(resource.wireframe).toMatchObject({
      experienceShape: "resource-companion",
      heroMode: "source-led",
      sectionSequence: CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence
    });
    expect(assessment.wireframe).toMatchObject({
      experienceShape: "assessment-workbench",
      heroMode: "source-led",
      sectionSequence: CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence
    });
    expect(resource.wireframe.labels).not.toEqual(assessment.wireframe.labels);
    expect(resource.wireframe.finalCtaPattern).not.toBe(assessment.wireframe.finalCtaPattern);
    expect(assessment.brief.sourceTitle).toBe("Integration Readiness Assessment");
  });

  it("keeps source topics separate from the seller category for unrelated content", () => {
    const context = compileCampaignContext({
      brand: seller,
      useCase: "content",
      answers: {
        sourceUrl: "https://example.org/elder-care-robots",
        audience: "Senior living operators",
        objective: "Increase content engagement"
      },
      sourceContent: {
        sourceUrl: "https://example.org/elder-care-robots",
        title: "How robots support elder care teams",
        description: "Care robots can help senior living teams with routine support while preserving human oversight.",
        excerpt:
          "Elder care teams are testing assistive robotics for routine delivery, resident support, and staff capacity. Human caregivers remain responsible for judgment and relationships."
      }
    });

    expect(context.brief.sourceGrounding).toMatchObject({
      kind: "public-url",
      confidence: "high",
      confirmationStatus: "confirmed"
    });
    expect(context.brief.sourceGrounding.topics.join(" ")).toMatch(/robots|elder care/i);
    expect(context.brief.offerOrSource).toMatchObject({
      kind: "source",
      name: "How robots support elder care teams",
      sourceHost: "example.org"
    });
    expect(context.brief.messageSpine.whyChange).toMatch(/robots|elder care/i);
    expect(context.brief.messageSpine.whyChange).not.toMatch(/integration|automation|API/i);
    expect(context.brief.seller).toMatchObject({
      domain: "jitterbit.com",
      name: "Jitterbit"
    });
    expect(context.brief.targetAccount).toBeNull();
  });

  it("falls back to mechanism-only proof and neutral design when no public evidence exists", () => {
    const sparse: BrandProfile = {
      ...seller,
      domain: "acme.test",
      companyName: "Acme",
      description: undefined,
      publicContext: undefined,
      publicTopics: [],
      imageUrls: [],
      source: "fallback"
    };
    const context = compileCampaignContext({
      brand: sparse,
      useCase: "campaign",
      answers: { campaignType: "demand", audience: "Operations leaders", objective: "Generate demand" }
    });

    expect(context.brief.proofMode).toBe("mechanism-only");
    expect(context.brief.messageSpine.proofPolicy).toMatch(/Do not invent logos, metrics, or outcomes/);
    expect(context.designContext.designRegister).toBe("neutral-fallback");
  });
});
