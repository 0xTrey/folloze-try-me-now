"use client";

import { ArrowRight, Check, ExternalLink, LoaderCircle } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import type {
  PersonalizationTargetInput,
  PublicPersonalizationRequest
} from "@/lib/personalization-request-store";

import styles from "./three-account-conversion.module.css";

type SubmissionStatus =
  | "idle"
  | "saving_email"
  | "saving_targets"
  | "polling"
  | "error";

export type ThreeAccountConversionProps = {
  email: string;
  request?: PublicPersonalizationRequest;
  status: SubmissionStatus;
  error?: string;
  onEmailChange: (value: string) => void;
  onSubmitEmail: () => void | Promise<void>;
  onSubmitTargets: (targets: PersonalizationTargetInput[]) => void | Promise<void>;
  targetDraft?: PersonalizationTargetInput[];
  onTargetDraftChange?: (targets: PersonalizationTargetInput[]) => void;
  onDone?: () => void;
  onAutoSelectTargets?: () => void | Promise<void>;
  onOpenLink?: (position: number) => void;
};

const emptyTargets = (): PersonalizationTargetInput[] => [
  { domain: "" },
  { domain: "" },
  { domain: "" }
];

const targetStatusLabel: Record<
  PublicPersonalizationRequest["targets"][number]["status"],
  string
> = {
  pending: "Queued",
  researching: "Building",
  ready: "Ready",
  needs_review: "Needs review",
  failed: "Could not finish"
};

function isTerminal(status: PublicPersonalizationRequest["status"]): boolean {
  return ["completed", "partial", "needs_review", "failed"].includes(status);
}

function deliveryCopy(request: PublicPersonalizationRequest): string {
  switch (request.delivery.status) {
    case "accepted":
      return `AgentMail accepted the email to ${request.emailMasked} for delivery.`;
    case "delivered":
      return `The email was delivered to ${request.emailMasked}.`;
    case "bounced":
      return `The email to ${request.emailMasked} bounced. The verified links remain available here.`;
    case "failed":
      return `The links are ready here, but the email to ${request.emailMasked} could not be sent.`;
    case "uncertain":
      return `AgentMail has not confirmed the email outcome. The verified links remain available here.`;
    case "not_configured":
      return "Email delivery is not connected in this environment. The verified links remain available here.";
    case "pending":
    case "sending":
      return `Preparing one email with the verified links for ${request.emailMasked}.`;
  }
}

