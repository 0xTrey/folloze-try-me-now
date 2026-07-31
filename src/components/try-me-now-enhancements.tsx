"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  ImageIcon,
  Laptop,
  Link2,
  Lock,
  Mail,
  Monitor,
  Pencil,
  Pin,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  Target,
  WandSparkles,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef
} from "react";

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
  demoSteps: [string, string, string];
  accent?: string;
  tone?: "paper" | "cobalt" | "ink";
}

export interface EntryPathMicroDemoProps {
  option: EntryPathOption;
  selected?: boolean;
  demoDurationMs?: number;
  onSelect: (id: ProspectPath) => void;
  onExample?: (id: ProspectPath) => void;
}

export function EntryPathMicroDemo({
  option,
  selected = false,
  demoDurationMs = 4_000,
  onSelect,
  onExample
}: EntryPathMicroDemoProps) {
  const style = {
    "--enh-accent": option.accent ?? "#5b5bff",
    "--demo-duration": `${demoDurationMs}ms`
  } as CSSProperties;

  return (
    <article
      className={classes(styles.pathCard, styles[`tone${option.tone ?? "paper"}`], selected && styles.isSelected)}
      style={style}
      aria-label={`${option.eyebrow}: ${option.title}`}
    >
      <div className={styles.pathTopline}><span>{option.index}</span><span>{option.eyebrow}</span></div>
      <div className={styles.microDemo} aria-hidden="true">
        <span className={styles.demoOrigin}>{option.demoSteps[0]}</span>
        <span className={styles.demoConnector}><i /><ArrowRight size={14} /><i /></span>
        <span className={styles.demoResult}>{option.demoSteps[2]}</span>
        <span className={styles.demoSignal}>{option.demoSteps[1]}</span>
        <span className={styles.demoPulse} />
      </div>
      <div className={styles.pathCopy}>
        <h3>{option.title}</h3>
        <p>{option.description}</p>
      </div>
      <div className={styles.pathActions}>
        <button type="button" className={styles.primaryAction} onClick={() => onSelect(option.id)}>
          {option.actionLabel}<ArrowRight size={16} />
        </button>
        {onExample && (
          <ExampleModeCta label={option.exampleLabel} onClick={() => onExample(option.id)} />
        )}
      </div>
    </article>
  );
}

export function ExampleModeCta({ label = "See an example", onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.exampleAction} onClick={onClick}>
      <Sparkles size={14} />{label}
    </button>
  );
}

export interface BrandLockProfile {
  companyName: string;
  domain: string;
  logoUrl?: string;
  colors?: string[];
  positioning?: string;
  confidenceLabel?: string;
}

export interface InstantBrandLockStripProps {
  brand?: BrandLockProfile;
  status: "scanning" | "locked" | "fallback";
  onInspect?: () => void;
}

