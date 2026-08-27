import type { Page } from "@playwright/test";

import type { AssetRenderPlan } from "../../src/lib/asset-allocation";

import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type { PersuasionFramework } from "../../src/lib/generation/experience-schema";
import type { GenericProductionPage } from "../../src/lib/generation/generic-production-engine";
import { applyProductionPageToDraft } from "../../src/lib/generation/production-draft-adapter";
import { compileSessionProductionPage } from "../../src/lib/generation/session-production-engine";
import type { WireframeFamilyV2 } from "../../src/lib/generation/three-family-contract";
import type {
  BrandProfile,
  PublicTryMeSession,
  SessionEvidenceItem,
  TryMeSession
} from "../../src/lib/types";
import {
  compileBrandSemantics,
  type BrandDensityCharacter,
  type BrandSemanticSystem
} from "../../src/lib/brand-semantics";
import type { BrandArchetypeFixture } from "../fixtures/brand-fidelity/archetypes";
import { experienceDraft } from "./generated-experience-fixture";

export const runtimeAssetOrigin = "https://runtime-first-party.test";
const now = "2026-08-23T13:00:00.000Z";

function runtimeFramework(fixture: RuntimeVisualFixture): PersuasionFramework {
  const evidenceId = `${fixture.id}.official`;
  const imageBrief = (
    purpose: string
  ): PersuasionFramework["opening"]["imageBrief"] => ({
    purpose,
    assetType: "product-ui",
    source: "seller",
    caption: `${fixture.brand.companyName} ${fixture.expectedOfferOrPriority}`,
    provenance: "Deterministic seller-official fixture asset"
  });
  const choiceLabels = fixture.expectedFamily === "launch"
    ? ["Unify the workflow", "Reduce handoff friction", "Validate adoption"]
    : fixture.expectedFamily === "guide"
      ? ["Enrollment", "Identity", "Application distribution"]
      : ["Dispatch consistency", "Technician capacity", "Validation scope"];
  return {
    strategy: {
      evidenceMap: [
        {
          id: evidenceId,
          kind: "seller-fact",
          claim: `${fixture.expectedOfferOrPriority} is supported by seller-official fixture evidence.`,
          sourceUrl: fixture.brand.sourceUrl
        },
        {
          id: `${fixture.id}.buyer`,
          kind: "visitor-input",
          claim: `${fixture.expectedPersona} are the confirmed audience.`,
          sourceUrl: null
        }
      ],
      messageSpine: `Connect ${fixture.expectedPersona} to ${fixture.expectedOfferOrPriority}.`,
      selectedAngle: "differentiated-mechanism",
      angleRationale: "The mechanism and next action are supported by current-revision evidence."
    },
    opening: {
      eyebrow: fixture.brand.companyName,
      headline: `${fixture.expectedOfferOrPriority} for ${fixture.expectedPersona}.`,
      body: `See how ${fixture.expectedPersona} can evaluate ${fixture.expectedOfferOrPriority}.`,
      ctaLabel: "Continue",
      evidenceIds: [evidenceId],
      imageBrief: imageBrief("Show the seller product interface behind the opening claim")
    },
    credibility: {
      eyebrow: "Official evidence",
      headline: `What ${fixture.brand.companyName} supports today.`,
      fact: fixture.brand.description ?? fixture.brand.title ?? fixture.brand.companyName,
      implication: `Use this evidence to evaluate ${fixture.expectedOfferOrPriority}.`,
      evidenceIds: [evidenceId],
      imageBrief: imageBrief("Show the seller capability connected to the evidence")
    },
    urgency: {
      eyebrow: "What changed",
      headline: `Why ${fixture.expectedPersona} are evaluating this now.`,
      change: fixture.brand.publicContext ?? "The confirmed priority requires evaluation.",
      consequence: "Disconnected work creates avoidable handoffs and unclear ownership.",
      reframe: "Start with one observable priority and a supported validation question.",
      evidenceIds: [evidenceId, `${fixture.id}.buyer`],
      imageBrief: imageBrief("Show the current operating context")
    },
    startingPoints: {
      eyebrow: "Evaluation paths",
      headline: `Three concrete ways to examine ${fixture.expectedOfferOrPriority}.`,
      intro: "Each path connects a buyer job to an observable validation question.",
      choices: choiceLabels.map((label) => ({
        label,
        buyerJob: `${fixture.expectedPersona} can examine ${label.toLocaleLowerCase()}.`,
        outcome: `A supported view of ${label.toLocaleLowerCase()}.`,
        validationQuestion: `What evidence would validate ${label.toLocaleLowerCase()}?`,
        evidenceIds: [evidenceId, `${fixture.id}.buyer`],
        imageBrief: imageBrief(`Support the ${label.toLocaleLowerCase()} evaluation path`)
      })) as PersuasionFramework["startingPoints"]["choices"]
    },
    mechanism: {
      eyebrow: "How it works",
      headline: `Move from ${fixture.expectedOfferOrPriority} to observable evidence.`,
      intro: "Pair each buyer action with a supported capability and inspectable result.",
      steps: [
        {
          action: "Frame the priority",
          capability: "Name the confirmed audience, scope, and current constraint.",
          output: "A shared starting point.",
          evidenceIds: [`${fixture.id}.buyer`]
        },
        {
          action: "Map the capability",
          capability: `Connect the priority to supported ${fixture.brand.companyName} evidence.`,
          output: "A concrete mechanism to examine.",
          evidenceIds: [evidenceId]
        },
        {
          action: "Validate the result",
          capability: "Inspect the evidence with the accountable stakeholders.",
          output: "A bounded next decision.",
          evidenceIds: [evidenceId, `${fixture.id}.buyer`]
        }
      ],
      imageBrief: imageBrief("Show the product workflow from priority to validation")
    },
    teamValue: {
      eyebrow: "Stakeholder value",
      headline: `Give ${fixture.expectedPersona} a shared validation plan.`,
      intro: "Keep decisions, risks, benefits, and required evidence visible.",
      roles: ["Business owner", "Technical owner", "Program owner"].map((role) => ({
        role,
        decision: `What must the ${role.toLocaleLowerCase()} validate?`,
        risk: "Unverified assumptions can widen scope before evidence is available.",
        benefit: "A concrete review keeps ownership and evidence visible.",
        evidenceNeeded: "Seller-official capability evidence and a confirmed buyer priority.",
        evidenceIds: [evidenceId, `${fixture.id}.buyer`]
      })) as PersuasionFramework["teamValue"]["roles"]
    },
    nextStep: {
      eyebrow: "Next move",
      headline: `Validate ${fixture.expectedOfferOrPriority} with the right owners.`,
      body: `Bring ${fixture.expectedPersona} together around one supported priority and the evidence needed for a next decision.`,
      scope: fixture.expectedOfferOrPriority,
      activity: "A focused working session",
      deliverable: "A validation plan",
      resultingDecision: "Whether and where to proceed",
      ctaLabel: "Plan a working session",
      evidenceIds: [evidenceId, `${fixture.id}.buyer`],
      imageBrief: imageBrief("Show the concrete output of the working session")
    }
  };
}

