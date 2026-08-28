import { createHash } from "node:crypto";

import { canonicalJson } from "@/lib/build-trace";

export const EVIDENCE_GRAPH_SCHEMA_VERSION = "1.0" as const;

/** Claim text is bounded so no source body can be carried through the graph. */
export const EVIDENCE_CLAIM_TEXT_MAX = 240;
export const EVIDENCE_ENTITY_NAME_MAX = 120;

export type EvidenceEntityKind =
  | "seller"
  | "offer"
  | "audience"
  | "proof"
  | "category"
  | "source";

export type EvidenceClaimStatus = "fact" | "inference" | "unknown";
export type EvidenceConfidence = "high" | "medium" | "low";

export interface EvidenceEntity {
  id: string;
  kind: EvidenceEntityKind;
  canonicalName: string;
  aliases: string[];
}

export interface EvidenceClaim {
  id: string;
  subjectId: string;
  claim: string;
  status: EvidenceClaimStatus;
  confidence: EvidenceConfidence;
  sourceAuthority: string;
  sourceRef: string;
  allowedUses: string[];
  prohibitedUses: string[];
  buyerFacing: boolean;
}

export interface EvidenceRelationship {
  from: string;
  to: string;
  kind: string;
  evidenceRefs: string[];
}

export interface EvidenceGraph {
  schemaVersion: typeof EVIDENCE_GRAPH_SCHEMA_VERSION;
  revision: number;
  inputFingerprint: string;
  entities: EvidenceEntity[];
  claims: EvidenceClaim[];
  relationships: EvidenceRelationship[];
  gaps: string[];
  timings: Record<string, number>;
}

/**
 * A claim plus the reconciliation metadata that never belongs in the graph.
 * `topic` is the conflict key: one subject holds one reconciled claim per topic.
 */
export interface EvidenceClaimCandidate {
  claim: EvidenceClaim;
  topic: string;
  laneId: string;
}

export type EvidenceLaneOutcome =
  | "ok"
  | "empty"
  | "timeout"
  | "aborted"
  | "error"
  | "skipped"
  | "stale";

/** Named uses so permission narrowing compares stable codes, not prose. */
export const EVIDENCE_USE = {
  buyerFacingCopy: "buyer_facing_copy",
  headline: "headline",
  proofPoint: "proof_point",
  brandTreatment: "brand_treatment",
  internalReasoning: "internal_reasoning"
} as const;

const CONFIDENCE_RANK: Record<EvidenceConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1
};

const STATUS_RANK: Record<EvidenceClaimStatus, number> = {
  fact: 3,
  inference: 2,
  unknown: 1
};

const CONFIDENCE_BY_RANK: Record<number, EvidenceConfidence> = {
  3: "high",
  2: "medium",
  1: "low"
};

export function evidenceConfidenceRank(value: EvidenceConfidence): number {
  return CONFIDENCE_RANK[value] ?? 1;
}

export function evidenceClaimStatusRank(value: EvidenceClaimStatus): number {
  return STATUS_RANK[value] ?? 1;
}

/** Steps confidence down one tier. `low` is already the floor. */
export function downgradeEvidenceConfidence(
  value: EvidenceConfidence
): EvidenceConfidence {
  return CONFIDENCE_BY_RANK[Math.max(1, evidenceConfidenceRank(value) - 1)] ?? "low";
}

function hash(namespace: string, value: string, length: number): string {
  return createHash("sha256")
    .update(`${namespace}\u0000${value}`)
    .digest("hex")
    .slice(0, length);
}

function code(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * Collapses a statement into bounded plain text. Tags and control characters
 * are removed so extracted markup can never survive into a claim.
 */
export function normalizeClaimText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EVIDENCE_CLAIM_TEXT_MAX)
    .trim();
}

export function normalizeEntityName(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EVIDENCE_ENTITY_NAME_MAX)
    .trim();
}

/**
 * An opaque pointer to a source. The locator may be a URL, so it is hashed:
 * a stored ref can never be replayed as a fetchable address with query values.
 */
export function evidenceSourceRef(input: {
  authority: string;
  locator: string;
}): string {
  return `src_${code(input.authority) || "unknown"}_${hash(
    "try-me-evidence-source-ref-v1",
    input.locator,
    20
  )}`;
}

