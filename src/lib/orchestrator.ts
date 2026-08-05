import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  assessBrandIdentity,
  audienceSuggestionsFor,
  narrativeProfileFor,
  withBrandIdentity
} from "@/lib/brand-intelligence";
import { assessBrandReadiness } from "@/lib/brand-readiness";
import { config } from "@/lib/config";
import type { SourceArtifact } from "@/lib/content-intelligence";
import { fetchPublicUrlSourceArtifact } from "@/lib/content-url";
import {
  buildExperienceSpec,
  draftFromExperienceSpec,
  syncCampaignContracts
} from "@/lib/experience-contract";
import {
  sourceGroundingFor,
  targetAccountEvidenceFor
} from "@/lib/generation/campaign-context";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { HttpError, logServerError } from "@/lib/http";
import {
  brandWithFirstPartyImages,
  brandWithSessionLogoDelivery,
  imageDeliverySources
} from "@/lib/image-delivery";
import { harvestBrand, fallbackBrand } from "@/lib/integrations/brand-harvester";
import { sendClaimEmail } from "@/lib/integrations/email";
import {
  deterministicDraft,
  generateExperienceDraft,
  SourceFetchError
} from "@/lib/integrations/openai";
import { leadStoreMode, recordLeadCapture, updateLeadOutcome } from "@/lib/lead-store";
import { emitObservabilityLog } from "@/lib/observability";
import {
  acquireSessionLease,
  getSession,
  putSession,
  sessionStoreIsProductionSafe,
  toPublicSession,
  updateSession
} from "@/lib/session-store";
import { appendEvent } from "@/lib/telemetry";
import { traceIdForSession } from "@/lib/trace-store";
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

// The model may use nearly the full configured 58-second deadline. Keep the
// lease and stale-at threshold comfortably beyond that work so a slow, valid
// generation cannot be duplicated by recovery polling.
const STORY_GENERATION_LEASE_SECONDS = 90;
const STORY_GENERATION_STALE_MS = STORY_GENERATION_LEASE_SECONDS * 1_000;

function opaqueId(): string {
  return randomBytes(24).toString("base64url");
}

function stableId(prefix: string, ...parts: Array<string | undefined>): string {
  return `${prefix}_${createHash("sha256")
    .update(parts.filter(Boolean).join("\u0000"))
    .digest("hex")
    .slice(0, 16)}`;
}

function trustedBrandProfile(
  profile: BrandProfile,
  expectedDomain: string,
  userConfirmed = false
): { profile: BrandProfile; usedFallback: boolean } {
  const assessed = withBrandIdentity(profile, expectedDomain, userConfirmed);
  if (assessed.identity?.confirmationStatus !== "rejected") {
    return { profile: assessed, usedFallback: false };
  }
  const safeFallback = withBrandIdentity(fallbackBrand(expectedDomain), expectedDomain);
  return {
    profile: {
      ...safeFallback,
      identity: {
        ...safeFallback.identity!,
        canonicalName: safeFallback.companyName,
        confidence: "low",
        confirmationStatus: "needs-confirmation",
        confirmedBy: undefined,
        reasons: [
          ...assessed.identity.reasons,
          "Untrusted harvested identity was replaced with a neutral domain-based fallback."
        ],
        provenance: [...assessed.identity.provenance, ...safeFallback.identity!.provenance]
      }
    },
    usedFallback: true
  };
}

function sourceFingerprintForAnswers(answers: SessionAnswers): string | undefined {
  const source = answers.sourceName || answers.sourceUrl || answers.eventSource || answers.targetDomain;
  if (!source) return undefined;
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceUrl: answers.sourceUrl ?? null,
        sourceName: answers.sourceName ?? null,
        sourceTitle: answers.sourceTitle ?? null,
        sourceUploadId: answers.sourceUploadId ?? null,
        eventSource: answers.eventSource ?? null,
        targetDomain: answers.targetDomain ?? null
      })
    )
    .digest("hex");
}

