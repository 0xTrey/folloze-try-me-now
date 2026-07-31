import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { config } from "@/lib/config";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { HttpError } from "@/lib/http";
import { harvestBrand, fallbackBrand } from "@/lib/integrations/brand-harvester";
import { sendClaimEmail } from "@/lib/integrations/email";
import { publishClaimedExperience } from "@/lib/integrations/folloze";
import { generateExperienceDraft } from "@/lib/integrations/openai";
import { getSession, putSession, toPublicSession, updateSession } from "@/lib/session-store";
import { appendEvent } from "@/lib/telemetry";
import type {
  ClaimResult,
  PublicTryMeSession,
  SessionAnswers,
  TryMeSession,
  UseCase
} from "@/lib/types";
import { assertBusinessEmail, maskEmail, normalizeDomain } from "@/lib/validation";

const defaultAudienceSuggestions = [
  "Marketing and revenue leaders",
  "Demand generation leaders",
  "IT and technical leaders",
  "Operations and procurement"
];

function opaqueId(): string {
  return randomBytes(24).toString("base64url");
}

function stage(status: "pending" | "running", detail: string) {
  return {
    status,
    detail,
    ...(status === "running" ? { startedAt: new Date().toISOString() } : {})
  } as const;
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
      audienceSuggestions: defaultAudienceSuggestions,
      events: []
    },
    "company_domain_submitted",
    { useCase: input.useCase, domain: companyDomain }
  );
  appendEvent(session, "brand_harvest_started");
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
  const current = await getSession(id);
  if (!current) return;
  const expectedDomain = current.companyDomain;
  try {
    const profile = await harvestBrand(expectedDomain);
    await updateSession(id, (session) => {
      if (session.companyDomain !== expectedDomain) return session;
      session.brand = profile;
      session.stages.brand = {
        status: "complete",
        startedAt: session.stages.brand.startedAt,
        completedAt: new Date().toISOString(),
        detail: "Brand found.",
        artifact: `${profile.companyName} · ${profile.colors.slice(0, 4).join(" · ") || "brand fallback"}`
      };
      appendEvent(session, "brand_harvest_completed", { source: profile.source });
      return session;
    });
  } catch (error) {
    await updateSession(id, (session) => {
      if (session.companyDomain !== expectedDomain) return session;
      session.brand = fallbackBrand(expectedDomain);
      session.stages.brand = {
        status: "fallback",
        startedAt: session.stages.brand.startedAt,
        completedAt: new Date().toISOString(),
        detail: "The public site could not be read cleanly, so we prepared a safe brand starting point.",
        artifact: "Editable brand fallback",
        errorCode: "brand_fetch_fallback"
      };
      appendEvent(session, "brand_harvest_failed", {
        error: error instanceof Error ? error.name : "unknown"
      });
      return session;
    });
  }
}

