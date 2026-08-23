"use client";

import { upload as uploadBlob } from "@vercel/blob/client";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  ChevronDown,
  Clipboard,
  Clock3,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  LoaderCircle,
  Mail,
  Megaphone,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import {
  AnalyticsSignalPanel,
  AudienceEvidenceTray,
  ExpirySaveValuePanel,
  InstantBrandLockStrip,
  type AnalyticsSignal,
  type CtaValue,
  type EntryPathOption
} from "@/components/try-me-now-enhancements";
import { BrandHelpRecovery } from "@/components/brand-help-recovery";
import { usePreviewForegroundSeconds } from "@/components/use-preview-foreground-seconds";
import {
  StreamingBriefComposer,
  type StreamingAudienceFinding,
  type StreamingBriefAnswer,
  type StreamingBriefQuestion,
  type StreamingBriefReceipt,
  type StreamingBriefSummaryField
} from "@/components/streaming-brief-composer";

import type {
  AudienceRecommendation,
  BriefFieldProvenance,
  ExperienceBlockControl as SessionExperienceBlockControl,
  PersonalizationVariantId,
  PublicTryMeSession,
  SessionEvidenceItem,
  SessionAnswers,
  StageKey,
  StageState,
  UseCase
} from "@/lib/types";
import { PERSONALIZATION_VARIANT_IDS } from "@/lib/types";
import {
  ApiResponseError,
  friendlyUploadError,
  readJsonResponse,
  uploadErrorCode,
  validatePdfFile
} from "@/lib/client-response";
import { primaryActionFor } from "@/lib/cta-presentation";
import {
  brandfetchLogoRecoveryUrls,
  isBrandfetchHostedLogoUrl
} from "@/lib/brandfetch-logo";
import { prospectBrandPresentation } from "@/lib/brand-readiness";
import { fallbackCompanyName } from "@/lib/company-name";
import {
  SELLER_BRAND_PREFLIGHT_DELAY_MS,
  SellerBrandPreflightCoordinator,
  scheduleSellerBrandPreflight,
  sellerBrandPreflightKey
} from "@/lib/client-brand-preflight";
import { imageDeliveryPath } from "@/lib/image-delivery";
import { interpretConversationalBrief } from "@/lib/conversational-brief";
import {
  analyticsDurationBucket,
  analyticsQualityGate,
  answersPatchForStageRetry,
  canOfferClaimModal,
  canRevealPreview,
  isProvisionalExperience,
  isSessionGenerationEligible,
  previewLifecycleCopy,
  previewLifecyclePhase,
  workerNameForStage
} from "@/lib/preview-lifecycle";
import {
  captureProductEvent,
  captureUnifiedProductEvent,
  identifyProductVisitor,
  initializeProductAnalytics,
  productAnalyticsHeaders,
  resetProductAnalyticsVisitor,
  setProductAnalyticsSessionId
} from "@/lib/product-analytics-client";
import type { ProductEventName } from "@/lib/product-analytics";

type AnalyticsEventContext = {
  sectionId?: string;
  sectionTitle?: string;
  sectionHeadline?: string;
  targetId?: string;
  ctaId?: string;
  lensId?: string;
  lensTitle?: string;
  lensHeadline?: string;
  area?: string;
  position?: string;
  completionKey?: string;
};

type ClientEvent = {
  action: string;
  label: string;
  detail: string;
  at: number;
  context?: AnalyticsEventContext;
};

const ANALYTICS_SECTION_LABELS: Record<string, string> = {
  "experience-overview": "Overview",
  "experience-thesis": "Why it matters",
  "decision-path": "Where to start",
  "supporting-resources": "Evidence",
  "next-step": "Next step"
};

function analyticsSectionLabel(value: string | undefined, title?: string): string {
  if (title?.trim()) return title.trim();
  return value ? ANALYTICS_SECTION_LABELS[value] ?? value.replaceAll("-", " ") : "the experience";
}

function analyticsLensLabel(title?: string): string {
  if (title?.trim()) return title.trim();
  return "a topic";
}

export function describePreviewAnalyticsEvent(
  action: string,
  context: AnalyticsEventContext
): Pick<ClientEvent, "label" | "detail"> {
  if (action === "preview_viewed") return {
    label: "Opened the experience",
    detail: "The private buyer experience entered the viewport."
  };
  if (action === "section_view") return {
    label: `Viewed ${analyticsSectionLabel(context.sectionId, context.sectionTitle)}`,
    detail: context.sectionHeadline || "The visitor reached a new part of the buyer journey."
  };
  if (action === "anchor_click") return {
    label: `Navigated to ${analyticsSectionLabel(context.targetId, context.sectionTitle)}`,
    detail: context.sectionHeadline || "The visitor used the guided journey navigation."
  };
  if (action === "topic_select") return {
    label: `Selected ${analyticsLensLabel(context.lensTitle)}`,
    detail: context.lensHeadline || "The visitor revealed which topic deserved a deeper look."
  };
  if (action === "signature_select") return {
    label: context.lensTitle ? `Chose ${context.lensTitle}` : "Chose a recommended starting point",
    detail: context.lensHeadline || "The visitor moved from a highlighted signal into the decision path."
  };
  if (action === "journey_complete") return {
    label: `Reached ${analyticsSectionLabel(context.sectionId, context.sectionTitle)}`,
    detail: context.lensTitle
      ? `After exploring ${context.lensTitle}, the visitor reached the end of the guided experience.`
      : context.sectionHeadline || "The visitor reached the end of the guided experience."
  };
  if (action === "question_select") return {
    label: "Explored a meeting question",
    detail: "The visitor opened a guided question for the next conversation."
  };
  if (action === "cta_click") {
    const closingCta = context.ctaId === "close-primary";
    return {
      label: closingCta ? "Tested the closing CTA" : "Tested the primary CTA",
      detail: "This preview captured next-step intent without leaving or losing the experience."
    };
  }
  if (action === "fullscreen_change") return {
    label: "Changed the preview view",
    detail: "The visitor expanded or restored the experience view."
  };
  return {
    label: "Explored the experience",
    detail: "The visitor revealed interest inside the guided path."
  };
}

type WorkspacePatch = {
  answers?: SessionAnswers;
  selectedAudienceRecommendationId?: string | null;
  evidenceDecisions?: Array<{
    id: string;
    disposition: SessionEvidenceItem["disposition"];
  }>;
  sourceConfirmation?: "unconfirmed" | "confirmed" | "rejected";
  blockControls?: SessionExperienceBlockControl[];
};

type BuildMoment = {
  key: "brand" | "buyer" | "strategy" | "experience";
  phase: string;
  title: string;
  detail: string;
  artifact?: string;
  status: StageState["status"];
  icon: typeof Globe2;
};

type CampaignEntryMode = "campaign" | "event";

const useCaseContent: Record<
  UseCase,
  {
    number: string;
    kicker: string;
    title: string;
    description: string;
    cta: string;
    domainTitle: string;
    domainBody: string;
    icon: typeof Target;
    className: string;
  }
> = {
  abm: {
    number: "01",
    kicker: "1:1 ABM",
    title: "Build a 1:1 account experience",
    description: "Add your company and one target account. Folloze builds a personalized buyer experience for that account.",
    cta: "Build a 1:1 account experience",
    domainTitle: "Start with your company.",
    domainBody: "Enter your company domain. We will start matching the logo, colors, and public brand cues right away.",
    icon: Target,
    className: "portalEditorial"
  },
  campaign: {
    number: "02",
    kicker: "Campaign",
    title: "Launch a campaign landing page",
    description: "Add one offer and audience. Folloze builds a branded campaign page with a measurable next step.",
    cta: "Launch a campaign landing page",
    domainTitle: "Who is launching this campaign?",
    domainBody: "Enter the company domain. We will start matching its logo, colors, and public brand cues right away.",
    icon: Megaphone,
    className: "portalCobalt"
  },
  content: {
    number: "03",
    kicker: "Content",
    title: "Make content interactive",
    description: "Add a public URL or PDF. Folloze turns the source into a guided, buyer-ready experience.",
    cta: "Make content interactive",
    domainTitle: "Who owns this content?",
    domainBody: "Enter the company domain. We will match the source brand while you tell us which content should do more work.",
    icon: FileText,
    className: "portalTerminal"
  }
};

const objectives: Record<UseCase, string[]> = {
  abm: ["Introduce a product", "Educate the buying group", "Accelerate an opportunity", "Book a meeting"],
  campaign: ["Generate demand", "Drive registrations", "Launch or announce", "Book meetings"],
  content: ["Educate buyers", "Increase content engagement", "Capture qualified interest", "Book a meeting"]
};

const introduceProductObjective = "Introduce a product";

export function recommendedObjectiveFor(session: Pick<PublicTryMeSession, "useCase" | "answers">): string {
  if (session.useCase === "abm") return "Accelerate an opportunity";
  if (session.useCase === "content") return "Increase content engagement";
  if (session.answers.campaignType === "event") return "Drive registrations";
  if (session.answers.campaignType === "product") return "Launch or announce";
  return "Generate demand";
}

export function shouldAutoConfirmSource(session: Pick<PublicTryMeSession, "useCase" | "answers" | "sourceConfirmation" | "sourceInsight">): boolean {
  if (session.useCase !== "content" || session.sourceConfirmation?.status === "confirmed") return false;
  return Boolean(
    (session.answers.sourceUrl || session.answers.sourceName) &&
    session.sourceInsight &&
    ["ready", "needs-review"].includes(session.sourceInsight.status)
  );
}

const NORTHPEAK_ACCOUNT_EXAMPLE_URL = "https://experience.folloze.com/northpeak--folloze";
const NORTHPEAK_CAMPAIGN_EXAMPLE_URL = "https://engage.folloze.com/120367";

/** Optional Northpeak worked states for the unified entry — never primary CTAs. */
export const northpeakWorkedStates = [
  {
    id: "account",
    label: "See a Northpeak account experience",
    href: NORTHPEAK_ACCOUNT_EXAMPLE_URL
  },
  {
    id: "campaign",
    label: "See a Northpeak personalized campaign",
    href: NORTHPEAK_CAMPAIGN_EXAMPLE_URL
  }
] as const;

export const entryPathOptions: Record<UseCase, EntryPathOption> = {
  abm: {
    id: "abm",
    index: "01",
    eyebrow: "1:1 ABM",
    title: "Build a 1:1 account experience",
    description: "Add your company and one target account. Folloze builds a personalized buyer experience for that account.",
    actionLabel: "Build a 1:1 account experience",
    exampleLabel: "See a Northpeak account experience",
    exampleUrl: NORTHPEAK_ACCOUNT_EXAMPLE_URL,
    demoSteps: ["Company + account", "Public account context", "1:1 buyer experience"],
    previewImage: "/entry/abm-preview.webp",
    previewAlt: "Northpeak account experience tailored for a named buyer account",
    accent: "#0077ff",
    tone: "paper"
  },
  campaign: {
    id: "campaign",
    index: "02",
    eyebrow: "Campaign",
    title: "Launch a campaign landing page",
    description: "Add one offer and audience. Folloze builds a branded campaign page with a measurable next step.",
    actionLabel: "Launch a campaign landing page",
    exampleLabel: "See a Northpeak personalized campaign",
    exampleUrl: NORTHPEAK_CAMPAIGN_EXAMPLE_URL,
    demoSteps: ["Offer + audience", "Buyer objective", "Campaign landing page"],
    previewImage: "/entry/campaign-preview.webp",
    previewAlt: "Northpeak-branded personalized campaign landing page",
    accent: "#0048de",
    tone: "cobalt"
  },
  content: {
    id: "content",
    index: "03",
    eyebrow: "Content Magic",
    title: "Make content interactive",
    description: "Turn a public URL or PDF into a guided, source-grounded buyer experience.",
    actionLabel: "Make content interactive",
    exampleLabel: "See a Northpeak Content Magic example",
    exampleUrl: NORTHPEAK_CAMPAIGN_EXAMPLE_URL,
    demoSteps: ["Public URL or PDF", "Source understanding", "Interactive experience"],
    previewImage: "/entry/content-preview.webp",
    previewAlt: "Northpeak source turned into an interactive content experience",
    accent: "#091019",
    tone: "ink"
  }
};

export function experienceTypeLabelFor(session: Pick<PublicTryMeSession, "useCase" | "answers">): string {
  if (session.useCase === "abm") return "Account microsite";
  if (session.useCase === "content") return "Content Magic";
  if (session.answers.campaignType === "event") return "Event landing page";
  if (session.answers.campaignType === "demand") return "Demand campaign";
  if (session.answers.campaignType === "product") return "Product campaign";
  return "Buyer experience";
}

function uiCtaType(value?: SessionAnswers["ctaType"]): CtaValue["type"] {
  if (value === "register") return "registration";
  if (value === "download" || value === "explore") return "content";
  if (value === "custom" || value === "contact-sales") return "custom";
  return "meeting";
}

function defaultCtaLabel(value: CtaValue["type"]): string {
  if (value === "registration") return "Register now";
  if (value === "content") return "Explore the content";
  if (value === "custom") return "Take the next step";
  return "Book a meeting";
}

export function ctaValueForSession(session: PublicTryMeSession): CtaValue {
  const type = uiCtaType(session.answers.ctaType);
  const explicitLabel = session.blockControls?.find((control) => control.id === "closing")?.ctaLabel?.trim();
  const generatedLabel = session.answers.objective
    ? primaryActionFor({
        useCase: session.useCase,
        objective: session.answers.objective,
        campaignType: session.answers.campaignType
      })
    : undefined;
  return {
    type,
    label: explicitLabel || generatedLabel || defaultCtaLabel(type),
    style: session.answers.ctaStyle || "solid"
  };
}

const likelyDomain = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\/?$/i;

type BuildPanelCopy = {
  kicker: string;
  headline: string;
  supporting: string;
  urlLabel: string;
  mobileLabel: string;
  mobileStep: string;
};

type RevealReceipt = { number: string; label: string };

export type RevealCopy = {
  kicker: string;
  headline: string;
  summary: string;
  counterpart: string;
  receipts: RevealReceipt[];
};

type GuidedQuestionCopy = {
  targetTitle: string;
  targetBody: string;
  campaignTitle: string;
  campaignBody: string;
  sourceTitle: string;
  sourceBody: string;
  audienceLoadingTitle: string;
  audienceLoadingBody: string;
  audienceTitle: string;
  audienceBody: string;
  objectiveTitle: string;
  objectiveBody: string;
  completeTitle: string;
  completeBody: string;
};

function displayNameFromDomain(value?: string): string {
  return value?.trim() ? fallbackCompanyName(value) : "the company";
}

function trimLabel(value: string, max = 42): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  const candidate = compact.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return `${candidate || compact.slice(0, max).trim()}…`;
}

function lowercaseInitial(value: string): string {
  return value ? `${value.charAt(0).toLocaleLowerCase()}${value.slice(1)}` : value;
}

function brandNameFor(session: PublicTryMeSession): string {
  return session.brand?.companyName || displayNameFromDomain(session.companyDomain);
}

function targetNameFor(session: PublicTryMeSession): string {
  return session.targetBrand?.companyName || displayNameFromDomain(session.answers.targetDomain);
}

function audienceFor(session: PublicTryMeSession): string {
  return session.answers.customAudience || session.answers.audience || "the right buying group";
}

function campaignTypeFor(session: PublicTryMeSession): string {
  if (session.answers.campaignType === "event") return "Event campaign";
  if (session.answers.campaignType === "demand") return "Demand campaign";
  if (session.answers.campaignType === "product") return "Product campaign";
  return "Campaign experience";
}

function campaignOfferFor(session: Pick<PublicTryMeSession, "answers" | "campaignOfferSource">): string | undefined {
  return session.answers.promotedOffer?.trim() || session.campaignOfferSource?.title?.trim() || undefined;
}

export function isCampaignOfferSourceUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function campaignIntakeComplete(
  session: Pick<PublicTryMeSession, "useCase" | "answers" | "campaignOfferSource">
): boolean {
  if (session.useCase !== "campaign") return true;
  // A background URL harvest is allowed to populate an offer hypothesis, but
  // it must not advance the guided flow before the visitor presses Continue.
  if (
    session.campaignOfferSource?.sourceHost
    && session.answers.promotedOfferConfirmed !== true
  ) return false;
  const offerIsIdentified = Boolean(
    campaignOfferFor(session)
      || (session.campaignOfferSource?.status !== "rejected" && session.campaignOfferSource?.sourceHost)
  );
  if (!session.answers.campaignType || !offerIsIdentified) return false;
  return session.answers.campaignType !== "event" || Boolean(session.answers.eventSource);
}

function campaignOfferPrompt(type: SessionAnswers["campaignType"]): {
  label: string;
  placeholder: string;
  sourceLabel: string;
  sourcePlaceholder: string;
} {
  if (type === "event") {
    return {
      label: "Event or webinar name",
      placeholder: "Your event or webinar",
      sourceLabel: "Event URL or details",
      sourcePlaceholder: "https://... or September 12 live webinar"
    };
  }
  if (type === "demand") {
    return {
      label: "Offer, report, or initiative",
      placeholder: "Your report, guide, offer, or initiative",
      sourceLabel: "Offer page or source URL",
      sourcePlaceholder: "https://yourcompany.com/report"
    };
  }
  return {
    label: "Product or solution name",
    placeholder: "Your product or solution",
    sourceLabel: "Product page or source URL",
    sourcePlaceholder: "https://yourcompany.com/product"
  };
}

function conciseIntentLabel(value: string, fallback: string): string {
  const normalized = value.trim();
  if (isCampaignOfferSourceUrl(normalized)) {
    const url = new URL(normalized);
    const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\bAi\b/g, "AI");
    return (slug || fallback).slice(0, 160);
  }
  const firstThought = normalized.split(/(?:[.!?]\s|\n)/, 1)[0]?.trim() || fallback;
  return firstThought.slice(0, 160);
}

export const STREAMING_BRIEF_SKIP_THRESHOLD = 3;

export function streamingCampaignQuestions(
  mode: CampaignEntryMode,
  audienceSuggestions: readonly string[],
  objectiveChoices: readonly string[] = [],
  offerChoices: readonly string[] = [],
  recommended: {
    offer?: string;
    audience?: string;
    objective?: string;
  } = {}
): StreamingBriefQuestion[] {
  return [
    {
      id: "intent",
      label: mode === "event" ? "Event" : "Campaign",
      prompt: mode === "event" ? "What event are you promoting?" : "What are you taking to market?",
      hint: mode === "event"
        ? "Paste the event page or describe the webinar or field event in one sentence."
        : "Paste a product page or describe the offer and outcome in one sentence.",
      choices: offerChoices.slice(0, 3),
      recommendedChoice: recommended.offer,
      placeholder: mode === "event"
        ? "A September customer webinar for revenue leaders about…"
        : "Launch our AI platform for operations leaders who need…",
      required: true
    },
    {
      id: "audience",
      label: "Audience",
      prompt: "Who should this reach?",
      hint: "Choose a company-fit recommendation or describe the buyer group in your own words.",
      choices: audienceSuggestions.slice(0, 3),
      recommendedChoice: recommended.audience,
      placeholder: mode === "event" ? "Revenue and demand generation leaders" : "Enterprise marketing leaders",
      required: true
    },
    {
      id: "goal",
      label: "Goal",
      prompt: "What should this experience achieve?",
      hint: "Pick a goal or type the outcome you want buyers to take.",
      choices: objectiveChoices.slice(0, 3),
      recommendedChoice: recommended.objective,
      placeholder: mode === "event" ? "Drive registrations" : "Launch or announce",
      required: true
    }
  ];
}

export function streamingCampaignPatchForIntent(
  value: string,
  mode: CampaignEntryMode
): SessionAnswers {
  const interpretation = interpretConversationalBrief(value, "campaign");
  const publicUrl = interpretation.sourceUrl?.value;
  const inferredType = mode === "event"
    ? "event"
    : interpretation.campaignType?.value === "demand"
      ? "demand"
      : interpretation.campaignType?.value === "event"
        ? "event"
        : "product";
  const eventIntent = inferredType === "event";
  const promotedOffer = conciseIntentLabel(
    interpretation.offer?.value || value,
    eventIntent ? "Your event" : "Your campaign"
  );
  return {
    campaignType: inferredType,
    promotedOffer,
    promotedOfferConfirmed: true,
    messageBelief: value.trim().slice(0, 240),
    ...(eventIntent ? { eventSource: (publicUrl || promotedOffer).slice(0, 1000), ctaType: "register" } : {}),
    ...(publicUrl ? { offerSourceUrl: publicUrl, offerSourceConfirmed: true } : {})
  };
}

export function streamingCampaignSkipPatch(
  session: Pick<PublicTryMeSession, "useCase" | "answers" | "audienceRecommendations" | "campaignOfferSource">,
  mode: CampaignEntryMode
): SessionAnswers {
  const inferredAudience = session.answers.customAudience
    || (session.answers.audience && session.answers.audience !== "Other" ? session.answers.audience : undefined)
    || session.audienceRecommendations?.find(
      (recommendation) => recommendation.recommendationKind === "evidence-backed"
    )?.label;
  const inferredOffer = campaignOfferFor(session);
  return {
    ...(session.answers.campaignType ? {} : { campaignType: mode === "event" ? "event" : "product" }),
    ...(session.answers.promotedOffer || !inferredOffer
      ? {}
      : { promotedOffer: inferredOffer, promotedOfferConfirmed: true }),
    ...(session.answers.audience || !inferredAudience
      ? {}
      : { audience: inferredAudience }),
    ...(session.answers.objective ? {} : { objective: recommendedObjectiveFor(session) })
  };
}

