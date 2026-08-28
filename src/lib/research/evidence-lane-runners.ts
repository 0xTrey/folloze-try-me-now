import type { SourceArtifact } from "@/lib/content-intelligence";
import type { ResearchSourceAuthorityV2 } from "@/lib/orchestration/research-query-plan-v2";

import {
  EVIDENCE_USE,
  evidenceClaimId,
  evidenceEntityId,
  evidenceGapCode,
  evidenceSourceRef,
  normalizeClaimText,
  type EvidenceClaim,
  type EvidenceClaimCandidate,
  type EvidenceConfidence,
  type EvidenceEntity,
  type EvidenceEntityKind
} from "./evidence-graph";
import type {
  EvidenceLaneContext,
  EvidenceLaneResult,
  EvidenceLaneRunners
} from "./evidence-graph-executor";

/** A page-level extract. Only bounded, published metadata is retained. */
export interface PublicContentExtract {
  sourceUrl: string;
  title?: string;
  description?: string;
  excerpt: string;
}

export interface DefaultEvidenceLaneDependencies {
  fetchSourceArtifact?: (
    url: string,
    options: { signal: AbortSignal; timeoutMs: number }
  ) => Promise<SourceArtifact>;
  extractPublicContent?: (
    url: string,
    signal: AbortSignal
  ) => Promise<PublicContentExtract>;
  maxSourceUrls?: number;
  maxFetchMs?: number;
}

const DEFAULT_MAX_SOURCE_URLS = 3;
const DEFAULT_MAX_FETCH_MS = 12_000;

function hostOf(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.username || url.password) return undefined;
    return url.hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

function entity(kind: EvidenceEntityKind, name: string): EvidenceEntity {
  return {
    id: evidenceEntityId(kind, name),
    kind,
    canonicalName: name,
    aliases: []
  };
}

function claimCandidate(input: {
  subjectId: string;
  topic: string;
  statement: string;
  status: EvidenceClaim["status"];
  confidence: EvidenceConfidence;
  authority: ResearchSourceAuthorityV2;
  locator: string;
  allowedUses: readonly string[];
  prohibitedUses: readonly string[];
  buyerFacing: boolean;
  laneId: string;
}): EvidenceClaimCandidate | undefined {
  const statement = normalizeClaimText(input.statement);
  if (statement.length < 3) return undefined;
  return {
    topic: input.topic,
    laneId: input.laneId,
    claim: {
      id: evidenceClaimId({
        subjectId: input.subjectId,
        topic: input.topic,
        claim: statement
      }),
      subjectId: input.subjectId,
      claim: statement,
      status: input.status,
      confidence: input.confidence,
      sourceAuthority: input.authority,
      sourceRef: evidenceSourceRef({
        authority: input.authority,
        locator: input.locator
      }),
      allowedUses: [...input.allowedUses],
      prohibitedUses: [...input.prohibitedUses],
      buyerFacing: input.buyerFacing
    }
  };
}

/**
 * Converts published page metadata into claims. Body text, markup, and the
 * query-bearing URL are deliberately dropped: only the title and description
 * survive, bounded and tag-stripped.
 */
export function publicMetadataEvidence(input: {
  laneId: string;
  subject: EvidenceEntity;
  authority: ResearchSourceAuthorityV2;
  locator: string;
  title?: string;
  description?: string;
}): EvidenceLaneResult {
  const candidates = [
    input.title
      ? claimCandidate({
          subjectId: input.subject.id,
          topic: "published_positioning",
          statement: input.title,
          status: "fact",
          confidence: "medium",
          authority: input.authority,
          locator: input.locator,
          allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.internalReasoning],
          prohibitedUses: [EVIDENCE_USE.proofPoint],
          buyerFacing: true,
          laneId: input.laneId
        })
      : undefined,
    input.description
      ? claimCandidate({
          subjectId: input.subject.id,
          topic: "published_summary",
          statement: input.description,
          status: "fact",
          confidence: "low",
          authority: input.authority,
          locator: input.locator,
          allowedUses: [EVIDENCE_USE.internalReasoning],
          prohibitedUses: [EVIDENCE_USE.proofPoint, EVIDENCE_USE.buyerFacingCopy],
          buyerFacing: false,
          laneId: input.laneId
        })
      : undefined
  ].filter((candidate): candidate is EvidenceClaimCandidate => Boolean(candidate));

  return {
    entities: candidates.length > 0 ? [input.subject] : [],
    candidates,
    gaps: candidates.length === 0 ? [evidenceGapCode(input.laneId, "no_metadata")] : []
  };
}

/**
 * Pure adapter over an already-extracted source artifact. It never reads the
 * artifact's body text, so no source prose can reach the graph.
 */