export async function patchSessionAnswers(
  id: string,
  patch: SessionAnswers
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean }> {
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
    session.answers = { ...session.answers, ...normalizedPatch };
    const resolvedAudience =
      session.answers.audience === "Other"
        ? session.answers.customAudience
        : session.answers.customAudience || session.answers.audience;
    if (resolvedAudience) {
      session.stages.audience = {
        status: "complete",
        startedAt: session.stages.audience.startedAt,
        completedAt: new Date().toISOString(),
        detail: "Audience and decision context aligned.",
        artifact: `${resolvedAudience} · ${session.answers.objective || "objective in progress"}`
      };
    } else {
      session.stages.audience = {
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
  const started = await updateSession(id, (session) => {
    if (!isGenerationReady(session.useCase, session.answers)) return session;
    if (session.stages.story.status === "running" || session.status === "preview_ready_unclaimed" || session.status === "claimed") {
      return session;
    }
    session.status = "generating";
    session.stages.story = {
      status: "running",
      startedAt: new Date().toISOString(),
      detail: "Turning the brief into a tension, value, proof, and next-step sequence."
    };
    appendEvent(session, "generation_started");
    return session;
  });
  if (!started || started.stages.story.status !== "running") return;

  try {
    const latest = (await getSession(id)) ?? started;
    const brand = latest.brand ?? fallbackBrand(latest.companyDomain);
    let targetBrand = latest.targetBrand;
    if (latest.useCase === "abm" && latest.answers.targetDomain && !targetBrand) {
      try {
        targetBrand = await harvestBrand(latest.answers.targetDomain);
      } catch {
        targetBrand = fallbackBrand(latest.answers.targetDomain);
      }
    }
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
      themeUrl: process.env.FOLLOZE_THEME_URL
    });
    const readyAt = Date.now();
    await updateSession(
      id,
      (session) => {
        session.brand = brand;
        session.targetBrand = targetBrand;
        session.experience = { ...generated.draft, html, generationSource: generated.source };
        session.status = "preview_ready_unclaimed";
        session.expiresAt = new Date(readyAt + config.sessionTtlSeconds * 1000).toISOString();
        session.stages.story = {
          status: generated.source === "openai" ? "complete" : "fallback",
          startedAt: session.stages.story.startedAt,
          completedAt: new Date().toISOString(),
          detail:
            generated.source === "openai"
              ? "The buyer story and experience are ready."
              : "A reliable fallback story is ready while OpenAI is not configured.",
          artifact: generated.draft.narrativeArc
        };
        appendEvent(session, "generation_completed", { source: generated.source });
        return session;
      },
      { ttlSeconds: config.sessionTtlSeconds }
    );
  } catch (error) {
    await updateSession(id, (session) => {
      session.status = "generation_failed";
      session.stages.story = {
        status: "failed",
        startedAt: session.stages.story.startedAt,
        completedAt: new Date().toISOString(),
        detail: "The story could not be completed. Your inputs are safe and ready to retry.",
        errorCode: "generation_failed"
      };
      appendEvent(session, "generation_failed", {
        error: error instanceof Error ? error.name : "unknown"
      });
      return session;
    });
  }
}

export async function claimSession(id: string, emailInput: string): Promise<ClaimResult> {
  const email = assertBusinessEmail(emailInput);
  const current = await getSession(id);
  if (!current || !current.experience) throw new Error("This temporary experience is not ready or has expired.");
  if (current.status === "claimed") {
    if (current.claim?.email === email) {
      return {
        session: toPublicSession(current),
        emailDelivery:
          current.claim.emailStatus === "sent" || current.claim.emailStatus === "failed"
            ? current.claim.emailStatus
            : "skipped",
        publishMode: current.claim.publishStatus === "published" ? "folloze" : "preview-only"
      };
    }
    throw new Error("This experience has already been claimed.");
  }

  const pending = await updateSession(
    id,
    (session) => {
      session.status = "claim_pending";
      session.claim = {
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

  try {
    const publish = await publishClaimedExperience(pending);
    const liveUrl = publish.publicUrl ?? pending.temporaryUrl;
    const emailStatus = await sendClaimEmail({
      email,
      companyName: pending.brand?.companyName ?? pending.companyDomain,
      liveUrl,
      sessionId: pending.id
    });
    const claimed = await updateSession(
      id,
      (session) => {
        session.status = "claimed";
        session.claimedAt = new Date().toISOString();
        session.expiresAt = undefined;
        session.liveUrl = liveUrl;
        session.claim = {
          ...session.claim,
          email,
          emailMasked: maskEmail(email),
          emailStatus,
          publishStatus: publish.mode === "folloze" ? "published" : "preview-only",
          follozeBoardId: publish.boardId,
          designerUrl: publish.designerUrl
        };
        appendEvent(session, "claim_completed", { publishMode: publish.mode });
        appendEvent(session, emailStatus === "sent" ? "followup_email_sent" : "followup_email_failed", {
          status: emailStatus
        });
        return session;
      },
      { persist: true }
    );
    if (!claimed) throw new Error("The claimed experience could not be reloaded.");
    return {
      session: toPublicSession(claimed),
      emailDelivery: emailStatus,
      publishMode: publish.mode
    };
  } catch (error) {
    await updateSession(
      id,
      (session) => {
        session.status = "claim_failed";
        session.claim = { ...session.claim, email, emailStatus: "failed", publishStatus: "failed" };
        appendEvent(session, "claim_failed", {
          error: error instanceof Error ? error.name : "unknown"
        });
        return session;
      },
      { ttlSeconds: 86400 }
    );
    throw error;
  }
}
