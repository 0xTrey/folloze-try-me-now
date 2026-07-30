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
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  PublicTryMeSession,
  SessionAnswers,
  StageKey,
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

const useCaseContent: Record<
  UseCase,
  {
    number: string;
    kicker: string;
    title: string;
    description: string;
    cta: string;
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
    icon: Target,
    className: "portalEditorial"
  },
  campaign: {
    number: "02",
    kicker: "Campaign",
    title: "Launch the campaign",
    description: "Build a focused landing page for an offer, segment, product, or event.",
    cta: "Build a campaign page",
    icon: Megaphone,
    className: "portalCobalt"
  },
  content: {
    number: "03",
    kicker: "Content",
    title: "Make content work harder",
    description: "Turn a URL or PDF into a guided, measurable path buyers want to explore.",
    cta: "Transform my content",
    icon: BookOpen,
    className: "portalTerminal"
  }
};

const objectives: Record<UseCase, string[]> = {
  abm: ["Introduce a product", "Educate the buying group", "Accelerate an opportunity", "Book a meeting"],
  campaign: ["Generate demand", "Drive registrations", "Launch or announce", "Book meetings"],
  content: ["Educate buyers", "Increase content engagement", "Capture qualified interest", "Book a meeting"]
};

const stageContent: Record<
  StageKey,
  { title: string; working: string; whyTitle: string; whyBody: string; icon: typeof Globe2 }
> = {
  brand: {
    title: "Finding your brand",
    working: "Reading the visual and messaging signals buyers already recognize.",
    whyTitle: "Familiarity earns the first second.",
    whyBody:
      "We use the visual cues buyers already trust, so the finished page feels native to the company behind it.",
    icon: Globe2
  },
  audience: {
    title: "Understanding the audience",
    working: "Turning company context into a useful audience starting point.",
    whyTitle: "Relevance changes the response.",
    whyBody:
      "A CMO needs the business case. A campaign manager needs the launch path. The person you choose changes the message and the page.",
    icon: Users
  },
  story: {
    title: "Creating the story",
    working: "Building the sequence from tension to value, proof, and one next move.",
    whyTitle: "A page is not a story.",
    whyBody:
      "A useful experience creates momentum. Pressure first, value second, proof next, then one clear action.",
    icon: Sparkles
  }
};