type BrandFixtureInput = {
  id: string;
  domain: string;
  companyName: string;
  title: string;
  description: string;
  publicContext: string;
  publicTopics: string[];
  primaryColor: string;
  accentColor: string;
  buttonColor: string;
  radius: number;
  density: number;
  motif?: "none" | "soft-gradient" | "radial-glow" | "technical-grid";
  logo?: boolean;
  cardRadius?: number;
  cardBorderWidth?: number;
  shadow?: "none" | "soft" | "strong";
  displayFont?: string;
  bodyFont?: string;
  headingWeight?: number;
  images?: number;
};

function brandFixture(input: BrandFixtureInput): BrandProfile {
  const logoUrl = input.logo === false
    ? undefined
    : `${runtimeAssetOrigin}/${input.id}-logo.svg`;
  return {
    domain: input.domain,
    canonicalDomain: input.domain,
    domainAliases: [],
    companyName: input.companyName,
    title: input.title,
    description: input.description,
    publicContext: input.publicContext,
    publicTopics: input.publicTopics,
    ...(logoUrl ? { logoUrl, logoSourceUrl: logoUrl } : {}),
    imageUrls: input.logo === false
      ? []
      : ["product-ui", "workflow", "outcome"]
          .slice(0, input.images ?? 2)
          .map((name) => `${runtimeAssetOrigin}/${input.id}-${name}.svg`),
    colors: [input.primaryColor, input.accentColor, "#FFFFFF", input.buttonColor],
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    surfaceColor: "#FFFFFF",
    displayFontFamily: input.displayFont ?? "Inter",
    bodyFontFamily: input.bodyFont ?? "Inter",
    sourceUrl: `https://${input.domain}/`,
    source: input.logo === false ? "fast-extractor" : "brand-harvester",
    identity: {
      expectedDomain: input.domain,
      canonicalDomain: input.domain,
      canonicalName: input.companyName,
      confidence: "high",
      confirmationStatus: "confirmed",
      confirmedBy: "system",
      reasons: [],
      provenance: []
    },
    designDna: {
      version: 1,
      source: "remote-harvester",
      confidence: "high",
      theme: { hero: "light", motif: input.motif ?? "none" },
      typography: {
        fallback: "sans",
        headingWeight: input.headingWeight ?? 700,
        bodyWeight: 400,
        headingLetterSpacingEm: -0.02
      },
      buttons: {
        primaryBackground: input.buttonColor,
        radiusPx: input.radius,
        heightPx: 46,
        borderWidthPx: 0
      },
      cards: {
        radiusPx: input.cardRadius ?? input.radius,
        borderWidthPx: input.cardBorderWidth ?? 1,
        shadow: input.shadow ?? (input.radius > 4 ? "soft" : "none")
      },
      spacing: {
        contentMaxWidthPx: 1180,
        sectionBlockPx: input.density,
        gridGapPx: 24
      }
    },
    diagnostics: {
      logo: {
        strategy: input.logo === false ? "none" : "official-remote-portable",
        imageCandidateCount: input.logo === false ? 0 : 1,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0,
        resolutionComplete: true
      },
      palette: {
        strategy: "semantic-tokens",
        confidence: "high",
        candidateCount: 4,
        semanticCandidateCount: 4,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    }
  };
}

function evidence(
  id: string,
  entityRole: "seller" | "target",
  text: string,
  sourceUrl: string,
  signals: string[]
): SessionEvidenceItem {
  return {
    id,
    type: "public-focus-area",
    label: signals[0] ?? "Official focus area",
    text,
    sourceUrl,
    signals,
    disposition: "available",
    entityRole
  };
}

function sessionFixture(input: {
  id: string;
  useCase: TryMeSession["useCase"];
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  answers: TryMeSession["answers"];
  evidenceItems: SessionEvidenceItem[];
}): TryMeSession {
  return {
    id: input.id,
    editorTokenHash: `fixture-${input.id}`,
    useCase: input.useCase,
    companyDomain: input.brand.domain,
    status: "generating",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: `https://preview.test/e/${input.id}`,
    revision: 11,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "complete", completedAt: now },
      story: { status: "running", startedAt: now }
    },
    answers: input.answers,
    brand: input.brand,
    targetBrand: input.targetBrand,
    audienceSuggestions: [],
    audienceRecommendations: [],
    evidenceItems: input.evidenceItems,
    events: []
  };
}

