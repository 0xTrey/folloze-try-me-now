"use client";

import { upload as uploadBlob } from "@vercel/blob/client";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  LoaderCircle,
  Mail,
  Megaphone,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import {
  AnalyticsSignalPanel,
  AnalyticsSignalToast,
  AssetPicker,
  AudienceEvidenceTray,
  ContentSourceConfirmation,
  CtaDestinationControl,
  DevicePreviewToolbar,
  EditBriefDrawer,
  EntryPathMicroDemo,
  ExpirySaveValuePanel,
  ExperienceBlockControl as ExperienceBlockControlPanel,
  ExperienceVariantCards,
  InstantBrandLockStrip,
  MessageDirectionControl,
  PersonalizationQualityReceipt,
  ProgressiveArtifactStream,
  SavedExperienceCockpit,
  ToneChips,
  type AnalyticsSignal,
  type CtaValue,
  type EntryPathOption,
  type PreviewDevice
} from "@/components/try-me-now-enhancements";

import type {
  ExperienceBlockControl as SessionExperienceBlockControl,
  PublicTryMeSession,
  SessionEvidenceItem,
  SessionAnswers,
  StageState,
  UseCase
} from "@/lib/types";
import {
  ApiResponseError,
  friendlyUploadError,
  readJsonResponse,
  uploadErrorCode,
  validatePdfFile
} from "@/lib/client-response";

type ClientEvent = { action: string; label: string; at: number };

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
    title: "Break into one account",
    description: "Shape one experience around the company, buying group, and next move.",
    cta: "Build a 1:1 experience",
    domainTitle: "Start with the brand making the case.",
    domainBody: "We will capture its public identity now, then map it against the account you choose.",
    icon: Target,
    className: "portalEditorial"
  },
  campaign: {
    number: "02",
    kicker: "Campaign",
    title: "Launch the campaign",
    description: "Build a focused landing page for an offer, segment, product, or event.",
    cta: "Build a campaign page",
    domainTitle: "Start with the brand buyers should recognize.",
    domainBody: "We will capture its voice and visual system while you choose the offer and outcome.",
    icon: Megaphone,
    className: "portalCobalt"
  },
  content: {
    number: "03",
    kicker: "Content",
    title: "Make content work harder",
    description: "Turn a URL or PDF into a guided, measurable path buyers want to explore.",
    cta: "Transform my content",
    domainTitle: "Start with the company behind the source.",
    domainBody: "We will capture the brand now, then turn a URL or PDF into a guided buyer path.",
    icon: BookOpen,
    className: "portalTerminal"
  }
};

const objectives: Record<UseCase, string[]> = {
  abm: ["Introduce a product", "Educate the buying group", "Accelerate an opportunity", "Book a meeting"],
  campaign: ["Generate demand", "Drive registrations", "Launch or announce", "Book meetings"],
  content: ["Educate buyers", "Increase content engagement", "Capture qualified interest", "Book a meeting"]
};

const entryPathOptions: Record<UseCase, EntryPathOption> = {
  abm: {
    id: "abm",
    index: "01",
    eyebrow: "1:1 ABM",
    title: "Break into one account",
    description: "Watch public account evidence become a credible, one-to-one buyer journey.",
    actionLabel: "Build my 1:1 page",
    exampleLabel: "Watch a Jitterbit × Cisco example",
    demoSteps: ["Seller", "Account evidence", "1:1 experience"],
    accent: "#645cff",
    tone: "paper"
  },
  campaign: {
    id: "campaign",
    index: "02",
    eyebrow: "Campaign",
    title: "Launch a campaign people explore",
    description: "Turn one offer and one audience into a sharp, measurable campaign front door.",
    actionLabel: "Build my campaign page",
    exampleLabel: "Watch a product-launch example",
    demoSteps: ["Offer", "Buyer objective", "Live campaign"],
    accent: "#5865ff",
    tone: "cobalt"
  },
  content: {
    id: "content",
    index: "03",
    eyebrow: "Content",
    title: "Make your best content interactive",
    description: "Preserve the facts, then reshape a URL or PDF into a guided buyer path.",
    actionLabel: "Transform my content",
    exampleLabel: "Watch a report become an experience",
    demoSteps: ["Source", "Buyer lens", "Magic experience"],
    accent: "#67e8c5",
    tone: "ink"
  }
};

const exampleSeeds: Record<UseCase, { companyDomain: string; answers: SessionAnswers }> = {
  abm: {
    companyDomain: "jitterbit.com",
    answers: {
      targetDomain: "cisco.com",
      audience: "Enterprise architecture and platform leaders",
      objective: "Book a meeting",
      exampleMode: true,
      exampleKey: "jitterbit-cisco-abm",
      messageBelief: "Integration architecture can become an AI advantage instead of another source of sprawl.",
      messageAction: "Bring the first enterprise automation use case into a working session.",
      ctaType: "book-meeting",
      ctaDestination: "https://www.jitterbit.com/contact/",
      styleVariant: "brand-led",
      toneVariant: "executive",
      layoutVariant: "immersive"
    }
  },
  campaign: {
    companyDomain: "jitterbit.com",
    answers: {
      campaignType: "product",
      audience: "Enterprise architects and automation leaders",
      objective: "Launch or announce",
      exampleMode: true,
      exampleKey: "jitterbit-product-campaign",
      messageBelief: "Secure AI agents need an integration foundation built for enterprise systems.",
      messageAction: "Explore the architecture and identify the first workflow to activate.",
      ctaType: "explore",
      styleVariant: "technical",
      toneVariant: "provocative",
      layoutVariant: "modular"
    }
  },
  content: {
    companyDomain: "jitterbit.com",
    answers: {
      sourceUrl: "https://www.jitterbit.com/blog/jitterbit-mcp-the-secure-foundation-for-enterprise-ai-agents/",
      sourceConfirmed: true,
      audience: "Enterprise architects and AI platform owners",
      objective: "Increase content engagement",
      exampleMode: true,
      exampleKey: "jitterbit-mcp-content",
      messageBelief: "MCP becomes enterprise-ready when governance and integration are designed together.",
      messageAction: "Choose the architecture question you want to resolve first.",
      ctaType: "explore",
      styleVariant: "editorial",
      toneVariant: "technical",
      layoutVariant: "narrative"
    }
  }
};

function uiCtaType(value?: SessionAnswers["ctaType"]): CtaValue["type"] {
  if (value === "register") return "registration";
  if (value === "download" || value === "explore") return "content";
  if (value === "custom" || value === "contact-sales") return "custom";
  return "meeting";
}

function serverCtaType(value: CtaValue["type"]): NonNullable<SessionAnswers["ctaType"]> {
  if (value === "registration") return "register";
  if (value === "content") return "download";
  if (value === "custom") return "custom";
  return "book-meeting";
}

function defaultCtaLabel(value: CtaValue["type"]): string {
  if (value === "registration") return "Register now";
  if (value === "content") return "Explore the content";
  if (value === "custom") return "Take the next step";
  return "Book a meeting";
}

const likelyDomain = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\/?$/i;
const CEREMONY_DURATION_MS = 4_800;

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
  const stem = value?.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0];
  if (!stem) return "the company";
  return stem
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function trimLabel(value: string, max = 42): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  const candidate = compact.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return `${candidate || compact.slice(0, max).trim()}…`;
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

function sourceNameFor(session: PublicTryMeSession): string {
  const brandName = brandNameFor(session);
  const sourceName = session.answers.sourceName?.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  if (sourceName) return trimLabel(sourceName, 54);
  if (session.useCase === "content" && session.experience?.title) {
    const title = session.experience.title.split("|")[0]?.trim();
    if (title) return trimLabel(title, 54);
  }
  return `${brandName} content`;
}

export function ceremonyDuration(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : CEREMONY_DURATION_MS;
}

