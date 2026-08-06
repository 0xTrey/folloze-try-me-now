"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  ImageIcon,
  Layers3,
  Lock,
  Mail,
  MousePointerClick,
  Pencil,
  Pin,
  RefreshCw,
  Route,
  Target,
  Users,
  WandSparkles,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState
} from "react";
import Image from "next/image";

import { brandfetchLogoRecoveryUrls } from "@/lib/brandfetch-logo";
import { captureProductEvent } from "@/lib/product-analytics-client";
import { buildSimulatedEngagement } from "@/lib/simulated-engagement";

import styles from "./try-me-now-enhancements.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type ProspectPath = "abm" | "campaign" | "content";

export interface EntryPathOption {
  id: ProspectPath;
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  exampleLabel: string;
  exampleUrl: string;
  demoSteps: [string, string, string];
  previewImage: string;
  previewVideo?: string;
  previewAlt: string;
  accent?: string;
  tone?: "paper" | "cobalt" | "ink";
}

export interface EntryPathMicroDemoProps {
  option: EntryPathOption;
  selected?: boolean;
  disabled?: boolean;
  demoDurationMs?: number;
  onSelect: (id: ProspectPath) => void;
  onExampleOpen?: (id: ProspectPath) => void;
}

export function EntryPathMicroDemo({
  option,
  selected = false,
  disabled = false,
  onSelect,
  onExampleOpen
}: EntryPathMicroDemoProps) {
  const style = {
    "--enh-accent": option.accent ?? "#5b5bff"
  } as CSSProperties;

  return (
    <article
      className={classes(styles.pathCard, styles[`tone${option.tone ?? "paper"}`], selected && styles.isSelected)}
      style={style}
      aria-label={`${option.eyebrow}: ${option.title}`}
    >
      <div className={styles.pathTopline}><span>{option.index}</span><span>{option.eyebrow}</span></div>
      <div className={styles.productPreview}>
        <span className={styles.previewChrome} aria-hidden="true"><i /><i /><i /></span>
        <Image src={option.previewImage} alt={option.previewAlt} width={720} height={380} loading="lazy" />
        {option.previewVideo && (
          <video
            className={styles.previewMotion}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster={option.previewImage}
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src={option.previewVideo} type="video/mp4" />
          </video>
        )}
      </div>
      <div className={styles.pathCopy}>
        <h3>{option.title}</h3>
        <p>{option.description}</p>
      </div>
      <div className={styles.pathActions}>
        <button type="button" className={styles.primaryAction} disabled={disabled} onClick={() => onSelect(option.id)}>
          {option.actionLabel}<ArrowRight size={16} />
        </button>
        <ExampleModeCta label={option.exampleLabel} href={option.exampleUrl} onClick={() => onExampleOpen?.(option.id)} />
      </div>
    </article>
  );
}

export function ExampleModeCta({ label = "See an example", href, onClick }: { label?: string; href: string; onClick?: () => void }) {
  return (
    <a className={styles.exampleAction} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={`${label} (opens in a new tab)`}>
      <ExternalLink size={14} />{label}
    </a>
  );
}

export interface BrandLockProfile {
  companyName: string;
  domain: string;
  canonicalDomain?: string;
  logoUrl?: string;
  logoUrlOnDark?: string;
  colors?: string[];
  primaryColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  source?: "brand-harvester" | "fast-extractor" | "fallback";
  positioning?: string;
  confidenceLabel?: string;
  readiness?: {
    status: "ready" | "incomplete";
    logoReady: boolean;
    paletteReady: boolean;
    sourceEvidenceReady: boolean;
    reasons: string[];
  };
}

export interface InstantBrandLockStripProps {
  brand?: BrandLockProfile;
  status: "scanning" | "locked" | "fallback";
  onInspect?: () => void;
}

function normalizeBrandColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((character) => character.repeat(2)).join("")}`.toUpperCase();
  }
  return undefined;
}

function brandPaletteTokens(brand: BrandLockProfile | undefined) {
  const colors = [
    brand?.primaryColor,
    brand?.accentColor,
    brand?.surfaceColor,
    ...(brand?.colors ?? [])
  ].map(normalizeBrandColor).filter((color): color is string => Boolean(color));
  const unique = [...new Set(colors)];
  const primary = normalizeBrandColor(brand?.primaryColor) ?? unique[0];
  const accent = normalizeBrandColor(brand?.accentColor) ?? unique.find((color) => color !== primary);
  const surface = normalizeBrandColor(brand?.surfaceColor)
    ?? unique.find((color) => color === "#FFFFFF")
    ?? unique.find((color) => color !== primary && color !== accent);
  const semantic = new Set([primary, accent, surface].filter(Boolean));
  const support = unique.find((color) => !semantic.has(color));
  return {
    colors: unique,
    primary,
    accent,
    surface,
    support,
    tokens: [
      ["Primary", primary],
      ["Accent", accent],
      ["Surface", surface],
      ["Support", support]
    ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  };
}

export function InstantBrandLockStrip({ brand, status, onInspect }: InstantBrandLockStripProps) {
  const companyName = brand?.companyName || brand?.domain || "Your brand";
  const [failedLogoUrls, setFailedLogoUrls] = useState<string[]>([]);
  const paletteReady = status !== "scanning" && Boolean(
    brand && brand.source !== "fallback" && (brand.readiness?.paletteReady ?? true)
  );
  const palette = brandPaletteTokens(paletteReady ? brand : undefined);
  const logoUrls = brandfetchLogoRecoveryUrls(
    brand?.logoUrlOnDark ?? brand?.logoUrl,
    brand?.canonicalDomain ?? brand?.domain
  );
  const logoUrl = logoUrls.find((candidate) => !failedLogoUrls.includes(candidate));
  const hasLogo = Boolean(logoUrl);
  const isCaptured = status === "locked";
  const needsReview = status === "fallback" || brand?.readiness?.status === "incomplete";
  const paletteKind = status === "scanning"
    ? "Detecting palette"
    : !paletteReady
      ? "Brand colors unavailable"
      : "Harvested palette";
  const stateTitle = status === "scanning"
    ? "Scanning public brand"
    : needsReview
      ? "Brand evidence needs review"
      : "Identity and brand matched";
  const readinessReason = brand?.readiness?.reasons.filter(Boolean).slice(0, 2).join(" ");
  const stateDetail = status === "scanning"
    ? "Checking logo, palette, typography, and source."
    : needsReview
      ? readinessReason || `The ${companyName} logo, palette, or source evidence still needs verification.`
      : brand?.positioning || `Logo + ${palette.colors.length} colors from ${brand?.domain ?? "the public site"}.`;
  const statusLabel = needsReview
    ? "Needs review"
    : brand?.confidenceLabel || (status === "scanning"
      ? "Scanning"
      : "Captured");
  const stripStyle = {
    "--harvest-primary": paletteReady ? palette.primary : "var(--deep)",
    "--harvest-accent": paletteReady ? palette.accent : "var(--border)",
    "--harvest-surface": paletteReady ? palette.surface : "#FFFFFF",
    "--harvest-support": paletteReady ? palette.support ?? palette.accent : "var(--muted)"
  } as CSSProperties;

  return (
    <section
      className={classes(styles.brandStrip, styles[`brand${status}`])}
      style={stripStyle}
      aria-busy={status === "scanning"}
      data-brand-evidence={needsReview ? "needs-review" : isCaptured ? "reviewed" : "scanning"}
    >
      <span className={styles.brandMark}>
        {status === "scanning" ? (
          <span className={styles.brandLogoSkeleton} aria-hidden="true" />
        ) : hasLogo ? (
          <Image
            className={styles.brandLogo}
            src={logoUrl ?? ""}
            alt={`${companyName} logo`}
            width={164}
            height={38}
            style={{ width: "auto", height: "auto" }}
            unoptimized
            onLoad={() => captureProductEvent("brand_logo_rendered", {
              category: "performance",
              outcome: "success",
              properties: {
                provider: logoUrl?.includes("cdn.brandfetch.io") ? "brandfetch" : "first_party",
                candidate_index: Math.max(0, logoUrls.indexOf(logoUrl ?? ""))
              }
            })}
            onError={() => {
              if (!logoUrl) return;
              setFailedLogoUrls((current) => current.includes(logoUrl) ? current : [...current, logoUrl]);
              captureProductEvent("brand_logo_failed", {
                category: "error",
                outcome: "failure",
                properties: {
                  provider: logoUrl.includes("cdn.brandfetch.io") ? "brandfetch" : "first_party",
                  candidate_index: Math.max(0, logoUrls.indexOf(logoUrl))
                }
              });
            }}
          />
        ) : (
          <span className={styles.brandLogoUnavailable} aria-label={`${companyName} logo unavailable`}>
            <strong>{companyName}</strong><small>Logo unavailable</small>
          </span>
        )}
      </span>
      <div className={styles.brandIdentity} role="status" aria-live="polite" aria-atomic="true">
        <span>{stateTitle}</span>
        <strong>{companyName}</strong>
        <small>{stateDetail}</small>
        {isCaptured && <em className={styles.identityProof}><Check size={11} />Domain matched to the public company site</em>}
      </div>
      <span className={styles.lockStatus}>
        {status === "scanning" ? <span className={styles.orbit} /> : <Check size={14} />}
        {statusLabel}
      </span>
      <div
        className={styles.brandPalette}
        aria-label={status === "scanning" ? "Brand palette is being detected" : needsReview ? `${companyName} brand palette evidence needs review` : `Harvested ${companyName} brand palette`}
      >
        <div className={styles.brandPaletteHeader}>
          <span>{paletteKind}</span>
          <small>{status === "scanning" ? "Reading Brandfetch + public CSS" : !paletteReady ? "No generic palette applied" : `${palette.colors.length} colors captured`}</small>
        </div>
        {status === "scanning" ? (
          <span className={styles.brandPaletteSkeleton} aria-hidden="true"><i /><i /><i /><i /></span>
        ) : !paletteReady ? (
          <p className={styles.brandPaletteUnavailable} role="alert">
            {readinessReason || "Brand API and public-site color evidence did not produce a verified palette."}
          </p>
        ) : (
          <>
            <span className={styles.brandPaletteRail} aria-hidden="true">
              {palette.colors.slice(0, 6).map((color) => <i key={color} style={{ backgroundColor: color }} />)}
            </span>
            <ul className={styles.brandTokenList}>
              {palette.tokens.map(([label, color]) => (
                <li key={`${label}-${color}`} data-color={color}>
                  <i style={{ backgroundColor: color }} aria-hidden="true" />
                  <span><small>{label}</small><code>{color}</code></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {onInspect && <button type="button" className={styles.tertiaryAction} aria-label={`Inspect ${companyName} brand signals`} onClick={onInspect}>Review evidence</button>}
    </section>
  );
}

export interface EvidenceItem {
  id: string;
  label: string;
  detail: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface AudienceEvidenceOption {
  id: string;
  label: string;
  rationale: string;
  evidence: EvidenceItem[];
  pinned?: boolean;
  excluded?: boolean;
}

export interface AudienceEvidenceTrayProps {
  companyName: string;
  options: AudienceEvidenceOption[];
  selectedId?: string;
  simplified?: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onExclude: (id: string, excluded: boolean) => void;
}

export function supportingSignalLabel(count: number): string {
  return `${count} supporting ${count === 1 ? "signal" : "signals"}`;
}

export function AudienceEvidenceTray({ companyName, options, selectedId, simplified = false, onSelect, onPin, onExclude }: AudienceEvidenceTrayProps) {
  return (
    <section className={styles.evidenceTray} aria-labelledby="audience-evidence-title">
      <div className={styles.sectionHeading}>
        <div><span>Explainable audience</span><h3 id="audience-evidence-title">Why these roles fit {companyName}</h3></div>
        <small>{options.filter((option) => !option.excluded).length} active hypotheses</small>
      </div>
      <div className={styles.audienceList} role="radiogroup" aria-label={`Choose an audience for ${companyName}`}>
        {options.map((option) => (
          <article key={option.id} className={classes(styles.audienceOption, selectedId === option.id && styles.isSelected, option.excluded && styles.isExcluded)}>
            <button
              type="button"
              className={styles.audienceSelect}
              role="radio"
              aria-checked={selectedId === option.id}
              disabled={option.excluded}
              onClick={() => onSelect(option.id)}
            >
              <span className={styles.audienceRadio}>{selectedId === option.id && <i />}</span>
              <span><strong>{option.label}</strong><small>{option.rationale}</small></span>
            </button>
            {!simplified && <div className={styles.audienceTools}>
              <button type="button" aria-pressed={Boolean(option.pinned)} onClick={() => onPin(option.id, !option.pinned)}>
                <Pin size={14} />{option.pinned ? "Pinned" : "Pin"}
              </button>
              <button type="button" aria-pressed={Boolean(option.excluded)} onClick={() => onExclude(option.id, !option.excluded)}>
                <X size={14} />{option.excluded ? "Restore" : "Exclude"}
              </button>
            </div>}
            <details className={styles.evidenceDetails}>
              <summary>Why this fits · {supportingSignalLabel(option.evidence.length)}</summary>
              <div>
                {option.evidence.map((item) => (
                  <div key={item.id} className={styles.evidenceRow}>
                    <span><Globe2 size={13} /></span>
                    <div><strong>{item.label}</strong><p>{item.detail}</p>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener">{item.sourceLabel || "View source"}<ExternalLink size={11} /></a> : item.sourceLabel && <small>{item.sourceLabel}</small>}</div>
                  </div>
                ))}
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

export interface ConfirmedSource {
  title: string;
  sourceLabel: string;
  host?: string;
  thumbnailUrl?: string;
  pageCount?: number;
  facts: string[];
}

export interface ContentSourceConfirmationProps {
  source: ConfirmedSource;
  confirmed?: boolean;
  onConfirm: () => void;
  onReplace: () => void;
}

export function ContentSourceConfirmation({ source, confirmed = false, onConfirm, onReplace }: ContentSourceConfirmationProps) {
  return (
    <section className={classes(styles.sourceCard, confirmed && styles.isConfirmed)} aria-labelledby="source-confirmation-title">
      <div
        className={styles.sourcePreview}
        style={source.thumbnailUrl ? { backgroundImage: `url("${source.thumbnailUrl}")` } : undefined}
        role="img"
        aria-label={source.thumbnailUrl ? `Preview of ${source.title}` : `${source.sourceLabel} source document`}
      >
        {!source.thumbnailUrl && <FileText size={36} />}
        <span>{source.pageCount ? `${source.pageCount} pages` : source.host || "Public source"}</span>
      </div>
      <div className={styles.sourceCopy}>
        <span className={styles.eyebrow}>{confirmed ? "Source confirmed" : "Check the factual backbone"}</span>
        <h3 id="source-confirmation-title">{source.title}</h3>
        <p>{source.sourceLabel}</p>
        <div className={styles.factList} aria-label="Extracted factual anchors">
          {source.facts.slice(0, 5).map((fact, index) => <span key={`${fact}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i>{fact}</span>)}
        </div>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.primaryAction} onClick={onConfirm}>{confirmed ? <Check size={16} /> : <ArrowRight size={16} />}{confirmed ? "Confirmed" : "Use this source"}</button>
          <button type="button" className={styles.secondaryAction} onClick={onReplace}><RefreshCw size={15} />Use another source</button>
        </div>
      </div>
    </section>
  );
}

