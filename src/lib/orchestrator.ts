import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import { config } from "@/lib/config";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { HttpError, logServerError } from "@/lib/http";
import { harvestBrand, fallbackBrand } from "@/lib/integrations/brand-harvester";
import { sendClaimEmail } from "@/lib/integrations/email";
import { publishClaimedExperience } from "@/lib/integrations/folloze";
import { generateExperienceDraft, SourceFetchError } from "@/lib/integrations/openai";
import { leadStoreMode, recordLeadCapture, updateLeadOutcome } from "@/lib/lead-store";
import {
  acquireSessionLease,
  getSession,
  putSession,
  sessionStoreIsProductionSafe,
  toPublicSession,
  updateSession
} from "@/lib/session-store";
import { appendEvent } from "@/lib/telemetry";
import type {
  BrandProfile,
  ClaimResult,
  PublicTryMeSession,
  SessionAnswers,
  TryMeSession,
  UseCase
} from "@/lib/types";
import { assertBusinessEmail, maskEmail, normalizeDomain } from "@/lib/validation";

function opaqueId(): string {
  return randomBytes(24).toString("base64url");
}

function fontDeliveryUrls(id: string, brand: BrandProfile): { display?: string; body?: string } {
  const route = (slot: "display" | "body") =>
    `/api/sessions/${encodeURIComponent(id)}/font/${slot}`;
  return {
    display: brand.displayFontUrl ? route("display") : undefined,
    body: brand.bodyFontUrl ? route("body") : undefined
  };
}

function assertProductionSessionStore(): void {
  if (process.env.NODE_ENV === "production" && !sessionStoreIsProductionSafe) {
    throw new HttpError(
      503,
      "session_store_not_safe",
      "Try Me Now is temporarily unavailable while durable session storage is being restored."
    );
  }
}

function storyInputFingerprint(session: TryMeSession): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        useCase: session.useCase,
        companyDomain: session.companyDomain,
        brand: session.brand,
        targetBrand: session.targetBrand,
        answers: session.answers
      })
    )
    .digest("hex");
}

function isStale(startedAt: string | undefined, maxAgeMs: number): boolean {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  return !Number.isFinite(started) || Date.now() - started >= maxAgeMs;
}

function stage(status: "pending" | "running", detail: string) {
  return {
    status,
    detail,
    ...(status === "running" ? { startedAt: new Date().toISOString() } : {})
  } as const;
}

async function releaseLeaseSafely(
  lease: { release(): Promise<void> },
  sessionId: string,
  operation: string
): Promise<void> {
  try {
    await lease.release();
  } catch (error) {
    logServerError(error, {
      sessionId,
      operation: `${operation}_lease_release`,
      code: "lease_release_failed"
    });
  }
}

export function isGenerationReady(useCase: UseCase, answers: SessionAnswers): boolean {
  const common = Boolean(answers.audience && answers.objective);
  if (!common) return false;
  if (useCase === "abm") return Boolean(answers.targetDomain);
  if (useCase === "campaign") {
    return Boolean(answers.campaignType && (answers.campaignType !== "event" || answers.eventSource));
  }
  return Boolean(answers.sourceUrl || answers.sourceName);
}

export async function createSession(input: {
  useCase: UseCase;
  companyDomain: string;
}): Promise<{ session: PublicTryMeSession; editorToken: string }> {
  assertProductionSessionStore();
  const companyDomain = normalizeDomain(input.companyDomain);
  const now = new Date().toISOString();
  const id = opaqueId();
  const editorToken = opaqueId();
  const session: TryMeSession = appendEvent(
    {
      id,
      editorTokenHash: createHash("sha256").update(editorToken).digest("hex"),
      useCase: input.useCase,
      companyDomain,
      status: "collecting",
      createdAt: now,
      updatedAt: now,
      temporaryUrl: `${config.appUrl}/e/${id}`,
      revision: 1,
      stages: {
        brand: stage("running", "Reading the visual and messaging signals buyers already recognize."),
        audience: stage("running", "Building a useful first audience hypothesis from the company context."),
        story: stage("pending", "Waiting for the audience and objective.")
      },
      answers: {},
      audienceSuggestions: [],
      events: []
    },
    "company_domain_submitted",
    { useCase: input.useCase, domain: companyDomain }
  );
  appendEvent(session, "temp_url_created");
  await putSession(session, { ttlSeconds: 3600 });
  return { session: toPublicSession(session), editorToken };
}

