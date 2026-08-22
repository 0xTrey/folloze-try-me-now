import { isMaterialBriefEligible } from "@/lib/orchestration/research-plan";
import type {
  PublicTryMeSession,
  SessionAnswers,
  StageKey,
  UseCase
} from "@/lib/types";

/** Distinct prospect-facing lifecycle phases for reveal, claim, and publication honesty. */
export type PreviewLifecyclePhase =
  | "intake"
  | "enriching"
  | "preview_ready"
  | "saved_locally"
  | "claimed"
  | "published";

export type PreviewLifecycleEvent = {
  action: string;
};

export type StageReceiptRow = {
  key: StageKey;
  label: string;
  detail: string;
  status: "pending" | "running" | "complete" | "fallback" | "failed";
  retryable: boolean;
};

const EXPLORE_ACTIONS = new Set([
  "section_view",
  "cta_click",
  "topic_select",
  "signature_select",
  "question_select",
  "fullscreen_change",
  "preview_scrolled"
]);

const STAGE_LABELS: Record<StageKey, string> = {
  brand: "Brand evidence",
  audience: "Audience mapping",
  story: "Experience compose"
};

/**
 * Material brief eligibility — not domain-only. Matches the Wave 1 research-plan gate.
 */
export function isSessionGenerationEligible(
  session: Pick<PublicTryMeSession, "useCase" | "answers"> | undefined
): boolean {
  if (!session) return false;
  return isMaterialBriefEligible(session.useCase, session.answers as SessionAnswers);
}

/**
 * Preview may appear only after the material brief is generation-eligible and an artifact exists.
 */
export function canRevealPreview(
  session: Pick<PublicTryMeSession, "useCase" | "answers" | "experience" | "status"> | undefined
): boolean {
  if (!session?.experience) return false;
  if (!isSessionGenerationEligible(session)) return false;
  return [
    "generating",
    "preview_provisional",
    "preview_ready_unclaimed",
    "claim_pending",
    "claimed",
    "claim_failed"
  ].includes(session.status);
}

export function isProvisionalExperience(
  session: Pick<PublicTryMeSession, "experience" | "status"> | undefined
): boolean {
  if (!session?.experience) return false;
  return (
    session.experience.readiness === "provisional" ||
    session.status === "preview_provisional"
  );
}

export function isEnrichingPreview(
  session: Pick<PublicTryMeSession, "experience" | "status" | "stages"> | undefined
): boolean {
  if (!session?.experience) return false;
  if (isProvisionalExperience(session)) return true;
  return Object.values(session.stages).some(
    (stage) => stage.status === "running"
  );
}

/**
 * Maps session + claim publish status into honest lifecycle phases.
 * Folloze publication is never inferred from an app-hosted claim.
 */
export function previewLifecyclePhase(
  session: Pick<
    PublicTryMeSession,
    "experience" | "status" | "stages" | "claim" | "useCase" | "answers"
  > | undefined
): PreviewLifecyclePhase {
  if (!session || !canRevealPreview(session)) return "intake";
  if (session.claim?.publishStatus === "published") return "published";
  if (session.status === "claimed") {
    return session.claim?.publishStatus === "preview-only" ||
      !session.claim?.publishStatus ||
      session.claim.publishStatus === "not-attempted"
      ? "saved_locally"
      : "claimed";
  }
  if (session.status === "claim_pending") return "claimed";
  if (isEnrichingPreview(session)) return "enriching";
  return "preview_ready";
}

