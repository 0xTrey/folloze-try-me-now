"use client";

import { upload as uploadBlob } from "@vercel/blob/client";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
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

import type {
  PublicTryMeSession,
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

function PortalVisual({ useCase }: { useCase: UseCase }) {
  if (useCase === "abm") {
    return (
      <div className="portalVisual abmVisual" aria-hidden="true">
        <span className="miniLogo"><Building2 size={14} /> Northstar</span>
        <span className="miniPlus">×</span>
        <span className="miniLogo isTarget">Axiom</span>
        <div className="miniHeadline">One account.<br />One clear case.</div>
      </div>
    );
  }
  if (useCase === "campaign") {
    return (
      <div className="portalVisual campaignVisual" aria-hidden="true">
        <span className="campaignDot" />
        <div className="campaignLines"><span /><span /><span /></div>
        <div className="campaignButton">Explore the launch</div>
      </div>
    );
  }
  return (
    <div className="portalVisual contentVisual" aria-hidden="true">
      <div className="documentPage"><span /><span /><span /><span /></div>
      <ArrowRight size={18} />
      <div className="contentPaths"><span>Role</span><span>Topic</span><span>Next</span></div>
    </div>
  );
}

function UseCasePortals({ onSelect }: { onSelect: (value: UseCase) => void }) {
  return (
    <div className="portalRail" aria-label="Choose what you want to create">
      {(Object.keys(useCaseContent) as UseCase[]).map((key) => {
        const portal = useCaseContent[key];
        const Icon = portal.icon;
        return (
          <button
            type="button"
            key={key}
            className={`portal ${portal.className}`}
            onClick={() => onSelect(key)}
          >
            <div className="portalTopline"><span>{portal.number}</span><Icon size={19} /></div>
            <PortalVisual useCase={key} />
            <div className="portalCopy">
              <span className="portalKicker">{portal.kicker}</span>
              <h2>{portal.title}</h2>
              <p>{portal.description}</p>
              <span className="portalCta">{portal.cta}<ArrowRight size={16} /></span>
            </div>
          </button>
        );
      })}
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
  onUpload
}: {
  session: PublicTryMeSession;
  answers: SessionAnswers;
  isSaving: boolean;
  onPatch: (patch: SessionAnswers) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
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
                if (file) void onUpload(file);
              }}
            />
          </label>
        )}
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
          key={session.revision}
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

