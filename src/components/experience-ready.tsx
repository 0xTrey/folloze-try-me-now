"use client";

import { ArrowLeft, ExternalLink, Gauge, PencilLine, Users } from "lucide-react";
import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { SessionAnswers } from "@/lib/types";
import styles from "./experience-ready.module.css";

export function ExperienceReady({ companyName, domain, href, preview, onEdit, onPersonalize, personalizationLabel, personalizationRef, onAnalytics, publicationNote }: {
  companyName: string;
  domain: string;
  href: string;
  preview: ReactNode;
  onEdit: () => void;
  onPersonalize?: () => void;
  personalizationLabel: string;
  personalizationRef?: RefObject<HTMLButtonElement | null>;
  onAnalytics: () => void;
  publicationNote: string;
}) {
  return (
    <section className={styles.ready} aria-labelledby="experience-ready-title">
      <div className={styles.copy}>
        <h1 id="experience-ready-title">Your {companyName} experience is ready.</h1>
        <p>Open your page to explore the full experience. Then see how it changes for three target accounts.</p>
        <a className="buttonPrimary" href={href} target="_blank" rel="noopener">View experience<ExternalLink size={18} /></a>
        <div className={styles.actions}>
          {onPersonalize && <button ref={personalizationRef} className="buttonSecondary" onClick={onPersonalize} type="button"><Users size={17} />{personalizationLabel}</button>}
          <button className={styles.textButton} onClick={onEdit} type="button"><PencilLine size={16} />Edit brief</button>
        </div>
      </div>
      <a className={styles.thumbnail} href={href} target="_blank" rel="noopener" aria-label={`Open ${companyName} experience in a new tab`}>
        <div className={styles.thumbnailContent} inert aria-hidden="true">{preview}</div>
        <span className={styles.thumbnailCaption}><span>{domain}</span><ExternalLink size={16} /></span>
      </a>
      <footer className={styles.footer}>
        <span>{publicationNote}</span>
        <button className={styles.textButton} onClick={onAnalytics} type="button"><Gauge size={16} />View engagement</button>
      </footer>
    </section>
  );
}

/** A local draft until the visitor explicitly rebuilds. Cancel never patches the session. */
export function EditBriefForm({ answers, onCancel, onRebuild }: {
  answers: SessionAnswers;
  onCancel: () => void;
  onRebuild: (patch: SessionAnswers) => Promise<boolean>;
}) {
  const [offer, setOffer] = useState(answers.promotedOffer ?? "");
  const [audience, setAudience] = useState(answers.audience === "Other" ? answers.customAudience ?? "" : answers.audience ?? "");
  const [objective, setObjective] = useState(answers.objective ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const changed = offer.trim() !== (answers.promotedOffer ?? "") || audience.trim() !== (answers.audience === "Other" ? answers.customAudience ?? "" : answers.audience ?? "") || objective.trim() !== (answers.objective ?? "");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setFailed(false);
    try {
      const saved = await onRebuild({ promotedOffer: offer.trim(), audience: "Other", customAudience: audience.trim(), objective: objective.trim() });
      setFailed(!saved);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.editor}>
      <button className={styles.textButton} onClick={onCancel} disabled={busy} type="button"><ArrowLeft size={17} />Back to your experience</button>
      <h1 ref={heading} tabIndex={-1}>Edit your brief</h1>
      <p>Your existing page stays available. Changes apply only when you rebuild.</p>
      <form onSubmit={submit}>
        <label>What are you taking to market?<textarea required minLength={2} maxLength={160} value={offer} disabled={busy} onChange={e => setOffer(e.target.value)} /></label>
        <label>Who should this reach?<input required minLength={2} maxLength={160} value={audience} disabled={busy} onChange={e => setAudience(e.target.value)} /></label>
        <label>What should this experience achieve?<input required minLength={2} maxLength={120} value={objective} disabled={busy} onChange={e => setObjective(e.target.value)} /></label>
        {failed && <p role="alert">Your changes could not be saved. Your draft is still here. Try rebuilding again.</p>}
        <div className={styles.actions}>
          <button className="buttonPrimary" type="submit" disabled={busy || !changed || !offer.trim() || !audience.trim() || !objective.trim()}>{busy ? "Starting your rebuild…" : "Rebuild experience"}</button>
          <button className={styles.textButton} type="button" onClick={onCancel} disabled={busy}>Cancel changes</button>
        </div>
      </form>
    </section>
  );
}
