import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import { config } from "@/lib/config";
import {
  buildExperienceSpec,
  draftFromExperienceSpec,
  syncCampaignContracts
} from "@/lib/experience-contract";
import { targetAccountEvidenceFor } from "@/lib/generation/campaign-context";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { HttpError, logServerError } from "@/lib/http";
import {
  brandWithFirstPartyImages,
  imageDeliverySources
} from "@/lib/image-delivery";
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
  CreateSessionInput,
  DuplicateSessionInput,
  ExperienceAsset,
  ExperienceBlockControl,
  PreviewInteractionInput,
  PublicTryMeSession,
  QualityReceipt,
  SessionEvidenceItem,
  SessionAnswers,
  SessionWorkspacePatch,
  TryMeSession,
  UseCase
} from "@/lib/types";
import { assertBusinessEmail, maskEmail, normalizeDomain } from "@/lib/validation";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";

function opaqueId(): string {
  return randomBytes(24).toString("base64url");
}

function stableId(prefix: string, ...parts: Array<string | undefined>): string {
  return `${prefix}_${createHash("sha256")
    .update(parts.filter(Boolean).join("\u0000"))
    .digest("hex")
    .slice(0, 16)}`;
}

function evidenceItemsFor(
  targetBrand: BrandProfile | undefined,
  existing: SessionEvidenceItem[] = []
): SessionEvidenceItem[] {
  const priorDisposition = new Map(existing.map((item) => [item.id, item.disposition]));
  return targetAccountEvidenceFor(targetBrand).map((item) => {
    const id = stableId("evidence", targetBrand?.domain, item.type, item.text);
    return {
      ...item,
      id,
      disposition: priorDisposition.get(id) ?? "available"
    };
  });
}

function audienceRecommendationsFor(
  suggestions: string[],
  seller: BrandProfile | undefined,
  target: BrandProfile | undefined,
  evidenceItems: SessionEvidenceItem[]
) {
  const usableEvidence = evidenceItems.filter((item) => item.disposition !== "excluded");
  const companyContext = target ?? seller;
  return suggestions.map((label, index) => {
    const evidence = usableEvidence[index % Math.max(usableEvidence.length, 1)];
    const evidenceFocus = evidence?.text
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/g, "")
      .slice(0, 120);
    const companySpecific = Boolean(
      companyContext && companyContext.source !== "fallback" && usableEvidence.length
    );
    return {
      id: stableId("audience", seller?.domain, target?.domain, label),
      label,
      rationale: companySpecific
        ? `${target ? "Connects the seller's offer" : "Connects the campaign"} to ${companyContext?.companyName}'s public focus: ${
            evidenceFocus || "relevant operating priorities"
          }.`
        : `A ${companyContext?.companyName ?? "company"}-category starting point until stronger public context is available.`,
      evidenceItemIds: evidence ? [evidence.id] : [],
      confidence: companySpecific ? (usableEvidence.length >= 2 ? "high" : "medium") : "hypothesis",
      source: companySpecific ? "seller-target-synthesis" : "seller-category-fallback"
    } as const;
  });
}

function assetsFor(brand: BrandProfile | undefined, target: BrandProfile | undefined): ExperienceAsset[] {
  const assets: ExperienceAsset[] = [];
  const add = (
    source: "seller" | "target",
    kind: ExperienceAsset["kind"],
    label: string,
    url: string | undefined,
    index = 0
  ) => {
    if (!url) return;
    const id = stableId("asset", source, kind, url);
    if (assets.some((asset) => asset.id === id)) return;
    assets.push({ id, source, kind, label: index ? `${label} ${index + 1}` : label, url });
  };
  add("seller", "seller-logo", `${brand?.companyName ?? "Seller"} logo`, brand?.logoUrl);
  brand?.imageUrls.slice(0, 6).forEach((url, index) =>
    add("seller", "seller-image", `${brand.companyName} image`, url, index)
  );
  add("target", "target-logo", `${target?.companyName ?? "Target"} logo`, target?.logoUrl);
  target?.imageUrls.slice(0, 4).forEach((url, index) =>
    add("target", "target-image", `${target.companyName} image`, url, index)
  );
  return assets;
}