export function sourceArtifactEvidence(input: {
  laneId: string;
  artifact: SourceArtifact;
  authority?: ResearchSourceAuthorityV2;
}): EvidenceLaneResult {
  const artifact = input.artifact;
  const locator =
    artifact.source.finalUrl ?? artifact.source.sourceUrl ?? artifact.artifactId;
  const host = locator ? hostOf(locator) : undefined;
  const name = host ?? artifact.source.displayName ?? "submitted source";
  if (artifact.status === "failed" || artifact.status === "unreadable") {
    return {
      entities: [],
      candidates: [],
      gaps: [evidenceGapCode(input.laneId, artifact.status)],
      outcome: "empty"
    };
  }
  return publicMetadataEvidence({
    laneId: input.laneId,
    subject: entity("source", name),
    authority: input.authority ?? "seller_official",
    locator: locator ?? artifact.artifactId,
    ...(artifact.content.title ? { title: artifact.content.title } : {}),
    ...(artifact.content.description
      ? { description: artifact.content.description }
      : {})
  });
}

function mergeResults(results: readonly EvidenceLaneResult[]): EvidenceLaneResult {
  return {
    entities: results.flatMap((result) => result.entities ?? []),
    candidates: results.flatMap((result) => result.candidates ?? []),
    relationships: results.flatMap((result) => result.relationships ?? []),
    gaps: results.flatMap((result) => result.gaps ?? [])
  };
}

async function resolveFetchSourceArtifact(
  deps: DefaultEvidenceLaneDependencies
): Promise<NonNullable<DefaultEvidenceLaneDependencies["fetchSourceArtifact"]>> {
  if (deps.fetchSourceArtifact) return deps.fetchSourceArtifact;
  const { fetchPublicUrlSourceArtifact } = await import("@/lib/content-url");
  return (url, options) => fetchPublicUrlSourceArtifact(url, options);
}

async function resolveExtractPublicContent(
  deps: DefaultEvidenceLaneDependencies
): Promise<NonNullable<DefaultEvidenceLaneDependencies["extractPublicContent"]>> {
  if (deps.extractPublicContent) return deps.extractPublicContent;
  const { extractPublicContent } = await import("@/lib/integrations/brand-harvester");
  return (url, signal) => extractPublicContent(url, signal);
}

function fetchBudgetMs(
  context: EvidenceLaneContext,
  deps: DefaultEvidenceLaneDependencies
): number {
  return Math.max(
    1,
    Math.min(context.laneBudgetMs, deps.maxFetchMs ?? DEFAULT_MAX_FETCH_MS)
  );
}

async function sourceLane(
  context: EvidenceLaneContext,
  deps: DefaultEvidenceLaneDependencies
): Promise<EvidenceLaneResult> {
  const urls = context.lane.sourceUrls
    .filter((url) => hostOf(url) !== undefined)
    .slice(0, deps.maxSourceUrls ?? DEFAULT_MAX_SOURCE_URLS);
  if (urls.length === 0) {
    return { gaps: [evidenceGapCode(context.laneId, "no_source_url")], outcome: "empty" };
  }
  const fetchSourceArtifact = await resolveFetchSourceArtifact(deps);
  const timeoutMs = fetchBudgetMs(context, deps);
  const results = await Promise.all(
    urls.map(async (url): Promise<EvidenceLaneResult> => {
      try {
        const artifact = await fetchSourceArtifact(url, {
          signal: context.signal,
          timeoutMs
        });
        return sourceArtifactEvidence({ laneId: context.laneId, artifact });
      } catch {
        return { gaps: [evidenceGapCode(context.laneId, "fetch_failed")] };
      }
    })
  );
  return mergeResults(results);
}

/**
 * Lane runners backed by the existing safe-fetch and extraction helpers.
 *
 * Only lanes that a current approved provider can actually serve are returned.
 * An unserved lane is reported as a skipped gap rather than filled with a
 * default value.
 */
export function createDefaultEvidenceLaneRunners(
  deps: DefaultEvidenceLaneDependencies = {}
): EvidenceLaneRunners {
  return {
    source: (context) => sourceLane(context, deps)
  };
}

/**
 * Seller identity from the seller's own home page. It is a separate factory
 * because it needs the stabilized domain, which is not part of a lane.
 */
export function createSellerIdentityLaneRunner(input: {
  sellerDomain: string;
  deps?: DefaultEvidenceLaneDependencies;
}): EvidenceLaneRunners["seller_identity"] {
  const deps = input.deps ?? {};
  return async (context) => {
    const host = hostOf(`https://${input.sellerDomain}`);
    if (!host) {
      return {
        gaps: [evidenceGapCode(context.laneId, "no_seller_domain")],
        outcome: "empty"
      };
    }
    const extractPublicContent = await resolveExtractPublicContent(deps);
    try {
      const extract = await extractPublicContent(`https://${host}/`, context.signal);
      return publicMetadataEvidence({
        laneId: context.laneId,
        subject: entity("seller", host),
        authority: "seller_official",
        locator: extract.sourceUrl || `https://${host}/`,
        ...(extract.title ? { title: extract.title } : {}),
        ...(extract.description ? { description: extract.description } : {})
      });
    } catch {
      return {
        gaps: [evidenceGapCode(context.laneId, "fetch_failed")],
        outcome: "error"
      };
    }
  };
}
