import {
  assessBrandIdentity,
  identifyBrandCategory,
  narrativeProfileFor,
  type BrandCategory
} from "@/lib/brand-intelligence";
import { primaryActionFor } from "@/lib/cta-presentation";
import type {
  BrandProfile,
  EntityIdentity,
  IntelligenceConfirmationStatus,
  IntelligenceProvenance,
  SessionAnswers,
  SourceGrounding,
  UseCase
} from "@/lib/types";

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

export const canonicalWireframeName = "canonical-desktop-experience" as const;
export const canonicalExperienceShape = "guided-buyer-experience" as const;
export const canonicalHeroMode = "message-led" as const;
export const canonicalSectionSequence = [
  "thesis",
  "decision-lenses",
  "guided-questions"
] as const;

export const CANONICAL_EXPERIENCE_STRUCTURE = {
  wireframeName: canonicalWireframeName,
  experienceShape: canonicalExperienceShape,
  heroMode: canonicalHeroMode,
  sectionSequence: canonicalSectionSequence
} as const;

export const wireframeNames = [
  canonicalWireframeName,
  // Legacy identifiers remain valid so previously generated sessions still parse.
  "abm-account-microsite",
  "demand-generation-landing-page",
  "product-launch-landing-page",
  "event-awareness-follow-up",
  "content-resource-companion",
  "content-assessment-workbench"
] as const;

export const experienceShapes = [
  canonicalExperienceShape,
  // Legacy shapes remain valid so previously generated sessions still parse.
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
export type HeroMode =
  | typeof canonicalHeroMode
  | "account-thesis"
  | "offer-led"
  | "launch-led"
  | "event-led"
  | "source-led";
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
  entityRole: "target";
  confidence: "high" | "medium";
}

export interface CampaignGenerationContext {
  brief: {
    campaignGoal: string;
    audience: string;
    campaignRegister: CampaignRegister;
    seller: {
      domain: string;
      name: string;
      category: BrandCategory;
      offer: string;
      identity: EntityIdentity;
    };
    targetAccount: { domain: string; name: string; identity: EntityIdentity } | null;
    offerOrSource: {
      kind: "offer" | "source" | "seller-category";
      name: string;
      sourceUrl: string | null;
      sourceHost: string | null;
      confirmationStatus: IntelligenceConfirmationStatus;
      provenance: IntelligenceProvenance[];
    };
    campaignSubtype: SessionAnswers["campaignType"] | null;
    eventContext: string | null;
    sourceTitle: string | null;
    sourceGrounding: SourceGrounding;
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
    heroMode: HeroMode;
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
  if (/meeting|working session|book|accelerate|decision/.test(normalized)) return "decision-support";
  if (/qualified|capture|evaluate/.test(normalized)) return "evaluation";
  if (/educate|engagement/.test(normalized)) return "education";
  return "awareness";
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
  const value = answers.sourceTitle || sourceContent?.title || answers.sourceName || "";
  return value ? cleanSourceTitle(value) || null : null;
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
  "support",
  "that",
  "the",
  "their",
  "these",
  "through",
  "with"
]);

const sourceTopicStopWords = new Set([
  ...evidenceStopWords,
  "article",
  "asset",
  "ebook",
  "field",
  "guide",
  "home",
  "introduction",
  "overview",
  "paper",
  "readiness",
  "report",
  "resource",
  "scorecard",
  "website",
  "whitepaper"
]);

function sourceTopicTokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}+#/-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[+#/-]+|[+#/-]+$/g, ""))
    .filter((token) => token.length >= 3 || token === "ai")
    .filter((token) => !sourceTopicStopWords.has(token))
    .filter((token) => !unsafePublicEvidence.test(token));
}

function sourceTopicsFor(
  title: string | null,
  sourceContent?: PublicContentEvidence | null
): string[] {
  const titleTokens = sourceTopicTokens(title ?? "").slice(0, 8);
  const titlePhrases = titleTokens
    .slice(0, -1)
    .map((token, index) => `${token} ${titleTokens[index + 1]}`)
    .filter((phrase) => phrase.length <= 56);
  const bodyTokens = sourceTopicTokens(
    `${sourceContent?.description ?? ""} ${sourceContent?.excerpt ?? ""}`
  );
  const counts = new Map<string, number>();
  for (const token of bodyTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const repeatedBodyTopics = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token);
  return [...titlePhrases, ...titleTokens, ...repeatedBodyTopics]
    .map((topic) => topic.replace(/\bai\b/gi, "AI"))
    .filter(
      (topic, index, topics) =>
        topics.findIndex((candidate) => candidate.toLocaleLowerCase() === topic.toLocaleLowerCase()) ===
        index
    )
    .slice(0, 6);
}