export function objectiveContextPrompt(
  objective: string,
  offer?: string
): { label: string; placeholder: string } {
  const subject = offer?.trim() || "this campaign";
  const normalized = objective.toLocaleLowerCase();
  if (/launch|announce|introduce/.test(normalized)) {
    return {
      label: `What is new or worth noticing about ${subject}?`,
      placeholder: "Add one sentence that separates this offer from the status quo."
    };
  }
  if (/registr|attend/.test(normalized)) {
    return {
      label: "What should attendees leave knowing or able to do?",
      placeholder: "Add the practical payoff for attending."
    };
  }
  if (/meeting|conversation|book/.test(normalized)) {
    return {
      label: "What should make the conversation worth their time?",
      placeholder: "Name the first useful question or outcome for the meeting."
    };
  }
  return {
    label: `Which buyer problem should ${subject} help them recognize?`,
    placeholder: "Add one sentence of context if the public offer page will not make it obvious."
  };
}

export function audienceRecommendationCopy(input: {
  recommendation: AudienceRecommendation;
  evidenceCount: number;
  companyName: string;
  offer?: string;
  isPrimary: boolean;
}): string {
  const { recommendation, evidenceCount, companyName, offer, isPrimary } = input;
  const context = offer ? `${offer} from ${companyName}` : companyName;
  if (evidenceCount > 0 && recommendation.source !== "seller-category-fallback") {
    return isPrimary
      ? `Best-supported fit for ${context}. ${recommendation.rationale}`
      : recommendation.rationale;
  }
  return isPrimary
    ? `Suggested starting point for ${context}; no supporting public signal is attached yet. ${recommendation.rationale}`
    : `Working hypothesis for ${context}; confirm it before using it. ${recommendation.rationale}`;
}

function sourceNameFor(session: PublicTryMeSession): string {
  const brandName = brandNameFor(session);
  const sourceTitle = session.answers.sourceTitle?.trim();
  if (sourceTitle) return trimLabel(sourceTitle, 72);
  const sourceName = session.answers.sourceName?.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  if (sourceName && sourceName !== "Uploaded PDF") return trimLabel(sourceName, 72);
  if (session.useCase === "content" && session.experience?.title) {
    const title = session.experience.title.split("|")[0]?.trim();
    if (title) return trimLabel(title, 54);
  }
  return `${brandName} content`;
}

function sourceInsightIsUsable(session: PublicTryMeSession): boolean {
  return Boolean(
    session.sourceInsight
      && ["ready", "needs-review"].includes(session.sourceInsight.status)
  );
}

function productContextIsUsable(session: PublicTryMeSession): boolean {
  if (session.answers.sourceName || session.answers.messageBelief?.trim()) return true;
  return Boolean(session.answers.sourceUrl && sourceInsightIsUsable(session));
}

function productContextNeedsAttention(session: PublicTryMeSession): boolean {
  return session.useCase === "abm"
    && session.answers.objective === introduceProductObjective
    && !productContextIsUsable(session);
}

function generationInputsReady(session: PublicTryMeSession): boolean {
  const answers = session.answers;
  if (session.useCase === "content") {
    return Boolean(answers.sourceName || answers.sourceUrl);
  }
  if (!answers.audience || !answers.objective) return false;
  if (session.useCase === "abm") {
    return Boolean(
      answers.targetDomain
        && (answers.objective !== introduceProductObjective || productContextIsUsable(session))
    );
  }
  if (session.useCase === "campaign") {
    return Boolean(
      answers.campaignType
        && answers.promotedOffer?.trim()
        && (answers.campaignType !== "event" || answers.eventSource)
    );
  }
  return Boolean(
    answers.sourceName
      || (answers.sourceUrl && sourceInsightIsUsable(session))
  );
}

export function buildMoments(session?: PublicTryMeSession): BuildMoment[] {
  const pending: StageState["status"] = "pending";
  const brandName = session?.brand?.companyName || displayNameFromDomain(session?.companyDomain);
  const targetName = session?.targetBrand?.companyName || displayNameFromDomain(session?.answers.targetDomain);
  const audience = session?.answers.customAudience || session?.answers.audience;
  const objective = session?.answers.objective;
  const buyerContext = session?.useCase === "abm" ? targetName : brandName;
  const brandState = session?.stages.brand.status ?? pending;
  const brandPresentation = prospectBrandPresentation(
    session?.brand,
    brandName,
    brandState
  );
  const audienceState = session?.stages.audience.status ?? pending;
  const guidedInputsReady = session ? generationInputsReady(session) : false;
  const experienceState = session?.experience
    ? "complete"
    : guidedInputsReady
      ? session?.stages.story.status ?? pending
      : pending;

  return [
    {
      key: "brand",
      phase: "Your brand",
      title:
        brandPresentation.state === "verified"
          ? "Logo and colors verified"
          : brandPresentation.state === "researching"
            ? `Finding ${brandName}'s look and feel`
            : brandPresentation.state === "partial"
              ? "Brand evidence is partial"
              : "Brand visual research unavailable",
      detail: brandPresentation.detail,
      artifact: ["complete", "fallback"].includes(brandState)
        ? brandPresentation.label
        : undefined,
      status:
        brandPresentation.state === "partial" || brandPresentation.state === "unavailable"
          ? "fallback"
          : brandState,
      icon: Globe2
    },
    {
      key: "buyer",
      phase: "Your audience",
      title: audience
        ? "Audience ready"
        : audienceState === "running" ? `Finding the right buyers at ${buyerContext}` : audienceState === "complete" ? "Relevant buyers found" : "Audience check waiting",
      detail: `Using ${buyerContext}'s public product and market context to find the most relevant buying roles.`,
      artifact: audience
        ? `Built for ${audience}`
        : audienceState === "complete" && session?.audienceSuggestions.length
          ? `${session.audienceSuggestions.length} relevant roles surfaced`
          : undefined,
      status: audience ? "complete" : audienceState,
      icon: Users
    },
    {
      key: "strategy",
      phase: "Your goal",
      title: objective ? "Goal ready" : "Waiting for your goal",
      detail: "Your goal determines the promise, proof, and next step across the page.",
      artifact: objective ? `Objective · ${objective}` : undefined,
      status: objective ? "complete" : pending,
      icon: Target
    },
    {
      key: "experience",
      phase: "Your page",
      title: session?.experience
        ? "Your experience is ready"
        : experienceState === "running" ? "Building your buyer experience" : experienceState === "failed" ? "The page needs another pass" : "Page build waiting",
      detail: "Writing the story, arranging the proof, and polishing the page into one guided experience.",
      artifact: session?.experience?.title,
      status: experienceState,
      icon: Sparkles
    }
  ];
}

export function getBuildPanelCopy(session: PublicTryMeSession): BuildPanelCopy {
  const brandName = brandNameFor(session);
  const targetName = targetNameFor(session);
  const audience = audienceFor(session);
  const moments = buildMoments(session);
  const currentIndex = Math.max(
    0,
    moments.findIndex((moment) => moment.status === "running" || moment.status === "pending")
  );
  const currentMoment = moments[currentIndex] ?? moments[moments.length - 1];
  const brandPresentation = prospectBrandPresentation(
    session.brand,
    brandName,
    session.stages.brand.status
  );
  const common = {
    urlLabel: session.status === "claimed" ? "Saved URL ready" : "Private URL active",
    mobileLabel: currentMoment.title,
    mobileStep: `${Math.min(currentIndex + 1, moments.length)} of ${moments.length}`
  };

  if (brandPresentation.state !== "verified") {
    const needsReview =
      brandPresentation.state === "partial" ||
      brandPresentation.state === "unavailable";
    return {
      ...common,
      kicker: needsReview ? "Brand evidence · incomplete" : "Brand research · live",
      headline: needsReview
        ? `We found ${brandName}, but the brand system is not ready yet.`
        : `Reading ${brandName} while you keep moving.`,
      supporting: brandPresentation.detail
    };
  }

  if (session.useCase === "abm" && !session.answers.targetDomain) {
    return {
      ...common,
      kicker: `${brandName} · brand verified`,
      headline: "The seller story is ready. Now name the account.",
      supporting: "The next domain will change the buyer context, message tension, and page payoff."
    };
  }

  if (session.useCase === "abm" && session.answers.targetDomain && !session.targetBrand) {
    return {
      ...common,
      kicker: `${brandName} × ${targetName}`,
      headline: `Reading ${targetName} against ${brandName}.`,
      supporting: "Public account signals are being turned into relevant buying-role hypotheses."
    };
  }

  if (session.useCase === "campaign" && !session.answers.campaignType) {
    return {
      ...common,
      kicker: `${brandName} · brand verified`,
      headline: "The brand is ready. Choose the campaign shape.",
      supporting: "Product, demand, and event paths earn attention differently, so the page will too."
    };
  }

  if (session.useCase === "campaign" && !campaignOfferFor(session)) {
    return {
      ...common,
      kicker: `${brandName} · campaign selected`,
      headline: "The campaign shape is ready. Name the offer.",
      supporting: "The product, event, report, or initiative will now drive the audience, message, proof, and CTA treatment."
    };
  }

  if (session.useCase === "content" && !session.answers.sourceUrl && !session.answers.sourceName) {
    return {
      ...common,
      kicker: `${brandName} · brand verified`,
      headline: "The brand is ready. Add the source worth transforming.",
      supporting: "A public URL or PDF will become the factual backbone of the buyer path."
    };
  }

  if (!session.answers.audience) {
    const buyerContext = session.useCase === "abm" ? targetName : brandName;
    return {
      ...common,
      kicker: `${buyerContext} · buyer mapping`,
      headline: session.audienceSuggestions.length
        ? `Buyer hypotheses are ready for ${buyerContext}.`
        : `Finding the roles that fit ${buyerContext}.`,
      supporting: "The role you choose will change the problem, proof, and next move across the page."
    };
  }

  if (!session.answers.objective) {
    return {
      ...common,
      kicker: `${trimLabel(audience, 48)} · in focus`,
      headline: "The buyer is set. Give the experience one job.",
      supporting: "One outcome now becomes the filter for every section and interaction."
    };
  }

  return {
    ...common,
    kicker: `${brandName} · composing live`,
    headline: `Turning this brief into a live path for ${trimLabel(audience, 48)}.`,
    supporting: `The narrative, proof sequence, interaction, and ${session.answers.objective.toLowerCase()} path are being checked now.`
  };
}

export function getGuidedQuestionCopy(session: PublicTryMeSession): GuidedQuestionCopy {
  const brandName = brandNameFor(session);
  const targetName = targetNameFor(session);
  const sourceName = sourceNameFor(session);

  if (session.useCase === "abm") {
    return {
      targetTitle: "Which account are you trying to reach?",
      targetBody: `Add the account domain. We will use public signals from both companies to make ${brandName}'s page relevant.`,
      campaignTitle: "What are you promoting?",
      campaignBody: "The offer changes the message emphasis, proof, and action buyers should take.",
      sourceTitle: "Which content should do more work?",
      sourceBody: "Give us a public URL or PDF. We will preserve the facts and reshape the way buyers explore them.",
      audienceLoadingTitle: `Mapping the buying roles that fit ${targetName}.`,
      audienceLoadingBody: `We are reading ${targetName}'s public product and operating context now.`,
      audienceTitle: `Who is this experience for at ${targetName}?`,
      audienceBody: `Choose the role that should see the most value. Recommendations connect ${brandName}'s public story to ${targetName}'s business context.`,
      objectiveTitle: "What should this experience help them do?",
      objectiveBody: "Choose one goal. It will shape the page message, proof, and final button.",
      completeTitle: `${brandName} × ${targetName}. The brief is ready.`,
      completeBody: "Folloze is composing the account story, proof sequence, interaction path, and next move now."
    };
  }

  if (session.useCase === "content") {
    return {
      targetTitle: "Which account should this feel built for?",
      targetBody: "Add the target domain to create an account-specific version.",
      campaignTitle: "What are you taking to market?",
      campaignBody: "The offer changes the page structure and the action buyers should take.",
      sourceTitle: "Which piece of content should become interactive?",
      sourceBody: "We will preserve the source facts, then turn them into a guided path buyers can explore and you can measure.",
      audienceLoadingTitle: `Finding the buyers who should get more from ${sourceName}.`,
      audienceLoadingBody: `We are pairing ${brandName}'s public market context with the source now.`,
      audienceTitle: `Who should get the most from ${sourceName}?`,
      audienceBody: "Choose the buyer role. We will emphasize the source details that matter most to them.",
      objectiveTitle: `What should they do after exploring ${sourceName}?`,
      objectiveBody: "Choose one goal. It will shape the guided path and final next step.",
      completeTitle: `${sourceName} is becoming a buyer path.`,
      completeBody: "Folloze is preserving the facts while composing the guided sequence, interaction, and next move."
    };
  }

  return {
    targetTitle: "Which account should this feel built for?",
    targetBody: "Add the target domain to create an account-specific version.",
    campaignTitle: "What are you promoting?",
    campaignBody: "Choose the campaign format. It will change the message, proof emphasis, and conversion path.",
    sourceTitle: "Which content should do more work?",
    sourceBody: "Give us a public URL or PDF. We will preserve the facts and reshape the way buyers explore them.",
    audienceLoadingTitle: `Finding the buyers who should care about ${campaignOfferFor(session) || `${brandName}'s offer`}.`,
    audienceLoadingBody: `We are pairing ${brandName}'s public company and industry context with the promoted offer now.`,
    audienceTitle: `Who should see ${campaignOfferFor(session) || `${brandName}'s offer`}?`,
    audienceBody: `Choose the buyer role that should see the most value in ${campaignOfferFor(session) || `${brandName}'s offer`}.`,
    objectiveTitle: `What should ${campaignOfferFor(session) || `${brandName}'s offer`} help them do?`,
    objectiveBody: "Choose one goal. It will shape the promise, proof, and final button.",
    completeTitle: `${campaignTypeFor(session)} brief ready.`,
    completeBody: "Folloze is composing the campaign promise, proof sequence, interaction, and conversion path now."
  };
}

export function getRevealCopy(session: PublicTryMeSession): RevealCopy {
  const brandName = brandNameFor(session);
  const brandPresentation = prospectBrandPresentation(
    session.brand,
    brandName,
    session.stages.brand.status
  );
  const targetName = targetNameFor(session);
  const audience = audienceFor(session);
  const objective = session.answers.objective || "one clear next move";
  const sourceName = sourceNameFor(session);
  const campaignType = campaignTypeFor(session);
  const headline = session.experience?.headline
    || (session.useCase === "abm"
      ? `${targetName}, meet a sharper ${brandName} story.`
      : session.useCase === "content"
        ? `${sourceName} just became a buyer journey.`
        : `${brandName}'s campaign now has a live front door.`);

  if (session.useCase === "abm") {
    return {
      kicker: `${brandName} × ${targetName} · 1:1 experience`,
      headline,
      summary: `${targetName} now has a ${brandName} story for ${lowercaseInitial(audience)}, with one job: ${lowercaseInitial(objective)}.`,
      counterpart: targetName,
      receipts: [
        { number: "01", label: trimLabel(brandPresentation.label, 40) },
        { number: "02", label: `${trimLabel(targetName, 24)} context mapped` },
        { number: "03", label: `${trimLabel(audience, 30)} in focus` },
        { number: "04", label: `${trimLabel(objective, 30)} path composed` }
      ]
    };
  }

  if (session.useCase === "content") {
    return {
      kicker: `${sourceName} · transformed`,
      headline,
      summary: `${sourceName} is now a guided ${brandName} path for ${lowercaseInitial(audience)}, built to ${lowercaseInitial(objective)}.`,
      counterpart: sourceName,
      receipts: [
        { number: "01", label: trimLabel(brandPresentation.label, 40) },
        { number: "02", label: `${trimLabel(sourceName, 30)} transformed` },
        { number: "03", label: `${trimLabel(audience, 30)} lens applied` },
        { number: "04", label: `${trimLabel(objective, 30)} path composed` }
      ]
    };
  }

  return {
    kicker: `${brandName} · ${campaignType.toLowerCase()}`,
    headline,
    summary: `A private ${campaignType.toLowerCase()} preview for ${lowercaseInitial(audience)}, built to ${lowercaseInitial(objective)}.`,
    counterpart: campaignType,
    receipts: [
      { number: "01", label: trimLabel(brandPresentation.label, 40) },
      { number: "02", label: `${campaignType} framed` },
      { number: "03", label: `${trimLabel(audience, 30)} in focus` },
      { number: "04", label: `${trimLabel(objective, 30)} path composed` }
    ]
  };
}

export function getRevealShellHeadline(session: PublicTryMeSession): string {
  const brandName = brandNameFor(session);
  if (session.useCase === "abm") {
    return `${brandName} × ${targetNameFor(session)}, ready to explore.`;
  }
  if (session.useCase === "content") {
    return `${sourceNameFor(session)}, rebuilt for buyers.`;
  }
  return `Your ${brandName} ${campaignTypeFor(session).toLowerCase()} is ready to explore.`;
}

function getWhyCopy(session: PublicTryMeSession): { key: string; title: string; body: string } {
  const brandName = brandNameFor(session);
  const targetName = targetNameFor(session);
  const sourceName = sourceNameFor(session);
  const audience = session.answers.customAudience || session.answers.audience;
  const objective = session.answers.objective;
  const activeMoment = buildMoments(session).find((moment) => moment.status === "running")
    ?? buildMoments(session).find((moment) => moment.status === "pending")
    ?? buildMoments(session)[3];

  if (activeMoment.key === "brand") {
    return {
      key: "brand",
      title: `${brandName} should feel like ${brandName}.`,
      body: "Matching the identity buyers already recognize earns attention before the first sentence has to work."
    };
  }

  if (activeMoment.key === "buyer") {
    if (session.useCase === "abm") {
      return {
        key: "buyer-abm",
        title: `${targetName} is not an audience segment.`,
        body: `The page should connect ${brandName}'s value to a decision a real role at ${targetName} owns.`
      };
    }
    if (session.useCase === "content") {
      return {
        key: "buyer-content",
        title: "A source needs a point of view.",
        body: `${sourceName} becomes useful when the right buyer can see the decision inside it.`
      };
    }
    return {
      key: "buyer-campaign",
      title: "Campaign relevance starts with one buyer.",
      body: `${brandName}'s promise, proof, and CTA will all change around the role you choose.`
    };
  }

  if (activeMoment.key === "strategy") {
    return {
      key: "strategy",
      title: "One outcome sharpens everything.",
      body: `${audience || "The buyer"} should feel one clear direction, not four competing calls to action.`
    };
  }

  return {
    key: "experience",
    title: objective ? `Every section now earns “${objective}.”` : "The brief is becoming a journey.",
    body: "Folloze is checking the narrative, proof sequence, interaction path, and next move as one experience."
  };
}

function track(action: ProductEventName, detail: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  captureProductEvent(action, {
    category: ["domain_submitted", "domain_confirmed", "field_interacted", "campaign_type_selected", "audience_confirmed", "goal_confirmed"].includes(action)
      ? "input"
      : ["experience_claimed", "claim_started", "claim_completed", "claim_failed", "save_opened", "save_completed"].includes(action)
        ? "conversion"
        : action.endsWith("_failed")
          ? "error"
          : "interaction",
    properties: detail
  });
  window.dispatchEvent(new CustomEvent("try-me-track", { detail: { action, ...detail } }));
}

const apiSuccessCaptureAt = new Map<string, number>();

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const startedAt = performance.now();
  const method = init?.method ?? "GET";
  const route = url
    .split("?")[0]
    .replace(/\/api\/sessions\/[^/]+/, "/api/sessions/[id]");
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...productAnalyticsHeaders(),
        ...(init?.headers ?? {})
      }
    });
    const result = await readJsonResponse<T>(response);
    const isPollingRead = method === "GET" && route === "/api/sessions/[id]";
    const now = Date.now();
    const lastCaptured = apiSuccessCaptureAt.get(`${method}:${route}`) ?? 0;
    if (!isPollingRead || now - lastCaptured >= 10_000) {
      apiSuccessCaptureAt.set(`${method}:${route}`, now);
      captureProductEvent("api_request_completed", {
        category: "performance",
        outcome: "success",
        durationMs: Math.round(performance.now() - startedAt),
        properties: { route, method, status: response.status }
      });
    }
    return result;
  } catch (error) {
    const apiError = error instanceof ApiResponseError ? error : undefined;
    captureProductEvent("api_request_failed", {
      category: "error",
      outcome: "failure",
      durationMs: Math.round(performance.now() - startedAt),
      properties: {
        route,
        method,
        status: apiError?.status ?? 0,
        code: apiError?.code ?? "network_or_parse_error"
      },
      immediate: true
    });
    throw error;
  }
}

async function confirmHighConfidenceSource(session: PublicTryMeSession): Promise<PublicTryMeSession> {
  if (!shouldAutoConfirmSource(session)) return session;
  try {
    const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "update-workspace", sourceConfirmation: "confirmed" })
    });
    return result.session;
  } catch {
    // Keep the source intact and show the manual confirmation fallback.
    return session;
  }
}

export function preservePreviewDuringRegeneration(
  current: PublicTryMeSession | undefined,
  next: PublicTryMeSession
): PublicTryMeSession {
  if (!current?.experience || next.experience || current.id !== next.id) return next;
  return { ...next, experience: current.experience };
}

export function canClaimPreview(
  session: Pick<PublicTryMeSession, "experience" | "status"> | undefined
): boolean {
  if (!session?.experience || session.experience.readiness === "provisional") return false;
  return ["preview_ready_unclaimed", "claim_failed"].includes(session.status);
}

export function previewUpdateState(
  session: Pick<PublicTryMeSession, "experience" | "stages">
): "provisional" | "running" | "failed" | undefined {
  if (!session.experience) return undefined;
  if (
    session.experience.readiness === "provisional" &&
    session.stages.story.status === "running"
  ) return "provisional";
  if (session.stages.story.status === "running") return "running";
  if (session.stages.story.status === "failed") return "failed";
  return undefined;
}