export type RuntimeVisualFixture = {
  id: string;
  expectedFamily: WireframeFamilyV2;
  expectedSubtype: "product" | "solution" | "account";
  expectedPersona: string;
  expectedOfferOrPriority: string;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  session: TryMeSession;
};

const adp = brandFixture({
  id: "adp",
  domain: "adp.com",
  companyName: "ADP",
  title: "ADP Workforce Now",
  description: "ADP provides payroll, HR, talent, time, and workforce management services.",
  publicContext: "Workforce operations teams coordinate payroll, time, talent, and HR administration.",
  publicTopics: ["Payroll operations", "Workforce management", "HR administration"],
  primaryColor: "#202428",
  accentColor: "#ED1C2E",
  buttonColor: "#C21728",
  radius: 4,
  density: 72
});

const apple = brandFixture({
  id: "apple",
  domain: "apple.com",
  companyName: "Apple",
  title: "Apple Platform Deployment",
  description: "Apple publishes deployment guidance for enterprise device and identity teams.",
  publicContext: "Enterprise teams evaluate secure enrollment, identity, app distribution, and device operations.",
  publicTopics: ["Automated Device Enrollment", "Managed Apple Accounts", "Enterprise deployment"],
  primaryColor: "#1D1D1F",
  accentColor: "#0071E3",
  buttonColor: "#0071E3",
  radius: 20,
  density: 120
});