export function sourceGroundingFor(input: {
  answers: SessionAnswers;
  sourceContent?: PublicContentEvidence | null;
}): SourceGrounding {
  const { answers, sourceContent } = input;
  const title = sourceTitleFor(answers, sourceContent);
  const kind: SourceGrounding["kind"] = answers.sourceName
    ? "uploaded-pdf"
    : answers.sourceUrl
      ? "public-url"
      : answers.eventSource
        ? "event-context"
        : "none";
  const sourceUrl = answers.sourceUrl || sourceContent?.sourceUrl;
  let sourceHost: string | undefined;
  try {
    sourceHost = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : undefined;
  } catch {
    sourceHost = undefined;
  }
  const topics = sourceTopicsFor(title, sourceContent);
  const extractedBodyLength = cleanWhitespace(
    `${sourceContent?.description ?? ""} ${sourceContent?.excerpt ?? ""}`
  ).length;
  const confidence =
    kind === "event-context"
      ? "medium"
      : title && extractedBodyLength >= 120 && topics.length >= 2
        ? "high"
        : title && topics.length >= 1
          ? "medium"
          : "low";
  const explicitlyConfirmed = Boolean(answers.sourceConfirmed || answers.sourceTopicConfirmed);
  const confirmationStatus: SourceGrounding["confirmationStatus"] = explicitlyConfirmed
    ? "confirmed"
    : kind === "none" || confidence === "low"
      ? "needs-confirmation"
      : "confirmed";
  const provenance: IntelligenceProvenance[] = [];
  if (kind === "uploaded-pdf") {
    provenance.push({
      kind: "uploaded-source",
      detail: "The visitor supplied this document as the factual source."
    });
  } else if (sourceUrl) {
    provenance.push({
      kind: "user-input",
      sourceUrl,
      detail: "The visitor supplied this public URL as the factual source."
    });
  } else if (kind === "event-context") {
    provenance.push({
      kind: "user-input",
      detail: "The visitor supplied this event context."
    });
  }
  if (sourceContent?.excerpt.trim()) {
    provenance.push({
      kind: "public-page",
      sourceUrl: sourceContent.sourceUrl,
      detail: "Readable source copy was extracted for factual grounding."
    });
  }
  return {
    kind,
    ...(title ? { title } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sourceHost ? { sourceHost } : {}),
    topics,
    confidence,
    confirmationStatus,
    provenance,
    reason:
      confidence === "high"
        ? "The title and readable source copy provide distinct topical evidence."
        : confidence === "medium"
          ? "The submitted source identifies the topic, but deeper source evidence is limited."
          : "The source topic is not clear enough to support inferred claims without confirmation."
  };
}

function proofModeFor(
  brand: BrandProfile,
  answers: SessionAnswers,
  sourceContent?: PublicContentEvidence | null
): ProofMode {
  if (
    answers.sourceOpenAIFileId ||
    sourceContent?.excerpt.trim() ||
    sourceContent?.description?.trim()
  ) {
    return "source-content";
  }
  if (brand.publicContext || brand.description || brand.publicTopics.length > 0) {
    return "public-brand-mechanism";
  }
  return "mechanism-only";
}

const unsafePublicEvidence =
  /\b(ignore|disregard|instructions?|system prompt|developer message|assistant|password|secret|api key)\b/i;