function evidenceItemsFor(
  useCase: UseCase,
  sellerBrand: BrandProfile | undefined,
  targetBrand: BrandProfile | undefined,
  existing: SessionEvidenceItem[] = []
): SessionEvidenceItem[] {
  const evidenceBrand = useCase === "abm" ? targetBrand : sellerBrand;
  const entityRole: NonNullable<SessionEvidenceItem["entityRole"]> =
    useCase === "abm" ? "target" : "seller";
  const priorDisposition = new Map(existing.map((item) => [item.id, item.disposition]));
  return targetAccountEvidenceFor(evidenceBrand).map((item) => {
    const id = stableId("evidence", evidenceBrand?.domain, item.type, item.text);
    return {
      ...item,
      id,
      entityRole,
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
  const evidenceBrand = target ?? seller;
  const evidenceDomain = evidenceBrand?.domain.toLocaleLowerCase().replace(/^www\./, "");
  const expectedEntityRole: NonNullable<SessionEvidenceItem["entityRole"]> = target
    ? "target"
    : "seller";
  const usableEvidence = evidenceItems.filter((item) => {
    if (
      item.disposition === "excluded" ||
      item.entityRole !== expectedEntityRole ||
      !evidenceDomain
    ) return false;
    try {
      const host = new URL(item.sourceUrl).hostname.toLocaleLowerCase().replace(/^www\./, "");
      return host === evidenceDomain || host.endsWith(`.${evidenceDomain}`);
    } catch {
      return false;
    }
  });
  const sellerProfile = seller ? narrativeProfileFor(seller) : null;
  const targetIdentity = target
    ? target.identity ?? assessBrandIdentity(target, target.domain)
    : undefined;
  const sellerIdentity = seller
    ? seller.identity ?? assessBrandIdentity(seller, seller.domain)
    : undefined;
  return suggestions.map((label, index) => {
    const evidence = usableEvidence[index % Math.max(usableEvidence.length, 1)];
    const evidenceFocus = evidence?.text
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/g, "")
      .slice(0, 120);
    const evidenceSignal = evidence?.signals[0] ?? evidenceFocus;
    const companySpecific = Boolean(
      seller &&
        target &&
        target.source !== "fallback" &&
        targetIdentity?.confirmationStatus === "confirmed" &&
        usableEvidence.length
    );
    const sellerSpecific = Boolean(
      seller &&
        !target &&
        seller.source !== "fallback" &&
        sellerIdentity?.confirmationStatus === "confirmed" &&
        usableEvidence.length
    );
    const sellerMechanism = sellerProfile?.offerLabel.toLocaleLowerCase() ?? "offering";
    return {
      id: stableId("audience", seller?.domain, target?.domain, label),
      label,
      rationale: companySpecific
        ? `${target!.companyName}'s public focus: ${evidenceFocus}. That ${evidenceSignal || "operating context"} evidence makes this group relevant to evaluating ${seller!.companyName}'s ${sellerMechanism}.`
        : sellerSpecific
          ? `${seller!.companyName}'s public evidence: ${evidenceFocus}. That ${evidenceSignal || "operating context"} signal makes this group relevant to the ${sellerMechanism}.`
        : target
          ? `A role hypothesis for ${target.companyName}; confirm the account identity and public evidence before using it in the story.`
          : `A seller-category starting point until a target account and its public evidence are available.`,
      evidenceItemIds: evidence ? [evidence.id] : [],
      confidence: companySpecific || sellerSpecific
        ? (usableEvidence.length >= 2 ? "high" : "medium")
        : "hypothesis",
      source: companySpecific
        ? "seller-target-synthesis"
        : sellerSpecific
          ? "seller-public-evidence"
          : "seller-category-fallback",
      confirmationStatus: companySpecific || sellerSpecific ? "confirmed" : "needs-confirmation",
      ...(target ? { targetName: target.companyName } : {}),
      ...(evidenceFocus ? { evidenceSummary: evidenceFocus } : {})
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
  session.evidenceItems = evidenceItemsFor(
    session.useCase,
    session.brand,
    session.targetBrand,
    session.evidenceItems
  );
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
      imageUrls: sellerImages.length ? sellerImages : brand.imageUrls
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

const CORE_EXPERIENCE_BLOCK_IDS = new Set<ExperienceBlockControl["id"]>([
  "hero",
  "thesis",
  "decision-lenses",
  "guided-questions",
  "closing"
]);

function normalizeCoreBlockControls(
  controls: ExperienceBlockControl[] = []
): ExperienceBlockControl[] {
  return controls.map((control) =>
    CORE_EXPERIENCE_BLOCK_IDS.has(control.id)
      ? { ...control, visible: true }
      : { ...control }
  );
}

function draftWithBlockControls(
  draft: ExperienceDraft,
  controls: ExperienceBlockControl[] = []
): ExperienceDraft {
  const next = structuredClone(draft);
  for (const control of normalizeCoreBlockControls(controls)) {
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
  // Keep revision N visible while revision N+1 is assembled. The replacement
  // is committed atomically only after generation, contract construction, and
  // rendering all succeed.
  session.experienceSpecRevision = Math.max(
    session.experienceSpecRevision ?? 0,
    session.experienceSpec?.revision ?? 0
  );
  session.status = "collecting";
  session.stages.story = {
    status: "pending",
    detail: session.experience
      ? `${detail} Your current preview remains available while the replacement is built.`
      : detail,
    ...(session.experience ? { artifact: `Preview revision ${session.experience.artifactRevision}` } : {})
  };
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
        sourceArtifact: session.sourceArtifact
          ? {
              digest: session.sourceArtifact.digest,
              status: session.sourceArtifact.status,
              confidence: session.sourceArtifact.confidence
            }
          : null,
        evidence: session.evidenceItems?.map(({ id, disposition }) => ({ id, disposition })),
        sourceConfirmation: session.sourceConfirmation?.status,
        selectedAudienceRecommendationId: session.selectedAudienceRecommendationId,
        blockControls: session.blockControls,
        curatedSections: session.curatedSections
      })
    )
    .digest("hex");
}

function generationTrustFailureFor(input: {
  draft: ExperienceDraft;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  useCase: UseCase;
  answers: SessionAnswers;
}): string | undefined {
  const { draft, brand, targetBrand, useCase, answers } = input;
  const visible = [
    draft.title,
    draft.eyebrow,
    draft.headline,
    draft.subhead,
    draft.thesisHeadline,
    draft.thesisBody,
    draft.narrativeArc,
    draft.closingHeadline,
    draft.closingBody,
    ...draft.sections.flatMap((section) => [section.headline, section.body, section.proof])
  ].join(" ");
  if (!visible.includes(brand.companyName)) return "missing_seller_identity";
  if (useCase === "abm") {
    if (!targetBrand || !visible.includes(targetBrand.companyName)) return "missing_target_identity";
    const identity = targetBrand.identity ?? assessBrandIdentity(targetBrand, answers.targetDomain ?? targetBrand.domain);
    if (identity.confirmationStatus === "rejected") return "rejected_target_identity";
  }
  if (
    useCase !== "content" &&
    /\b(trusted by|customers? (?:achieve|report|see)|proven to|#1|market[- ]leading)\b/i.test(visible)
  ) {
    const evidence = [brand.description, brand.publicContext, ...brand.publicTopics]
      .filter(Boolean)
      .join(" ");
    if (!/\b(trusted by|customers?|proven|#1|market[- ]leading)\b/i.test(evidence)) {
      return "unsupported_proof_claim";
    }
  }
  if (useCase === "content") {
    const grounding = sourceGroundingFor({ answers });
    const meaningfulTopics = grounding.topics.filter((topic) => topic.length >= 4);
    if (
      grounding.confidence !== "low" &&
      meaningfulTopics.length > 0 &&
      !meaningfulTopics.some((topic) =>
        visible.toLocaleLowerCase().includes(topic.toLocaleLowerCase())
      )
    ) {
      return "unrelated_source_topic";
    }
  }
  return undefined;
}

function qualityReceiptFor(
  session: TryMeSession,
  artifactRevision: number,
  trustFallbackReason?: string
): QualityReceipt {
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
    : session.useCase === "content" && session.sourceArtifact
      ? session.sourceArtifact.status === "ready" || session.sourceArtifact.status === "needs-review"
      : session.sourceConfirmation?.status === "confirmed";
  const checks: QualityReceipt["checks"] = [
    {
      id: "copy",
      label: "Copy quality",
      status: "passed",
      detail: trustFallbackReason
        ? `A safe deterministic draft replaced copy rejected by the ${trustFallbackReason} trust gate.`
        : "The generated copy passed the structured generation quality gates."
    },
    {
      id: "identity",
      label: "Company identity",
      status:
        session.brand?.identity?.confirmationStatus === "needs-confirmation" ||
        session.targetBrand?.identity?.confirmationStatus === "needs-confirmation"
          ? "warning"
          : "passed",
      detail:
        session.brand?.identity?.confirmationStatus === "needs-confirmation" ||
        session.targetBrand?.identity?.confirmationStatus === "needs-confirmation"
          ? "Confirm the low-confidence company identity before sharing."
          : "Seller and target evidence remain attached to their submitted domains."
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
      id: "source-grounding",
      label: "Source grounding",
      status:
        session.useCase !== "content"
          ? "not-applicable"
          : !session.sourceArtifact ||
              session.sourceArtifact.status === "failed" ||
              session.sourceArtifact.status === "unreadable" ||
              session.sourceArtifact.understanding.claims.length < 2
            ? "warning"
            : "passed",
      detail:
        session.useCase !== "content"
          ? "A source asset is not required for this experience type."
          : session.sourceArtifact
            ? `${session.sourceArtifact.diagnostics.claimCount} cited source claims were extracted with ${session.sourceArtifact.confidence} confidence.`
            : sourceGroundingFor({ answers: session.answers }).reason
    },
    {
      id: "claims",
      label: "Claim support",
      status: "passed",
      detail: trustFallbackReason
        ? "Unsupported or unrelated copy was replaced with a bounded fallback."
        : "Visible claims remain bounded by the submitted source and public company evidence."
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

function durationSince(startedAt: string | undefined): number {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  return Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
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
    return Boolean(
      answers.campaignType &&
      answers.promotedOffer?.trim() &&
      (answers.campaignType !== "event" || answers.eventSource)
    );
  }
  return Boolean(answers.sourceUrl || answers.sourceName);
}

export async function createSession(
  input: CreateSessionInput
): Promise<{ session: PublicTryMeSession; editorToken: string; traceId: string }> {
  assertProductionSessionStore();
  const companyDomain = normalizeDomain(input.companyDomain);
  const now = new Date().toISOString();
  const id = opaqueId();
  const editorToken = opaqueId();
  const session: TryMeSession = appendEvent(
    {
      id,
      traceId: opaqueId(),
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
  return { session: toPublicSession(session), editorToken, traceId: session.traceId! };
}

export async function canEditSession(id: string, editorToken: string | undefined): Promise<boolean> {
  if (!editorToken) return false;
  const session = await getSession(id);
  if (!session) return false;
  const supplied = Buffer.from(createHash("sha256").update(editorToken).digest("hex"));
  const expected = Buffer.from(session.editorTokenHash);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function brandProfileNeedsRefresh(
  profile: BrandProfile | undefined,
  expectedDomain: string,
  hasExperience: boolean
): boolean {
  if (!profile) return true;
  if (hasExperience) return false;
  if (profile.logoUrl || profile.portableLogo) return false;
  if (verifiedBrandProfileFor(expectedDomain)?.logoUrl) return true;
  if (profile.source === "fallback") return false;
  return profile.diagnostics?.logo.resolutionComplete !== true;
}

function needsBrandRefresh(session: Pick<TryMeSession, "brand" | "companyDomain" | "experience">): boolean {
  return brandProfileNeedsRefresh(
    session.brand,
    session.companyDomain,
    Boolean(session.experience)
  );
}

function needsTargetBrandRefresh(
  session: Pick<TryMeSession, "targetBrand" | "experience">,
  expectedDomain: string
): boolean {
  if (session.targetBrand?.domain !== expectedDomain) return true;
  return brandProfileNeedsRefresh(
    session.targetBrand,
    expectedDomain,
    Boolean(session.experience)
  );
}

function completedLogoResolution(profile: BrandProfile): BrandProfile {
  return {
    ...profile,
    diagnostics: {
      ...profile.diagnostics,
      logo: {
        strategy: profile.diagnostics?.logo.strategy ?? (profile.logoUrl ? "remote-profile" : "none"),
        imageCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
        rejectedImageCount: profile.diagnostics?.logo.rejectedImageCount ?? 0,
        inlineSvgCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
        selectedScore: profile.diagnostics?.logo.selectedScore,
        resolutionComplete: true
      },
      palette: profile.diagnostics?.palette
        ? { ...profile.diagnostics.palette, resolutionComplete: true }
        : {
            strategy: "fallback",
            confidence: "low",
            candidateCount: profile.colors.length,
            semanticCandidateCount: 0,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0,
            resolutionComplete: true
          }
    }
  };
}

async function resumeStoryAfterBrandStage(id: string): Promise<void> {
  const current = await getSession(id);
  // A brand/logo refresh must never turn a fail-closed source or generation
  // error into an implicit retry. Explicit retry controls own that lifecycle.
  if (
    !current ||
    current.status === "generation_failed" ||
    current.stages.story.status === "failed"
  ) return;
  await runStoryStage(id);
}

function hasTerminalStoryFailure(
  session: Pick<TryMeSession, "status" | "stages"> | null | undefined
): boolean {
  return session?.status === "generation_failed" || session?.stages.story.status === "failed";
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
    if (session.brand) {
      appendEvent(
        session,
        session.brand.source === "fallback"
          ? "brand_harvest_verified_upgrade_started"
          : "brand_logo_refresh_started",
        { priorSource: session.brand.source }
      );
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
    const harvested = await harvestBrand(expectedDomain);
    const trusted = trustedBrandProfile(harvested, expectedDomain);
    const profile = brandWithSessionLogoDelivery(id, "seller", trusted.profile);
    const readiness = profile.readiness ?? assessBrandReadiness(profile);
    await updateSession(id, (session) => {
      if (
        session.companyDomain !== expectedDomain ||
        session.stages.brand.attemptId !== attemptId
      ) {
        return session;
      }
      session.brand = profile;
      session.audienceSuggestions = audienceSuggestionsFor(profile, session.targetBrand, {
        promotedOffer: session.answers.promotedOffer,
        campaignType: session.answers.campaignType,
        objective: session.answers.objective
      });
      syncExperienceFoundation(session);
      session.stages.brand = {
        status: trusted.usedFallback || readiness.status !== "ready" ? "fallback" : "complete",
        startedAt: session.stages.brand.startedAt,
        completedAt: new Date().toISOString(),
        detail: trusted.usedFallback
          ? "The harvested identity did not match the submitted domain. Confirm the safe fallback before sharing."
          : readiness.status === "ready"
            ? "Official identity, logo, and semantic palette found."
            : `Brand evidence is incomplete: ${readiness.reasons.join(" ")}`,
        artifact: readiness.status === "ready"
          ? `${profile.companyName} · official logo · ${profile.colors.slice(0, 4).join(" · ")}`
          : `${profile.companyName} · review brand evidence`
      };
      appendEvent(session, "brand_harvest_completed", {
        attemptId,
        source: profile.source,
        identityConfidence: profile.identity?.confidence ?? "unknown",
        identityFallback: trusted.usedFallback,
        durationMs: durationSince(session.stages.brand.startedAt),
        logoStrategy: profile.diagnostics?.logo.strategy ?? (profile.logoUrl ? "remote-profile" : "none"),
        logoAvailable: Boolean(profile.logoUrl || profile.portableLogo),
        logoCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
        inlineLogoCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
        stylesheetAttempted: profile.diagnostics?.stylesheetAttempted ?? 0,
        stylesheetSucceeded: profile.diagnostics?.stylesheetSucceeded ?? 0,
        colorCount: profile.colors.length,
        brandReadiness: readiness.status,
        paletteConfidence: profile.diagnostics?.palette?.confidence ?? "unknown"
      });
      if (trusted.usedFallback) {
        appendEvent(session, "brand_identity_rejected", { domain: expectedDomain });
      }
      appendEvent(session, "audience_hypotheses_ready", {
        count: session.audienceSuggestions.length,
        categorySource: profile.source
      });
      return session;
    });
  } catch (error) {
    const failedSession = await getSession(id);
    const requestId = logServerError(error, {
      sessionId: id,
      traceId: failedSession ? traceIdForSession(failedSession) : undefined,
      operation: "seller_brand_harvest",
      code: "brand_fetch_fallback",
      details: { domain: expectedDomain }
    });
    await updateSession(id, (session) => {
      if (
        session.companyDomain !== expectedDomain ||
        session.stages.brand.attemptId !== attemptId
      ) {
        return session;
      }
      session.brand = session.brand
        ? completedLogoResolution(session.brand)
        : withBrandIdentity(fallbackBrand(expectedDomain), expectedDomain);
      session.audienceSuggestions = audienceSuggestionsFor(session.brand, session.targetBrand, {
        promotedOffer: session.answers.promotedOffer,
        campaignType: session.answers.campaignType,
        objective: session.answers.objective
      });
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
        attemptId,
        error: error instanceof Error ? error.name : "unknown",
        requestId,
        durationMs: durationSince(session.stages.brand.startedAt)
      });
      return session;
    });
  }
  await resumeStoryAfterBrandStage(id);
}

export async function runTargetBrandStage(id: string): Promise<void> {
  assertProductionSessionStore();
  const current = await getSession(id);
  const expectedDomain = current?.answers.targetDomain;
  if (
    !current ||
    !expectedDomain ||
    !needsTargetBrandRefresh(current, expectedDomain)
  ) return;

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
    if (
      session.answers.targetDomain !== expectedDomain ||
      !needsTargetBrandRefresh(session, expectedDomain)
    ) return session;
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
    const harvested = await harvestBrand(expectedDomain);
    const trusted = trustedBrandProfile(harvested, expectedDomain);
    const profile = brandWithSessionLogoDelivery(id, "target", trusted.profile);
    const readiness = profile.readiness ?? assessBrandReadiness(profile);
    await updateSession(id, (session) => {
      if (
        session.answers.targetDomain !== expectedDomain ||
        session.stages.audience.attemptId !== attemptId
      ) {
        return session;
      }
      session.targetBrand = profile;
      if (session.brand) {
        session.audienceSuggestions = audienceSuggestionsFor(session.brand, profile, {
          promotedOffer: session.answers.promotedOffer,
          campaignType: session.answers.campaignType,
          objective: session.answers.objective
        });
      }
      syncExperienceFoundation(session);
      session.stages.audience = {
        status: session.answers.audience ? "complete" : "running",
        attemptId,
        startedAt: session.stages.audience.startedAt,
        completedAt: session.answers.audience ? new Date().toISOString() : undefined,
        detail: session.answers.audience
          ? readiness.status === "ready"
            ? "Audience and account context aligned."
            : "Audience selected; brand evidence still needs review."
          : readiness.status === "ready"
            ? `Account context found for ${profile.companyName}.`
            : `Account context found for ${profile.companyName}; brand evidence is incomplete.`,
        artifact: session.answers.audience
          ? `${session.answers.customAudience || session.answers.audience} · ${profile.companyName}`
          : readiness.status === "ready"
            ? `${profile.companyName} · public account context ready`
            : `${profile.companyName} · public account context captured · brand review needed`
      };
      appendEvent(session, "target_harvest_completed", {
        domain: expectedDomain,
        attemptId,
        source: profile.source,
        identityConfidence: profile.identity?.confidence ?? "unknown",
        identityFallback: trusted.usedFallback,
        durationMs: durationSince(session.stages.audience.startedAt),
        logoStrategy: profile.diagnostics?.logo.strategy ?? (profile.logoUrl ? "remote-profile" : "none"),
        logoAvailable: Boolean(profile.logoUrl || profile.portableLogo),
        logoCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
        inlineLogoCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
        stylesheetAttempted: profile.diagnostics?.stylesheetAttempted ?? 0,
        stylesheetSucceeded: profile.diagnostics?.stylesheetSucceeded ?? 0,
        colorCount: profile.colors.length,
        brandReadiness: readiness.status,
        paletteConfidence: profile.diagnostics?.palette?.confidence ?? "unknown"
      });
      if (trusted.usedFallback) {
        appendEvent(session, "target_identity_rejected", { domain: expectedDomain });
      }
      appendEvent(session, "audience_hypotheses_refined", {
        domain: expectedDomain,
        count: session.audienceSuggestions.length,
        sellerCategorySource: session.brand?.source ?? "unknown",
        targetCategorySource: profile.source
      });
      return session;
    });
  } catch (error) {
    const failedSession = await getSession(id);
    const requestId = logServerError(error, {
      sessionId: id,
      traceId: failedSession ? traceIdForSession(failedSession) : undefined,
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
      session.targetBrand = session.targetBrand?.domain === expectedDomain
        ? completedLogoResolution(session.targetBrand)
        : withBrandIdentity(fallbackBrand(expectedDomain), expectedDomain);
      if (session.brand) {
        session.audienceSuggestions = audienceSuggestionsFor(session.brand, session.targetBrand, {
          promotedOffer: session.answers.promotedOffer,
          campaignType: session.answers.campaignType,
          objective: session.answers.objective
        });
      }
      syncExperienceFoundation(session);
      appendEvent(session, "target_harvest_failed", {
        domain: expectedDomain,
        attemptId,
        error: error instanceof Error ? error.name : "unknown",
        requestId,
        durationMs: durationSince(session.stages.audience.startedAt)
      });
      return session;
    });
  }
  await resumeStoryAfterBrandStage(id);
}

export async function runSourceIntelligenceStage(id: string): Promise<void> {
  const preflight = await getSession(id);
  const sourceUrl = preflight?.useCase === "content" ? preflight.answers.sourceUrl : undefined;
  if (!preflight || !sourceUrl || preflight.sourceArtifact) return;

  const lease = await acquireSessionLease(id, `source-intelligence:${sourceUrl}`, 30);
  if (!lease) return;
  const attemptId = opaqueId();
  try {
    await updateSession(id, (session) => {
      if (session.useCase !== "content" || session.answers.sourceUrl !== sourceUrl || session.sourceArtifact) {
        return session;
      }
      appendEvent(session, "source_intelligence_started", { attemptId, kind: "public-url" });
      return session;
    });
    const sourceArtifact = await fetchPublicUrlSourceArtifact(sourceUrl, {
      timeoutMs: 12_000,
      maxBytes: 2_000_000
    });
    await updateSession(id, (session) => {
      if (session.useCase !== "content" || session.answers.sourceUrl !== sourceUrl || session.sourceArtifact) {
        return session;
      }
      session.sourceArtifact = sourceArtifact;
      if (sourceArtifact.content.title) session.answers.sourceTitle = sourceArtifact.content.title;
      const rejected = sourceArtifact.status === "failed" || sourceArtifact.status === "unreadable";
      session.sourceConfirmation = {
        status: rejected ? "rejected" : "confirmed",
        confirmedAt: rejected ? undefined : new Date().toISOString(),
        sourceKind: "public-url",
        provenance: "system-extracted"
      };
      appendEvent(session, "source_intelligence_completed", {
        attemptId,
        status: sourceArtifact.status,
        confidence: sourceArtifact.confidence,
        extractionMethod: sourceArtifact.extraction.method,
        claimCount: sourceArtifact.diagnostics.claimCount,
        citationCount: sourceArtifact.diagnostics.citationCount
      });
      return session;
    });
  } catch (error) {
    const failedSession = await getSession(id);
    logServerError(error, {
      sessionId: id,
      traceId: failedSession ? traceIdForSession(failedSession) : undefined,
      operation: "source_intelligence",
      code: "source_intelligence_failed",
      details: { attemptId }
    });
  } finally {
    await releaseLeaseSafely(lease, id, "source_intelligence");
  }
}

function sourceKindFor(session: TryMeSession): NonNullable<TryMeSession["sourceConfirmation"]>["sourceKind"] {
  if (session.answers.sourceUrl) return "public-url";
  if (session.answers.sourceName) return "uploaded-pdf";
  if (session.answers.eventSource) return "event-context";
  return "public-account";
}

export function inferPublicSourceTitle(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    const segment = url.pathname.split("/").filter(Boolean).at(-1);
    if (!segment) return undefined;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      decoded = segment;
    }
    const cleaned = decoded
      .replace(/\.[a-z0-9]{1,8}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || /^(?:index|home|default)$/i.test(cleaned)) return undefined;
    return cleaned
      .split(" ")
      .map((word) => /^(?:ai|api|abm|roi|pdf)$/i.test(word)
        ? word.toLocaleUpperCase()
        : `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`)
      .join(" ")
      .slice(0, 120);
  } catch {
    return undefined;
  }
}

function applyAnswerPatch(session: TryMeSession, input: SessionAnswers): void {
  const patch = { ...input };
  const targetWasSupplied = Object.hasOwn(patch, "targetDomain");
  const sourceUrlWasSupplied = Object.hasOwn(patch, "sourceUrl");
  const sourceNameWasSupplied = Object.hasOwn(patch, "sourceName");
  const sourceTitleWasSupplied = Object.hasOwn(patch, "sourceTitle");
  const sourceUploadWasSupplied = Object.hasOwn(patch, "sourceUploadId");
  const eventSourceWasSupplied = Object.hasOwn(patch, "eventSource");
  const sourceWasSupplied =
    sourceUrlWasSupplied ||
    sourceNameWasSupplied ||
    sourceTitleWasSupplied ||
    sourceUploadWasSupplied ||
    eventSourceWasSupplied;
  const offerSourceUrlWasSupplied = Object.hasOwn(patch, "offerSourceUrl");
  const previousSourceFingerprint = sourceFingerprintForAnswers(session.answers);
  if (patch.targetDomain) patch.targetDomain = normalizeDomain(patch.targetDomain);
  if (patch.sourceUrl) {
    patch.sourceUrl = new URL(patch.sourceUrl).toString();
    if (!sourceTitleWasSupplied) {
      patch.sourceTitle = inferPublicSourceTitle(patch.sourceUrl);
    }
  }
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
  if (patch.sourceUrl) {
    delete session.answers.sourceName;
    delete session.answers.sourceTitle;
    delete session.answers.sourceOpenAIFileId;
    delete session.answers.sourceUploadId;
    delete session.answers.sourceUploadReservedAt;
  } else if (patch.sourceName || patch.sourceUploadId) {
    delete session.answers.sourceUrl;
  }
  const targetChanged =
    targetWasSupplied && patch.targetDomain !== session.answers.targetDomain;
  session.answers = { ...session.answers, ...patch };
  if (targetWasSupplied && !patch.targetDomain) delete session.answers.targetDomain;
  if (sourceUrlWasSupplied && !patch.sourceUrl) delete session.answers.sourceUrl;
  if (sourceNameWasSupplied && !patch.sourceName) {
    delete session.answers.sourceName;
    delete session.answers.sourceTitle;
    delete session.answers.sourceOpenAIFileId;
    delete session.answers.sourceUploadId;
    delete session.answers.sourceUploadReservedAt;
  }
  if (sourceTitleWasSupplied && !patch.sourceTitle) delete session.answers.sourceTitle;
  if (sourceUploadWasSupplied && !patch.sourceUploadId) {
    delete session.answers.sourceUploadId;
    delete session.answers.sourceUploadReservedAt;
    delete session.answers.sourceOpenAIFileId;
  }
  if (eventSourceWasSupplied && !patch.eventSource) delete session.answers.eventSource;
  const currentSourceFingerprint = sourceFingerprintForAnswers(session.answers);
  const sourceChanged = sourceWasSupplied && currentSourceFingerprint !== previousSourceFingerprint;
  if (sourceChanged) session.sourceArtifact = undefined;
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
    if (patch.targetConfirmed === undefined) delete session.answers.targetConfirmed;
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

  if (
    (sourceChanged || (targetChanged && session.useCase === "abm")) &&
    patch.sourceConfirmed === undefined
  ) {
    delete session.answers.sourceConfirmed;
    delete session.answers.sourceTopicConfirmed;
    session.sourceConfirmation = {
      status: "unconfirmed",
      sourceKind: sourceKindFor(session),
      provenance: "user-submitted"
    };
  }
  if (patch.sourceConfirmed !== undefined) {
    if (!currentSourceFingerprint && patch.sourceConfirmed) {
      throw new HttpError(409, "source_missing", "Add a source before confirming it.");
    }
    session.sourceConfirmation = {
      status: patch.sourceConfirmed ? "confirmed" : "unconfirmed",
      confirmedAt: patch.sourceConfirmed ? new Date().toISOString() : undefined,
      sourceKind: sourceKindFor(session),
      provenance: patch.sourceConfirmed ? "user-confirmed" : "user-submitted"
    };
  }
  session.sourceFingerprint = currentSourceFingerprint;

  syncCampaignContracts(session);

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
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean; traceId: string }> {
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
    shouldGenerate: isGenerationReady(updated.useCase, updated.answers),
    traceId: traceIdForSession(updated)
  };
}

export async function patchSessionWorkspace(
  id: string,
  patch: SessionWorkspacePatch
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean; traceId: string }> {
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
    if (session.blockControls?.length) {
      session.blockControls = normalizeCoreBlockControls(session.blockControls);
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
      const sourceFingerprint = sourceFingerprintForAnswers(session.answers);
      if (!sourceFingerprint && patch.sourceConfirmation === "confirmed") {
        throw new HttpError(409, "source_missing", "Add a source before confirming it.");
      }
      session.sourceConfirmation = {
        status: patch.sourceConfirmation,
        confirmedAt:
          patch.sourceConfirmation === "confirmed" ? new Date().toISOString() : undefined,
        sourceKind: sourceKindFor(session),
        provenance:
          patch.sourceConfirmation === "confirmed" ? "user-confirmed" : "user-submitted"
      };
      session.sourceFingerprint = sourceFingerprint;
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
      session.blockControls = normalizeCoreBlockControls([...existing.values()]);
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
    shouldGenerate: isGenerationReady(updated.useCase, updated.answers),
    traceId: traceIdForSession(updated)
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
  traceId: string;
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
    traceId: opaqueId(),
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
  if (next.brand) {
    next.brand = brandWithSessionLogoDelivery(nextId, "seller", next.brand);
  }
  if (next.targetBrand) {
    next.targetBrand = brandWithSessionLogoDelivery(nextId, "target", next.targetBrand);
  }
  syncExperienceFoundation(next);
  appendEvent(next, input.mode === "version" ? "session_version_created" : "session_duplicated", {
    sourceSessionId: source.id,
    versionNumber: next.lineage?.versionNumber ?? 1
  });
  await putSession(next, { ttlSeconds: 3600 });
  return {
    session: toPublicSession(next),
    editorToken,
    shouldGenerate: isGenerationReady(next.useCase, next.answers),
    traceId: traceIdForSession(next)
  };
}

export async function finalizePdfSource(
  id: string,
  input: {
    uploadId: string;
    sourceName: string;
    sourceTitle?: string;
    sourceOpenAIFileId?: string;
    sourceArtifact?: SourceArtifact;
  }
): Promise<{ session: PublicTryMeSession; shouldGenerate: boolean }> {
  assertProductionSessionStore();
  const updated = await updateSession(id, (session) => {
    const previousFingerprint = storyInputFingerprint(session);
    if (
      session.answers.sourceUploadId !== input.uploadId ||
      session.answers.sourceUrl ||
      (session.answers.sourceName && session.answers.sourceName !== input.sourceName)
    ) {
      throw new HttpError(
        409,
        "upload_superseded",
        "Another context source was selected before this PDF finished processing."
      );
    }
    session.answers.sourceName = input.sourceName;
    if (input.sourceTitle) session.answers.sourceTitle = input.sourceTitle;
    else delete session.answers.sourceTitle;
    session.answers.sourceOpenAIFileId = input.sourceOpenAIFileId;
    session.sourceArtifact = input.sourceArtifact;
    session.answers.sourceConfirmed = true;
    session.sourceConfirmation = {
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      sourceKind: "uploaded-pdf",
      provenance: "user-submitted"
    };
    session.sourceFingerprint = sourceFingerprintForAnswers(session.answers);
    syncCampaignContracts(session);
    completeInputMutation(session, previousFingerprint);
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
    if (!preflight?.brand || hasTerminalStoryFailure(preflight)) return;
  }
  if (
    preflight?.useCase === "abm" &&
    preflight.answers.targetDomain &&
    needsTargetBrandRefresh(preflight, preflight.answers.targetDomain)
  ) {
    await runTargetBrandStage(id);
    const refreshed = await getSession(id);
    if (
      !refreshed ||
      hasTerminalStoryFailure(refreshed) ||
      needsTargetBrandRefresh(refreshed, preflight.answers.targetDomain)
    ) return;
  }
  if (preflight?.useCase === "content" && preflight.answers.sourceUrl && !preflight.sourceArtifact) {
    await runSourceIntelligenceStage(id);
    preflight = await getSession(id);
    if (!preflight || hasTerminalStoryFailure(preflight)) return;
  }

  const lease = await acquireSessionLease(id, "generation", STORY_GENERATION_LEASE_SECONDS);
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
    if (session.blockControls?.length) {
      session.blockControls = normalizeCoreBlockControls(session.blockControls);
    }
    if (!isGenerationReady(session.useCase, session.answers)) return session;
    if (
      session.status === "claimed" ||
      (session.status === "preview_ready_unclaimed" &&
        (session.stages.story.status === "complete" || session.stages.story.status === "fallback"))
    ) {
      return session;
    }
    if (
      session.stages.story.status === "running" &&
      !isStale(session.stages.story.startedAt, STORY_GENERATION_STALE_MS)
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
    appendEvent(session, "generation_started", { attemptId });
    return session;
  });
  if (!started || !acquiredGeneration) return false;

  let staleGeneration = false;
  try {
    let latest = (await getSession(id)) ?? started;
    if (
      latest.useCase === "content" &&
      latest.sourceArtifact &&
      (latest.sourceArtifact.status === "failed" || latest.sourceArtifact.status === "unreadable")
    ) {
      throw new SourceFetchError(
        new Error(latest.sourceArtifact.diagnostics.failureCode ?? "source_unreadable")
      );
    }
    if (
      latest.useCase === "content" &&
      latest.answers.sourceUrl &&
      !latest.sourceArtifact
    ) {
      const submittedSourceUrl = latest.answers.sourceUrl;
      const sourceArtifact = await fetchPublicUrlSourceArtifact(submittedSourceUrl, {
        timeoutMs: 12_000,
        maxBytes: 2_000_000
      });
      await updateSession(id, (session) => {
        if (
          session.stages.story.attemptId !== attemptId ||
          session.answers.sourceUrl !== submittedSourceUrl
        ) {
          return session;
        }
        session.sourceArtifact = sourceArtifact;
        if (sourceArtifact.content.title) {
          session.answers.sourceTitle = sourceArtifact.content.title;
        }
        session.sourceConfirmation = {
          status:
            sourceArtifact.status === "failed" || sourceArtifact.status === "unreadable"
              ? "rejected"
              : "confirmed",
          confirmedAt:
            sourceArtifact.status === "failed" || sourceArtifact.status === "unreadable"
              ? undefined
              : new Date().toISOString(),
          sourceKind: "public-url",
          provenance: "system-extracted"
        };
        expectedFingerprint = storyInputFingerprint(session);
        session.stages.story.inputFingerprint = expectedFingerprint;
        session.stages.story.detail =
          sourceArtifact.status === "ready"
            ? "Source premise and cited claims extracted. Composing the buyer journey."
            : sourceArtifact.status === "needs-review"
              ? "Source extracted with a few caveats. Composing only from supported claims."
              : "The source could not be understood well enough to generate safely.";
        appendEvent(session, "source_intelligence_completed", {
          attemptId,
          status: sourceArtifact.status,
          confidence: sourceArtifact.confidence,
          extractionMethod: sourceArtifact.extraction.method,
          claimCount: sourceArtifact.diagnostics.claimCount,
          citationCount: sourceArtifact.diagnostics.citationCount
        });
        return session;
      });
      latest = (await getSession(id)) ?? latest;
      if (
        sourceArtifact.status === "failed" ||
        sourceArtifact.status === "unreadable"
      ) {
        throw new SourceFetchError(
          new Error(sourceArtifact.diagnostics.failureCode ?? "source_unreadable")
        );
      }
    }
    const brand = latest.brand ?? fallbackBrand(latest.companyDomain);
    const targetBrand =
      latest.targetBrand ??
      (latest.useCase === "abm" && latest.answers.targetDomain
        ? fallbackBrand(latest.answers.targetDomain)
        : undefined);
    const generationTargetBrand = curatedTargetBrand(latest, targetBrand);
    const selectedBrands = brandsWithSelectedAssets(latest, brand, generationTargetBrand);
    let generated = await generateExperienceDraft({
      brand: selectedBrands.brand,
      targetBrand: selectedBrands.targetBrand,
      useCase: latest.useCase,
      answers: latest.answers,
      sourceArtifact: latest.sourceArtifact
    });
    const trustFallbackReason = generationTrustFailureFor({
      draft: generated.draft,
      brand: selectedBrands.brand,
      targetBrand: selectedBrands.targetBrand,
      useCase: latest.useCase,
      answers: latest.answers
    });
    if (trustFallbackReason && generated.source === "openai") {
      generated = {
        draft: deterministicDraft({
          brand: selectedBrands.brand,
          targetBrand: selectedBrands.targetBrand,
          useCase: latest.useCase,
          answers: latest.answers,
          sourceArtifact: latest.sourceArtifact
        }),
        source: "deterministic-fallback",
        durationMs: generated.durationMs,
        fallbackReason: `trust_gate_${trustFallbackReason}`
      };
    }
    const controlledDraft = draftWithBlockControls(generated.draft, latest.blockControls);
    syncCampaignContracts(latest);
    const experienceSpec = buildExperienceSpec(
      latest,
      controlledDraft,
      selectedBrands.brand,
      selectedBrands.targetBrand
    );
    const webDraft = draftFromExperienceSpec(experienceSpec);
    const generationQualityReceipt = qualityReceiptFor(
      latest,
      latest.revision + 1,
      trustFallbackReason
    );
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
    const renderStartedAt = Date.now();
    const html = renderExperienceHtml({
      draft: webDraft,
      brand: renderBrand,
      targetBrand: renderTargetBrand,
      useCase: latest.useCase,
      answers: latest.answers,
      themeUrl: process.env.FOLLOZE_THEME_URL,
      fontDeliveryUrls: fontDeliveryUrls(id, selectedBrands.brand),
      qualityReceipt: generationQualityReceipt,
      contentItems: experienceSpec.contentItems
    });
    const renderDurationMs = Date.now() - renderStartedAt;
    if (generated.error) {
      logServerError(generated.error, {
        sessionId: id,
        traceId: traceIdForSession(latest),
        operation: "openai_story_generation",
        code: generated.fallbackReason ?? "openai_request_failed",
        details: { durationMs: generated.durationMs, model: config.openAIModel }
      });
    } else if (
      generated.source === "deterministic-fallback" &&
      generated.fallbackReason !== "openai_not_configured"
    ) {
      emitObservabilityLog("warn", {
        type: "try_me_trace",
        event: "openai_generation_fallback",
        traceId: traceIdForSession(latest),
        stage: "story",
        outcome: "fallback",
        useCase: latest.useCase,
        reason: generated.fallbackReason ?? "unknown",
        durationMs: generated.durationMs,
        model: config.openAIModel
      });
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
          attemptId,
          source: generated.source,
          durationMs: generated.durationMs,
          fallbackReason: generated.fallbackReason ?? null,
          model: generated.source === "openai" ? config.openAIModel : null,
          artifactRevision: session.revision + 1,
          qualityGate: trustFallbackReason ?? "passed"
        });
        appendEvent(session, "render_completed", {
          attemptId,
          durationMs: renderDurationMs,
          artifactRevision: session.revision + 1
        });
        appendEvent(session, "preview_ready", {
          attemptId,
          artifactRevision: session.revision + 1,
          submissionToPreviewMs: Math.max(0, readyAt - Date.parse(session.createdAt))
        });
        return session;
      },
      { ttlSeconds: config.sessionTtlSeconds }
    );
  } catch (error) {
    const errorCode = error instanceof SourceFetchError ? "source_fetch_failed" : "generation_failed";
    const failedSession = await getSession(id);
    const requestId = logServerError(error, {
      sessionId: id,
      traceId: failedSession ? traceIdForSession(failedSession) : undefined,
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
      session.status = session.experience ? "preview_ready_unclaimed" : "generation_failed";
      session.stages.story = {
        status: "failed",
        startedAt: session.stages.story.startedAt,
        completedAt: new Date().toISOString(),
        detail:
          errorCode === "source_fetch_failed"
            ? session.experience
              ? "The replacement source could not be read. The current preview is still available; check the URL or try a PDF."
              : "The public content URL could not be read. Check the URL or try a PDF instead."
            : session.experience
              ? "The replacement could not be completed. The current preview and latest inputs are safe to retry."
              : "The story could not be completed. Your inputs are safe and ready to retry.",
        errorCode
      };
      appendEvent(session, "generation_failed", {
        attemptId,
        error: error instanceof Error ? error.name : "unknown",
        requestId,
        durationMs: durationSince(session.stages.story.startedAt)
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

    const recoveryTargetDomain = session.answers.targetDomain;
    if (
      session.useCase === "abm" &&
      recoveryTargetDomain &&
      needsTargetBrandRefresh(session, recoveryTargetDomain)
    ) {
      await runTargetBrandStage(id);
      session = await getSession(id);
      if (
        !session ||
        needsTargetBrandRefresh(session, recoveryTargetDomain)
      ) return;
    }

    const storyCanResume =
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

export async function claimSession(
  id: string,
  emailInput: string
): Promise<ClaimResult & { traceId: string }> {
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

async function claimSessionUnlocked(
  id: string,
  email: string
): Promise<ClaimResult & { traceId: string }> {
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
        publishMode: "preview-only",
        traceId: traceIdForSession(resolved)
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
        publishStatus: "not-attempted"
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

  try {
    const persisted = await updateSession(
      id,
      (session) => {
        appendEvent(session, "lead_captured", { store: leadStoreMode });
        return session;
      },
      { ttlSeconds: 86400 }
    );
    if (!persisted) throw new Error("The claimed experience could not be made durable.");
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

  // V1 claim means "save this app preview", not "publish to Folloze". Native
  // draft creation and public board publication remain explicit later actions.
  const liveUrl = pending.temporaryUrl;
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
  const publishStatus = "preview-only" as const;
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
          follozeBoardId: undefined,
          designerUrl: undefined
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
        appendEvent(session, "claim_completed", { publishMode: "preview-only" });
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
      publishMode: "preview-only",
      traceId: traceIdForSession(claimed)
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