function syncExperienceFoundation(session: TryMeSession): void {
  session.evidenceItems = evidenceItemsFor(session.targetBrand ?? session.brand, session.evidenceItems);
  session.audienceRecommendations = audienceRecommendationsFor(
    session.audienceSuggestions,
    session.brand,
    session.targetBrand,
    session.evidenceItems
  );
  session.availableAssets = assetsFor(session.brand, session.targetBrand);
  const availableAssetIds = new Set(session.availableAssets.map((asset) => asset.id));
  if (session.answers.selectedAssetIds) {
    session.answers.selectedAssetIds = session.answers.selectedAssetIds.filter((id) =>
      availableAssetIds.has(id)
    );
  }
  if (
    session.selectedAudienceRecommendationId &&
    !session.audienceRecommendations.some(
      (recommendation) => recommendation.id === session.selectedAudienceRecommendationId
    )
  ) {
    session.selectedAudienceRecommendationId = undefined;
  }
  syncCampaignContracts(session);
}

function curatedTargetBrand(session: TryMeSession, targetBrand: BrandProfile | undefined): BrandProfile | undefined {
  if (!targetBrand || !session.evidenceItems?.length) return targetBrand;
  const excluded = session.evidenceItems.filter((item) => item.disposition === "excluded");
  const included = session.evidenceItems.filter((item) => item.disposition !== "excluded");
  const pinned = included.filter((item) => item.disposition === "pinned");
  const topicSignals = [...pinned, ...included]
    .flatMap((item) => item.signals)
    .filter((signal, index, signals) => signals.indexOf(signal) === index);
  return {
    ...targetBrand,
    description: excluded.some((item) => item.type === "public-positioning")
      ? undefined
      : targetBrand.description,
    publicContext: excluded.some((item) => item.type === "public-operating-context")
      ? undefined
      : targetBrand.publicContext,
    publicTopics: [
      ...topicSignals,
      ...targetBrand.publicTopics.filter(
        (topic) =>
          !excluded.some(
            (item) =>
              item.type === "public-focus-area" &&
              item.text.toLocaleLowerCase() === topic.toLocaleLowerCase()
          )
      )
    ].filter((topic, index, topics) => topics.indexOf(topic) === index)
  };
}

function brandsWithSelectedAssets(
  session: TryMeSession,
  brand: BrandProfile,
  targetBrand: BrandProfile | undefined
): { brand: BrandProfile; targetBrand?: BrandProfile } {
  const selectedIds = new Set(session.answers.selectedAssetIds ?? []);
  if (!selectedIds.size) return { brand, targetBrand };
  const selected = (session.availableAssets ?? []).filter((asset) => selectedIds.has(asset.id));
  const sellerImages = selected.filter((asset) => asset.kind === "seller-image").map((asset) => asset.url);
  const targetImages = selected.filter((asset) => asset.kind === "target-image").map((asset) => asset.url);
  const sellerLogo = selected.find((asset) => asset.kind === "seller-logo")?.url;
  const targetLogo = selected.find((asset) => asset.kind === "target-logo")?.url;
  return {
    brand: {
      ...brand,
      logoUrl: sellerLogo ?? brand.logoUrl,
      imageUrls: sellerImages.length || targetImages.length
        ? [...sellerImages, ...targetImages]
        : brand.imageUrls
    },
    targetBrand: targetBrand
      ? {
          ...targetBrand,
          logoUrl: targetLogo ?? targetBrand.logoUrl,
          imageUrls: targetImages.length ? targetImages : targetBrand.imageUrls
        }
      : undefined
  };
}

