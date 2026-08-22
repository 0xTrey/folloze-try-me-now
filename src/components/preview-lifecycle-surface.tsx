"use client";

import { Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";

import {
  previewLifecycleCopy,
  previewLifecyclePhase,
  receiptBackedStageProgress,
  type PreviewLifecyclePhase,
  type StageReceiptRow
} from "@/lib/preview-lifecycle";
import type { PublicTryMeSession, StageKey } from "@/lib/types";

import styles from "./preview-lifecycle-surface.module.css";

export type PreviewActivityItem = {
  id: string;
  label: string;
  detail: string;
};

export interface PreviewEvidenceActivitySurfaceProps {
  session: PublicTryMeSession;
  activity: PreviewActivityItem[];
  evidence?: Array<{ id: string; label: string; text: string }>;
  onRetryStage?: (stage: StageKey) => void;
  personalizationSlot?: ReactNode;
}

function statusGlyph(status: StageReceiptRow["status"]) {
  if (status === "complete" || status === "fallback") return <Check size={16} />;
  if (status === "failed") return <X size={16} />;
  if (status === "running") return <LoaderCircle className={styles.spin} size={16} />;
  return <i className={styles.pendingDot} />;
}

function phaseClass(phase: PreviewLifecyclePhase): string {
  return styles[`phase_${phase}`] ?? "";
}

/**
 * Larger post-reveal evidence and activity surface. Replaces dense overview rails
 * with receipt-backed stage progress and readable account-depth findings.
 */
export function PreviewEvidenceActivitySurface({
  session,
  activity,
  evidence = [],
  onRetryStage,
  personalizationSlot
}: PreviewEvidenceActivitySurfaceProps) {
  const phase = previewLifecyclePhase(session);
  const copy = previewLifecycleCopy(phase);
  const receipts = receiptBackedStageProgress(session);
  const hubName =
    session.useCase === "abm"
      ? session.targetBrand?.companyName || session.answers.targetDomain || "the account"
      : session.brand?.companyName || session.companyDomain;

  return (
    <section
      className={`${styles.surface} ${phaseClass(phase)}`}
      aria-labelledby="preview-lifecycle-title"
      data-lifecycle-phase={phase}
      data-publication="app-hosted-only"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>{copy.kicker}</span>
          <h2 id="preview-lifecycle-title">Evidence and activity</h2>
          <p>{copy.publicationNote}</p>
        </div>
        <span className={styles.phasePill} data-phase={phase}>
          {copy.statusLabel}
        </span>
      </header>

      <div className={styles.grid}>
        <section className={styles.receiptPanel} aria-label="Receipt-backed build progress">
          <h3>Build receipts</h3>
          <p className={styles.panelLead}>
            Progress comes only from worker stage receipts. No estimated percentages.
          </p>
          <ol className={styles.receiptList}>
            {receipts.map((row) => (
              <li key={row.key} data-stage={row.key} data-status={row.status}>
                <span className={styles.glyph} aria-hidden="true">
                  {statusGlyph(row.status)}
                </span>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.detail}</span>
                </div>
                {row.retryable && onRetryStage ? (
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={() => onRetryStage(row.key)}
                  >
                    <RefreshCw size={14} />
                    Retry {row.label}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.evidencePanel} aria-label={`Evidence about ${hubName}`}>
          <h3>Account depth</h3>
          {evidence.length > 0 ? (
            <ul className={styles.evidenceList}>
              {evidence.map((item) => (
                <li key={item.id}>
                  <small>{item.label}</small>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              Explore the preview. Verified findings stay here when account evidence is available.
            </p>
          )}
        </section>

        <section className={styles.activityPanel} aria-label="Preview activity">
          <h3>Your exploration</h3>
          {activity.length > 0 ? (
            <ul className={styles.activityList}>
              {activity.slice(-6).reverse().map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              Scroll, open a section, or try a next step to unlock save.
            </p>
          )}
        </section>
      </div>

      {personalizationSlot ? (
        <div className={styles.personalizationSeam} data-personalization-seam="true">
          {personalizationSlot}
        </div>
      ) : null}
    </section>
  );
}