/** Content-derived id, so the same statement from two lanes collapses cleanly. */
export function evidenceClaimId(input: {
  subjectId: string;
  topic: string;
  claim: string;
}): string {
  return `clm_${hash(
    "try-me-evidence-claim-id-v1",
    `${input.subjectId}\u0000${input.topic}\u0000${normalizeClaimText(
      input.claim
    ).toLocaleLowerCase()}`,
    20
  )}`;
}

export function evidenceEntityId(kind: EvidenceEntityKind, name: string): string {
  return `ent_${kind}_${hash(
    "try-me-evidence-entity-id-v1",
    normalizeEntityName(name).toLocaleLowerCase(),
    16
  )}`;
}

/** Source-free lane gap code, e.g. `offer:timeout`. */
export function evidenceGapCode(laneId: string, outcome: string): string {
  return `${code(laneId) || "lane"}:${code(outcome) || "unknown"}`;
}

/** Gap code for a topic that produced no permitted evidence. */
export function evidenceUnknownGapCode(subjectId: string, topic: string): string {
  return `unknown:${code(subjectId) || "subject"}_${code(topic) || "topic"}`;
}

/**
 * An explicit unknown. Missing evidence becomes this, never a default value,
 * so downstream compilers can omit the field honestly instead of guessing.
 */
