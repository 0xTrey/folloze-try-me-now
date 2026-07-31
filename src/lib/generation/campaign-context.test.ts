import { describe, expect, it } from "vitest";

import { cleanSourceTitle, compileCampaignContext } from "@/lib/generation/campaign-context";
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
      sectionSequence: ["thesis", "decision-lenses", "guided-questions"]
    });
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

  it("gives demand, product, and event campaigns different conversion structures", () => {
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

    expect([demand.wireframe.name, product.wireframe.name, event.wireframe.name]).toEqual([
      "demand-generation-landing-page",
      "product-launch-landing-page",
      "event-awareness-follow-up"
    ]);
    expect(new Set([demand.wireframe.experienceShape, product.wireframe.experienceShape, event.wireframe.experienceShape]).size).toBe(3);
    expect(new Set([demand.wireframe.sectionSequence.join("|"), product.wireframe.sectionSequence.join("|"), event.wireframe.sectionSequence.join("|")]).size).toBe(3);
    expect([demand.brief.primaryAction, product.brief.primaryAction, event.brief.primaryAction]).toEqual([
      "Explore the offer",
      "Explore the first use case",
      "Continue the event conversation"
    ]);
    expect(event.brief.eventContext).toBe("Enterprise Automation Summit");
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
      thesis: "Why this session matters",
      lenses: "Choose your reason to attend",
      close: "Save your place"
    });
    expect(event.wireframe.finalCtaPattern).toMatch(/registration action/i);
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
    expect(assessment.brief.sourceTitle).toBe("Integration readiness scorecard");
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
