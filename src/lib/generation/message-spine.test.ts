import { describe, expect, it } from "vitest";

import { compileCampaignContext } from "@/lib/generation/campaign-context";
import { messageSpineCopyFailure } from "@/lib/generation/message-spine";
import type { BrandProfile } from "@/lib/types";

const seller: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Enterprise integration, API management, and workflow automation.",
  publicContext: "Harmony connects integration, orchestration, applications, and governed AI.",
  publicTopics: ["Integration", "Workflow automation", "API management"],
  imageUrls: [],
  colors: ["#1B3E51", "#F44414", "#FFFFFF"],
  primaryColor: "#1B3E51",
  accentColor: "#F44414",
  surfaceColor: "#FFFFFF",
  sourceUrl: "https://jitterbit.com",
  source: "brand-harvester"
};

const cisco: BrandProfile = {
  ...seller,
  domain: "cisco.com",
  companyName: "Cisco",
  description: "Networking, security, collaboration, and observability technology.",
  publicContext: "Cisco operates across enterprise infrastructure, security, and applications.",
  publicTopics: ["Networking", "Security", "Infrastructure", "Observability"],
  sourceUrl: "https://cisco.com"
};

const workday: BrandProfile = {
  ...seller,
  domain: "workday.com",
  companyName: "Workday",
  description: "Human capital and financial management software.",
  publicContext: "Workday supports workforce, finance, analytics, and planning decisions.",
  publicTopics: ["Workforce", "Finance", "Analytics", "Planning"],
  sourceUrl: "https://workday.com"
};

function abm(target: BrandProfile) {
  return compileCampaignContext({
    brand: seller,
    targetBrand: target,
    useCase: "abm",
    answers: {
      targetDomain: target.domain,
      audience: "Infrastructure and security leaders",
      objective: "Book a meeting"
    }
  });
}

function candidateFor(context: ReturnType<typeof abm>) {
  const spine = context.messageSpineV2;
  const targetTerm = spine.editorial.specificityTerms[0] ?? spine.entities.offer.name;
  return {
    hero: `${spine.entities.offer.name} for ${targetTerm} leaders`,
    mechanism: `${spine.entities.offer.name} applies ${spine.proposition.sellerMechanism}`,
    choices: [
      `Map the ${targetTerm} workflow`,
      "Validate the first operating boundary",
      "Plan a shared next decision"
    ] as [string, string, string],
    cta: "Plan the working session",
    evidenceIdsByUse: { hero: ["seller.mechanism", "target.1"], mechanism: ["seller.mechanism"] }
  };
}

describe("MessageSpineV2", () => {
  it("makes a target swap change the evidence, angle, and specificity terms", () => {
    const ciscoSpine = abm(cisco).messageSpineV2;
    const workdaySpine = abm(workday).messageSpineV2;

    expect(ciscoSpine.entities.target).toEqual({ name: "Cisco" });
    expect(workdaySpine.entities.target).toEqual({ name: "Workday" });
    expect(ciscoSpine.evidence.filter((item) => item.sourceType === "target").map((item) => item.claim).join(" "))
      .toMatch(/networking|security|infrastructure/i);
    expect(workdaySpine.evidence.filter((item) => item.sourceType === "target").map((item) => item.claim).join(" "))
      .toMatch(/workforce|finance|analytics/i);
    expect(ciscoSpine.editorial.specificityTerms).not.toEqual(workdaySpine.editorial.specificityTerms);
  });

  it("keeps an offer source first-class and changes the message spine when it changes", () => {
    const first = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony API Management",
        offerSourceUrl: "https://jitterbit.com/api-management",
        audience: "Integration leaders",
        objective: "Launch a product"
      }
    });
    const second = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony iPaaS",
        offerSourceUrl: "https://jitterbit.com/ipaas",
        audience: "Integration leaders",
        objective: "Launch a product"
      }
    });

    expect(first.messageSpineV2.entities.offer).toMatchObject({
      name: "Harmony API Management",
      authority: "visitor"
    });
    expect(second.messageSpineV2.entities.offer.name).toBe("Harmony iPaaS");
    expect(first.messageSpineV2.proposition.buyerJob).not.toBe(second.messageSpineV2.proposition.buyerJob);
  });

  it("prevents low-confidence evidence from being used as a declarative hero", () => {
    const context = abm(cisco);
    const spine = structuredClone(context.messageSpineV2);
    spine.evidence[0]!.confidence = "low";
    spine.editorial.prohibitedDeclarativeEvidenceIds = [spine.evidence[0]!.id];
    const candidate = candidateFor(context);
    candidate.evidenceIdsByUse.hero = [spine.evidence[0]!.id];

    expect(messageSpineCopyFailure(spine, candidate)).toBe("message_spine_low_confidence_declarative");
  });

  it("rejects generic copy, duplicated choices, missing mechanism, and bare CTA copy", () => {
    const context = abm(cisco);
    const valid = candidateFor(context);
    expect(messageSpineCopyFailure(context.messageSpineV2, valid)).toBeUndefined();

    expect(
      messageSpineCopyFailure(context.messageSpineV2, { ...valid, hero: "Make progress with confidence" })
    ).toBe("message_spine_generic_hero");
    expect(
      messageSpineCopyFailure(context.messageSpineV2, { ...valid, choices: ["Explore the offer", "Explore the offer", "Explore the offer"] })
    ).toBe("message_spine_repeated_choice");
    expect(
      messageSpineCopyFailure(context.messageSpineV2, { ...valid, mechanism: "A better way to move forward" })
    ).toBe("message_spine_offer_or_mechanism_missing");
    expect(messageSpineCopyFailure(context.messageSpineV2, { ...valid, cta: "Explore" })).toBe(
      "message_spine_cta_missing_deliverable"
    );
  });

  it("keeps source-led content authority separate from seller-category copy", () => {
    const context = compileCampaignContext({
      brand: seller,
      useCase: "content",
      answers: {
        sourceUrl: "https://carelab.example/elder-care-robots",
        audience: "Senior living operators",
        objective: "Increase content engagement"
      },
      sourceContent: {
        sourceUrl: "https://carelab.example/elder-care-robots",
        title: "How robots support elder care teams",
        description: "Care robots support routine work while human caregivers retain judgment and relationships.",
        excerpt: "Senior living teams are testing assistive robotics for routine delivery and staff capacity."
      }
    });

    expect(context.messageSpineV2.entities.offer).toMatchObject({
      name: "How robots support elder care teams",
      authority: "public-source"
    });
    expect(context.messageSpineV2.proposition.supportedChange).toMatch(/robots|elder care/i);
    expect(context.messageSpineV2.proposition.supportedChange).not.toMatch(/integration|API/i);
  });
});