export function PreviewUpdateNotice({
  session,
  onRetry
}: {
  session: Pick<PublicTryMeSession, "experience" | "stages">;
  onRetry: () => void;
}) {
  const state = previewUpdateState(session);
  if (!state || !session.experience) return null;
  const revision = session.experience.artifactRevision ?? 1;
  const storyDetail = session.stages.story.detail
    || session.stages.story.artifact
    || (session.stages.story.errorCode
      ? `Story worker receipt: ${session.stages.story.errorCode}`
      : undefined);

  if (state === "provisional") {
    return (
      <section className="previewUpdateNotice isRunning" role="status" aria-live="polite" data-preview-update-state="provisional">
        <span className="previewUpdateIcon" aria-hidden="true"><LoaderCircle className="spin" size={18} /></span>
        <span><strong>Your first preview is ready.</strong>Explore now while enrichment continues from worker receipts.</span>
        <small><i className="liveDot" />{storyDetail || "Story enrichment receipt · running"}</small>
      </section>
    );
  }

  if (state === "running") {
    return (
      <section className="previewUpdateNotice isRunning" role="status" aria-live="polite" data-preview-update-state="running">
        <span className="previewUpdateIcon" aria-hidden="true"><LoaderCircle className="spin" size={18} /></span>
        <span><strong>Updating this preview</strong>Revision {revision} stays fully interactive while Folloze writes the replacement.</span>
        <small><i className="liveDot" />{storyDetail || `Revision ${revision} live`}</small>
      </section>
    );
  }

  return (
    <section className="previewUpdateNotice isFailed" role="alert" data-preview-update-state="failed">
      <span className="previewUpdateIcon" aria-hidden="true"><ShieldCheck size={18} /></span>
      <span><strong>Your current preview is still live.</strong>The replacement did not finish. Folloze preserved revision {revision} so you can keep exploring it.</span>
      <button type="button" onClick={onRetry}><RefreshCw size={14} />Retry update</button>
    </section>
  );
}

async function recordPreviewSignal(
  sessionId: string,
  event: "preview-opened" | "section-viewed" | "lens-selected" | "cta-clicked" | "journey-complete",
  elementId?: string,
  value?: string
): Promise<PublicTryMeSession> {
  const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${sessionId}`, {
    method: "POST",
    body: JSON.stringify({ operation: "preview-interaction", event, elementId, value })
  });
  return result.session;
}

function uploadSizeBucket(bytes: number): string {
  if (bytes < 1024 * 1024) return "under_1mb";
  if (bytes < 5 * 1024 * 1024) return "1_to_5mb";
  return "5_to_10mb";
}

async function reportClientUploadFailure(sessionId: string, file: File, error: unknown): Promise<string | undefined> {
  if (error instanceof ApiResponseError && error.requestId) return error.requestId;
  try {
    const response = await fetch(`/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "try-me.client-upload-error",
        status: error instanceof ApiResponseError ? error.status : undefined,
        code: uploadErrorCode(error),
        fileSize: file.size
      })
    });
    const result = await readJsonResponse<{ requestId?: string }>(response);
    return result.requestId;
  } catch {
    return undefined;
  }
}

function CopyButton({ value, label = "Copy URL", className }: { value: string; label?: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2_000);
    } catch {
      setStatus("failed");
    }
  };
  const visibleLabel = status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : label;
  return (
    <button type="button" className={className} onClick={() => void copy()}>
      <Clipboard size={16} />{visibleLabel}
      <span className="srOnly" aria-live="polite">{status === "copied" ? "Link copied to clipboard." : status === "failed" ? "Clipboard access failed. Select and copy the URL shown on the page." : ""}</span>
    </button>
  );
}

function StatusMark({ state }: { state: StageState }) {
  if (state.status === "complete" || state.status === "fallback") {
    return (
      <span className={`statusMark isDone ${state.status === "fallback" ? "isFallback" : ""}`}>
        <Check size={15} strokeWidth={2.5} />
      </span>
    );
  }
  if (state.status === "running") {
    return (
      <span className="statusMark isRunning">
        <LoaderCircle size={16} />
      </span>
    );
  }
  if (state.status === "failed") {
    return (
      <span className="statusMark isFailed">
        <X size={15} />
      </span>
    );
  }
  return <span className="statusMark" />;
}

function LiveChecklist({ session, compact = false }: { session?: PublicTryMeSession; compact?: boolean }) {
  const moments = buildMoments(session);
  const lockedCount = moments.filter((moment) => ["complete", "fallback"].includes(moment.status)).length;
  const currentKey = moments.find((moment) => moment.status === "running")?.key
    ?? moments.find((moment) => moment.status === "pending")?.key;
  return (
    <div className={compact ? "checklist compactChecklist" : "checklist"} aria-live="polite">
      {!compact && (
        <div className="buildLedgerHeader">
          <div>
            <span>{lockedCount} of {moments.length} intelligence layers ready</span>
            <strong>{lockedCount === moments.length ? "Experience ready" : `Now assembling · ${moments.find((moment) => moment.key === currentKey)?.phase || "Live brief"}`}</strong>
          </div>
          <span className="buildOrbit" aria-hidden="true"><i /><i /><i /></span>
        </div>
      )}
      <div className="buildProgress" aria-hidden="true"><span style={{ width: `${(lockedCount / moments.length) * 100}%` }} /></div>
      {moments.map((moment, index) => {
        const state: StageState = { status: moment.status };
        const Icon = moment.icon;
        return (
          <div className={`checkRow is-${state.status} ${moment.key === currentKey ? "isCurrent" : ""}`} key={moment.key}>
            <StatusMark state={state} />
            <div className="checkIcon">
              <Icon size={17} />
            </div>
            <div className="checkCopy">
              <span className="checkPhase">{String(index + 1).padStart(2, "0")} · {moment.phase}</span>
              <strong>{moment.title}</strong>
              {!compact && <span>{moment.artifact || moment.detail}</span>}
            </div>
            {moment.key === currentKey && moment.status === "running" && <span className="workingNow">Live</span>}
          </div>
        );
      })}
    </div>
  );
}

type OverviewFieldKey = "seller" | "target" | "offer" | "audience" | "objective" | "experienceType";

type OverviewRow = {
  key: OverviewFieldKey;
  label: string;
  detail: string;
  value?: string;
  provenance?: BriefFieldProvenance;
  required: boolean;
  icon: typeof Building2;
};

export function briefProvenanceLabel(provenance: BriefFieldProvenance): string {
  switch (provenance) {
    case "user":
      return "You said";
    case "inferred":
      return "We inferred";
    case "research":
      return "Public research";
    default: {
      const exhaustive: never = provenance;
      return exhaustive;
    }
  }
}

function inferredAudienceFor(session: PublicTryMeSession): string | undefined {
  if (session.answers.audience) return audienceFor(session);
  return session.audienceRecommendations?.[0]?.label || session.audienceSuggestions[0];
}

export function overviewRowsFor(session: PublicTryMeSession): OverviewRow[] {
  const briefFields = session.campaignBrief?.fields;
  const sourceValue = session.answers.sourceTitle
    || session.answers.sourceName?.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ")
    || (session.answers.sourceUrl ? "Public content URL" : undefined);
  const inferredAudience = inferredAudienceFor(session);
  const offerValue = briefFields?.offer?.value
    || campaignOfferFor(session)
    || (session.useCase === "content" ? sourceValue : undefined);
  const objectiveValue = briefFields?.objective?.value
    || session.answers.objective
    || recommendedObjectiveFor(session);
  const rows: Record<OverviewFieldKey, OverviewRow> = {
    seller: {
      key: "seller",
      label: briefFields?.seller?.label || "Building as",
      detail: "Brand and identity",
      value: briefFields?.seller?.value || brandNameFor(session),
      provenance: briefFields?.seller?.provenance || (session.brand ? "research" : "inferred"),
      required: true,
      icon: Building2
    },
    target: {
      key: "target",
      label: briefFields?.target?.label || "Building for",
      detail: "Target account",
      value: briefFields?.target?.value || (session.answers.targetDomain ? targetNameFor(session) : undefined),
      provenance: briefFields?.target?.provenance
        || (session.answers.targetDomain ? "user" : undefined)
        || (session.targetBrand ? "research" : undefined),
      required: session.useCase === "abm",
      icon: Target
    },
    offer: {
      key: "offer",
      label: session.useCase === "content" ? "Source content" : briefFields?.offer?.label || "Promoting",
      detail: session.useCase === "content" ? "Factual source" : "Campaign offer",
      value: offerValue,
      provenance: briefFields?.offer?.provenance
        || (session.answers.promotedOffer ? "user" : undefined)
        || (session.campaignOfferSource?.title ? "research" : undefined)
        || (offerValue ? "inferred" : undefined),
      required: session.useCase !== "abm",
      icon: FileText
    },
    audience: {
      key: "audience",
      label: briefFields?.audience?.label || "For",
      detail: "Buyer persona",
      value: briefFields?.audience?.value || inferredAudience,
      provenance: briefFields?.audience?.provenance
        || (session.answers.audience ? "user" : undefined)
        || (inferredAudience ? "inferred" : undefined),
      required: true,
      icon: Users
    },
    objective: {
      key: "objective",
      label: briefFields?.objective?.label || "To achieve",
      detail: "Desired outcome",
      value: objectiveValue,
      provenance: briefFields?.objective?.provenance
        || (session.answers.objective ? "user" : undefined)
        || (objectiveValue ? "inferred" : undefined),
      required: true,
      icon: Gauge
    },
    experienceType: {
      key: "experienceType",
      label: "Experience type",
      detail: "Inferred output family",
      value: experienceTypeLabelFor(session),
      provenance: "inferred",
      required: true,
      icon: Layers3
    }
  };
  // Every motion presents the same field grammar. For campaign/content,
  // "target" becomes the people the experience is intended to help rather than
  // a named account. This keeps the visible brief simple without collapsing
  // seller, source/offer, audience, and objective in the underlying session.
  if (session.useCase !== "abm") {
    rows.target = {
      key: "target",
      label: "Who it is for",
      detail: "Intended buyer",
      value: briefFields?.target?.value || inferredAudience,
      provenance: briefFields?.target?.provenance
        || (session.answers.audience ? "user" : undefined)
        || (inferredAudience ? "inferred" : undefined),
      required: true,
      icon: Target
    };
    rows.offer.label = session.useCase === "content" ? "What it is about" : "What it is about";
    rows.offer.detail = session.useCase === "content" ? "Source content" : "Offer or campaign";
    rows.audience.label = "Buyer group";
    rows.objective.label = "What they should do";
  } else {
    rows.seller.label = "Your brand";
    rows.target.label = "Who it is for";
    rows.offer.label = "What it is about";
    rows.audience.label = "Buyer group";
    rows.objective.label = "What they should do";
  }
  return (["seller", "target", "offer", "audience", "objective", "experienceType"] as OverviewFieldKey[]).map((key) => rows[key]);
}

export function liveBriefFilledCount(session: PublicTryMeSession): number {
  return overviewRowsFor(session)
    .filter((row) => row.key !== "experienceType")
    .filter((row) => Boolean(row.value)).length;
}

export function canSkipStreamingCampaign(session: PublicTryMeSession): boolean {
  if (session.useCase !== "campaign") return false;
  return liveBriefFilledCount(session) >= STREAMING_BRIEF_SKIP_THRESHOLD
    && Boolean(campaignOfferFor(session));
}

export function audienceHubFindingsFor(session: PublicTryMeSession): StreamingAudienceFinding[] {
  if (session.audienceLens?.findings.length) {
    return session.audienceLens.findings.slice(0, 3).map((finding) => ({
      id: finding.id,
      label: finding.label,
      text: finding.text
    }));
  }
  return (session.evidenceItems ?? [])
    .filter((item) => item.disposition !== "excluded")
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      label: item.label,
      text: item.text
    }));
}