function draftWithBlockControls(
  draft: ExperienceDraft,
  controls: ExperienceBlockControl[] = []
): ExperienceDraft {
  const next = structuredClone(draft);
  for (const control of controls) {
    if (control.visible === false) {
      const sectionByBlock = {
        thesis: "thesis",
        "decision-lenses": "decision-lenses",
        "guided-questions": "guided-questions"
      } as const;
      const section = sectionByBlock[control.id as keyof typeof sectionByBlock];
      if (section) next.sectionSequence = next.sectionSequence.filter((candidate) => candidate !== section);
    }
    if (control.id === "hero") {
      if (control.eyebrow) next.eyebrow = control.eyebrow;
      if (control.headline) next.headline = control.headline;
      if (control.body) next.subhead = control.body;
      if (control.ctaLabel) next.primaryCta = control.ctaLabel;
    }
    if (control.id === "thesis") {
      if (control.eyebrow) next.sectionLabels.thesis = control.eyebrow;
      if (control.headline) next.thesisHeadline = control.headline;
      if (control.body) next.thesisBody = control.body;
    }
    if (control.id === "decision-lenses") {
      if (control.eyebrow) next.sectionLabels.lenses = control.eyebrow;
      if (control.headline) next.sections[0].headline = control.headline;
      if (control.body) next.sections[0].body = control.body;
    }
    if (control.id === "guided-questions") {
      if (control.eyebrow) next.sectionLabels.journey = control.eyebrow;
      if (control.headline) next.sections[0].proof = control.headline;
      if (control.body) next.narrativeArc = control.body;
    }
    if (control.id === "closing") {
      if (control.eyebrow) next.sectionLabels.close = control.eyebrow;
      if (control.headline) next.closingHeadline = control.headline;
      if (control.body) next.closingBody = control.body;
      if (control.ctaLabel) next.primaryCta = control.ctaLabel;
    }
  }
  return next;
}

function resetGeneratedExperience(session: TryMeSession, detail: string): void {
  if (session.status === "claimed") {
    throw new HttpError(
      409,
      "claimed_session_locked",
      "Create a new version to change a saved experience."
    );
  }
  session.experience = undefined;
  session.experienceSpecRevision = Math.max(
    session.experienceSpecRevision ?? 0,
    session.experienceSpec?.revision ?? 0
  );
  session.experienceSpec = undefined;
  session.qualityReceipt = undefined;
  session.status = "collecting";
  session.stages.story = { status: "pending", detail };
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
        answers: session.answers,
        evidence: session.evidenceItems?.map(({ id, disposition }) => ({ id, disposition })),
        sourceConfirmation: session.sourceConfirmation?.status,
        selectedAudienceRecommendationId: session.selectedAudienceRecommendationId,
        blockControls: session.blockControls,
        curatedSections: session.curatedSections
      })
    )
    .digest("hex");
}

