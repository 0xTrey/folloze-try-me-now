import { createHash } from "node:crypto";

import {
  ASSET_ROLES as ASSET_ROLE_VALUES,
  BUILD_TRACE_CODE_MAX_LENGTH,
  BUILD_TRACE_DIAGNOSTICS_VERSION,
  BUILD_TRACE_MAX_ALLOCATIONS,
  BUILD_TRACE_MAX_CANDIDATES,
  BUILD_TRACE_MAX_DIAGNOSTIC_COUNT,
  BUILD_TRACE_MAX_EVIDENCE_REFS,
  BUILD_TRACE_MAX_FALLBACKS,
  BUILD_TRACE_MAX_QUALITY,
  BUILD_TRACE_MAX_QUALITY_GATES,
  BUILD_TRACE_MAX_REASONS,
  BUILD_TRACE_MAX_RECIPE_ALTERNATIVES,
  BUILD_TRACE_MAX_RECIPE_SECTIONS,
  BUILD_TRACE_MAX_RESEARCH_LANES,
  BUILD_TRACE_MAX_ROLES,
  BUILD_TRACE_MAX_SECTIONS,
  BUILD_TRACE_MAX_SERIALIZED_BYTES,
  BUILD_TRACE_MAX_STRATEGY_CANDIDATES,
  BUILD_TRACE_MAX_THESIS_FIELDS,
  BUILD_TRACE_MAX_TIMINGS,
  BUILD_TRACE_PIPELINE_VERSION,
  BUILD_TRACE_SCHEMA_VERSION,
  CODE_PATTERN,
  COMPILER_DIGEST_PATTERN,
  CONTRACT_VERSION_PATTERN,
  DIGEST_PATTERN,
  EVIDENCE_CONFIDENCES as EVIDENCE_CONFIDENCE_VALUES,
  EVIDENCE_REF_PATTERN,
  EVIDENCE_STATUSES as EVIDENCE_STATUS_VALUES,
  FALLBACK_SCOPES as FALLBACK_SCOPE_VALUES,
  FINGERPRINT_DIGEST_PATTERN,
  isUnsafeTraceString,
  PIPELINE_VERSION_PATTERN,
  QUALITY_GATE_STATUSES as QUALITY_GATE_STATUS_VALUES,
  RESEARCH_LANE_OUTCOMES as RESEARCH_LANE_OUTCOME_VALUES,
  SCHEMA_VERSION_PATTERN,
  SECTION_QUALITY_KEYS,
  SECTION_REPAIR_STATUSES as SECTION_REPAIR_STATUS_VALUES,
  SECTION_STATUSES as SECTION_STATUS_VALUES,
  SOURCE_HASH_PATTERN,
  STRATEGY_DIMENSION_KEYS,
  TERMINAL_STATUSES as TERMINAL_STATUS_VALUES,
  THESIS_PROOF_MODES as THESIS_PROOF_MODE_VALUES,
  TRACE_ID_PATTERN,
  validateBuildTraceFragment,
  validateBuildTraceShape,
  VALUE_DIGEST_PATTERN,
  WRITER_MODES as WRITER_MODE_VALUES,
  type BuildTraceFragmentKind,
  type BuildTracePrivacyViolation
} from "@/lib/build-trace-schema";

/**
 * Private, first-party build provenance. A BuildTrace lets an operator
 * reconstruct how one attempt selected evidence, brand tokens, geometry,
 * assets, and section copy. It never leaves the first-party store, and it
 * never carries raw source material: only codes, digests, opaque references,
 * scores, and timings.
 *
 * The exact contract lives in `build-trace-schema.ts`. This module builds and
 * normalizes traces; that one decides what a valid trace may contain.
 */
export {
  BUILD_TRACE_CODE_MAX_LENGTH,
  BUILD_TRACE_DIAGNOSTICS_VERSION,
  BUILD_TRACE_MAX_ALLOCATIONS,
  BUILD_TRACE_MAX_CANDIDATES,
  BUILD_TRACE_MAX_EVIDENCE_REFS,
  BUILD_TRACE_MAX_FALLBACKS,
  BUILD_TRACE_MAX_QUALITY,
  BUILD_TRACE_MAX_QUALITY_GATES,
  BUILD_TRACE_MAX_REASONS,
  BUILD_TRACE_MAX_RECIPE_ALTERNATIVES,
  BUILD_TRACE_MAX_RECIPE_SECTIONS,
  BUILD_TRACE_MAX_RESEARCH_LANES,
  BUILD_TRACE_MAX_ROLES,
  BUILD_TRACE_MAX_SECTIONS,
  BUILD_TRACE_MAX_SERIALIZED_BYTES,
  BUILD_TRACE_MAX_STRATEGY_CANDIDATES,
  BUILD_TRACE_MAX_THESIS_FIELDS,
  BUILD_TRACE_MAX_TIMINGS,
  BUILD_TRACE_PIPELINE_VERSION,
  BUILD_TRACE_SCHEMA_VERSION,
  isUnsafeTraceString,
  QUALITY_GATE_STATUS_VALUES as BUILD_TRACE_QUALITY_GATE_STATUSES,
  RESEARCH_LANE_OUTCOME_VALUES as BUILD_TRACE_RESEARCH_LANE_OUTCOMES,
  SECTION_QUALITY_KEYS,
  SECTION_REPAIR_STATUS_VALUES as BUILD_TRACE_SECTION_REPAIR_STATUSES,
  STRATEGY_DIMENSION_KEYS,
  validateBuildTraceFragment,
  validateBuildTraceShape,
  type BuildTraceFragmentKind,
  type BuildTracePrivacyViolation
};

export type SectionQualityKey = (typeof SECTION_QUALITY_KEYS)[number];

/** Per-section metrics. Keys outside the vocabulary are dropped, not stored. */
export type SectionQualityMetrics = Partial<
  Record<SectionQualityKey, number | boolean | string>
>;

export type BuildTraceTerminalStatus = (typeof TERMINAL_STATUS_VALUES)[number];

export type BuildTraceSectionStatus = (typeof SECTION_STATUS_VALUES)[number];

export type BuildTraceWriterMode = (typeof WRITER_MODE_VALUES)[number];

export type BuildTraceAssetRole = (typeof ASSET_ROLE_VALUES)[number];

export type BuildTraceFallbackScope = (typeof FALLBACK_SCOPE_VALUES)[number];

export interface RankedCandidateTrace {
  candidateId: string;
  score: number;
  selected: boolean;
  reasonCodes: string[];
}

export interface RankedDecisionTrace {
  decision: string;
  version: string;
  selectedCandidateId: string;
  candidates: RankedCandidateTrace[];
  evidenceRefs: string[];
  confidence: number;
  reasonCodes: string[];
}

export interface BrandRoleTrace {
  role: string;
  valueDigest: string;
  sourceAuthority: string;
  candidateCount: number;
  confidence: number;
  selectionReasons: string[];
  evidenceRefs: string[];
}

export interface BrandDecisionTrace {
  version: string;
  readiness: string;
  confidence: number;
  roles: BrandRoleTrace[];
  warnings: string[];
  evidenceRefs: string[];
}