const likelyDomain = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\/?$/i;

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
  const fallback: StageState = { status: "pending" };
  return (
    <div className={compact ? "checklist compactChecklist" : "checklist"} aria-live="polite">
      {(["brand", "audience", "story"] as StageKey[]).map((key) => {
        const item = stageContent[key];
        const state = session?.stages[key] ?? fallback;
        const Icon = item.icon;
        return (
          <div className={`checkRow is-${state.status}`} key={key}>
            <StatusMark state={state} />
            <div className="checkIcon">
              <Icon size={17} />
            </div>
            <div className="checkCopy">
              <strong>{item.title}</strong>
              {!compact && <span>{state.artifact || state.detail || item.working}</span>}
            </div>
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
          <h2>Start with the company behind the story.</h2>
          <p>Brand work begins as soon as we recognize the domain. You can keep answering while it runs.</p>
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
        <h2>Which account should this feel built for?</h2>
        <p>We will use the target domain to create the account-specific version.</p>
        <label className="lineInput"><span>Target account domain</span><div><Target size={19} /><input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="targetaccount.com" /></div></label>
        <button className="buttonPrimary" disabled={!likelyDomain.test(textValue.trim()) || isSaving}>Use this account<ArrowRight size={17} /></button>
      </form>
    );
  }

  if (session.useCase === "campaign" && !answers.campaignType) {
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · campaign</span>
        <h2>What are you taking to market?</h2>
        <p>The offer changes the page structure and the action buyers should take.</p>
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
        <h2>Which content should do more work?</h2>
        <p>Give us a public URL or PDF. We will preserve the facts and reshape the way buyers explore them.</p>
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
    return (
      <div className="questionCard">
        <span className="questionCount">Next signal · audience</span>
        <h2>Who needs to believe this story?</h2>
        <p>Pick the closest audience. We will change the problem, proof, and next step around them.</p>
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
        <h2>What should the experience make easier?</h2>
        <p>One objective keeps the story focused and gives every interaction a job.</p>
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
      <h2>We have enough to create the story.</h2>
      <p>Keep watching the live build. The preview will open as soon as the narrative and interaction checks are ready.</p>
      <div className="briefChips"><span>{answers.audience}</span><span>{answers.objective}</span></div>
    </div>
  );
}

function WhyItMatters({ session }: { session: PublicTryMeSession }) {
  const activeKey = (["brand", "audience", "story"] as StageKey[]).find(
    (key) => session.stages[key].status === "running"
  ) ?? (["story", "audience", "brand"] as StageKey[]).find((key) => session.stages[key].status !== "pending") ?? "brand";
  const content = stageContent[activeKey];
  return (
    <aside className="whyCard" key={activeKey}>
      <span>Why this matters</span>
      <h3>{content.whyTitle}</h3>
      <p>{content.whyBody}</p>
    </aside>
  );
}

function AssemblyPreview({ session, iframeRef }: { session: PublicTryMeSession; iframeRef?: RefObject<HTMLIFrameElement | null> }) {
  const brandReady = ["complete", "fallback"].includes(session.stages.brand.status);
  const audienceReady = session.stages.audience.status === "complete";
  const storyReady = Boolean(session.experience);
  return (
    <div className={`assembly ${storyReady ? "isReady" : ""}`}>
      <div className="browserBar"><i /><i /><i /><span>{session.temporaryUrl.replace(/^https?:\/\//, "")}</span></div>
      {storyReady ? (
        <iframe
          ref={iframeRef}
          key={session.revision}
          src={`/e/${session.id}?embed=1`}
          title="Generated buyer experience preview"
          sandbox="allow-scripts allow-popups"
        />
      ) : (
        <div className="assemblyCanvas">
          <div className={`artifact brandArtifact ${brandReady ? "isPlaced" : ""}`}>
            {session.brand?.logoUrl ? (
              <Image
                src={session.brand.logoUrl}
                alt={`${session.brand.companyName} logo`}
                width={140}
                height={40}
                unoptimized
              />
            ) : <span>{session.brand?.companyName?.slice(0, 1) || "B"}</span>}
            <div className="swatches">{(session.brand?.colors.length ? session.brand.colors : ["#1c293f", "#5b5bff", "#11d175"]).slice(0, 4).map((color) => <i style={{ background: color }} key={color} />)}</div>
          </div>
          <div className={`artifact audienceArtifact ${audienceReady ? "isPlaced" : ""}`}>
            <span>Built for</span><strong>{session.answers.customAudience || session.answers.audience || "Your audience"}</strong>
          </div>
          <div className={`storySkeleton ${session.stages.story.status === "running" ? "isWriting" : ""}`}>
            <span className="skeletonKicker" /><span className="skeletonHeadline" /><span className="skeletonHeadline short" /><span className="skeletonBody" /><span className="skeletonButton" />
          </div>
          <div className="moduleSkeleton"><span /><span /><span /></div>
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
    <section className={`claimBar ${claimed ? "isClaimed" : ""}`}>
      <div className="claimCopy">
        <span className="claimIcon">{claimed ? <Check size={18} /> : <Mail size={18} />}</span>
        <div>
          <strong>{claimed ? emailSent ? "Saved. Your live URL is on the way." : "Saved. Your live URL is ready." : "Want to keep it?"}</strong>
          <span>{claimed ? session.liveUrl : "Enter your business email. Unclaimed previews expire after 30 minutes."}</span>
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
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);
  const [revealedAt, setRevealedAt] = useState<number>();
  const startedDomain = useRef<string | undefined>(undefined);
  const revealTracked = useRef(false);
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
    startedDomain.current = undefined;
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

  const activeStage = useMemo(() => {
    if (!session) return 0;
    const states = [session.stages.brand, session.stages.audience, session.stages.story];
    return Math.max(1, states.findIndex((state) => state.status === "running") + 1 || states.filter((state) => state.status === "complete").length);
  }, [session]);

  const isReveal = Boolean(session?.experience);

  return (
    <main
      className={`appShell ${isReveal ? "revealMode" : ""}`}
      aria-hidden={showSignals || showProcess ? true : undefined}
      inert={showSignals || showProcess ? true : undefined}
    >
      <header className="siteHeader">
        <Link href="/" aria-label="Folloze Try Me Now home"><Image src="/brand/folloze-logo.svg" width={101} height={25} alt="Folloze" priority /><span>Try Me Now</span></Link>
        <div className="headerPromise"><span className="liveDot" />A live buyer experience in about 60 seconds</div>
        {session && <button className="resetButton" type="button" onClick={() => { setUseCase(undefined); setSession(undefined); setAnswers({}); setDomain(""); setClientEvents([]); setRevealedAt(undefined); setConnectionError(""); startedDomain.current = undefined; revealTracked.current = false; }}><RefreshCw size={14} />Start over</button>}
      </header>

      {!useCase && (
        <section className="entryStage">
          <div className="entryHero">
            <span className="sectionKicker">Try Folloze</span>
            <h1>Give us 60 seconds.<br /><em>Get a live buyer experience.</em></h1>
            <p>Choose what you want to launch. Add a domain and a few signals. Folloze builds it, hosts it, and captures engagement while you watch.</p>
          </div>
          <UseCasePortals onSelect={selectUseCase} />
          <div className="entryFooter"><span>No login. No blank canvas.</span><span>Preview first. Add your email only if you want to keep it.</span></div>
        </section>
      )}

      {useCase && !session && (
        <DomainStart useCase={useCase} domain={domain} onDomain={setDomain} onBack={() => setUseCase(undefined)} isStarting={isStarting} error={error} />
      )}

      {session && !isReveal && (
        <section className="workbench">
          <div className="mobileStatus"><button type="button" aria-expanded={showProcess} aria-controls="mobile-process-dialog" onClick={() => setShowProcess(true)}><span className="liveDot" />{stageContent[(["brand", "audience", "story"] as StageKey[])[Math.min(activeStage - 1, 2)]].title}<span>{activeStage} of 3</span><ChevronDown size={15} /></button></div>
          <div className="briefPanel">
            <div className="briefHeader"><span className="sectionKicker">Live brief</span><span className="briefDomain"><Globe2 size={14} />{session.companyDomain}</span></div>
            <ProgressiveQuestions session={session} answers={answers} isSaving={isSaving} onPatch={patchAnswers} onUpload={uploadPdf} />
            {error && <div className="inlineError" role="alert">{error}</div>}
            {connectionError && <div className="connectionNotice" role="status"><LoaderCircle className="spin" size={15} />{connectionError}</div>}
          </div>
          <div className="buildPanel">
            <div className="buildTop"><div><span className="sectionKicker">Live build</span><h2>Watch the experience come together.</h2></div><span className="tempLink"><span className="liveDot" />Temporary URL ready</span></div>
            <AssemblyPreview session={session} iframeRef={previewFrameRef} />
          </div>
          <aside className="processRail">
            <div><span className="sectionKicker">What Folloze is doing</span><LiveChecklist session={session} /></div>
            <WhyItMatters session={session} />
          </aside>
        </section>
      )}

      {session && isReveal && (
        <section className="revealStage">
          <div className="revealIntro">
            <div><span className="sectionKicker">Built. Hosted. Measurable.</span><h1>Your experience is live.</h1></div>
            <div className="revealActions">
              <CopyButton value={session.temporaryUrl} className="buttonSecondary" />
              <a className="buttonPrimary" href={session.temporaryUrl} target="_blank" rel="noopener">Open full screen<ExternalLink size={16} /></a>
            </div>
          </div>
          <div className="revealGrid">
            <div className="revealPreview"><AssemblyPreview session={session} iframeRef={previewFrameRef} /></div>
            <aside className="revealRail">
              <span className="sectionKicker">A few signals. One live result.</span>
              <LiveChecklist session={session} />
              <div className="signalTeaser"><Gauge size={22} /><h3>Built is only step one.</h3><p>See the engagement signal Folloze can capture from this experience.</p><button type="button" onClick={() => { setShowSignals(true); track("signal_preview_opened"); }}>See who engages<ArrowRight size={16} /></button></div>
            </aside>
          </div>
          <ClaimBar session={session} onClaim={claim} />
          <div className="revealFooter"><span>Temporary URL</span><code>{session.temporaryUrl}</code><span>{session.status === "claimed" ? "Saved" : "Expires 30 minutes after generation"}</span></div>
        </section>
      )}

      {showProcess && session && <MobileProcessDialog session={session} onClose={() => setShowProcess(false)} />}
      {showSignals && revealedAt && <SignalDrawer events={clientEvents} revealedAt={revealedAt} onClose={() => setShowSignals(false)} />}
    </main>
  );
}