export function InstantBrandLockStrip({ brand, status, onInspect }: InstantBrandLockStripProps) {
  const companyName = brand?.companyName || brand?.domain || "Your brand";
  return (
    <section className={classes(styles.brandStrip, styles[`brand${status}`])} aria-live="polite" aria-busy={status === "scanning"}>
      <span
        className={styles.brandMark}
        style={brand?.logoUrl ? { backgroundImage: `url("${brand.logoUrl}")` } : undefined}
        aria-hidden="true"
      >
        {!brand?.logoUrl && companyName.charAt(0).toUpperCase()}
      </span>
      <div className={styles.brandIdentity}>
        <span>{status === "scanning" ? "Reading public brand signals" : status === "fallback" ? "Brand direction reconstructed" : "Brand system locked"}</span>
        <strong>{companyName}</strong>
        <small>{brand?.positioning || (status === "scanning" ? "Logo, palette, and public positioning are arriving now." : brand?.domain)}</small>
      </div>
      <div className={styles.brandPalette} aria-label="Detected brand colors">
        {(brand?.colors?.length ? brand.colors : ["#e8eaf0", "#d7dae4", "#c6cad7"]).slice(0, 4).map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </div>
      <span className={styles.lockStatus}>
        {status === "scanning" ? <span className={styles.orbit} /> : <Check size={14} />}
        {brand?.confidenceLabel || (status === "scanning" ? "Live" : "Ready")}
      </span>
      {onInspect && <button type="button" className={styles.tertiaryAction} onClick={onInspect}>Inspect signals</button>}
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
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onExclude: (id: string, excluded: boolean) => void;
}

export function AudienceEvidenceTray({ companyName, options, selectedId, onSelect, onPin, onExclude }: AudienceEvidenceTrayProps) {
  return (
    <section className={styles.evidenceTray} aria-labelledby="audience-evidence-title">
      <div className={styles.sectionHeading}>
        <div><span>Explainable audience</span><h3 id="audience-evidence-title">Why these roles fit {companyName}</h3></div>
        <small>{options.filter((option) => !option.excluded).length} active hypotheses</small>
      </div>
      <div className={styles.audienceList}>
        {options.map((option) => (
          <article key={option.id} className={classes(styles.audienceOption, selectedId === option.id && styles.isSelected, option.excluded && styles.isExcluded)}>
            <button
              type="button"
              className={styles.audienceSelect}
              aria-pressed={selectedId === option.id}
              disabled={option.excluded}
              onClick={() => onSelect(option.id)}
            >
              <span className={styles.audienceRadio}>{selectedId === option.id && <i />}</span>
              <span><strong>{option.label}</strong><small>{option.rationale}</small></span>
              <ArrowRight size={16} />
            </button>
            <div className={styles.audienceTools}>
              <button type="button" aria-pressed={Boolean(option.pinned)} onClick={() => onPin(option.id, !option.pinned)}>
                <Pin size={14} />{option.pinned ? "Pinned" : "Pin"}
              </button>
              <button type="button" aria-pressed={Boolean(option.excluded)} onClick={() => onExclude(option.id, !option.excluded)}>
                <X size={14} />{option.excluded ? "Restore" : "Exclude"}
              </button>
            </div>
            <details className={styles.evidenceDetails}>
              <summary>{option.evidence.length} supporting signals</summary>
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

export interface CtaValue {
  type: CtaType;
  label: string;
  destination: string;
}

export interface CtaDestinationControlProps {
  value: CtaValue;
  onChange: (value: CtaValue) => void;
  destinationError?: string;
}

const CTA_TYPES: Array<{ id: CtaType; label: string }> = [
  { id: "meeting", label: "Book a meeting" },
  { id: "registration", label: "Register" },
  { id: "content", label: "Open content" },
  { id: "custom", label: "Custom action" }
];

export function CtaDestinationControl({ value, onChange, destinationError }: CtaDestinationControlProps) {
  return (
    <fieldset className={styles.controlCard}>
      <legend className={styles.fieldLegend}>Real destination</legend>
      <div className={styles.controlHeader}><div><span>Conversion path</span><h3>Where should the CTA go?</h3></div><Link2 size={20} /></div>
      <div className={styles.segmentedControl}>
        {CTA_TYPES.map((type) => <button key={type.id} type="button" aria-pressed={value.type === type.id} onClick={() => onChange({ ...value, type: type.id })}>{type.label}</button>)}
      </div>
      <div className={styles.twoFields}>
        <label><span>Button label</span><input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} /></label>
        <label><span>Destination URL</span><div className={styles.inputWithIcon}><Globe2 size={16} /><input type="url" aria-invalid={Boolean(destinationError)} aria-describedby={destinationError ? "cta-destination-error" : undefined} value={value.destination} onChange={(event) => onChange({ ...value, destination: event.target.value })} placeholder="https://" /></div></label>
      </div>
      {destinationError && <p id="cta-destination-error" className={styles.fieldError}>{destinationError}</p>}
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
  return (
    <section className={styles.artifactStream} aria-labelledby="artifact-stream-title" aria-live="polite">
      <div className={styles.streamHeader}>
        <div><span>Progressive build</span><h3 id="artifact-stream-title">{headline}</h3></div>
        <strong>{ready}/{artifacts.length}</strong>
      </div>
      <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Experience build progress"><span style={{ width: `${progress}%` }} /></div>
      <ol className={styles.artifactList}>
        {artifacts.map((artifact, index) => (
          <li key={artifact.id} className={classes(styles.artifactRow, styles[`artifact${artifact.status}`])}>
            <span className={styles.artifactIndex}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.artifactGlyph}>{artifact.status === "ready" ? <Check size={14} /> : artifact.status === "failed" ? <X size={14} /> : <i />}</span>
            <div><span>{artifact.phase}</span><strong>{artifact.title}</strong><p>{artifact.artifact || artifact.detail}</p></div>
            {artifact.status === "running" && <small>Building now</small>}
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
  onGenerateOptions: (blockId: string) => void;
  onLockChange: (blockId: string, locked: boolean) => void;
}

export function ExperienceBlockControl({ blockId, label, description, locked = false, onEdit, onGenerateOptions, onLockChange }: ExperienceBlockControlProps) {
  return (
    <section className={classes(styles.blockControl, locked && styles.isLocked)} aria-label={`${label} controls`}>
      <div><span>{locked ? "Locked in the brief" : "Editable block"}</span><strong>{label}</strong>{description && <small>{description}</small>}</div>
      <div className={styles.blockActions}>
        <button type="button" disabled={locked} onClick={() => onEdit(blockId)}><Pencil size={14} />Edit</button>
        <button type="button" disabled={locked} onClick={() => onGenerateOptions(blockId)}><WandSparkles size={14} />Generate options</button>
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

export type PreviewDevice = "desktop" | "tablet" | "mobile";

const DEVICES: Array<{ id: PreviewDevice; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone }
];

export function DevicePreviewToolbar({ device, fit = true, onDeviceChange, onFitChange }: { device: PreviewDevice; fit?: boolean; onDeviceChange: (device: PreviewDevice) => void; onFitChange?: (fit: boolean) => void }) {
  return (
    <div className={styles.deviceToolbar} role="toolbar" aria-label="Preview device">
      <div>{DEVICES.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-label={label} aria-pressed={device === id} onClick={() => onDeviceChange(id)}><Icon size={16} /><span>{label}</span></button>)}</div>
      {onFitChange && <button type="button" className={styles.fitButton} aria-pressed={fit} onClick={() => onFitChange(!fit)}><Laptop size={15} />{fit ? "Fit preview" : "Actual size"}</button>}
    </div>
  );
}

export interface AnalyticsSignal {
  id: string;
  label: string;
  detail: string;
  atLabel: string;
  type?: "view" | "choice" | "cta";
}

export function AnalyticsSignalToast({ signal, open, onDismiss, onOpenPanel }: { signal?: AnalyticsSignal; open: boolean; onDismiss: () => void; onOpenPanel: () => void }) {
  if (!open || !signal) return null;
  return (
    <aside className={styles.signalToast} role="status" aria-live="polite">
      <span className={styles.signalPulse}><Gauge size={17} /></span>
      <div><span>Signal captured</span><strong>{signal.label}</strong><small>{signal.detail}</small></div>
      <button type="button" className={styles.signalOpen} onClick={onOpenPanel}>See what Folloze knows<ArrowRight size={14} /></button>
      <button type="button" className={styles.signalDismiss} onClick={onDismiss} aria-label="Dismiss signal"><X size={16} /></button>
    </aside>
  );
}

export interface AnalyticsSignalPanelProps {
  open: boolean;
  signals: AnalyticsSignal[];
  visitorLabel?: string;
  engagedSeconds?: number;
  onClose: () => void;
}

export function AnalyticsSignalPanel({ open, signals, visitorLabel = "Anonymous visitor", engagedSeconds = 0, onClose }: AnalyticsSignalPanelProps) {
  const ref = useModalAccess(open, onClose);
  if (!open) return null;
  return (
    <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside ref={ref} className={styles.signalPanel} role="dialog" aria-modal="true" aria-labelledby="signal-panel-title" onKeyDown={(event) => trapModalFocus(event, ref.current)}>
        <div className={styles.drawerHeader}><div><span>Live engagement</span><h2 id="signal-panel-title">This is what Folloze sees.</h2></div><button type="button" onClick={onClose} aria-label="Close analytics signals"><X size={20} /></button></div>
        <div className={styles.signalStats}><div><strong>1</strong><span>{visitorLabel}</span></div><div><strong>{signals.length}</strong><span>interactions</span></div><div><strong>{engagedSeconds}s</strong><span>engaged</span></div></div>
        <div className={styles.signalTimeline}>{signals.map((signal) => <article key={signal.id}><span className={styles.timelineDot} /><div><span>{signal.atLabel}</span><strong>{signal.label}</strong><p>{signal.detail}</p></div></article>)}</div>
        <div className={styles.signalValue}><BarChart3 size={20} /><p>In a live campaign, these signals can route to campaign and sales systems so the next move starts with context.</p></div>
      </aside>
    </div>
  );
}

export interface QualityLayer {
  id: string;
  label: string;
  detail: string;
  status: "strong" | "partial" | "missing";
}

export function PersonalizationQualityReceipt({ score, companyName, layers }: { score: number; companyName: string; layers: QualityLayer[] }) {
  const safeScore = Math.max(0, Math.min(100, score));
  return (
    <section className={styles.qualityReceipt} aria-labelledby="quality-receipt-title">
      <div className={styles.qualityScore} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeScore} aria-label="Personalization quality score" style={{ "--quality-score": `${safeScore * 3.6}deg` } as CSSProperties}><strong>{safeScore}</strong><span>/100</span></div>
      <div className={styles.qualityCopy}><span>Personalization quality</span><h3 id="quality-receipt-title">Why this feels built for {companyName}</h3><div>{layers.map((layer) => <span key={layer.id} className={styles[`quality${layer.status}`]}><i>{layer.status === "strong" ? <Check size={12} /> : layer.status === "partial" ? "~" : "!"}</i><strong>{layer.label}</strong><small>{layer.detail}</small></span>)}</div></div>
    </section>
  );
}

export interface ExpirySaveValuePanelProps {
  expiresLabel: string;
  email: string;
  status?: "idle" | "saving" | "saved" | "error";
  error?: string;
  benefits?: string[];
  onEmailChange: (email: string) => void;
  onSave: () => void;
}

export function ExpirySaveValuePanel({ expiresLabel, email, status = "idle", error, benefits = ["Permanent live URL", "Email delivery", "Engagement-ready experience"], onEmailChange, onSave }: ExpirySaveValuePanelProps) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(); };
  return (
    <section className={classes(styles.savePanel, status === "saved" && styles.isSaved)} aria-labelledby="save-value-title">
      <div className={styles.expiryClock}><Clock size={18} /><div><span>Private preview</span><strong>{status === "saved" ? "Saved" : `Expires ${expiresLabel}`}</strong></div></div>
      <div className={styles.saveCopy}><span>{status === "saved" ? "Experience secured" : "Keep the momentum"}</span><h3 id="save-value-title">{status === "saved" ? "Your experience is ready to share." : "Save the URL before the preview disappears."}</h3><ul>{benefits.map((benefit) => <li key={benefit}><Check size={13} />{benefit}</li>)}</ul></div>
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
      <div className={styles.cockpitTopline}><span><i />Saved experience</span><small>{updatedLabel}</small></div>
      <div className={styles.cockpitHero}><div><span>Live, shareable, measurable</span><h2 id="saved-cockpit-title">{title}</h2><code>{url}</code></div><div className={styles.cockpitActions}><button type="button" className={styles.primaryAction} onClick={onOpen}>Open experience<ExternalLink size={15} /></button><button type="button" className={styles.secondaryAction} onClick={onCopy}><Copy size={15} />Copy URL</button></div></div>
      <div className={styles.cockpitMetrics}>{metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</div>)}</div>
      {(onEdit || onDuplicate) && <div className={styles.cockpitFooter}>{onEdit && <button type="button" onClick={onEdit}><Pencil size={14} />Edit brief</button>}{onDuplicate && <button type="button" onClick={onDuplicate}><RefreshCw size={14} />Create a variation</button>}<span><Target size={14} />Ready for campaign activation</span></div>}
    </section>
  );
}

export type EnhancementComponent =
  | typeof EntryPathMicroDemo
  | typeof InstantBrandLockStrip
  | typeof AudienceEvidenceTray
  | typeof ContentSourceConfirmation
  | typeof MessageDirectionControl
  | typeof CtaDestinationControl
  | typeof ProgressiveArtifactStream
  | typeof EditBriefDrawer
  | typeof ExperienceBlockControl
  | typeof ToneChips
  | typeof ExperienceVariantCards
  | typeof AssetPicker
  | typeof DevicePreviewToolbar
  | typeof AnalyticsSignalToast
  | typeof AnalyticsSignalPanel
  | typeof PersonalizationQualityReceipt
  | typeof ExpirySaveValuePanel
  | typeof SavedExperienceCockpit;
