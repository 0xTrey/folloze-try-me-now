import { describe, expect, it } from "vitest";

import {
  applyPersonalizationVariant,
  assertArgumentNotNameOnly,
  availablePersonalizationVariantIds,
  compilePersonalizationPlan,
  personalizationRuntimePayload
} from "@/lib/generation/personalization-preview";
import { experienceTemplateFor } from "@/lib/generation/experience-renderers";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import type {
  AudienceRecommendation,
  BrandProfile,
  SessionEvidenceItem
} from "@/lib/types";

const seller: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Integration, automation, application development, and governed AI.",
  publicTopics: ["Integration", "Automation", "API management"],
  logoUrl: "https://jitterbit.com/logo.svg",
  imageUrls: ["https://jitterbit.com/platform.png", "https://jitterbit.com/workflow.png"],
  colors: ["#123B4A", "#F4512C"],
  primaryColor: "#123B4A",
  accentColor: "#F4512C",
  surfaceColor: "#FFFFFF",
  sourceUrl: "https://jitterbit.com/",
  source: "brand-harvester"
};

const target: BrandProfile = {
  ...seller,
  domain: "cisco.com",
  companyName: "Cisco",
  description: "Networking, security, and observability across hybrid infrastructure.",
  publicTopics: ["Networking", "Security", "Observability"],
  logoUrl: "https://cisco.com/logo.svg",
  imageUrls: ["https://cisco.com/network.png"],
  sourceUrl: "https://cisco.com/"
};

const draft: ExperienceDraft = {
  campaignRegister: "one-to-one-abm",
  designRegister: "source-brand-technical",
  wireframeName: "abm-account-microsite",
  experienceShape: "narrative-workflow",
  sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
  sectionLabels: {
    thesis: "Why now",
    lenses: "Decision lenses",
    journey: "Explore the path",
    close: "Next step"
  },
  title: "Jitterbit for Cisco",
  eyebrow: "Jitterbit for Cisco",
  headline: "Give connected infrastructure a governed automation layer.",
  subhead: "A focused path for infrastructure leaders evaluating how integration and automation work together.",
  thesisHeadline: "Move from disconnected workflows to an accountable operating model.",
  thesisBody: "Connect the integration, automation, and governance decisions that determine whether change scales safely.",
  primaryCta: "Plan the architecture session",
  audienceLabel: "Infrastructure platform leaders",
  narrativeArc: "Choose the decision that deserves the first working session.",
  sections: [
    {
      eyebrow: "Control",
      headline: "Govern the automation surface",
      body: "Make ownership and policy visible across connected systems and workflows.",
      proof: "Which policy boundary must stay consistent across the estate?"
    },
    {
      eyebrow: "Speed",
      headline: "Remove integration drag",
      body: "Give teams reusable patterns for the connections that slow delivery today.",
      proof: "Where does integration work repeatedly delay the roadmap?"
    },
    {
      eyebrow: "Scale",
      headline: "Turn reusable patterns into leverage",
      body: "Let platform teams standardize without becoming the bottleneck for every change.",
      proof: "Which teams need more autonomy without losing governance?"
    }
  ],
  signalLabels: ["Control", "Speed", "Scale"],
  closingHeadline: "Put the first architecture decision on the table.",
  closingBody: "Bring the platform, integration, and governance owners into one focused working session."
};

const evidenceItems: SessionEvidenceItem[] = [
  {
    id: "ev-networking",
    type: "public-positioning",
    label: "Hybrid networking priorities",
    text: "Cisco is expanding secure networking across hybrid infrastructure and observability programs.",
    sourceUrl: "https://cisco.com/networking",
    signals: ["hybrid infrastructure", "secure networking"],
    disposition: "available",
    entityRole: "target",
    confidence: "high"
  },
  {
    id: "ev-security",
    type: "public-operating-context",
    label: "Security operating context",
    text: "Security and observability remain central to how Cisco describes platform modernization.",
    sourceUrl: "https://cisco.com/security",
    signals: ["security", "observability"],
    disposition: "available",
    entityRole: "target",
    confidence: "high"
  }
];

