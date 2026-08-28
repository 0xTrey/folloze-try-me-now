import { isMaterialBriefEligible } from "@/lib/orchestration/research-plan";
import type {
  BuildPhase,
  BuildPhaseReceipt,
  PublicTryMeSession,
  SessionAnswers,
  StageKey,
  UseCase
} from "@/lib/types";

/**
 * Distinct prospect-facing lifecycle phases for reveal, claim, and publication
 * honesty. `building` replaced the former `enriching` phase: there is no
 * enrichment of a visible artifact any more, because nothing is visible until
 * one final artifact passes its gates.
 */
export type PreviewLifecyclePhase =
  | "intake"
  | "building"
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
 * Material brief eligibility, not domain-only. Matches the Wave 1 research-plan gate.
 */
export function isSessionGenerationEligible(
  session: Pick<PublicTryMeSession, "useCase" | "answers"> | undefined
): boolean {
  if (!session) return false;
  return isMaterialBriefEligible(session.useCase, session.answers as SessionAnswers);
}

/**
 * The single reveal gate.
 *
 * An artifact object is not enough. The visitor may only receive HTML once a
 * `final` artifact has a matching receipt proving it passed the structural and
 * truth gates, was persisted, and was read back from the store. Anything else
 * including a `final` artifact whose receipt belongs to an earlier
 * revision, is still an internal draft.
 */
export function canRevealFinalExperience(
  session:
    | Pick<PublicTryMeSession, "useCase" | "answers" | "experience" | "status" | "finalArtifact">
    | undefined
): boolean {
  if (!session?.experience || !session.finalArtifact) return false;
  if (session.experience.readiness !== "final") return false;
  if (session.finalArtifact.readiness !== "final") return false;
  if (session.finalArtifact.artifactRevision !== session.experience.artifactRevision) {
    return false;
  }
  if (
    session.finalArtifact.structuralGate !== "passed" ||
    session.finalArtifact.truthGate !== "passed"
  ) {
    return false;
  }
  if (!isSessionGenerationEligible(session)) return false;
  return [
    "preview_ready_unclaimed",
    "claim_pending",
    "claimed",
    "claim_failed"
  ].includes(session.status);
}

/**
 * Retained under its former name so existing call sites keep compiling, but it
 * now means exactly one thing: a persisted, read-back final artifact.
 */
export const canRevealPreview = canRevealFinalExperience;

/** True while the build is working and the visitor has no artifact yet. */
export function isBuildInProgress(
  session:
    | Pick<
        PublicTryMeSession,
        "useCase" | "answers" | "experience" | "status" | "stages" | "finalArtifact" | "buildProgress"
      >
    | undefined
): boolean {
  if (!session) return false;
  if (canRevealFinalExperience(session)) return false;
  if (session.buildProgress) {
    return session.buildProgress.phase !== "failed";
  }
  return (
    session.status === "generating" ||
    Object.values(session.stages).some((stage) => stage.status === "running")
  );
}

/**
 * Maps session + claim publish status into honest lifecycle phases.
 * Folloze publication is never inferred from an app-hosted claim.
 */
export function previewLifecyclePhase(
  session: Pick<
    PublicTryMeSession,
    | "experience"
    | "status"
    | "stages"
    | "claim"
    | "useCase"
    | "answers"
    | "finalArtifact"
    | "buildProgress"
  > | undefined
): PreviewLifecyclePhase {
  if (!session) return "intake";
  if (!canRevealFinalExperience(session)) {
    return isBuildInProgress(session) ? "building" : "intake";
  }
  if (session.claim?.publishStatus === "published") return "published";
  if (session.status === "claimed") {
    return session.claim?.publishStatus === "preview-only" ||
      !session.claim?.publishStatus ||
      session.claim.publishStatus === "not-attempted"
      ? "saved_locally"
      : "claimed";
  }
  if (session.status === "claim_pending") return "claimed";
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
    case "building":
      return {
        kicker: "Building",
        statusLabel: "Building the finished experience",
        publicationNote: "Nothing is shared until the finished experience passes its checks"
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
  session:
    | Pick<PublicTryMeSession, "experience" | "status" | "finalArtifact" | "useCase" | "answers">
    | undefined,
  engagement: { events: readonly PreviewLifecycleEvent[]; previewOpened?: boolean }
): boolean {
  if (!session) return false;
  if (!["preview_ready_unclaimed", "claim_failed"].includes(session.status)) return false;
  // Saving is offered against the same artifact the visitor can see, so it
  // reuses the reveal gate rather than a second, looser readiness check.
  if (!canRevealFinalExperience({ ...session, status: "preview_ready_unclaimed" })) return false;
  return hasMeaningfulPreviewEngagement(engagement.events, {
    previewOpened: engagement.previewOpened
  });
}

/**
 * Customer-visible language for each build phase. Active verbs, no percentages,
 * and no internal recipe, strategy, or evidence labels.
 */
export const BUILD_PHASE_COPY: Record<
  Exclude<BuildPhase, "ready" | "failed">,
  { label: string; detail: string }
> = {
  queued: {
    label: "Preparing the build",
    detail: "Preparing the build from your brief"
  },
  researching: {
    label: "Reading the brand, offer, and buyer context",
    detail: "Reading the public brand, offer, and buyer context"
  },
  planning: {
    label: "Choosing the strongest story for this buyer",
    detail: "Choosing the strongest story for this buyer"
  },
  writing: {
    label: "Writing the buyer journey",
    detail: "Writing each step of the buyer journey"
  },
  checking: {
    label: "Checking the claims, flow, and brand treatment",
    detail: "Checking the claims, flow, and brand treatment"
  },
  finalizing: {
    label: "Finalizing the experience",
    detail: "Finalizing, saving, and verifying the experience"
  }
};

export const BUILD_PHASE_ORDER: ReadonlyArray<Exclude<BuildPhase, "ready" | "failed">> = [
  "queued",
  "researching",
  "planning",
  "writing",
  "checking",
  "finalizing"
];

/**
 * Rows for the build shell. Statuses come from real receipts, so a queued
 * phase reads as queued rather than as partial progress toward a percentage.
 */
export function buildPhaseRows(
  session: Pick<PublicTryMeSession, "buildProgress"> | undefined
): Array<BuildPhaseReceipt & { label: string }> {
  const receipts = new Map(
    (session?.buildProgress?.receipts ?? []).map((receipt) => [receipt.phase, receipt])
  );
  return BUILD_PHASE_ORDER.map((phase) => {
    const receipt = receipts.get(phase);
    return {
      label: BUILD_PHASE_COPY[phase].label,
      phase,
      status: receipt?.status ?? "queued",
      detail: receipt?.detail ?? BUILD_PHASE_COPY[phase].detail,
      ...(receipt?.startedAt ? { startedAt: receipt.startedAt } : {}),
      ...(receipt?.completedAt ? { completedAt: receipt.completedAt } : {}),
      ...(receipt?.evidenceNote ? { evidenceNote: receipt.evidenceNote } : {})
    };
  });
}

/** Stage rows backed only by public stage receipts, with no invented percentages. */
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
  session: Pick<PublicTryMeSession, "experience" | "stages" | "finalArtifact">
): string {
  if (session.experience && !session.finalArtifact) return "unreceipted";
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

/**
 * Retained for the campaign-specific research lane ordering. It no longer
 * authorizes an early visible artifact. Nothing is visible before `ready`.
 */
export function useCaseAllowsEarlyResearchFanout(useCase: UseCase): boolean {
  return useCase === "campaign";
}