export function buildMoments(session?: PublicTryMeSession): BuildMoment[] {
  const pending: StageState["status"] = "pending";
  const brandName = session?.brand?.companyName || displayNameFromDomain(session?.companyDomain);
  const targetName = session?.targetBrand?.companyName || displayNameFromDomain(session?.answers.targetDomain);
  const audience = session?.answers.customAudience || session?.answers.audience;
  const objective = session?.answers.objective;
  const buyerContext = session?.useCase === "abm" ? targetName : brandName;
  const brandState = session?.stages.brand.status ?? pending;
  const audienceState = session?.stages.audience.status ?? pending;
  const experienceState = session?.experience ? "complete" : session?.stages.story.status ?? pending;

  return [
    {
      key: "brand",
      phase: "Brand system",
      title: ["complete", "fallback"].includes(brandState)
        ? brandState === "fallback" ? "Brand language reconstructed" : "Public identity captured"
        : brandState === "running" ? `Reading ${brandName}` : "Brand scan queued",
      detail: `Reading the identity, palette, and visual cues buyers already associate with ${brandName}.`,
      artifact: ["complete", "fallback"].includes(brandState)
        ? `${brandName} · ${session?.brand?.colors.length || 1} brand colors`
        : undefined,
      status: brandState,
      icon: Globe2
    },
    {
      key: "buyer",
      phase: "Buyer fit",
      title: audience
        ? "Buyer context locked"
        : audienceState === "running" ? `Mapping roles at ${buyerContext}` : audienceState === "complete" ? "Company-fit roles found" : "Buyer mapping queued",
      detail: `Turning ${buyerContext}'s public product and market context into relevant buying roles.`,
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
      phase: "Message strategy",
      title: objective ? "One outcome locked" : "Waiting for the objective",
      detail: "The objective decides the tension, proof, and single next move the page should earn.",
      artifact: objective ? `Objective · ${objective}` : undefined,
      status: objective ? "complete" : pending,
      icon: Target
    },
    {
      key: "experience",
      phase: "Experience",
      title: session?.experience
        ? "Narrative and page assembled"
        : experienceState === "running" ? "Composing the buyer journey" : experienceState === "failed" ? "Composition needs another pass" : "Composition queued",
      detail: "Composing the story, proof modules, interaction path, and CTA into one guided experience.",
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
  const common = {
    urlLabel: session.status === "claimed" ? "Saved URL ready" : "Private URL active",
    mobileLabel: currentMoment.title,
    mobileStep: `${Math.min(currentIndex + 1, moments.length)} of ${moments.length}`
  };

  if (!["complete", "fallback"].includes(session.stages.brand.status)) {
    return {
      ...common,
      kicker: "Brand harvest · live",
      headline: `Reading ${brandName} while you keep moving.`,
      supporting: "Identity, palette, and public positioning are being assembled in the background."
    };
  }

  if (session.useCase === "abm" && !session.answers.targetDomain) {
    return {
      ...common,
      kicker: `${brandName} · brand mapped`,
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
      kicker: `${brandName} · brand mapped`,
      headline: "The brand is ready. Choose the campaign shape.",
      supporting: "Product, demand, and event paths earn attention differently, so the page will too."
    };
  }

  if (session.useCase === "content" && !session.answers.sourceUrl && !session.answers.sourceName) {
    return {
      ...common,
      kicker: `${brandName} · brand mapped`,
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
      targetTitle: `Which account should see itself in ${brandName}'s story?`,
      targetBody: `Add the account domain. We will map its public context against ${brandName}'s value before the page is composed.`,
      campaignTitle: "What are you taking to market?",
      campaignBody: "The offer changes the page structure and the action buyers should take.",
      sourceTitle: "Which content should do more work?",
      sourceBody: "Give us a public URL or PDF. We will preserve the facts and reshape the way buyers explore them.",
      audienceLoadingTitle: `Mapping the buying roles that fit ${targetName}.`,
      audienceLoadingBody: `We are reading ${targetName}'s public product and operating context now.`,
      audienceTitle: `Who at ${targetName} needs to believe it?`,
      audienceBody: `Choose the closest role. The options combine ${targetName}'s public context with the decision ${brandName} helps buyers make.`,
      objectiveTitle: `What should ${targetName} do next?`,
      objectiveBody: "One outcome will set the tension, proof, and CTA across the entire experience.",
      completeTitle: `${brandName} × ${targetName}. The brief is locked.`,
      completeBody: "Folloze is composing the account story, proof sequence, interaction path, and next move now."
    };
  }

  if (session.useCase === "content") {
    return {
      targetTitle: "Which account should this feel built for?",
      targetBody: "Add the target domain to create an account-specific version.",
      campaignTitle: "What are you taking to market?",
      campaignBody: "The offer changes the page structure and the action buyers should take.",
      sourceTitle: `Which ${brandName} content should become interactive?`,
      sourceBody: "We will preserve the source facts, then turn them into a guided path buyers can explore and you can measure.",
      audienceLoadingTitle: `Finding the buyers who should get more from ${sourceName}.`,
      audienceLoadingBody: `We are pairing ${brandName}'s public market context with the source now.`,
      audienceTitle: `Who should get more from ${sourceName}?`,
      audienceBody: "Choose the buyer lens. It will change what gets emphasized, sequenced, and measured.",
      objectiveTitle: `What should ${sourceName} unlock?`,
      objectiveBody: "One outcome will decide how the source becomes a useful next step instead of another download.",
      completeTitle: `${sourceName} is becoming a buyer path.`,
      completeBody: "Folloze is preserving the facts while composing the guided sequence, interaction, and next move."
    };
  }

  return {
    targetTitle: "Which account should this feel built for?",
    targetBody: "Add the target domain to create an account-specific version.",
    campaignTitle: `What is ${brandName} taking to market?`,
    campaignBody: "Choose the campaign shape. It will change the page rhythm, proof pattern, and conversion path.",
    sourceTitle: "Which content should do more work?",
    sourceBody: "Give us a public URL or PDF. We will preserve the facts and reshape the way buyers explore them.",
    audienceLoadingTitle: `Finding the buyers this ${brandName} campaign should move.`,
    audienceLoadingBody: `We are reading ${brandName}'s public product and market context now.`,
    audienceTitle: `Who should ${brandName}'s campaign move?`,
    audienceBody: "Choose the buyer who should recognize the problem, trust the proof, and care about the next step.",
    objectiveTitle: "What must this campaign earn?",
    objectiveBody: "One outcome will keep the promise, proof, and CTA pointed in the same direction.",
    completeTitle: `${campaignTypeFor(session)} brief locked.`,
    completeBody: "Folloze is composing the campaign promise, proof sequence, interaction, and conversion path now."
  };
}

export function getRevealCopy(session: PublicTryMeSession): RevealCopy {
  const brandName = brandNameFor(session);
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
      summary: `${targetName} now has a ${brandName} story for ${audience}, with one job: ${objective.toLowerCase()}.`,
      counterpart: targetName,
      receipts: [
        { number: "01", label: `${trimLabel(brandName, 24)} identity matched` },
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
      summary: `${sourceName} is now a guided ${brandName} path for ${audience}, built to ${objective.toLowerCase()}.`,
      counterpart: sourceName,
      receipts: [
        { number: "01", label: `${trimLabel(brandName, 24)} identity matched` },
        { number: "02", label: `${trimLabel(sourceName, 30)} transformed` },
        { number: "03", label: `${trimLabel(audience, 30)} lens applied` },
        { number: "04", label: `${trimLabel(objective, 30)} path composed` }
      ]
    };
  }

  return {
    kicker: `${brandName} · ${campaignType.toLowerCase()}`,
    headline,
    summary: `${brandName} now has a live ${campaignType.toLowerCase()} for ${audience}, built to ${objective.toLowerCase()}.`,
    counterpart: campaignType,
    receipts: [
      { number: "01", label: `${trimLabel(brandName, 24)} identity matched` },
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
  return `${brandName}'s ${campaignTypeFor(session).toLowerCase()}, ready to launch.`;
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

function track(action: string, detail: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("try-me-track", { detail: { action, ...detail } }));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  return readJsonResponse<T>(response);
}

async function recordPreviewSignal(
  sessionId: string,
  event: "preview-opened" | "section-viewed" | "lens-selected" | "cta-clicked",
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
            <span>{lockedCount} of {moments.length} intelligence layers locked</span>
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

function UseCasePortals({
  onSelect,
  onExample
}: {
  onSelect: (value: UseCase) => void;
  onExample: (value: UseCase) => void;
}) {
  return (
    <div className="entryPathRail" aria-label="Choose what you want to create">
      {(Object.keys(entryPathOptions) as UseCase[]).map((key) => (
        <EntryPathMicroDemo
          key={key}
          option={entryPathOptions[key]}
          onSelect={onSelect}
          onExample={onExample}
        />
      ))}
    </div>
  );
}

function DomainStart({
  useCase,
  domain,
  onDomain,
  onBack,
  isStarting,
  error
}: {
  useCase: UseCase;
  domain: string;
  onDomain: (value: string) => void;
  onBack: () => void;
  isStarting: boolean;
  error?: string;
}) {
  const portal = useCaseContent[useCase];
  return (
    <section className="domainStage">
      <button className="textBack" type="button" onClick={onBack}><ArrowLeft size={16} />Choose another path</button>
      <div className="domainStageGrid">
        <div>
          <span className="sectionKicker">{portal.kicker}</span>
          <h2>{portal.domainTitle}</h2>
          <p>{portal.domainBody} The build begins as soon as we recognize the domain.</p>
        </div>
        <label className={`domainInput ${isStarting ? "isWorking" : ""}`}>
          <span>Company domain</span>
          <div>
            <Globe2 size={20} />
            <input
              value={domain}
              onChange={(event) => onDomain(event.target.value)}
              placeholder="yourcompany.com"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
              aria-describedby={error ? "domain-error" : "domain-help"}
            />
            {isStarting && <LoaderCircle className="spin" size={19} />}
          </div>
          <small id={error ? "domain-error" : "domain-help"} className={error ? "fieldError" : ""}>
            {error || (isStarting ? "Finding the public brand signals now." : "No email or login required.")}
          </small>
        </label>
      </div>
    </section>
  );
}

function ChipGroup({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  label: string;
  options: string[];
  value?: string;
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
            onClick={() => onChange(option)}
          >
            <span>{option}</span>{value === option ? <Check size={16} /> : <ArrowRight size={15} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ProgressiveQuestions({
  session,
  answers,
  isSaving,
  onPatch,
  onWorkspacePatch,
  onUpload,
  onRestart
}: {
  session: PublicTryMeSession;
  answers: SessionAnswers;
  isSaving: boolean;
  onPatch: (patch: SessionAnswers) => Promise<void>;
  onWorkspacePatch: (patch: WorkspacePatch) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onRestart: () => void;
}) {
  const questionKey =
    session.useCase === "abm" && !answers.targetDomain
      ? "target-domain"
      : session.useCase === "campaign" && answers.campaignType === "event" && !answers.eventSource
        ? "event-source"
        : session.useCase === "content" && !answers.sourceUrl && !answers.sourceName
          ? "content-source"
          : answers.audience === "Other" && !answers.customAudience
            ? "custom-audience"
            : "none";
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [sourceMode, setSourceMode] = useState<"url" | "pdf">("url");
  const textValue = fieldValues[questionKey] ?? "";
  const setTextValue = (value: string) =>
    setFieldValues((current) => ({ ...current, [questionKey]: value }));
  const questionCopy = getGuidedQuestionCopy(session);

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

  if (session.useCase === "campaign" && !answers.campaignType) {
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · campaign</span>
        <h2>{questionCopy.campaignTitle}</h2>
        <p>{questionCopy.campaignBody}</p>
        <div className="largeChoiceGrid" aria-busy={isSaving || undefined}>
          {[
            ["product", "Product or solution", "Build demand around one clear promise."],
            ["demand", "Demand generation", "Create a focused path from interest to action."],
            ["event", "Event or webinar", "Frame the reason to attend and make registration obvious."]
          ].map(([value, title, body]) => (
            <button type="button" key={value} disabled={isSaving} onClick={() => void onPatch({ campaignType: value as SessionAnswers["campaignType"] })}>
              <strong>{title}</strong><span>{body}</span><ArrowRight size={16} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (session.useCase === "campaign" && answers.campaignType === "event" && !answers.eventSource) {
    return (
      <form className="questionCard" onSubmit={(event) => { event.preventDefault(); void onPatch({ eventSource: textValue }); }}>
        <span className="questionCount">Next signal · event</span>
        <h2>Where can we find the event details?</h2>
        <p>Add the event URL or a compact description. We will not invent speakers, dates, or agenda details.</p>
        <label className="lineInput"><span>Event URL or details</span><div><FileText size={19} /><input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="https://... or September 12 webinar" /></div></label>
        <button className="buttonPrimary" disabled={textValue.trim().length < 8 || isSaving}>Use these details<ArrowRight size={17} /></button>
      </form>
    );
  }

  if (session.useCase === "content" && !answers.sourceUrl && !answers.sourceName) {
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · source</span>
        <h2>{questionCopy.sourceTitle}</h2>
        <p>{questionCopy.sourceBody}</p>
        <div className="sourceTabs" role="tablist" aria-label="Content source type">
          <button type="button" role="tab" id="source-tab-url" aria-controls="source-panel-url" aria-selected={sourceMode === "url"} className={sourceMode === "url" ? "isActive" : ""} onClick={() => setSourceMode("url")}>Public URL</button>
          <button type="button" role="tab" id="source-tab-pdf" aria-controls="source-panel-pdf" aria-selected={sourceMode === "pdf"} className={sourceMode === "pdf" ? "isActive" : ""} onClick={() => setSourceMode("pdf")}>PDF upload</button>
        </div>
        {sourceMode === "url" ? (
          <form className="sourceForm" role="tabpanel" id="source-panel-url" aria-labelledby="source-tab-url" onSubmit={(event) => { event.preventDefault(); void onPatch({ sourceUrl: textValue }); }}>
            <label className="lineInput"><span>Content URL</span><div><ExternalLink size={19} /><input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="https://yourcompany.com/report" /></div></label>
            <button className="buttonPrimary" disabled={!/^https:\/\//i.test(textValue.trim()) || isSaving}>Use this content<ArrowRight size={17} /></button>
          </form>
        ) : (
          <label className="uploadBox" role="tabpanel" id="source-panel-pdf" aria-labelledby="source-tab-pdf" aria-busy={isSaving || undefined}>
            <FileText size={24} />
            <strong>Drop in a PDF</strong>
            <span>{isSaving ? "Uploading securely…" : "Up to 10 MB. The file is used only to build this experience."}</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={isSaving}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) {
                  setFieldValues((current) => ({ ...current, "content-source": file.name }));
                  void onUpload(file);
                }
              }}
            />
          </label>
        )}
      </div>
    );
  }

  if (
    session.useCase === "content" &&
    (answers.sourceUrl || answers.sourceName) &&
    session.sourceConfirmation?.status !== "confirmed"
  ) {
    const submittedSource = fieldValues["content-source"] || (answers.sourceName ? "Uploaded PDF" : "Public URL");
    let sourceHost = answers.sourceName ? "Secure PDF upload" : "Public web source";
    let sourceTitle = submittedSource.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
    try {
      const parsed = new URL(submittedSource);
      sourceHost = parsed.hostname.replace(/^www\./, "");
      sourceTitle = parsed.pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, " ") || `${brandNameFor(session)} source`;
    } catch {
      // Uploaded filenames and the privacy-preserving public placeholder are shown as labels only.
    }
    return (
      <div className="questionCard sourceConfirmationStep">
        <ContentSourceConfirmation
          source={{
            title: trimLabel(sourceTitle, 72),
            sourceLabel: answers.sourceName ? "Uploaded PDF" : "Public content URL",
            host: sourceHost,
            facts: [
              `Brand context: ${brandNameFor(session)}`,
              answers.sourceName ? "The uploaded PDF is the factual source." : "The supplied public page is the factual source.",
              "Generated claims will stay constrained to this source."
            ]
          }}
          confirmed={false}
          onConfirm={() => void onWorkspacePatch({ sourceConfirmation: "confirmed" })}
          onReplace={onRestart}
        />
      </div>
    );
  }

  if (!answers.audience) {
    if (session.audienceSuggestions.length === 0) {
      return (
        <div className="questionCard generationCard" role="status" aria-live="polite">
          <span className="generationGlyph"><LoaderCircle className="spin" size={24} /></span>
          <span className="questionCount">Next signal · audience</span>
          <h2>{questionCopy.audienceLoadingTitle}</h2>
          <p>{questionCopy.audienceLoadingBody}</p>
        </div>
      );
    }
    const recommendations = session.audienceRecommendations ?? [];
    const evidence = new Map((session.evidenceItems ?? []).map((item) => [item.id, item]));
    if (recommendations.length) {
      return (
        <div className="questionCard audienceEvidenceStep">
          <span className="questionCount">Next signal · audience</span>
          <h2>{questionCopy.audienceTitle}</h2>
          <p>{questionCopy.audienceBody}</p>
          <AudienceEvidenceTray
            companyName={session.useCase === "abm" ? targetNameFor(session) : brandNameFor(session)}
            selectedId={session.selectedAudienceRecommendationId}
            options={recommendations.map((recommendation) => {
              const supporting = recommendation.evidenceItemIds
                .map((id) => evidence.get(id))
                .filter((item): item is SessionEvidenceItem => Boolean(item));
              return {
                id: recommendation.id,
                label: recommendation.label,
                rationale: recommendation.rationale,
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
            onSelect={(id) => void onWorkspacePatch({ selectedAudienceRecommendationId: id })}
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
            onClick={() => void onPatch({ audience: "Other" })}
          >
            I have a different audience in mind <ArrowRight size={15} />
          </button>
        </div>
      );
    }
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · audience</span>
        <h2>{questionCopy.audienceTitle}</h2>
        <p>{questionCopy.audienceBody}</p>
        <ChipGroup label="Choose an audience" options={[...session.audienceSuggestions, "Other"]} value={answers.audience} disabled={isSaving} onChange={(audience) => void onPatch({ audience })} />
      </div>
    );
  }

  if (answers.audience === "Other" && !answers.customAudience) {
    return (
      <form className="questionCard" onSubmit={(event) => { event.preventDefault(); void onPatch({ customAudience: textValue }); }}>
        <span className="questionCount">Refine the audience</span>
        <h2>Who should we build around?</h2>
        <label className="lineInput"><span>Audience</span><div><Users size={19} /><input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Regional field marketing leaders" /></div></label>
        <button className="buttonPrimary" disabled={textValue.trim().length < 3 || isSaving}>Use this audience<ArrowRight size={17} /></button>
      </form>
    );
  }

  if (!answers.objective) {
    return (
      <div className="questionCard">
        <span className="questionCount">Final signal · objective</span>
        <h2>{questionCopy.objectiveTitle}</h2>
        <p>{questionCopy.objectiveBody}</p>
        <ChipGroup label="Choose an objective" options={objectives[session.useCase]} value={answers.objective} disabled={isSaving} onChange={(objective) => void onPatch({ objective })} />
      </div>
    );
  }

  if (session.status === "generation_failed") {
    return (
      <div className="questionCard recoveryCard" role="alert">
        <span className="generationGlyph isFailed"><RefreshCw size={24} /></span>
        <span className="questionCount">One step needs another pass</span>
        <h2>Your brief is safe.</h2>
        <p>The story did not finish, but none of your answers were lost. Retry the build from the same brief.</p>
        <button className="buttonPrimary" type="button" disabled={isSaving || !answers.objective} onClick={() => void onPatch({ objective: answers.objective })}>
          <RefreshCw size={17} />Retry the story
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

function RevealBrandToken({
  name,
  logoUrl,
  accent = false
}: {
  name: string;
  logoUrl?: string;
  accent?: boolean;
}) {
  return (
    <div className={`revealBrandToken ${accent ? "isAccent" : ""}`}>
      <span>
        {logoUrl ? <Image src={logoUrl} alt="" width={84} height={28} style={{ width: "auto", height: "auto" }} unoptimized /> : name.slice(0, 1)}
      </span>
      <strong>{name}</strong>
    </div>
  );
}

function RevealCeremony({ session, onDismiss }: { session: PublicTryMeSession; onDismiss: () => void }) {
  const brandName = brandNameFor(session);
  const copy = getRevealCopy(session);
  const { dialogRef, onKeyDown } = useDialogBehavior(onDismiss);
  return (
    <section
      ref={dialogRef}
      className="revealCeremony"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-ceremony-title"
      aria-describedby="reveal-ceremony-summary"
      onKeyDown={onKeyDown}
    >
      <div className="ceremonyGrid" aria-hidden="true" />
      <div className="ceremonyTopline">
        <span><i className="liveDot" />Private preview assembled</span>
        <span>{copy.kicker}</span>
      </div>
      <div className="ceremonyCore">
        <div className="ceremonyLockup" aria-label={`${brandName} experience · ${copy.counterpart}`}>
          <RevealBrandToken name={brandName} logoUrl={session.brand?.logoUrl} />
          <span className="ceremonyConnector" aria-hidden="true"><i /><ArrowRight size={17} /><i /></span>
          <RevealBrandToken
            name={copy.counterpart}
            logoUrl={session.useCase === "abm" ? session.targetBrand?.logoUrl : undefined}
            accent
          />
        </div>
        <span className="ceremonyKicker">{copy.kicker}</span>
        <h2 id="reveal-ceremony-title">{copy.headline}</h2>
        <p id="reveal-ceremony-summary">{copy.summary}</p>
        <div className="ceremonyReceipts" aria-label="Completed build layers">
          {copy.receipts.map(({ number, label }, index) => (
            <span key={number} style={{ "--receipt-index": index } as CSSProperties}>
              <i>{number}</i><strong>{label}</strong><Check size={14} />
            </span>
          ))}
        </div>
        <button type="button" className="ceremonySkip" onClick={onDismiss}>Explore the experience<ArrowRight size={17} /></button>
        <span className="ceremonyFootnote">Private until you save it</span>
      </div>
      <span className="ceremonyTimer" aria-hidden="true"><i /></span>
    </section>
  );
}

export function getAssemblyPreviewKey(
  session: Pick<PublicTryMeSession, "id" | "experience">
): string {
  return `${session.id}:${session.experience?.artifactRevision ?? 0}`;
}

function AssemblyPreview({ session, iframeRef }: { session: PublicTryMeSession; iframeRef?: RefObject<HTMLIFrameElement | null> }) {
  const brandReady = ["complete", "fallback"].includes(session.stages.brand.status);
  const audienceReady = session.stages.audience.status === "complete" || Boolean(session.answers.audience);
  const storyReady = Boolean(session.experience);
  const moments = buildMoments(session);
  const lockedCount = moments.filter((moment) => ["complete", "fallback"].includes(moment.status)).length;
  const currentMoment = moments.find((moment) => moment.status === "running")
    ?? moments.find((moment) => moment.status === "pending")
    ?? moments[moments.length - 1];
  const brandName = session.brand?.companyName || displayNameFromDomain(session.companyDomain);
  const targetName = session.useCase === "abm"
    ? session.targetBrand?.companyName || displayNameFromDomain(session.answers.targetDomain)
    : undefined;
  const audience = session.answers.customAudience || session.answers.audience;
  const objective = session.answers.objective;
  const palette = session.brand?.colors.length ? session.brand.colors : ["#1c293f", "#5b5bff", "#11d175"];
  const canvasStyle = {
    "--build-primary": session.brand?.primaryColor || palette[0],
    "--build-accent": session.brand?.accentColor || palette[1] || palette[0],
    "--build-surface": session.brand?.surfaceColor || "#ffffff"
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
          sandbox="allow-scripts allow-popups"
        />
      ) : (
        <div className="assemblyCanvas" style={canvasStyle}>
          <div className="assemblyGrid" aria-hidden="true" />
          <div className="assemblyStatus" role="status" aria-live="polite">
            <span><i className="liveDot" />{currentMoment.title}</span>
            <small>{lockedCount} / {moments.length} intelligence layers locked</small>
          </div>
          <div className={`artifact brandArtifact ${brandReady ? "isPlaced" : ""}`}>
            <div className="assemblyIdentity">
              {session.brand?.logoUrl ? (
                <Image
                  src={session.brand.logoUrl}
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
            <div className="swatches" aria-label="Detected brand palette">{palette.slice(0, 4).map((color) => <i style={{ background: color }} key={color} />)}</div>
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

function SignalDrawer({ events, revealedAt, onClose }: { events: ClientEvent[]; revealedAt: number; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const { dialogRef, onKeyDown } = useDialogBehavior(onClose);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(1, Math.round((now - revealedAt) / 1000));
  return createPortal(
    <div className="drawerBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside ref={dialogRef} className="signalDrawer" role="dialog" aria-modal="true" aria-labelledby="signal-title" onKeyDown={onKeyDown}>
        <button className="drawerClose" type="button" onClick={onClose} aria-label="Close signal view"><X size={20} /></button>
        <span className="sectionKicker">Your session, live</span>
        <h2 id="signal-title">This is what Folloze sees.</h2>
        <p>Every meaningful interaction can become context for campaign and sales follow-up.</p>
        <div className="signalStats"><div><strong>1</strong><span>visitor</span></div><div><strong>{Math.max(events.length, 1)}</strong><span>interactions</span></div><div><strong>{seconds}s</strong><span>engaged</span></div></div>
        <div className="activityList">
          {events.slice(-5).reverse().map((event, index) => <div key={`${event.at}-${index}`}><span className={`activityDot ${event.action === "preview_viewed" ? "" : "isAccent"}`} /><div><strong>{event.label}</strong><span>{event.action.replaceAll("_", " ")}</span></div></div>)}
        </div>
        <div className="signalExplanation"><Gauge size={19} /><p>In a live campaign, these signals can route back to sellers and campaign systems so the next move starts with context.</p></div>
        <a className="buttonPrimary drawerCta" href={process.env.NEXT_PUBLIC_DEMO_CTA_URL || "https://www.folloze.com/book-a-meeting"} target="_blank" rel="noopener">Book a campaign workshop<ArrowRight size={17} /></a>
      </aside>
    </div>,
    document.body
  );
}

export function TryMeNowApp() {
  const [useCase, setUseCase] = useState<UseCase>();
  const [domain, setDomain] = useState("");
  const [session, setSession] = useState<PublicTryMeSession>();
  const [answers, setAnswers] = useState<SessionAnswers>({});
  const [isStarting, setIsStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [showSignals, setShowSignals] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [showRevealCeremony, setShowRevealCeremony] = useState(false);
  const [showEditBrief, setShowEditBrief] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);
  const [showAnalyticsToast, setShowAnalyticsToast] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [previewFit, setPreviewFit] = useState(true);
  const [messageDirection, setMessageDirection] = useState({ enabled: false, belief: "", action: "" });
  const [ctaValue, setCtaValue] = useState<CtaValue>({ type: "meeting", label: "Book a meeting", destination: "" });
  const [claimEmail, setClaimEmail] = useState("");
  const [claimStatus, setClaimStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [claimError, setClaimError] = useState("");
  const [briefDraft, setBriefDraft] = useState<Record<string, string>>({});
  const [editingBlockId, setEditingBlockId] = useState<SessionExperienceBlockControl["id"]>();
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);
  const [revealedAt, setRevealedAt] = useState<number>();
  const startedDomain = useRef<string | undefined>(undefined);
  const revealTracked = useRef(false);
  const ceremonySession = useRef<string | undefined>(undefined);
  const directionSession = useRef<string | undefined>(undefined);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const patchRequestRef = useRef(0);
  const persistedSectionSignals = useRef(new Set<string>());

  const selectUseCase = useCallback((selected: UseCase) => {
    setUseCase(selected);
    setDomain("");
    setSession(undefined);
    setAnswers({});
    setError("");
    setConnectionError("");
    setClientEvents([]);
    setRevealedAt(undefined);
    setShowRevealCeremony(false);
    setShowEditBrief(false);
    setShowAnalyticsPanel(false);
    setShowAnalyticsToast(false);
    setPreviewDevice("desktop");
    setPreviewFit(true);
    setMessageDirection({ enabled: false, belief: "", action: "" });
    setCtaValue({ type: "meeting", label: "Book a meeting", destination: "" });
    setClaimEmail("");
    setClaimStatus("idle");
    setClaimError("");
    setBriefDraft({});
    setEditingBlockId(undefined);
    startedDomain.current = undefined;
    revealTracked.current = false;
    ceremonySession.current = undefined;
    directionSession.current = undefined;
    persistedSectionSignals.current.clear();
    track("use_case_selected", { useCase: selected });
  }, []);

  const resetExperience = useCallback(() => {
    setUseCase(undefined);
    setDomain("");
    setSession(undefined);
    setAnswers({});
    setError("");
    setConnectionError("");
    setShowSignals(false);
    setShowProcess(false);
    setShowRevealCeremony(false);
    setShowEditBrief(false);
    setShowAnalyticsPanel(false);
    setShowAnalyticsToast(false);
    setPreviewDevice("desktop");
    setPreviewFit(true);
    setMessageDirection({ enabled: false, belief: "", action: "" });
    setCtaValue({ type: "meeting", label: "Book a meeting", destination: "" });
    setClaimEmail("");
    setClaimStatus("idle");
    setClaimError("");
    setBriefDraft({});
    setEditingBlockId(undefined);
    setClientEvents([]);
    setRevealedAt(undefined);
    startedDomain.current = undefined;
    revealTracked.current = false;
    ceremonySession.current = undefined;
    directionSession.current = undefined;
    persistedSectionSignals.current.clear();
  }, []);

  const closeEditBrief = useCallback(() => {
    setShowEditBrief(false);
    setEditingBlockId(undefined);
  }, []);

  const closeAnalyticsPanel = useCallback(() => setShowAnalyticsPanel(false), []);

  const startSession = useCallback(async (
    selectedUseCase: UseCase,
    companyDomain: string,
    seed?: SessionAnswers
  ) => {
    const normalized = companyDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    if (startedDomain.current === normalized || !likelyDomain.test(normalized)) return;
    startedDomain.current = normalized;
    setIsStarting(true);
    setError("");
    try {
      const result = await api<{ session: PublicTryMeSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          useCase: selectedUseCase,
          companyDomain: normalized,
          exampleMode: seed?.exampleMode,
          exampleKey: seed?.exampleKey
        })
      });
      const seeded = seed
        ? await api<{ session: PublicTryMeSession }>(`/api/sessions/${result.session.id}`, {
            method: "PATCH",
            body: JSON.stringify({ operation: "update-workspace", answers: seed })
          })
        : result;
      setSession(seeded.session);
      setAnswers(seeded.session.answers);
      track(seed ? "example_started" : "domain_submitted", { useCase: selectedUseCase });
    } catch (startError) {
      startedDomain.current = undefined;
      setError(startError instanceof Error ? startError.message : "We could not start the build.");
    } finally {
      setIsStarting(false);
    }
  }, []);

  const startExample = useCallback((selectedUseCase: UseCase) => {
    const example = exampleSeeds[selectedUseCase];
    selectUseCase(selectedUseCase);
    setDomain(example.companyDomain);
    void startSession(selectedUseCase, example.companyDomain, example.answers);
  }, [selectUseCase, startSession]);

  useEffect(() => {
    if (!session || directionSession.current === session.id) return;
    directionSession.current = session.id;
    const ctaType = uiCtaType(session.answers.ctaType);
    setMessageDirection({
      enabled: Boolean(session.answers.messageBelief || session.answers.messageAction),
      belief: session.answers.messageBelief || "",
      action: session.answers.messageAction || ""
    });
    setCtaValue({
      type: ctaType,
      label: session.blockControls?.find((control) => control.id === "closing")?.ctaLabel || defaultCtaLabel(ctaType),
      destination: session.answers.ctaDestination || ""
    });
  }, [session]);

  useEffect(() => {
    if (!useCase || session || !likelyDomain.test(domain.trim())) return;
    const timer = window.setTimeout(() => void startSession(useCase, domain), 700);
    return () => window.clearTimeout(timer);
  }, [domain, session, startSession, useCase]);

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
        setSession(result.session);
        setAnswers(result.session.answers);
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
    if (!session || session.status !== "preview_ready_unclaimed" || revealTracked.current) return;
    revealTracked.current = true;
    const revealTime = Date.now();
    setRevealedAt(revealTime);
    track("experience_revealed", { useCase: session.useCase });
    setClientEvents([{ action: "preview_viewed", label: "You opened the experience", at: revealTime }]);
    // Preview analytics updates the server-side aggregate, not the rendered artifact.
    // Keeping that response out of session state prevents analytics-only revisions
    // from remounting the iframe that emitted the signal.
    void recordPreviewSignal(session.id, "preview-opened", "experience-preview").catch(() => undefined);
  }, [session]);

  const hasExperience = Boolean(session?.experience);
  const ceremonySessionId = session?.id;
  useEffect(() => {
    if (!hasExperience || !ceremonySessionId || ceremonySession.current === ceremonySessionId) return;
    ceremonySession.current = ceremonySessionId;
    const holdTime = ceremonyDuration(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (holdTime === 0) return;
    const openTimer = window.setTimeout(() => setShowRevealCeremony(true), 0);
    const closeTimer = window.setTimeout(() => setShowRevealCeremony(false), holdTime);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, [ceremonySessionId, hasExperience]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !session ||
        event.source !== previewFrameRef.current?.contentWindow ||
        !event.data ||
        event.data.source !== "folloze-experience"
      ) return;
      const allowedActions = new Set([
        "anchor_click",
        "cta_click",
        "topic_select",
        "signature_select",
        "question_select",
        "section_view",
        "fullscreen_change",
        "editable_block_select"
      ]);
      if (typeof event.data.action !== "string" || !allowedActions.has(event.data.action)) return;
      const payload = event.data.payload && typeof event.data.payload === "object"
        ? event.data.payload as Record<string, unknown>
        : event.data.data && typeof event.data.data === "object"
          ? event.data.data as Record<string, unknown>
          : {};
      const labels: Record<string, string> = {
        anchor_click: "You followed the experience path",
        cta_click: "You clicked the next step",
        topic_select: "You chose a decision lens",
        signature_select: "You selected a starting point",
        question_select: "You explored a meeting question",
        section_view: "You reached a new section",
        fullscreen_change: "You changed the preview view",
        editable_block_select: "You selected an editable block"
      };
      const label = labels[event.data.action] || "You explored the experience";
      const next = { action: event.data.action, label, at: Date.now() };
      setClientEvents((current) => {
        const last = current[current.length - 1];
        if (last && last.action === next.action && last.label === next.label && next.at - last.at < 500) return current;
        if (event.data.action !== "section_view") setShowAnalyticsToast(true);
        return [...current.slice(-11), next];
      });
      const elementId = [payload.blockId, payload.ctaId, payload.sectionId, payload.targetId, payload.lensId]
        .find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)
        ?.slice(0, 80);
      const serverEvent = event.data.action === "cta_click"
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
        void recordPreviewSignal(session.id, serverEvent, elementId).catch(() => undefined);
      }

      if (event.data.action === "editable_block_select" && typeof payload.blockId === "string") {
        const rawBlockId = payload.blockId;
        const broadBlockId: SessionExperienceBlockControl["id"] = rawBlockId.startsWith("hero")
          ? "hero"
          : rawBlockId.startsWith("thesis")
            ? "thesis"
            : rawBlockId.startsWith("lens")
              ? "decision-lenses"
              : rawBlockId.startsWith("question")
                ? "guided-questions"
                : "closing";
        const existing = session.blockControls?.find((control) => control.id === broadBlockId);
        setEditingBlockId(broadBlockId);
        setBriefDraft({
          headline: existing?.headline || "",
          body: existing?.body || "",
          ctaLabel: existing?.ctaLabel || (broadBlockId === "closing" ? ctaValue.label : "")
        });
        setShowEditBrief(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [ctaValue.label, session]);

  const patchAnswers = async (patch: SessionAnswers) => {
    if (!session) return;
    const requestNumber = ++patchRequestRef.current;
    setIsSaving(true);
    setError("");
    try {
      const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      if (requestNumber !== patchRequestRef.current) return;
      setSession(result.session);
      setAnswers(result.session.answers);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "We could not save that answer.");
    } finally {
      if (requestNumber === patchRequestRef.current) setIsSaving(false);
    }
  };

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
      setSession(result.session);
      setAnswers(result.session.answers);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "We could not update the live brief.");
    } finally {
      if (requestNumber === patchRequestRef.current) setIsSaving(false);
    }
  };

  const saveCreativeDirection = async () => {
    const destination = ctaValue.destination.trim();
    if (destination && !/^https:\/\/[^\s]+$/i.test(destination)) {
      setError("Use a public HTTPS destination for the CTA.");
      return;
    }
    await patchWorkspace({
      answers: {
        messageBelief: messageDirection.enabled && messageDirection.belief.trim()
          ? messageDirection.belief.trim()
          : undefined,
        messageAction: messageDirection.enabled && messageDirection.action.trim()
          ? messageDirection.action.trim()
          : undefined,
        ctaType: serverCtaType(ctaValue.type),
        ctaDestination: destination || undefined
      },
      blockControls: [{
        id: "closing",
        visible: true,
        locked: false,
        ctaLabel: ctaValue.label.trim() || defaultCtaLabel(ctaValue.type)
      }]
    });
  };

  const openBriefEditor = () => {
    if (!session) return;
    setEditingBlockId(undefined);
    setBriefDraft({
      audience: session.answers.customAudience || session.answers.audience || "",
      objective: session.answers.objective || "",
      belief: session.answers.messageBelief || "",
      action: session.answers.messageAction || "",
      ctaDestination: session.answers.ctaDestination || ""
    });
    setShowEditBrief(true);
  };

  const openBlockEditor = (blockId: SessionExperienceBlockControl["id"]) => {
    const existing = session?.blockControls?.find((control) => control.id === blockId);
    setEditingBlockId(blockId);
    setBriefDraft({
      headline: existing?.headline || "",
      body: existing?.body || "",
      ctaLabel: existing?.ctaLabel || (blockId === "closing" ? ctaValue.label : "")
    });
    setShowEditBrief(true);
  };

  const saveBriefEdit = async () => {
    if (!session) return;
    if (editingBlockId) {
      const existing = session.blockControls?.find((control) => control.id === editingBlockId);
      const headline = briefDraft.headline?.trim();
      const body = briefDraft.body?.trim();
      const ctaLabel = briefDraft.ctaLabel?.trim();
      await patchWorkspace({
        blockControls: [{
          id: editingBlockId,
          visible: existing?.visible ?? true,
          locked: existing?.locked ?? false,
          headline: headline && headline.length >= 4 ? headline : undefined,
          body: body && body.length >= 8 ? body : undefined,
          ctaLabel: ctaLabel && ctaLabel.length >= 2 ? ctaLabel : undefined
        }]
      });
    } else {
      await patchWorkspace({
        answers: {
          audience: briefDraft.audience?.trim() || session.answers.audience,
          customAudience: undefined,
          objective: briefDraft.objective?.trim() || session.answers.objective,
          messageBelief: briefDraft.belief?.trim() || undefined,
          messageAction: briefDraft.action?.trim() || undefined,
          ctaDestination: briefDraft.ctaDestination?.trim() || ""
        }
      });
    }
    setShowEditBrief(false);
    setEditingBlockId(undefined);
  };

  const createVariation = async (mode: "duplicate" | "version" = "version", openEditor = false) => {
    if (!session) return;
    setIsSaving(true);
    setError("");
    try {
      const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}`, {
        method: "POST",
        body: JSON.stringify({ operation: "duplicate", mode, label: mode === "version" ? "Next version" : "Variation" })
      });
      setSession(result.session);
      setAnswers(result.session.answers);
      setClientEvents([]);
      setRevealedAt(undefined);
      revealTracked.current = false;
      ceremonySession.current = undefined;
      directionSession.current = undefined;
      if (openEditor) {
        setBriefDraft({
          audience: result.session.answers.customAudience || result.session.answers.audience || "",
          objective: result.session.answers.objective || "",
          belief: result.session.answers.messageBelief || "",
          action: result.session.answers.messageAction || "",
          ctaDestination: result.session.answers.ctaDestination || ""
        });
        setShowEditBrief(true);
      }
      track("experience_variation_created", { useCase: result.session.useCase, mode });
    } catch (variationError) {
      setError(variationError instanceof Error ? variationError.message : "We could not create that variation.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadPdf = async (file: File) => {
    if (!session) return;
    const activeSession = session;
    setIsSaving(true);
    setError("");
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

      setSession(processedSession);
      setAnswers(processedSession.answers);
      track("pdf_upload_completed", {
        useCase: activeSession.useCase,
        sizeBucket: uploadSizeBucket(file.size)
      });
    } catch (uploadError) {
      const requestId = await reportClientUploadFailure(activeSession.id, file, uploadError);
      const message = friendlyUploadError(uploadError);
      setError(requestId ? `${message} Reference: ${requestId.slice(0, 8)}.` : message);
      track("pdf_upload_failed", {
        useCase: activeSession.useCase,
        code: uploadErrorCode(uploadError),
        sizeBucket: uploadSizeBucket(file.size)
      });
    } finally {
      setIsSaving(false);
    }
  };

  const claim = async (email: string) => {
    if (!session) return;
    setClaimStatus("saving");
    setClaimError("");
    try {
      const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}/claim`, {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setSession(result.session);
      setClaimStatus("saved");
      track("experience_claimed", { useCase: result.session.useCase });
    } catch (claimFailure) {
      const message = claimFailure instanceof Error ? claimFailure.message : "We could not save this experience.";
      setClaimStatus("error");
      setClaimError(message);
    }
  };

  const isReveal = Boolean(session?.experience);
  const buildPanelCopy = session ? getBuildPanelCopy(session) : undefined;
  const revealCopy = session ? getRevealCopy(session) : undefined;
  const analyticsSignals: AnalyticsSignal[] = clientEvents.map((event, index) => ({
    id: `${event.at}-${index}`,
    label: event.label,
    detail: event.action === "cta_click"
      ? "A conversion signal is now available for follow-up."
      : event.action === "preview_viewed"
        ? "The private experience entered the viewport."
        : "The buyer revealed interest inside the guided path.",
    atLabel: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(event.at),
    type: event.action === "cta_click" ? "cta" : event.action === "preview_viewed" ? "view" : "choice"
  }));
  const latestAnalyticsSignal = [...analyticsSignals].reverse().find((signal) => signal.type !== "view");
  const qualityChecks = session?.qualityReceipt?.checks ?? [];
  const personalizationScore = qualityChecks.length
    ? Math.round((qualityChecks.reduce((score, check) => score + (check.status === "passed" ? 1 : check.status === "not-applicable" ? 0.85 : 0.55), 0) / qualityChecks.length) * 100)
    : 86;
  const expiresLabel = session?.expiresAt
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(session.expiresAt))
    : "in 30 minutes";
  const engagementSeconds = revealedAt
    ? Math.max(1, Math.round((((clientEvents.at(-1)?.at ?? revealedAt) - revealedAt) / 1000)))
    : 0;

  return (
    <>
    <main
      className={`appShell ${isReveal ? "revealMode" : ""}`}
      aria-hidden={showSignals || showProcess || showRevealCeremony || showEditBrief || showAnalyticsPanel ? true : undefined}
      inert={showSignals || showProcess || showRevealCeremony || showEditBrief || showAnalyticsPanel ? true : undefined}
    >
      <header className="siteHeader">
        <Link href="/" aria-label="Folloze Try Me Now home"><Image src="/brand/folloze-logo.svg" width={101} height={25} alt="Folloze" priority /><span>Try Me Now</span></Link>
        <div className="headerPromise"><span className="liveDot" />A live buyer experience in 30 seconds or less</div>
        {session && <button className="resetButton" type="button" onClick={resetExperience}><RefreshCw size={14} />Start over</button>}
      </header>

      {!useCase && (
        <section className="entryStage">
          <div className="entryHero">
            <span className="sectionKicker">Try Folloze</span>
            <h1>Give us 30 seconds.<br /><em>Get a live buyer experience.</em></h1>
            <p>Choose what you want to launch. Add a domain and a few signals. Folloze builds it, hosts it, and captures engagement while you watch.</p>
          </div>
          <UseCasePortals onSelect={selectUseCase} onExample={startExample} />
          <div className="entryFooter"><span>No login. No blank canvas.</span><span>Preview first. Add your email only if you want to keep it.</span></div>
        </section>
      )}

      {useCase && !session && (
        <DomainStart useCase={useCase} domain={domain} onDomain={setDomain} onBack={() => setUseCase(undefined)} isStarting={isStarting} error={error} />
      )}

      {session && !isReveal && buildPanelCopy && (
        <section className="workbench">
          <div className="mobileStatus"><button type="button" aria-expanded={showProcess} aria-controls="mobile-process-dialog" onClick={() => setShowProcess(true)}><span className="liveDot" /><strong>{buildPanelCopy.mobileLabel}</strong><span>{buildPanelCopy.mobileStep}</span><ChevronDown size={15} /></button></div>
          <div className="briefPanel">
            <div className="briefHeader"><span className="sectionKicker">Live brief</span><span className="briefDomain"><Globe2 size={14} />{session.companyDomain}</span></div>
            <InstantBrandLockStrip
              status={!session.brand ? "scanning" : session.brand.source === "fallback" ? "fallback" : "locked"}
              brand={session.brand ? {
                companyName: session.brand.companyName,
                domain: session.brand.domain,
                logoUrl: session.brand.logoUrl,
                colors: session.brand.colors,
                confidenceLabel: session.brand.source === "fallback" ? "Reconstructed" : "Public signals"
              } : { companyName: displayNameFromDomain(session.companyDomain), domain: session.companyDomain }}
              onInspect={() => setShowProcess(true)}
            />
            <ProgressiveQuestions
              session={session}
              answers={answers}
              isSaving={isSaving}
              onPatch={patchAnswers}
              onWorkspacePatch={patchWorkspace}
              onUpload={uploadPdf}
              onRestart={resetExperience}
            />
            {answers.objective && (
              <div className="creativeBriefControls">
                <MessageDirectionControl value={messageDirection} onChange={setMessageDirection} />
                <CtaDestinationControl
                  value={ctaValue}
                  onChange={(next) => {
                    setCtaValue((current) => ({
                      ...next,
                      label: current.type !== next.type && current.label === defaultCtaLabel(current.type)
                        ? defaultCtaLabel(next.type)
                        : next.label
                    }));
                  }}
                  destinationError={ctaValue.destination && !/^https:\/\/[^\s]+$/i.test(ctaValue.destination)
                    ? "Use a public HTTPS destination."
                    : undefined}
                />
                <button
                  className="buttonSecondary creativeApply"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveCreativeDirection()}
                >
                  {isSaving ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                  Apply direction to the live build
                </button>
              </div>
            )}
            {error && <div className="inlineError" role="alert">{error}</div>}
            {connectionError && <div className="connectionNotice" role="status"><LoaderCircle className="spin" size={15} />{connectionError}</div>}
          </div>
          <div className="buildPanel">
            <div className="buildTop">
              <div className="buildTopCopy"><span className="sectionKicker">{buildPanelCopy.kicker}</span><h2>{buildPanelCopy.headline}</h2><p>{buildPanelCopy.supporting}</p></div>
              <span className="tempLink"><span className="liveDot" />{buildPanelCopy.urlLabel}</span>
            </div>
            <ProgressiveArtifactStream
              headline={`Building ${brandNameFor(session)} into a buyer-ready experience`}
              artifacts={buildMoments(session).map((moment) => ({
                id: moment.key,
                phase: moment.phase,
                title: moment.title,
                detail: moment.detail,
                artifact: moment.artifact,
                status: moment.status === "complete" || moment.status === "fallback"
                  ? "ready"
                  : moment.status === "running"
                    ? "running"
                    : moment.status === "failed"
                      ? "failed"
                      : "queued"
              }))}
            />
          </div>
          <aside className="processRail">
            <div><span className="sectionKicker">What Folloze is doing</span><LiveChecklist session={session} /></div>
            <WhyItMatters session={session} />
          </aside>
        </section>
      )}

      {session && isReveal && revealCopy && (
        <section className="revealStage">
          <div className="revealIntro">
            <div className="revealIntroCopy">
              <span className="sectionKicker">
                {session.status === "claimed" ? "Saved. Shareable. Measurable." : revealCopy.kicker}
              </span>
              <h1>{getRevealShellHeadline(session)}</h1>
              <p className="revealPayoff">{revealCopy.summary}</p>
              <div className="revealMeta"><span>Built from public brand and company signals</span><i /><span>Private until you save it</span></div>
            </div>
            <div className="revealActions">
              {session.status === "claimed" ? (
                <CopyButton value={session.liveUrl || session.temporaryUrl} className="buttonSecondary" />
              ) : (
                <a className="buttonSecondary" href="#save-experience"><Mail size={16} />Save this preview</a>
              )}
              <a className="buttonPrimary" href={session.liveUrl || session.temporaryUrl} target="_blank" rel="noopener">Open full screen<ExternalLink size={16} /></a>
            </div>
          </div>
          <div className="revealGrid">
            <div className="revealPreview">
              <div className="previewControlBar">
                <DevicePreviewToolbar
                  device={previewDevice}
                  fit={previewFit}
                  onDeviceChange={setPreviewDevice}
                  onFitChange={setPreviewFit}
                />
                {session.status !== "claimed" && (
                  <button className="buttonSecondary editBriefButton" type="button" onClick={openBriefEditor}>
                    <Sparkles size={15} />Edit the brief
                  </button>
                )}
              </div>
              <div className={`devicePreviewShell is-${previewDevice} ${previewFit ? "isFit" : "isActual"}`}>
                <AssemblyPreview session={session} iframeRef={previewFrameRef} />
              </div>
              <AnalyticsSignalToast
                signal={latestAnalyticsSignal}
                open={showAnalyticsToast && Boolean(latestAnalyticsSignal)}
                onDismiss={() => setShowAnalyticsToast(false)}
                onOpenPanel={() => {
                  setShowAnalyticsToast(false);
                  setShowAnalyticsPanel(true);
                }}
              />
              {session.status !== "claimed" && (
                <details className="experienceControlDeck">
                  <summary><span><Sparkles size={17} />Tune and personalize</span><small>Copy, layout, assets, and blocks</small><ChevronDown size={16} /></summary>
                  <div className="experienceControlBody">
                    <ToneChips
                      label="Message tone"
                      selectedId={answers.toneVariant || "executive"}
                      options={[
                        { id: "executive", label: "Executive", description: "Concise, decision-oriented language." },
                        { id: "technical", label: "Technical", description: "Precise language for expert buyers." },
                        { id: "provocative", label: "Provocative", description: "Sharper tension and a bolder point of view." },
                        { id: "consultative", label: "Consultative", description: "Guided, collaborative language." }
                      ]}
                      onChange={(id) => void patchWorkspace({ answers: { toneVariant: id as NonNullable<SessionAnswers["toneVariant"]> } })}
                    />
                    <ToneChips
                      label="Visual direction"
                      selectedId={answers.styleVariant || "brand-led"}
                      options={[
                        { id: "brand-led", label: "Brand-led" },
                        { id: "editorial", label: "Editorial" },
                        { id: "technical", label: "Technical" },
                        { id: "minimal", label: "Minimal" }
                      ]}
                      onChange={(id) => void patchWorkspace({ answers: { styleVariant: id as NonNullable<SessionAnswers["styleVariant"]> } })}
                    />
                    <ExperienceVariantCards
                      label="Choose the page rhythm"
                      selectedId={answers.layoutVariant || "narrative"}
                      variants={[
                        { id: "narrative", name: "Narrative arc", eyebrow: "Story first", description: "Build conviction one idea at a time.", kind: "story", previewPattern: "editorial" },
                        { id: "modular", name: "Modular proof", eyebrow: "Scan and choose", description: "Let buyers enter through the proof that matters.", kind: "layout", previewPattern: "guided" },
                        { id: "immersive", name: "Immersive reveal", eyebrow: "High impact", description: "Give the hero and visuals more room to work.", kind: "layout", previewPattern: "split" },
                        { id: "compact", name: "Compact decision", eyebrow: "Fast path", description: "Compress the story for decisive buyers.", kind: "layout", previewPattern: "proof" }
                      ]}
                      onSelect={(id) => void patchWorkspace({ answers: { layoutVariant: id as NonNullable<SessionAnswers["layoutVariant"]> } })}
                    />
                    {Boolean(session.availableAssets?.length) && (
                      <AssetPicker
                        assets={(session.availableAssets ?? []).map((asset) => ({
                          id: asset.id,
                          name: asset.label,
                          type: asset.kind.includes("logo") ? "logo" : "image",
                          thumbnailUrl: asset.url,
                          detail: asset.source === "target" ? "Account signal" : "Seller brand"
                        }))}
                        selectedIds={answers.selectedAssetIds ?? []}
                        onToggle={(id, selected) => {
                          const current = new Set(answers.selectedAssetIds ?? []);
                          if (selected) current.add(id); else current.delete(id);
                          void patchWorkspace({ answers: { selectedAssetIds: [...current] } });
                        }}
                      />
                    )}
                    <div className="blockControlStack">
                      {([
                        ["hero", "Hero", "Opening promise, supporting line, and primary action."],
                        ["thesis", "Campaign thesis", "The reason this audience should care now."],
                        ["decision-lenses", "Decision paths", "The interactive routes buyers can choose."],
                        ["guided-questions", "Guided questions", "Prompts that turn content into a conversation."],
                        ["closing", "Next step", "The closing case and conversion path."]
                      ] as const).map(([id, label, description]) => {
                        const control = session.blockControls?.find((candidate) => candidate.id === id);
                        return (
                          <ExperienceBlockControlPanel
                            key={id}
                            blockId={id}
                            label={label}
                            description={description}
                            locked={control?.locked}
                            onEdit={() => openBlockEditor(id)}
                            onGenerateOptions={() => {
                              const directions: Array<NonNullable<SessionAnswers["styleVariant"]>> = ["brand-led", "editorial", "technical", "minimal"];
                              const next = directions[(directions.indexOf(answers.styleVariant || "brand-led") + 1) % directions.length];
                              void patchWorkspace({ answers: { styleVariant: next } });
                            }}
                            onLockChange={(_, locked) => void patchWorkspace({
                              blockControls: [{
                                id,
                                visible: control?.visible ?? true,
                                locked,
                                eyebrow: control?.eyebrow,
                                headline: control?.headline,
                                body: control?.body,
                                ctaLabel: control?.ctaLabel
                              }]
                            })}
                          />
                        );
                      })}
                    </div>
                  </div>
                </details>
              )}
              <a
                className="mobilePreviewCta"
                href={session.liveUrl || session.temporaryUrl}
                target="_blank"
                rel="noopener"
              >
                Explore the full experience<ArrowRight size={16} />
              </a>
            </div>
            <aside className="revealRail">
              {session.status === "claimed" ? (
                <SavedExperienceCockpit
                  title={session.experience?.title || `${brandNameFor(session)} experience`}
                  url={session.liveUrl || session.temporaryUrl}
                  updatedLabel={`Saved ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(session.cockpit?.savedAt || session.claimedAt || session.updatedAt))}`}
                  metrics={[
                    { label: "Quality", value: session.cockpit?.qualityStatus === "passed" ? "Ready" : "Review", detail: `${personalizationScore}/100 personalization` },
                    { label: "Signals", value: session.cockpit?.previewInteractions ?? session.previewAnalytics?.totalInteractions ?? clientEvents.length, detail: "Preview interactions" },
                    { label: "Version", value: `v${session.cockpit?.versionNumber ?? session.lineage?.versionNumber ?? 1}`, detail: `Revision ${session.cockpit?.artifactRevision ?? session.experience?.artifactRevision ?? 1}` }
                  ]}
                  onOpen={() => window.open(session.liveUrl || session.temporaryUrl, "_blank", "noopener,noreferrer")}
                  onCopy={() => void navigator.clipboard.writeText(session.liveUrl || session.temporaryUrl)}
                  onEdit={() => void createVariation("version", true)}
                  onDuplicate={() => void createVariation("duplicate")}
                />
              ) : (
                <div id="save-experience">
                  <ExpirySaveValuePanel
                    expiresLabel={expiresLabel}
                    email={claimEmail}
                    status={claimStatus}
                    error={claimError}
                    onEmailChange={setClaimEmail}
                    onSave={() => void claim(claimEmail)}
                    benefits={["Permanent live URL", "Email delivery", "Engagement-ready experience"]}
                  />
                </div>
              )}
              <PersonalizationQualityReceipt
                score={personalizationScore}
                companyName={session.useCase === "abm" ? targetNameFor(session) : brandNameFor(session)}
                layers={qualityChecks.length ? qualityChecks.map((check) => ({
                  id: check.id,
                  label: check.label,
                  detail: check.detail,
                  status: check.status === "passed" || check.status === "not-applicable"
                    ? "strong"
                    : check.status === "warning"
                      ? "partial"
                      : "missing"
                })) : revealCopy.receipts.slice(0, 4).map((receipt) => ({
                  id: receipt.number,
                  label: receipt.label,
                  detail: "Applied to this generated experience.",
                  status: "strong" as const
                }))}
              />
              <div className="signalTeaser"><Gauge size={22} /><h3>Built is only step one.</h3><p>Interact with the preview, then see the signals Folloze captured.</p><button type="button" onClick={() => { setShowAnalyticsPanel(true); track("signal_preview_opened"); }}>See what Folloze knows<ArrowRight size={16} /></button></div>
              <div className="revealReceipt revealMiniReceipt">
                <span className="sectionKicker">Built from real signals</span>
                <div>{revealCopy.receipts.map(({ number, label }) => <span key={number}><i>{number}</i>{label}<Check size={13} /></span>)}</div>
              </div>
            </aside>
          </div>
          <div className="revealFooter"><span>{session.status === "claimed" ? "Saved URL" : "Temporary URL"}</span><code>{session.liveUrl || session.temporaryUrl}</code><span>{session.status === "claimed" ? "Saved" : "Expires 30 minutes after generation"}</span></div>
        </section>
      )}

      {showProcess && session && <MobileProcessDialog session={session} onClose={() => setShowProcess(false)} />}
      {showSignals && revealedAt && <SignalDrawer events={clientEvents} revealedAt={revealedAt} onClose={() => setShowSignals(false)} />}
    </main>
    <EditBriefDrawer
      open={showEditBrief}
      title={editingBlockId ? `Edit the ${editingBlockId.replaceAll("-", " ")} block` : "Edit the live brief"}
      fields={editingBlockId ? [
        { id: "headline", label: "Headline override", value: briefDraft.headline || "", hint: "Leave blank to let Folloze regenerate this block." },
        { id: "body", label: "Supporting copy override", value: briefDraft.body || "", hint: "Use at least eight characters for an override." },
        ...(editingBlockId === "closing" ? [{ id: "ctaLabel", label: "CTA label", value: briefDraft.ctaLabel || "" }] : [])
      ] : [
        { id: "audience", label: "Audience", value: briefDraft.audience || "" },
        { id: "objective", label: "Objective", value: briefDraft.objective || "" },
        { id: "belief", label: "What should they believe?", value: briefDraft.belief || "" },
        { id: "action", label: "What should they do next?", value: briefDraft.action || "" },
        { id: "ctaDestination", label: "CTA destination", value: briefDraft.ctaDestination || "", type: "url" as const, hint: "Public HTTPS URL only." }
      ]}
      saving={isSaving}
      onFieldChange={(id, value) => setBriefDraft((current) => ({ ...current, [id]: value }))}
      onSave={() => void saveBriefEdit()}
      onClose={closeEditBrief}
    />
    <AnalyticsSignalPanel
      open={showAnalyticsPanel}
      signals={analyticsSignals}
      engagedSeconds={engagementSeconds}
      onClose={closeAnalyticsPanel}
    />
    {showRevealCeremony && session?.experience && <RevealCeremony session={session} onDismiss={() => setShowRevealCeremony(false)} />}
    </>
  );
}