const serviceTitan = brandFixture({
  id: "servicetitan",
  domain: "servicetitan.com",
  companyName: "ServiceTitan",
  title: "ServiceTitan Operations Platform",
  description: "ServiceTitan provides software for commercial and residential trade businesses.",
  publicContext: "Field service leaders coordinate dispatch, technicians, customer communications, and revenue operations.",
  publicTopics: ["Dispatch operations", "Technician workflows", "Field service management"],
  primaryColor: "#040404",
  accentColor: "#0265DC",
  buttonColor: "#0265DC",
  radius: 6,
  density: 88,
  motif: "technical-grid"
});

const apex = brandFixture({
  id: "apex",
  domain: "apexhomeservices.example",
  companyName: "Apex Home Services",
  title: "Apex Home Services",
  description: "Apex coordinates residential service dispatch and technician operations.",
  publicContext: "Apex is evaluating dispatch consistency and technician capacity across service territories.",
  publicTopics: ["Dispatch consistency", "Technician capacity", "Service territory operations"],
  primaryColor: "#18324A",
  accentColor: "#D97706",
  buttonColor: "#18324A",
  radius: 8,
  density: 88
});

export const runtimeVisualFixtures: RuntimeVisualFixture[] = [
  {
    id: "adp-launch",
    expectedFamily: "launch",
    expectedSubtype: "product",
    expectedPersona: "Payroll and HR operations leaders",
    expectedOfferOrPriority: "ADP Workforce Now",
    brand: adp,
    session: sessionFixture({
      id: "runtime-adp-launch",
      useCase: "campaign",
      brand: adp,
      answers: {
        campaignType: "product",
        promotedOffer: "ADP Workforce Now",
        promotedOfferConfirmed: true,
        audience: "Payroll and HR operations leaders",
        objective: "Evaluate a unified payroll and workforce operating model",
        ctaType: "contact-sales",
        ctaStyle: "solid"
      },
      evidenceItems: [
        evidence(
          "adp-payroll-operations",
          "seller",
          "ADP Workforce Now brings payroll, HR, time, talent, and benefits administration into one workforce platform.",
          "https://adp.com/what-we-offer/products/adp-workforce-now",
          ["Payroll operations", "Workforce platform"]
        ),
        evidence(
          "adp-workforce-management",
          "seller",
          "Workforce management evidence covers time, attendance, scheduling, and labor visibility.",
          "https://adp.com/what-we-offer/time-and-attendance",
          ["Workforce management", "Time and attendance"]
        )
      ]
    })
  },
  {
    id: "apple-guide",
    expectedFamily: "guide",
    expectedSubtype: "solution",
    expectedPersona: "Enterprise mobility architects",
    expectedOfferOrPriority: "Apple Platform Deployment",
    brand: apple,
    session: sessionFixture({
      id: "runtime-apple-guide",
      useCase: "campaign",
      brand: apple,
      answers: {
        promotedOffer: "Apple Platform Deployment",
        promotedOfferConfirmed: true,
        audience: "Enterprise mobility architects",
        objective: "Evaluate secure enrollment, identity, and application distribution",
        sourceUrl: "https://support.apple.com/guide/deployment/welcome/web",
        sourceTitle: "Apple Platform Deployment",
        sourceConfirmed: true,
        ctaType: "download",
        ctaStyle: "solid"
      },
      evidenceItems: [
        evidence(
          "apple-enrollment",
          "seller",
          "Apple deployment guidance covers automated enrollment and device supervision.",
          "https://support.apple.com/guide/deployment/automated-device-enrollment",
          ["Automated Device Enrollment", "Device supervision"]
        ),
        evidence(
          "apple-managed-identity",
          "seller",
          "Managed Apple Accounts connect organizational identity with managed services.",
          "https://support.apple.com/guide/deployment/managed-apple-accounts",
          ["Managed Apple Accounts", "Enterprise identity"]
        )
      ]
    })
  },
  {
    id: "servicetitan-align",
    expectedFamily: "align",
    expectedSubtype: "account",
    expectedPersona: "Field service operations leaders",
    expectedOfferOrPriority: "dispatch consistency",
    brand: serviceTitan,
    targetBrand: apex,
    session: sessionFixture({
      id: "runtime-servicetitan-align",
      useCase: "abm",
      brand: serviceTitan,
      targetBrand: apex,
      answers: {
        targetDomain: apex.domain,
        targetConfirmed: true,
        promotedOffer: "ServiceTitan Operations Platform",
        promotedOfferConfirmed: true,
        audience: "Field service operations leaders",
        objective: "Validate dispatch consistency and technician capacity priorities",
        messageBelief: "Choose the dispatch workflow to validate first",
        ctaType: "book-meeting",
        ctaStyle: "solid"
      },
      evidenceItems: [
        evidence(
          "apex-dispatch-priority",
          "target",
          "Apex is evaluating dispatch consistency across service territories.",
          "https://apexhomeservices.example/operations",
          ["Dispatch consistency", "Service territories"]
        ),
        evidence(
          "apex-technician-capacity",
          "target",
          "Apex is evaluating technician capacity and schedule utilization.",
          "https://apexhomeservices.example/operations",
          ["Technician capacity", "Schedule utilization"]
        )
      ]
    })
  }
];