export function previewLifecycleCopy(phase: PreviewLifecyclePhase): {
  kicker: string;
  statusLabel: string;
  publicationNote: string;
} {
  switch (phase) {
    case "intake":
      return {
        kicker: "Guided brief",
        statusLabel: "Collecting the material brief",
        publicationNote: "Nothing is published yet"
      };
    case "enriching":
      return {
        kicker: "Preview ready · enriching",
        statusLabel: "Interactive preview · enrichment continuing",
        publicationNote: "App-hosted preview only · not published to Folloze"
      };
    case "preview_ready":
      return {
        kicker: "Preview ready",
        statusLabel: "Ready to explore",
        publicationNote: "Private app-hosted preview · not published to Folloze"
      };
    case "saved_locally":
      return {
        kicker: "Saved locally",
        statusLabel: "Saved app-hosted experience",
        publicationNote: "Saved on Folloze Try Me Now · not published to Folloze"
      };
    case "claimed":
      return {
        kicker: "Claimed",
        statusLabel: "Claim recorded",
        publicationNote: "App-hosted claim · Folloze board publish remains disabled"
      };
    case "published":
      return {
        kicker: "Published",
        statusLabel: "Published",
        publicationNote: "Publication status reported by the claim ledger"
      };
  }
}

/**
 * Email/save only after value is visible and the visitor meaningfully explored the preview.
 */
export function hasMeaningfulPreviewEngagement(
  events: readonly PreviewLifecycleEvent[],
  options: { previewOpened?: boolean } = {}
): boolean {
  const opened =
    options.previewOpened === true ||
    events.some((event) => event.action === "preview_viewed");
  if (!opened) return false;
  return events.some((event) => EXPLORE_ACTIONS.has(event.action));
}

export function canOfferClaimModal(
  session: Pick<PublicTryMeSession, "experience" | "status"> | undefined,
  engagement: { events: readonly PreviewLifecycleEvent[]; previewOpened?: boolean }
): boolean {
  if (!session?.experience || session.experience.readiness === "provisional") return false;
  if (!["preview_ready_unclaimed", "claim_failed"].includes(session.status)) return false;
  return hasMeaningfulPreviewEngagement(engagement.events, {
    previewOpened: engagement.previewOpened
  });
}

/** Stage rows backed only by public stage receipts — no invented percentages. */
export function receiptBackedStageProgress(
  session: Pick<PublicTryMeSession, "stages">
): StageReceiptRow[] {
  return (Object.keys(STAGE_LABELS) as StageKey[]).map((key) => {
    const stage = session.stages[key];
    const status = stage?.status ?? "pending";
    return {
      key,
      label: STAGE_LABELS[key],
      detail:
        stage?.detail ||
        stage?.artifact ||
        (status === "running"
          ? "Worker receipt: in progress"
          : status === "complete"
            ? "Worker receipt: complete"
            : status === "fallback"
              ? "Worker receipt: fallback artifact kept"
              : status === "failed"
                ? stage?.errorCode
                  ? `Worker receipt: failed (${stage.errorCode})`
                  : "Worker receipt: failed"
                : "Waiting for a worker receipt"),
      status,
      retryable: status === "failed"
    };
  });
}

export function retryableFailedStages(
  session: Pick<PublicTryMeSession, "stages">
): StageKey[] {
  return receiptBackedStageProgress(session)
    .filter((row) => row.retryable)
    .map((row) => row.key);
}

/** Privacy-safe duration buckets for unified product analytics. */
export function analyticsDurationBucket(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 5_000) {
    return "lt_5s";
  }
  if (durationMs < 15_000) return "lt_15s";
  if (durationMs < 30_000) return "lt_30s";
  if (durationMs < 60_000) return "lt_60s";
  return "gt_60s";
}

export function analyticsQualityGate(
  session: Pick<PublicTryMeSession, "experience" | "stages">
): string {
  if (session.experience?.readiness === "provisional") return "provisional";
  if (Object.values(session.stages).some((stage) => stage.status === "fallback")) {
    return "fallback";
  }
  return "pass";
}

export function workerNameForStage(stage: StageKey): "brand" | "audience" | "render" {
  if (stage === "brand") return "brand";
  if (stage === "audience") return "audience";
  return "render";
}

export function answersPatchForStageRetry(
  stage: StageKey,
  answers: SessionAnswers
): Partial<SessionAnswers> {
  if (stage === "brand") {
    return {};
  }
  if (stage === "audience") {
    return answers.audience ? { audience: answers.audience } : {};
  }
  return answers.objective ? { objective: answers.objective } : {};
}

export function useCaseAllowsEarlyStreamingPreview(useCase: UseCase): boolean {
  return useCase === "campaign";
}