export function ThreeAccountConversion({
  email,
  request,
  status,
  error,
  onEmailChange,
  onSubmitEmail,
  onSubmitTargets,
  targetDraft,
  onTargetDraftChange,
  onDone,
  onAutoSelectTargets,
  onOpenLink
}: ThreeAccountConversionProps) {
  const [localTargets, setLocalTargets] = useState<PersonalizationTargetInput[]>(emptyTargets);
  const targets = targetDraft ?? localTargets;
  const [autoSelecting, setAutoSelecting] = useState(false);
  const requestIsWorking = Boolean(
    request && ["queued", "generating"].includes(request.status)
  );
  const requestIsTerminal = Boolean(request && isTerminal(request.status));
  // Background status reads must not lock the visitor out of account entry.
  const busy = ["saving_email", "saving_targets"].includes(status);
  const autoBusy = autoSelecting || busy;

  const readyTargets = useMemo(
    () => request?.targets.filter((target) => target.status === "ready" && target.link) ?? [],
    [request]
  );

  if (requestIsWorking) {
    const emailReady = request?.delivery.status !== "not_configured";
    return (
      <div className={`${styles.panel} ${styles.confirmationPanel}`}>
        <h2 id="personalization-dialog-title">We&apos;re building all three versions for you.</h2>
        <p className={styles.confirmation} role="status" aria-live="polite">
          {emailReady
            ? "Check your email in about 5 minutes to see what they look like."
            : "Your email delivery is not connected in this environment. You can return to your experience while the build continues."}
        </p>
        <p className={styles.confirmationNote}>{emailReady ? "You don't need to keep this page open." : "Return to your experience to check the finished versions here."}</p>
        {onDone && <button className={styles.doneButton} type="button" onClick={onDone}>Back to your experience</button>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    );
  }

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    await onSubmitEmail();
  };

  const submitTargets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || targets.some((target) => !target.domain.trim())) return;
    await onSubmitTargets(
      targets.map(({ domain, role }) => ({
        domain: domain.trim(),
        ...(role?.trim() ? { role: role.trim() } : {})
      }))
    );
  };

  const autoSelectTargets = async () => {
    if (!onAutoSelectTargets || autoBusy) return;
    setAutoSelecting(true);
    try {
      await onAutoSelectTargets();
    } finally {
      setAutoSelecting(false);
    }
  };

  const updateTarget = (
    index: number,
    field: "domain" | "role",
    value: string
  ) => {
    const nextTargets = targets.map((target, position) =>
      position === index ? { ...target, [field]: value } : target
    );
    if (targetDraft === undefined) setLocalTargets(nextTargets);
    onTargetDraftChange?.(nextTargets);
  };

  if (requestIsTerminal) {
    const headline = request?.status === "completed"
        ? "Your three account versions are ready."
        : readyTargets.length
          ? `${readyTargets.length} account ${readyTargets.length === 1 ? "version is" : "versions are"} ready.`
          : "These account versions need another pass.";
    return (
      <div className={styles.panel}>
        <h2 id="personalization-dialog-title">{headline}</h2>
        <p className={styles.intro}>
          {readyTargets.length
              ? readyTargets.length === 3
                ? "Open your finished account versions below."
                : "Open the finished versions below. The remaining versions couldn't be completed."
              : "We couldn't finish these account versions. Your original experience is still available."}
        </p>

        <div className={styles.targetProgress} aria-live="polite">
          {request?.targets.map((target) => (
            <article
              className={styles.targetProgressRow}
              data-state={target.status}
              key={target.id}
            >
              <span className={styles.statusIcon} aria-hidden="true">
                {target.status === "ready" ? (
                  <Check size={15} />
                ) : target.status === "researching" ? (
                  <LoaderCircle className={styles.spinner} size={16} />
                ) : (
                  target.position
                )}
              </span>
              <span className={styles.targetIdentity}>
                <strong>{target.domain}</strong>
                <small>{target.role || "Account-level version"}</small>
              </span>
              <span className={styles.targetStatus}>{targetStatusLabel[target.status]}</span>
              {target.status === "ready" && target.link && (
                <a
                  className={styles.openLink}
                  href={target.link}
                  target="_blank"
                  rel="noopener"
                  onClick={() => onOpenLink?.(target.position)}
                >
                  Open <ExternalLink size={14} />
                </a>
              )}
            </article>
          ))}
        </div>

        {requestIsTerminal && request && (
          <div className={styles.workingNote} role="status">
            {["pending", "sending"].includes(request.delivery.status) ? (
              <LoaderCircle className={styles.spinner} size={17} />
            ) : ["accepted", "delivered"].includes(request.delivery.status) ? (
              <Check size={17} />
            ) : null}
            {deliveryCopy(request)}
          </div>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {onDone && <button className={styles.doneButton} type="button" onClick={onDone}>Back to your experience</button>}
      </div>
    );
  }

  if (!request) {
    return (
      <div className={styles.panel}>
        <h2 id="personalization-dialog-title">
          Build three account versions from this experience.
        </h2>
        <p className={styles.intro}>
          Enter your work email. Next, add three target companies or let us choose representative examples. We will create account-specific messaging, proof, imagery, resources, and next steps.
        </p>
        <div className={styles.valueGrid} aria-label="What will be created">
          <span><Check size={15} />One focused version per account</span>
          <span><Check size={15} />Only final-gated links are shown</span>
          <span><Check size={15} />Your standard experience stays intact</span>
        </div>
        <form className={styles.form} onSubmit={submitEmail}>
          <label htmlFor="personalization-email">Work email</label>
          <input
            id="personalization-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="you@company.com"
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "personalization-form-error" : undefined}
          />
          {error && <p id="personalization-form-error" className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} type="submit" disabled={busy}>
            {status === "saving_email" ? "Saving your request" : "Continue"}
            {status === "saving_email" ? (
              <LoaderCircle className={styles.spinner} size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
          </button>
        </form>
        <p className={styles.testBoundary}>
          We use your work email only to send the final links you requested. No newsletter signup, and nothing is published to Folloze.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h2 id="personalization-dialog-title">Choose your accounts, or let us.</h2>
      <p className={styles.intro}>
        Enter three public company domains. If you would rather skip this step, we can select three representative companies for the demo.
      </p>
      <div className={styles.stepStatus} aria-label="Step 2 of 2">
        <span>Work email saved as {request?.emailMasked || "your business email"}</span>
        <strong>Choose one account path</strong>
      </div>
      {onAutoSelectTargets && (
        <div className={styles.autoChoice}>
          <div>
            <strong>Option 1: Pick 3 accounts for me</strong>
            <span id="representative-account-explanation">
              We will choose three public companies and build all three versions now. These are illustrative examples, not account recommendations.
            </span>
            {autoSelecting && (
              <span className={styles.choiceStatus} role="status" aria-live="polite">
                Choosing three representative accounts. This usually takes a few seconds.
              </span>
            )}
            {error && !autoSelecting && (
              <span className={styles.choiceStatus} role="status" aria-live="polite">
                We could not choose accounts this time. Try again, or enter your own below.
              </span>
            )}
          </div>
          <button
            className={styles.autoButton}
            type="button"
            onClick={() => void autoSelectTargets()}
            disabled={autoBusy}
            aria-busy={autoSelecting}
            aria-describedby="representative-account-explanation"
          >
            {autoSelecting ? "Choosing accounts" : error ? "Retry account selection" : "Pick 3 accounts for me"}
            {autoSelecting ? <LoaderCircle className={styles.spinner} size={17} /> : <ArrowRight size={17} />}
          </button>
        </div>
      )}
      {onAutoSelectTargets && (
        <div className={styles.choiceDivider}><span>Or choose your own</span></div>
      )}
      <form className={styles.form} onSubmit={submitTargets}>
        {onAutoSelectTargets && (
          <p className={styles.manualChoice}>
            <strong>Option 2: Enter my own accounts</strong>
            <span>Provide three public company domains. Buyer roles are optional.</span>
          </p>
        )}
        <div className={styles.targetFields}>
          {targets.map((target, index) => (
            <fieldset key={index}>
              <legend>Account {index + 1}</legend>
              <label htmlFor={`personalization-domain-${index}`}>Company domain</label>
              <input
                id={`personalization-domain-${index}`}
                inputMode="url"
                value={target.domain}
                onChange={(event) => updateTarget(index, "domain", event.target.value)}
                disabled={autoBusy}
                placeholder="company.com"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "personalization-form-error" : undefined}
              />
              <label htmlFor={`personalization-role-${index}`}>
                Buyer role <span>Optional</span>
              </label>
              <input
                id={`personalization-role-${index}`}
                value={target.role || ""}
                onChange={(event) => updateTarget(index, "role", event.target.value)}
                disabled={autoBusy}
                placeholder="VP of Marketing"
                maxLength={120}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "personalization-form-error" : undefined}
              />
            </fieldset>
          ))}
        </div>
        {error && <p id="personalization-form-error" className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit" disabled={autoBusy}>
            {status === "saving_targets" ? "Starting all three" : "Build 3 account versions"}
            {status === "saving_targets" ? (
              <LoaderCircle className={styles.spinner} size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
          </button>
        </div>
      </form>
      <p className={styles.testBoundary}>
        The three builds run in parallel. Links appear here only after each version passes its checks.
      </p>
    </div>
  );
}