/** Section spacing implied by a compiled density character. */
const DENSITY_BLOCK_PX: Record<BrandDensityCharacter, number> = {
  open: 120,
  balanced: 88,
  dense: 64
};

const ARCHETYPE_MOTIONS: Record<
  WireframeFamilyV2,
  { useCase: TryMeSession["useCase"]; persona: string; offer: string; objective: string }
> = {
  launch: {
    useCase: "campaign",
    persona: "Operations leaders",
    offer: "the evaluated platform",
    objective: "Evaluate a unified operating model"
  },
  guide: {
    useCase: "campaign",
    persona: "Enterprise architects",
    offer: "the deployment guide",
    objective: "Evaluate enrollment, identity, and distribution"
  },
  align: {
    useCase: "abm",
    persona: "Field operations leaders",
    offer: "dispatch consistency",
    objective: "Validate the account priority and next step"
  }
};

/**
 * Builds a runtime fixture whose visual identity is the compiled output of a
 * brand archetype rather than a named company.
 *
 * The rendered page can then be measured against `semantics`, which is what
 * the compiler actually decided, so a DOM assertion is comparing the page to
 * the decision that produced it instead of to a hardcoded expectation.
 */
export function archetypeRuntimeFixture(
  archetype: BrandArchetypeFixture,
  family: WireframeFamilyV2
): RuntimeVisualFixture & { semantics: BrandSemanticSystem } {
  const semantics = compileBrandSemantics(archetype.evidence);
  const motion = ARCHETYPE_MOTIONS[family];
  const id = `${archetype.id}-${family}`;
  const domain = `${archetype.id}.example`;
  // A logo-only brand still has a verified logo; what it lacks is supporting
  // imagery, geometry, and type. Removing the logo would test brand-help
  // instead of the sparse-evidence render this fixture exists for.
  const hasImagery = archetype.id !== "sparse-logo-only";
  const brand = brandFixture({
    id,
    domain,
    companyName: "Archetype Company",
    title: `Archetype Company ${family} experience`,
    description: "Archetype Company operates a governed workflow platform.",
    publicContext: `${motion.persona} coordinate governed workflow operations across teams.`,
    publicTopics: ["Workflow operations", "Governed automation"],
    primaryColor: semantics.colors.text.value,
    accentColor: semantics.colors.accent.value,
    buttonColor: semantics.colors.ctaBackground.value,
    radius: semantics.geometry.buttonRadius.value,
    cardRadius: semantics.geometry.cardRadius.value,
    cardBorderWidth: semantics.geometry.borderWidth.value,
    shadow:
      semantics.geometry.shadowCharacter.value === "elevated"
        ? "strong"
        : semantics.geometry.shadowCharacter.value === "none"
          ? "none"
          : "soft",
    density: DENSITY_BLOCK_PX[semantics.geometry.density.value],
    displayFont: semantics.typography.headingFont.value,
    bodyFont: semantics.typography.bodyFont.value,
    headingWeight: semantics.typography.weightCharacter.value === "bold" ? 700 : 500,
    images: hasImagery ? 3 : 0
  });
  const targetBrand = family === "align"
    ? brandFixture({
        id: `${id}-target`,
        domain: `${archetype.id}-target.example`,
        companyName: "Target Company",
        title: "Target Company Operations",
        description: "Target Company coordinates distributed service operations.",
        publicContext: "Target Company is evaluating dispatch consistency across territories.",
        publicTopics: ["Dispatch consistency", "Territory operations"],
        primaryColor: semantics.colors.text.value,
        accentColor: semantics.colors.accent.value,
        buttonColor: semantics.colors.ctaBackground.value,
        radius: semantics.geometry.buttonRadius.value,
        density: DENSITY_BLOCK_PX[semantics.geometry.density.value],
        images: 0
      })
    : undefined;

  return {
    id,
    expectedFamily: family,
    expectedSubtype: family === "launch" ? "product" : family === "guide" ? "solution" : "account",
    expectedPersona: motion.persona,
    expectedOfferOrPriority: motion.offer,
    brand,
    ...(targetBrand ? { targetBrand } : {}),
    semantics,
    session: sessionFixture({
      id: `runtime-${id}`,
      useCase: motion.useCase,
      brand,
      ...(targetBrand ? { targetBrand } : {}),
      answers: {
        ...(family === "align"
          ? { targetDomain: targetBrand!.domain, targetConfirmed: true }
          : {}),
        ...(family === "launch" ? { campaignType: "product" as const } : {}),
        ...(family === "guide"
          ? {
              sourceUrl: `https://${domain}/guide`,
              sourceTitle: "Deployment guide",
              sourceConfirmed: true
            }
          : {}),
        promotedOffer: motion.offer,
        promotedOfferConfirmed: true,
        audience: motion.persona,
        objective: motion.objective,
        ...(family === "align"
          ? { messageBelief: "Choose the workflow to validate first" }
          : {}),
        ctaType: family === "guide" ? "download" : family === "launch" ? "contact-sales" : "book-meeting",
        ctaStyle: "solid"
      },
      evidenceItems: [
        evidence(
          `${id}-capability`,
          "seller",
          "Governed workflow steps route approvals to the accountable owner.",
          `https://${domain}/platform`,
          ["Workflow operations", "Approval routing"]
        ),
        evidence(
          `${id}-context`,
          family === "align" ? "target" : "seller",
          "Distributed teams coordinate the same operating steps across regions.",
          `https://${domain}/operations`,
          ["Distributed operations", "Coordination"]
        )
      ]
    })
  };
}