export interface AssetAllocationTraceEntry {
  allocationKey: string;
  sectionId: string;
  semanticRole: BuildTraceAssetRole;
  assetDigest: string;
  evidenceRef: string;
  sourceUrlHash: string;
  purpose: string;
  reusable: boolean;
  score: number;
}

export interface AssetAllocationTrace {
  version: string;
  allocations: AssetAllocationTraceEntry[];
  substantiveCount: number;
  reusableCount: number;
  rejectedCount: number;
  rejectionReasons: string[];
}

export type BuildTraceResearchLaneOutcome = (typeof RESEARCH_LANE_OUTCOME_VALUES)[number];

export type BuildTraceEvidenceStatus = (typeof EVIDENCE_STATUS_VALUES)[number];

export type BuildTraceEvidenceConfidence = (typeof EVIDENCE_CONFIDENCE_VALUES)[number];

export type BuildTraceThesisProofMode = (typeof THESIS_PROOF_MODE_VALUES)[number];

export type BuildTraceQualityGateStatus = (typeof QUALITY_GATE_STATUS_VALUES)[number];

export type BuildTraceSectionRepairStatus = (typeof SECTION_REPAIR_STATUS_VALUES)[number];

export type BuildTraceStrategyDimensionKey = (typeof STRATEGY_DIMENSION_KEYS)[number];

export interface SectionBuildTrace {
  sectionId: string;
  role: string;
  jobCode?: string;
  promptVersion: string;
  templateVersion: string;
  writerMode: BuildTraceWriterMode;
  model?: string;
  inputEvidenceRefs: string[];
  inputDigest: string;
  candidateDigests: string[];
  candidateCount?: number;
  selectedCandidate: number;
  selectionReasons: string[];
  rejectionCodes?: string[];
  repairStatus?: BuildTraceSectionRepairStatus;
  outputDigest: string;
  quality: SectionQualityMetrics;
  startedAt: string;
  completedAt: string;
  durationMs?: number;
  status: BuildTraceSectionStatus;
  fallbackCode?: string;
}

export interface QualityTrace {
  dimension: string;
  score: number;
  blocking: false;
  warnings: string[];
  violations: string[];
  evidenceRefs: string[];
}

export interface FallbackTrace {
  stage: string;
  code: string;
  scope: BuildTraceFallbackScope;
  at: string;
  sectionId?: string;
}

