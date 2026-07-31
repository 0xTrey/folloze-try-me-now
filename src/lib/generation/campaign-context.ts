import {
  identifyBrandCategory,
  narrativeProfileFor,
  type BrandCategory
} from "@/lib/brand-intelligence";
import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";

export const campaignRegisters = [
  "one-to-one-abm",
  "campaign-demand",
  "campaign-product",
  "campaign-event",
  "content-magic"
] as const;

export const designRegisters = [
  "source-brand-image-led",
  "source-brand-editorial",
  "source-brand-technical",
  "source-brand-minimal",
  "neutral-fallback"
] as const;

export const wireframeNames = [
  "abm-account-microsite",
  "demand-generation-landing-page",
  "product-launch-landing-page",
  "event-awareness-follow-up",
  "content-resource-companion",
  "content-assessment-workbench"
] as const;

export const experienceShapes = [
  "narrative-workflow",
  "offer-landing-page",
  "interactive-workbench",
  "event-cohort",
  "resource-companion",
  "assessment-workbench"
] as const;

export const experienceSections = ["thesis", "decision-lenses", "guided-questions"] as const;

export type CampaignRegister = (typeof campaignRegisters)[number];
export type DesignRegister = (typeof designRegisters)[number];
export type WireframeName = (typeof wireframeNames)[number];
export type ExperienceShape = (typeof experienceShapes)[number];
export type ExperienceSectionName = (typeof experienceSections)[number];
export type ProofMode = "source-content" | "public-brand-mechanism" | "mechanism-only";

export interface PublicContentEvidence {
  sourceUrl: string;
  title?: string;
  description?: string;
  excerpt: string;
}

export type TargetAccountEvidenceType =
  | "public-positioning"
  | "public-operating-context"
  | "public-focus-area";

export interface TargetAccountEvidenceItem {
  type: TargetAccountEvidenceType;
  label: string;
  text: string;
  sourceUrl: string;
  /** Short, exact phrases the generator may safely carry into buyer-facing copy. */
  signals: string[];
}

export interface CampaignGenerationContext {
  brief: {
    campaignGoal: string;
    audience: string;
    campaignRegister: CampaignRegister;
    seller: { domain: string; name: string; category: BrandCategory; offer: string };
    targetAccount: { domain: string; name: string } | null;
    campaignSubtype: SessionAnswers["campaignType"] | null;
    eventContext: string | null;
    sourceTitle: string | null;
    buyerStage: "awareness" | "education" | "evaluation" | "decision-support";
    primaryAction: string;
    messageSpine: {
      recognizableContext: string;
      whyChange: string;
      whyNow: string | null;
      sellerPromise: string;
      proofPolicy: string;
      nextAction: string;
    };
    accountEvidence: {
      personalizationLevel: "not-applicable" | "safe-public-identity" | "safe-public-context";
      evidenceItems: TargetAccountEvidenceItem[];
      unresolvedAxes: string[];
    };
    authority: {
      content: string;
      design: string;
    };
    proofMode: ProofMode;
  };
  designContext: {
    brandOwner: string;
    designRegister: DesignRegister;
    visualEvidence: BrandProfile["source"];
    sourceDesignInputs: string[];
    typography: { display: string | null; body: string | null };
    colorSystem: { primary: string; accent: string; surface: string };
    imagery: { sourceOwnedImageCount: number; mode: "image-led" | "image-supported" | "type-led" };
    proofTreatment: "source-proof" | "mechanism-and-use-case-proof";
    motionTolerance: "purposeful";
    antiReferences: string[];
  };
  wireframe: {
    name: WireframeName;
    experienceShape: ExperienceShape;
    heroMode: "account-thesis" | "offer-led" | "launch-led" | "event-led" | "source-led";
    sectionSequence: [ExperienceSectionName, ExperienceSectionName, ExperienceSectionName];
    signatureMoment: string;
    finalCtaPattern: string;
    labels: { thesis: string; lenses: string; journey: string; close: string };
  };
}

const technicalCategories = new Set<BrandCategory>([
  "integration-automation",
  "network-security",
  "cybersecurity",
  "data-ai"
]);

const cleanWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

function truncatePhrase(value: string, max = 96): string {
  const cleaned = cleanWhitespace(value);
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,;:|/-]+$/g, "");
}

export function cleanSourceTitle(value: string): string {
  const normalized = cleanWhitespace(
    value
      .replace(/\.(pdf|docx?|pptx?)(?:\?.*)?$/i, "")
      .replace(/_+/g, " ")
      .replace(/\s+(?:\||·)\s+.*$/, "")
      .replace(/\s+[-–—]\s+(?:home|homepage|resources?|blog|insights?)$/i, "")
      .replace(/\s*\|\s*$/, "")
  );
  return normalized.slice(0, 72).replace(/[\s,;:.|/-]+$/g, "");
}

function cleanEventContext(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanWhitespace(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    const pathLabel = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/[-_]+/g, " ");
    return truncatePhrase(pathLabel && pathLabel.length >= 4 ? pathLabel : url.hostname.replace(/^www\./, ""));
  } catch {
    return truncatePhrase(cleaned);
  }
}

function buyerStageFor(objective: string): CampaignGenerationContext["brief"]["buyerStage"] {
  const normalized = objective.toLowerCase();
  if (/meeting|accelerate|decision/.test(normalized)) return "decision-support";
  if (/qualified|capture|evaluate/.test(normalized)) return "evaluation";
  if (/educate|engagement/.test(normalized)) return "education";
  return "awareness";
}

function primaryActionFor(input: {
  useCase: UseCase;
  objective: string;
  campaignType?: SessionAnswers["campaignType"];
}): string {
  const normalized = input.objective.toLowerCase();
  if (/meeting|accelerate|decision/.test(normalized)) return "Plan the working session";
  if (/registr|attend|rsvp/.test(normalized)) return "Save your place";
  if (input.campaignType === "event") return "Continue the event conversation";
  if (input.campaignType === "product" || /launch|announce|introduce/.test(normalized)) return "Explore the first use case";
  if (/demand/.test(normalized)) return "Explore the offer";
  if (input.useCase === "content" && /qualified|capture/.test(normalized)) return "Apply the framework";
  if (input.useCase === "content" && /engagement/.test(normalized)) return "Choose your path";
  if (input.useCase === "content" || /educate/.test(normalized)) return "Explore the key ideas";
  return "Explore the operating path";
}

function registerFor(useCase: UseCase, answers: SessionAnswers): CampaignRegister {
  if (useCase === "abm") return "one-to-one-abm";
  if (useCase === "content") return "content-magic";
  if (answers.campaignType === "event") return "campaign-event";
  if (answers.campaignType === "product") return "campaign-product";
  return "campaign-demand";
}

function designRegisterFor(brand: BrandProfile, category: BrandCategory): DesignRegister {
  if (brand.source === "fallback") return "neutral-fallback";
  if (brand.imageUrls.length >= 3) return "source-brand-image-led";
  if (/serif|slab/i.test(brand.displayFontFamily ?? "")) return "source-brand-editorial";
  if (technicalCategories.has(category)) return "source-brand-technical";
  return "source-brand-minimal";
}

function sourceTitleFor(
  answers: SessionAnswers,
  sourceContent?: PublicContentEvidence | null
): string | null {
  const value = answers.sourceName || sourceContent?.title || "";
  return value ? cleanSourceTitle(value) || null : null;
}

function proofModeFor(
  brand: BrandProfile,
  answers: SessionAnswers,
  sourceContent?: PublicContentEvidence | null
): ProofMode {
  if (answers.sourceOpenAIFileId || sourceContent?.excerpt.trim()) return "source-content";
  if (brand.publicContext || brand.description || brand.publicTopics.length > 0) {
    return "public-brand-mechanism";
  }
  return "mechanism-only";
}

const evidenceStopWords = new Set([
  "about",
  "across",
  "also",
  "and",
  "are",
  "business",
  "company",
  "enterprise",
  "for",
  "from",
  "helps",
  "into",
  "its",
  "more",
  "operates",
  "platform",
  "provides",
  "solutions",
  "technology",
  "products",
  "resources",
  "services",
  "solutions",
  "support",
  "that",
  "the",
  "their",
  "these",
  "through",
  "with"
]);

