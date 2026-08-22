import { describe, expect, it } from "vitest";

import { compileCampaignContext } from "@/lib/generation/campaign-context";
import {
  BUYER_FACING_NAVIGATION,
  MESSAGE_FRAMEWORK_IDS,
  containsBuyerFacingJargon,
  messageSpineCopyFailure,
  rankMessageFrameworks,
  resolveMessageFramework,
  reviewMessageCompositionQuality,
  sanitizeBuyerFacingLabel
} from "@/lib/generation/message-spine";
import type { MessageFrameworkRankingInput } from "@/lib/generation/message-spine";
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

function frameworkInput(
  overrides: Partial<MessageFrameworkRankingInput> = {}
): MessageFrameworkRankingInput {
  return {
    motion: "demand",
    audience: "Business leaders",
    objective: "Build awareness",
    cta: "Explore the offer",
    offerMaturity: "unconfirmed",
    proofDensity: "sparse",
    contentVolume: "light",
    decisionComplexity: "low",
    ...overrides
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

  it("selects a bounded framework for every generic motion", () => {
    const scenarios: Array<
      [MessageFrameworkRankingInput, (typeof MESSAGE_FRAMEWORK_IDS)[number]]
    > = [
      [
        frameworkInput({
          motion: "account",
          objective: "Evaluate the fit",
          cta: "Book a meeting",
          offerMaturity: "emerging",
          proofDensity: "moderate",
          contentVolume: "standard",
          decisionComplexity: "high"
        }),
        "problem-change"
      ],
      [frameworkInput(), "outcome-mechanism"],
      [
        frameworkInput({
          motion: "product",
          objective: "Launch the product",
          offerMaturity: "confirmed",
          proofDensity: "moderate",
          contentVolume: "standard",
          decisionComplexity: "medium"
        }),
        "outcome-mechanism"
      ],
      [
        frameworkInput({
          motion: "event",
          objective: "Drive registrations",
          cta: "Register for the event"
        }),
        "event-value"
      ],
      [
        frameworkInput({
          motion: "content",
          objective: "Educate buyers",
          cta: "Read the guide",
          offerMaturity: "confirmed",
          proofDensity: "rich",
          contentVolume: "deep",
          decisionComplexity: "medium"
        }),
        "source-insight"
      ]
    ];

    for (const [input, expected] of scenarios) {
      const ranking = rankMessageFrameworks(input);
      expect(ranking.selected.id).toBe(expected);
      expect(ranking.alternatives).toHaveLength(MESSAGE_FRAMEWORK_IDS.length - 1);
      expect(ranking.selected.score).toBeGreaterThanOrEqual(ranking.alternatives[0]!.score);
      expect(ranking.basis).toBe("deterministic");
    }
  });

  it("adapts deterministically to sparse proof, rich proof, and technical audiences", () => {
    const sparse = rankMessageFrameworks(frameworkInput());
    expect(sparse.selected.id).toBe("outcome-mechanism");
    expect(sparse.selected.reasonCodes).toContain("proof_sparse");

    const proofRich = rankMessageFrameworks(
      frameworkInput({
        objective: "Generate demand",
        cta: "Contact sales",
        offerMaturity: "confirmed",
        proofDensity: "rich",
        contentVolume: "deep",
        decisionComplexity: "high"
      })
    );
    expect(proofRich.selected.id).toBe("proof-led-decision");
    expect(proofRich.selected.reasonCodes).toContain("proof_rich");

    const technical = rankMessageFrameworks(
      frameworkInput({
        motion: "product",
        audience: "Platform architects and integration engineers",
        objective: "Evaluate technical fit",
        cta: "Validate the architecture",
        offerMaturity: "confirmed",
        proofDensity: "rich",
        contentVolume: "deep",
        decisionComplexity: "high"
      })
    );
    expect(technical.selected.id).toBe("technical-validation");
    expect(technical.selected.reasonCodes).toContain("audience_technical");
  });

  it("uses library order as a stable score tie-breaker", () => {
    const input = frameworkInput({ motion: "product" });
    const first = rankMessageFrameworks(input);
    const second = rankMessageFrameworks(input);
    const technicalIndex = first.alternatives.findIndex(
      (framework) => framework.id === "technical-validation"
    );
    const proofIndex = first.alternatives.findIndex(
      (framework) => framework.id === "proof-led-decision"
    );

    expect(first).toEqual(second);
    expect(first.alternatives[technicalIndex]!.score).toBe(
      first.alternatives[proofIndex]!.score
    );
    expect(technicalIndex).toBeLessThan(proofIndex);
  });

  it("resolves all required slots for every framework and omits unsupported optional slots", () => {
    for (const frameworkId of MESSAGE_FRAMEWORK_IDS) {
      const resolution = resolveMessageFramework(frameworkId, {
        audience: "Operations leaders",
        promise: "Reduce manual handoffs across governed workflows.",
        mechanism: "Connect applications through governed integration workflows.",
        proofPolicy: "Use supported mechanism evidence only.",
        nextAction: "Plan a validation session",
        offerName: "Harmony"
      });

      expect(resolution.audience).toBeTruthy();
      expect(resolution.promise).toBeTruthy();
      expect(resolution.mechanism).toBeTruthy();
      expect(resolution.proofPlan).toBeTruthy();
      expect(resolution.decisionHelp).toBeTruthy();
      expect(resolution.nextAction).toBeTruthy();
      expect(resolution.tension).toBeUndefined();
      expect(resolution.whyNow).toBeUndefined();
    }
  });

  it("allows bounded model ranking to validate but not replace deterministic order", () => {
    const input = frameworkInput();
    const deterministic = rankMessageFrameworks(input);
    const modelOrder = [
      "source-insight",
      ...MESSAGE_FRAMEWORK_IDS.filter((id) => id !== "source-insight")
    ];
    const validated = rankMessageFrameworks(input, {
      selectedFrameworkId: "source-insight",
      orderedFrameworkIds: modelOrder
    });

    expect(validated.selected).toEqual(deterministic.selected);
    expect(validated.alternatives).toEqual(deterministic.alternatives);
    expect(validated.modelValidation).toEqual({
      status: "disagreed",
      reasonCode: "model_ranking_disagreed"
    });
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
      frameworkRanking: rankMessageFrameworks(
        frameworkInput({
          motion: "account",
          objective: "Evaluate the fit",
          decisionComplexity: "high"
        })
      ),
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