export interface StageTimingTrace {
  stage: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                 */
/* -------------------------------------------------------------------------- */

export interface EvidenceGraphDiagnostics {
  schemaVersion: string;
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
  gapCodes: string[];
}

export interface ResearchLaneDiagnostics {
  laneId: string;
  outcome: BuildTraceResearchLaneOutcome;
  queryCount: number;
  entityCount: number;
  claimCount: number;
  gapCount: number;
  durationMs: number;
}

export interface ResearchDiagnostics {
  queryCount: number;
  laneCount: number;
  lanes: ResearchLaneDiagnostics[];
  outcomeCounts: Partial<Record<BuildTraceResearchLaneOutcome, number>>;
}

export interface ThesisFieldDiagnostics {
  role: string;
  present: boolean;
  status: BuildTraceEvidenceStatus;
  confidence: BuildTraceEvidenceConfidence;
  buyerFacing: boolean;
  evidenceRefs: string[];
  valueDigest?: string;
}

export interface ThesisDiagnostics {
  schemaVersion: string;
  version: string;
  revision: number;
  digest: string;
  proofMode: BuildTraceThesisProofMode;
  fields: ThesisFieldDiagnostics[];
  unsupportedFields: string[];
  omittedFields: string[];
  unknownCount: number;
  reasonCodes: string[];
}

export interface StrategyCandidateDiagnostics {
  candidateId: string;
  angle: string;
  argumentKind: string;
  frameworkId: string;
  selected: boolean;
  score: number;
  dimensions?: Partial<Record<BuildTraceStrategyDimensionKey, number>>;
  hardFailures: string[];
  reasonCodes: string[];
}

export interface StrategyDiagnostics {
  schemaVersion: string;
  version: string;
  thesisDigest: string;
  strategyDigest: string;
  selectedCandidateId?: string;
  candidates: StrategyCandidateDiagnostics[];
  rejectedCandidateIds: string[];
  reasonCodes: string[];
}

export interface RecipeDiagnostics {
  schemaVersion: string;
  recipeId: string;
  recipeVersion: string;
  digest: string;
  thesisDigest: string;
  activated: boolean;
  thesisValid: boolean;
  sections: Array<{ order: number; slotId: string; role: string; required: boolean }>;
  rejected: Array<{ recipeId: string; reasonCode: string }>;
  reasonCodes: string[];
}

export interface CompositionDiagnostics {
  version: string;
  selectedCompositionId: string;
  archetypeId?: string;
  digest?: string;
  rejected: Array<{ candidateId: string; reasonCode: string }>;
  reasonCodes: string[];
}

export interface QualityGateDiagnostics {
  gate: string;
  status: BuildTraceQualityGateStatus;
  sectionId?: string;
  violations: string[];
}

export interface LifecycleDiagnostics {
  revision: number;
  attemptId: string;
  inputFingerprintDigest: string;
  renderMs: number;
  persistenceMs: number;
  readbackMs: number;
  totalMs: number;
  fallbackCodes: string[];
}

/**
 * The private diagnostics block. It exists so an operator can reconstruct every
 * decision the pipeline made without any of the material those decisions were
 * made from: no claim text, no query string, no prompt, no copy, no URL.
 */
export interface BuildTraceDiagnostics {
  version: string;
  evidenceGraph?: EvidenceGraphDiagnostics;
  research?: ResearchDiagnostics;
  thesis?: ThesisDiagnostics;
  strategy?: StrategyDiagnostics;
  recipe?: RecipeDiagnostics;
  composition?: CompositionDiagnostics;
  qualityGates: QualityGateDiagnostics[];
  lifecycle: LifecycleDiagnostics;
}

export interface BuildTraceV1 {
  schemaVersion: 1;
  traceId: string;
  sessionId: string;
  attemptId: string;
  revision: number;
  pipelineVersion: string;
  supportRefHash?: string;
  startedAt: string;
  completedAt?: string;
  terminalStatus: BuildTraceTerminalStatus;
  evidenceRefs: string[];
  decisions: {
    framework?: RankedDecisionTrace;
    wireframe?: RankedDecisionTrace;
    messaging?: RankedDecisionTrace;
    brand?: BrandDecisionTrace;
    assets?: AssetAllocationTrace;
  };
  sections: SectionBuildTrace[];
  quality: QualityTrace[];
  fallbacks: FallbackTrace[];
  timings: StageTimingTrace[];
  diagnostics?: BuildTraceDiagnostics;
}

const TERMINAL_STATUSES = new Set<BuildTraceTerminalStatus>(TERMINAL_STATUS_VALUES);
const SECTION_STATUSES = new Set<BuildTraceSectionStatus>(SECTION_STATUS_VALUES);
const WRITER_MODES = new Set<BuildTraceWriterMode>(WRITER_MODE_VALUES);
const ASSET_ROLES = new Set<BuildTraceAssetRole>(ASSET_ROLE_VALUES);
const FALLBACK_SCOPES = new Set<BuildTraceFallbackScope>(FALLBACK_SCOPE_VALUES);
const RESEARCH_LANE_OUTCOMES = new Set<BuildTraceResearchLaneOutcome>(
  RESEARCH_LANE_OUTCOME_VALUES
);
const EVIDENCE_STATUSES = new Set<BuildTraceEvidenceStatus>(EVIDENCE_STATUS_VALUES);
const EVIDENCE_CONFIDENCES = new Set<BuildTraceEvidenceConfidence>(
  EVIDENCE_CONFIDENCE_VALUES
);
const THESIS_PROOF_MODES = new Set<BuildTraceThesisProofMode>(THESIS_PROOF_MODE_VALUES);
const QUALITY_GATE_STATUSES = new Set<BuildTraceQualityGateStatus>(
  QUALITY_GATE_STATUS_VALUES
);
const SECTION_REPAIR_STATUSES = new Set<BuildTraceSectionRepairStatus>(
  SECTION_REPAIR_STATUS_VALUES
);
/** Substantive imagery may be placed once. Only these roles may repeat. */
export const REUSABLE_ASSET_ROLES = new Set<BuildTraceAssetRole>(["logo", "decorative"]);

/* -------------------------------------------------------------------------- */
/* Deterministic digests                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Canonical JSON with sorted object keys so two structurally equal values
 * always digest identically regardless of construction order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function hash(namespace: string, value: string, length: number): string {
  return createHash("sha256")
    .update(`${namespace}\u0000${value}`)
    .digest("hex")
    .slice(0, length);
}

/** Content digest for prompt inputs, candidates, and accepted copy. */
export function buildTraceDigest(value: unknown): string {
  return `dg_${hash("try-me-build-trace-digest-v1", canonicalJson(value), 32)}`;
}

/** Opaque, trace-scoped evidence pointer. Never reversible to a source URL. */
export function buildTraceEvidenceRef(traceId: string, evidenceId: string): string {
  return `ev_${hash("try-me-build-trace-evidence-v1", `${traceId}\u0000${evidenceId}`, 20)}`;
}

export function buildTraceEvidenceRefs(
  traceId: string,
  evidenceIds: readonly string[]
): string[] {
  return [...new Set(evidenceIds.filter((id) => typeof id === "string" && id.trim()))]
    .map((id) => buildTraceEvidenceRef(traceId, id))
    .sort()
    .slice(0, BUILD_TRACE_MAX_EVIDENCE_REFS);
}

/** Stable per-trace hash of an asset source URL for duplicate detection. */
export function buildTraceSourceUrlHash(traceId: string, sourceUrl: string): string {
  return `sh_${hash("try-me-build-trace-source-v1", `${traceId}\u0000${sourceUrl}`, 20)}`;
}

/** One-way support-reference hash. The public support code is not recoverable. */
export function buildTraceSupportRefHash(supportRef: string): string {
  return `sr_${hash("try-me-build-trace-support-v1", supportRef, 20)}`;
}

/**
 * One-way hash of an input fingerprint. Two attempts on the same brief share a
 * value; the brief itself is not recoverable from it.
 */
export function buildTraceFingerprintDigest(inputFingerprint: string): string {
  return FINGERPRINT_DIGEST_PATTERN.test(inputFingerprint)
    ? inputFingerprint
    : `fp_${hash("try-me-evidence-fingerprint-v1", inputFingerprint, 20)}`;
}

/**
 * One-way hash of one private field's wording. It moves when the wording moves,
 * which is the only thing a diagnostics reader needs from it.
 */
export function buildTraceValueDigest(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (VALUE_DIGEST_PATTERN.test(value)) return value;
  return `vd_${hash("try-me-build-trace-value-v1", value, 16)}`;
}

/**
 * Keeps an upstream compiler digest verbatim when it already carries one of the
 * contract's prefixes, and re-mints it under the expected prefix otherwise. A
 * malformed digest therefore stays distinct rather than collapsing onto a
 * shared placeholder that would make two different builds look identical.
 */
export function buildTraceCompilerDigest(
  value: string | undefined,
  prefix: "eg" | "th" | "st" | "rc" | "cp"
): string {
  if (value && COMPILER_DIGEST_PATTERN.test(value)) return value;
  return `${prefix}_${hash(`try-me-build-trace-compiler-${prefix}-v1`, value ?? "", 32)}`;
}

/**
 * Opaque correlation key shared with behavior analytics. It joins a PostHog
 * funnel to a private trace without exposing the trace identifier itself.
 */
export function buildTraceCorrelationKey(traceId: string, attemptId: string): string {
  return `ck_${hash("try-me-build-trace-correlation-v1", `${traceId}\u0000${attemptId}`, 20)}`;
}

/**
 * Keeps an identifier usable as a trace key. Values that already read as an
 * opaque id pass through; anything else is hashed so distinct inputs stay
 * distinct instead of collapsing onto one placeholder.
 */
export function safeTraceIdentifier(value: string | undefined, prefix: string): string {
  if (value && TRACE_ID_PATTERN.test(value) && !isUnsafeTraceString(value)) return value;
  return `${prefix}_${hash("try-me-build-trace-identifier-v1", value ?? "", 24)}`;
}

/* -------------------------------------------------------------------------- */
/* Value guards                                                                */
/* -------------------------------------------------------------------------- */

function boundedScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}

function boundedDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(300_000, Math.max(0, Math.round(value)));
}

function boundedCount(value: unknown, maximum = 10_000): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return 0;
  return Math.min(maximum, value);
}

/**
 * Reduces any label to a privacy-safe code. Prose, HTML, URLs, emails, and
 * hostnames collapse to a redaction marker rather than leaking through.
 */
export function buildTraceCode(value: unknown, fallback = "unspecified"): string {
  if (typeof value !== "string") return fallback;
  const collapsed = value.trim().toLowerCase().replace(/[\s/]+/g, "_");
  const normalized = collapsed
    .replace(/[^a-z0-9_.:-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.:-]+/, "")
    .slice(0, BUILD_TRACE_CODE_MAX_LENGTH);
  if (!normalized || !CODE_PATTERN.test(normalized)) return fallback;
  if (isUnsafeTraceString(normalized)) return "redacted_unsafe_code";
  return normalized;
}

export function buildTraceCodes(
  values: readonly unknown[] | undefined,
  limit = BUILD_TRACE_MAX_REASONS
): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => buildTraceCode(value, ""))
        .filter((value) => value.length > 0)
    )
  ]
    .sort()
    .slice(0, limit);
}