export async function canEditSession(id: string, editorToken: string | undefined): Promise<boolean> {
  if (!editorToken) return false;
  const session = await getSession(id);
  if (!session) return false;
  const supplied = Buffer.from(createHash("sha256").update(editorToken).digest("hex"));
  const expected = Buffer.from(session.editorTokenHash);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function runBrandStage(id: string): Promise<void> {
  assertProductionSessionStore();
  const current = await getSession(id);
  if (!current || current.brand) return;
  const expectedDomain = current.companyDomain;
  const lease = await acquireSessionLease(id, "seller-brand", 30);
  if (!lease) return;
  try {
    await runBrandStageUnlocked(id, expectedDomain);
  } finally {
    await releaseLeaseSafely(lease, id, "seller_brand");
  }
}

async function runBrandStageUnlocked(id: string, expectedDomain: string): Promise<void> {
  const attemptId = opaqueId();
  let shouldHarvest = false;
  await updateSession(id, (session) => {
    shouldHarvest = false;
    if (session.companyDomain !== expectedDomain || session.brand) return session;
    if (
      session.stages.brand.attemptId &&
      !isStale(session.stages.brand.startedAt, 30_000)
    ) {
      return session;
    }
    if (session.stages.brand.attemptId) {
      appendEvent(session, "brand_harvest_recovered", {
        priorAttemptId: session.stages.brand.attemptId
      });
    }
    shouldHarvest = true;
    session.stages.brand = {
      status: "running",
      attemptId,
      startedAt: new Date().toISOString(),
      detail: "Reading the visual and messaging signals buyers already recognize."
    };
    appendEvent(session, "brand_harvest_started", { attemptId });
    return session;
  });
  if (!shouldHarvest) return;

  try {
    const profile = await harvestBrand(expectedDomain);
    await updateSession(id, (session) => {
      if (
        session.companyDomain !== expectedDomain ||
        session.brand ||
        session.stages.brand.attemptId !== attemptId
      ) {
        return session;
      }
      session.brand = profile;
      session.audienceSuggestions = audienceSuggestionsFor(profile, session.targetBrand);
      session.stages.brand = {
        status: "complete",
        startedAt: session.stages.brand.startedAt,
        completedAt: new Date().toISOString(),
        detail: "Brand found.",
        artifact: `${profile.companyName} · ${profile.colors.slice(0, 4).join(" · ") || "brand fallback"}`
      };
      appendEvent(session, "brand_harvest_completed", { source: profile.source });
      appendEvent(session, "audience_hypotheses_ready", {
        count: session.audienceSuggestions.length,
        categorySource: profile.source
      });
      return session;
    });
  } catch (error) {
    const requestId = logServerError(error, {
      sessionId: id,
      operation: "seller_brand_harvest",
      code: "brand_fetch_fallback",
      details: { domain: expectedDomain }
    });
    await updateSession(id, (session) => {
      if (
        session.companyDomain !== expectedDomain ||
        session.brand ||
        session.stages.brand.attemptId !== attemptId
      ) {
        return session;
      }
      session.brand = fallbackBrand(expectedDomain);
      session.audienceSuggestions = audienceSuggestionsFor(session.brand, session.targetBrand);
      session.stages.brand = {
        status: "fallback",
        startedAt: session.stages.brand.startedAt,
        completedAt: new Date().toISOString(),
        detail: "The public site could not be read cleanly, so we prepared a safe brand starting point.",
        artifact: "Editable brand fallback",
        errorCode: "brand_fetch_fallback"
      };
      appendEvent(session, "brand_harvest_failed", {
        error: error instanceof Error ? error.name : "unknown",
        requestId
      });
      return session;
    });
  }
  await runStoryStage(id);
}

export async function runTargetBrandStage(id: string): Promise<void> {
  assertProductionSessionStore();
  const current = await getSession(id);
  const expectedDomain = current?.answers.targetDomain;
  if (!current || !expectedDomain || current.targetBrand?.domain === expectedDomain) return;

  const lease = await acquireSessionLease(id, `target-brand:${expectedDomain}`, 30);
  if (!lease) return;
  try {
    await runTargetBrandStageUnlocked(id, expectedDomain);
  } finally {
    await releaseLeaseSafely(lease, id, "target_brand");
  }
}

async function runTargetBrandStageUnlocked(id: string, expectedDomain: string): Promise<void> {
  const attemptId = opaqueId();
  let shouldHarvest = false;
  await updateSession(id, (session) => {
    shouldHarvest = false;
    if (session.answers.targetDomain !== expectedDomain) return session;
    const terminalNames = new Set(["target_harvest_completed", "target_harvest_failed"]);
    const latestTerminalIndex = session.events.findLastIndex(
      (event) => terminalNames.has(event.name) && event.meta?.domain === expectedDomain
    );
    const latestStartIndex = session.events.findLastIndex(
      (event) => event.name === "target_harvest_started" && event.meta?.domain === expectedDomain
    );
    if (
      latestStartIndex > latestTerminalIndex &&
      !isStale(session.events[latestStartIndex]?.at, 30_000)
    ) {
      return session;
    }
    if (latestStartIndex > latestTerminalIndex) {
      appendEvent(session, "target_harvest_recovered", {
        domain: expectedDomain,
        priorAttemptId: session.events[latestStartIndex]?.meta?.attemptId ?? "unknown"
      });
    }
    shouldHarvest = true;
    appendEvent(session, "target_harvest_started", { domain: expectedDomain, attemptId });
    session.stages.audience = {
      status: "running",
      attemptId,
      startedAt: session.stages.audience.startedAt ?? new Date().toISOString(),
      detail: `Reading ${expectedDomain} while you finish the brief.`
    };
    return session;
  });
  if (!shouldHarvest) return;

  try {
    const profile = await harvestBrand(expectedDomain);
    await updateSession(id, (session) => {
      if (
        session.answers.targetDomain !== expectedDomain ||
        session.stages.audience.attemptId !== attemptId
      ) {
        return session;
      }
      session.targetBrand = profile;
      if (session.brand) {
        session.audienceSuggestions = audienceSuggestionsFor(session.brand, profile);
      }
      session.stages.audience = {
        status: session.answers.audience ? "complete" : "running",
        attemptId,
        startedAt: session.stages.audience.startedAt,
        completedAt: session.answers.audience ? new Date().toISOString() : undefined,
        detail: session.answers.audience
          ? "Audience and account context aligned."
          : `Account context found for ${profile.companyName}.`,
        artifact: session.answers.audience
          ? `${session.answers.customAudience || session.answers.audience} · ${profile.companyName}`
          : `${profile.companyName} · public account context ready`
      };
      appendEvent(session, "target_harvest_completed", {
        domain: expectedDomain,
        source: profile.source
      });
      appendEvent(session, "audience_hypotheses_refined", {
        domain: expectedDomain,
        count: session.audienceSuggestions.length,
        sellerCategorySource: session.brand?.source ?? "unknown",
        targetCategorySource: profile.source
      });
      return session;
    });
  } catch (error) {
    const requestId = logServerError(error, {
      sessionId: id,
      operation: "target_brand_harvest",
      code: "target_brand_fetch_fallback",
      details: { domain: expectedDomain }
    });
    await updateSession(id, (session) => {
      if (
        session.answers.targetDomain !== expectedDomain ||
        session.stages.audience.attemptId !== attemptId
      ) {
        return session;
      }
      session.targetBrand = fallbackBrand(expectedDomain);
      if (session.brand) {
        session.audienceSuggestions = audienceSuggestionsFor(session.brand, session.targetBrand);
      }
      appendEvent(session, "target_harvest_failed", {
        domain: expectedDomain,
        error: error instanceof Error ? error.name : "unknown",
        requestId
      });
      return session;
    });
  }
  await runStoryStage(id);
}

export async function patchSessionAnswers(
  id: string,
  patch: SessionAnswers
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean }> {
  assertProductionSessionStore();
  const normalizedPatch = { ...patch };
  if (patch.targetDomain) normalizedPatch.targetDomain = normalizeDomain(patch.targetDomain);
  const updated = await updateSession(id, (session) => {
    if (
      normalizedPatch.sourceUrl &&
      (session.answers.sourceName || session.answers.sourceUploadId)
    ) {
      throw new HttpError(
        409,
        "source_conflict",
        "A PDF source is already being processed for this experience."
      );
    }
    const targetChanged =
      normalizedPatch.targetDomain && normalizedPatch.targetDomain !== session.answers.targetDomain;
    session.answers = { ...session.answers, ...normalizedPatch };
    if (targetChanged) {
      session.targetBrand = undefined;
      session.audienceSuggestions = [];
      if (!normalizedPatch.audience && !normalizedPatch.customAudience) {
        session.answers.audience = undefined;
        session.answers.customAudience = undefined;
      }
    }
    const resolvedAudience =
      session.answers.audience === "Other"
        ? session.answers.customAudience
        : session.answers.customAudience || session.answers.audience;
    if (resolvedAudience) {
      session.stages.audience = {
        ...session.stages.audience,
        status: "complete",
        startedAt: session.stages.audience.startedAt,
        completedAt: new Date().toISOString(),
        detail: "Audience and decision context aligned.",
        artifact: `${resolvedAudience} · ${session.answers.objective || "objective in progress"}`
      };
    } else {
      session.stages.audience = {
        ...session.stages.audience,
        status: "running",
        startedAt: session.stages.audience.startedAt,
        detail: "Refining the audience and decision context."
      };
    }
    if (normalizedPatch.audience || normalizedPatch.customAudience) {
      appendEvent(session, "audience_selected", {
        audience: normalizedPatch.customAudience || normalizedPatch.audience || null
      });
    }
    if (normalizedPatch.objective) appendEvent(session, "objective_selected");
    if (normalizedPatch.sourceUrl || normalizedPatch.sourceName) appendEvent(session, "source_submitted");
    return session;
  });
  if (!updated) throw new Error("This temporary experience has expired.");
  return { session: toPublicSession(updated), shouldGenerate: isGenerationReady(updated.useCase, updated.answers) };
}

export async function finalizePdfSource(
  id: string,
  input: { uploadId: string; sourceName: string; sourceOpenAIFileId?: string }
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean }> {
  assertProductionSessionStore();
  const updated = await updateSession(id, (session) => {
    if (
      session.useCase !== "content" ||
      session.answers.sourceUploadId !== input.uploadId ||
      session.answers.sourceUrl ||
      (session.answers.sourceName && session.answers.sourceName !== input.sourceName)
    ) {
      throw new HttpError(
        409,
        "upload_superseded",
        "Another content source was selected before this PDF finished processing."
      );
    }
    session.answers.sourceName = input.sourceName;
    session.answers.sourceOpenAIFileId = input.sourceOpenAIFileId;
    appendEvent(session, "source_submitted");
    return session;
  });
  if (!updated) throw new Error("This temporary experience has expired.");
  return {
    session: toPublicSession(updated),
    shouldGenerate: isGenerationReady(updated.useCase, updated.answers)
  };
}

export async function runStoryStage(id: string): Promise<void> {
  assertProductionSessionStore();
  let preflight = await getSession(id);
  if (preflight && !preflight.brand) {
    await runBrandStage(id);
    preflight = await getSession(id);
    if (!preflight?.brand) return;
  }
  if (
    preflight?.useCase === "abm" &&
    preflight.answers.targetDomain &&
    preflight.targetBrand?.domain !== preflight.answers.targetDomain
  ) {
    await runTargetBrandStage(id);
    const refreshed = await getSession(id);
    if (refreshed?.targetBrand?.domain !== preflight.answers.targetDomain) return;
  }

  const lease = await acquireSessionLease(id, "generation", 60);
  if (!lease) return;
  let shouldRetry = false;
  try {
    shouldRetry = await runStoryStageUnlocked(id);
  } finally {
    await releaseLeaseSafely(lease, id, "generation");
  }
  if (shouldRetry) await runStoryStage(id);
}

async function runStoryStageUnlocked(id: string): Promise<boolean> {
  const attemptId = opaqueId();
  let acquiredGeneration = false;
  let expectedFingerprint = "";
  const started = await updateSession(id, (session) => {
    acquiredGeneration = false;
    expectedFingerprint = "";
    if (!isGenerationReady(session.useCase, session.answers)) return session;
    if (session.status === "preview_ready_unclaimed" || session.status === "claimed") {
      return session;
    }
    if (
      session.stages.story.status === "running" &&
      !isStale(session.stages.story.startedAt, 60_000)
    ) {
      return session;
    }
    if (session.stages.story.status === "running") {
      appendEvent(session, "generation_recovered", {
        priorAttemptId: session.stages.story.attemptId ?? "unknown"
      });
    }
    acquiredGeneration = true;
    expectedFingerprint = storyInputFingerprint(session);
    session.status = "generating";
    session.stages.story = {
      status: "running",
      attemptId,
      inputFingerprint: expectedFingerprint,
      startedAt: new Date().toISOString(),
      detail: "Turning the brief into a tension, value, proof, and next-step sequence."
    };
    appendEvent(session, "generation_started");
    return session;
  });
  if (!started || !acquiredGeneration) return false;

  let staleGeneration = false;
  try {
    const latest = (await getSession(id)) ?? started;
    const brand = latest.brand ?? fallbackBrand(latest.companyDomain);
    const targetBrand =
      latest.targetBrand ??
      (latest.useCase === "abm" && latest.answers.targetDomain
        ? fallbackBrand(latest.answers.targetDomain)
        : undefined);
    const generated = await generateExperienceDraft({
      brand,
      targetBrand,
      useCase: latest.useCase,
      answers: latest.answers
    });
    const html = renderExperienceHtml({
      draft: generated.draft,
      brand,
      targetBrand,
      useCase: latest.useCase,
      answers: latest.answers,
      themeUrl: process.env.FOLLOZE_THEME_URL,
      fontDeliveryUrls: fontDeliveryUrls(id, brand)
    });
    if (generated.error) {
      logServerError(generated.error, {
        sessionId: id,
        operation: "openai_story_generation",
        code: generated.fallbackReason ?? "openai_request_failed",
        details: { durationMs: generated.durationMs, model: config.openAIModel }
      });
    } else if (
      generated.source === "deterministic-fallback" &&
      generated.fallbackReason !== "openai_not_configured"
    ) {
      console.warn(
        JSON.stringify({
          level: "warning",
          event: "openai_generation_fallback",
          sessionId: id,
          useCase: latest.useCase,
          reason: generated.fallbackReason ?? "unknown",
          durationMs: generated.durationMs,
          model: config.openAIModel
        })
      );
    }
    const readyAt = Date.now();
    await updateSession(
      id,
      (session) => {
        if (
          session.stages.story.attemptId !== attemptId ||
          storyInputFingerprint(session) !== expectedFingerprint
        ) {
          staleGeneration = true;
          if (session.stages.story.attemptId === attemptId) {
            session.status = "collecting";
            session.stages.story = {
              status: "pending",
              detail: "Inputs changed while the story was being built. Restarting with the latest brief."
            };
            appendEvent(session, "generation_discarded", { attemptId });
          }
          return session;
        }
        session.brand = brand;
        session.targetBrand = targetBrand;
        session.experience = {
          ...generated.draft,
          html,
          generationSource: generated.source,
          artifactRevision: session.revision + 1,
          artifactDigest: createHash("sha256").update(html).digest("hex")
        };
        session.status = "preview_ready_unclaimed";
        session.expiresAt = new Date(readyAt + config.sessionTtlSeconds * 1000).toISOString();
        session.stages.story = {
          status: generated.source === "openai" ? "complete" : "fallback",
          startedAt: session.stages.story.startedAt,
          completedAt: new Date().toISOString(),
          detail:
            generated.source === "openai"
              ? "The buyer story and experience are ready."
              : generated.fallbackReason === "openai_not_configured"
                ? "A reliable fallback story is ready while OpenAI is not configured."
                : "A source-grounded fallback is ready after the AI draft did not pass our quality checks.",
          artifact: generated.draft.narrativeArc
        };
        appendEvent(session, "generation_completed", {
          source: generated.source,
          durationMs: generated.durationMs,
          fallbackReason: generated.fallbackReason ?? null
        });
        return session;
      },
      { ttlSeconds: config.sessionTtlSeconds }
    );
  } catch (error) {
    const errorCode = error instanceof SourceFetchError ? "source_fetch_failed" : "generation_failed";
    const requestId = logServerError(error, {
      sessionId: id,
      operation: "experience_generation",
      code: errorCode
    });
    await updateSession(id, (session) => {
      if (
        session.stages.story.attemptId !== attemptId ||
        storyInputFingerprint(session) !== expectedFingerprint
      ) {
        staleGeneration = true;
        if (session.stages.story.attemptId === attemptId) {
          session.status = "collecting";
          session.stages.story = {
            status: "pending",
            detail: "Inputs changed while the story was being built. Restarting with the latest brief."
          };
          appendEvent(session, "generation_discarded", { attemptId });
        }
        return session;
      }
      session.status = "generation_failed";
      session.stages.story = {
        status: "failed",
        startedAt: session.stages.story.startedAt,
        completedAt: new Date().toISOString(),
        detail:
          errorCode === "source_fetch_failed"
            ? "The public content URL could not be read. Check the URL or try a PDF instead."
            : "The story could not be completed. Your inputs are safe and ready to retry.",
        errorCode
      };
      appendEvent(session, "generation_failed", {
        error: error instanceof Error ? error.name : "unknown",
        requestId
      });
      return session;
    });
  }
  return staleGeneration;
}

/**
 * Re-enters work that may have been orphaned when a serverless `after()` task
 * was interrupted. Every underlying stage has its own lease and attempt fence,
 * so calling this from an ordinary session poll is safe and idempotent.
 */
function needsLeadOutcomeReconciliation(session: TryMeSession): boolean {
  const failedAt = session.events.findLastIndex((event) => event.name === "lead_outcome_sync_failed");
  const reconciledAt = session.events.findLastIndex((event) => event.name === "lead_outcome_reconciled");
  return failedAt > reconciledAt;
}

export async function recoverSessionWork(id: string): Promise<void> {
  try {
    let session = await getSession(id);
    if (!session) return;
    if (
      session.status === "claimed" &&
      session.claim?.email &&
      needsLeadOutcomeReconciliation(session)
    ) {
      await claimSession(id, session.claim.email);
      return;
    }
    if (session.status === "claimed") return;

    if (
      session.status === "claim_pending" &&
      session.claim?.email &&
      isStale(session.claim.startedAt, 300_000)
    ) {
      await claimSession(id, session.claim.email);
      return;
    }

    if (!session.brand) {
      await runBrandStage(id);
      session = await getSession(id);
      if (!session?.brand) return;
    }

    if (
      session.useCase === "abm" &&
      session.answers.targetDomain &&
      session.targetBrand?.domain !== session.answers.targetDomain
    ) {
      await runTargetBrandStage(id);
      session = await getSession(id);
      if (!session || session.targetBrand?.domain !== session.answers.targetDomain) return;
    }

    const storyCanResume =
      !session.experience &&
      isGenerationReady(session.useCase, session.answers) &&
      (session.stages.story.status === "pending" ||
        (session.stages.story.status === "running" &&
          isStale(session.stages.story.startedAt, 60_000)));
    if (storyCanResume) await runStoryStage(id);
  } catch (error) {
    logServerError(error, {
      sessionId: id,
      operation: "session_work_recovery",
      code: "session_work_recovery_failed"
    });
  }
}

export type LeadReconciliationResult =
  | "reconciled"
  | "resumed"
  | "pending"
  | "missing"
  | "stale";

export async function reconcileLeadSession(id: string): Promise<LeadReconciliationResult> {
  assertProductionSessionStore();
  const session = await getSession(id);
  if (!session) return "missing";

  if (
    session.status === "claim_pending" &&
    session.claim?.email &&
    isStale(session.claim.startedAt, 300_000)
  ) {
    await claimSession(id, session.claim.email);
    return "resumed";
  }

  const claimAttemptId = session.claim?.attemptId;
  if (!claimAttemptId) return "pending";

  if (session.status === "claimed") {
    const updated = await syncLeadOutcome(
      {
        sessionId: id,
        claimAttemptId,
        experienceUrl: session.liveUrl ?? session.temporaryUrl,
        claimStatus: "claimed",
        publishStatus: session.claim?.publishStatus ?? "preview-only",
        emailStatus: session.claim?.emailStatus ?? "skipped",
        claimedAt: session.claimedAt
      },
      "scheduled_claimed_lead_reconciliation"
    );
    if (updated && needsLeadOutcomeReconciliation(session)) {
      await updateSession(
        id,
        (current) => {
          if (
            current.claim?.attemptId === claimAttemptId &&
            needsLeadOutcomeReconciliation(current)
          ) {
            appendEvent(current, "lead_outcome_reconciled");
          }
          return current;
        },
        { persist: true }
      );
    }
    return updated ? "reconciled" : "stale";
  }

  if (session.status === "claim_failed") {
    const updated = await syncLeadOutcome(
      {
        sessionId: id,
        claimAttemptId,
        experienceUrl: session.liveUrl ?? session.temporaryUrl,
        claimStatus: "failed",
        publishStatus: session.claim?.publishStatus ?? "not-attempted",
        emailStatus: session.claim?.emailStatus ?? "not-attempted"
      },
      "scheduled_failed_lead_reconciliation"
    );
    return updated ? "reconciled" : "stale";
  }

  return "pending";
}

export async function claimSession(id: string, emailInput: string): Promise<ClaimResult> {
  assertProductionSessionStore();
  const email = assertBusinessEmail(emailInput);
  const lease = await acquireSessionLease(id, "claim", 300);
  if (!lease) {
    throw new HttpError(409, "claim_in_progress", "This experience is already being claimed.");
  }
  try {
    return await claimSessionUnlocked(id, email);
  } finally {
    await releaseLeaseSafely(lease, id, "claim");
  }
}

async function claimSessionUnlocked(id: string, email: string): Promise<ClaimResult> {
  const current = await getSession(id);
  if (!current || !current.experience) throw new Error("This temporary experience is not ready or has expired.");
  if (current.claim?.email && current.claim.email !== email) {
    throw new HttpError(
      409,
      "claim_email_mismatch",
      "This experience is already tied to a different business email."
    );
  }
  if (current.status === "claimed") {
    if (current.claim?.email === email) {
      const reconciled = await syncLeadOutcome(
        {
          sessionId: current.id,
          claimAttemptId: current.claim.attemptId ?? `legacy:${current.id}`,
          experienceUrl: current.liveUrl ?? current.temporaryUrl,
          claimStatus: "claimed",
          publishStatus: current.claim.publishStatus ?? "preview-only",
          emailStatus: current.claim.emailStatus ?? "skipped",
          claimedAt: current.claimedAt
        },
        "claimed_lead_reconciliation"
      );
      let resolved = current;
      if (reconciled && needsLeadOutcomeReconciliation(current)) {
        try {
          resolved =
            (await updateSession(
              id,
              (session) => {
                if (needsLeadOutcomeReconciliation(session)) {
                  appendEvent(session, "lead_outcome_reconciled");
                }
                return session;
              },
              { persist: true }
            )) ?? current;
        } catch (error) {
          logServerError(error, {
            sessionId: id,
            operation: "lead_reconciliation_marker",
            code: "lead_reconciliation_marker_failed"
          });
        }
      }
      return {
        session: toPublicSession(resolved),
        emailDelivery:
          current.claim.emailStatus === "sent" || current.claim.emailStatus === "failed"
            ? current.claim.emailStatus
            : "skipped",
        publishMode: current.claim.publishStatus === "published" ? "folloze" : "preview-only"
      };
    }
    throw new Error("This experience has already been claimed.");
  }

  const claimAttemptId = opaqueId();
  let acquiredClaim = false;
  const pending = await updateSession(
    id,
    (session) => {
      acquiredClaim = false;
      const recoveringPending = session.status === "claim_pending";
      if (
        recoveringPending &&
        !isStale(session.claim?.startedAt, 300_000)
      ) {
        throw new HttpError(409, "claim_in_progress", "This experience is already being claimed.");
      }
      if (recoveringPending) {
        appendEvent(session, "claim_recovered", {
          priorAttemptId: session.claim?.attemptId ?? "unknown"
        });
      }
      if (session.status === "claimed") {
        throw new HttpError(409, "already_claimed", "This experience has already been claimed.");
      }
      if (
        !recoveringPending &&
        session.status !== "preview_ready_unclaimed" &&
        session.status !== "claim_failed"
      ) {
        throw new HttpError(409, "claim_not_ready", "This experience is not ready to be claimed.");
      }
      acquiredClaim = true;
      session.status = "claim_pending";
      session.claim = {
        attemptId: claimAttemptId,
        startedAt: new Date().toISOString(),
        email,
        emailMasked: maskEmail(email),
        emailStatus: "pending",
        publishStatus: "pending"
      };
      appendEvent(session, "claim_started");
      return session;
    },
    { ttlSeconds: 86400 }
  );
  if (!pending) throw new Error("This temporary experience has expired.");
  if (!acquiredClaim) throw new Error("This experience could not start the claim workflow.");

  try {
    await recordLeadCapture(pending, email);
  } catch (error) {
    await markClaimFailure(
      id,
      claimAttemptId,
      email,
      error,
      "not-attempted",
      "not-attempted"
    );
    throw error;
  }

  let publishable: TryMeSession | null;
  try {
    publishable = await updateSession(
      id,
      (session) => {
        appendEvent(session, "lead_captured", { store: leadStoreMode });
        return session;
      },
      { ttlSeconds: 86400 }
    );
    if (!publishable) throw new Error("The claimed experience could not be prepared for publication.");
  } catch (error) {
    await syncLeadOutcome(
      {
        sessionId: id,
        claimAttemptId,
        experienceUrl: pending.temporaryUrl,
        claimStatus: "failed",
        publishStatus: "not-attempted",
        emailStatus: "not-attempted"
      },
      "lead_preparation_failure_update"
    );
    await markClaimFailure(
      id,
      claimAttemptId,
      email,
      error,
      "not-attempted",
      "not-attempted"
    );
    throw error;
  }

  let publish: Awaited<ReturnType<typeof publishClaimedExperience>>;
  try {
    publish = await publishClaimedExperience(publishable);
  } catch (error) {
    await syncLeadOutcome(
      {
        sessionId: id,
        claimAttemptId,
        experienceUrl: pending.temporaryUrl,
        claimStatus: "failed",
        publishStatus: "failed",
        emailStatus: "not-attempted"
      },
      "lead_failure_update"
    );
    await markClaimFailure(id, claimAttemptId, email, error, "failed", "not-attempted");
    throw error;
  }

  const liveUrl = publish.publicUrl ?? pending.temporaryUrl;
  let emailStatus: "sent" | "skipped" | "failed";
  try {
    emailStatus = await sendClaimEmail({
      email,
      companyName: pending.brand?.companyName ?? pending.companyDomain,
      liveUrl,
      sessionId: pending.id
    });
  } catch (error) {
    emailStatus = "failed";
    logServerError(error, {
      sessionId: id,
      operation: "claim_email_delivery",
      code: "claim_email_delivery_failed"
    });
  }

  const claimedAt = new Date().toISOString();
  const publishStatus = publish.mode === "folloze" ? "published" : "preview-only";
  const leadOutcomeSynced = await syncLeadOutcome(
    {
      sessionId: pending.id,
      claimAttemptId,
      experienceUrl: liveUrl,
      claimStatus: "claimed",
      publishStatus,
      emailStatus,
      claimedAt
    },
    "lead_outcome_update"
  );

  try {
    const claimed = await updateSession(
      id,
      (session) => {
        if (session.claim?.attemptId !== claimAttemptId) return session;
        session.status = "claimed";
        session.claimedAt = claimedAt;
        session.expiresAt = undefined;
        session.liveUrl = liveUrl;
        session.claim = {
          ...session.claim,
          email,
          emailMasked: maskEmail(email),
          emailStatus,
          publishStatus,
          follozeBoardId: publish.boardId,
          designerUrl: publish.designerUrl
        };
        appendEvent(session, "claim_completed", { publishMode: publish.mode });
        if (!leadOutcomeSynced) appendEvent(session, "lead_outcome_sync_failed");
        appendEvent(
          session,
          emailStatus === "sent"
            ? "followup_email_sent"
            : emailStatus === "failed"
              ? "followup_email_failed"
              : "followup_email_skipped",
          { status: emailStatus }
        );
        return session;
      },
      { persist: true }
    );
    if (
      !claimed ||
      claimed.status !== "claimed" ||
      claimed.claim?.attemptId !== claimAttemptId
    ) {
      throw new Error("The claimed experience could not be reloaded.");
    }
    return {
      session: toPublicSession(claimed),
      emailDelivery: emailStatus,
      publishMode: publish.mode
    };
  } catch (error) {
    logServerError(error, {
      sessionId: id,
      operation: "claim_session_finalize",
      code: "claim_session_finalize_failed",
      details: { publishStatus, emailStatus }
    });
    await markClaimFailure(id, claimAttemptId, email, error, publishStatus, emailStatus);
    throw error;
  }
}

async function syncLeadOutcome(
  input: Parameters<typeof updateLeadOutcome>[0],
  operation: string
): Promise<boolean> {
  let finalError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await updateLeadOutcome(input);
    } catch (error) {
      finalError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 60));
    }
  }
  logServerError(finalError, {
    sessionId: input.sessionId,
    operation,
    code: `${operation}_failed`
  });
  return false;
}

async function markClaimFailure(
  id: string,
  claimAttemptId: string,
  email: string,
  error: unknown,
  publishStatus: "not-attempted" | "published" | "preview-only" | "failed",
  emailStatus: "not-attempted" | "sent" | "skipped" | "failed"
): Promise<void> {
  try {
    await updateSession(
      id,
      (session) => {
        if (session.claim?.attemptId !== claimAttemptId) return session;
        session.status = "claim_failed";
        session.claim = { ...session.claim, email, emailStatus, publishStatus };
        appendEvent(session, "claim_failed", {
          error: error instanceof Error ? error.name : "unknown",
          publishStatus,
          emailStatus
        });
        return session;
      },
      { ttlSeconds: 86400 }
    );
  } catch (sessionError) {
    logServerError(sessionError, {
      sessionId: id,
      operation: "claim_failure_state",
      code: "claim_failure_state_update_failed"
    });
  }
}
