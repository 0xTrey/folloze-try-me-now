import { randomBytes } from "node:crypto";

import { Redis } from "@upstash/redis";
import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";

import { config, hasBlob, hasRedis } from "@/lib/config";
import { emitObservabilityLog, supportRefForTraceId } from "@/lib/observability";
import { recordProductSessionSnapshot } from "@/lib/product-analytics";
import { recordCommittedSessionEvents, traceIdForSession } from "@/lib/trace-store";
import type { PublicTryMeSession, SessionAnswers, TryMeSession } from "@/lib/types";

type StoredEntry = { value: TryMeSession; expiresAt?: number };
type BlobSnapshot = { entry: StoredEntry; etag: string };

declare global {
  var __follozeTryMeSessions: Map<string, StoredEntry> | undefined;
  var __follozeTryMeLeases: Map<string, { token: string; expiresAt: number }> | undefined;
}

const memory = globalThis.__follozeTryMeSessions ?? new Map<string, StoredEntry>();
globalThis.__follozeTryMeSessions = memory;
const localLeases = globalThis.__follozeTryMeLeases ?? new Map<string, { token: string; expiresAt: number }>();
globalThis.__follozeTryMeLeases = localLeases;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

const keyFor = (id: string) => `try-me:session:${id}`;
const blobPathFor = (id: string) => `try-me/sessions/${id}.json`;
const leaseKeyFor = (id: string, operation: string) => `try-me:lease:${operation}:${id}`;
const strongEtag = (etag: string) => etag.replace(/^W\//, "");

async function recordProductSnapshotBestEffort(session: TryMeSession): Promise<void> {
  try {
    await Promise.race([
      recordProductSessionSnapshot(session),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Product analytics snapshot timed out.")), 750);
      })
    ]);
  } catch (error) {
    emitObservabilityLog("error", {
      type: "try_me_error",
      event: "product_session_snapshot_failed",
      traceId: traceIdForSession(session),
      supportRef: supportRefForTraceId(traceIdForSession(session)),
      code: "product_session_snapshot_failed",
      errorName: error instanceof Error ? error.name : "Error"
    });
  }
}

export type SessionStoreMode = "vercel-blob" | "upstash-redis" | "memory-demo";

export function selectSessionStoreMode(options: {
  blobConfigured: boolean;
  redisConfigured: boolean;
}): SessionStoreMode {
  if (options.blobConfigured) return "vercel-blob";
  if (options.redisConfigured) return "upstash-redis";
  return "memory-demo";
}

export function isProductionSafeSessionStoreMode(mode: SessionStoreMode): boolean {
  return mode === "vercel-blob";
}

export function usesRedisSessionStoreMode(mode: SessionStoreMode): boolean {
  return mode === "upstash-redis";
}

export const sessionStoreMode = selectSessionStoreMode({
  blobConfigured: hasBlob,
  redisConfigured: hasRedis
});
export const sessionStoreIsProductionSafe = isProductionSafeSessionStoreMode(sessionStoreMode);
const useRedisSessionStore = usesRedisSessionStoreMode(sessionStoreMode);

export interface SessionLease {
  release(): Promise<void>;
}

export async function acquireSessionLease(
  id: string,
  operation: string,
  ttlSeconds: number
): Promise<SessionLease | null> {
  const key = leaseKeyFor(id, operation);
  const token = randomBytes(24).toString("base64url");
  if (useRedisSessionStore) {
    const client = getRedis();
    const acquired = await client.set(key, token, { nx: true, ex: ttlSeconds });
    if (acquired !== "OK") return null;
    return {
      async release() {
        await client.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          [key],
          [token]
        );
      }
    };
  }

  const existing = localLeases.get(key);
  if (existing && existing.expiresAt > Date.now()) return null;
  localLeases.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
  return {
    async release() {
      if (localLeases.get(key)?.token === token) localLeases.delete(key);
    }
  };
}

function storedEntry(
  session: TryMeSession,
  options: { persist?: boolean; ttlSeconds?: number }
): StoredEntry {
  const ttlSeconds = options.ttlSeconds ?? config.sessionTtlSeconds;
  return {
    value: structuredClone(session),
    expiresAt: options.persist ? undefined : Date.now() + ttlSeconds * 1000
  };
}

