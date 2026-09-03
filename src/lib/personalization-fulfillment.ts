import { brandWithSessionLogoDelivery } from "@/lib/image-delivery";
import { targetAccountEvidenceFor } from "@/lib/generation/campaign-context";
import { HttpError, logServerError } from "@/lib/http";
import { runPersonalizationDelivery } from "@/lib/personalization-delivery";
import {
  createSession,
  patchSessionAnswers,
  runPreviewEnrichmentWave
} from "@/lib/orchestrator";
import {
  acquirePersonalizationExecution,
  finishPersonalizationExecution,
  getPersonalizationRequest,
  markPersonalizationTargetsResearching,
  updatePersonalizationTarget,
  type PersonalizationRequest,
  type PersonalizationTarget
} from "@/lib/personalization-request-store";
import { canRevealFinalExperience } from "@/lib/preview-lifecycle";
import { getSession, toPublicSession, updateSession } from "@/lib/session-store";
import type { SessionAnswers, TryMeSession } from "@/lib/types";

type FulfillmentDependencies = {
  getSession: typeof getSession;
  createSession: typeof createSession;
  patchSessionAnswers: typeof patchSessionAnswers;
  runPreviewEnrichmentWave: typeof runPreviewEnrichmentWave;
  updateSession: typeof updateSession;
  updatePersonalizationTarget: typeof updatePersonalizationTarget;
  canRevealSession: (session: TryMeSession) => boolean;
  targetEvidenceCount: (session: TryMeSession) => number;
  deliverPersonalizationRequest?: typeof runPersonalizationDelivery;
};

const defaultDependencies: FulfillmentDependencies = {
  getSession,
  createSession,
  patchSessionAnswers,
  runPreviewEnrichmentWave,
  updateSession,
  updatePersonalizationTarget,
  deliverPersonalizationRequest: runPersonalizationDelivery,
  canRevealSession: (session) => canRevealFinalExperience(toPublicSession(session)),
  targetEvidenceCount: (session) => targetAccountEvidenceFor(session.targetBrand).length
};

type TargetStatusUpdate = Omit<
  Parameters<typeof updatePersonalizationTarget>[0],
  "sessionId" | "attemptId"
>;

type TargetStatusWriter = (
  input: TargetStatusUpdate
) => ReturnType<typeof updatePersonalizationTarget>;

/**
 * Target research and generation run in parallel. Their small status writes
 * share one request record, so they must be serialized to avoid Blob CAS
 * contention without slowing the expensive work.
 */
function targetStatusWriter(
  sessionId: string,
  attemptId: string,
  dependencies: FulfillmentDependencies
): TargetStatusWriter {
  let tail = Promise.resolve<unknown>(undefined);
  return (input) => {
    const scheduled = tail.then(() =>
      dependencies.updatePersonalizationTarget({
        sessionId,
        attemptId,
        ...input
      })
    );
    tail = scheduled.catch(() => undefined);
    return scheduled;
  };
}

function childAnswersFor(
  baseline: TryMeSession,
  target: PersonalizationTarget
): SessionAnswers {
  const audience =
    target.role ||
    baseline.answers.customAudience ||
    baseline.answers.audience ||
    "The buying team evaluating this offer";
  const sourceUrl = baseline.answers.offerSourceUrl || baseline.answers.sourceUrl;
  const sourceTitle = baseline.answers.offerSourceTitle || baseline.answers.sourceTitle;
  const messageBelief =
    baseline.answers.messageBelief ||
    baseline.answers.promotedOffer ||
    baseline.sourceArtifact?.understanding.premise;

  return {
    sellerConfirmed: baseline.answers.sellerConfirmed,
    brandSourceUrl: baseline.answers.brandSourceUrl,
    targetDomain: target.domain,
    targetConfirmed: true,
    audience,
    ...(target.role ? { customAudience: target.role } : {}),
    objective: baseline.answers.objective || "Continue the evaluation",
    promotedOffer: baseline.answers.promotedOffer,
    promotedOfferConfirmed: baseline.answers.promotedOfferConfirmed,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(messageBelief ? { messageBelief } : {}),
    messageAction: baseline.answers.messageAction,
    ctaType: baseline.answers.ctaType,
    ctaStyle: baseline.answers.ctaStyle,
    styleVariant: baseline.answers.styleVariant,
    toneVariant: baseline.answers.toneVariant,
    layoutVariant: baseline.answers.layoutVariant
  };
}