export function unknownEvidenceClaim(input: {
  subjectId: string;
  topic: string;
  sourceAuthority?: string;
}): EvidenceClaim {
  const claim = `Unknown: no permitted current-revision evidence for ${code(
    input.topic
  ) || "topic"}.`;
  return {
    id: evidenceClaimId({ subjectId: input.subjectId, topic: input.topic, claim }),
    subjectId: input.subjectId,
    claim,
    status: "unknown",
    confidence: "low",
    sourceAuthority: input.sourceAuthority ?? "none",
    sourceRef: evidenceSourceRef({
      authority: "none",
      locator: `unknown:${input.subjectId}:${input.topic}`
    }),
    allowedUses: [],
    prohibitedUses: [EVIDENCE_USE.buyerFacingCopy, EVIDENCE_USE.proofPoint],
    buyerFacing: false
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export interface EvidencePermissions {
  allowedUses: string[];
  prohibitedUses: string[];
  buyerFacing: boolean;
}

/** Prohibition always wins over permission within a single claim. */
export function normalizePermissions(
  claim: Pick<EvidenceClaim, "allowedUses" | "prohibitedUses" | "buyerFacing">
): EvidencePermissions {
  const prohibitedUses = unique(claim.prohibitedUses);
  const prohibited = new Set(prohibitedUses);
  const allowedUses = unique(claim.allowedUses).filter(
    (use) => !prohibited.has(use)
  );
  return {
    allowedUses,
    prohibitedUses,
    buyerFacing:
      claim.buyerFacing === true &&
      !prohibited.has(EVIDENCE_USE.buyerFacingCopy)
  };
}

/**
 * Intersects allowed uses, unions prohibited uses, and requires unanimous
 * buyer-facing permission. A merge can only ever narrow what a claim permits.
 */
export function narrowPermissions(
  members: readonly Pick<
    EvidenceClaim,
    "allowedUses" | "prohibitedUses" | "buyerFacing"
  >[]
): EvidencePermissions {
  const normalized = members.map(normalizePermissions);
  if (normalized.length === 0) {
    return { allowedUses: [], prohibitedUses: [], buyerFacing: false };
  }
  const prohibitedUses = unique(
    normalized.flatMap((member) => member.prohibitedUses)
  );
  const prohibited = new Set(prohibitedUses);
  const allowedUses = normalized
    .map((member) => new Set(member.allowedUses))
    .reduce<string[]>(
      (carry, next) => carry.filter((use) => next.has(use)),
      [...(normalized[0]?.allowedUses ?? [])]
    )
    .filter((use) => !prohibited.has(use));
  return {
    allowedUses: unique(allowedUses),
    prohibitedUses,
    buyerFacing:
      normalized.every((member) => member.buyerFacing) &&
      !prohibited.has(EVIDENCE_USE.buyerFacingCopy)
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Deterministic ordering so structurally equal graphs digest identically. */
export function sortEvidenceGraphParts(parts: {
  entities: readonly EvidenceEntity[];
  claims: readonly EvidenceClaim[];
  relationships: readonly EvidenceRelationship[];
  gaps: readonly string[];
}): Pick<EvidenceGraph, "entities" | "claims" | "relationships" | "gaps"> {
  return {
    entities: [...parts.entities]
      .map((entity) => ({ ...entity, aliases: unique(entity.aliases) }))
      .sort((left, right) => compareStrings(left.id, right.id)),
    claims: [...parts.claims].sort((left, right) =>
      compareStrings(left.id, right.id)
    ),
    relationships: [...parts.relationships]
      .map((relationship) => ({
        ...relationship,
        evidenceRefs: unique(relationship.evidenceRefs)
      }))
      .sort(
        (left, right) =>
          compareStrings(left.from, right.from) ||
          compareStrings(left.kind, right.kind) ||
          compareStrings(left.to, right.to)
      ),
    gaps: unique(parts.gaps)
  };
}

/**
 * Stable digest over everything the graph asserts. Timings are excluded so a
 * digest change always means the evidence changed, not that the clock moved.
 */
export function evidenceGraphDigest(graph: EvidenceGraph): string {
  const sorted = sortEvidenceGraphParts(graph);
  return `eg_${hash(
    "try-me-evidence-graph-digest-v1",
    canonicalJson({
      schemaVersion: graph.schemaVersion,
      revision: graph.revision,
      inputFingerprint: graph.inputFingerprint,
      ...sorted
    }),
    32
  )}`;
}

/**
 * The claim set downstream compilers read. Two graphs with the same set carry
 * the same thesis-relevant evidence.
 */
export function evidenceGraphClaimSet(graph: EvidenceGraph): string[] {
  return [...graph.claims]
    .map(
      (claim) =>
        `${claim.subjectId}|${claim.status}|${claim.confidence}|${
          claim.buyerFacing ? "public" : "internal"
        }|${claim.id}`
    )
    .sort();
}

export interface EvidenceGraphLaneReceipt {
  laneId: string;
  outcome: EvidenceLaneOutcome;
  durationMs: number;
  queryCount: number;
  entityCount: number;
  claimCount: number;
  gapCount: number;
}

export interface EvidenceGraphTraceReceipt {
  schemaVersion: typeof EVIDENCE_GRAPH_SCHEMA_VERSION;
  revision: number;
  digest: string;
  inputFingerprintDigest: string;
  entityCount: number;
  claimCount: number;
  factCount: number;
  inferenceCount: number;
  unknownCount: number;
  buyerFacingClaimCount: number;
  relationshipCount: number;
  gaps: string[];
  timings: Record<string, number>;
  lanes: EvidenceGraphLaneReceipt[];
}

/**
 * Source-free receipt for the private BuildTrace. It carries counts, codes,
 * and digests only: no claim text, no source body, no URL, no prompt.
 */
export function evidenceGraphTraceReceipt(
  graph: EvidenceGraph,
  lanes: readonly EvidenceGraphLaneReceipt[] = []
): EvidenceGraphTraceReceipt {
  const status = (value: EvidenceClaimStatus) =>
    graph.claims.filter((claim) => claim.status === value).length;
  return {
    schemaVersion: graph.schemaVersion,
    revision: graph.revision,
    digest: evidenceGraphDigest(graph),
    inputFingerprintDigest: `fp_${hash(
      "try-me-evidence-fingerprint-v1",
      graph.inputFingerprint,
      20
    )}`,
    entityCount: graph.entities.length,
    claimCount: graph.claims.length,
    factCount: status("fact"),
    inferenceCount: status("inference"),
    unknownCount: status("unknown"),
    buyerFacingClaimCount: graph.claims.filter((claim) => claim.buyerFacing).length,
    relationshipCount: graph.relationships.length,
    gaps: [...graph.gaps].sort(),
    timings: { ...graph.timings },
    lanes: [...lanes]
      .map((lane) => ({ ...lane, laneId: code(lane.laneId) }))
      .sort((left, right) => compareStrings(left.laneId, right.laneId))
  };
}