export async function compileRuntimeVisualFixture(fixture: RuntimeVisualFixture): Promise<{
  page: GenericProductionPage;
  html: string;
  assetPlan?: AssetRenderPlan;
}> {
  const result = await compileSessionProductionPage({
    session: fixture.session,
    brand: fixture.brand,
    targetBrand: fixture.targetBrand,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000
  });
  if (result.outcome !== "production-page" || !result.artifact.value) {
    throw new Error(`Runtime fixture ${fixture.id} did not produce a page: ${result.outcome}`);
  }
  const page = result.artifact.value;
  const draft = {
    ...structuredClone(experienceDraft),
    title: `${fixture.brand.companyName} | ${fixture.expectedOfferOrPriority}`,
    eyebrow: `${fixture.brand.companyName} for ${fixture.expectedPersona}`,
    audienceLabel: fixture.expectedPersona,
    persuasionFramework: runtimeFramework(fixture),
    primaryCta:
      fixture.session.answers.ctaType === "download"
        ? "Read the deployment guide"
        : fixture.session.answers.ctaType === "contact-sales"
          ? `See ${fixture.expectedOfferOrPriority}`
          : "Plan a working session"
  };
  const adapted = applyProductionPageToDraft(draft, page);
  const html = renderExperienceHtml({
    draft: adapted,
    brand: fixture.brand,
    targetBrand: fixture.targetBrand,
    useCase: fixture.session.useCase,
    answers: fixture.session.answers,
    wireframeSelection: page.composition,
    ...(result.assetPlan ? { assetPlan: result.assetPlan } : {}),
    productionSections: page.sections.map((section) => ({
      id: section.sectionId,
      role: section.role,
      status: section.status,
      wordCount: [section.eyebrow, section.headline, section.body]
        .filter(Boolean)
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length,
      evidenceRefs: [...section.evidenceRefs]
    }))
  });
  return { page, html, ...(result.assetPlan ? { assetPlan: result.assetPlan } : {}) };
}

export const noLogoBrand = brandFixture({
  id: "no-logo",
  domain: "no-logo.example",
  companyName: "No Logo Company",
  title: "No Logo Company Operations",
  description: "A deterministic missing-brand fixture.",
  publicContext: "The seller identity is known, but no deliverable official logo was found.",
  publicTopics: ["Operations"],
  primaryColor: "#18202A",
  accentColor: "#2C6BED",
  buttonColor: "#2C6BED",
  radius: 8,
  density: 88,
  logo: false
});