function instant(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Privacy scanner                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reports anything that must never be persisted. Structure is checked first,
 * because a field the contract does not name is a leak regardless of how
 * innocent its value looks, and a nested key the old heuristic never visited
 * is exactly where hostile output would hide.
 *
 * Used as a runtime guard before every write and as a test oracle.
 */
export function findBuildTracePrivacyViolations(
  trace: unknown
): BuildTracePrivacyViolation[] {
  const violations = validateBuildTraceShape(trace);
  const serialized = canonicalJson(trace);
  if (Buffer.byteLength(serialized, "utf8") > BUILD_TRACE_MAX_SERIALIZED_BYTES) {
    violations.push({ path: "trace", reason: "oversized_payload" });
  }
  return violations;
}

export function isPrivateSafeBuildTrace(trace: unknown): boolean {
  return findBuildTracePrivacyViolations(trace).length === 0;
}

/* -------------------------------------------------------------------------- */
/* Normalizers                                                                 */
/* -------------------------------------------------------------------------- */

export function normalizeRankedDecisionTrace(input: {
  decision: string;
  version?: string;
  selectedCandidateId: string;
  candidates: readonly {
    candidateId: string;
    score: number;
    selected?: boolean;
    reasonCodes?: readonly string[];
  }[];
  evidenceRefs?: readonly string[];
  confidence?: number;
  reasonCodes?: readonly string[];
}): RankedDecisionTrace {
  const selectedCandidateId = buildTraceCode(input.selectedCandidateId, "unselected");
  const candidates = input.candidates
    .slice(0, BUILD_TRACE_MAX_CANDIDATES)
    .map((candidate) => {
      const candidateId = buildTraceCode(candidate.candidateId, "unnamed_candidate");
      return {
        candidateId,
        score: boundedScore(candidate.score),
        selected: candidate.selected ?? candidateId === selectedCandidateId,
        reasonCodes: buildTraceCodes(candidate.reasonCodes)
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.candidateId.localeCompare(right.candidateId)
    );
  return {
    decision: buildTraceCode(input.decision, "decision"),
    version: versionCode(input.version, "decision-v1"),
    selectedCandidateId,
    candidates,
    evidenceRefs: safeRefs(input.evidenceRefs, EVIDENCE_REF_PATTERN),
    confidence: boundedScore(input.confidence ?? 0),
    reasonCodes: buildTraceCodes(input.reasonCodes)
  };
}

export function normalizeBrandDecisionTrace(input: {
  version?: string;
  readiness: string;
  confidence?: number;
  roles: readonly {
    role: string;
    valueDigest: string;
    sourceAuthority: string;
    candidateCount?: number;
    confidence?: number;
    selectionReasons?: readonly string[];
    evidenceRefs?: readonly string[];
  }[];
  warnings?: readonly string[];
  evidenceRefs?: readonly string[];
}): BrandDecisionTrace {
  return {
    version: versionCode(input.version, "brand-system-v2"),
    readiness: buildTraceCode(input.readiness, "unknown"),
    confidence: boundedScore(input.confidence ?? 0),
    roles: input.roles
      .slice(0, BUILD_TRACE_MAX_ROLES)
      .map((role) => ({
        role: buildTraceCode(role.role, "role"),
        valueDigest: DIGEST_PATTERN.test(role.valueDigest)
          ? role.valueDigest
          : buildTraceDigest(role.valueDigest),
        sourceAuthority: buildTraceCode(role.sourceAuthority, "unknown"),
        candidateCount: boundedCount(role.candidateCount ?? 0, 1000),
        confidence: boundedScore(role.confidence ?? 0),
        selectionReasons: buildTraceCodes(role.selectionReasons),
        evidenceRefs: safeRefs(role.evidenceRefs, EVIDENCE_REF_PATTERN)
      }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    warnings: buildTraceCodes(input.warnings, BUILD_TRACE_MAX_REASONS),
    evidenceRefs: safeRefs(input.evidenceRefs, EVIDENCE_REF_PATTERN)
  };
}

export function normalizeAssetAllocationTrace(input: {
  version?: string;
  allocations: readonly {
    allocationKey: string;
    sectionId: string;
    semanticRole: string;
    assetDigest: string;
    evidenceRef: string;
    sourceUrlHash: string;
    purpose: string;
    reusable: boolean;
    score: number;
  }[];
  rejectedCount?: number;
  rejectionReasons?: readonly string[];
}): AssetAllocationTrace {
  const allocations = input.allocations
    .slice(0, BUILD_TRACE_MAX_ALLOCATIONS)
    .map((allocation) => {
      const semanticRole = ASSET_ROLES.has(allocation.semanticRole as BuildTraceAssetRole)
        ? (allocation.semanticRole as BuildTraceAssetRole)
        : "supporting";
      return {
        allocationKey: buildTraceCode(allocation.allocationKey, "allocation"),
        sectionId: buildTraceCode(allocation.sectionId, "section"),
        semanticRole,
        assetDigest: DIGEST_PATTERN.test(allocation.assetDigest)
          ? allocation.assetDigest
          : buildTraceDigest(allocation.assetDigest),
        evidenceRef: EVIDENCE_REF_PATTERN.test(allocation.evidenceRef)
          ? allocation.evidenceRef
          : buildTraceEvidenceRef("unknown", allocation.evidenceRef),
        sourceUrlHash: SOURCE_HASH_PATTERN.test(allocation.sourceUrlHash)
          ? allocation.sourceUrlHash
          : buildTraceSourceUrlHash("unknown", allocation.sourceUrlHash),
        purpose: buildTraceCode(allocation.purpose, "unknown"),
        reusable: allocation.reusable === true,
        score: boundedScore(allocation.score)
      };
    })
    .sort((left, right) => left.allocationKey.localeCompare(right.allocationKey));
  return {
    version: versionCode(input.version, "asset-allocator-v1"),
    allocations,
    substantiveCount: allocations.filter((allocation) => !allocation.reusable).length,
    reusableCount: allocations.filter((allocation) => allocation.reusable).length,
    rejectedCount: boundedCount(input.rejectedCount ?? 0, 10_000),
    rejectionReasons: buildTraceCodes(input.rejectionReasons)
  };
}

export function normalizeSectionBuildTrace(input: {
  sectionId: string;
  role: string;
  jobCode?: string;
  promptVersion?: string;
  templateVersion?: string;
  writerMode: string;
  model?: string;
  inputEvidenceRefs?: readonly string[];
  inputDigest: string;
  candidateDigests?: readonly string[];
  candidateCount?: number;
  selectedCandidate: number;
  selectionReasons?: readonly string[];
  rejectionCodes?: readonly string[];
  repairStatus?: string;
  outputDigest: string;
  quality?: SectionQualityMetrics;
  startedAt: string;
  completedAt: string;
  status: string;
  fallbackCode?: string;
}): SectionBuildTrace {
  const startedAt = instant(input.startedAt, new Date(0).toISOString());
  const completedAt = instant(input.completedAt, startedAt);
  const model = input.model ? buildTraceCode(input.model, "") : "";
  const jobCode = input.jobCode ? buildTraceCode(input.jobCode, "") : "";
  const candidateDigests = (input.candidateDigests ?? [])
    .slice(0, BUILD_TRACE_MAX_CANDIDATES)
    .map((digest) => (DIGEST_PATTERN.test(digest) ? digest : buildTraceDigest(digest)));
  const repairStatus = SECTION_REPAIR_STATUSES.has(
    input.repairStatus as BuildTraceSectionRepairStatus
  )
    ? (input.repairStatus as BuildTraceSectionRepairStatus)
    : undefined;
  return {
    sectionId: buildTraceCode(input.sectionId, "section"),
    role: buildTraceCode(input.role, "role"),
    ...(jobCode ? { jobCode } : {}),
    promptVersion: versionCode(input.promptVersion, "section-writer-v1"),
    templateVersion: versionCode(input.templateVersion, "section-template-v1"),
    writerMode: WRITER_MODES.has(input.writerMode as BuildTraceWriterMode)
      ? (input.writerMode as BuildTraceWriterMode)
      : "deterministic",
    ...(model ? { model } : {}),
    inputEvidenceRefs: safeRefs(input.inputEvidenceRefs, EVIDENCE_REF_PATTERN),
    inputDigest: DIGEST_PATTERN.test(input.inputDigest)
      ? input.inputDigest
      : buildTraceDigest(input.inputDigest),
    candidateDigests,
    ...(input.candidateCount === undefined
      ? {}
      : {
          candidateCount: boundedCount(input.candidateCount, BUILD_TRACE_MAX_CANDIDATES)
        }),
    selectedCandidate: boundedCount(input.selectedCandidate, BUILD_TRACE_MAX_CANDIDATES),
    selectionReasons: buildTraceCodes(input.selectionReasons),
    ...(input.rejectionCodes
      ? { rejectionCodes: buildTraceCodes(input.rejectionCodes) }
      : {}),
    ...(repairStatus ? { repairStatus } : {}),
    outputDigest: DIGEST_PATTERN.test(input.outputDigest)
      ? input.outputDigest
      : buildTraceDigest(input.outputDigest),
    quality: normalizeQualityMap(input.quality),
    startedAt,
    completedAt,
    durationMs: boundedDuration(Date.parse(completedAt) - Date.parse(startedAt)),
    status: SECTION_STATUSES.has(input.status as BuildTraceSectionStatus)
      ? (input.status as BuildTraceSectionStatus)
      : "fallback",
    ...(input.fallbackCode ? { fallbackCode: buildTraceCode(input.fallbackCode) } : {})
  };
}

function normalizeQualityMap(
  quality: SectionQualityMetrics | undefined
): SectionQualityMetrics {
  const entries: Array<[string, number | boolean | string]> = [];
  for (const [key, value] of Object.entries(quality ?? {}).slice(
    0,
    BUILD_TRACE_MAX_QUALITY
  )) {
    const safeKey = buildTraceCode(key, "");
    if (!safeKey || !SECTION_QUALITY_KEYS.includes(safeKey as SectionQualityKey)) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) entries.push([safeKey, Math.round(value * 10_000) / 10_000]);
      continue;
    }
    if (typeof value === "boolean") {
      entries.push([safeKey, value]);
      continue;
    }
    const safeValue = buildTraceCode(value, "");
    if (safeValue) entries.push([safeKey, safeValue]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

export function normalizeQualityTrace(input: {
  dimension: string;
  score: number;
  warnings?: readonly string[];
  violations?: readonly string[];
  evidenceRefs?: readonly string[];
}): QualityTrace {
  return {
    dimension: buildTraceCode(input.dimension, "dimension"),
    score: boundedScore(input.score),
    blocking: false,
    warnings: buildTraceCodes(input.warnings),
    violations: buildTraceCodes(input.violations),
    evidenceRefs: safeRefs(input.evidenceRefs, EVIDENCE_REF_PATTERN)
  };
}

function versionCode(value: string | undefined, fallback: string): string {
  return value && CONTRACT_VERSION_PATTERN.test(value) ? value : fallback;
}

function schemaVersionCode(value: unknown, fallback = "1.0"): string {
  return typeof value === "string" && SCHEMA_VERSION_PATTERN.test(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/* Diagnostics normalizers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A closed metric map, like `normalizeQualityMap` but parameterized by its key
 * vocabulary. Values outside the vocabulary are dropped rather than stored,
 * because an unrecognized key is the only place free text could hide.
 */
function normalizeNumericMetricMap<Key extends string>(
  values: Readonly<Record<string, unknown>> | undefined,
  keys: readonly Key[]
): Partial<Record<Key, number>> {
  const allowed = new Set<string>(keys);
  const entries: Array<[Key, number]> = [];
  for (const [key, value] of Object.entries(values ?? {})) {
    const safeKey = buildTraceCode(key, "");
    if (!allowed.has(safeKey) || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    entries.push([safeKey as Key, Math.round(value * 10_000) / 10_000]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries) as Partial<Record<Key, number>>;
}

export function normalizeEvidenceGraphDiagnostics(input: {
  schemaVersion?: string;
  revision: number;
  digest: string;
  inputFingerprintDigest?: string;
  inputFingerprint?: string;
  entityCount?: number;
  claimCount?: number;
  factCount?: number;
  inferenceCount?: number;
  unknownCount?: number;
  buyerFacingClaimCount?: number;
  relationshipCount?: number;
  gaps?: readonly string[];
}): EvidenceGraphDiagnostics {
  return {
    schemaVersion: schemaVersionCode(input.schemaVersion),
    revision: boundedCount(input.revision, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    digest: buildTraceCompilerDigest(input.digest, "eg"),
    inputFingerprintDigest: buildTraceFingerprintDigest(
      input.inputFingerprintDigest ?? input.inputFingerprint ?? ""
    ),
    entityCount: boundedCount(input.entityCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    claimCount: boundedCount(input.claimCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    factCount: boundedCount(input.factCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    inferenceCount: boundedCount(input.inferenceCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    unknownCount: boundedCount(input.unknownCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    buyerFacingClaimCount: boundedCount(
      input.buyerFacingClaimCount ?? 0,
      BUILD_TRACE_MAX_DIAGNOSTIC_COUNT
    ),
    relationshipCount: boundedCount(
      input.relationshipCount ?? 0,
      BUILD_TRACE_MAX_DIAGNOSTIC_COUNT
    ),
    gapCodes: buildTraceCodes(input.gaps)
  };
}

export function normalizeResearchDiagnostics(input: {
  lanes: readonly {
    laneId: string;
    outcome: string;
    queryCount?: number;
    entityCount?: number;
    claimCount?: number;
    gapCount?: number;
    durationMs?: number;
  }[];
}): ResearchDiagnostics {
  const lanes = input.lanes
    .slice(0, BUILD_TRACE_MAX_RESEARCH_LANES)
    .map((lane) => ({
      laneId: buildTraceCode(lane.laneId, "lane"),
      outcome: RESEARCH_LANE_OUTCOMES.has(lane.outcome as BuildTraceResearchLaneOutcome)
        ? (lane.outcome as BuildTraceResearchLaneOutcome)
        : ("error" as BuildTraceResearchLaneOutcome),
      queryCount: boundedCount(lane.queryCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
      entityCount: boundedCount(lane.entityCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
      claimCount: boundedCount(lane.claimCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
      gapCount: boundedCount(lane.gapCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
      durationMs: boundedDuration(lane.durationMs ?? 0)
    }))
    .sort((left, right) => left.laneId.localeCompare(right.laneId));
  const outcomeCounts: Partial<Record<BuildTraceResearchLaneOutcome, number>> = {};
  for (const lane of lanes) {
    outcomeCounts[lane.outcome] = (outcomeCounts[lane.outcome] ?? 0) + 1;
  }
  return {
    queryCount: lanes.reduce((sum, lane) => sum + lane.queryCount, 0),
    laneCount: lanes.length,
    lanes,
    outcomeCounts
  };
}

export function normalizeThesisDiagnostics(input: {
  schemaVersion?: string;
  version?: string;
  revision: number;
  digest: string;
  proofMode: string;
  fields: readonly {
    role: string;
    present: boolean;
    status: string;
    confidence: string;
    buyerFacing: boolean;
    evidenceRefs?: readonly string[];
    valueDigest?: string;
  }[];
  unsupportedFields?: readonly string[];
  omittedFields?: readonly string[];
  unknownCount?: number;
  reasonCodes?: readonly string[];
}): ThesisDiagnostics {
  return {
    schemaVersion: schemaVersionCode(input.schemaVersion),
    version: versionCode(input.version, "campaign-thesis-v1.0.0"),
    revision: boundedCount(input.revision, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    digest: buildTraceCompilerDigest(input.digest, "th"),
    proofMode: THESIS_PROOF_MODES.has(input.proofMode as BuildTraceThesisProofMode)
      ? (input.proofMode as BuildTraceThesisProofMode)
      : "validation-question",
    fields: input.fields
      .slice(0, BUILD_TRACE_MAX_THESIS_FIELDS)
      .map((field) => {
        const valueDigest = buildTraceValueDigest(field.valueDigest);
        return {
          role: buildTraceCode(field.role, "field"),
          present: field.present === true,
          status: EVIDENCE_STATUSES.has(field.status as BuildTraceEvidenceStatus)
            ? (field.status as BuildTraceEvidenceStatus)
            : "unknown",
          confidence: EVIDENCE_CONFIDENCES.has(
            field.confidence as BuildTraceEvidenceConfidence
          )
            ? (field.confidence as BuildTraceEvidenceConfidence)
            : "low",
          buyerFacing: field.buyerFacing === true,
          evidenceRefs: safeRefs(field.evidenceRefs, EVIDENCE_REF_PATTERN),
          ...(valueDigest ? { valueDigest } : {})
        };
      })
      .sort((left, right) => left.role.localeCompare(right.role)),
    unsupportedFields: buildTraceCodes(input.unsupportedFields, BUILD_TRACE_MAX_THESIS_FIELDS),
    omittedFields: buildTraceCodes(input.omittedFields, BUILD_TRACE_MAX_THESIS_FIELDS),
    unknownCount: boundedCount(input.unknownCount ?? 0, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    reasonCodes: buildTraceCodes(input.reasonCodes)
  };
}

export function normalizeStrategyDiagnostics(input: {
  schemaVersion?: string;
  version?: string;
  thesisDigest: string;
  strategyDigest: string;
  selectedCandidateId?: string;
  candidates: readonly {
    candidateId: string;
    angle: string;
    argumentKind: string;
    frameworkId: string;
    total?: number;
    dimensions?: Readonly<Record<string, unknown>>;
    hardFailures?: readonly string[];
    reasonCodes?: readonly string[];
  }[];
  rejectedCandidateIds?: readonly string[];
  reasonCodes?: readonly string[];
}): StrategyDiagnostics {
  const selectedCandidateId = input.selectedCandidateId
    ? buildTraceCode(input.selectedCandidateId, "")
    : "";
  return {
    schemaVersion: schemaVersionCode(input.schemaVersion),
    version: versionCode(input.version, "thesis-strategy-v1.0.0"),
    thesisDigest: buildTraceCompilerDigest(input.thesisDigest, "th"),
    strategyDigest: buildTraceCompilerDigest(input.strategyDigest, "st"),
    ...(selectedCandidateId ? { selectedCandidateId } : {}),
    candidates: input.candidates
      .slice(0, BUILD_TRACE_MAX_STRATEGY_CANDIDATES)
      .map((candidate) => {
        const candidateId = buildTraceCode(candidate.candidateId, "unnamed_candidate");
        const dimensions = candidate.dimensions
          ? normalizeNumericMetricMap(candidate.dimensions, STRATEGY_DIMENSION_KEYS)
          : undefined;
        return {
          candidateId,
          angle: buildTraceCode(candidate.angle, "angle"),
          argumentKind: buildTraceCode(candidate.argumentKind, "argument"),
          frameworkId: buildTraceCode(candidate.frameworkId, "framework"),
          selected: candidateId === selectedCandidateId,
          // The evaluator scores out of 100; the trace contract stores a 0-1
          // score, so the conversion happens here rather than at every caller.
          score: boundedScore((candidate.total ?? 0) / 100),
          ...(dimensions && Object.keys(dimensions).length > 0 ? { dimensions } : {}),
          hardFailures: buildTraceCodes(candidate.hardFailures),
          reasonCodes: buildTraceCodes(candidate.reasonCodes)
        };
      })
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    rejectedCandidateIds: buildTraceCodes(
      input.rejectedCandidateIds,
      BUILD_TRACE_MAX_STRATEGY_CANDIDATES
    ),
    reasonCodes: buildTraceCodes(input.reasonCodes)
  };
}

export function normalizeRecipeDiagnostics(input: {
  schemaVersion?: string;
  recipeId: string;
  recipeVersion?: string;
  digest: string;
  thesisDigest: string;
  activated: boolean;
  thesisValid: boolean;
  sections: readonly { order: number; slotId: string; role: string; required?: boolean }[];
  rejected?: readonly { recipeId: string; reasonCode: string }[];
  reasonCodes?: readonly string[];
}): RecipeDiagnostics {
  return {
    schemaVersion: schemaVersionCode(input.schemaVersion),
    recipeId: buildTraceCode(input.recipeId, "recipe"),
    recipeVersion: versionCode(input.recipeVersion, "page-recipe-v1.0.0"),
    digest: buildTraceCompilerDigest(input.digest, "rc"),
    thesisDigest: buildTraceCompilerDigest(input.thesisDigest, "th"),
    activated: input.activated === true,
    thesisValid: input.thesisValid === true,
    sections: input.sections
      .slice(0, BUILD_TRACE_MAX_RECIPE_SECTIONS)
      .map((section) => ({
        order: boundedCount(section.order, BUILD_TRACE_MAX_RECIPE_SECTIONS),
        slotId: buildTraceCode(section.slotId, "slot"),
        role: buildTraceCode(section.role, "role"),
        required: section.required === true
      }))
      .sort((left, right) => left.order - right.order || left.slotId.localeCompare(right.slotId)),
    rejected: (input.rejected ?? [])
      .slice(0, BUILD_TRACE_MAX_RECIPE_ALTERNATIVES)
      .map((entry) => ({
        recipeId: buildTraceCode(entry.recipeId, "recipe"),
        reasonCode: buildTraceCode(entry.reasonCode, "unspecified")
      }))
      .sort((left, right) => left.recipeId.localeCompare(right.recipeId)),
    reasonCodes: buildTraceCodes(input.reasonCodes)
  };
}

export function normalizeCompositionDiagnostics(input: {
  version?: string;
  selectedCompositionId: string;
  archetypeId?: string;
  digest?: string;
  rejected?: readonly { candidateId: string; reasonCode: string }[];
  reasonCodes?: readonly string[];
}): CompositionDiagnostics {
  const archetypeId = input.archetypeId ? buildTraceCode(input.archetypeId, "") : "";
  return {
    version: versionCode(input.version, "three-family-v2.0.0"),
    selectedCompositionId: buildTraceCode(input.selectedCompositionId, "composition"),
    ...(archetypeId ? { archetypeId } : {}),
    ...(input.digest ? { digest: buildTraceCompilerDigest(input.digest, "cp") } : {}),
    rejected: (input.rejected ?? [])
      .slice(0, BUILD_TRACE_MAX_RECIPE_ALTERNATIVES)
      .map((entry) => ({
        candidateId: buildTraceCode(entry.candidateId, "candidate"),
        reasonCode: buildTraceCode(entry.reasonCode, "unspecified")
      }))
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    reasonCodes: buildTraceCodes(input.reasonCodes)
  };
}

export function normalizeQualityGateDiagnostics(input: {
  gate: string;
  status: string;
  sectionId?: string;
  violations?: readonly string[];
}): QualityGateDiagnostics {
  const sectionId = input.sectionId ? buildTraceCode(input.sectionId, "") : "";
  return {
    gate: buildTraceCode(input.gate, "gate"),
    status: QUALITY_GATE_STATUSES.has(input.status as BuildTraceQualityGateStatus)
      ? (input.status as BuildTraceQualityGateStatus)
      : "skipped",
    ...(sectionId ? { sectionId } : {}),
    violations: buildTraceCodes(input.violations)
  };
}

export function normalizeLifecycleDiagnostics(input: {
  revision: number;
  attemptId: string;
  inputFingerprintDigest?: string;
  inputFingerprint?: string;
  renderMs?: number;
  persistenceMs?: number;
  readbackMs?: number;
  totalMs?: number;
  fallbackCodes?: readonly string[];
}): LifecycleDiagnostics {
  return {
    revision: boundedCount(input.revision, BUILD_TRACE_MAX_DIAGNOSTIC_COUNT),
    attemptId: safeTraceIdentifier(input.attemptId, "attempt"),
    inputFingerprintDigest: buildTraceFingerprintDigest(
      input.inputFingerprintDigest ?? input.inputFingerprint ?? ""
    ),
    renderMs: boundedDuration(input.renderMs ?? 0),
    persistenceMs: boundedDuration(input.persistenceMs ?? 0),
    readbackMs: boundedDuration(input.readbackMs ?? 0),
    totalMs: boundedDuration(input.totalMs ?? 0),
    fallbackCodes: buildTraceCodes(input.fallbackCodes, BUILD_TRACE_MAX_FALLBACKS)
  };
}

function safeRefs(
  refs: readonly string[] | undefined,
  pattern: RegExp,
  limit = BUILD_TRACE_MAX_EVIDENCE_REFS
): string[] {
  return [...new Set((refs ?? []).filter((ref) => pattern.test(ref)))].sort().slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                     */
/* -------------------------------------------------------------------------- */

export interface BuildTraceBuilderInput {
  traceId: string;
  sessionId: string;
  attemptId: string;
  revision: number;
  startedAt: string;
  supportRef?: string;
  pipelineVersion?: string;
}

/**
 * Accumulates provenance while a build runs. Every setter normalizes its
 * input, so an accidental raw value cannot reach the finished trace.
 */
export class BuildTraceBuilder {
  private readonly traceId: string;
  private readonly sessionId: string;
  private readonly attemptId: string;
  private readonly revision: number;
  private readonly startedAt: string;
  private readonly pipelineVersion: string;
  private readonly supportRefHash?: string;
  private readonly evidence = new Set<string>();
  private readonly sections: SectionBuildTrace[] = [];
  private readonly quality: QualityTrace[] = [];
  private readonly fallbacks: FallbackTrace[] = [];
  private readonly timings: StageTimingTrace[] = [];
  private readonly qualityGates: QualityGateDiagnostics[] = [];
  private decisions: BuildTraceV1["decisions"] = {};
  private diagnostics: Omit<BuildTraceDiagnostics, "version" | "qualityGates"> = {
    lifecycle: normalizeLifecycleDiagnostics({ revision: 0, attemptId: "attempt" })
  };
  private lifecycleRecorded = false;

  constructor(input: BuildTraceBuilderInput) {
    this.traceId = safeTraceIdentifier(input.traceId, "trace");
    this.sessionId = safeTraceIdentifier(input.sessionId, "session");
    this.attemptId = safeTraceIdentifier(input.attemptId, "attempt");
    this.revision = boundedCount(input.revision, 100_000);
    this.startedAt = instant(input.startedAt, new Date(0).toISOString());
    this.pipelineVersion = PIPELINE_VERSION_PATTERN.test(input.pipelineVersion ?? "")
      ? input.pipelineVersion!
      : BUILD_TRACE_PIPELINE_VERSION;
    if (input.supportRef) this.supportRefHash = buildTraceSupportRefHash(input.supportRef);
  }

  /** Converts raw evidence identifiers into opaque, trace-scoped references. */
  refs(evidenceIds: readonly string[]): string[] {
    const refs = buildTraceEvidenceRefs(this.traceId, evidenceIds);
    for (const ref of refs) this.evidence.add(ref);
    return refs;
  }

  ref(evidenceId: string): string {
    return this.refs([evidenceId])[0] ?? buildTraceEvidenceRef(this.traceId, evidenceId);
  }

  sourceHash(sourceUrl: string): string {
    return buildTraceSourceUrlHash(this.traceId, sourceUrl);
  }

  recordDecision(
    kind: "framework" | "wireframe" | "messaging",
    decision: RankedDecisionTrace
  ): this {
    this.decisions = { ...this.decisions, [kind]: decision };
    for (const ref of decision.evidenceRefs) this.evidence.add(ref);
    return this;
  }

  recordBrandDecision(decision: BrandDecisionTrace): this {
    this.decisions = { ...this.decisions, brand: decision };
    for (const ref of decision.evidenceRefs) this.evidence.add(ref);
    for (const role of decision.roles) {
      for (const ref of role.evidenceRefs) this.evidence.add(ref);
    }
    return this;
  }

  recordAssetAllocation(allocation: AssetAllocationTrace): this {
    this.decisions = { ...this.decisions, assets: allocation };
    for (const entry of allocation.allocations) this.evidence.add(entry.evidenceRef);
    return this;
  }

  recordSection(section: SectionBuildTrace): this {
    if (this.sections.length >= BUILD_TRACE_MAX_SECTIONS) return this;
    this.sections.push(section);
    for (const ref of section.inputEvidenceRefs) this.evidence.add(ref);
    return this;
  }

  recordQuality(quality: QualityTrace): this {
    if (this.quality.length >= BUILD_TRACE_MAX_QUALITY) return this;
    this.quality.push(quality);
    return this;
  }

  recordFallback(input: {
    stage: string;
    code: string;
    scope: BuildTraceFallbackScope;
    at: string;
    sectionId?: string;
  }): this {
    if (this.fallbacks.length >= BUILD_TRACE_MAX_FALLBACKS) return this;
    this.fallbacks.push({
      stage: buildTraceCode(input.stage, "stage"),
      code: buildTraceCode(input.code, "unspecified"),
      scope: FALLBACK_SCOPES.has(input.scope) ? input.scope : "stage",
      at: instant(input.at, this.startedAt),
      ...(input.sectionId ? { sectionId: buildTraceCode(input.sectionId, "section") } : {})
    });
    return this;
  }

  recordEvidenceGraphDiagnostics(diagnostics: EvidenceGraphDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, evidenceGraph: diagnostics };
    return this;
  }

  recordResearchDiagnostics(diagnostics: ResearchDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, research: diagnostics };
    return this;
  }

  recordThesisDiagnostics(diagnostics: ThesisDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, thesis: diagnostics };
    for (const field of diagnostics.fields) {
      for (const ref of field.evidenceRefs) this.evidence.add(ref);
    }
    return this;
  }

  recordStrategyDiagnostics(diagnostics: StrategyDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, strategy: diagnostics };
    return this;
  }

  recordRecipeDiagnostics(diagnostics: RecipeDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, recipe: diagnostics };
    return this;
  }

  recordCompositionDiagnostics(diagnostics: CompositionDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, composition: diagnostics };
    return this;
  }

  recordQualityGate(gate: QualityGateDiagnostics): this {
    if (this.qualityGates.length >= BUILD_TRACE_MAX_QUALITY_GATES) return this;
    this.qualityGates.push(gate);
    return this;
  }

  /**
   * The revision, attempt, fingerprint, timing, and fallback codes the whole
   * attempt is fenced by. Recorded explicitly rather than derived from stage
   * timings, because the reserve the lifecycle owns is not a stage.
   */
  recordLifecycleDiagnostics(diagnostics: LifecycleDiagnostics): this {
    this.diagnostics = { ...this.diagnostics, lifecycle: diagnostics };
    this.lifecycleRecorded = true;
    return this;
  }

  recordTiming(input: {
    stage: string;
    startedAt: string;
    completedAt: string;
    status: string;
    durationMs?: number;
  }): this {
    if (this.timings.length >= BUILD_TRACE_MAX_TIMINGS) return this;
    const startedAt = instant(input.startedAt, this.startedAt);
    const completedAt = instant(input.completedAt, startedAt);
    this.timings.push({
      stage: buildTraceCode(input.stage, "stage"),
      startedAt,
      completedAt,
      durationMs: boundedDuration(
        input.durationMs ?? Date.parse(completedAt) - Date.parse(startedAt)
      ),
      status: buildTraceCode(input.status, "info")
    });
    return this;
  }

  /**
   * Produces the finished trace. The result is always private-safe: any value
   * that would violate the privacy boundary was normalized on the way in.
   */
  build(input: {
    terminalStatus: BuildTraceTerminalStatus;
    completedAt?: string;
  }): BuildTraceV1 {
    return {
      schemaVersion: BUILD_TRACE_SCHEMA_VERSION,
      traceId: this.traceId,
      sessionId: this.sessionId,
      attemptId: this.attemptId,
      revision: this.revision,
      pipelineVersion: this.pipelineVersion,
      ...(this.supportRefHash ? { supportRefHash: this.supportRefHash } : {}),
      startedAt: this.startedAt,
      ...(input.completedAt
        ? { completedAt: instant(input.completedAt, this.startedAt) }
        : {}),
      terminalStatus: TERMINAL_STATUSES.has(input.terminalStatus)
        ? input.terminalStatus
        : "failed",
      evidenceRefs: [...this.evidence].sort().slice(0, BUILD_TRACE_MAX_EVIDENCE_REFS),
      decisions: structuredClone(this.decisions),
      sections: structuredClone(this.sections),
      quality: structuredClone(this.quality),
      fallbacks: structuredClone(this.fallbacks),
      timings: structuredClone(this.timings),
      // Emitted only when something was actually diagnosed, so an existing
      // caller that records no diagnostics produces a byte-identical trace.
      ...(this.hasDiagnostics() ? { diagnostics: this.buildDiagnostics() } : {})
    };
  }

  private hasDiagnostics(): boolean {
    return (
      this.lifecycleRecorded
      || this.qualityGates.length > 0
      || Boolean(
        this.diagnostics.evidenceGraph
        || this.diagnostics.research
        || this.diagnostics.thesis
        || this.diagnostics.strategy
        || this.diagnostics.recipe
        || this.diagnostics.composition
      )
    );
  }

  private buildDiagnostics(): BuildTraceDiagnostics {
    const lifecycle = this.lifecycleRecorded
      ? this.diagnostics.lifecycle
      : normalizeLifecycleDiagnostics({
          revision: this.revision,
          attemptId: this.attemptId,
          fallbackCodes: this.fallbacks.map(({ code }) => code)
        });
    return structuredClone({
      version: BUILD_TRACE_DIAGNOSTICS_VERSION,
      ...(this.diagnostics.evidenceGraph
        ? { evidenceGraph: this.diagnostics.evidenceGraph }
        : {}),
      ...(this.diagnostics.research ? { research: this.diagnostics.research } : {}),
      ...(this.diagnostics.thesis ? { thesis: this.diagnostics.thesis } : {}),
      ...(this.diagnostics.strategy ? { strategy: this.diagnostics.strategy } : {}),
      ...(this.diagnostics.recipe ? { recipe: this.diagnostics.recipe } : {}),
      ...(this.diagnostics.composition ? { composition: this.diagnostics.composition } : {}),
      qualityGates: [...this.qualityGates].sort(
        (left, right) =>
          left.gate.localeCompare(right.gate)
          || (left.sectionId ?? "").localeCompare(right.sectionId ?? "")
      ),
      lifecycle
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Decoder                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Strict decoder for stored traces. A trace decodes only if it matches the
 * contract exactly at every depth; anything else becomes `undefined` rather
 * than flowing into an inspection surface. Section identity and clock order are
 * checked here rather than in the schema because they are properties of the
 * whole trace, not of any one field.
 */
export function parseBuildTrace(value: unknown): BuildTraceV1 | undefined {
  if (findBuildTracePrivacyViolations(value).length > 0) return undefined;
  const trace = value as BuildTraceV1;
  const sectionIds = trace.sections.map((section) => section.sectionId);
  if (new Set(sectionIds).size !== sectionIds.length) return undefined;
  if (trace.completedAt && Date.parse(trace.completedAt) < Date.parse(trace.startedAt)) {
    return undefined;
  }
  return structuredClone(trace);
}