const personas: AudienceRecommendation[] = [
  {
    id: "aud-platform",
    label: "Infrastructure platform leaders",
    rationale: "Platform owners need one validation question before expanding automation scope.",
    evidenceItemIds: ["ev-networking"],
    confidence: "high",
    source: "seller-target-synthesis",
    confirmationStatus: "confirmed",
    targetName: "Cisco",
    evidenceSummary: "Hybrid infrastructure networking priorities"
  },
  {
    id: "aud-security",
    label: "Security architecture owners",
    rationale: "Security owners need proof that governance stays intact across connected workflows.",
    evidenceItemIds: ["ev-security"],
    confidence: "high",
    source: "seller-target-synthesis",
    confirmationStatus: "confirmed",
    targetName: "Cisco",
    evidenceSummary: "Security and observability modernization"
  }
];

describe("personalization preview variants", () => {
  it("compiles generic, account, industry, and two persona states when evidence permits (U20)", () => {
    const plan = compilePersonalizationPlan({
      draft,
      seller,
      target,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure platform leaders",
        objective: "Align the buying group"
      },
      evidenceItems,
      audienceRecommendations: personas
    });

    expect(availablePersonalizationVariantIds(plan)).toEqual([
      "generic",
      "account",
      "account_industry",
      "account_industry_persona_a",
      "account_industry_persona_b"
    ]);
    expect(plan.defaultVariantId).toBe("account");
    for (const variant of plan.visibleVariants) {
      for (const [key, value] of Object.entries(variant.fields)) {
        expect(value?.sourceRefs.length).toBeGreaterThan(0);
        expect(["approved", "safe_public", "risky_reviewed"]).toContain(value?.classification);
        expect(value?.reason.length).toBeGreaterThan(8);
        expect(variant.omittedFields).not.toContain(key);
      }
      expect(variant.imageryTreatment).toBeTruthy();
    }
  });

  it("changes argument and proof emphasis beyond company-name substitution (U21)", () => {
    const plan = compilePersonalizationPlan({
      draft,
      seller,
      target,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure platform leaders",
        objective: "Align the buying group"
      },
      evidenceItems,
      audienceRecommendations: personas
    });

    const generic = applyPersonalizationVariant(draft, plan, "generic");
    const account = applyPersonalizationVariant(draft, plan, "account");
    const industry = applyPersonalizationVariant(draft, plan, "account_industry");
    const personaA = applyPersonalizationVariant(draft, plan, "account_industry_persona_a");
    const personaB = applyPersonalizationVariant(draft, plan, "account_industry_persona_b");

    expect(assertArgumentNotNameOnly(generic.headline, account.headline, ["Cisco", "Jitterbit"])).toBe(
      true
    );
    expect(account.thesisBody).not.toEqual(generic.thesisBody);
    expect(account.thesisHeadline).not.toEqual(generic.thesisHeadline);
    expect(account.primaryCta).not.toEqual(generic.primaryCta);
    expect(industry.headline.toLocaleLowerCase()).toContain("networking");
    expect(industry.primaryCta).not.toEqual(account.primaryCta);
    expect(personaA.audienceLabel).toBe("Infrastructure platform leaders");
    expect(personaB.audienceLabel).toBe("Security architecture owners");
    expect(personaA.headline).not.toEqual(personaB.headline);
    expect(personaA.primaryCta).not.toEqual(personaB.primaryCta);
    expect(personaA.thesisHeadline).not.toEqual(personaB.thesisHeadline);

    const runtime = personalizationRuntimePayload(plan);
    expect(runtime.variants.account.fields["hero.headline"]).toContain("Cisco");
    expect(runtime.variants.generic.fields["hero.headline"]).not.toContain("Cisco");
  });

  it("omits unsupported account variants and never invents persona B without a second role", () => {
    const thin = compilePersonalizationPlan({
      draft,
      seller,
      useCase: "campaign",
      answers: {
        audience: "Marketing leaders",
        objective: "Explore the offer",
        promotedOffer: "Launch briefing"
      }
    });
    expect(availablePersonalizationVariantIds(thin)).toEqual(["generic"]);
    expect(thin.visibleVariants[0]?.omittedFields).not.toContain("headline");

    const onePersona = compilePersonalizationPlan({
      draft,
      seller,
      target,
      useCase: "abm",
      answers: { targetDomain: "cisco.com", audience: "Infrastructure platform leaders" },
      evidenceItems,
      audienceRecommendations: [personas[0]]
    });
    expect(availablePersonalizationVariantIds(onePersona)).toEqual([
      "generic",
      "account",
      "account_industry",
      "account_industry_persona_a"
    ]);
    expect(availablePersonalizationVariantIds(onePersona)).not.toContain(
      "account_industry_persona_b"
    );
  });

  it("keeps buyer-facing navigation free of strategy jargon in account composition fallbacks", () => {
    const template = experienceTemplateFor({
      campaignRegister: "one-to-one-abm",
      wireframeName: "abm-account-microsite"
    });
    expect(JSON.stringify(template.navigation)).not.toMatch(
      /Account thesis|Decision paths|Supporting proof/i
    );
    expect(template.navigation.thesis).toBe("Why it matters");
    expect(template.navigation.lenses).toBe("Where to start");
    expect(template.navigation.resources).toBe("Evidence");
  });

  it("does not leak fields across variant applications", () => {
    const plan = compilePersonalizationPlan({
      draft,
      seller,
      target,
      useCase: "abm",
      answers: { targetDomain: "cisco.com", audience: "Infrastructure platform leaders" },
      evidenceItems,
      audienceRecommendations: personas
    });
    const account = applyPersonalizationVariant(draft, plan, "account");
    const genericAgain = applyPersonalizationVariant(draft, plan, "generic");
    expect(genericAgain.headline).not.toEqual(account.headline);
    expect(genericAgain.headline).toEqual(
      applyPersonalizationVariant(draft, plan, "generic").headline
    );
  });

  it("renders personalized HTML with runtime switching without regenerating", () => {
    const plan = compilePersonalizationPlan({
      draft,
      seller,
      target,
      useCase: "abm",
      answers: { targetDomain: "cisco.com", audience: "Infrastructure platform leaders" },
      evidenceItems,
      audienceRecommendations: personas
    });
    const html = renderExperienceHtml({
      draft,
      brand: seller,
      targetBrand: target,
      useCase: "abm",
      answers: { targetDomain: "cisco.com", audience: "Infrastructure platform leaders" },
      personalization: plan,
      personalizationVariantId: "account"
    });
    expect(html).toContain('data-personalization-variant="account"');
    expect(html).toContain("data-imagery-treatment=");
    expect(html).toContain("window.flzApplyPersonalizationVariant");
    expect(html).toContain("set_personalization_variant");
    const accountHeadline = plan.visibleVariants.find((v) => v.variantId === "account")!.fields.headline!.value;
    expect(html).toContain("data-flz-block-id=\"hero.headline\"");
    expect(html).toContain("Connect Cisco");
    expect(html).toContain("governed Integration path");
    const genericHtml = renderExperienceHtml({
      draft,
      brand: seller,
      targetBrand: target,
      useCase: "abm",
      answers: { targetDomain: "cisco.com" },
      personalization: plan,
      personalizationVariantId: "generic"
    });
    expect(genericHtml).toContain('data-personalization-variant="generic"');
    expect(genericHtml).toContain("Make Integration decisions");
    expect(genericHtml.match(/data-flz-block-id="hero.headline"[^>]*>([^<]+)</)?.[1]).not.toContain(
      accountHeadline.slice(0, 20)
    );
  });
});