function ClaimBar({ session, onClaim }: { session: PublicTryMeSession; onClaim: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");
  const claimed = session.status === "claimed";
  const emailSent = session.claim?.emailStatus === "sent";
  return (
    <section id="save-experience" className={`claimBar ${claimed ? "isClaimed" : ""}`}>
      <div className="claimCopy">
        <span className="claimIcon">{claimed ? <Check size={18} /> : <Mail size={18} />}</span>
        <div>
          <strong>{claimed ? emailSent ? "Saved. Your live URL is on the way." : "Saved. Your live URL is ready." : "Keep this experience live."}</strong>
          <span>{claimed ? session.liveUrl : "Enter your business email to save the URL and receive it by email. Otherwise, this private preview expires in 30 minutes."}</span>
        </div>
      </div>
      {claimed ? (
        <div className="claimActions">
          <a href={session.liveUrl || session.temporaryUrl} target="_blank" rel="noopener">Open experience<ExternalLink size={15} /></a>
          <CopyButton value={session.liveUrl || session.temporaryUrl} label="Copy link" />
        </div>
      ) : (
        <form
          className="claimForm"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setIsClaiming(true);
            try { await onClaim(email); } catch (claimError) { setError(claimError instanceof Error ? claimError.message : "We could not save this yet."); } finally { setIsClaiming(false); }
          }}
        >
          <label><span className="srOnly">Business email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
          <button className="buttonPrimary" disabled={isClaiming}>{isClaiming ? <LoaderCircle className="spin" size={17} /> : null}Save and email my link</button>
          {!error && <small className="claimPrivacy">Used to save and email this experience. No newsletter signup.</small>}
          {error && <small className="fieldError">{error}</small>}
        </form>
      )}
    </section>
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
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);
  const [revealedAt, setRevealedAt] = useState<number>();
  const startedDomain = useRef<string | undefined>(undefined);
  const revealTracked = useRef(false);
  const ceremonySession = useRef<string | undefined>(undefined);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const patchRequestRef = useRef(0);

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
    startedDomain.current = undefined;
    ceremonySession.current = undefined;
    track("use_case_selected", { useCase: selected });
  }, []);

  const startSession = useCallback(async (selectedUseCase: UseCase, companyDomain: string) => {
    const normalized = companyDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    if (startedDomain.current === normalized || !likelyDomain.test(normalized)) return;
    startedDomain.current = normalized;
    setIsStarting(true);
    setError("");
    try {
      const result = await api<{ session: PublicTryMeSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ useCase: selectedUseCase, companyDomain: normalized })
      });
      setSession(result.session);
      track("domain_submitted", { useCase: selectedUseCase });
    } catch (startError) {
      startedDomain.current = undefined;
      setError(startError instanceof Error ? startError.message : "We could not start the build.");
    } finally {
      setIsStarting(false);
    }
  }, []);

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
      if (event.source !== previewFrameRef.current?.contentWindow || !event.data || event.data.source !== "folloze-experience") return;
      const allowedActions = new Set(["anchor_click", "topic_select", "cta_click"]);
      if (typeof event.data.action !== "string" || !allowedActions.has(event.data.action)) return;
      const rawLabel = event.data.data?.text;
      const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim().slice(0, 120) : "You explored the experience";
      const next = { action: event.data.action, label, at: Date.now() };
      setClientEvents((current) => {
        const last = current[current.length - 1];
        if (last && last.action === next.action && last.label === next.label && next.at - last.at < 500) return current;
        return [...current.slice(-11), next];
      });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
    const result = await api<{ session: PublicTryMeSession }>(`/api/sessions/${session.id}/claim`, {
      method: "POST",
      body: JSON.stringify({ email })
    });
    setSession(result.session);
    track("experience_claimed", { useCase: result.session.useCase });
  };

  const isReveal = Boolean(session?.experience);
  const buildPanelCopy = session ? getBuildPanelCopy(session) : undefined;
  const revealCopy = session ? getRevealCopy(session) : undefined;

  return (
    <>
    <main
      className={`appShell ${isReveal ? "revealMode" : ""}`}
      aria-hidden={showSignals || showProcess || showRevealCeremony ? true : undefined}
      inert={showSignals || showProcess || showRevealCeremony ? true : undefined}
    >
      <header className="siteHeader">
        <Link href="/" aria-label="Folloze Try Me Now home"><Image src="/brand/folloze-logo.svg" width={101} height={25} alt="Folloze" priority /><span>Try Me Now</span></Link>
        <div className="headerPromise"><span className="liveDot" />A live buyer experience in 30 seconds or less</div>
        {session && <button className="resetButton" type="button" onClick={() => { setUseCase(undefined); setSession(undefined); setAnswers({}); setDomain(""); setClientEvents([]); setRevealedAt(undefined); setConnectionError(""); setShowRevealCeremony(false); startedDomain.current = undefined; revealTracked.current = false; ceremonySession.current = undefined; }}><RefreshCw size={14} />Start over</button>}
      </header>

      {!useCase && (
        <section className="entryStage">
          <div className="entryHero">
            <span className="sectionKicker">Try Folloze</span>
            <h1>Give us 30 seconds.<br /><em>Get a live buyer experience.</em></h1>
            <p>Choose what you want to launch. Add a domain and a few signals. Folloze builds it, hosts it, and captures engagement while you watch.</p>
          </div>
          <UseCasePortals onSelect={selectUseCase} />
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
            <ProgressiveQuestions session={session} answers={answers} isSaving={isSaving} onPatch={patchAnswers} onUpload={uploadPdf} />
            {error && <div className="inlineError" role="alert">{error}</div>}
            {connectionError && <div className="connectionNotice" role="status"><LoaderCircle className="spin" size={15} />{connectionError}</div>}
          </div>
          <div className="buildPanel">
            <div className="buildTop">
              <div className="buildTopCopy"><span className="sectionKicker">{buildPanelCopy.kicker}</span><h2>{buildPanelCopy.headline}</h2><p>{buildPanelCopy.supporting}</p></div>
              <span className="tempLink"><span className="liveDot" />{buildPanelCopy.urlLabel}</span>
            </div>
            <AssemblyPreview session={session} iframeRef={previewFrameRef} />
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
              <AssemblyPreview session={session} iframeRef={previewFrameRef} />
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
              <ClaimBar session={session} onClaim={claim} />
              <div className="signalTeaser"><Gauge size={22} /><h3>Built is only step one.</h3><p>See the engagement signal Folloze can capture from this experience.</p><button type="button" onClick={() => { setShowSignals(true); track("signal_preview_opened"); }}>See who engages<ArrowRight size={16} /></button></div>
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
    {showRevealCeremony && session?.experience && <RevealCeremony session={session} onDismiss={() => setShowRevealCeremony(false)} />}
    </>
  );
}