function normalizedSession(value: TryMeSession): TryMeSession {
  // Stored sessions predate several additive workspace fields. Normalize only
  // server-owned collection/revision fields so old previews remain readable
  // without manufacturing new user answers or lifecycle state.
  const session = structuredClone(value) as TryMeSession;
  session.revision = Number.isFinite(session.revision) ? session.revision : 1;
  session.answers = session.answers ?? {};
  session.audienceSuggestions = Array.isArray(session.audienceSuggestions)
    ? session.audienceSuggestions
    : [];
  session.events = Array.isArray(session.events) ? session.events : [];
  return session;
}

function isExpiredAnonymousPreview(session: TryMeSession, now = Date.now()): boolean {
  if (session.status === "expired") return true;
  if (session.status !== "preview_ready_unclaimed" || !session.expiresAt) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

async function readBlobSnapshot(id: string): Promise<BlobSnapshot | null> {
  const result = await get(blobPathFor(id), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const entry = (await new Response(result.stream).json()) as StoredEntry;
  if (
    (entry.expiresAt && entry.expiresAt <= Date.now()) ||
    isExpiredAnonymousPreview(entry.value)
  ) {
    try {
      await del(blobPathFor(id), { ifMatch: strongEtag(result.blob.etag) });
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
    return null;
  }
  // JSON responses can be compressed in transit, which prefixes the HTTP ETag with W/.
  // Blob conditional writes expect the underlying strong object ETag.
  return {
    entry: { ...entry, value: normalizedSession(entry.value) },
    etag: strongEtag(result.blob.etag)
  };
}

async function writeBlobEntry(
  id: string,
  entry: StoredEntry,
  options: { ifMatch?: string } = {}
): Promise<void> {
  await put(blobPathFor(id), JSON.stringify(entry), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    ifMatch: options.ifMatch
  });
}

async function writeSession(
  session: TryMeSession,
  options: { persist?: boolean; ttlSeconds?: number } = {}
): Promise<void> {
  const ttlSeconds = options.ttlSeconds ?? config.sessionTtlSeconds;
  if (useRedisSessionStore) {
    const client = getRedis();
    if (options.persist) {
      await client.set(keyFor(session.id), session);
      await client.persist(keyFor(session.id));
    } else {
      await client.set(keyFor(session.id), session, { ex: ttlSeconds });
    }
    return;
  }

  if (sessionStoreMode === "vercel-blob") {
    await writeBlobEntry(session.id, storedEntry(session, options));
    return;
  }

  memory.set(session.id, storedEntry(session, { ...options, ttlSeconds }));
}

export async function putSession(
  session: TryMeSession,
  options: { persist?: boolean; ttlSeconds?: number } = {}
): Promise<void> {
  await writeSession(session, options);
  await Promise.all([
    recordCommittedSessionEvents(session),
    recordProductSnapshotBestEffort(session)
  ]);
}

export async function getSession(id: string): Promise<TryMeSession | null> {
  if (useRedisSessionStore) {
    const session = (await getRedis().get<TryMeSession>(keyFor(id))) ?? null;
    if (!session) return null;
    if (isExpiredAnonymousPreview(session)) {
      await getRedis().del(keyFor(id));
      return null;
    }
    return normalizedSession(session);
  }

  if (sessionStoreMode === "vercel-blob") {
    const snapshot = await readBlobSnapshot(id);
    return snapshot ? normalizedSession(snapshot.entry.value) : null;
  }

  const entry = memory.get(id);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memory.delete(id);
    return null;
  }
  if (isExpiredAnonymousPreview(entry.value)) {
    memory.delete(id);
    return null;
  }
  return normalizedSession(entry.value);
}

export async function updateSession(
  id: string,
  updater: (session: TryMeSession) => TryMeSession | Promise<TryMeSession>,
  options: { persist?: boolean; ttlSeconds?: number } = {}
): Promise<TryMeSession | null> {
  if (sessionStoreMode === "vercel-blob") {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await readBlobSnapshot(id);
      if (!snapshot) return null;
      const next = await updater(structuredClone(snapshot.entry.value));
      next.updatedAt = new Date().toISOString();
      next.revision += 1;
      try {
        await writeBlobEntry(id, storedEntry(next, options), { ifMatch: snapshot.etag });
        await Promise.all([
          recordCommittedSessionEvents(next, snapshot.entry.value.events),
          recordProductSnapshotBestEffort(next)
        ]);
        return next;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) continue;
        throw error;
      }
    }
    throw new Error("The experience changed while it was being updated. Please retry.");
  }

  const current = await getSession(id);
  if (!current) return null;
  const previousEvents = structuredClone(current.events);
  const next = await updater(current);
  next.updatedAt = new Date().toISOString();
  next.revision += 1;
  await writeSession(next, options);
  await Promise.all([
    recordCommittedSessionEvents(next, previousEvents),
    recordProductSnapshotBestEffort(next)
  ]);
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  if (useRedisSessionStore) {
    await getRedis().del(keyFor(id));
    return;
  }
  if (sessionStoreMode === "vercel-blob") {
    await del(blobPathFor(id));
    return;
  }
  memory.delete(id);
}