export interface MessageDirectionValue {
  enabled: boolean;
  belief: string;
  action: string;
}

export interface MessageDirectionControlProps {
  value: MessageDirectionValue;
  onChange: (value: MessageDirectionValue) => void;
  optionalLabel?: string;
}

export function MessageDirectionControl({ value, onChange, optionalLabel = "Optional message direction" }: MessageDirectionControlProps) {
  return (
    <section className={styles.controlCard} aria-labelledby="message-direction-title">
      <div className={styles.controlHeader}>
        <div><span>{optionalLabel}</span><h3 id="message-direction-title">Belief → action</h3></div>
        <label className={styles.switchControl}>
          <span>Guide the message</span>
          <input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} />
          <i aria-hidden="true" />
        </label>
      </div>
      <div className={styles.messageGrid} aria-disabled={!value.enabled}>
        <label><span>What should the buyer believe?</span><textarea disabled={!value.enabled} value={value.belief} onChange={(event) => onChange({ ...value, belief: event.target.value })} placeholder="The cost of staying fragmented is now higher than the cost of change." /></label>
        <span className={styles.messageArrow}><ArrowRight size={18} /></span>
        <label><span>What should they do next?</span><textarea disabled={!value.enabled} value={value.action} onChange={(event) => onChange({ ...value, action: event.target.value })} placeholder="Bring the first architecture question into a working session." /></label>
      </div>
    </section>
  );
}

export type CtaType = "meeting" | "registration" | "content" | "custom";
export type CtaStyle = "solid" | "outline" | "text";

export interface CtaValue {
  type: CtaType;
  label: string;
  style: CtaStyle;
}

export interface CtaStyleControlProps {
  value: CtaValue;
  onChange: (value: CtaValue) => void;
}

const CTA_STYLES: Array<{ id: CtaStyle; label: string; detail: string }> = [
  { id: "solid", label: "Solid", detail: "High-emphasis action" },
  { id: "outline", label: "Outline", detail: "Measured invitation" },
  { id: "text", label: "Text", detail: "Editorial next step" }
];