export const noLogoSession = sessionFixture({
  id: "runtime-brand-help-recovery",
  useCase: "campaign",
  brand: noLogoBrand,
  answers: {
    campaignType: "product",
    promotedOffer: "Operations Platform",
    audience: "Operations leaders",
    objective: "Evaluate the operating model",
    ctaType: "book-meeting",
    ctaStyle: "solid"
  },
  evidenceItems: [
    evidence(
      "no-logo-operations",
      "seller",
      "The official seller identity is known but visual evidence is incomplete.",
      "https://no-logo.example/",
      ["Operations"]
    )
  ]
});

export async function compileRuntimeBrandHelpResult() {
  return compileSessionProductionPage({
    session: noLogoSession,
    brand: noLogoBrand,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000
  });
}

export function publicBrandHelpSession(): PublicTryMeSession {
  return {
    id: noLogoSession.id,
    supportRef: "TMN-RUNTIMEBRAND",
    useCase: noLogoSession.useCase,
    companyDomain: noLogoSession.companyDomain,
    status: "brand_help_required",
    createdAt: noLogoSession.createdAt,
    updatedAt: noLogoSession.updatedAt,
    temporaryUrl: noLogoSession.temporaryUrl,
    revision: noLogoSession.revision,
    stages: {
      brand: {
        status: "fallback",
        detail: "A clearer official seller page is required."
      },
      audience: { status: "complete" },
      story: {
        status: "fallback",
        detail: "Research is preserved while seller brand evidence is completed."
      }
    },
    answers: noLogoSession.answers,
    brand: {
      domain: noLogoBrand.domain,
      canonicalDomain: noLogoBrand.canonicalDomain,
      domainAliases: [],
      companyName: noLogoBrand.companyName,
      colors: noLogoBrand.colors,
      primaryColor: noLogoBrand.primaryColor,
      accentColor: noLogoBrand.accentColor,
      surfaceColor: noLogoBrand.surfaceColor,
      source: noLogoBrand.source,
      readiness: {
        status: "incomplete",
        identityReady: true,
        logoReady: false,
        paletteReady: true,
        designReady: true,
        sourceEvidenceReady: true,
        reasons: ["An official wordmark is not yet deliverable."]
      }
    },
    audienceSuggestions: ["Operations leaders"],
    audienceRecommendations: []
  };
}

const assetStyle: Record<string, { ink: string; accent: string; surface: string; label: string }> = {
  adp: { ink: "#202428", accent: "#C21728", surface: "#F6F7F8", label: "WORKFORCE NOW" },
  apple: { ink: "#1D1D1F", accent: "#0071E3", surface: "#F5F5F7", label: "PLATFORM DEPLOYMENT" },
  servicetitan: { ink: "#040404", accent: "#0265DC", surface: "#F3F7FC", label: "FIELD OPERATIONS" },
  apex: { ink: "#18324A", accent: "#D97706", surface: "#FFF8ED", label: "APEX HOME SERVICES" }
};

