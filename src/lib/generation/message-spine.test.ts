import { describe, expect, it } from "vitest";

import { compileCampaignContext } from "@/lib/generation/campaign-context";
import {
  BUYER_FACING_NAVIGATION,
  containsBuyerFacingJargon,
  messageSpineCopyFailure,
  reviewMessageCompositionQuality,
  sanitizeBuyerFacingLabel
} from "@/lib/generation/message-spine";
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
      messageSpineCopyFailure(context.messageSpineV2, {
        ...valid,
        choices: ["Explore the offer", "Explore the offer", "Explore the offer"]
      })
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

  it("resolves one audience, promise, mechanism, proof plan, decision help, and next action per route", () => {
    const account = abm(cisco).messageSpineV2.composition;
    const campaign = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony API Management",
        audience: "Integration leaders",
        objective: "Launch a product"
      }
    }).messageSpineV2.composition;
    const content = compileCampaignContext({
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
        excerpt: "Assistive robots support routine work."
      }
    }).messageSpineV2.composition;

    for (const composition of [account, campaign, content]) {
      expect(composition.audience.length).toBeGreaterThan(3);
      expect(composition.promise.length).toBeGreaterThan(8);
      expect(composition.mechanism.length).toBeGreaterThan(8);
      expect(composition.proofPlan.length).toBeGreaterThan(8);
      expect(composition.decisionHelp.length).toBeGreaterThan(8);
      expect(composition.nextAction.length).toBeGreaterThan(3);
      expect(composition.buyerFacingLabels).toEqual([...BUYER_FACING_NAVIGATION[composition.family]]);
      expect(JSON.stringify(composition)).not.toMatch(
        /account thesis|decision (?:path|lens)|supporting proof|narrative arc|stakeholder map|buying committee/i
      );
    }

    expect(account).toMatchObject({ family: "account", contract: "account-named-opportunity" });
    expect(campaign).toMatchObject({ family: "campaign", contract: "campaign-offer-path" });
    expect(content).toMatchObject({ family: "content", contract: "content-source-companion" });
  });

  it("omits unsupported why-now instead of inventing urgency filler", () => {
    const spine = abm(cisco).messageSpineV2;
    expect(spine.composition.omittedSlots).toContain("whyNow");
    expect(spine.composition.whyNow).toBeUndefined();
  });

  it("fail-soft quality review sanitizes jargon and drops generic filler without blanking required slots", () => {
    const review = reviewMessageCompositionQuality({
      family: "account",
      contract: "account-named-opportunity",
      audience: "Security leaders",
      tension: "Make progress with confidence across the stack",
      promise: "Account thesis for the named opportunity",
      mechanism: "Governed integration workflow",
      proofPlan: "Supporting proof from public seller evidence",
      decisionHelp: "Choose one validation question",
      nextAction: "Plan the working session",
      whyNow: "Now more than ever teams must act",
      omittedSlots: [],
      buyerFacingLabels: BUYER_FACING_NAVIGATION.account
    });

    expect(review.status).toBe("soft-fail");
    expect(review.issues).toEqual(
      expect.arrayContaining(["buyer_facing_jargon", "generic_filler", "unsupported_why_now"])
    );
    expect(review.composition.whyNow).toBeUndefined();
    expect(review.composition.tension).toBeUndefined();
    expect(review.composition.promise).toBeTruthy();
    expect(review.composition.nextAction).toBe("Plan the working session");
    expect(containsBuyerFacingJargon(JSON.stringify(review.composition))).toBe(false);
  });

  it("replaces buyer-facing jargon with plain labels", () => {
    expect(sanitizeBuyerFacingLabel("Account thesis")).toBe("Overview");
    expect(sanitizeBuyerFacingLabel("Decision paths")).toBe("Where to start");
    expect(sanitizeBuyerFacingLabel("Supporting proof")).toBe("Evidence");
    expect(sanitizeBuyerFacingLabel("Why it matters")).toBe("Why it matters");
  });
});