const unsafePublicEvidence =
  /\b(ignore|disregard|instructions?|system prompt|developer message|assistant|password|secret|api key)\b/i;
const navigationOnlyEvidence = /^(?:(?:explore|view|see|browse)\s+)?(?:(?:all|our|featured|latest)\s+)?(?:products?(?:\s+(?:and|&)\s+services?)?|services?|solutions?|resources?|support|partners?|customers?|customer stories|company|about(?:\s+us)?|contact(?:\s+us)?|news|events?|careers?|industries|use cases?)$/i;
const navigationEvidenceFragment =
  /\b(?:products?\s+(?:and|&)\s+services?|(?:featured|latest)\s+resources?|(?:view|explore|browse)\s+all\s+(?:products?|solutions?|resources?))\b/gi;

function safeEvidenceText(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const cleaned = cleanWhitespace(
    value.replace(/<[^>]*>/g, " ").replace(navigationEvidenceFragment, " ")
  ).slice(0, max);
  if (
    cleaned.length < 3 ||
    unsafePublicEvidence.test(cleaned) ||
    navigationOnlyEvidence.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

function normalizeSignal(value: string): string {
  return cleanWhitespace(value.replace(/[^\p{L}\p{N}+&/-]+/gu, " "))
    .replace(/^[,;:/-]+|[,;:/-]+$/g, "")
    .trim();
}

function evidenceSignalsFor(
  value: string,
  profile: BrandProfile,
  usedSignals: Set<string>
): string[] {
  const companyTokens = new Set(
    profile.companyName
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
  const topicSignals = profile.publicTopics
    .map((topic) => safeEvidenceText(topic, 56))
    .filter((topic): topic is string => Boolean(topic))
    .filter((topic) => !navigationOnlyEvidence.test(topic))
    .map(normalizeSignal)
    .filter((topic) => topic.length >= 3 && topic.split(/\s+/).length <= 5)
    .filter((topic) => value.toLocaleLowerCase().includes(topic.toLocaleLowerCase()));
  const wordSignals = normalizeSignal(value)
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .filter((word) => !evidenceStopWords.has(word.toLocaleLowerCase()))
    .filter((word) => !companyTokens.has(word.toLocaleLowerCase()));

  const signals = [...topicSignals, ...wordSignals]
    .filter((signal) => !unsafePublicEvidence.test(signal))
    .filter((signal) => !usedSignals.has(signal.toLocaleLowerCase()))
    .filter(
      (signal, index, values) =>
        values.findIndex((candidate) => candidate.toLocaleLowerCase() === signal.toLocaleLowerCase()) ===
        index
    )
    .slice(0, 2);
  signals.forEach((signal) => usedSignals.add(signal.toLocaleLowerCase()));
  return signals;
}

export function targetAccountEvidenceFor(
  profile: BrandProfile | undefined
): TargetAccountEvidenceItem[] {
  if (
    !profile ||
    profile.source === "fallback" ||
    (!profile.description && !profile.publicContext && profile.publicTopics.length === 0)
  ) {
    return [];
  }

  const candidates: Array<{
    type: TargetAccountEvidenceType;
    label: string;
    text: string | null;
  }> = [
    {
      type: "public-positioning",
      label: "Public positioning",
      text: safeEvidenceText(profile.description, 240)
    },
    {
      type: "public-operating-context",
      label: "Public operating context",
      text: safeEvidenceText(profile.publicContext, 260)
    },
    ...profile.publicTopics.slice(0, 4).map((topic) => ({
      type: "public-focus-area" as const,
      label: "Public focus area",
      text: safeEvidenceText(topic, 72)
    }))
  ];
  const usedSignals = new Set<string>();
  const usedTexts = new Set<string>();
  const items: TargetAccountEvidenceItem[] = [];

  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const textKey = candidate.text.toLocaleLowerCase();
    if (usedTexts.has(textKey)) continue;
    const signals = evidenceSignalsFor(candidate.text, profile, usedSignals);
    if (signals.length === 0) continue;
    usedTexts.add(textKey);
    items.push({
      type: candidate.type,
      label: candidate.label,
      text: candidate.text,
      sourceUrl: profile.sourceUrl,
      signals
    });
    if (items.length === 3) break;
  }

  return items;
}

function wireframeFor(input: {
  register: CampaignRegister;
  objective: string;
}): CampaignGenerationContext["wireframe"] {
  if (input.register === "one-to-one-abm") {
    return {
      name: "abm-account-microsite",
      experienceShape: "narrative-workflow",
      heroMode: "account-thesis",
      sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
      signatureMoment: "Role-level decision lenses translate the seller mechanism into questions the named account can validate.",
      finalCtaPattern: "A focused working session around the first validation question.",
      labels: {
        thesis: "The account-level case",
        lenses: "Choose the decision lens",
        journey: "Questions for the next conversation",
        close: "Put the first question on the table"
      }
    };
  }
  if (input.register === "campaign-product") {
    return {
      name: "product-launch-landing-page",
      experienceShape: "interactive-workbench",
      heroMode: "launch-led",
      sectionSequence: ["decision-lenses", "guided-questions", "thesis"],
      signatureMoment: "An interactive capability path lets each role start with the operating change it owns.",
      finalCtaPattern: "Move from the launch story to one practical use case.",
      labels: {
        thesis: "The operating shift",
        lenses: "Explore what changes",
        journey: "Questions for the first use case",
        close: "Choose the first use case"
      }
    };
  }
  if (input.register === "campaign-event") {
    const registration = /registr|attend|rsvp/.test(input.objective.toLowerCase());
    return {
      name: "event-awareness-follow-up",
      experienceShape: "event-cohort",
      heroMode: "event-led",
      sectionSequence: ["thesis", "guided-questions", "decision-lenses"],
      signatureMoment: registration
        ? "A choose-your-reason module connects the event promise to the questions each role wants answered."
        : "A choose-your-path module turns the event theme into a useful role-specific next step.",
      finalCtaPattern: registration
        ? "Move from the event promise to one clear registration action."
        : "Continue the event conversation around the most relevant path.",
      labels: registration
        ? {
            thesis: "Why this session matters",
            lenses: "Choose your reason to attend",
            journey: "Questions the session will take on",
            close: "Save your place"
          }
        : {
            thesis: "What to carry forward",
            lenses: "Choose the most useful path",
            journey: "Questions worth continuing",
            close: "Continue the conversation"
          }
    };
  }
  if (input.register === "campaign-demand") {
    return {
      name: "demand-generation-landing-page",
      experienceShape: "offer-landing-page",
      heroMode: "offer-led",
      sectionSequence: ["decision-lenses", "thesis", "guided-questions"],
      signatureMoment: "An audience-led selector makes the offer relevant without pretending to know the individual visitor.",
      finalCtaPattern: "Route interest into one benefit-led next action.",
      labels: {
        thesis: "The case for action",
        lenses: "Start with what matters",
        journey: "From interest to a useful next step",
        close: "Take the next step"
      }
    };
  }
  const assessment = /meeting|qualified|capture|evaluate|decision/i.test(input.objective);
  return {
    name: assessment ? "content-assessment-workbench" : "content-resource-companion",
    experienceShape: assessment ? "assessment-workbench" : "resource-companion",
    heroMode: "source-led",
    sectionSequence: assessment
      ? ["thesis", "decision-lenses", "guided-questions"]
      : ["decision-lenses", "guided-questions", "thesis"],
    signatureMoment: assessment
      ? "A practical decision-lens workbench helps the buyer apply the source material to its own next question."
      : "A guided explorer turns the source into a few useful paths instead of reproducing it page by page.",
    finalCtaPattern: assessment
      ? "Apply the source framework in a focused conversation."
      : "Keep the original asset accessible while advancing to one useful action.",
    labels: {
      thesis: "The idea worth carrying forward",
      lenses: assessment ? "Apply the framework" : "Choose your reading path",
      journey: "Questions raised by the source",
      close: assessment ? "Put the framework to work" : "Keep exploring"
    }
  };
}

export function compileCampaignContext(input: {
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  useCase: UseCase;
  answers: SessionAnswers;
  sourceContent?: PublicContentEvidence | null;
}): CampaignGenerationContext {
  const { brand, targetBrand, useCase, answers, sourceContent } = input;
  const category = identifyBrandCategory(brand);
  const profile = narrativeProfileFor(brand);
  const audience = answers.customAudience || answers.audience || "The team evaluating the next step";
  const objective = answers.objective || "Continue the evaluation";
  const register = registerFor(useCase, answers);
  const sourceTitle = sourceTitleFor(answers, sourceContent);
  const eventContext = cleanEventContext(answers.eventSource);
  const proofMode = proofModeFor(brand, answers, sourceContent);
  const targetEvidence = targetAccountEvidenceFor(targetBrand);
  const wireframe = wireframeFor({ register, objective });
  const designRegister = designRegisterFor(brand, category);
  const imageMode = brand.imageUrls.length >= 3 ? "image-led" : brand.imageUrls.length ? "image-supported" : "type-led";
  const primaryAction = primaryActionFor({ useCase, objective, campaignType: answers.campaignType });
  const publicMoment = eventContext
    ? `The visitor supplied ${eventContext} as the event context.`
    : sourceTitle
      ? `The approved source is ${sourceTitle}.`
      : null;

  return {
    brief: {
      campaignGoal: objective,
      audience,
      campaignRegister: register,
      seller: {
        domain: brand.domain,
        name: brand.companyName,
        category,
        offer: profile.offerLabel
      },
      targetAccount: targetBrand ? { domain: targetBrand.domain, name: targetBrand.companyName } : null,
      campaignSubtype: answers.campaignType ?? null,
      eventContext,
      sourceTitle,
      buyerStage: buyerStageFor(objective),
      primaryAction,
      messageSpine: {
        recognizableContext: targetBrand
          ? `${targetBrand.companyName} and ${audience}`
          : sourceTitle
            ? `${sourceTitle} for ${audience}`
            : audience,
        whyChange: profile.thesis,
        whyNow: publicMoment,
        sellerPromise: profile.capabilitySentence,
        proofPolicy:
          proofMode === "source-content"
            ? "Use only claims found in the approved source asset or seller public evidence."
            : proofMode === "public-brand-mechanism"
              ? "Use seller mechanisms and public positioning. Do not imply unnamed customer outcomes."
              : "Use mechanism, use-case, and validation-question proof only. Do not invent logos, metrics, or outcomes.",
        nextAction: primaryAction
      },
      accountEvidence: {
        personalizationLevel:
          register !== "one-to-one-abm"
            ? "not-applicable"
            : targetEvidence.length >= 2
              ? "safe-public-context"
              : "safe-public-identity",
        evidenceItems: targetEvidence,
        unresolvedAxes:
          register === "one-to-one-abm"
            ? ["business priorities", "strategic operational challenges", "market and innovation focus"]
            : []
      },
      authority: {
        content:
          register === "content-magic"
            ? sourceTitle
              ? `Approved source asset: ${sourceTitle}`
              : "The uploaded or linked source asset"
            : "Explicit visitor inputs and harvested public seller context",
        design: `Harvested public brand system from ${brand.sourceUrl}`
      },
      proofMode
    },
    designContext: {
      brandOwner: brand.companyName,
      designRegister,
      visualEvidence: brand.source,
      sourceDesignInputs: [brand.sourceUrl],
      typography: {
        display: brand.displayFontFamily ?? null,
        body: brand.bodyFontFamily ?? null
      },
      colorSystem: {
        primary: brand.primaryColor,
        accent: brand.accentColor,
        surface: brand.surfaceColor
      },
      imagery: { sourceOwnedImageCount: brand.imageUrls.length, mode: imageMode },
      proofTreatment: proofMode === "source-content" ? "source-proof" : "mechanism-and-use-case-proof",
      motionTolerance: "purposeful",
      antiReferences: [
        "generic logo-swap hero",
        "unsupported purple-blue gradient",
        "fake browser or dashboard chrome",
        "three equal feature cards without a campaign reason",
        "invented customer proof or metrics"
      ]
    },
    wireframe
  };
}