function baselineMatchesRequest(
  baseline: TryMeSession,
  request: PersonalizationRequest,
  dependencies: FulfillmentDependencies
): boolean {
  return Boolean(
    dependencies.canRevealSession(baseline) &&
      baseline.experience?.artifactRevision === request.baselineArtifactRevision &&
      baseline.experience.artifactDigest === request.baselineArtifactDigest &&
      baseline.finalArtifact?.artifactRevision === request.baselineArtifactRevision &&
      baseline.finalArtifact.artifactDigest === request.baselineArtifactDigest
  );
}

async function prepareChildSession(
  baseline: TryMeSession,
  target: PersonalizationTarget,
  requestId: string,
  dependencies: FulfillmentDependencies
): Promise<TryMeSession> {
  let child = await dependencies.getSession(target.generatedSessionId);
  let targetAlreadyPrepared = false;
  if (child) {
    if (
      child.companyDomain !== baseline.companyDomain ||
      child.useCase !== "abm" ||
      (child.answers.targetDomain && child.answers.targetDomain !== target.domain)
    ) {
      throw new HttpError(
        409,
        "personalization_child_conflict",
        "The account version identity could not be verified."
      );
    }
    if (
      child.personalizationLineage &&
      (child.personalizationLineage.requestId !== requestId ||
        child.personalizationLineage.baselineSessionId !== baseline.id ||
        child.personalizationLineage.baselineArtifactDigest !== baseline.experience?.artifactDigest ||
        child.personalizationLineage.targetPosition !== target.position)
    ) {
      throw new HttpError(
        409,
        "personalization_child_lineage_conflict",
        "The account version baseline could not be verified."
      );
    }
    targetAlreadyPrepared = child.answers.targetDomain === target.domain;
  } else {
    await dependencies.createSession(
      {
        useCase: "abm",
        companyDomain: baseline.companyDomain,
        analytics: baseline.analytics
      },
      { sessionId: target.generatedSessionId }
    );
  }

  await dependencies.updateSession(target.generatedSessionId, (session) => {
    if (baseline.brand && !session.brand) {
      session.brand = brandWithSessionLogoDelivery(
        target.generatedSessionId,
        "seller",
        structuredClone(baseline.brand)
      );
      session.stages.brand = {
        status: baseline.stages.brand.status === "fallback" ? "fallback" : "complete",
        completedAt: new Date().toISOString(),
        detail: "Seller brand evidence carried forward from the verified standard experience."
      };
    }
    session.blockControls = structuredClone(baseline.blockControls ?? []);
    session.curatedSections = structuredClone(baseline.curatedSections ?? []);
    session.personalizationLineage = {
      requestId,
      baselineSessionId: baseline.id,
      baselineArtifactRevision: baseline.experience!.artifactRevision,
      baselineArtifactDigest: baseline.experience!.artifactDigest,
      targetPosition: target.position
    };
    return session;
  });

  if (!targetAlreadyPrepared) {
    await dependencies.patchSessionAnswers(
      target.generatedSessionId,
      childAnswersFor(baseline, target)
    );
  }
  child = await dependencies.getSession(target.generatedSessionId);
  if (!child) {
    throw new HttpError(
      500,
      "personalization_child_missing",
      "The account version could not be prepared."
    );
  }
  return child;
}

async function makeChildPermanent(
  childId: string,
  dependencies: FulfillmentDependencies
): Promise<TryMeSession> {
  const persisted = await dependencies.updateSession(
    childId,
    (session) => {
      delete session.expiresAt;
      return session;
    },
    { persist: true }
  );
  const readBack = await dependencies.getSession(childId);
  if (
    !persisted ||
    !readBack ||
    !dependencies.canRevealSession(readBack) ||
    readBack.experience?.artifactDigest !== persisted.experience?.artifactDigest
  ) {
    throw new HttpError(
      500,
      "personalization_readback_failed",
      "The account version could not be verified after saving."
    );
  }
  return readBack;
}

async function quarantineEvidenceFreeChild(
  childId: string,
  dependencies: FulfillmentDependencies
): Promise<void> {
  await dependencies.updateSession(childId, (session) => {
    session.finalArtifact = undefined;
    session.status = "generation_failed";
    session.stages.story = {
      ...session.stages.story,
      status: "failed",
      completedAt: new Date().toISOString(),
      detail: "This account version needs stronger first-party account evidence before it can be shown.",
      errorCode: "personalization_target_evidence_missing"
    };
    return session;
  });
}