export function CtaStyleControl({ value, onChange }: CtaStyleControlProps) {
  return (
    <fieldset className={styles.controlCard}>
      <legend className={styles.fieldLegend}>CTA treatment</legend>
      <div className={styles.controlHeader}><div><span>Conversion moment</span><h3>Shape the next step</h3></div><Target size={20} /></div>
      <p className={styles.controlIntro}>Choose the button words and visual emphasis. No link is needed to build the preview.</p>
      <div className={styles.ctaComposer}>
        <label className={styles.ctaLabelField}><span>Button label</span><input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} /></label>
        <fieldset className={styles.ctaStyleFieldset}>
          <legend>Button style</legend>
          <div className={styles.ctaStyleGrid}>
            {CTA_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                aria-pressed={value.style === style.id}
                aria-label={`${style.label}: ${style.detail}`}
                onClick={() => onChange({ ...value, style: style.id })}
              >
                <span className={styles[`ctaPreview${style.id}`]}>Next step</span>
                <strong>{style.label}</strong>
                <small>{style.detail}</small>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <p className={styles.ctaActivationNote}><Check size={13} />This is a visual treatment only. No live destination is connected.</p>
    </fieldset>
  );
}

export type ArtifactStatus = "queued" | "running" | "ready" | "failed";

export interface ProgressiveArtifact {
  id: string;
  phase: string;
  title: string;
  detail: string;
  artifact?: string;
  status: ArtifactStatus;
}

export interface ProgressiveArtifactStreamProps {
  artifacts: ProgressiveArtifact[];
  headline?: string;
}