function qualityReceiptFor(session: TryMeSession, artifactRevision: number): QualityReceipt {
  const usableEvidence = session.evidenceItems?.filter(
    (item) => item.disposition !== "excluded"
  ).length ?? 0;
  const sourceRelevant = Boolean(
    session.answers.sourceUrl ||
      session.answers.sourceName ||
      session.answers.eventSource ||
      session.useCase === "abm"
  );
  const sourceConfirmed = session.useCase === "abm"
    ? usableEvidence > 0
    : session.sourceConfirmation?.status === "confirmed";
  const checks: QualityReceipt["checks"] = [
    {
      id: "copy",
      label: "Copy quality",
      status: "passed",
      detail: "The generated copy passed the structured generation quality gates."
    },
    {
      id: "account-evidence",
      label: "Account evidence",
      status:
        session.useCase !== "abm" ? "not-applicable" : usableEvidence >= 2 ? "passed" : "warning",
      detail:
        session.useCase !== "abm"
          ? "Account evidence is not required for this experience type."
          : usableEvidence >= 2
            ? `${usableEvidence} public account signals are available for the story.`
            : "Confirm at least two public account signals before sharing."
    },
    {
      id: "source-confirmation",
      label: "Source confirmation",
      status:
        !sourceRelevant
          ? "not-applicable"
          : sourceConfirmed
            ? "passed"
            : "warning",
      detail:
        !sourceRelevant
          ? "No external source confirmation is required."
          : sourceConfirmed
            ? session.useCase === "abm"
              ? "The page is grounded in the current public account evidence set."
              : "The selected source context was confirmed by the editor."
            : "The editor has not confirmed the selected source context."
    },
    {
      id: "cta",
      label: "CTA readiness",
      status: "passed",
      detail: `The ${session.answers.ctaType ?? "explore"} intent and ${session.answers.ctaStyle ?? "solid"} treatment are ready.`
    },
    {
      id: "structure",
      label: "Experience structure",
      status: "passed",
      detail: "The experience contains a hero, decision path, proof questions, and close."
    }
  ];
  return {
    status: checks.some((check) => check.status === "warning") ? "needs-review" : "passed",
    checkedAt: new Date().toISOString(),
    artifactRevision,
    checks
  };
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

export async function createSession(
  input: CreateSessionInput
): Promise<{ session: PublicTryMeSession; editorToken: string }> {
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
      answers: {
        exampleMode: input.exampleMode,
        exampleKey: input.exampleKey
      },
      audienceSuggestions: [],
      experienceMode: input.exampleMode ? "example" : "custom",
      exampleKey: input.exampleKey,
      audienceRecommendations: [],
      evidenceItems: [],
      availableAssets: [],
      blockControls: [],
      previewAnalytics: { totalInteractions: 0, counts: {} },
      lineage: { rootSessionId: id, versionNumber: 1 },
      curatedSections: [],
      events: []
    },
    "company_domain_submitted",
    { useCase: input.useCase, domain: companyDomain }
  );
  appendEvent(session, "temp_url_created");
  syncCampaignContracts(session);
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

function needsBrandRefresh(session: Pick<TryMeSession, "brand" | "companyDomain" | "experience">): boolean {
  if (!session.brand) return true;
  return !session.experience
    && session.brand.source === "fallback"
    && Boolean(verifiedBrandProfileFor(session.companyDomain));
}