function overviewQuestionFor(field: OverviewFieldKey, useCase: UseCase): string | undefined {
  switch (field) {
    case "offer":
      return useCase === "abm" ? undefined : "intent";
    case "target":
      return useCase === "abm" ? undefined : "audience";
    case "audience":
      return "audience";
    case "objective":
      return "goal";
    case "seller":
    case "experienceType":
      return undefined;
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

export function CampaignOverviewRail({
  session,
  onEdit
}: {
  session: PublicTryMeSession;
  onEdit?: (field: OverviewFieldKey) => void;
}) {
  const rows = overviewRowsFor(session);
  const filledCount = rows.filter((row) => Boolean(row.value)).length;
  const findings = audienceHubFindingsFor(session);
  const moments = buildMoments(session);
  const activeMoment = moments.find((moment) => moment.status === "running")
    || moments.find((moment) => moment.status === "pending")
    || moments.at(-1);
  const waitingForInput = activeMoment?.status === "pending";
  const hubName = session.useCase === "abm" ? targetNameFor(session) : brandNameFor(session);

  return (
    <section className="campaignOverview liveBriefRail" aria-labelledby="campaign-overview-title" data-live-brief="true">
      <div className="campaignOverviewHeader">
        <div>
          <span className="sectionKicker">Live brief</span>
          <h2 id="campaign-overview-title">What Folloze is building</h2>
        </div>
        <span className="overviewCount" data-overview-count={`${filledCount}/${rows.length}`}>
          {filledCount} of {rows.length}
        </span>
      </div>
      <p className="campaignOverviewIntro">The experience updates from these simple signals. Change a choice whenever you need to.</p>
      <div className="overviewFieldList" aria-label="Live experience brief">
        {rows.map((row) => {
          const Icon = row.icon;
          const complete = Boolean(row.value);
          return (
            <button
              className={`overviewField ${complete ? "is-complete" : "is-current"}`}
              data-overview-field={row.key}
              key={row.key}
              type="button"
              onClick={() => onEdit?.(row.key)}
              aria-label={onEdit ? `Edit ${row.label}` : undefined}
              disabled={!onEdit}
            >
              <span className="overviewFieldIcon" aria-hidden="true"><Icon size={17} /></span>
              <div>
                <span>{row.label}</span>
                <strong>{row.value || "Waiting for this signal"}</strong>
                {complete && row.provenance && (
                  <em className="overviewFieldProvenance">{briefProvenanceLabel(row.provenance)}</em>
                )}
              </div>
              <span className="overviewFieldState" aria-label={complete ? "Done" : "Next signal"} title={complete ? "Done" : "Next signal"}>{complete ? <Check size={14} /> : <ArrowRight size={14} />}</span>
            </button>
          );
        })}
      </div>
      {findings.length > 0 && (
        <section className="audienceHubLite" aria-labelledby="audience-hub-lite-title">
          <span className="sectionKicker">Audience Hub</span>
          <h3 id="audience-hub-lite-title">What we know about {hubName}</h3>
          <ul>
            {findings.map((finding) => (
              <li key={finding.id}>
                <small>{finding.label}</small>
                <p>{finding.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {activeMoment && (
        <div className={`overviewNow is-${activeMoment.status} ${waitingForInput ? "is-waiting" : ""}`} role="status" aria-live="polite">
          <span>{!waitingForInput && <span className="liveDot" />}{waitingForInput ? "Ready for your next choice" : "Folloze is working"}</span>
          <strong>{session.status === "generation_failed" ? "Build paused — your brief is safe" : activeMoment.title}</strong>
          <p>{session.status === "generation_failed" ? `Retry with support reference ${session.supportRef}.` : activeMoment.detail}</p>
        </div>
      )}
    </section>
  );
}

export function UseCasePortals({
  onSelect,
  disabled = false
}: {
  onSelect: (value: UseCase, campaignMode?: CampaignEntryMode) => void;
  onWatchBuild?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="unifiedEntry" aria-label="Start building a buyer experience">
      <button
        type="button"
        className="unifiedPrimaryCta"
        disabled={disabled}
        onClick={() => {
          captureUnifiedProductEvent("unified_entry_started", {
            properties: { entry_surface: "homepage", device_class: "desktop" }
          });
          onSelect("campaign", "campaign");
        }}
      >
        <span>Primary path</span>
        <strong>Build a buyer experience</strong>
        <small>Add your company and a few signals. Folloze infers the experience type and assembles the page.</small>
        <ArrowRight size={18} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="unifiedSecondaryCta"
        disabled={disabled}
        onClick={() => {
          captureUnifiedProductEvent("unified_entry_started", {
            properties: { entry_surface: "content_magic", device_class: "desktop" }
          });
          onSelect("content");
        }}
      >
        Or open Content Magic to make a URL or PDF interactive
      </button>

      <aside className="northpeakWorkedStates" aria-label="Optional Northpeak worked states">
        <span className="sectionKicker">Optional examples</span>
        <ul>
          {northpeakWorkedStates.map((example) => (
            <li key={example.id}>
              <a
                href={example.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("example_opened", { useCase: example.id === "account" ? "abm" : "campaign" })}
              >
                <ExternalLink size={14} aria-hidden="true" />
                {example.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function DomainStart({
  useCase,
  campaignMode,
  domain,
  onDomain,
  onBack,
  onContinue,
  isStarting,
  preflightStatus,
  error
}: {
  useCase: UseCase;
  campaignMode?: CampaignEntryMode;
  domain: string;
  onDomain: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  isStarting: boolean;
  preflightStatus: "idle" | "scheduled" | "starting" | "started" | "failed";
  error?: string;
}) {
  const portal = campaignMode === "event"
    ? useCaseContent.content
    : useCase === "campaign"
      ? {
          ...useCaseContent.campaign,
          domainTitle: "Start with your company.",
          domainBody: "Enter your company domain. Folloze begins matching the brand, then asks only for the signals still missing."
        }
      : useCaseContent[useCase];
  const normalizedDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const domainReady = likelyDomain.test(normalizedDomain);
  const preflightActive = preflightStatus === "starting" || preflightStatus === "started";
  const scanDetail = isStarting
    ? `Opening the guided brief for ${normalizedDomain}`
    : preflightStatus === "starting"
      ? `Starting the public brand scan for ${normalizedDomain}`
      : preflightStatus === "started"
        ? `Public brand scan started for ${normalizedDomain}`
        : `Ready to match ${normalizedDomain}`;
  const helpText = error || (isStarting
    ? "Opening the guided brief with the brand evidence already in progress…"
    : preflightStatus === "starting"
      ? "The public brand scan is starting in the background. Confirm whenever you are ready."
      : preflightStatus === "started"
        ? "The public brand scan is already running. Confirm to continue into the guided brief."
        : preflightStatus === "failed"
          ? "The early scan was interrupted. We will retry when you confirm this company."
          : domainReady
            ? "Pause briefly and we will begin matching the public brand automatically."
            : "Enter a company domain to start the brand match.");
  return (
    <section className={`domainStage ${useCase === "campaign" ? "isStreamingDomain" : ""}`}>
          <button className="textBack buttonTertiary" type="button" onClick={onBack}><ArrowLeft size={16} />Back to start</button>
      <div className="domainStageGrid">
        <div className="domainPrompt">
          <span className="sectionKicker">Start with the brand</span>
          <h2>{portal.domainTitle}</h2>
          <p>{portal.domainBody}</p>
          <div className="domainPromise"><ShieldCheck size={18} /><span><strong>We verify the brand before we build.</strong> You will see the company, logo, and palette we found before we tailor the experience.</span></div>
        </div>
        <form className={`domainInput ${isStarting ? "isWorking" : ""}`} onSubmit={(event) => { event.preventDefault(); onContinue(); }}>
          <label htmlFor="company-domain">Company domain</label>
          <div>
            <Globe2 size={20} />
            <input
              id="company-domain"
              value={domain}
              onChange={(event) => onDomain(event.target.value)}
              placeholder="yourcompany.com"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
              disabled={isStarting}
              aria-describedby={error ? "domain-error" : "domain-help"}
            />
            {isStarting && <LoaderCircle className="spin" size={19} />}
          </div>
          {(domainReady || isStarting) && (
            <div className={`domainScanStrip ${isStarting || preflightStatus === "starting" ? "isScanning" : "isReady"}`} role="status" aria-live="polite">
              <span className="domainScanDot" aria-hidden="true"><i /></span>
              <div><strong>{normalizedDomain}</strong><small>{scanDetail}</small></div>
              {isStarting || preflightStatus === "starting" ? <LoaderCircle className="spin" size={16} /> : preflightActive ? <Check size={16} /> : null}
            </div>
          )}
          <small id={error ? "domain-error" : "domain-help"} className={error ? "fieldError" : ""}>
            {helpText}
          </small>
          <button className="buttonPrimary domainContinue" type="submit" disabled={!likelyDomain.test(domain.trim()) || isStarting}>
            {isStarting ? "Opening the guided brief" : "Use this company"}{isStarting ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}
          </button>
        </form>
      </div>
    </section>
  );
}

function ConversationThread({ session, onRestart }: { session: PublicTryMeSession; onRestart: () => void }) {
  const brandName = brandNameFor(session);
  const targetName = targetNameFor(session);
  const contextComplete = session.useCase === "abm"
    ? Boolean(session.answers.targetDomain)
    : session.useCase === "campaign"
      ? campaignIntakeComplete(session)
      : Boolean(session.answers.sourceUrl || session.answers.sourceName);
  const audienceComplete = Boolean(session.answers.audience && (session.answers.audience !== "Other" || session.answers.customAudience));
  const objectiveComplete = Boolean(session.answers.objective);
  const contextLabel = session.useCase === "abm" ? "Account" : session.useCase === "campaign" ? "Offer" : "Source";
  const contextValue = session.useCase === "abm"
    ? targetName
    : session.useCase === "campaign"
      ? `${campaignOfferFor(session) || campaignTypeFor(session)} · ${campaignTypeFor(session)}`
      : sourceNameFor(session);
  const decisions = [
    { label: contextLabel, complete: contextComplete },
    { label: "Audience", complete: audienceComplete },
    { label: "Goal", complete: objectiveComplete }
  ];
  const currentIndex = Math.min(decisions.findIndex((decision) => !decision.complete), 2);
  const activeIndex = currentIndex < 0 ? 2 : currentIndex;
  const brandResolved = ["complete", "fallback"].includes(session.stages.brand.status);
  const sellerBrandPresentation = prospectBrandPresentation(
    session.brand,
    brandName,
    session.stages.brand.status
  );
  const targetBrandPresentation = prospectBrandPresentation(
    session.targetBrand,
    targetName,
    session.targetBrand ? "complete" : "running"
  );
  const brandVerified = sellerBrandPresentation.state === "verified";
  const targetVerified = targetBrandPresentation.state === "verified";
  const latestSelection = objectiveComplete
    ? { label: "Outcome", value: session.answers.objective || "" }
    : audienceComplete
      ? { label: "Buyer persona", value: audienceFor(session) }
      : contextComplete
        ? { label: contextLabel, value: contextValue }
        : undefined;

  return (
    <section className="guidedThread" aria-labelledby="guided-thread-title" data-guided-composer="true">
      <div className="guidedThreadHeader">
        <span className="guideAvatar" aria-hidden="true"><Sparkles size={16} /></span>
        <div><span>Live brief</span><h2 id="guided-thread-title">Folloze is turning your inputs into a focused buyer experience.</h2></div>
      </div>
      <div className="conversationHistory">
        <article className="guideBubble">
          <span><ShieldCheck size={14} />Identity check</span>
          <div className="identityMessage">
            <span className="identityLogo">
              <SafeBrandLogo session={session} owner="seller" companyName={brandName} fallback={<Building2 size={18} />} />
            </span>
            <div><strong>{brandResolved ? brandName : `Checking ${brandName}`}</strong><small>{session.companyDomain} · {sellerBrandPresentation.detail}</small></div>
            {brandVerified && <CircleCheck size={18} className="identityCheck" aria-label="Seller brand evidence verified" />}
          </div>
        </article>
        {latestSelection && (
          <article className="prospectBubble compactTurnReceipt">
            <span>Brief updated</span><strong>{latestSelection.label}: {latestSelection.value}</strong>
            {session.useCase === "content" && latestSelection.label === contextLabel && <button type="button" onClick={onRestart}><PencilLine size={13} />Replace source</button>}
          </article>
        )}
        {session.useCase === "abm" && session.answers.targetDomain && (
          <article className="guideBubble compactGuideBubble">
            <span><Search size={14} />Account check</span>
            <div className="identityMessage">
              <span className="identityLogo">
                <SafeBrandLogo session={session} owner="target" companyName={targetName} fallback={<Target size={18} />} />
              </span>
              <div><strong>{session.targetBrand ? targetName : `Researching ${targetName}`}</strong><small>{session.answers.targetDomain} · {targetBrandPresentation.detail}</small></div>
              {targetVerified && <CircleCheck size={18} className="identityCheck" aria-label="Target brand evidence verified" />}
            </div>
          </article>
        )}
      </div>
      <div className="briefNextSignal" role="status" aria-live="polite"><span>{decisions[activeIndex]?.complete ? "Brief ready" : `Next: ${decisions[activeIndex]?.label ?? "final check"}`}</span><small>One decision at a time. You can edit the brief any time.</small></div>
      <button type="button" className="identityReset buttonTertiary" onClick={onRestart}>{brandResolved && !brandVerified ? "Brand evidence looks wrong? Try another domain" : "Something look wrong? Start over"}</button>
    </section>
  );
}

function ChipGroup({
  label,
  options,
  value,
  recommendedOption,
  disabled,
  onChange
}: {
  label: string;
  options: string[];
  value?: string;
  recommendedOption?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="chipFieldset" disabled={disabled} aria-busy={disabled || undefined}>
      <legend>{label}</legend>
      <div className="chipGrid">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={`choiceChip ${value === option ? "isSelected" : ""}`}
            aria-pressed={value === option}
            aria-label={`${option}${recommendedOption === option ? ", recommended" : ""}`}
            onClick={() => onChange(option)}
          >
            <span className="choiceLabel"><span>{option}</span>{recommendedOption === option && <span className="recommendedChip" aria-hidden="true">Recommended</span>}</span>
            <span className="choiceRadio" aria-hidden="true">{value === option ? <Check size={14} /> : <i />}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type ContextMode = "text" | "url" | "pdf";

export type PdfUploadFeedback = {
  status: "idle" | "uploading" | "processing" | "accepted" | "error";
  fileName?: string;
  message?: string;
};

const idlePdfUpload: PdfUploadFeedback = { status: "idle" };

function PdfUploadProgress({ feedback }: { feedback: PdfUploadFeedback }) {
  if (feedback.status === "idle") return null;
  const active = feedback.status === "uploading" || feedback.status === "processing";
  return (
    <span
      className={`pdfUploadProgress is-${feedback.status}`}
      role={feedback.status === "error" ? "alert" : "status"}
      aria-live={feedback.status === "error" ? "assertive" : "polite"}
    >
      <span className="pdfUploadProgressIcon" aria-hidden="true">
        {active ? <LoaderCircle className="spin" size={16} /> : feedback.status === "accepted" ? <Check size={16} /> : <X size={16} />}
      </span>
      <span>
        <strong>{feedback.status === "uploading" ? "Uploading securely" : feedback.status === "processing" ? "Reading your document" : feedback.status === "accepted" ? "PDF accepted" : "Upload needs attention"}</strong>
        <small>{feedback.message || feedback.fileName}</small>
      </span>
      {active && <i className="pdfUploadProgressTrack"><i /></i>}
    </span>
  );
}

export function IntentComposer({
  session,
  answers,
  isSaving,
  pdfUpload = idlePdfUpload,
  onPatch,
  onUpload
}: {
  session: PublicTryMeSession;
  answers: SessionAnswers;
  isSaving: boolean;
  pdfUpload?: PdfUploadFeedback;
  onPatch: (patch: SessionAnswers) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}) {
  const [mode, setMode] = useState<ContextMode>("text");
  const [contextText, setContextText] = useState(answers.messageBelief ?? "");
  const [contextUrl, setContextUrl] = useState("");
  const textValue = contextText.trim();
  const sourceOpen = !answers.sourceUrl && !answers.sourceName;
  const savedText = answers.messageBelief?.trim() ?? "";
  const canSaveText = textValue.length >= 4 && textValue.length <= 240 && textValue !== savedText;
  const canSaveUrl = sourceOpen && /^https:\/\/[^\s]+$/i.test(contextUrl.trim());
  const interpretation = interpretConversationalBrief(textValue, session.useCase);
  const interpretedSignals = [
    interpretation.targetAccount && { label: "Account", hint: interpretation.targetAccount },
    interpretation.offer && { label: "Offer", hint: interpretation.offer },
    interpretation.sourceUrl && { label: "Source", hint: interpretation.sourceUrl },
    interpretation.audience && { label: "Buyer group", hint: interpretation.audience },
    interpretation.objective && { label: "Outcome", hint: interpretation.objective }
  ].filter((value): value is { label: string; hint: NonNullable<typeof interpretation.targetAccount> } => Boolean(value));
  let attachmentLabel = answers.sourceName;
  if (!attachmentLabel && answers.sourceUrl) {
    try {
      attachmentLabel = new URL(answers.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      attachmentLabel = "Public source";
    }
  }
  const composerCopy = session.useCase === "abm"
    ? {
        kicker: "Start with one sentence",
        title: "What should this account care about?",
        body: "Describe the account conversation in plain language, or attach a product source. Folloze will turn it into a structured brief you can review."
      }
    : session.useCase === "campaign"
      ? {
          kicker: "Start with one sentence",
          title: "What are you launching?",
          body: "Describe the offer and the buyers you want to reach, or attach the product page. Folloze will organize the details for you."
        }
      : {
          kicker: "Start with the source",
          title: "What should this content help buyers understand?",
          body: "Add one sentence, a public URL, or a PDF. Folloze will preserve the facts and shape the buyer experience around them."
        };
  const submitText = () => {
    if (!canSaveText) return;
    const patch: SessionAnswers = { messageBelief: textValue };
    if (sourceOpen && interpretation.sourceUrl) {
      patch.sourceUrl = interpretation.sourceUrl.value;
    }
    if (interpretation.audience) {
      patch.audience = "Other";
      patch.customAudience = interpretation.audience.value;
    }
    if (interpretation.objective && objectives[session.useCase].includes(interpretation.objective.value)) {
      patch.objective = interpretation.objective.value;
    }
    if (interpretation.cta) {
      patch.messageAction = interpretation.cta.value;
    }
    if (session.useCase === "campaign") {
      if (interpretation.campaignType) {
        patch.campaignType = interpretation.campaignType.value as SessionAnswers["campaignType"];
      }
      if (interpretation.offer) {
        patch.promotedOffer = interpretation.offer.value;
        patch.promotedOfferConfirmed = true;
      }
    }
    void onPatch(patch);
  };

  return (
    <section className="contextComposer intentComposer" aria-labelledby="context-composer-title" data-intent-composer="true">
      <div className="contextComposerHeader">
        <div>
          <span className="sectionKicker">{savedText ? "Refine the experience" : composerCopy.kicker}</span>
          <h2 id="context-composer-title">{savedText ? "Tell Folloze anything else that matters." : composerCopy.title}</h2>
        </div>
        {savedText && <span className="contextSaved"><Check size={13} />Added to brief</span>}
      </div>
      <p>{savedText ? "Type a useful note, attach a public URL, or add a PDF. Folloze will incorporate only what helps the buyer story." : composerCopy.body}</p>
      <div className="contextModeRail composerTools" role="tablist" aria-label="Add context to the live brief">
        <button id="context-tab-text" type="button" role="tab" aria-controls="context-panel-text" aria-selected={mode === "text"} className={mode === "text" ? "isActive" : ""} onClick={() => setMode("text")}><MessageSquareText size={16} />Add a note</button>
        <button id="context-tab-url" type="button" role="tab" aria-controls="context-panel-url" aria-selected={mode === "url"} className={mode === "url" ? "isActive" : ""} onClick={() => setMode("url")}><ExternalLink size={16} />Attach URL</button>
        <button id="context-tab-pdf" type="button" role="tab" aria-controls="context-panel-pdf" aria-selected={mode === "pdf"} className={mode === "pdf" ? "isActive" : ""} onClick={() => setMode("pdf")}><FileText size={16} />Attach PDF</button>
      </div>
      {attachmentLabel && <div className="composerAttachment" role="status"><Check size={14} /><span>Source attached: <strong>{attachmentLabel}</strong></span></div>}
      {mode === "text" && (
        <div className="contextPanel" role="tabpanel" id="context-panel-text" aria-labelledby="context-tab-text">
          <label htmlFor="optional-context-text">What should the buyer understand, believe, or do?</label>
          <textarea
            id="optional-context-text"
            value={contextText}
            onChange={(event) => setContextText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submitText();
              }
            }}
            placeholder="For example: Lead with the cost of disconnected buyer journeys, then show a practical next step."
            maxLength={240}
          />
          <div className="contextPanelFooter">
            <small>{contextText.length}/240 · Cmd/Ctrl + Enter to add</small>
            <button className="contextAddButton" type="button" disabled={isSaving || !canSaveText} onClick={submitText}>
              {isSaving ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{savedText ? "Update brief" : interpretedSignals.length ? "Use these details" : "Add to brief"}
            </button>
          </div>
          {textValue.length >= 4 && (
            <div className="interpretationReceipt" role="status" aria-live="polite" data-interpretation-receipt="true">
              <span><Sparkles size={13} />I’m reading this as</span>
              {interpretedSignals.length > 0 ? (
                <ul>{interpretedSignals.slice(0, 3).map(({ label, hint }) => <li key={label}><strong>{label}</strong><span>{hint.value}</span><small>from your note</small></li>)}</ul>
              ) : <p>Helpful direction for the buyer story. Add it when it looks right.</p>}
            </div>
          )}
        </div>
      )}
      {mode === "url" && (
        <div className={`contextPanel ${sourceOpen ? "" : "isUnavailable"}`} role="tabpanel" id="context-panel-url" aria-labelledby="context-tab-url">
          <label htmlFor="optional-context-url">Public HTTPS URL</label>
          <div className="contextUrlInput"><ExternalLink size={17} /><input id="optional-context-url" value={contextUrl} disabled={!sourceOpen || isSaving} onChange={(event) => setContextUrl(event.target.value)} placeholder="https://yourcompany.com/resource" inputMode="url" /></div>
          <div className="contextPanelFooter">
            <small>{sourceOpen ? session.useCase === "content" ? "Uses this URL as the factual content source." : "Adds optional evidence or context. Seller, target, and offer stay separate." : "One source is already attached to this brief."}</small>
            <button className="contextAddButton" type="button" disabled={isSaving || !canSaveUrl} onClick={() => void onPatch({ sourceUrl: contextUrl.trim() })}>
              <ExternalLink size={15} />Use this URL
            </button>
          </div>
        </div>
      )}
      {mode === "pdf" && (
        <div className={`contextPanel contextPdfPanel ${sourceOpen ? "" : "isUnavailable"} is-${pdfUpload.status}`} role="tabpanel" id="context-panel-pdf" aria-labelledby="context-tab-pdf" aria-busy={pdfUpload.status === "uploading" || pdfUpload.status === "processing" || undefined}>
          {pdfUpload.status === "accepted" ? <CircleCheck size={21} /> : pdfUpload.status === "error" ? <X size={21} /> : <FileText size={21} />}
          <div><strong>{pdfUpload.status === "accepted" ? "PDF accepted and added" : pdfUpload.status === "error" ? "That PDF was not added" : sourceOpen ? session.useCase === "content" ? "Add a PDF source" : "Add a supporting PDF" : "One source is already attached"}</strong><span>{pdfUpload.status === "accepted" ? pdfUpload.message || pdfUpload.fileName : pdfUpload.status === "error" ? pdfUpload.message : sourceOpen ? session.useCase === "content" ? "Up to 10 MB. Used only to build this experience." : "Adds optional evidence or context. Seller, target, and offer stay separate." : "A brief accepts one public URL or PDF at a time."}</span></div>
          {(sourceOpen || pdfUpload.status === "error") && pdfUpload.status !== "accepted" && (
            <label className={`contextUploadButton ${sourceOpen ? "" : "isDisabled"}`}>
              {pdfUpload.status === "error" ? "Choose another PDF" : "Choose PDF"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={!sourceOpen || isSaving}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void onUpload(file);
                }}
              />
            </label>
          )}
          <PdfUploadProgress feedback={pdfUpload} />
        </div>
      )}
    </section>
  );
}

// Compatibility export for existing callers and tests while the UI adopts the
// conversational-composer language.
export const OptionalContextComposer = IntentComposer;

export function SourceUnderstandingSummary({
  insight
}: {
  insight: NonNullable<PublicTryMeSession["sourceInsight"]>;
}) {
  const ready = insight.status === "ready";
  const pages = insight.extraction.extractedPageCount ?? insight.extraction.pageCount;
  return (
    <section className={`sourceInsightCard is-${insight.status}`} aria-labelledby="source-insight-title">
      <div className="sourceInsightHeader">
        <span className="sourceInsightIcon" aria-hidden="true"><ShieldCheck size={18} /></span>
        <div>
          <span>Source understanding</span>
          <h2 id="source-insight-title">Here&apos;s what we understood.</h2>
        </div>
        <span className="sourceInsightStatus">{ready ? "Grounded" : "Reviewing"}</span>
      </div>
      {insight.title && <strong className="sourceInsightTitle">{insight.title}</strong>}
      {insight.premise && <p>{insight.premise}</p>}
      {insight.claims.length > 0 && (
        <ul>
          {insight.claims.slice(0, 2).map((claim) => (
            <li key={claim.id}>
              <span>{claim.text}</span>
              {claim.sourceLabels.length > 0 && <small>{claim.sourceLabels.join(" · ")}</small>}
            </li>
          ))}
        </ul>
      )}
      <div className="sourceInsightMeta">
        <span>{insight.citationCount} cited source block{insight.citationCount === 1 ? "" : "s"}</span>
        {pages ? <span>{pages} page{pages === 1 ? "" : "s"} read</span> : null}
        <span>{insight.confidence} confidence</span>
      </div>
    </section>
  );
}

export function ProgressiveQuestions({
  session,
  answers,
  isSaving,
  pdfUpload = idlePdfUpload,
  onPatch,
  onBackgroundPatch,
  onWorkspacePatch,
  onUpload
}: {
  session: PublicTryMeSession;
  answers: SessionAnswers;
  isSaving: boolean;
  pdfUpload?: PdfUploadFeedback;
  onPatch: (patch: SessionAnswers) => Promise<void>;
  onBackgroundPatch?: (patch: SessionAnswers) => Promise<void>;
  onWorkspacePatch: (patch: WorkspacePatch) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}) {
  const questionKey = session.useCase === "abm" && !answers.targetDomain
    ? "target-domain"
    : session.useCase === "content" && !answers.sourceUrl && !answers.sourceName
      ? "content-source"
      : "none";
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [sourceMode, setSourceMode] = useState<"url" | "pdf">("url");
  const [campaignChoice, setCampaignChoice] = useState<SessionAnswers["campaignType"]>(answers.campaignType);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>();
  const [selectedAudience, setSelectedAudience] = useState<string | undefined>(
    answers.audience === "Other" && !answers.customAudience ? "Other" : undefined
  );
  const [customAudience, setCustomAudience] = useState(answers.customAudience ?? "");
  const [selectedObjective, setSelectedObjective] = useState<string>();
  const [productMode, setProductMode] = useState<ContextMode>(
    answers.sourceName ? "pdf" : answers.sourceUrl ? "url" : answers.messageBelief ? "text" : "url"
  );
  const [productDescription, setProductDescription] = useState(answers.messageBelief ?? "");
  const [campaignSubmitError, setCampaignSubmitError] = useState("");
  const [isChangingProductSource, setIsChangingProductSource] = useState(false);
  const [productResearchStartRevision, setProductResearchStartRevision] = useState<number>();
  const backgroundPatchRef = useRef(onBackgroundPatch ?? onPatch);
  const lastOfferResearchRef = useRef<string | undefined>(undefined);
  const lastProductResearchRef = useRef<string | undefined>(undefined);
  const pendingProductResearchRef = useRef<Promise<void> | undefined>(undefined);
  const lastContentSourceRef = useRef<string | undefined>(undefined);
  const textValue = fieldValues[questionKey] ?? "";
  const sourceUrlValue = fieldValues["content-source-url"] ?? "";
  const campaignOfferSourceValue = fieldValues["campaign-offer-source"] ?? "";
  const productSourceUrlValue = fieldValues["abm-product-source"] ?? "";
  const activeCampaignChoice = campaignChoice ?? answers.campaignType;
  const setTextValue = (value: string) =>
    setFieldValues((current) => ({ ...current, [questionKey]: value }));
  const setSourceUrlValue = (value: string) =>
    setFieldValues((current) => ({ ...current, "content-source-url": value }));
  const patchContentUrl = useCallback((canonicalUrl: string) => {
    const signature = `${session.id}:${canonicalUrl}`;
    if (lastContentSourceRef.current === signature || answers.sourceUrl === canonicalUrl) return;
    lastContentSourceRef.current = signature;
    void onPatch({ sourceUrl: canonicalUrl }).catch(() => {
      if (lastContentSourceRef.current === signature) {
        lastContentSourceRef.current = undefined;
      }
    });
  }, [answers.sourceUrl, onPatch, session.id]);
  const submitContentUrl = () => {
    const normalizedUrl = sourceUrlValue.trim();
    if (!isCampaignOfferSourceUrl(normalizedUrl)) return;
    patchContentUrl(new URL(normalizedUrl).toString());
  };
  const questionCopy = getGuidedQuestionCopy(session);
  const sourceInsight = session.useCase === "content" && session.sourceInsight
    ? <SourceUnderstandingSummary insight={session.sourceInsight} />
    : null;

  useEffect(() => {
    backgroundPatchRef.current = onBackgroundPatch ?? onPatch;
  }, [onBackgroundPatch, onPatch]);

  useEffect(() => {
    if (
      session.useCase !== "campaign"
      || !activeCampaignChoice
      || activeCampaignChoice === "event"
      || !isCampaignOfferSourceUrl(campaignOfferSourceValue)
    ) return;
    const normalizedUrl = new URL(campaignOfferSourceValue.trim()).toString();
    const signature = `${session.id}:${activeCampaignChoice}:${normalizedUrl}`;
    if (lastOfferResearchRef.current === signature) return;
    const timer = window.setTimeout(() => {
      lastOfferResearchRef.current = signature;
      void backgroundPatchRef.current({
        campaignType: activeCampaignChoice,
        offerSourceUrl: normalizedUrl,
        offerSourceConfirmed: false
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeCampaignChoice, campaignOfferSourceValue, session.id, session.useCase]);

  useEffect(() => {
    if (session.useCase !== "content") return;
    const normalizedUrl = sourceUrlValue.trim();
    if (!isCampaignOfferSourceUrl(normalizedUrl)) return;
    const canonicalUrl = new URL(normalizedUrl).toString();
    const timer = window.setTimeout(() => patchContentUrl(canonicalUrl), 650);
    return () => window.clearTimeout(timer);
  }, [patchContentUrl, session.useCase, sourceUrlValue]);

  useEffect(() => {
    if (
      session.useCase !== "abm"
      || (selectedObjective ?? answers.objective) !== introduceProductObjective
      || productMode !== "url"
      || !isCampaignOfferSourceUrl(productSourceUrlValue)
    ) return;
    const normalizedUrl = new URL(productSourceUrlValue.trim()).toString();
    const signature = `${session.id}:abm-product:${normalizedUrl}`;
    if (lastProductResearchRef.current === signature) return;
    const timer = window.setTimeout(() => {
      lastProductResearchRef.current = signature;
      const pending = backgroundPatchRef.current({ sourceUrl: normalizedUrl });
      pendingProductResearchRef.current = pending;
      const clearPending = () => {
        if (pendingProductResearchRef.current === pending) {
          pendingProductResearchRef.current = undefined;
        }
      };
      void pending.then(clearPending, clearPending);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [answers.objective, productMode, productSourceUrlValue, selectedObjective, session.id, session.useCase]);

  if (session.useCase === "abm" && !answers.targetDomain) {
    return (
      <form
        className="questionCard"
        onSubmit={(event) => {
          event.preventDefault();
          void onPatch({ targetDomain: textValue });
        }}
      >
        <span className="questionCount">Next signal · account</span>
        <h2>{questionCopy.targetTitle}</h2>
        <p>{questionCopy.targetBody}</p>
        <label className="lineInput"><span>Target account domain</span><div><Target size={19} /><input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="targetaccount.com" /></div></label>
        <button className="buttonPrimary" disabled={!likelyDomain.test(textValue.trim()) || isSaving}>Use this account<ArrowRight size={17} /></button>
      </form>
    );
  }

  if (session.useCase === "campaign" && !campaignIntakeComplete(session)) {
    const choice = campaignChoice ?? answers.campaignType;
    const offerPrompt = campaignOfferPrompt(choice);
    const offerValue = fieldValues["campaign-offer"] ?? answers.promotedOffer ?? "";
    const offerSourceValue = campaignOfferSourceValue;
    const eventContextValue = fieldValues.eventSource ?? "";
    const hasExistingEventContext = Boolean(answers.eventSource);
    const hasNamedOffer = offerValue.trim().length >= 2;
    const hasValidOfferSource = isCampaignOfferSourceUrl(offerSourceValue);
    const validOfferSource = !offerSourceValue.trim() || hasValidOfferSource;
    const offerRequirementMet = choice === "event" ? hasNamedOffer : hasNamedOffer || hasValidOfferSource;
    const offerSourceHost = hasValidOfferSource
      ? new URL(offerSourceValue.trim()).hostname.replace(/^www\./, "")
      : undefined;
    const matchingOfferSource = offerSourceHost === session.campaignOfferSource?.sourceHost
      ? session.campaignOfferSource
      : undefined;
    const offerResearchStatus = matchingOfferSource?.intelligenceStatus;
    const understoodOfferTitle = matchingOfferSource?.title || session.sourceInsight?.title;
    const offerResearchCopy = offerResearchStatus === "ready"
      ? `Page understood${understoodOfferTitle ? `: ${understoodOfferTitle}` : "."} We’re using its offer, proof, and buyer language to shape the page.`
      : offerResearchStatus === "failed"
        ? "We could not read every page signal, so we’ll use the URL identity and company research as a safe fallback."
        : offerResearchStatus === "researching" || offerResearchStatus === "pending"
          ? `Reading ${offerSourceHost} now. We’re identifying the offer, proof, and useful buyer message.`
          : "Research starts after you pause typing. We’ll read the page while you keep moving.";
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · campaign</span>
        <h2>{questionCopy.campaignTitle}</h2>
        <p>{questionCopy.campaignBody}</p>
        <div className="largeChoiceGrid" aria-label="Campaign format" aria-busy={isSaving || undefined}>
          {[
            ["product", "Product or solution", "Build demand around one clear promise."],
            ["demand", "Demand generation", "Create a focused path from interest to action."],
            ["event", "Event or webinar", "Frame the reason to attend and make registration obvious."]
          ].map(([value, title, body]) => {
            const isSelected = choice === value;
            return (
              <button
                type="button"
                key={value}
                disabled={isSaving}
                className={isSelected ? "isSelected" : ""}
                aria-pressed={isSelected}
                data-selected={isSelected || undefined}
                onClick={() => {
                  const nextChoice = value as SessionAnswers["campaignType"];
                  setCampaignChoice(nextChoice);
                  if (nextChoice) track("campaign_type_selected", { campaignType: nextChoice });
                }}
              >
                <strong>{title}</strong>
                <span>{body}</span>
                {isSelected ? (
                  <span className="campaignChoiceState" aria-hidden="true"><CircleCheck size={17} />Selected</span>
                ) : <ArrowRight size={16} />}
              </button>
            );
          })}
        </div>
        {choice && <label className="lineInput"><span>{offerPrompt.label}{choice !== "event" ? " (optional with URL)" : ""}</span><div><Megaphone size={19} /><input value={offerValue} onChange={(event) => setFieldValues((current) => ({ ...current, "campaign-offer": event.target.value }))} placeholder={offerPrompt.placeholder} /></div></label>}
        {choice === "event" ? (
          <label className="lineInput"><span>{offerPrompt.sourceLabel}</span><div><FileText size={19} /><input value={eventContextValue} onChange={(event) => setFieldValues((current) => ({ ...current, eventSource: event.target.value }))} placeholder={hasExistingEventContext ? "Event details already added; enter new details only to replace them" : offerPrompt.sourcePlaceholder} /></div></label>
        ) : choice ? (
          <label className={`lineInput campaignSourceInput ${hasValidOfferSource ? "isReady" : ""}`}><span>{offerPrompt.sourceLabel}</span><div><ExternalLink size={19} /><input value={offerSourceValue} onChange={(event) => setFieldValues((current) => ({ ...current, "campaign-offer-source": event.target.value }))} placeholder={offerPrompt.sourcePlaceholder} /></div>{offerSourceValue.trim() && !validOfferSource ? <small className="fieldError">Use a public HTTPS URL.</small> : hasValidOfferSource ? <small className={`campaignSourceGuidance isReady is-${offerResearchStatus ?? "queued"}`} role="status" aria-live="polite">{offerResearchStatus === "ready" ? <CircleCheck size={14} /> : offerResearchStatus === "failed" ? <Search size={14} /> : <LoaderCircle className="spin" size={14} />}{offerResearchCopy}</small> : <small className="campaignSourceGuidance">Add either a name above or a URL here. A URL lets us identify and research the offer for you.</small>}</label>
        ) : null}
        {campaignSubmitError && <p className="fieldError campaignSubmitError" role="alert">{campaignSubmitError}</p>}
        <button
          className="buttonPrimary"
          type="button"
          disabled={isSaving}
          onClick={() => {
            if (!choice) {
              setCampaignSubmitError("Choose a campaign format to continue.");
              return;
            }
            if (!validOfferSource) {
              setCampaignSubmitError("Use a public HTTPS URL, or remove it and name the offer instead.");
              return;
            }
            if (!offerRequirementMet) {
              setCampaignSubmitError(choice === "event"
                ? "Add the event or webinar name before continuing."
                : "Add an offer name or a public offer URL before continuing.");
              return;
            }
            if (choice === "event" && !hasExistingEventContext && eventContextValue.trim().length < 8) {
              setCampaignSubmitError("Add event details so Folloze can build the registration path.");
              return;
            }
            setCampaignSubmitError("");
            void onPatch({
              campaignType: choice,
              promotedOffer: offerValue.trim() || undefined,
              promotedOfferConfirmed: true,
              offerSourceUrl: choice !== "event" && offerSourceValue.trim() ? offerSourceValue.trim() : undefined,
              offerSourceConfirmed: choice !== "event" && Boolean(offerSourceValue.trim()),
              eventSource: choice === "event" && eventContextValue.trim() ? eventContextValue.trim() : undefined
            });
          }}
        >
          Use this campaign<ArrowRight size={17} />
        </button>
      </div>
    );
  }

  if (session.useCase === "content" && !answers.sourceUrl && !answers.sourceName) {
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · source</span>
        <h2>{questionCopy.sourceTitle}</h2>
        <p>{questionCopy.sourceBody}</p>
        <div className="sourceTabs" role="tablist" aria-label="Content source type">
          <button type="button" role="tab" id="source-tab-url" aria-controls="source-panel-url" aria-selected={sourceMode === "url"} className={sourceMode === "url" ? "isActive" : ""} onClick={() => setSourceMode("url")}>Paste a URL</button>
          <button type="button" role="tab" id="source-tab-pdf" aria-controls="source-panel-pdf" aria-selected={sourceMode === "pdf"} className={sourceMode === "pdf" ? "isActive" : ""} onClick={() => setSourceMode("pdf")}>Upload a PDF</button>
        </div>
        {sourceMode === "url" ? (
          <form className="sourceForm" role="tabpanel" id="source-panel-url" aria-labelledby="source-tab-url" onSubmit={(event) => { event.preventDefault(); submitContentUrl(); }}>
            <label className="lineInput"><span>Content URL</span><div><ExternalLink size={19} /><input value={sourceUrlValue} onChange={(event) => setSourceUrlValue(event.target.value)} placeholder="https://yourcompany.com/report" /></div></label>
            <button className="buttonPrimary" disabled={!isCampaignOfferSourceUrl(sourceUrlValue) || isSaving}>Use this content<ArrowRight size={17} /></button>
          </form>
        ) : (
          <label className={`uploadBox is-${pdfUpload.status}`} role="tabpanel" id="source-panel-pdf" aria-labelledby="source-tab-pdf" aria-busy={pdfUpload.status === "uploading" || pdfUpload.status === "processing" || undefined}>
            {pdfUpload.status === "accepted" ? <CircleCheck size={24} /> : pdfUpload.status === "error" ? <X size={24} /> : <FileText size={24} />}
            <strong>{pdfUpload.status === "uploading" ? `Uploading ${pdfUpload.fileName || "your PDF"}` : pdfUpload.status === "processing" ? `Reading ${pdfUpload.fileName || "your PDF"}` : pdfUpload.status === "accepted" ? "PDF accepted" : pdfUpload.status === "error" ? "That upload did not work" : "Drop in a PDF"}</strong>
            <span role={pdfUpload.status === "error" ? "alert" : undefined}>{pdfUpload.message || (isSaving ? "Uploading securely…" : "Up to 10 MB. The file is used only to build this experience.")}</span>
            {pdfUpload.status !== "error" && <PdfUploadProgress feedback={pdfUpload} />}
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={isSaving}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) {
                  void onUpload(file);
                }
              }}
            />
          </label>
        )}
      </div>
    );
  }

  // Content Magic is intentionally source-led. Once a URL or PDF is attached,
  // the source itself is the brief and the production engine infers audience,
  // objective, and structure. Keep the visitor in a truthful build state
  // instead of routing them through the campaign/account questions below.
  if (session.useCase === "content") {
    const sourceReady = Boolean(answers.sourceUrl || answers.sourceName);
    const sourceStatus = session.sourceInsight?.status;
    const isComplete = Boolean(session.experience);
    const statusCopy = isComplete
      ? "The source has been preserved and the guided experience is ready to explore."
      : sourceStatus === "failed" || sourceStatus === "unreadable"
        ? "We could not read enough of this source to build responsibly. Try another public URL or PDF."
        : sourceStatus === "ready" || sourceStatus === "needs-review"
          ? "Source understood. Folloze is composing its facts, proof, and buyer moments into a guided experience."
          : "Reading the source and extracting the facts, proof, and buyer moments now.";
    return (
      <div className="questionSequence">
        {sourceInsight}
        <div className="questionCard generationCard" role="status" aria-live="polite" aria-busy={!isComplete}>
          <span className="generationGlyph">{isComplete ? <CircleCheck size={24} /> : <LoaderCircle className="spin" size={24} />}</span>
          <span className="questionCount">{isComplete ? "Content path ready" : "Folloze is building"}</span>
          <h2>{isComplete ? "Your content experience is ready." : "Turning the source into a buyer path."}</h2>
          <p>{sourceReady ? statusCopy : "Add a public URL or PDF to start."}</p>
        </div>
      </div>
    );
  }

  if (!answers.audience || (answers.audience === "Other" && !answers.customAudience)) {
    if (session.audienceSuggestions.length === 0) {
      return (
        <div className="questionSequence">
          {sourceInsight}
          <div className="questionCard generationCard" role="status" aria-live="polite">
            <span className="generationGlyph"><LoaderCircle className="spin" size={24} /></span>
            <span className="questionCount">Next choice · audience</span>
            <h2>{questionCopy.audienceLoadingTitle}</h2>
            <p>{questionCopy.audienceLoadingBody}</p>
          </div>
        </div>
      );
    }
    const recommendations = session.audienceRecommendations ?? [];
    const evidence = new Map((session.evidenceItems ?? []).map((item) => [item.id, item]));
    if (recommendations.length) {
      const recommended = recommendations[0];
      const chosenId = selectedAudience === "Other"
        ? undefined
        : selectedAudienceId ?? session.selectedAudienceRecommendationId ?? recommended.id;
      return (
        <div className="questionSequence">
          {sourceInsight}
          <div className="questionCard audienceEvidenceStep">
          <span className="questionCount">Next choice · audience</span>
          <h2>{questionCopy.audienceTitle}</h2>
          <p>{questionCopy.audienceBody}</p>
          <AudienceEvidenceTray
            companyName={session.useCase === "abm" ? targetNameFor(session) : brandNameFor(session)}
            selectedId={chosenId}
            simplified
            options={recommendations.map((recommendation, index) => {
              const supporting = recommendation.evidenceItemIds
                .map((id) => evidence.get(id))
                .filter((item): item is SessionEvidenceItem => Boolean(item));
              return {
                id: recommendation.id,
                label: recommendation.label,
                rationale: audienceRecommendationCopy({
                  recommendation,
                  evidenceCount: supporting.length,
                  companyName: session.useCase === "abm" ? targetNameFor(session) : brandNameFor(session),
                  offer: session.useCase === "campaign" ? campaignOfferFor(session) : undefined,
                  isPrimary: index === 0
                }),
                pinned: supporting.some((item) => item.disposition === "pinned"),
                excluded: supporting.length > 0 && supporting.every((item) => item.disposition === "excluded"),
                evidence: supporting.map((item) => ({
                  id: item.id,
                  label: item.label,
                  detail: item.text,
                  sourceLabel: item.sourceUrl ? "Public source" : item.type.replaceAll("-", " "),
                  sourceUrl: item.sourceUrl
                }))
              };
            })}
            onSelect={(id) => { setSelectedAudience(undefined); setSelectedAudienceId(id); }}
            onPin={(id, pinned) => {
              const recommendation = recommendations.find((candidate) => candidate.id === id);
              if (!recommendation) return;
              void onWorkspacePatch({
                evidenceDecisions: recommendation.evidenceItemIds.map((evidenceId) => ({
                  id: evidenceId,
                  disposition: pinned ? "pinned" : "available"
                }))
              });
            }}
            onExclude={(id, excluded) => {
              const recommendation = recommendations.find((candidate) => candidate.id === id);
              if (!recommendation) return;
              void onWorkspacePatch({
                evidenceDecisions: recommendation.evidenceItemIds.map((evidenceId) => ({
                  id: evidenceId,
                  disposition: excluded ? "excluded" : "available"
                }))
              });
            }}
          />
          <button
            className="audienceOtherButton"
            type="button"
            disabled={isSaving}
            onClick={() => setSelectedAudience("Other")}
          >
            I have a different audience in mind <ArrowRight size={15} />
          </button>
          {selectedAudience === "Other" && (
            <label className="lineInput"><span>Audience</span><div><Users size={19} /><input value={customAudience} onChange={(event) => setCustomAudience(event.target.value)} placeholder="Regional field marketing leaders" /></div></label>
          )}
          <button
            className="buttonPrimary"
            type="button"
            disabled={isSaving || (selectedAudience === "Other" ? customAudience.trim().length < 3 : !chosenId)}
            onClick={() => selectedAudience === "Other"
              ? void onPatch({ audience: "Other", customAudience: customAudience.trim() })
              : void onWorkspacePatch({ selectedAudienceRecommendationId: chosenId })}
          >
            Use this audience<ArrowRight size={17} />
          </button>
          </div>
        </div>
      );
    }
    const recommendedAudience = session.audienceSuggestions[0] ?? "Other";
    const chosenAudience = selectedAudience ?? recommendedAudience;
    return (
      <div className="questionSequence">
        {sourceInsight}
        <div className="questionCard">
          <span className="questionCount">Next choice · audience</span>
          <h2>{questionCopy.audienceTitle}</h2>
          <p>{questionCopy.audienceBody}</p>
          <ChipGroup label="Choose an audience" options={[...session.audienceSuggestions, "Other"]} value={chosenAudience} disabled={isSaving} onChange={setSelectedAudience} />
          {chosenAudience === "Other" && (
            <label className="lineInput"><span>Audience</span><div><Users size={19} /><input value={customAudience} onChange={(event) => setCustomAudience(event.target.value)} placeholder="Regional field marketing leaders" /></div></label>
          )}
          <button className="buttonPrimary" type="button" disabled={isSaving || (chosenAudience === "Other" && customAudience.trim().length < 3)} onClick={() => void onPatch({ audience: chosenAudience, customAudience: chosenAudience === "Other" ? customAudience.trim() : undefined })}>
            Use this audience<ArrowRight size={17} />
          </button>
        </div>
      </div>
    );
  }

  const persistedProductContextNeedsAttention = productContextNeedsAttention(session);

  if (!answers.objective || persistedProductContextNeedsAttention) {
    const recommended = recommendedObjectiveFor(session);
    const orderedObjectives = [recommended, ...objectives[session.useCase].filter((objective) => objective !== recommended)];
    const chosenObjective = selectedObjective ?? answers.objective ?? recommended;
    const contextPrompt = objectiveContextPrompt(chosenObjective, session.useCase === "campaign" ? campaignOfferFor(session) : undefined);
    const objectiveContext = fieldValues["objective-context"] ?? answers.messageBelief ?? "";
    const needsProductContext = session.useCase === "abm" && chosenObjective === introduceProductObjective;
    const validProductUrl = isCampaignOfferSourceUrl(productSourceUrlValue);
    const productPdfReady = Boolean(answers.sourceName) || pdfUpload.status === "accepted";
    const productDescriptionReady = productDescription.trim().length >= 20;
    const productResearchFinished = productResearchStartRevision !== undefined
      && session.revision > productResearchStartRevision
      && Boolean(
        session.sourceInsight
          && ["ready", "needs-review", "failed", "unreadable"].includes(session.sourceInsight.status)
      );
    const productResearchPending = productResearchStartRevision !== undefined
      && !productResearchFinished;
    const productSourceFailed = !productResearchPending
      && Boolean(answers.sourceUrl)
      && Boolean(session.sourceInsight && ["failed", "unreadable"].includes(session.sourceInsight.status));
    const productSourceReady = !productResearchPending
      && Boolean(answers.sourceUrl)
      && sourceInsightIsUsable(session);
    const productContextReady = !needsProductContext
      || (productMode === "url" && productSourceReady)
      || (productMode === "pdf" && productPdfReady)
      || (productMode === "text" && productDescriptionReady);
    const selectProductMode = async (nextMode: ContextMode) => {
      if (nextMode === productMode) return;
      setProductMode(nextMode);
      if (nextMode === "url") return;
      setFieldValues((current) => ({ ...current, "abm-product-source": "" }));
      setProductResearchStartRevision(undefined);
      lastProductResearchRef.current = undefined;
      if (!answers.sourceUrl && !validProductUrl) return;
      setIsChangingProductSource(true);
      try {
        await pendingProductResearchRef.current;
        await onPatch({ sourceUrl: "" });
      } finally {
        setIsChangingProductSource(false);
      }
    };
    return (
      <div className="questionCard">
        <span className="questionCount">Final choice · goal</span>
        <h2>{questionCopy.objectiveTitle}</h2>
        <p>{questionCopy.objectiveBody}</p>
        <ChipGroup label="Choose a goal" options={orderedObjectives} value={chosenObjective} recommendedOption={recommended} disabled={isSaving} onChange={setSelectedObjective} />
        {needsProductContext && (
          <section className="productContextQuestion" aria-labelledby="product-context-title">
            <div className="productContextHeading">
              <span className="sectionKicker">One more signal · product</span>
              <h3 id="product-context-title">How should we learn about the product?</h3>
              <p>Choose the source you already have. We will identify the product, proof, and useful buyer message.</p>
            </div>
            <div className="contextModeRail" role="tablist" aria-label="Product information type">
              <button type="button" role="tab" aria-selected={productMode === "url"} className={productMode === "url" ? "isActive" : ""} disabled={isChangingProductSource || (productPdfReady && productMode !== "url")} onClick={() => void selectProductMode("url")}><ExternalLink size={16} />Paste a URL</button>
              <button type="button" role="tab" aria-selected={productMode === "pdf"} className={productMode === "pdf" ? "isActive" : ""} disabled={isChangingProductSource} onClick={() => void selectProductMode("pdf")}><FileText size={16} />Upload a document</button>
              <button type="button" role="tab" aria-selected={productMode === "text"} className={productMode === "text" ? "isActive" : ""} disabled={isChangingProductSource || (productPdfReady && productMode !== "text")} onClick={() => void selectProductMode("text")}><MessageSquareText size={16} />Describe it</button>
            </div>
            {productMode === "url" && (
              <div className="contextPanel" role="tabpanel">
                <label htmlFor="abm-product-source">Existing product page</label>
                <div className="contextUrlInput"><ExternalLink size={17} /><input id="abm-product-source" value={productSourceUrlValue} onChange={(event) => { setFieldValues((current) => ({ ...current, "abm-product-source": event.target.value })); setProductResearchStartRevision(session.revision); lastProductResearchRef.current = undefined; }} placeholder={productSourceReady ? "A product page is attached — paste another URL to replace it" : "https://yourcompany.com/product"} inputMode="url" /></div>
                <div className="contextPanelFooter">
                  <small role={productSourceFailed ? "alert" : "status"} aria-live="polite">{productSourceReady ? `Product page understood${session.sourceInsight?.title ? `: ${session.sourceInsight.title}` : "."} Its offer and proof are ready for the experience.` : productSourceFailed ? "We could not read that page. Paste another URL or choose a PDF or description." : validProductUrl ? "Reading this product page now. We’re identifying the offer, proof, and useful buyer message." : "Paste a public HTTPS product page. Research starts after you pause typing."}</small>
                </div>
              </div>
            )}
            {productMode === "pdf" && (
              <div className={`contextPanel contextPdfPanel is-${pdfUpload.status}`} role="tabpanel" aria-busy={pdfUpload.status === "uploading" || pdfUpload.status === "processing" || undefined}>
                {productPdfReady ? <CircleCheck size={21} /> : pdfUpload.status === "error" ? <X size={21} /> : <FileText size={21} />}
                <div><strong>{productPdfReady ? "Product PDF understood" : pdfUpload.status === "error" ? "That PDF was not added" : "Upload a product document"}</strong><span>{pdfUpload.message || pdfUpload.fileName || "Up to 10 MB. We will use the document to improve the product story and proof."}</span></div>
                {!productPdfReady && (
                  <label className="contextUploadButton">
                    {pdfUpload.status === "error" ? "Choose another PDF" : "Choose PDF"}
                    <input type="file" accept="application/pdf,.pdf" disabled={isSaving || isChangingProductSource} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onUpload(file); }} />
                  </label>
                )}
                <PdfUploadProgress feedback={pdfUpload} />
              </div>
            )}
            {productMode === "text" && (
              <div className="contextPanel" role="tabpanel">
                <label htmlFor="abm-product-description">What should buyers understand about the product?</label>
                <textarea id="abm-product-description" value={productDescription} onChange={(event) => setProductDescription(event.target.value)} placeholder={`Describe what ${brandNameFor(session)} is introducing, who it helps, and what makes it useful.`} maxLength={240} />
                <div className="contextPanelFooter"><small>{productDescription.length}/240 · Add at least one useful sentence.</small></div>
              </div>
            )}
          </section>
        )}
        {session.useCase === "campaign" && !answers.messageBelief?.trim() && (
          <label className="briefPromptField">
            <span><MessageSquareText size={15} />{contextPrompt.label}</span>
            <textarea value={objectiveContext} onChange={(event) => setFieldValues((current) => ({ ...current, "objective-context": event.target.value }))} placeholder={contextPrompt.placeholder} maxLength={320} />
            <small>Optional. This sharpens the promise without adding another setup step.</small>
          </label>
        )}
        <button className="buttonPrimary" type="button" disabled={isSaving || isChangingProductSource || !productContextReady} onClick={() => void onPatch({
          objective: chosenObjective,
          messageBelief: needsProductContext && productMode === "text"
            ? productDescription.trim()
            : objectiveContext.trim() || undefined,
          ...(needsProductContext && productMode === "url" && validProductUrl
            ? { sourceUrl: productSourceUrlValue.trim() }
            : {})
        })}>
          {isSaving ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}Build my experience
        </button>
        <p className="buildExpectationInline"><Clock3 size={15} />Usually takes 30–60 seconds. Your brief stays safe if a stage needs to retry.</p>
      </div>
    );
  }

  if (session.status === "generation_failed") {
    return (
      <div className="questionCard recoveryCard" role="alert">
        <span className="generationGlyph isFailed"><RefreshCw size={24} /></span>
        <span className="questionCount">Experience assembly stopped</span>
        <h2>The buyer story did not finish.</h2>
        <p>Your company, account or source, audience, outcome, and optional direction are still saved. Retry only the experience stage from this exact brief.</p>
        {session.supportRef && <p className="supportReference">Support reference: <strong>{session.supportRef}</strong></p>}
        <button className="buttonPrimary" type="button" disabled={isSaving || !answers.objective} onClick={() => void onPatch({ objective: answers.objective })}>
          <RefreshCw size={17} />Retry experience assembly
        </button>
      </div>
    );
  }

  return (
    <div className="questionCard generationCard">
      <span className="generationGlyph"><Sparkles size={25} /></span>
      <span className="questionCount">Brief complete</span>
      <h2>{questionCopy.completeTitle}</h2>
      <p>{questionCopy.completeBody}</p>
      <div className="briefChips"><span>{answers.audience}</span><span>{answers.objective}</span></div>
    </div>
  );
}

function WhyItMatters({ session }: { session: PublicTryMeSession }) {
  const content = getWhyCopy(session);
  return (
    <aside className="whyCard" key={content.key}>
      <span>Why this matters</span>
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </aside>
  );
}

function previewLogoUrl(
  session: PublicTryMeSession,
  owner: "seller" | "target" = "seller",
  surface: "light" | "dark" = "light"
): string | undefined {
  const profile = owner === "seller" ? session.brand : session.targetBrand;
  if (!profile?.logoUrl) return undefined;
  const candidate = surface === "dark" ? profile.logoUrlOnDark ?? profile.logoUrl : profile.logoUrl;
  if (isBrandfetchHostedLogoUrl(candidate, profile.canonicalDomain ?? profile.domain)) return candidate;
  return imageDeliveryPath(
    session.id,
    `${owner}-logo`,
    session.experience?.artifactRevision
  );
}

function SafeBrandLogo({
  session,
  owner,
  companyName,
  fallback
}: {
  session: PublicTryMeSession;
  owner: "seller" | "target";
  companyName: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const profile = owner === "seller" ? session.brand : session.targetBrand;
  if (!profile?.logoUrl) return <>{fallback}</>;
  const preferred = previewLogoUrl(session, owner);
  const expectedDomain = profile?.canonicalDomain ?? profile?.domain;
  const delivery = imageDeliveryPath(
    session.id,
    `${owner}-logo`,
    session.experience?.artifactRevision
  );
  const candidates = [...new Set([
    ...brandfetchLogoRecoveryUrls(preferred, expectedDomain),
    delivery
  ].filter((value): value is string => Boolean(value)))];
  const candidate = candidates.find((value) => !failed.includes(value));
  if (!candidate) return <>{fallback}</>;
  return (
    <Image
      key={candidate}
      src={candidate}
      alt={`${companyName} logo`}
      width={92}
      height={28}
      unoptimized
      onLoad={() => captureProductEvent("brand_logo_rendered", {
        category: "performance",
        outcome: "success",
        properties: {
          owner,
          provider: candidate.includes("cdn.brandfetch.io") ? "brandfetch" : "first_party",
          candidate_index: Math.max(0, candidates.indexOf(candidate))
        }
      })}
      onError={() => {
        setFailed((current) => current.includes(candidate) ? current : [...current, candidate]);
        captureProductEvent("brand_logo_failed", {
          category: "error",
          outcome: "failure",
          properties: {
            owner,
            provider: candidate.includes("cdn.brandfetch.io") ? "brandfetch" : "first_party",
            candidate_index: Math.max(0, candidates.indexOf(candidate))
          }
        });
      }}
    />
  );
}

export function getAssemblyPreviewKey(
  session: Pick<PublicTryMeSession, "id" | "experience">
): string {
  return `${session.id}:${session.experience?.artifactRevision ?? 0}`;
}

const PERSONALIZATION_VARIANT_LABELS: Record<PersonalizationVariantId, string> = {
  generic: "Generic",
  account: "Account",
  account_industry: "Account + industry",
  account_industry_persona_a: "Persona A",
  account_industry_persona_b: "Persona B"
};

/** Preview-only personalization chips. Switching never regenerates the session. */
export function personalizationVariantOptionsFor(
  session: Pick<PublicTryMeSession, "experienceSpec">
): Array<{ id: PersonalizationVariantId; label: string }> {
  const ids = session.experienceSpec?.personalizationVariantIds ?? [];
  return PERSONALIZATION_VARIANT_IDS.filter((id) => ids.includes(id)).map((id) => ({
    id,
    label: PERSONALIZATION_VARIANT_LABELS[id]
  }));
}

export function defaultPersonalizationVariantFor(
  session: Pick<PublicTryMeSession, "experienceSpec">
): PersonalizationVariantId {
  const preferred = session.experienceSpec?.personalizationDefaultVariantId;
  if (preferred && (session.experienceSpec?.personalizationVariantIds ?? []).includes(preferred)) {
    return preferred;
  }
  return personalizationVariantOptionsFor(session)[0]?.id ?? "generic";
}

export function PersonalizationVariantBar({
  options,
  selectedId,
  onSelect
}: {
  options: Array<{ id: PersonalizationVariantId; label: string }>;
  selectedId: PersonalizationVariantId;
  onSelect: (id: PersonalizationVariantId) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="personalizationVariantBar" role="toolbar" aria-label="Personalization preview">
      <span className="personalizationVariantLabel">Preview as</span>
      <div className="personalizationVariantChips">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="personalizationVariantChip"
            aria-pressed={selectedId === option.id}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function previewBoundaryScrollDelta(message: unknown): number | undefined {
  if (!message || typeof message !== "object") return undefined;
  const candidate = message as { source?: unknown; action?: unknown; deltaY?: unknown };
  if (
    candidate.source !== "folloze-experience"
    || candidate.action !== "preview_scroll_boundary"
    || typeof candidate.deltaY !== "number"
    || !Number.isFinite(candidate.deltaY)
    || candidate.deltaY === 0
  ) return undefined;
  return Math.max(-1_600, Math.min(1_600, candidate.deltaY));
}

export function AssemblyPreview({ session, iframeRef }: { session: PublicTryMeSession; iframeRef?: RefObject<HTMLIFrameElement | null> }) {
  const brandName = session.brand?.companyName || displayNameFromDomain(session.companyDomain);
  const brandPresentation = prospectBrandPresentation(
    session.brand,
    brandName,
    session.stages.brand.status
  );
  const brandReady = brandPresentation.state === "verified";
  const showBrandProviderDiagnostic =
    process.env.NODE_ENV !== "production" &&
    session.brand?.providerAvailability?.remoteHarvester === "not_configured" &&
    session.brand.providerAvailability.brandfetch === "not_configured";
  const audienceReady = session.stages.audience.status === "complete" || Boolean(session.answers.audience);
  const storyReady = Boolean(session.experience);
  const moments = buildMoments(session);
  const lockedCount = moments.filter((moment) => ["complete", "fallback"].includes(moment.status)).length;
  const currentMoment = moments.find((moment) => moment.status === "running")
    ?? moments.find((moment) => moment.status === "pending")
    ?? moments[moments.length - 1];
  const targetName = session.useCase === "abm"
    ? session.targetBrand?.companyName || displayNameFromDomain(session.answers.targetDomain)
    : undefined;
  const audience = session.answers.customAudience || session.answers.audience;
  const objective = session.answers.objective;
  const previewRevision = session.experience?.artifactRevision ?? 0;
  const previewLoadStarted = useRef<number | undefined>(undefined);
  useEffect(() => {
    previewLoadStarted.current = performance.now();
  }, [previewRevision]);
  const verifiedPalette = brandReady && session.brand?.colors.length ? session.brand.colors : undefined;
  const palette = verifiedPalette ?? ["#eef0f4", "#64748b", "#ffffff"];
  const canvasStyle = {
    "--build-primary": verifiedPalette ? session.brand?.primaryColor || palette[0] : "#64748b",
    "--build-accent": verifiedPalette ? session.brand?.accentColor || palette[1] || palette[0] : "#0077ff",
    "--build-surface": verifiedPalette ? session.brand?.surfaceColor || "#ffffff" : "#ffffff"
  } as CSSProperties;
  return (
    <div className={`assembly ${storyReady ? "isReady" : ""}`}>
      <div className="browserBar"><i /><i /><i /><span>{(session.liveUrl || session.temporaryUrl).replace(/^https?:\/\//, "")}</span></div>
      {storyReady ? (
        <iframe
          ref={iframeRef}
          key={getAssemblyPreviewKey(session)}
          src={`/e/${session.id}?embed=1`}
          title="Generated buyer experience preview"
          // The generated route nonces the one trusted runtime and blocks every
          // other script through CSP. The iframe retains same-origin access only
          // for protected preview fonts and allowlisted engagement delivery.
          allow="fullscreen"
          scrolling="yes"
          tabIndex={0}
          data-preview-scroll="contained"
          onLoad={() => {
            const startedAt = previewLoadStarted.current;
            captureProductEvent("preview_rendered", {
              category: "performance",
              outcome: "success",
              sessionId: session.id,
              ...(startedAt === undefined
                ? {}
                : { durationMs: Math.max(0, Math.round(performance.now() - startedAt)) }),
              properties: {
                use_case: session.useCase,
                artifact_revision: previewRevision,
                readiness: session.experience?.readiness ?? "final",
                generation_source: session.experience?.generationSource ?? "unknown"
              }
            });
          }}
        />
      ) : (
        <div className="assemblyCanvas" style={canvasStyle}>
          <div className="assemblyGrid" aria-hidden="true" />
          <div className="assemblyStatus" role="status" aria-live="polite">
            <span><i className="liveDot" />{currentMoment.title}</span>
            <small>{lockedCount} / {moments.length} intelligence layers ready</small>
          </div>
          <div className={`artifact brandArtifact ${brandReady ? "isPlaced" : ""}`}>
            <div className="assemblyIdentity">
              {previewLogoUrl(session) ? (
                <Image
                  src={previewLogoUrl(session) ?? ""}
                  alt={`${brandName} logo`}
                  width={140}
                  height={40}
                  style={{ width: "auto", height: "auto" }}
                  unoptimized
                />
              ) : <span>{brandName.slice(0, 1)}</span>}
              <div><small>Brand system</small><strong>{brandName}</strong></div>
            </div>
            {targetName && <div className="accountBridge"><small>Building for</small><strong>{targetName}</strong></div>}
            {verifiedPalette ? (
              <div className="swatches" aria-label="Detected brand palette">{palette.slice(0, 4).map((color) => <i style={{ background: color }} key={color} />)}</div>
            ) : (
              <span className="brandEvidencePending">{brandPresentation.label}</span>
            )}
            {showBrandProviderDiagnostic && (
              <small className="brandProviderDiagnostic">
                QA diagnostic: Brandfetch and remote brand harvesting are not configured.
              </small>
            )}
          </div>
          <div className="assemblyInputs">
            <div className={`artifact audienceArtifact ${audienceReady ? "isPlaced" : ""}`}>
              <small>Buyer</small><strong>{audience || "Mapping company-fit roles"}</strong>
            </div>
            <div className={`artifact objectiveArtifact ${objective ? "isPlaced" : ""}`}>
              <small>Objective</small><strong>{objective || "Waiting for one outcome"}</strong>
            </div>
          </div>
          <div className={`storySkeleton ${session.stages.story.status === "running" ? "isWriting" : ""}`}>
            <div className="compositionLabel"><small>Message architecture</small><strong>{session.stages.story.status === "running" ? `Composing for ${audience || "the buyer"}` : objective ? `Ready to build around ${objective.toLowerCase()}` : "Waiting for the final signal"}</strong></div>
            <span className="skeletonKicker" /><span className="skeletonHeadline" /><span className="skeletonHeadline short" /><span className="skeletonBody" /><span className="skeletonButton" />
          </div>
          <div className="moduleSkeleton" aria-hidden="true">
            {[["01", "Tension"], ["02", "Proof"], ["03", "Next move"]].map(([number, label]) => (
              <div key={number}><span>{number}</span><strong>{label}</strong><i /><i /></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function useDialogBehavior(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, a, input, [tabindex]:not([tabindex='-1'])")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"
    ) ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return { dialogRef, onKeyDown };
}

export function SaveExperienceDialog({
  open,
  expiresLabel,
  url,
  sellerName,
  targetName,
  headline,
  remainingSeconds,
  email,
  status,
  error,
  onEmailChange,
  onSave,
  onClose
}: {
  open: boolean;
  expiresLabel: string;
  url: string;
  sellerName: string;
  targetName?: string;
  headline: string;
  remainingSeconds?: number;
  email: string;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
  onEmailChange: (email: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogBehavior(onClose);
  if (!open) return null;
  return createPortal(
    <div className="drawerBackdrop saveDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && status !== "saving") onClose(); }}>
      <section ref={dialogRef} className="saveExperienceDialog" role="dialog" aria-modal="true" aria-labelledby="save-value-title" onKeyDown={onKeyDown}>
        <button className="drawerClose" type="button" onClick={onClose} disabled={status === "saving"} aria-label="Close save experience"><X size={20} /></button>
        <ExpirySaveValuePanel
          expiresLabel={expiresLabel}
          url={url}
          sellerName={sellerName}
          targetName={targetName}
          headline={headline}
          remainingSeconds={remainingSeconds}
          email={email}
          status={status}
          error={error}
          onEmailChange={onEmailChange}
          onSave={onSave}
          benefits={["Permanent app-hosted URL", "Copy-and-share access", "Engagement-ready experience"]}
        />
      </section>
    </div>,
    document.body
  );
}

function MobileProcessDialog({ session, onClose }: { session: PublicTryMeSession; onClose: () => void }) {
  const { dialogRef, onKeyDown } = useDialogBehavior(onClose);
  return createPortal(
    <div className="drawerBackdrop mobileProcessBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside id="mobile-process-dialog" ref={dialogRef} className="mobileProcessSheet" role="dialog" aria-modal="true" aria-labelledby="mobile-process-title" onKeyDown={onKeyDown}>
        <div className="sheetHeader">
          <div><span className="sectionKicker">Live build</span><h2 id="mobile-process-title">What Folloze is doing</h2></div>
          <button className="drawerClose" type="button" onClick={onClose} aria-label="Close build status"><X size={20} /></button>
        </div>
        <LiveChecklist session={session} />
        <WhyItMatters session={session} />
      </aside>
    </div>,
    document.body
  );
}

export function BrandHelpRecoveryPanel({
  isSaving,
  onPatch
}: {
  isSaving: boolean;
  onPatch: (patch: SessionAnswers) => void | Promise<void>;
}) {
  return (
    <BrandHelpRecovery
      availableKinds={["source_url"]}
      disabled={isSaving}
      status={isSaving ? "submitting" : "waiting"}
      onUrlSubmit={(url) => void onPatch({ brandSourceUrl: url })}
    />
  );
}

export function TryMeNowApp() {
  const interactionReady = true;
  const [useCase, setUseCase] = useState<UseCase>();
  const [campaignEntryMode, setCampaignEntryMode] = useState<CampaignEntryMode>("campaign");
  const [streamingAnswers, setStreamingAnswers] = useState<StreamingBriefAnswer[]>([]);
  const [streamingFocusId, setStreamingFocusId] = useState<string>();
  const [streamingPreviewRequested, setStreamingPreviewRequested] = useState(false);
  const [domain, setDomain] = useState("");
  const [session, setSession] = useState<PublicTryMeSession>();
  const [answers, setAnswers] = useState<SessionAnswers>({});
  const [isStarting, setIsStarting] = useState(false);
  const [preflightStatus, setPreflightStatus] = useState<"idle" | "scheduled" | "starting" | "started" | "failed">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [showProcess, setShowProcess] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);
  const [pdfUpload, setPdfUpload] = useState<PdfUploadFeedback>(idlePdfUpload);
  const [claimEmail, setClaimEmail] = useState("");
  const [claimStatus, setClaimStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [claimError, setClaimError] = useState("");
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);
  const [revealedAt, setRevealedAt] = useState<number>();
  const [previewClockNow, setPreviewClockNow] = useState(() => Date.now());
  const [personalizationSelection, setPersonalizationSelection] = useState<{
    key: string;
    variantId: PersonalizationVariantId;
  }>({ key: "", variantId: "generic" });
  const startedDomain = useRef<string | undefined>(undefined);
  const stabilizedSellerDomain = useRef<string | undefined>(undefined);
  const revealTracked = useRef(false);
  const initialPreviewScrolled = useRef(false);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const patchRequestRef = useRef(0);
  const persistedSectionSignals = useRef(new Set<string>());
  const journeyCompleteAnalyticsOpened = useRef<string | undefined>(undefined);
  const lastTrackedStatus = useRef<string | undefined>(undefined);
  const buildTrackedSession = useRef<string | undefined>(undefined);
  const previewScrolledSession = useRef<string | undefined>(undefined);
  const activePreflightKey = useRef<string | undefined>(undefined);
  const provisionalRenderTracked = useRef<string | undefined>(undefined);
  const finalRenderTracked = useRef<string | undefined>(undefined);
  const supportRefTracked = useRef<string | undefined>(undefined);
  const [preflightCoordinator] = useState(() => (
    new SellerBrandPreflightCoordinator(
      async (selectedUseCase, companyDomain) => {
        const result = await api<{ session: PublicTryMeSession }>("/api/sessions", {
          method: "POST",
          body: JSON.stringify({ useCase: selectedUseCase, companyDomain })
        });
        return result.session;
      },
      async (sessionId) => {
        const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${sessionId}`);
        return result.session;
      }
    )
  ));

  useEffect(() => {
    initializeProductAnalytics();
  }, []);

  useEffect(() => {
    setProductAnalyticsSessionId(session?.id);
  }, [session?.id]);

  useEffect(() => {
    if (!session || lastTrackedStatus.current === session.status) return;
    lastTrackedStatus.current = session.status;
    captureProductEvent("session_status_changed", {
      category: "workflow",
      outcome: ["generation_failed", "claim_failed", "expired"].includes(session.status)
        ? "failure"
        : "info",
      sessionId: session.id,
      properties: { status: session.status, use_case: session.useCase }
    });
  }, [session]);

  useEffect(() => {
    if (!session || buildTrackedSession.current === session.id) return;
    if (session.stages.story.status !== "running" && session.status !== "generating") return;
    buildTrackedSession.current = session.id;
    track("build_started", { useCase: session.useCase });
  }, [session]);

  const selectUseCase = useCallback((selected: UseCase, selectedCampaignMode?: CampaignEntryMode) => {
    setUseCase(selected);
    setCampaignEntryMode(selectedCampaignMode ?? "campaign");
    setStreamingAnswers([]);
    setStreamingFocusId(undefined);
    setStreamingPreviewRequested(false);
    setDomain("");
    setSession(undefined);
    setAnswers({});
    setError("");
    setPreflightStatus("idle");
    setConnectionError("");
    setClientEvents([]);
    setRevealedAt(undefined);
    setShowSavePrompt(false);
    setShowAnalyticsPanel(false);
    setPdfUpload(idlePdfUpload);
    setClaimEmail("");
    setClaimStatus("idle");
    setClaimError("");
    startedDomain.current = undefined;
    stabilizedSellerDomain.current = undefined;
    activePreflightKey.current = undefined;
    revealTracked.current = false;
    initialPreviewScrolled.current = false;
    persistedSectionSignals.current.clear();
    buildTrackedSession.current = undefined;
    previewScrolledSession.current = undefined;
    provisionalRenderTracked.current = undefined;
    finalRenderTracked.current = undefined;
    supportRefTracked.current = undefined;
    setPersonalizationSelection({ key: "", variantId: "generic" });
    track("path_selected", { useCase: selected });
    track("use_case_selected", { useCase: selected });
  }, []);

  const resetExperience = useCallback(() => {
    resetProductAnalyticsVisitor();
    setUseCase(undefined);
    setCampaignEntryMode("campaign");
    setStreamingAnswers([]);
    setStreamingFocusId(undefined);
    setStreamingPreviewRequested(false);
    setDomain("");
    setSession(undefined);
    setAnswers({});
    setError("");
    setPreflightStatus("idle");
    setConnectionError("");
    setShowProcess(false);
    setShowSavePrompt(false);
    setShowAnalyticsPanel(false);
    setPdfUpload(idlePdfUpload);
    setClaimEmail("");
    setClaimStatus("idle");
    setClaimError("");
    setClientEvents([]);
    setRevealedAt(undefined);
    startedDomain.current = undefined;
    stabilizedSellerDomain.current = undefined;
    activePreflightKey.current = undefined;
    revealTracked.current = false;
    initialPreviewScrolled.current = false;
    persistedSectionSignals.current.clear();
    buildTrackedSession.current = undefined;
    previewScrolledSession.current = undefined;
    provisionalRenderTracked.current = undefined;
    finalRenderTracked.current = undefined;
    supportRefTracked.current = undefined;
    setPersonalizationSelection({ key: "", variantId: "generic" });
  }, []);

  const closeAnalyticsPanel = useCallback(() => setShowAnalyticsPanel(false), []);

  const updateDomain = useCallback((value: string) => {
    setDomain(value);
    activePreflightKey.current = undefined;
    const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    const ready = likelyDomain.test(normalized);
    setPreflightStatus(ready ? "scheduled" : "idle");
    if (!ready) {
      stabilizedSellerDomain.current = undefined;
      return;
    }
    if (stabilizedSellerDomain.current === normalized) return;
    stabilizedSellerDomain.current = normalized;
    captureUnifiedProductEvent("domain_stabilized", {
      properties: {
        domain_role: "seller",
        normalization: "canonical_host",
        has_value: true
      }
    });
  }, []);

  useEffect(() => {
    if (!useCase || session) return;
    const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    if (!likelyDomain.test(normalized)) {
      activePreflightKey.current = undefined;
      return;
    }

    const key = sellerBrandPreflightKey(useCase, normalized);
    activePreflightKey.current = key;
    const cancelScheduledPreflight = scheduleSellerBrandPreflight(() => {
      if (activePreflightKey.current !== key) return;
      setPreflightStatus("starting");
      void preflightCoordinator.warm(useCase, normalized).then(
        () => {
          if (activePreflightKey.current === key) setPreflightStatus("started");
        },
        () => {
          if (activePreflightKey.current === key) setPreflightStatus("failed");
        }
      );
    }, SELLER_BRAND_PREFLIGHT_DELAY_MS);
    return cancelScheduledPreflight;
  }, [domain, preflightCoordinator, session, useCase]);

  const startSession = useCallback(async (
    selectedUseCase: UseCase,
    companyDomain: string
  ) => {
    const normalized = companyDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    if (startedDomain.current === normalized || !likelyDomain.test(normalized)) return;
    startedDomain.current = normalized;
    setIsStarting(true);
    setError("");
    try {
      const confirmedSession = await preflightCoordinator.confirm(selectedUseCase, normalized);
      const seededSession = selectedUseCase === "campaign" && campaignEntryMode === "event"
        ? (await api<{ session: PublicTryMeSession }>(`/api/sessions/${confirmedSession.id}`, {
            method: "PATCH",
            body: JSON.stringify({ campaignType: "event", objective: "Drive registrations" })
          })).session
        : confirmedSession;
      setSession(seededSession);
      setAnswers(seededSession.answers);
      setProductAnalyticsSessionId(seededSession.id);
      captureProductEvent("session_created", {
        category: "workflow",
        outcome: "success",
        sessionId: seededSession.id,
        properties: { use_case: seededSession.useCase, entry_mode: campaignEntryMode }
      });
      track("domain_confirmed", { useCase: selectedUseCase, entryMode: campaignEntryMode });
      track("domain_submitted", { useCase: selectedUseCase, entryMode: campaignEntryMode });
    } catch (startError) {
      startedDomain.current = undefined;
      setError(startError instanceof Error ? startError.message : "We could not start the build.");
    } finally {
      setIsStarting(false);
    }
  }, [campaignEntryMode, preflightCoordinator]);

  const pollSessionId = session?.id;
  const pollSessionStatus = session?.status;
  useEffect(() => {
    if (!pollSessionId || !pollSessionStatus || ["claimed", "preview_ready_unclaimed", "generation_failed"].includes(pollSessionStatus)) return;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    const poll = async () => {
      try {
        const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${pollSessionId}`);
        if (cancelled) return;
        failures = 0;
        setConnectionError("");
        const nextSession = await confirmHighConfidenceSource(result.session);
        setSession((current) => preservePreviewDuringRegeneration(current, nextSession));
        setAnswers(nextSession.answers);
      } catch {
        if (cancelled) return;
        failures += 1;
        setConnectionError("Connection interrupted. Reconnecting without losing your brief…");
      }
      if (!cancelled) timer = window.setTimeout(poll, Math.min(900 * 2 ** failures, 8_000));
    };
    timer = window.setTimeout(poll, 900);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollSessionId, pollSessionStatus]);

  useEffect(() => {
    if (!session?.experience || initialPreviewScrolled.current) return;
    if (!canRevealPreview(session)) return;
    initialPreviewScrolled.current = true;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [session]);

  useEffect(() => {
    if (!session?.experience || !canRevealPreview(session)) return;
    const revision = session.experience.artifactRevision ?? 1;
    const durationMs = Math.max(0, Date.now() - Date.parse(session.createdAt || session.updatedAt));
    const properties = {
      artifact_revision: revision,
      duration_bucket: analyticsDurationBucket(durationMs),
      quality_gate: analyticsQualityGate(session)
    };
    if (isProvisionalExperience(session)) {
      const key = `${session.id}:provisional:${revision}`;
      if (provisionalRenderTracked.current === key) return;
      provisionalRenderTracked.current = key;
      captureUnifiedProductEvent("provisional_rendered", {
        sessionId: session.id,
        properties
      });
      return;
    }
    const key = `${session.id}:final:${revision}`;
    if (finalRenderTracked.current === key) return;
    finalRenderTracked.current = key;
    captureUnifiedProductEvent("final_rendered", {
      sessionId: session.id,
      properties
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (!["generation_failed", "claim_failed"].includes(session.status)) return;
    if (!session.supportRef || supportRefTracked.current === session.supportRef) return;
    supportRefTracked.current = session.supportRef;
    captureUnifiedProductEvent("support_reference_created", {
      sessionId: session.id,
      outcome: "failure",
      properties: {
        support_ref: session.supportRef,
        failure_stage: session.status === "claim_failed" ? "claim" : "generation"
      }
    });
  }, [session]);

  useEffect(() => {
    if (!session || !canRevealPreview(session) || revealTracked.current) return;
    revealTracked.current = true;
    const revealTime = Date.now();
    setRevealedAt(revealTime);
    track("experience_revealed", { useCase: session.useCase });
    setClientEvents([{
      action: "preview_viewed",
      ...describePreviewAnalyticsEvent("preview_viewed", {}),
      at: revealTime
    }]);
    // Preview analytics updates the server-side aggregate, not the rendered artifact.
    // Keeping that response out of session state prevents analytics-only revisions
    // from remounting the iframe that emitted the signal.
    void recordPreviewSignal(session.id, "preview-opened", "experience-preview").catch(() => undefined);
  }, [session]);

  const personalizationSourceKey = session?.experienceSpec?.personalizationVariantIds?.length
    ? `${session.id}:${session.experienceSpec.artifactDigest ?? session.revision}`
    : "";
  if (
    personalizationSourceKey
    && personalizationSelection.key !== personalizationSourceKey
    && session
  ) {
    setPersonalizationSelection({
      key: personalizationSourceKey,
      variantId: defaultPersonalizationVariantFor(session)
    });
  }
  const personalizationVariantId = personalizationSelection.key === personalizationSourceKey
    ? personalizationSelection.variantId
    : session?.experienceSpec?.personalizationVariantIds?.length
      ? defaultPersonalizationVariantFor(session)
      : "generic";

  const selectPersonalizationVariant = useCallback(
    (variantId: PersonalizationVariantId) => {
      setPersonalizationSelection((current) => ({
        key: current.key || personalizationSourceKey,
        variantId
      }));
      const frame = previewFrameRef.current?.contentWindow;
      if (frame) {
        try {
          frame.postMessage(
            {
              source: "folloze-builder",
              type: "set_personalization_variant",
              variantId
            },
            "*"
          );
        } catch {
          // Preview frame may be cross-origin during transient loads; ignore.
        }
      }
      captureUnifiedProductEvent("personalization_variant_viewed", {
        sessionId: session?.id,
        properties: {
          variant_id: variantId,
          has_evidence: variantId === "generic" ? false : true
        }
      });
    },
    [personalizationSourceKey, session?.id]
  );

  useEffect(() => {
    if (session?.status !== "preview_ready_unclaimed" || !session.expiresAt) return;
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const timer = window.setInterval(() => setPreviewClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [session?.expiresAt, session?.status]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !session ||
        event.source !== previewFrameRef.current?.contentWindow ||
        !event.data ||
        event.data.source !== "folloze-experience"
      ) return;
      const boundaryDelta = previewBoundaryScrollDelta(event.data);
      if (boundaryDelta !== undefined) {
        window.scrollBy({ top: boundaryDelta, left: 0, behavior: "auto" });
        return;
      }
      const allowedActions = new Set([
        "anchor_click",
        "cta_click",
        "topic_select",
        "signature_select",
        "question_select",
        "section_view",
        "fullscreen_change",
        "journey_complete"
      ]);
      if (typeof event.data.action !== "string" || !allowedActions.has(event.data.action)) return;
      const payload = event.data.payload && typeof event.data.payload === "object"
        ? event.data.payload as Record<string, unknown>
        : event.data.data && typeof event.data.data === "object"
          ? event.data.data as Record<string, unknown>
          : {};
      const safeContextValue = (key: keyof AnalyticsEventContext, maxLength = 96) => {
        const value = payload[key];
        return typeof value === "string" && value.length <= maxLength ? value : undefined;
      };
      const context: AnalyticsEventContext = {
        sectionId: safeContextValue("sectionId"),
        sectionTitle: safeContextValue("sectionTitle"),
        sectionHeadline: safeContextValue("sectionHeadline", 160),
        targetId: safeContextValue("targetId"),
        ctaId: safeContextValue("ctaId"),
        lensId: safeContextValue("lensId"),
        lensTitle: safeContextValue("lensTitle"),
        lensHeadline: safeContextValue("lensHeadline", 160),
        area: safeContextValue("area"),
        position: safeContextValue("position", 16),
        completionKey: safeContextValue("completionKey", 160)
      };
      if (
        event.data.action === "journey_complete"
        && (
          context.position !== "final"
          || !context.sectionId
          || !context.sectionTitle
          || !context.completionKey
        )
      ) return;
      if (event.data.action === "journey_complete" && journeyCompleteAnalyticsOpened.current === session.id) return;
      const next: ClientEvent = {
        action: event.data.action,
        ...describePreviewAnalyticsEvent(event.data.action, context),
        context,
        at: Date.now()
      };
      if (event.data.action === "journey_complete") {
        journeyCompleteAnalyticsOpened.current = session.id;
        setShowAnalyticsPanel(true);
        track("analytics_panel_opened", { useCase: session.useCase, source: "journey-complete" });
      }
      const semanticKey = [next.action, context.ctaId, context.lensId, context.sectionId, context.targetId, context.area]
        .filter(Boolean)
        .join(":");
      setClientEvents((current) => {
        const duplicate = current.some((candidate) => {
          const candidateContext = candidate.context ?? {};
          const candidateKey = [candidate.action, candidateContext.ctaId, candidateContext.lensId, candidateContext.sectionId, candidateContext.targetId, candidateContext.area]
            .filter(Boolean)
            .join(":");
          return candidateKey === semanticKey && next.at - candidate.at < 1_200;
        });
        if (duplicate) return current;
        return [...current.slice(-11), next];
      });
      const elementId = [payload.blockId, payload.ctaId, payload.sectionId, payload.targetId, payload.lensId]
        .find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)
        ?.slice(0, 80);
      const serverEvent = event.data.action === "journey_complete"
        ? "journey-complete"
        : event.data.action === "cta_click"
        ? "cta-clicked"
        : ["topic_select", "signature_select", "question_select"].includes(event.data.action)
          ? "lens-selected"
          : event.data.action === "fullscreen_change"
            ? "preview-opened"
            : "section-viewed";
      const sectionSignalKey = `${session.id}:${elementId || "unknown"}`;
      const duplicateSectionView = event.data.action === "section_view"
        && persistedSectionSignals.current.has(sectionSignalKey);
      if (!duplicateSectionView) {
        if (event.data.action === "section_view") persistedSectionSignals.current.add(sectionSignalKey);
        if (event.data.action === "section_view" && previewScrolledSession.current !== session.id) {
          previewScrolledSession.current = session.id;
          track("preview_scrolled", { useCase: session.useCase });
        }
        captureProductEvent("preview_interaction", {
          category: event.data.action === "cta_click" ? "conversion" : "interaction",
          sessionId: session.id,
          properties: {
            interaction_type: event.data.action,
            interaction_target: elementId || "experience_preview"
          }
        });
        void recordPreviewSignal(session.id, serverEvent, elementId).catch(() => undefined);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [session]);

  const patchAnswers = async (patch: SessionAnswers) => {
    if (!session) return;
    const requestNumber = ++patchRequestRef.current;
    setIsSaving(true);
    setError("");
    try {
      if (patch.sourceUrl || patch.offerSourceUrl) {
        track("research_started", {
          sourceType: patch.offerSourceUrl ? "offer-url" : "content-url"
        });
      }
      const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      if (requestNumber !== patchRequestRef.current) return;
      const nextSession = await confirmHighConfidenceSource(result.session);
      setSession((current) => preservePreviewDuringRegeneration(current, nextSession));
      setAnswers(nextSession.answers);
      if (typeof patch.audience === "string" && patch.audience.trim()) {
        track("audience_confirmed", { useCase: session.useCase });
      }
      if (typeof patch.objective === "string" && patch.objective.trim()) {
        track("goal_confirmed", { useCase: session.useCase });
      }
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "We could not save that answer.");
    } finally {
      if (requestNumber === patchRequestRef.current) setIsSaving(false);
    }
  };

  const backgroundSessionId = session?.id;
  const patchAnswersInBackground = useCallback(async (patch: SessionAnswers) => {
    if (!backgroundSessionId) return;
    try {
      if (patch.offerSourceUrl || patch.sourceUrl) {
        track("research_started", {
          sourceType: patch.offerSourceUrl ? "offer-url" : "content-url"
        });
      }
      await api<{ session: PublicTryMeSession }>(`/api/sessions/${backgroundSessionId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setConnectionError("");
    } catch {
      // Keep the visitor's in-progress form untouched. Polling or a later
      // Continue click can retry the same bounded research mutation.
      setConnectionError("Product research paused. We’ll retry without losing your brief…");
    }
  }, [backgroundSessionId]);

  const patchWorkspace = async (patch: WorkspacePatch) => {
    if (!session) return;
    const requestNumber = ++patchRequestRef.current;
    setIsSaving(true);
    setError("");
    try {
      const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ operation: "update-workspace", ...patch })
      });
      if (requestNumber !== patchRequestRef.current) return;
      setSession((current) => preservePreviewDuringRegeneration(current, result.session));
      setAnswers(result.session.answers);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "We could not update the live brief.");
    } finally {
      if (requestNumber === patchRequestRef.current) setIsSaving(false);
    }
  };

  const uploadPdf = async (file: File) => {
    if (!session) return;
    const activeSession = session;
    setIsSaving(true);
    setError("");
    setPdfUpload({
      status: "uploading",
      fileName: file.name,
      message: "Checking the file, then uploading it securely."
    });
    try {
      await validatePdfFile(file);
      const uploadId = crypto.randomUUID();
      const pathname = `try-me/uploads/${activeSession.id}/${uploadId}.pdf`;
      track("pdf_upload_started", {
        useCase: activeSession.useCase,
        sizeBucket: uploadSizeBucket(file.size)
      });

      await uploadBlob(pathname, file, {
        access: "private",
        contentType: "application/pdf",
        handleUploadUrl: `/api/sessions/${activeSession.id}/upload`,
        clientPayload: JSON.stringify({
          sessionId: activeSession.id,
          uploadId,
          originalName: file.name
        })
      });

      setPdfUpload({
        status: "processing",
        fileName: file.name,
        message: "Upload complete. Extracting the document title and factual anchors now."
      });

      let processedSession: PublicTryMeSession | undefined;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 350 : 700));
        const statusResult = await api<{
          upload: { status: "pending" | "processing" | "complete" | "failed"; errorCode?: string; requestId?: string };
        }>(`/api/sessions/${activeSession.id}/upload?uploadId=${encodeURIComponent(uploadId)}`);
        if (statusResult.upload.status === "failed") {
          throw new ApiResponseError("We could not process that PDF. Try again or choose another file.", {
            status: 422,
            code: statusResult.upload.errorCode ?? "upload_processing_failed",
            requestId: statusResult.upload.requestId
          });
        }
        if (statusResult.upload.status === "complete") {
          const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${activeSession.id}`);
          processedSession = result.session;
          break;
        }
      }
      if (!processedSession) {
        throw new ApiResponseError(
          "Your PDF uploaded, but processing is taking longer than expected. Please try again.",
          { status: 408, code: "upload_processing_timeout" }
        );
      }

      const nextSession = await confirmHighConfidenceSource(processedSession);
      setSession(nextSession);
      setAnswers(nextSession.answers);
      setPdfUpload({
        status: "accepted",
        fileName: file.name,
        message: `${nextSession.answers.sourceTitle?.trim() || file.name} is ready and shaping the experience.`
      });
      track("pdf_upload_completed", {
        useCase: activeSession.useCase,
        sizeBucket: uploadSizeBucket(file.size)
      });
    } catch (uploadError) {
      await reportClientUploadFailure(activeSession.id, file, uploadError);
      const message = friendlyUploadError(uploadError);
      setPdfUpload({
        status: "error",
        fileName: file.name,
        message: activeSession.supportRef
          ? `${message} Support reference: ${activeSession.supportRef}.`
          : message
      });
      track("pdf_upload_failed", {
        useCase: activeSession.useCase,
        code: uploadErrorCode(uploadError),
        sizeBucket: uploadSizeBucket(file.size)
      });
    } finally {
      setIsSaving(false);
    }
  };

  const streamingMode: CampaignEntryMode = campaignEntryMode === "event" || answers.campaignType === "event"
    ? "event"
    : "campaign";
  const recommendedObjective = session ? recommendedObjectiveFor(session) : "Generate demand";
  const evidenceBackedOffers = session?.offerRecommendations?.filter(
    (recommendation) => recommendation.recommendationKind === "evidence-backed"
  ) ?? [];
  const evidenceBackedAudiences = session?.audienceRecommendations?.filter(
    (recommendation) =>
      recommendation.recommendationKind === "evidence-backed" &&
      recommendation.source !== "seller-category-fallback" &&
      recommendation.confidence !== "hypothesis"
  ) ?? [];
  const offerChoices = evidenceBackedOffers.length >= 2
    ? evidenceBackedOffers.map(({ label }) => label)
    : [];
  const audienceChoices = evidenceBackedAudiences.length >= 2
    ? evidenceBackedAudiences.map(({ label }) => label)
    : [];
  const objectiveChoices = session?.objectiveRecommendations?.map(({ label }) => label)
    ?? [recommendedObjective, ...objectives.campaign.filter((objective) => objective !== recommendedObjective)];
  const streamingQuestions = session?.useCase === "campaign"
    ? streamingCampaignQuestions(
      streamingMode,
      audienceChoices,
      objectiveChoices,
      offerChoices,
      {
        offer: evidenceBackedOffers.find(({ recommended }) => recommended)?.label,
        audience: evidenceBackedAudiences[0]?.label,
        objective: session.objectiveRecommendations?.find(({ recommended }) => recommended)?.label
          ?? recommendedObjective
      }
    )
    : [];
  const canonicalStreamingAnswers: StreamingBriefAnswer[] = [...streamingAnswers];
  if (!canonicalStreamingAnswers.some((answer) => answer.questionId === "intent") && answers.promotedOffer) {
    canonicalStreamingAnswers.push({
      questionId: "intent",
      label: streamingMode === "event" ? "Event" : "Campaign",
      value: answers.promotedOffer
    });
  }
  if (!canonicalStreamingAnswers.some((answer) => answer.questionId === "audience") && answers.audience) {
    canonicalStreamingAnswers.push({
      questionId: "audience",
      label: "Audience",
      value: answers.audience === "Other" ? answers.customAudience || "Other" : answers.audience
    });
  }
  if (!canonicalStreamingAnswers.some((answer) => answer.questionId === "goal") && answers.objective) {
    canonicalStreamingAnswers.push({
      questionId: "goal",
      label: "Goal",
      value: answers.objective
    });
  }
  const nextStreamingQuestionId = streamingQuestions.find((question) => (
    !canonicalStreamingAnswers.some((answer) => answer.questionId === question.id)
  ))?.id;
  const streamingCurrentQuestionId = streamingFocusId && streamingQuestions.some((question) => question.id === streamingFocusId)
    ? streamingFocusId
    : nextStreamingQuestionId;
  const currentBrandPresentation = session
    ? prospectBrandPresentation(
        session.brand,
        brandNameFor(session),
        session.stages.brand.status
      )
    : undefined;
  const streamingReceipts: StreamingBriefReceipt[] = session ? [
    {
      id: "brand",
      label: currentBrandPresentation!.label,
      detail: currentBrandPresentation!.detail,
      state:
        currentBrandPresentation!.state === "verified"
          ? "complete" as const
          : currentBrandPresentation!.state === "researching"
            ? "working" as const
            : "attention" as const
    },
    ...(canonicalStreamingAnswers.some((answer) => answer.questionId === "intent") ? [{
      id: "story",
      label: streamingMode === "event" ? "Event direction captured" : "Campaign direction captured",
      detail: "Folloze is organizing the promise, proof, and next step.",
      state: "complete" as const
    }] : []),
    ...(session.experience ? [{
      id: "preview",
      label: "Interactive preview ready",
      detail: session.experience.readiness === "provisional"
        ? "The first page is ready while enrichment continues from worker receipts."
        : "The buyer experience is ready to explore.",
      state: "complete" as const
    }] : [])
  ].slice(-3) : [];
  const canSkipStreaming = Boolean(session && canSkipStreamingCampaign(session));

  const handleStreamingAnswer = (answer: StreamingBriefAnswer) => {
    if (!session || session.useCase !== "campaign") return;
    const isEdit = streamingAnswers.some((candidate) => candidate.questionId === answer.questionId);
    setStreamingAnswers((current) => [
      ...current.filter((candidate) => candidate.questionId !== answer.questionId),
      answer
    ]);
    setStreamingFocusId(undefined);
    const fieldKey = answer.questionId === "intent"
      ? "offer"
      : answer.questionId === "audience"
        ? "audience"
        : answer.questionId === "goal"
          ? "objective"
          : "offer";
    captureUnifiedProductEvent(isEdit ? "brief_field_edited" : "brief_field_confirmed", {
      sessionId: session.id,
      properties: { field_key: fieldKey, has_value: Boolean(answer.value.trim()) }
    });
    track("field_interacted", {
      useCase: session.useCase,
      entryMode: streamingMode,
      field: `streaming_${answer.questionId}`
    });
    if (answer.questionId === "audience") {
      const recommended = evidenceBackedAudiences.some(
        (recommendation) => recommendation.label === answer.value
      );
      void patchAnswers(recommended
        ? { audience: answer.value }
        : { audience: "Other", customAudience: answer.value });
      return;
    }
    if (answer.questionId === "goal") {
      void patchAnswers({ objective: answer.value });
      return;
    }
    const patch = streamingCampaignPatchForIntent(answer.value, streamingMode);
    const interpretation = interpretConversationalBrief(answer.value, "campaign");
    captureUnifiedProductEvent("input_interpreted", {
      sessionId: session.id,
      properties: {
        interpretation: interpretation.campaignType?.value === "event"
          ? "event_brief"
          : interpretation.targetAccount
            ? "account_brief"
            : "campaign_brief",
        field_count: [interpretation.offer, interpretation.audience, interpretation.objective, interpretation.campaignType]
          .filter(Boolean).length,
        has_offer: Boolean(interpretation.offer || patch.promotedOffer),
        has_objective: Boolean(interpretation.objective || patch.objective)
      }
    });
    if (patch.campaignType === "event") setCampaignEntryMode("event");
    void patchAnswers(patch);
  };

  const skipStreamingBrief = () => {
    if (!session || session.useCase !== "campaign") return;
    setStreamingPreviewRequested(true);
    captureUnifiedProductEvent("brief_field_skipped", {
      sessionId: session.id,
      properties: { field_key: "objective" }
    });
    track("field_interacted", {
      useCase: session.useCase,
      entryMode: streamingMode,
      field: "streaming_skip_preview"
    });
    void patchAnswers(streamingCampaignSkipPatch(session, streamingMode));
  };

  const claim = async (email: string) => {
    if (!session) return;
    setClaimStatus("saving");
    setClaimError("");
    track("claim_started", { useCase: session.useCase });
    captureUnifiedProductEvent("claim_attempted", {
      sessionId: session.id,
      properties: { claim_step: "submit", has_value: Boolean(email.trim()) }
    });
    try {
      const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}/claim`, {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setSession(result.session);
      setClaimStatus("saved");
      setShowSavePrompt(false);
      identifyProductVisitor(email);
      track("claim_completed", { useCase: result.session.useCase });
      track("save_completed", { useCase: result.session.useCase });
      track("experience_claimed", { useCase: result.session.useCase });
    } catch (claimFailure) {
      const message = claimFailure instanceof Error ? claimFailure.message : "We could not save this experience.";
      setClaimStatus("error");
      setClaimError(message);
      track("claim_failed", {
        useCase: session.useCase,
        code: claimFailure instanceof ApiResponseError ? claimFailure.code ?? "claim_failed" : "claim_failed"
      });
      if (session.supportRef) {
        captureUnifiedProductEvent("support_reference_created", {
          sessionId: session.id,
          outcome: "failure",
          properties: {
            support_ref: session.supportRef,
            failure_stage: "claim"
          }
        });
      }
    }
  };

  const retryFailedStage = async (stage: StageKey) => {
    if (!session) return;
    captureUnifiedProductEvent("retry_requested", {
      sessionId: session.id,
      properties: {
        retry_scope: "stage",
        worker_name: workerNameForStage(stage)
      }
    });
    if (stage === "brand") {
      try {
        const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}`);
        setSession((current) => preservePreviewDuringRegeneration(current, result.session));
        setAnswers(result.session.answers);
      } catch {
        // Recover path is best-effort; fall through to a soft brief re-touch.
      }
      const style = session.answers.styleVariant || "brand-led";
      await patchWorkspace({ answers: { styleVariant: style } });
      return;
    }
    const patch = answersPatchForStageRetry(stage, session.answers);
    if (Object.keys(patch).length === 0) return;
    await patchAnswers(patch);
  };

  const openSavePrompt = () => {
    if (!session) return;
    const allowed = canOfferClaimModal(session, {
      events: clientEvents,
      previewOpened: Boolean(revealedAt)
    });
    if (!allowed) return;
    track("save_opened", { useCase: session.useCase });
    captureUnifiedProductEvent("modal_displayed", {
      sessionId: session.id,
      properties: { modal_kind: "claim", trigger: "save_cta" }
    });
    setShowSavePrompt(true);
  };

  const allStreamingQuestionsAnswered = streamingQuestions.length > 0
    && streamingQuestions.every((question) => (
      canonicalStreamingAnswers.some((answer) => answer.questionId === question.id)
    ));
  const keepStreamingBriefOpen = Boolean(
    session?.useCase === "campaign"
    && !streamingPreviewRequested
    && !allStreamingQuestionsAnswered
  );
  const generationEligible = isSessionGenerationEligible(session);
  const isReveal = Boolean(
    session
    && canRevealPreview(session)
    && !keepStreamingBriefOpen
  );
  const engagementSeconds = usePreviewForegroundSeconds(
    isReveal && revealedAt && session ? session.id : undefined
  );
  const isProvisionalPreview = isProvisionalExperience(session);
  const lifecyclePhase = previewLifecyclePhase(session);
  const lifecycleCopy = previewLifecycleCopy(lifecyclePhase);
  const personalizationOptions = session ? personalizationVariantOptionsFor(session) : [];
  const canSaveExperience = canOfferClaimModal(session, {
    events: clientEvents,
    previewOpened: Boolean(revealedAt)
  });
  const saveDialogOpen = Boolean(showSavePrompt && session && canSaveExperience);
  const showCampaignPreviewPane = Boolean(
    session?.useCase === "campaign"
    && (canRevealPreview(session) || (generationEligible && session.experience))
  );
  const buildPanelCopy = session ? getBuildPanelCopy(session) : undefined;
  const revealCopy = session ? getRevealCopy(session) : undefined;
  const analyticsSignals: AnalyticsSignal[] = clientEvents.map((event, index) => ({
    id: `${event.at}-${index}`,
    label: event.label,
    detail: event.detail,
    atLabel: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(event.at),
    type: ["preview_viewed", "section_view", "journey_complete", "anchor_click"].includes(event.action) ? "view" : event.action === "cta_click" ? "cta" : "choice",
    action: event.action,
    occurredAt: event.at,
    context: event.context
  }));
  const previewSecondsRemaining = session?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(session.expiresAt) - previewClockNow) / 1_000))
    : 30 * 60;
  const previewCountdown = `${String(Math.floor(previewSecondsRemaining / 60)).padStart(2, "0")}:${String(previewSecondsRemaining % 60).padStart(2, "0")}`;
  const headerStatus = !useCase
    ? "Build a buyer experience in about a minute"
    : !session
      ? useCase === "content"
        ? "Content Magic selected"
        : "Buyer experience selected"
      : lifecyclePhase === "saved_locally" || lifecyclePhase === "claimed"
        ? lifecycleCopy.statusLabel
        : lifecyclePhase === "enriching"
          ? lifecycleCopy.statusLabel
          : isReveal
            ? lifecycleCopy.statusLabel
            : generationEligible
              ? "Material brief ready · composing preview"
              : currentBrandPresentation?.label ?? "Researching the public brand";

  return (
    <>
    <main
      className={`appShell ${isReveal ? "revealMode" : ""}`}
      aria-hidden={showProcess || saveDialogOpen || showAnalyticsPanel ? true : undefined}
      inert={showProcess || saveDialogOpen || showAnalyticsPanel ? true : undefined}
    >
      <header className="siteHeader">
        <Link href="/" aria-label="Folloze Try Me Now home"><Image src="/brand/folloze-logo.svg" width={101} height={25} alt="Folloze" priority /><span>Try Me Now</span></Link>
        <div className="headerPromise" role="status" aria-live="polite"><span className="liveDot" />{headerStatus}</div>
        {session && <button className="resetButton resetButtonProminent" type="button" onClick={resetExperience}><RefreshCw size={16} />Start over</button>}
      </header>

      {!useCase && (
        <section className="entryStage">
          <div className="entryHero">
            <span className="sectionKicker">Try Folloze</span>
            <h1>Build a buyer experience.</h1>
            <p>Start with your company. Answer one missing signal at a time. Folloze assembles a branded buyer experience you can explore before you save.</p>
            <div className="entryPromise" aria-label="Try Me Now experience promise">
              <span><CircleCheck size={14} />One guided conversation</span>
              <span><Clock3 size={14} />First preview in about a minute</span>
              <span><ShieldCheck size={14} />Preview first. Save when ready.</span>
            </div>
          </div>
          <UseCasePortals
            onSelect={selectUseCase}
            disabled={!interactionReady}
          />
          <div className="entryFooter">Start with a company domain. Explore the result before sharing your email.</div>
        </section>
      )}

      {useCase && !session && (
        <DomainStart
          useCase={useCase}
          campaignMode={campaignEntryMode}
          domain={domain}
          onDomain={updateDomain}
          onBack={() => {
            setUseCase(undefined);
            setCampaignEntryMode("campaign");
          }}
          onContinue={() => void startSession(useCase, domain)}
          isStarting={isStarting}
          preflightStatus={preflightStatus}
          error={error}
        />
      )}

      {session && !isReveal && buildPanelCopy && (
        <section className={`workbench ${session.useCase === "campaign" ? "streamingWorkbench" : ""}`}>
          <div className="mobileStatus"><button type="button" aria-expanded={showProcess} aria-controls="mobile-process-dialog" onClick={() => setShowProcess(true)}><span className="liveDot" /><strong>{buildPanelCopy.mobileLabel}</strong><span>{buildPanelCopy.mobileStep}</span><ChevronDown size={15} /></button></div>
          <div className="briefPanel">
            <div className="guidedWorkspaceInner">
              <div className="briefHeader"><span className="sectionKicker">Live brief</span><span className="briefDomain"><Globe2 size={14} />{session.companyDomain}</span></div>
              {session.status === "brand_help_required" ? (
                <BrandHelpRecoveryPanel
                  isSaving={isSaving}
                  onPatch={patchAnswers}
                />
              ) : session.useCase === "campaign" ? (
                <StreamingBriefComposer
                  mode="unified"
                  questions={streamingQuestions}
                  currentQuestionId={streamingCurrentQuestionId}
                  answers={canonicalStreamingAnswers}
                  receipts={streamingReceipts}
                  summaryFields={[
                    {
                      key: "seller",
                      label: "Seller",
                      value: brandNameFor(session),
                      editable: false
                    },
                    {
                      key: "target",
                      label: "Audience",
                      value: answers.audience === "Other" ? answers.customAudience : answers.audience,
                      editable: true
                    },
                    {
                      key: "offer",
                      label: "Offer",
                      value: answers.promotedOffer,
                      editable: true
                    },
                    {
                      key: "objective",
                      label: "Objective",
                      value: answers.objective,
                      editable: true
                    },
                    {
                      key: "experience_type",
                      label: "Experience type",
                      value: experienceTypeLabelFor(session),
                      editable: false
                    }
                  ] satisfies StreamingBriefSummaryField[]}
                  canSkip={canSkipStreaming}
                  skipLabel="Skip to preview"
                  disabled={isSaving}
                  onAnswer={handleStreamingAnswer}
                  onStepChange={(questionId) => {
                    setStreamingFocusId(questionId);
                    captureUnifiedProductEvent("brief_field_edited", {
                      sessionId: session.id,
                      properties: {
                        field_key: questionId === "intent" ? "offer" : questionId === "goal" ? "objective" : "audience",
                        has_value: true
                      }
                    });
                  }}
                  onSummaryEdit={(fieldKey) => {
                    const questionId = fieldKey === "offer"
                      ? "intent"
                      : fieldKey === "objective"
                        ? "goal"
                        : fieldKey === "audience" || fieldKey === "target"
                          ? "audience"
                          : undefined;
                    if (questionId) setStreamingFocusId(questionId);
                    captureUnifiedProductEvent("brief_field_edited", {
                      sessionId: session.id,
                      properties: { field_key: fieldKey, has_value: true }
                    });
                  }}
                  onSkip={skipStreamingBrief}
                />
              ) : (
                <>
                  <ConversationThread session={session} onRestart={resetExperience} />
                  <ProgressiveQuestions
                    session={session}
                    answers={answers}
                    isSaving={isSaving}
                    pdfUpload={pdfUpload}
                    onPatch={patchAnswers}
                    onBackgroundPatch={patchAnswersInBackground}
                    onWorkspacePatch={patchWorkspace}
                    onUpload={uploadPdf}
                  />
                  {!(session.useCase === "abm" && !answers.targetDomain) && <IntentComposer
                    session={session}
                    answers={answers}
                    isSaving={isSaving}
                    pdfUpload={pdfUpload}
                    onPatch={patchAnswers}
                    onUpload={uploadPdf}
                  />}
                </>
              )}
              <div className="brandLockStage">
                <InstantBrandLockStrip
                  status={!session.brand ? "scanning" : session.stages.brand.status === "fallback" || session.brand.readiness?.status === "incomplete" ? "fallback" : "locked"}
                  brand={session.brand ? {
                    companyName: session.brand.companyName,
                    domain: session.brand.domain,
                    canonicalDomain: session.brand.canonicalDomain,
                    logoUrl: previewLogoUrl(session),
                    colors: session.brand.colors,
                    primaryColor: session.brand.primaryColor,
                    accentColor: session.brand.accentColor,
                    surfaceColor: session.brand.surfaceColor,
                    source: session.brand.source,
                    readiness: session.brand.readiness
                  } : { companyName: displayNameFromDomain(session.companyDomain), domain: session.companyDomain }}
                  onInspect={() => setShowProcess(true)}
                />
              </div>
              {error && <div className="inlineError" role="alert">{error}</div>}
              {connectionError && <div className="connectionNotice" role="status"><LoaderCircle className="spin" size={15} />{connectionError}</div>}
            </div>
          </div>
          {session.useCase === "campaign" && (
            <div className="buildPanel streamingPreviewPanel">
              <div className="buildTop">
                <span className="sectionKicker">
                  {showCampaignPreviewPane
                    ? "Live preview"
                    : generationEligible
                      ? "Composing"
                      : "Brand lock"}
                </span>
                <strong>
                  {showCampaignPreviewPane
                    ? "The page stays visible while enrichment continues."
                    : generationEligible
                      ? "The material brief is ready. Provisional preview starts next."
                      : buildPanelCopy.headline}
                </strong>
              </div>
              {showCampaignPreviewPane ? (
                <AssemblyPreview session={session} iframeRef={previewFrameRef} />
              ) : (
                <div className="previewEligibilityHold" role="status" data-preview-gated="material-brief">
                  <span className="sectionKicker">Preview waits on the material brief</span>
                  <p>
                    {generationEligible
                      ? "Generation is eligible. Folloze is composing the first interactive preview."
                      : "Finish seller, audience or target, offer, and objective before the preview reveals."}
                  </p>
                </div>
              )}
            </div>
          )}
          <aside className="processRail">
            <CampaignOverviewRail
              session={session}
              onEdit={session.useCase === "campaign"
                ? (field) => {
                  const questionId = overviewQuestionFor(field, session.useCase);
                  if (questionId) setStreamingFocusId(questionId);
                }
                : undefined}
            />
          </aside>
        </section>
      )}

      {session && isReveal && revealCopy && (
        <section className="revealStage" data-lifecycle-phase={lifecyclePhase}>
          <div className="revealIntro">
            <div className="revealIntroCopy">
              <span className="sectionKicker">
                {lifecycleCopy.kicker}
              </span>
              <h1>{getRevealShellHeadline(session)}</h1>
              <p className="revealPayoff">
                {isProvisionalPreview
                  ? "The experience is interactive now. Enrichment continues from worker receipts without taking the page away."
                  : revealCopy.summary}
              </p>
              <div className="revealMeta">
                <span>Built from public brand and company signals</span>
                <i />
                <span>{lifecycleCopy.publicationNote}</span>
              </div>
            </div>
            <div className="revealActions">
              {session.status === "claimed" ? (
                <CopyButton value={session.liveUrl || session.temporaryUrl} className="buttonSecondary" />
              ) : canSaveExperience ? (
                <button className="buttonPrimary" type="button" onClick={openSavePrompt}>
                  <Mail size={16} />Save this preview
                </button>
              ) : isProvisionalPreview ? (
                <span className="buttonPrimary" role="status">
                  <LoaderCircle className="spin" size={16} />
                  Enriching from receipts
                </span>
              ) : (
                <span className="buttonSecondary" role="status">
                  Explore the preview to unlock save
                </span>
              )}
              <a className="buttonSecondary" href={session.liveUrl || session.temporaryUrl} target="_blank" rel="noopener">{isProvisionalPreview ? "Open working preview" : "Open full screen"}<ExternalLink size={16} /></a>
            </div>
          </div>
          <PreviewUpdateNotice
            session={session}
            onRetry={() => void retryFailedStage("story")}
          />
          <div className="revealGrid">
            <div className="revealPreview">
              <div className="previewControlBar">
                <div className="desktopPreviewLabel">
                  <Globe2 size={16} aria-hidden="true" />
                  <span><strong>Live preview</strong><small>Scroll inside to explore the full experience.</small></span>
                </div>
                <div className="previewToolbarActions">
                  {lifecyclePhase === "saved_locally" || lifecyclePhase === "claimed" ? (
                    <span className="previewReadinessStatus isSaved" data-lifecycle-phase={lifecyclePhase}>
                      <Check size={14} />{lifecycleCopy.statusLabel}
                    </span>
                  ) : lifecyclePhase === "enriching" ? (
                    <span className="previewReadinessStatus isEnriching" data-lifecycle-phase="enriching">
                      <LoaderCircle className="spin" size={14} />Interactive · enriching
                    </span>
                  ) : (
                    <span
                      className={`previewReadinessStatus ${previewSecondsRemaining <= 300 ? "isWarning" : ""}`}
                      data-lifecycle-phase="preview_ready"
                    >
                      <Clock3 size={14} />Preview ready · {previewCountdown}
                    </span>
                  )}
                  <button
                    className="previewAnalyticsButton"
                    type="button"
                    aria-label={`See live engagement, ${Math.max(analyticsSignals.length, 1)} ${Math.max(analyticsSignals.length, 1) === 1 ? "signal" : "signals"}`}
                    onClick={() => {
                      setShowAnalyticsPanel(true);
                      track("analytics_panel_opened", { useCase: session.useCase, source: "preview-toolbar" });
                    }}
                  >
                    <Gauge size={16} />See live engagement<span aria-hidden="true">{Math.max(analyticsSignals.length, 1)}</span>
                  </button>
                </div>
              </div>
              <PersonalizationVariantBar
                options={personalizationOptions}
                selectedId={personalizationVariantId}
                onSelect={selectPersonalizationVariant}
              />
              <div className="desktopPreviewShell">
                <AssemblyPreview session={session} iframeRef={previewFrameRef} />
              </div>
              <a
                className="mobilePreviewCta"
                href={session.liveUrl || session.temporaryUrl}
                target="_blank"
                rel="noopener"
              >
                {isProvisionalPreview ? "Explore the working preview" : "Explore the full experience"}<ArrowRight size={16} />
              </a>
            </div>
          </div>
          <div className="revealFooter">
            <span>{lifecyclePhase === "saved_locally" || lifecyclePhase === "claimed" ? "Saved URL" : "Temporary URL"}</span>
            <code>{session.liveUrl || session.temporaryUrl}</code>
            <span>
              {lifecyclePhase === "saved_locally" || lifecyclePhase === "claimed"
                ? lifecycleCopy.statusLabel
                : lifecyclePhase === "enriching"
                  ? "Enrichment continuing from worker receipts"
                  : "Expires 30 minutes after generation"}
            </span>
          </div>
        </section>
      )}

      {showProcess && session && <MobileProcessDialog session={session} onClose={() => setShowProcess(false)} />}
    </main>
    {saveDialogOpen && session && (
      <SaveExperienceDialog
        open
        expiresLabel={previewCountdown}
        url={session.liveUrl || session.temporaryUrl}
        sellerName={brandNameFor(session)}
        targetName={session.useCase === "abm" ? targetNameFor(session) : undefined}
        headline={session.experience?.headline || `${brandNameFor(session)} experience`}
        remainingSeconds={previewSecondsRemaining}
        email={claimEmail}
        status={claimStatus}
        error={claimError}
        onEmailChange={setClaimEmail}
        onSave={() => void claim(claimEmail)}
        onClose={() => setShowSavePrompt(false)}
      />
    )}
    <AnalyticsSignalPanel
      open={showAnalyticsPanel}
      signals={analyticsSignals}
      engagedSeconds={engagementSeconds}
      sessionId={session?.id}
      audienceLabel={answers.customAudience || answers.audience}
      isSaved={session?.status === "claimed"}
      onClose={closeAnalyticsPanel}
    />
    </>
  );
}