export function ProgressiveArtifactStream({ artifacts, headline = "Your experience is assembling live" }: ProgressiveArtifactStreamProps) {
  const ready = artifacts.filter((artifact) => artifact.status === "ready").length;
  const progress = artifacts.length ? Math.round((ready / artifacts.length) * 100) : 0;
  const failed = artifacts.find((artifact) => artifact.status === "failed");
  const running = artifacts.find((artifact) => artifact.status === "running");
  const queued = artifacts.find((artifact) => artifact.status === "queued");
  const focus = failed ?? running ?? queued ?? artifacts.at(-1);
  const focusIndex = focus ? artifacts.findIndex((artifact) => artifact.id === focus.id) + 1 : 0;
  const complete = Boolean(artifacts.length) && ready === artifacts.length;
  const finalAssembly = Boolean(running && focus?.id === "experience");
  const preserveFinalAssemblyHeight = finalAssembly
    || Boolean(complete && artifacts.at(-1)?.id === "experience")
    || Boolean(failed?.id === "experience");
  const focusLabel = failed
    ? "Needs attention"
    : complete
      ? "Build complete"
      : finalAssembly
        ? "Final assembly · live"
        : running
        ? "Working now"
        : "Up next";
  const focusDetail = complete
    ? `All ${artifacts.length} build stages are complete. Your preview is ready to explore.`
    : focus?.detail ?? "Waiting for the first build signal.";
  const cadenceLabel = failed
    ? "Build paused — the rest of your work is safe."
    : complete
      ? "Your buyer journey is ready to explore."
      : running
        ? focus?.id === "experience"
          ? "Shaping the story · arranging proof · polishing the page"
          : focus?.id === "brand"
            ? "Reading identity · extracting color · verifying visual cues"
            : focus?.id === "buyer"
              ? "Connecting company signals · mapping roles · ranking relevance"
              : focus?.id === "strategy"
                ? "Clarifying the objective · structuring the message · choosing the next move"
                : "Turning live signals into the next build decision."
        : "Standing by for the next build stage.";
  const visualProgress = running && focus?.id === "experience"
    ? { value: "Final assembly", label: "" }
    : complete
      ? { value: "Ready", label: `${artifacts.length} of ${artifacts.length} stages ready` }
      : { value: `${ready} of ${artifacts.length}`, label: "stages ready" };
  return (
    <section className={styles.artifactStream} aria-labelledby="artifact-stream-title" aria-busy={Boolean(running)}>
      <div className={styles.streamHeader}>
        <div><span>Progressive build</span><h3 id="artifact-stream-title">{headline}</h3></div>
        <strong>{ready}/{artifacts.length}</strong>
      </div>
      <div
        className={classes(
          styles.activeBuild,
          preserveFinalAssemblyHeight && styles.activeBuildEmphasis,
          complete && styles.activeBuildComplete,
          failed && styles.activeBuildFailed
        )}
        data-build-state={failed ? "failed" : complete ? "complete" : running ? "running" : "queued"}
        data-final-assembly={finalAssembly ? "true" : "false"}
      >
        <span className={styles.buildVisual} aria-hidden="true">
          <span className={styles.buildSignal}>
            <span className={styles.buildCore}>
              {failed ? <X size={34} strokeWidth={1.7} /> : complete ? <Check size={34} strokeWidth={1.7} /> : running ? <WandSparkles size={34} strokeWidth={1.7} /> : <Clock size={32} strokeWidth={1.7} />}
            </span>
            <i /><i /><i />
          </span>
          <small><strong>{visualProgress.value}</strong>{visualProgress.label}</small>
        </span>
        <div className={styles.buildNarrative} role="status" aria-live="polite" aria-atomic="true" aria-relevant="text">
          <div className={styles.buildStatusLine}>
            <span>{focusLabel}</span>
            <small>{focusIndex ? `Stage ${focusIndex} of ${artifacts.length}` : "Waiting for stage 1"}</small>
          </div>
          <strong>{focus?.title ?? "Waiting for the build"}</strong>
          <p>{focusDetail}</p>
          {finalAssembly && <small className={styles.buildExpectation}>Usually takes 30–60 seconds. Keep this page open.</small>}
          <div className={styles.buildActivity}>
            <span className={styles.buildCadence} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>
            <span>{cadenceLabel}</span>
          </div>
        </div>
        <span className={styles.buildStageStamp} aria-hidden="true"><small>Stage</small><strong>{focusIndex ? String(focusIndex).padStart(2, "0") : "—"}</strong><span>of {String(artifacts.length).padStart(2, "0")}</span></span>
      </div>
      <div className={styles.buildProgressMeta}><span>{ready} completed</span><span>{Math.max(artifacts.length - ready, 0)} remaining</span></div>
      <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${ready} of ${artifacts.length} stages complete. ${focusLabel}: ${focus?.title ?? "Waiting"}.`} aria-label="Experience build progress"><span style={{ width: `${progress}%` }} /></div>
      <ol className={styles.artifactList}>
        {artifacts.map((artifact, index) => (
          <li key={artifact.id} className={classes(styles.artifactRow, styles[`artifact${artifact.status}`])}>
            <span className={styles.artifactIndex}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.artifactGlyph}>{artifact.status === "ready" ? <Check size={14} /> : artifact.status === "failed" ? <X size={14} /> : <i />}</span>
            <div><span>{artifact.phase}</span><strong>{artifact.title}</strong><p>{artifact.artifact || artifact.detail}</p></div>
            {artifact.status === "running" && <small>Working now</small>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface BriefField {
  id: string;
  label: string;
  value: string;
  type?: "text" | "url" | "select";
  options?: Array<{ value: string; label: string }>;
  hint?: string;
}

export interface EditBriefDrawerProps {
  open: boolean;
  title?: string;
  fields: BriefField[];
  saving?: boolean;
  onFieldChange: (id: string, value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

function useModalAccess(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("button, input, select, textarea, [href]")?.focus(), 0);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", escape);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);
  return ref;
}

function trapModalFocus(event: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  if (event.key !== "Tab" || !root) return;
  const focusable = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function EditBriefDrawer({ open, title = "Edit the live brief", fields, saving = false, onFieldChange, onSave, onClose }: EditBriefDrawerProps) {
  const ref = useModalAccess(open, onClose);
  if (!open) return null;
  return (
    <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside ref={ref} className={styles.briefDrawer} role="dialog" aria-modal="true" aria-labelledby="edit-brief-title" onKeyDown={(event) => trapModalFocus(event, ref.current)}>
        <div className={styles.drawerHeader}><div><span>Keep the current preview while we rebuild</span><h2 id="edit-brief-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close edit brief"><X size={20} /></button></div>
        <div className={styles.drawerFields}>
          {fields.map((field) => (
            <label key={field.id}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select value={field.value} onChange={(event) => onFieldChange(field.id, event.target.value)}>{field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
              ) : (
                <input type={field.type === "url" ? "url" : "text"} value={field.value} onChange={(event) => onFieldChange(field.id, event.target.value)} />
              )}
              {field.hint && <small>{field.hint}</small>}
            </label>
          ))}
        </div>
        <div className={styles.drawerActions}><button type="button" className={styles.secondaryAction} onClick={onClose}>Keep current</button><button type="button" className={styles.primaryAction} disabled={saving} onClick={onSave}>{saving ? "Updating…" : "Update experience"}<ArrowRight size={16} /></button></div>
      </aside>
    </div>
  );
}

export interface ExperienceBlockControlProps {
  blockId: string;
  label: string;
  description?: string;
  locked?: boolean;
  onEdit: (blockId: string) => void;
  onGenerateOptions?: (blockId: string) => void;
  onLockChange: (blockId: string, locked: boolean) => void;
}

export function ExperienceBlockControl({ blockId, label, description, locked = false, onEdit, onGenerateOptions, onLockChange }: ExperienceBlockControlProps) {
  return (
    <section className={classes(styles.blockControl, locked && styles.isLocked)} aria-label={`${label} controls`}>
      <div><span>{locked ? "Locked in the brief" : "Editable block"}</span><strong>{label}</strong>{description && <small>{description}</small>}</div>
      <div className={styles.blockActions}>
        <button type="button" disabled={locked} onClick={() => onEdit(blockId)}><Pencil size={14} />Edit</button>
        {onGenerateOptions && <button type="button" disabled={locked} onClick={() => onGenerateOptions(blockId)}><WandSparkles size={14} />Generate 3 options</button>}
        <button type="button" aria-pressed={locked} onClick={() => onLockChange(blockId, !locked)}>{locked ? <Check size={14} /> : <Lock size={14} />}{locked ? "Locked" : "Lock"}</button>
      </div>
    </section>
  );
}

export interface ToneOption { id: string; label: string; description?: string }

export function ToneChips({ options, selectedId, onChange, label = "Message tone" }: { options: ToneOption[]; selectedId?: string; onChange: (id: string) => void; label?: string }) {
  return (
    <fieldset className={styles.toneFieldset}><legend>{label}</legend><div>{options.map((option) => <button type="button" key={option.id} aria-pressed={selectedId === option.id} title={option.description} onClick={() => onChange(option.id)}>{selectedId === option.id && <Check size={13} />}{option.label}</button>)}</div></fieldset>
  );
}

export interface ExperienceVariant {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  kind: "layout" | "story";
  previewPattern?: "editorial" | "split" | "guided" | "proof";
}

export function ExperienceVariantCards({ variants, selectedId, onSelect, label = "Choose a direction" }: { variants: ExperienceVariant[]; selectedId?: string; onSelect: (id: string) => void; label?: string }) {
  return (
    <fieldset className={styles.variantFieldset}><legend>{label}</legend><div className={styles.variantGrid}>{variants.map((variant) => <button type="button" key={variant.id} aria-pressed={selectedId === variant.id} className={styles.variantCard} onClick={() => onSelect(variant.id)}><span className={classes(styles.variantPreview, styles[`preview${variant.previewPattern ?? "editorial"}`])} aria-hidden="true"><i /><i /><i /><i /></span><span className={styles.eyebrow}>{variant.eyebrow}</span><strong>{variant.name}</strong><small>{variant.description}</small><span className={styles.variantKind}>{variant.kind}</span></button>)}</div></fieldset>
  );
}

export interface ProspectAsset {
  id: string;
  name: string;
  type: "image" | "logo" | "diagram" | "video";
  thumbnailUrl?: string;
  detail?: string;
}

export interface AssetPickerProps {
  assets: ProspectAsset[];
  selectedIds: string[];
  maxSelections?: number;
  onToggle: (id: string, selected: boolean) => void;
}

export function AssetPicker({ assets, selectedIds, maxSelections = 3, onToggle }: AssetPickerProps) {
  const selected = new Set(selectedIds);
  const atLimit = selected.size >= maxSelections;
  return (
    <fieldset className={styles.assetFieldset}>
      <legend>Choose supporting assets</legend>
      <div className={styles.assetHeader}><span>{selected.size} of {maxSelections} selected</span><small>Only public, approved brand assets</small></div>
      <div className={styles.assetGrid}>
        {assets.map((asset) => {
          const isSelected = selected.has(asset.id);
          return (
            <label key={asset.id} className={classes(styles.assetCard, isSelected && styles.isSelected, !isSelected && atLimit && styles.isDisabled)}>
              <input type="checkbox" checked={isSelected} disabled={!isSelected && atLimit} onChange={(event) => onToggle(asset.id, event.target.checked)} />
              <span className={styles.assetPreview} style={asset.thumbnailUrl ? { backgroundImage: `url("${asset.thumbnailUrl}")` } : undefined} role="img" aria-label={`${asset.name} preview`}>{!asset.thumbnailUrl && <ImageIcon size={24} />}</span>
              <span><strong>{asset.name}</strong><small>{asset.type}{asset.detail ? ` · ${asset.detail}` : ""}</small></span>
              <i className={styles.assetCheck}>{isSelected && <Check size={13} />}</i>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface AnalyticsSignal {
  id: string;
  label: string;
  detail: string;
  atLabel: string;
  type?: "view" | "choice" | "cta";
  action?: string;
  occurredAt?: number;
  context?: {
    sectionId?: string;
    targetId?: string;
    ctaId?: string;
    lensId?: string;
    area?: string;
  };
  actorLabel?: string;
  roleLabel?: string;
  isExample?: boolean;
}

function analyticsSignalTime(signal: AnalyticsSignal): number | undefined {
  if (typeof signal.occurredAt === "number" && Number.isFinite(signal.occurredAt)) return signal.occurredAt;
  const idTimestamp = Number(signal.id.split("-", 1)[0]);
  return Number.isFinite(idTimestamp) && idTimestamp > 1_000_000_000_000 ? idTimestamp : undefined;
}

function analyticsSignalKey(signal: AnalyticsSignal): string {
  const context = signal.context;
  const subject = context?.ctaId
    ?? context?.lensId
    ?? context?.sectionId
    ?? context?.targetId
    ?? context?.area
    ?? signal.label;
  return `${signal.action ?? signal.type ?? "interaction"}:${subject}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export function prepareAnalyticsSignals(
  signals: AnalyticsSignal[],
  dedupeWindowMs = 1_200
): AnalyticsSignal[] {
  const latestByKey = new Map<string, number>();
  const seenIds = new Set<string>();
  return signals.filter((signal) => {
    if (seenIds.has(signal.id)) return false;
    seenIds.add(signal.id);
    const occurredAt = analyticsSignalTime(signal);
    if (occurredAt === undefined) return true;
    const key = analyticsSignalKey(signal);
    const previous = latestByKey.get(key);
    latestByKey.set(key, occurredAt);
    return previous === undefined || occurredAt - previous >= dedupeWindowMs;
  });
}

export function AnalyticsSignalToast({ signal, open, onDismiss, onOpenPanel }: { signal?: AnalyticsSignal; open: boolean; onDismiss: () => void; onOpenPanel: () => void }) {
  if (!open || !signal) return null;
  return (
    <aside className={styles.signalToast} aria-label="Latest engagement signal">
      <span className={styles.signalAnnouncement} role="status" aria-live="polite" aria-atomic="true">Signal captured: {signal.label}</span>
      <span className={styles.signalPulse}><Gauge size={17} /></span>
      <div><span>Signal captured</span><strong>{signal.label}</strong></div>
      <button type="button" className={styles.signalOpen} onClick={onOpenPanel}>See the journey<ArrowRight size={14} /></button>
      <button type="button" className={styles.signalDismiss} onClick={onDismiss} aria-label="Dismiss signal"><X size={16} /></button>
    </aside>
  );
}

const ANALYTICS_CAPABILITIES = [
  { id: "attention", label: "Attention", detail: "Views, dwell time, and return visits", icon: Eye },
  { id: "journey", label: "Journey path", detail: "Sections and sequences buyers explore", icon: Route },
  { id: "topics", label: "Topics", detail: "Decision lenses and questions selected", icon: Layers3 },
  { id: "content", label: "Content", detail: "Resources and proof opened", icon: FileText },
  { id: "intent", label: "Intent", detail: "Next-step and CTA interactions", icon: MousePointerClick },
  { id: "group", label: "Buying group", detail: "Account-level engagement across people", icon: Users }
] as const;

export interface AnalyticsSignalPanelProps {
  open: boolean;
  signals: AnalyticsSignal[];
  visitorLabel?: string;
  engagedSeconds?: number;
  sessionId?: string;
  audienceLabel?: string;
  exampleSignals?: AnalyticsSignal[];
  onClose: () => void;
}

export function AnalyticsSignalPanel({
  open,
  signals,
  visitorLabel = "Anonymous visitor",
  engagedSeconds = 0,
  sessionId,
  audienceLabel,
  exampleSignals,
  onClose
}: AnalyticsSignalPanelProps) {
  const ref = useModalAccess(open, onClose);
  const liveSignals = prepareAnalyticsSignals(signals).slice(-24);
  const buyingGroupSignals = exampleSignals ?? (sessionId
    ? buildSimulatedEngagement({ sessionId, audienceLabel })
    : []);
  if (!open) return null;
  const showCounters = liveSignals.length >= 2 && engagedSeconds >= 15;
  const sparseSeconds = Math.max(engagedSeconds, 1);
  return (
    <div className={classes(styles.modalBackdrop, styles.signalBackdrop)} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside ref={ref} className={styles.signalPanel} role="dialog" aria-modal="true" aria-labelledby="signal-panel-title" onKeyDown={(event) => trapModalFocus(event, ref.current)}>
        <div className={styles.drawerHeader}><div><span>Live engagement</span><h2 id="signal-panel-title">What Folloze knows about this journey.</h2><p>Every meaningful interaction can become context for campaign and sales follow-up.</p></div><button type="button" onClick={onClose} aria-label="Close analytics signals"><X size={20} /></button></div>
        {showCounters ? (
          <div className={styles.signalStats}><div><strong>1</strong><span>{visitorLabel}</span></div><div><strong>{liveSignals.length}</strong><span>meaningful interactions</span></div><div><strong>{engagedSeconds}s</strong><span>engaged</span></div></div>
        ) : (
          <p className={styles.sparseSignalSummary}>You&apos;ve spent {sparseSeconds} {sparseSeconds === 1 ? "second" : "seconds"} here — that&apos;s already a signal.</p>
        )}
        <div className={styles.signalColumns}>
          <section className={styles.realSignalSection} aria-labelledby="real-signal-title">
            <div className={styles.signalSectionHeading}><div><span>Real-time proof</span><h3 id="real-signal-title">Your activity in this preview</h3></div><b>Live</b></div>
            <p className={styles.signalSectionIntro}>This feed updates as you explore, so follow-up can start with what actually earned your attention.</p>
            <div className={styles.signalTimeline}>
              {[...liveSignals].reverse().map((signal) => <article key={signal.id}><span className={styles.timelineDot} /><div><span>{signal.atLabel}</span><strong>{signal.label}</strong><p>{signal.detail}</p></div></article>)}
              {!liveSignals.length && <p className={styles.signalEmpty}>Explore the preview to see your first live signal arrive here.</p>}
            </div>
          </section>
          {buyingGroupSignals.length > 0 && (
            <section className={styles.exampleSignalSection} aria-labelledby="example-signal-title">
              <div className={styles.exampleSignalLabel}><span>Illustrative examples</span><strong>Not captured leads</strong></div>
              <div className={styles.signalSectionHeading}><div><span>Buying-group view</span><h3 id="example-signal-title">What account-level depth could look like</h3></div></div>
              <p className={styles.exampleSignalDisclosure}>Simulated activity only. These placeholder names and actions demonstrate what Folloze can report in a live campaign.</p>
              <div className={classes(styles.signalTimeline, styles.exampleTimeline)}>
                {buyingGroupSignals.map((signal) => <article key={signal.id}><span className={styles.timelineDot} /><div><span>{signal.atLabel} · {signal.roleLabel}</span><strong>{signal.label}</strong><p>{signal.detail}</p></div></article>)}
              </div>
            </section>
          )}
        </div>
        <section className={styles.signalCapabilitySection} aria-labelledby="signal-capability-title">
          <div className={styles.signalSectionHeading}><div><span>What Folloze reports</span><h3 id="signal-capability-title">A live campaign turns activity into usable context</h3></div></div>
          <div className={styles.signalCapabilityGrid}>
            {ANALYTICS_CAPABILITIES.map((capability) => {
              const Icon = capability.icon;
              return <article key={capability.id} title={capability.detail}><span><Icon size={15} /></span><strong>{capability.label}</strong></article>;
            })}
          </div>
        </section>
        <div className={styles.signalValue}><BarChart3 size={20} /><p>In a live campaign, these signals can route to campaign and sales systems so the next move starts with context.</p></div>
      </aside>
    </div>
  );
}

export interface QualityLayer {
  id: string;
  label: string;
  detail: string;
  status: "strong" | "partial" | "missing" | "not-applicable";
}

export interface FollozeValueReceiptProps {
  companyName: string;
  audienceLabel: string;
  objectiveLabel: string;
  interactionCount: number;
  onOpenSignals: () => void;
}

export function FollozeValueReceipt({
  companyName,
  audienceLabel,
  objectiveLabel,
  interactionCount,
  onOpenSignals
}: FollozeValueReceiptProps) {
  return (
    <section className={styles.valueReceipt} aria-labelledby="folloze-value-title">
      <div className={styles.valueReceiptHeader}>
        <span>What Folloze just did</span>
        <h3 id="folloze-value-title">From three signals to a measurable buyer journey.</h3>
      </div>
      <ol className={styles.valueLayers}>
        <li>
          <span><Globe2 size={16} /></span>
          <div><small>01 · Enriched</small><strong>{companyName} context found</strong><p>Identity, brand cues, and public company evidence shaped the brief.</p></div>
        </li>
        <li>
          <span><Target size={16} /></span>
          <div><small>02 · Personalized</small><strong>Built for {audienceLabel}</strong><p>The story and visual next step are aligned to {objectiveLabel.toLowerCase()}.</p></div>
        </li>
        <li>
          <span><Gauge size={16} /></span>
          <div><small>03 · Measured</small><strong>{interactionCount ? `${interactionCount} live signal${interactionCount === 1 ? "" : "s"} captured` : "Engagement is ready"}</strong><p>Explore the preview to reveal interest, depth, and next-step intent.</p></div>
        </li>
      </ol>
      <button type="button" className={styles.valueSignalAction} onClick={onOpenSignals}>
        {interactionCount ? "Review captured engagement" : "See how engagement appears"}<ArrowRight size={15} />
      </button>
    </section>
  );
}

export function PersonalizationQualityReceipt({ score, companyName, layers }: { score: number; companyName: string; layers: QualityLayer[] }) {
  const safeScore = Math.max(0, Math.min(100, score));
  return (
    <section className={styles.qualityReceipt} aria-labelledby="quality-receipt-title">
      <div className={styles.qualityScore} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeScore} aria-label="Personalization quality score" style={{ "--quality-score": `${safeScore * 3.6}deg` } as CSSProperties}><strong>{safeScore}</strong><span>/100</span></div>
      <div className={styles.qualityCopy}><span>Personalization quality</span><h3 id="quality-receipt-title">Why this feels built for {companyName}</h3><div>{layers.map((layer) => <span key={layer.id} className={styles[`quality${layer.status}`]}><i>{layer.status === "strong" ? <Check size={12} /> : layer.status === "partial" ? "~" : layer.status === "not-applicable" ? "—" : "!"}</i><strong>{layer.label}</strong><small>{layer.detail}</small></span>)}</div></div>
    </section>
  );
}

export interface ExpirySaveValuePanelProps {
  expiresLabel: string;
  url: string;
  sellerName: string;
  targetName?: string;
  headline: string;
  email: string;
  status?: "idle" | "saving" | "saved" | "error";
  error?: string;
  benefits?: string[];
  onEmailChange: (email: string) => void;
  onSave: () => void;
}

export function ExpirySaveValuePanel({ expiresLabel, url, sellerName, targetName, headline, email, status = "idle", error, benefits = ["Permanent live URL", "Email delivery", "Engagement-ready experience"], onEmailChange, onSave }: ExpirySaveValuePanelProps) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(); };
  return (
    <section className={classes(styles.savePanel, status === "saved" && styles.isSaved)} aria-labelledby="save-value-title">
      <div className={styles.saveCopy}><span>{status === "saved" ? "Experience secured" : "Keep what you built"}</span><h3 id="save-value-title">{status === "saved" ? "Your experience is ready to share." : "Keep this experience live."}</h3><p>{status === "saved" ? "Your permanent experience is ready." : "Save it before the private preview expires."}</p><ul>{benefits.map((benefit) => <li key={benefit}><Check size={13} />{benefit}</li>)}</ul></div>
      <div className={styles.saveExperiencePreview} aria-label={`Preview of ${headline}`}>
        <div className={styles.saveBrandLockup}><span>{sellerName.slice(0, 2).toUpperCase()}</span>{targetName && <><i>×</i><span>{targetName.slice(0, 2).toUpperCase()}</span></>}</div>
        <div><small>{targetName ? `${sellerName} for ${targetName}` : sellerName}</small><strong>{headline}</strong></div>
      </div>
      <div className={styles.saveUrlRow}><code title={url}>{url}</code><button type="button" className={styles.tertiaryAction} onClick={() => void navigator.clipboard?.writeText(url)} aria-label="Copy preview URL"><Copy size={14} />Copy</button></div>
      <div className={styles.expiryClock}><Clock size={16} /><span>{status === "saved" ? "Saved" : `Private preview · expires in ${expiresLabel}`}</span></div>
      {status !== "saved" && <form className={styles.saveForm} onSubmit={submit}><label><span>Business email</span><div><Mail size={16} /><input type="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@company.com" /></div></label><button type="submit" className={styles.primaryAction} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save and email my link"}</button>{error && <small role="alert">{error}</small>}<p>No newsletter signup. Used only to save and deliver this experience.</p></form>}
    </section>
  );
}