const navigationOnlyEvidence = /^(?:(?:explore|view|see|browse)\s+)?(?:(?:all|our|featured|latest)\s+)?(?:products?(?:\s+(?:and|&)\s+services?)?|services?|solutions?|resources?|support|partners?|customers?|customer stories|company|about(?:\s+us)?|contact(?:\s+us)?|news|events?|careers?|industries|use cases?|why\s+[\p{L}\p{N}.&'-]+|take your next steps?|quick links?|resources and legal)$/iu;
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
    .filter((topic) => topic.length >= 3 && topic.split(/\s+/).length <= 8)
    .filter((topic) => value.toLocaleLowerCase().includes(topic.toLocaleLowerCase()));
  const signalWords = normalizeSignal(value)
    .split(/\s+/)
    .filter((word) => word.length >= 4 || word.toLocaleUpperCase() === "AI")
    .filter((word) => !evidenceStopWords.has(word.toLocaleLowerCase()))
    .filter((word) => !companyTokens.has(word.toLocaleLowerCase()));
  const phraseSignal = signalWords.length >= 2 ? signalWords.slice(0, 3).join(" ") : null;

  const signals = [...topicSignals, ...(phraseSignal ? [phraseSignal] : []), ...signalWords]
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
  const identity = profile ? profile.identity ?? assessBrandIdentity(profile, profile.domain) : null;
  if (
    !profile ||
    profile.source === "fallback" ||
    identity?.confirmationStatus === "rejected" ||
    (!profile.description && !profile.publicContext && profile.publicTopics.length === 0)
  ) {
    return [];
  }

  const topicCandidates = profile.publicTopics
    .map((topic, index) => ({ topic: safeEvidenceText(topic, 72), index }))
    .filter((item): item is { topic: string; index: number } => Boolean(item.topic))
    .sort((left, right) => {
      const operatingPattern =
        /\b(infrastructure|operations?|network(?:ing)?|security|platform|cloud|data centers?|workplaces?|resilien\w*|govern\w*|observab\w*|automation|integration)\b/i;
      const aiPattern = /\b(?:artificial intelligence|AI)\b/i;
      const proofOrNewsPattern =
        /\b(trusted by|customers? worldwide|latest|discuss|hands-on|awards?|other .+ innovations?|rewriting|playbook)\b/i;
      const score = (value: string) =>
        (operatingPattern.test(value) ? 30 : 0) +
        (aiPattern.test(value) ? 5 : 0) -
        (proofOrNewsPattern.test(value) ? 20 : 0) +
        Math.min(value.split(/\s+/).length, 10);
      return score(right.topic) - score(left.topic) || left.index - right.index;
    });
  const focusCandidates = topicCandidates.slice(0, 2).map(({ topic }) => ({
    type: "public-focus-area" as const,
    label: "Public focus area",
    text: topic
  }));
  const candidates: Array<{
    type: TargetAccountEvidenceType;
    label: string;
    text: string | null;
  }> = [
    ...focusCandidates,
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
    ...topicCandidates.slice(2, 5).map(({ topic }) => ({
      type: "public-focus-area" as const,
      label: "Public focus area",
      text: topic
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
      signals,
      entityRole: "target",
      confidence: identity?.confidence === "high" ? "high" : "medium"
    });
    if (items.length === 3) break;
  }

  return items;
}

function wireframeFor(input: {
  register: CampaignRegister;
  objective: string;
}): CampaignGenerationContext["wireframe"] {
  const sharedSections = [
    ...CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence
  ] as CampaignGenerationContext["wireframe"]["sectionSequence"];

  if (input.register === "one-to-one-abm") {
    return {
      name: "abm-account-microsite",
      experienceShape: "narrative-workflow",
      heroMode: "account-thesis",
      sectionSequence: sharedSections,
      signatureMoment: "Role-level decision lenses translate the seller mechanism into questions the named account can validate.",
      finalCtaPattern: "A focused working session around the first validation question.",
      labels: {
        thesis: "The account-level case",
        lenses: "Choose the decision lens",
        journey: "Explore the supporting story",
        close: "Put the first question on the table"
      }
    };
  }
  if (input.register === "campaign-product") {
    return {
      name: "product-launch-landing-page",
      experienceShape: "offer-landing-page",
      heroMode: "launch-led",
      sectionSequence: sharedSections,
      signatureMoment: "An interactive capability path lets each role start with the operating change it owns.",
      finalCtaPattern: "Move from the launch story to one practical use case.",
      labels: {
        thesis: "The operating shift",
        lenses: "Explore what changes",
        journey: "Proof and launch resources",
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
      sectionSequence: sharedSections,
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
            journey: "What the session will cover",
            close: "Save your place"
          }
          : {
            thesis: "What to carry forward",
            lenses: "Choose the most useful path",
            journey: "Keep exploring the story",
            close: "Continue the conversation"
          }
    };
  }
  if (input.register === "campaign-demand") {
    return {
      name: "demand-generation-landing-page",
      experienceShape: "offer-landing-page",
      heroMode: "offer-led",
      sectionSequence: sharedSections,
      signatureMoment: "An audience-led selector makes the offer relevant without pretending to know the individual visitor.",
      finalCtaPattern: "Route interest into one benefit-led next action.",
      labels: {
        thesis: "The case for action",
        lenses: "Start with what matters",
        journey: "Proof and useful resources",
        close: "Take the next step"
      }
    };
  }
  const assessment = /meeting|qualified|capture|evaluate|decision/i.test(input.objective);
  return {
    name: assessment ? "content-assessment-workbench" : "content-resource-companion",
    experienceShape: assessment ? "assessment-workbench" : "resource-companion",
    heroMode: "source-led",
    sectionSequence: sharedSections,
    signatureMoment: assessment
      ? "A practical decision-lens workbench helps the buyer apply the source material to its own next question."
      : "A guided explorer turns the source into a few useful paths instead of reproducing it page by page.",
    finalCtaPattern: assessment
      ? "Apply the source framework in a focused conversation."
      : "Keep the original asset accessible while advancing to one useful action.",
    labels: {
      thesis: "The idea worth carrying forward",
      lenses: assessment ? "Apply the framework" : "Choose your reading path",
      journey: assessment ? "Work through the source" : "Explore the source",
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
  const sourceGrounding = sourceGroundingFor({ answers, sourceContent });
  const eventContext = cleanEventContext(answers.eventSource);
  const proofMode = proofModeFor(brand, answers, sourceContent);
  const targetEvidence = targetAccountEvidenceFor(targetBrand);
  const wireframe = wireframeFor({ register, objective });
  const designRegister = designRegisterFor(brand, category);
  const imageMode = brand.imageUrls.length >= 3 ? "image-led" : brand.imageUrls.length ? "image-supported" : "type-led";
  const primaryAction = primaryActionFor({ useCase, objective, campaignType: answers.campaignType });
  const sellerIdentity =
    brand.identity ?? assessBrandIdentity(brand, brand.domain, answers.sellerConfirmed);
  const targetIdentity = targetBrand
    ? targetBrand.identity ??
      assessBrandIdentity(targetBrand, answers.targetDomain ?? targetBrand.domain, answers.targetConfirmed)
    : null;
  const offerName = answers.promotedOffer || sourceTitle || profile.offerLabel;
  const offerSourceUrl = answers.promotedOffer ? answers.offerSourceUrl : sourceGrounding.sourceUrl;
  let offerSourceHost: string | null = sourceGrounding.sourceHost ?? null;
  if (answers.promotedOffer && answers.offerSourceUrl) {
    try {
      offerSourceHost = new URL(answers.offerSourceUrl).hostname.replace(/^www\./, "");
    } catch {
      offerSourceHost = null;
    }
  }
  const contentTopics = sourceGrounding.topics.slice(0, 3);
  const contentTopicPhrase = contentTopics.length
    ? contentTopics.join(", ")
    : sourceTitle ?? "the submitted source";
  const publicMoment = eventContext
    ? `The visitor supplied ${eventContext} as the event context.`
    : sourceTitle
      ? `The approved source is ${sourceTitle}.`
      : useCase === "campaign" && answers.promotedOffer
        ? `The visitor named ${offerName} as the promoted offer for this ${register.replace("campaign-", "")} campaign.`
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
        offer: answers.promotedOffer || profile.offerLabel,
        identity: sellerIdentity
      },
      targetAccount: targetBrand
        ? { domain: targetBrand.domain, name: targetBrand.companyName, identity: targetIdentity! }
        : null,
      offerOrSource: {
        kind: sourceGrounding.kind !== "none"
          ? "source"
          : answers.promotedOffer
            ? "offer"
            : "seller-category",
        name: offerName,
        sourceUrl: offerSourceUrl ?? null,
        sourceHost: offerSourceHost,
        confirmationStatus:
          sourceGrounding.kind !== "none"
            ? sourceGrounding.confirmationStatus
            : answers.promotedOfferConfirmed || answers.offerSourceConfirmed
              ? "confirmed"
              : answers.promotedOffer
                ? "needs-confirmation"
                : sellerIdentity.confirmationStatus,
        provenance:
          sourceGrounding.kind !== "none"
            ? sourceGrounding.provenance
            : answers.promotedOffer
              ? [
                  {
                    kind: "user-input",
                    ...(answers.offerSourceUrl ? { sourceUrl: answers.offerSourceUrl } : {}),
                    detail: "The visitor named the promoted offer."
                  }
                ]
              : sellerIdentity.provenance
      },
      campaignSubtype: answers.campaignType ?? null,
      eventContext,
      sourceTitle,
      sourceGrounding,
      buyerStage: buyerStageFor(objective),
      primaryAction,
      messageSpine: {
        recognizableContext: targetBrand
          ? `${targetBrand.companyName} and ${audience}`
          : sourceTitle
            ? `${sourceTitle} for ${audience}`
            : useCase === "campaign" && answers.promotedOffer
              ? `${offerName} for ${audience}`
            : audience,
        whyChange:
          register === "content-magic"
            ? `Keep the buyer story anchored to the source's supported ideas about ${contentTopicPhrase}.`
            : profile.thesis,
        whyNow: publicMoment,
        sellerPromise:
          register === "content-magic"
            ? `Help ${audience} explore the supported ideas in ${sourceTitle ?? "the source"} without adding unrelated product-category claims.`
            : useCase === "campaign" && answers.promotedOffer
              ? `Make ${offerName} relevant to ${audience} without adding unsupported product claims.`
            : profile.capabilitySentence,
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
            : useCase === "campaign" && answers.promotedOffer
              ? answers.offerSourceUrl
                ? `Visitor-confirmed offer and public source: ${offerName}`
                : `Visitor-confirmed promoted offer: ${offerName}`
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