export function toPublicSession(session: TryMeSession): PublicTryMeSession {
  const answers = { ...session.answers } as SessionAnswers & { ctaDestination?: string };
  delete answers.sourceOpenAIFileId;
  delete answers.sourceUploadId;
  delete answers.sourceUploadReservedAt;
  delete answers.offerSourceUrl;
  // Legacy sessions may contain a CTA URL. Try Me Now v2 intentionally carries
  // only CTA intent, label, and visual treatment into the public workspace.
  delete answers.ctaDestination;
  // The browser only needs to know that these sources exist. Raw filenames,
  // source paths/query strings, and pasted event details remain server-side.
  if (answers.sourceName) answers.sourceName = "Uploaded PDF";
  if (answers.sourceUrl) answers.sourceUrl = "https://source-provided.invalid/";
  if (answers.eventSource) answers.eventSource = "Event details added";
  const publicBrand = (brand: TryMeSession["brand"]) =>
    brand
      ? {
          domain: brand.domain,
          canonicalDomain: brand.canonicalDomain,
          domainAliases: brand.domainAliases,
          companyName: brand.companyName,
          logoUrl: brand.logoUrl,
          logoUrlOnDark: brand.logoUrlOnDark,
          colors: brand.colors,
          primaryColor: brand.primaryColor,
          accentColor: brand.accentColor,
          surfaceColor: brand.surfaceColor,
          source: brand.source,
          ...(brand.readiness
            ? {
                readiness: {
                  ...brand.readiness,
                  reasons: [...brand.readiness.reasons]
                }
              }
            : {})
        }
      : undefined;
  const publicStage = (stage: TryMeSession["stages"][keyof TryMeSession["stages"]]) => ({
    status: stage.status,
    completedAt: stage.completedAt,
    detail: stage.detail,
    artifact: stage.artifact,
    errorCode: stage.errorCode
  });
  const sourceInsight = session.sourceArtifact
    ? {
        status: session.sourceArtifact.status,
        confidence: session.sourceArtifact.confidence,
        ...(session.sourceArtifact.content.title
          ? { title: session.sourceArtifact.content.title }
          : {}),
        ...(session.sourceArtifact.understanding.premise
          ? { premise: session.sourceArtifact.understanding.premise }
          : {}),
        topics: session.sourceArtifact.understanding.topics.slice(0, 6),
        claims: session.sourceArtifact.understanding.claims.slice(0, 3).map((claim) => ({
          id: claim.id,
          text: claim.text,
          sourceLabels: claim.citationIds.flatMap((citationId) => {
            const citation = session.sourceArtifact?.content.citations.find(
              (candidate) => candidate.id === citationId
            );
            if (!citation) return [];
            return [
              citation.locator.kind === "pdf-page"
                ? `Page ${citation.locator.page}`
                : citation.locator.label
            ];
          })
        })),
        extraction: {
          method: session.sourceArtifact.extraction.method,
          status: session.sourceArtifact.extraction.status,
          ...(session.sourceArtifact.extraction.pageCount
            ? { pageCount: session.sourceArtifact.extraction.pageCount }
            : {}),
          ...(session.sourceArtifact.extraction.extractedPageCount !== undefined
            ? { extractedPageCount: session.sourceArtifact.extraction.extractedPageCount }
            : {}),
          ocrStatus: session.sourceArtifact.extraction.ocr.status,
          warnings: session.sourceArtifact.extraction.warnings.slice(0, 3)
        },
        experiencePattern: session.sourceArtifact.understanding.experiencePlan.pattern,
        moduleKinds: session.sourceArtifact.understanding.experiencePlan.modules.map(
          (module) => module.kind
        ),
        assetCount: session.sourceArtifact.diagnostics.assetCount,
        citationCount: session.sourceArtifact.diagnostics.citationCount
      }
    : undefined;
  const publicAudienceRecommendations = (session.audienceRecommendations ?? []).filter(
    (recommendation) =>
      recommendation.recommendationKind === "evidence-backed" &&
      recommendation.source !== "seller-category-fallback" &&
      recommendation.confidence !== "hypothesis"
  );
  const publicOfferRecommendations = (session.offerRecommendations ?? []).filter(
    (recommendation) => recommendation.recommendationKind === "evidence-backed"
  );

  return {
    id: session.id,
    supportRef: supportRefForTraceId(traceIdForSession(session)),
    useCase: session.useCase,
    companyDomain: session.companyDomain,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    claimedAt: session.claimedAt,
    temporaryUrl: session.temporaryUrl,
    liveUrl: session.liveUrl,
    revision: session.revision,
    stages: {
      brand: publicStage(session.stages.brand),
      audience: publicStage(session.stages.audience),
      story: publicStage(session.stages.story)
    },
    answers,
    brand: publicBrand(session.brand),
    targetBrand: publicBrand(session.targetBrand),
    audienceSuggestions: [...session.audienceSuggestions],
    experienceMode: session.experienceMode,
    exampleKey: session.exampleKey,
    audienceRecommendations:
      publicAudienceRecommendations.length >= 2
        ? structuredClone(publicAudienceRecommendations)
        : [],
    offerRecommendations:
      publicOfferRecommendations.length >= 2
        ? structuredClone(publicOfferRecommendations)
        : [],
    objectiveRecommendations: session.objectiveRecommendations
      ? structuredClone(session.objectiveRecommendations)
      : undefined,
    selectedAudienceRecommendationId: session.selectedAudienceRecommendationId,
    evidenceItems: session.evidenceItems ? structuredClone(session.evidenceItems) : undefined,
    sourceConfirmation: session.sourceConfirmation
      ? structuredClone(session.sourceConfirmation)
      : undefined,
    sourceInsight,
    availableAssets: session.availableAssets ? structuredClone(session.availableAssets) : undefined,
    blockControls: session.blockControls ? structuredClone(session.blockControls) : undefined,
    previewAnalytics: session.previewAnalytics
      ? structuredClone(session.previewAnalytics)
      : undefined,
    qualityReceipt: session.qualityReceipt ? structuredClone(session.qualityReceipt) : undefined,
    cockpit: session.cockpit ? structuredClone(session.cockpit) : undefined,
    lineage: session.lineage ? structuredClone(session.lineage) : undefined,
    campaignBrief: session.campaignBrief ? structuredClone(session.campaignBrief) : undefined,
    audienceLens: session.audienceLens ? structuredClone(session.audienceLens) : undefined,
    campaignOfferSource: session.campaignOfferSource
      ? {
          title: session.campaignOfferSource.title,
          sourceHost: session.campaignOfferSource.sourceHost,
          status: session.campaignOfferSource.status,
          intelligenceStatus: session.campaignOfferSource.intelligenceStatus,
          confirmedAt: session.campaignOfferSource.confirmedAt
        }
      : undefined,
    curatedSections: session.curatedSections
      ? structuredClone(session.curatedSections)
      : undefined,
    experienceSpec: session.experienceSpec
      ? {
          schemaVersion: session.experienceSpec.schemaVersion,
          revision: session.experienceSpec.revision,
          sourceBriefRevision: session.experienceSpec.sourceBriefRevision,
          artifactDigest: session.experienceSpec.artifactDigest,
          renderers: structuredClone(session.experienceSpec.renderers),
          ...(session.experienceSpec.wireframeSelection
            ? {
                wireframeSelection: structuredClone(
                  session.experienceSpec.wireframeSelection
                )
              }
            : {}),
          sectionCount:
            (Array.isArray(session.experienceSpec.draft.sections)
              ? session.experienceSpec.draft.sections.length
              : 0),
          contentItemCount: session.experienceSpec.contentItems?.length ?? 0,
          ...(session.experienceSpec.sourceIntelligence
            ? { sourceStatus: session.experienceSpec.sourceIntelligence.status }
            : {}),
          ...("personalization" in session.experienceSpec &&
          session.experienceSpec.personalization
            ? {
                personalizationVariantIds:
                  session.experienceSpec.personalization.visibleVariants.map(
                    (variant) => variant.variantId
                  ),
                personalizationDefaultVariantId:
                  session.experienceSpec.personalization.defaultVariantId
              }
            : {})
        }
      : undefined,
    experience: session.experience
      ? {
          ready: true,
          title: session.experience.title,
          headline: session.experience.headline,
          ...(session.experience.readiness
            ? { readiness: session.experience.readiness }
            : {}),
          generationSource: session.experience.generationSource,
          artifactRevision: session.experience.artifactRevision
        }
      : undefined,
    claim: session.claim
      ? {
          emailStatus: session.claim.emailStatus,
          publishStatus: session.claim.publishStatus
        }
      : undefined
  };
}