async function fulfillTarget(input: {
  baseline: TryMeSession;
  request: PersonalizationRequest;
  target: PersonalizationTarget;
  attemptId: string;
  dependencies: FulfillmentDependencies;
  writeTargetStatus: TargetStatusWriter;
}): Promise<void> {
  const { baseline, request, target, dependencies, writeTargetStatus } = input;
  if (["ready", "needs_review", "failed"].includes(target.status)) return;

  try {
    let child = await prepareChildSession(
      baseline,
      target,
      request.id,
      dependencies
    );
    if (!dependencies.canRevealSession(child)) {
      await dependencies.runPreviewEnrichmentWave(target.generatedSessionId, {
        includeStory: true
      });
      child = await dependencies.getSession(target.generatedSessionId) as TryMeSession;
    }
    if (!child) {
      throw new HttpError(
        500,
        "personalization_child_missing",
        "The account version could not be found after generation."
      );
    }

    const evidenceCount = dependencies.targetEvidenceCount(child);
    if (evidenceCount < 1) {
      if (dependencies.canRevealSession(child)) {
        await quarantineEvidenceFreeChild(target.generatedSessionId, dependencies);
      }
      await writeTargetStatus({
        targetId: target.id,
        status: "needs_review",
        evidenceCount,
        errorCode: "missing_target_evidence"
      });
      return;
    }

    if (!dependencies.canRevealSession(child) || !child.experience?.artifactDigest) {
      const errorCode =
        child.stages.story.errorCode ||
        (child.status === "brand_help_required"
          ? "target_brand_help_required"
          : "personalization_final_gate_failed");
      await writeTargetStatus({
        targetId: target.id,
        status: child.status === "brand_help_required" ? "needs_review" : "failed",
        evidenceCount,
        errorCode
      });
      return;
    }

    child = await makeChildPermanent(target.generatedSessionId, dependencies);
    await writeTargetStatus({
      targetId: target.id,
      status: "ready",
      link: `/e/${target.generatedSessionId}`,
      artifactDigest: child.experience!.artifactDigest,
      evidenceCount
    });
  } catch (error) {
    logServerError(error, {
      sessionId: request.sessionId,
      operation: "personalization_variant_generation",
      code: error instanceof HttpError ? error.code : "personalization_variant_failed",
      details: { position: target.position }
    });
    await writeTargetStatus({
      targetId: target.id,
      status: "failed",
      errorCode:
        error instanceof HttpError
          ? error.code
          : "personalization_variant_failed"
    });
  }
}

/**
 * Builds exactly three independent account experiences concurrently. Each link
 * is exposed only after the normal final gates, durable save, and readback pass.
 */
export async function runPersonalizationFulfillment(
  sessionId: string,
  dependencies: FulfillmentDependencies = defaultDependencies
): Promise<PersonalizationRequest | undefined> {
  const lease = await acquirePersonalizationExecution(sessionId);
  if (!lease.acquired) return lease.request;
  const { request, attemptId } = lease;
  const baseline = await dependencies.getSession(sessionId);
  const writeTargetStatus = targetStatusWriter(sessionId, attemptId, dependencies);

  if (!baseline || !baselineMatchesRequest(baseline, request, dependencies)) {
    for (const target of request.targets) {
      await writeTargetStatus({
        targetId: target.id,
        status: "failed",
        errorCode: baseline ? "personalization_baseline_changed" : "personalization_baseline_missing"
      });
    }
    return finishPersonalizationExecution(sessionId, attemptId);
  }

  const startedRequest = await markPersonalizationTargetsResearching(
    sessionId,
    attemptId
  );
  await Promise.allSettled(
    startedRequest.targets.map((target) =>
      fulfillTarget({
        baseline,
        request,
        target,
        attemptId,
        dependencies,
        writeTargetStatus
      })
    )
  );
  const settled = await finishPersonalizationExecution(sessionId, attemptId);
  if (!settled.targets.some((target) => target.status === "ready" && target.link)) {
    return settled;
  }
  return (
    (await dependencies.deliverPersonalizationRequest?.(sessionId)) ?? settled
  );
}

export async function recoverPersonalizationFulfillment(
  sessionId: string
): Promise<void> {
  const request = await getPersonalizationRequest(sessionId);
  if (!request || !["queued", "generating"].includes(request.status)) return;
  await runPersonalizationFulfillment(sessionId);
}