export async function runBrandStage(id: string): Promise<void> {
  assertProductionSessionStore();
  const current = await getSession(id);
  if (!current || !needsBrandRefresh(current)) return;
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
    if (session.companyDomain !== expectedDomain || !needsBrandRefresh(session)) return session;
    if (session.brand?.source === "fallback") {
      appendEvent(session, "brand_harvest_verified_upgrade_started", {
        priorSource: session.brand.source
      });
      delete session.brand;
    }
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
      syncExperienceFoundation(session);
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
      syncExperienceFoundation(session);
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
      syncExperienceFoundation(session);
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
      syncExperienceFoundation(session);
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

function sourceKindFor(session: TryMeSession): NonNullable<TryMeSession["sourceConfirmation"]>["sourceKind"] {
  if (session.answers.sourceUrl) return "public-url";
  if (session.answers.sourceName) return "uploaded-pdf";
  if (session.answers.eventSource) return "event-context";
  return "public-account";
}

function applyAnswerPatch(session: TryMeSession, input: SessionAnswers): void {
  const patch = { ...input };
  const targetWasSupplied = Object.hasOwn(patch, "targetDomain");
  const sourceUrlWasSupplied = Object.hasOwn(patch, "sourceUrl");
  const eventSourceWasSupplied = Object.hasOwn(patch, "eventSource");
  const offerSourceUrlWasSupplied = Object.hasOwn(patch, "offerSourceUrl");
  if (patch.targetDomain) patch.targetDomain = normalizeDomain(patch.targetDomain);
  if (patch.offerSourceUrl) patch.offerSourceUrl = new URL(patch.offerSourceUrl).toString();
  if (
    patch.offerSourceConfirmed &&
    !patch.offerSourceUrl &&
    !session.answers.offerSourceUrl
  ) {
    throw new HttpError(
      409,
      "offer_source_missing",
      "Add a public offer source before confirming it."
    );
  }
  if (patch.sourceUrl && (session.answers.sourceName || session.answers.sourceUploadId)) {
    throw new HttpError(
      409,
      "source_conflict",
      "A PDF source is already being processed for this experience."
    );
  }
  const targetChanged =
    targetWasSupplied && patch.targetDomain !== session.answers.targetDomain;
  const sourceChanged = Boolean(
    (sourceUrlWasSupplied && patch.sourceUrl !== session.answers.sourceUrl) ||
      (eventSourceWasSupplied && patch.eventSource !== session.answers.eventSource)
  );
  session.answers = { ...session.answers, ...patch };
  if (targetWasSupplied && !patch.targetDomain) delete session.answers.targetDomain;
  if (sourceUrlWasSupplied && !patch.sourceUrl) delete session.answers.sourceUrl;
  if (eventSourceWasSupplied && !patch.eventSource) delete session.answers.eventSource;
  if (offerSourceUrlWasSupplied && !patch.offerSourceUrl) {
    delete session.answers.offerSourceUrl;
    delete session.answers.offerSourceTitle;
    delete session.answers.offerSourceConfirmed;
  }
  if (
    offerSourceUrlWasSupplied &&
    patch.offerSourceUrl !== session.campaignOfferSource?.sourceUrl &&
    patch.offerSourceConfirmed === undefined
  ) {
    delete session.answers.offerSourceConfirmed;
  }
  if (patch.exampleMode !== undefined) {
    session.experienceMode = patch.exampleMode ? "example" : "custom";
  }
  if (patch.exampleKey !== undefined) session.exampleKey = patch.exampleKey;

  if (targetChanged) {
    session.targetBrand = undefined;
    session.audienceSuggestions = [];
    session.audienceRecommendations = [];
    session.selectedAudienceRecommendationId = undefined;
    session.evidenceItems = [];
    session.availableAssets = assetsFor(session.brand, undefined);
    if (!patch.audience && !patch.customAudience) {
      session.answers.audience = undefined;
      session.answers.customAudience = undefined;
    }
  }

  if (patch.selectedAssetIds) {
    const availableIds = new Set((session.availableAssets ?? []).map((asset) => asset.id));
    const unknown = patch.selectedAssetIds.find((id) => !availableIds.has(id));
    if (unknown) {
      throw new HttpError(400, "unknown_asset", "Choose an asset from the harvested asset list.");
    }
  }

  syncCampaignContracts(session);

  if (sourceChanged && patch.sourceConfirmed === undefined) {
    delete session.answers.sourceConfirmed;
    session.sourceConfirmation = {
      status: "unconfirmed",
      sourceKind: sourceKindFor(session)
    };
  }
  if (patch.sourceConfirmed !== undefined) {
    session.sourceConfirmation = {
      status: patch.sourceConfirmed ? "confirmed" : "unconfirmed",
      confirmedAt: patch.sourceConfirmed ? new Date().toISOString() : undefined,
      sourceKind: sourceKindFor(session)
    };
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
  if (patch.audience || patch.customAudience) {
    appendEvent(session, "audience_selected", {
      recommendation: session.selectedAudienceRecommendationId ?? null
    });
  }
  if (patch.objective) appendEvent(session, "objective_selected");
  if (patch.sourceUrl || patch.sourceName) appendEvent(session, "source_submitted");
  if (patch.messageBelief || patch.messageAction) appendEvent(session, "message_spine_updated");
  if (patch.ctaType || patch.ctaStyle) appendEvent(session, "cta_configured");
  if (patch.styleVariant || patch.toneVariant || patch.layoutVariant) {
    appendEvent(session, "creative_direction_updated");
  }
  if (patch.selectedAssetIds) {
    appendEvent(session, "asset_selection_updated", { count: patch.selectedAssetIds.length });
  }
}

function completeInputMutation(session: TryMeSession, previousFingerprint: string): void {
  if (storyInputFingerprint(session) !== previousFingerprint) {
    resetGeneratedExperience(
      session,
      "Inputs changed. The next preview will use the latest workspace decisions."
    );
  }
}

export async function patchSessionAnswers(
  id: string,
  patch: SessionAnswers
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean }> {
  assertProductionSessionStore();
  const updated = await updateSession(id, (session) => {
    const previousFingerprint = storyInputFingerprint(session);
    applyAnswerPatch(session, patch);
    completeInputMutation(session, previousFingerprint);
    return session;
  });
  if (!updated) throw new Error("This temporary experience has expired.");
  return {
    session: toPublicSession(updated),
    shouldGenerate: isGenerationReady(updated.useCase, updated.answers)
  };
}

export async function patchSessionWorkspace(
  id: string,
  patch: SessionWorkspacePatch
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean }> {
  assertProductionSessionStore();
  const updated = await updateSession(id, (session) => {
    const previousFingerprint = storyInputFingerprint(session);
    if (session.status === "claimed") {
      throw new HttpError(
        409,
        "claimed_session_locked",
        "Create a new version to change a saved experience."
      );
    }
    if (patch.answers) applyAnswerPatch(session, patch.answers);

    if (patch.selectedAudienceRecommendationId !== undefined) {
      if (patch.selectedAudienceRecommendationId === null) {
        session.selectedAudienceRecommendationId = undefined;
      } else {
        const recommendation = session.audienceRecommendations?.find(
          (candidate) => candidate.id === patch.selectedAudienceRecommendationId
        );
        if (!recommendation) {
          throw new HttpError(
            400,
            "unknown_audience_recommendation",
            "Choose an audience recommendation from the current account brief."
          );
        }
        session.selectedAudienceRecommendationId = recommendation.id;
        applyAnswerPatch(session, {
          audience: recommendation.label,
          customAudience: undefined
        });
        appendEvent(session, "audience_recommendation_selected", {
          recommendationId: recommendation.id
        });
      }
    }

    if (patch.evidenceDecisions) {
      const decisions = new Map(
        patch.evidenceDecisions.map((decision) => [decision.id, decision.disposition])
      );
      const knownIds = new Set((session.evidenceItems ?? []).map((item) => item.id));
      const unknown = patch.evidenceDecisions.find((decision) => !knownIds.has(decision.id));
      if (unknown) {
        throw new HttpError(
          400,
          "unknown_evidence",
          "Choose evidence from the current public account brief."
        );
      }
      session.evidenceItems = (session.evidenceItems ?? []).map((item) => ({
        ...item,
        disposition: decisions.get(item.id) ?? item.disposition
      }));
      session.audienceRecommendations = audienceRecommendationsFor(
        session.audienceSuggestions,
        session.brand,
        session.targetBrand,
        session.evidenceItems
      );
      appendEvent(session, "account_evidence_curated", {
        pinned: session.evidenceItems.filter((item) => item.disposition === "pinned").length,
        excluded: session.evidenceItems.filter((item) => item.disposition === "excluded").length
      });
    }

    if (patch.sourceConfirmation) {
      session.sourceConfirmation = {
        status: patch.sourceConfirmation,
        confirmedAt:
          patch.sourceConfirmation === "confirmed" ? new Date().toISOString() : undefined,
        sourceKind: sourceKindFor(session)
      };
      session.answers.sourceConfirmed = patch.sourceConfirmation === "confirmed";
      appendEvent(session, "source_confirmation_updated", {
        status: patch.sourceConfirmation
      });
    }

    if (patch.offerSourceConfirmation) {
      if (!session.answers.offerSourceUrl) {
        throw new HttpError(
          409,
          "offer_source_missing",
          "Add a public offer source before confirming it."
        );
      }
      session.answers.offerSourceConfirmed = patch.offerSourceConfirmation === "confirmed";
      session.campaignOfferSource = {
        ...(session.campaignOfferSource ?? {
          sourceUrl: session.answers.offerSourceUrl,
          sourceHost: new URL(session.answers.offerSourceUrl).hostname.replace(/^www\./, "")
        }),
        status: patch.offerSourceConfirmation,
        confirmedAt:
          patch.offerSourceConfirmation === "confirmed" ? new Date().toISOString() : undefined
      };
      appendEvent(session, "offer_source_confirmation_updated", {
        status: patch.offerSourceConfirmation
      });
    }

    if (patch.blockControls) {
      const updates = new Map(patch.blockControls.map((control) => [control.id, control]));
      const existing = new Map((session.blockControls ?? []).map((control) => [control.id, control]));
      for (const [id, control] of updates) {
        existing.set(id, { ...existing.get(id), ...control } as ExperienceBlockControl);
      }
      session.blockControls = [...existing.values()];
      appendEvent(session, "block_controls_updated", {
        count: patch.blockControls.length,
        locked: session.blockControls.filter((control) => control.locked).length
      });
    }
    if (patch.curatedSections) {
      session.curatedSections = [...patch.curatedSections].sort(
        (left, right) => left.position - right.position
      );
      appendEvent(session, "curated_sections_updated", {
        count: session.curatedSections.length,
        locked: session.curatedSections.filter((section) => section.locked).length
      });
    }

    syncCampaignContracts(session);

    completeInputMutation(session, previousFingerprint);
    return session;
  });
  if (!updated) throw new Error("This temporary experience has expired.");
  return {
    session: toPublicSession(updated),
    shouldGenerate: isGenerationReady(updated.useCase, updated.answers)
  };
}

export async function recordPreviewInteraction(
  id: string,
  input: PreviewInteractionInput
): Promise<PublicTryMeSession> {
  assertProductionSessionStore();
  const updated = await updateSession(id, (session) => {
    if (session.status === "claimed") {
      throw new HttpError(
        409,
        "claimed_session_locked",
        "Saved experiences use their live analytics stream."
      );
    }
    const at = new Date().toISOString();
    const preview = session.previewAnalytics ?? { totalInteractions: 0, counts: {} };
    preview.totalInteractions += 1;
    preview.lastInteractionAt = at;
    preview.lastElementId = input.elementId;
    preview.counts[input.event] = (preview.counts[input.event] ?? 0) + 1;
    session.previewAnalytics = preview;
    appendEvent(session, `preview_${input.event.replaceAll("-", "_")}`, {
      elementId: input.elementId ?? null,
      hasValue: Boolean(input.value)
    });
    return session;
  });
  if (!updated) throw new Error("This temporary experience has expired.");
  return toPublicSession(updated);
}

export async function duplicateSession(
  id: string,
  input: DuplicateSessionInput
): Promise<{
  session: PublicTryMeSession;
  editorToken: string;
  shouldGenerate: boolean;
}> {
  assertProductionSessionStore();
  const source = await getSession(id);
  if (!source) throw new Error("This temporary experience has expired.");

  const now = new Date().toISOString();
  const nextId = opaqueId();
  const editorToken = opaqueId();
  const sourceLineage = source.lineage ?? {
    rootSessionId: source.id,
    versionNumber: 1
  };
  const next: TryMeSession = {
    ...structuredClone(source),
    id: nextId,
    editorTokenHash: createHash("sha256").update(editorToken).digest("hex"),
    status: "collecting",
    createdAt: now,
    updatedAt: now,
    expiresAt: undefined,
    claimedAt: undefined,
    temporaryUrl: `${config.appUrl}/e/${nextId}`,
    liveUrl: undefined,
    revision: 1,
    stages: {
      brand: source.brand
        ? {
            status: source.brand.source === "fallback" ? "fallback" : "complete",
            completedAt: now,
            detail: "Brand context copied from the source experience."
          }
        : stage("running", "Reading the visual and messaging signals buyers already recognize."),
      audience: source.answers.audience
        ? {
            status: "complete",
            completedAt: now,
            detail: "Audience and account context copied from the source experience.",
            artifact: source.answers.customAudience || source.answers.audience
          }
        : stage("running", "Refining the audience and decision context."),
      story: stage("pending", "Ready to generate this version from the copied workspace.")
    },
    experience: undefined,
    experienceSpecRevision: undefined,
    experienceSpec: undefined,
    qualityReceipt: undefined,
    cockpit: undefined,
    claim: undefined,
    previewAnalytics: { totalInteractions: 0, counts: {} },
    lineage:
      input.mode === "version"
        ? {
            rootSessionId: sourceLineage.rootSessionId,
            parentSessionId: source.id,
            versionNumber: sourceLineage.versionNumber + 1,
            label: input.label
          }
        : {
            rootSessionId: nextId,
            duplicatedFromSessionId: source.id,
            versionNumber: 1,
            label: input.label
          },
    events: []
  };
  appendEvent(next, input.mode === "version" ? "session_version_created" : "session_duplicated", {
    sourceSessionId: source.id,
    versionNumber: next.lineage?.versionNumber ?? 1
  });
  await putSession(next, { ttlSeconds: 3600 });
  return {
    session: toPublicSession(next),
    editorToken,
    shouldGenerate: isGenerationReady(next.useCase, next.answers)
  };
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
    delete session.answers.sourceConfirmed;
    session.sourceConfirmation = {
      status: "unconfirmed",
      sourceKind: "uploaded-pdf"
    };
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
  if (preflight && needsBrandRefresh(preflight)) {
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
    syncCampaignContracts(session);
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
    const generationTargetBrand = curatedTargetBrand(latest, targetBrand);
    const selectedBrands = brandsWithSelectedAssets(latest, brand, generationTargetBrand);
    const generated = await generateExperienceDraft({
      brand: selectedBrands.brand,
      targetBrand: selectedBrands.targetBrand,
      useCase: latest.useCase,
      answers: latest.answers
    });
    const controlledDraft = draftWithBlockControls(generated.draft, latest.blockControls);
    syncCampaignContracts(latest);
    const experienceSpec = buildExperienceSpec(
      latest,
      controlledDraft,
      selectedBrands.brand,
      selectedBrands.targetBrand
    );
    const webDraft = draftFromExperienceSpec(experienceSpec);
    const generationQualityReceipt = qualityReceiptFor(latest, latest.revision + 1);
    const imageSources = imageDeliverySources(latest, brand, targetBrand);
    const renderBrand = brandWithFirstPartyImages(
      id,
      selectedBrands.brand,
      imageSources,
      generationQualityReceipt.artifactRevision
    );
    const renderTargetBrand = selectedBrands.targetBrand
      ? brandWithFirstPartyImages(
          id,
          selectedBrands.targetBrand,
          imageSources,
          generationQualityReceipt.artifactRevision
        )
      : undefined;
    const html = renderExperienceHtml({
      draft: webDraft,
      brand: renderBrand,
      targetBrand: renderTargetBrand,
      useCase: latest.useCase,
      answers: latest.answers,
      themeUrl: process.env.FOLLOZE_THEME_URL,
      fontDeliveryUrls: fontDeliveryUrls(id, selectedBrands.brand),
      qualityReceipt: generationQualityReceipt
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
          ...webDraft,
          html,
          generationSource: generated.source,
          artifactRevision: session.revision + 1,
          artifactDigest: createHash("sha256").update(html).digest("hex")
        };
        session.experienceSpecRevision = experienceSpec.revision;
        session.experienceSpec = experienceSpec;
        session.qualityReceipt = generationQualityReceipt;
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
          artifact: controlledDraft.narrativeArc
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

    if (needsBrandRefresh(session)) {
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
        session.cockpit = {
          savedAt: claimedAt,
          companyDomain: session.companyDomain,
          targetDomain: session.answers.targetDomain,
          audience: session.answers.customAudience || session.answers.audience,
          objective: session.answers.objective,
          ctaType: session.answers.ctaType,
          ctaStyle: session.answers.ctaStyle,
          styleVariant: session.answers.styleVariant,
          toneVariant: session.answers.toneVariant,
          layoutVariant: session.answers.layoutVariant,
          qualityStatus: session.qualityReceipt?.status,
          artifactRevision: session.experience?.artifactRevision ?? session.revision,
          versionNumber: session.lineage?.versionNumber ?? 1,
          previewInteractions: session.previewAnalytics?.totalInteractions ?? 0
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
