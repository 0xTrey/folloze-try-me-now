"use client";

import Image from "next/image";
import { Check, LoaderCircle, Minus, RefreshCw, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";

import { buildPhaseRows } from "@/lib/preview-lifecycle";
import type { BuildPhaseStatus, PublicTryMeSession } from "@/lib/types";

import styles from "./final-build-shell.module.css";

export type FinalBuildShellProps = {
  session: PublicTryMeSession;
  brandName: string;
  audience: string;
  brandLogoUrl?: string;
  brandColors?: readonly string[];
  onRetry?: () => void;
};

/**
 * Written next to each row so active, complete, and queued never depend on
 * color alone.
 */
const ROW_STATE_LABEL: Record<BuildPhaseStatus, string> = {
  queued: "Queued",
  active: "Working",
  complete: "Done",
  failed: "Stopped"
};

function RowGlyph({ status }: { status: BuildPhaseStatus }) {
  if (status === "complete") return <Check size={13} aria-hidden="true" />;
  if (status === "failed") return <TriangleAlert size={13} aria-hidden="true" />;
  if (status === "active") return <LoaderCircle className="spin" size={13} aria-hidden="true" />;
  return <Minus size={13} aria-hidden="true" />;
}

/**
 * The only thing a visitor sees between the brief and the finished experience.
 *
 * Every visible status is copied from a `BuildPhaseReceipt`; the shell never
 * derives a percentage, an elapsed figure, or an estimated finish time, and it
 * never renders a page-shaped placeholder that would imply an artifact exists
 * before one has been persisted and read back.
 */
export function FinalBuildShell({
  session,
  brandName,
  audience,
  brandLogoUrl,
  brandColors = [],
  onRetry
}: FinalBuildShellProps) {
  const progress = session.buildProgress;
  const rows = buildPhaseRows(session);
  const failure = progress?.failure;
  const isFailed = Boolean(failure) || progress?.phase === "failed";
  const isSlow = !isFailed && progress?.slow === true;
  const activeRow = rows.find((row) => row.status === "active");
  const sceneStyle = {
    "--build-accent": brandColors[0] || "#0077ff",
    "--build-accent-two": brandColors[1] || "#17b890"
  } as CSSProperties;

  return (
    <section
      className={styles.buildShell}
      style={sceneStyle}
      data-build-shell={isFailed ? "failed" : isSlow ? "slow" : "working"}
      aria-labelledby="final-build-title"
      aria-busy={isFailed ? undefined : true}
    >
      <div className={styles.buildShellInner}>
        {brandLogoUrl && (
          <span className={styles.brandMark}>
            <Image src={brandLogoUrl} alt={`${brandName} logo`} width={156} height={52} unoptimized />
          </span>
        )}
        <h1 id="final-build-title">
          {isFailed
            ? "The build stopped before it finished."
            : `Building a buyer experience for ${audience}.`}
        </h1>

        {isFailed ? (
          <div className={styles.failureBlock} role="alert" data-build-failure="true">
            <p>{failure?.nextAction ?? "Adjust one answer in the brief and start the build again."}</p>
            <div className={styles.failureActions}>
              {failure?.retryable !== false && onRetry && (
                <button type="button" className={styles.retryButton} onClick={onRetry}>
                  <RefreshCw size={15} aria-hidden="true" />Try the build again
                </button>
              )}
              <span>Support reference: {session.supportRef}</span>
            </div>
          </div>
        ) : (
          <p className={styles.buildBody}>
            {brandName}&apos;s brand, offer, audience, and objective are being turned into one finished
            experience. Nothing is shown until it passes its checks.
          </p>
        )}

        {isSlow && (
          <div className={styles.slowBlock} role="status" data-build-slow="true">
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
            <span>
              <strong>This one is taking longer than usual.</strong>
              {activeRow
                ? `Your brief is safe. ${activeRow.detail}`
                : "Your brief is safe and the build is still running."}
            </span>
          </div>
        )}

        <ol className={styles.buildRows} aria-label="Build progress">
          {rows.map((row) => (
            <li key={row.phase} data-phase={row.phase} data-status={row.status}>
              <span className={styles.rowGlyph} aria-hidden="true"><RowGlyph status={row.status} /></span>
              <div>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
                {row.evidenceNote && <small>{row.evidenceNote}</small>}
              </div>
              <span className={styles.rowState}>{ROW_STATE_LABEL[row.status]}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