export interface CockpitMetric { label: string; value: string | number; detail?: string }

export interface SavedExperienceCockpitProps {
  title: string;
  url: string;
  updatedLabel: string;
  metrics: CockpitMetric[];
  onOpen: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
}

export function SavedExperienceCockpit({ title, url, updatedLabel, metrics, onOpen, onCopy, onEdit, onDuplicate }: SavedExperienceCockpitProps) {
  return (
    <section className={styles.savedCockpit} aria-labelledby="saved-cockpit-title">
      <div className={styles.cockpitTopline}><span><i />Saved successfully</span><small>{updatedLabel}</small></div>
      <div className={styles.cockpitHero}>
        <span className={styles.savedSuccessMark} aria-hidden="true"><Check size={22} /></span>
        <div><span>Permanent URL created</span><h2 id="saved-cockpit-title">{title}</h2><p>Your private preview is now a shareable, measurable experience.</p><code title={url}>{url}</code></div>
      </div>
      <div className={styles.cockpitActions}><button type="button" className={styles.primaryAction} aria-label="Open experience" onClick={onOpen}>Open experience<ExternalLink size={15} /></button><button type="button" className={styles.secondaryAction} aria-label="Copy experience URL" onClick={onCopy}><Copy size={15} />Copy URL</button></div>
      <div className={styles.cockpitMetrics}>{metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</div>)}</div>
      {(onEdit || onDuplicate) && <div className={styles.cockpitFooter}><span><Target size={14} />Ready for activation</span>{onEdit && <button type="button" onClick={onEdit}><Pencil size={14} />Edit brief</button>}{onDuplicate && <button type="button" onClick={onDuplicate}><RefreshCw size={14} />Create variation</button>}</div>}
    </section>
  );
}

export type EnhancementComponent =
  | typeof EntryPathMicroDemo
  | typeof InstantBrandLockStrip
  | typeof AudienceEvidenceTray
  | typeof ContentSourceConfirmation
  | typeof MessageDirectionControl
  | typeof CtaStyleControl
  | typeof ProgressiveArtifactStream
  | typeof EditBriefDrawer
  | typeof ExperienceBlockControl
  | typeof ToneChips
  | typeof ExperienceVariantCards
  | typeof AssetPicker
  | typeof AnalyticsSignalToast
  | typeof AnalyticsSignalPanel
  | typeof FollozeValueReceipt
  | typeof PersonalizationQualityReceipt
  | typeof ExpirySaveValuePanel
  | typeof SavedExperienceCockpit;