function assetSvg(fileName: string): string {
  const id = Object.keys(assetStyle).find((candidate) => fileName.startsWith(candidate)) ?? "adp";
  const style = assetStyle[id]!;
  if (fileName.endsWith("-logo.svg")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 84" role="img" aria-label="${style.label} logo"><rect width="84" height="84" rx="18" fill="${style.accent}"/><path d="M22 56V28h40v28M30 48h24M36 28v28" fill="none" stroke="#fff" stroke-width="7"/><text x="104" y="54" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="${style.ink}">${style.label}</text></svg>`;
  }
  if (fileName.endsWith("-product-ui.svg")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="${style.label} product interface"><rect width="1200" height="800" rx="40" fill="${style.surface}"/><rect x="54" y="48" width="1092" height="704" rx="26" fill="#fff" stroke="${style.ink}" stroke-opacity=".15" stroke-width="3"/><rect x="54" y="48" width="210" height="704" rx="26" fill="${style.ink}"/><rect x="92" y="98" width="118" height="18" rx="9" fill="#fff"/><rect x="92" y="162" width="92" height="12" rx="6" fill="#fff" opacity=".72"/><rect x="92" y="210" width="118" height="12" rx="6" fill="#fff" opacity=".48"/><rect x="92" y="258" width="104" height="12" rx="6" fill="#fff" opacity=".48"/><text x="316" y="116" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="${style.ink}">${style.label}</text><text x="316" y="154" font-family="Arial,sans-serif" font-size="18" fill="${style.ink}" opacity=".65">Operational workspace</text><rect x="316" y="204" width="248" height="172" rx="18" fill="${style.surface}"/><rect x="590" y="204" width="248" height="172" rx="18" fill="${style.surface}"/><rect x="864" y="204" width="230" height="172" rx="18" fill="${style.surface}"/><circle cx="362" cy="250" r="18" fill="${style.accent}"/><rect x="394" y="238" width="118" height="14" rx="7" fill="${style.ink}" opacity=".7"/><rect x="344" y="310" width="172" height="18" rx="9" fill="${style.ink}"/><circle cx="636" cy="250" r="18" fill="${style.accent}"/><rect x="668" y="238" width="118" height="14" rx="7" fill="${style.ink}" opacity=".7"/><rect x="618" y="310" width="172" height="18" rx="9" fill="${style.ink}"/><circle cx="910" cy="250" r="18" fill="${style.accent}"/><rect x="942" y="238" width="108" height="14" rx="7" fill="${style.ink}" opacity=".7"/><rect x="892" y="310" width="154" height="18" rx="9" fill="${style.ink}"/><rect x="316" y="420" width="778" height="268" rx="18" fill="#fff" stroke="${style.ink}" stroke-opacity=".12" stroke-width="3"/><rect x="354" y="466" width="304" height="18" rx="9" fill="${style.ink}"/><rect x="354" y="512" width="682" height="14" rx="7" fill="${style.ink}" opacity=".18"/><rect x="354" y="554" width="598" height="14" rx="7" fill="${style.ink}" opacity=".18"/><rect x="354" y="596" width="636" height="14" rx="7" fill="${style.ink}" opacity=".18"/><rect x="354" y="642" width="168" height="28" rx="14" fill="${style.accent}"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="${style.label} workflow"><rect width="1200" height="800" rx="40" fill="${style.surface}"/><text x="84" y="108" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="${style.ink}">${style.label} WORKFLOW</text><text x="84" y="150" font-family="Arial,sans-serif" font-size="19" fill="${style.ink}" opacity=".65">A first-party operating sequence</text><rect x="84" y="256" width="264" height="244" rx="24" fill="#fff" stroke="${style.ink}" stroke-opacity=".14" stroke-width="3"/><rect x="468" y="256" width="264" height="244" rx="24" fill="#fff" stroke="${style.accent}" stroke-width="5"/><rect x="852" y="256" width="264" height="244" rx="24" fill="#fff" stroke="${style.ink}" stroke-opacity=".14" stroke-width="3"/><circle cx="136" cy="310" r="22" fill="${style.accent}"/><circle cx="520" cy="310" r="22" fill="${style.accent}"/><circle cx="904" cy="310" r="22" fill="${style.accent}"/><text x="124" y="318" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#fff">1</text><text x="508" y="318" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#fff">2</text><text x="892" y="318" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#fff">3</text><rect x="126" y="364" width="168" height="18" rx="9" fill="${style.ink}"/><rect x="126" y="410" width="180" height="12" rx="6" fill="${style.ink}" opacity=".25"/><rect x="510" y="364" width="168" height="18" rx="9" fill="${style.ink}"/><rect x="510" y="410" width="180" height="12" rx="6" fill="${style.ink}" opacity=".25"/><rect x="894" y="364" width="168" height="18" rx="9" fill="${style.ink}"/><rect x="894" y="410" width="180" height="12" rx="6" fill="${style.ink}" opacity=".25"/><path d="M348 378h120M732 378h120" fill="none" stroke="${style.accent}" stroke-width="10"/><path d="m448 356 24 22-24 22M832 356l24 22-24 22" fill="none" stroke="${style.accent}" stroke-width="10"/><rect x="84" y="590" width="1032" height="118" rx="24" fill="${style.ink}"/><text x="132" y="658" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff">Validate the operating handoff before expanding scope.</text></svg>`;
}

export async function fulfillRuntimeAssets(page: Page): Promise<void> {
  await page.route(`${runtimeAssetOrigin}/**`, async (route) => {
    const fileName = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: assetSvg(fileName)
    });
  });
}
