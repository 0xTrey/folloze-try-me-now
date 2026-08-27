import { createHash } from "node:crypto";

import { sanitizeObservabilityText } from "@/lib/observability-sanitize";

/**
 * Private, first-party build provenance. A BuildTrace lets an operator
 * reconstruct how one attempt selected evidence, brand tokens, geometry,
 * assets, and section copy. It never leaves the first-party store, and it
 * never carries raw source material: only codes, digests, opaque references,
 * scores, and timings.
 */
export const BUILD_TRACE_SCHEMA_VERSION = 1;
export const BUILD_TRACE_PIPELINE_VERSION = "try-me-build-v1.1.0";
export const BUILD_TRACE_MAX_SECTIONS = 12;
export const BUILD_TRACE_MAX_EVIDENCE_REFS = 200;
export const BUILD_TRACE_MAX_CANDIDATES = 24;
export const BUILD_TRACE_MAX_REASONS = 12;
export const BUILD_TRACE_MAX_QUALITY = 32;
export const BUILD_TRACE_MAX_FALLBACKS = 48;
export const BUILD_TRACE_MAX_TIMINGS = 48;
export const BUILD_TRACE_MAX_ALLOCATIONS = 24;
export const BUILD_TRACE_MAX_ROLES = 32;
export const BUILD_TRACE_CODE_MAX_LENGTH = 120;
export const BUILD_TRACE_MAX_SERIALIZED_BYTES = 131_072;

const CODE_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,119}$/i;
const DIGEST_PATTERN = /^dg_[a-f0-9]{32}$/;
const EVIDENCE_REF_PATTERN = /^ev_[a-f0-9]{20}$/;
const SOURCE_HASH_PATTERN = /^sh_[a-f0-9]{20}$/;
const SUPPORT_REF_HASH_PATTERN = /^sr_[a-f0-9]{20}$/;
const TRACE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/i;
const PIPELINE_VERSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}-v\d+(?:\.\d+){0,2}$/;
const CONTRACT_VERSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}-v\d+(?:\.\d+){0,2}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/** A dotted label ending in letters reads as a hostname, not a code. */
const HOSTNAME_SHAPED = /(?:^|[^0-9a-z])[a-z0-9-]{2,}\.[a-z]{2,24}(?![a-z0-9])/i;
const KNOWN_SECRET_PREFIX =
  /\b(?:sk-|sk_|pk_live|pk_test|ghp_|github_pat_|xox[baprs]-|re_|AKIA|ASIA|AIza|vercel_blob_|Bearer\s|Basic\s)/;

export type BuildTraceTerminalStatus =
  | "completed"
  | "fallback"
  | "needs_input"
  | "failed"
  | "stale";

export type BuildTraceSectionStatus = "completed" | "fallback" | "failed" | "stale";

export type BuildTraceWriterMode = "model" | "deterministic" | "repair";

export type BuildTraceAssetRole =
  | "hero"
  | "product"
  | "proof"
  | "process"
  | "people"
  | "supporting"
  | "logo"
  | "decorative";

export type BuildTraceFallbackScope = "experience" | "stage" | "section";

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

export interface SectionBuildTrace {
  sectionId: string;
  role: string;
  promptVersion: string;
  templateVersion: string;
  writerMode: BuildTraceWriterMode;
  model?: string;
  inputEvidenceRefs: string[];
  inputDigest: string;
  candidateDigests: string[];
  selectedCandidate: number;
  selectionReasons: string[];
  outputDigest: string;
  quality: Record<string, number | boolean | string>;
  startedAt: string;
  completedAt: string;
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
    brand?: BrandDecisionTrace;
    assets?: AssetAllocationTrace;
  };
  sections: SectionBuildTrace[];
  quality: QualityTrace[];
  fallbacks: FallbackTrace[];
  timings: StageTimingTrace[];
}

const TERMINAL_STATUSES = new Set<BuildTraceTerminalStatus>([
  "completed",
  "fallback",
  "needs_input",
  "failed",
  "stale"
]);
const SECTION_STATUSES = new Set<BuildTraceSectionStatus>([
  "completed",
  "fallback",
  "failed",
  "stale"
]);
const WRITER_MODES = new Set<BuildTraceWriterMode>(["model", "deterministic", "repair"]);
const ASSET_ROLES = new Set<BuildTraceAssetRole>([
  "hero",
  "product",
  "proof",
  "process",
  "people",
  "supporting",
  "logo",
  "decorative"
]);
const FALLBACK_SCOPES = new Set<BuildTraceFallbackScope>([
  "experience",
  "stage",
  "section"
]);
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

/**
 * True when a string carries material that must never reach a trace: an
 * email, URL, hostname, token, markup, or free prose.
 */
export function isUnsafeTraceString(value: string): boolean {
  if (value.length > BUILD_TRACE_CODE_MAX_LENGTH) return true;
  if (/[<>]/.test(value)) return true;
  if (/[@]/.test(value)) return true;
  if (/\s/.test(value)) return true;
  if (KNOWN_SECRET_PREFIX.test(value)) return true;
  if (HOSTNAME_SHAPED.test(value)) return true;
  return sanitizeObservabilityText(value, BUILD_TRACE_CODE_MAX_LENGTH) !== value;
}

/* -------------------------------------------------------------------------- */
/* Privacy scanner                                                             */
/* -------------------------------------------------------------------------- */

export interface BuildTracePrivacyViolation {
  path: string;
  reason:
    | "unsafe_string"
    | "oversized_payload"
    | "unexpected_key"
    | "unsupported_value";
}

const EXEMPT_INSTANT_KEYS = new Set(["startedAt", "completedAt", "at"]);
const EXEMPT_PATTERN_KEYS = new Map<string, RegExp>([
  ["traceId", TRACE_ID_PATTERN],
  ["sessionId", TRACE_ID_PATTERN],
  ["attemptId", TRACE_ID_PATTERN],
  ["pipelineVersion", PIPELINE_VERSION_PATTERN],
  ["supportRefHash", SUPPORT_REF_HASH_PATTERN],
  ["version", CONTRACT_VERSION_PATTERN],
  ["promptVersion", CONTRACT_VERSION_PATTERN],
  ["templateVersion", CONTRACT_VERSION_PATTERN],
  ["inputDigest", DIGEST_PATTERN],
  ["outputDigest", DIGEST_PATTERN],
  ["valueDigest", DIGEST_PATTERN],
  ["assetDigest", DIGEST_PATTERN],
  ["evidenceRef", EVIDENCE_REF_PATTERN],
  ["sourceUrlHash", SOURCE_HASH_PATTERN]
]);

function scanValue(
  value: unknown,
  path: string,
  key: string,
  violations: BuildTracePrivacyViolation[]
): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number" || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (EXEMPT_INSTANT_KEYS.has(key)) {
      if (!ISO_INSTANT_PATTERN.test(value)) {
        violations.push({ path, reason: "unsafe_string" });
      }
      return;
    }
    const pattern = EXEMPT_PATTERN_KEYS.get(key);
    if (pattern) {
      if (!pattern.test(value)) violations.push({ path, reason: "unsafe_string" });
      return;
    }
    if (
      DIGEST_PATTERN.test(value)
      || EVIDENCE_REF_PATTERN.test(value)
      || SOURCE_HASH_PATTERN.test(value)
    ) {
      return;
    }
    if (isUnsafeTraceString(value)) {
      violations.push({ path, reason: "unsafe_string" });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, key, violations));
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (isUnsafeTraceString(childKey)) {
        violations.push({ path: `${path}.${childKey}`, reason: "unexpected_key" });
        continue;
      }
      scanValue(childValue, `${path}.${childKey}`, childKey, violations);
    }
    return;
  }
  violations.push({ path, reason: "unsupported_value" });
}

/**
 * Walks a serialized trace and reports anything that must never be persisted.
 * Used as a runtime guard before every write and as a test oracle.
 */
export function findBuildTracePrivacyViolations(
  trace: unknown
): BuildTracePrivacyViolation[] {
  const violations: BuildTracePrivacyViolation[] = [];
  scanValue(trace, "trace", "trace", violations);
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
  promptVersion?: string;
  templateVersion?: string;
  writerMode: string;
  model?: string;
  inputEvidenceRefs?: readonly string[];
  inputDigest: string;
  candidateDigests?: readonly string[];
  selectedCandidate: number;
  selectionReasons?: readonly string[];
  outputDigest: string;
  quality?: Record<string, number | boolean | string>;
  startedAt: string;
  completedAt: string;
  status: string;
  fallbackCode?: string;
}): SectionBuildTrace {
  const startedAt = instant(input.startedAt, new Date(0).toISOString());
  const model = input.model ? buildTraceCode(input.model, "") : "";
  return {
    sectionId: buildTraceCode(input.sectionId, "section"),
    role: buildTraceCode(input.role, "role"),
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
    candidateDigests: (input.candidateDigests ?? [])
      .slice(0, BUILD_TRACE_MAX_CANDIDATES)
      .map((digest) => (DIGEST_PATTERN.test(digest) ? digest : buildTraceDigest(digest))),
    selectedCandidate: boundedCount(input.selectedCandidate, BUILD_TRACE_MAX_CANDIDATES),
    selectionReasons: buildTraceCodes(input.selectionReasons),
    outputDigest: DIGEST_PATTERN.test(input.outputDigest)
      ? input.outputDigest
      : buildTraceDigest(input.outputDigest),
    quality: normalizeQualityMap(input.quality),
    startedAt,
    completedAt: instant(input.completedAt, startedAt),
    status: SECTION_STATUSES.has(input.status as BuildTraceSectionStatus)
      ? (input.status as BuildTraceSectionStatus)
      : "fallback",
    ...(input.fallbackCode ? { fallbackCode: buildTraceCode(input.fallbackCode) } : {})
  };
}

function normalizeQualityMap(
  quality: Record<string, number | boolean | string> | undefined
): Record<string, number | boolean | string> {
  const entries: Array<[string, number | boolean | string]> = [];
  for (const [key, value] of Object.entries(quality ?? {}).slice(
    0,
    BUILD_TRACE_MAX_QUALITY
  )) {
    const safeKey = buildTraceCode(key, "");
    if (!safeKey) continue;
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
  private decisions: BuildTraceV1["decisions"] = {};

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
    kind: "framework" | "wireframe",
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
      timings: structuredClone(this.timings)
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Decoder                                                                     */
/* -------------------------------------------------------------------------- */

const TRACE_KEYS = new Set([
  "schemaVersion",
  "traceId",
  "sessionId",
  "attemptId",
  "revision",
  "pipelineVersion",
  "supportRefHash",
  "startedAt",
  "completedAt",
  "terminalStatus",
  "evidenceRefs",
  "decisions",
  "sections",
  "quality",
  "fallbacks",
  "timings"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Strict decoder for stored traces. Unknown keys, wrong versions, malformed
 * references, or anything that fails the privacy scan decode to `undefined`
 * rather than flowing into an inspection surface.
 */
export function parseBuildTrace(value: unknown): BuildTraceV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (Object.keys(value).some((key) => !TRACE_KEYS.has(key))) return undefined;
  if (value.schemaVersion !== BUILD_TRACE_SCHEMA_VERSION) return undefined;
  if (
    typeof value.traceId !== "string"
    || !TRACE_ID_PATTERN.test(value.traceId)
    || typeof value.sessionId !== "string"
    || !TRACE_ID_PATTERN.test(value.sessionId)
    || typeof value.attemptId !== "string"
    || !TRACE_ID_PATTERN.test(value.attemptId)
    || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0
    || typeof value.pipelineVersion !== "string"
    || !PIPELINE_VERSION_PATTERN.test(value.pipelineVersion)
    || typeof value.startedAt !== "string"
    || !ISO_INSTANT_PATTERN.test(value.startedAt)
    || typeof value.terminalStatus !== "string"
    || !TERMINAL_STATUSES.has(value.terminalStatus as BuildTraceTerminalStatus)
    || !Array.isArray(value.evidenceRefs)
    || !value.evidenceRefs.every(
      (ref) => typeof ref === "string" && EVIDENCE_REF_PATTERN.test(ref)
    )
    || value.evidenceRefs.length > BUILD_TRACE_MAX_EVIDENCE_REFS
    || !isRecord(value.decisions)
    || !Array.isArray(value.sections)
    || value.sections.length > BUILD_TRACE_MAX_SECTIONS
    || !Array.isArray(value.quality)
    || !Array.isArray(value.fallbacks)
    || !Array.isArray(value.timings)
  ) {
    return undefined;
  }
  if (
    value.supportRefHash !== undefined
    && (typeof value.supportRefHash !== "string"
      || !SUPPORT_REF_HASH_PATTERN.test(value.supportRefHash))
  ) {
    return undefined;
  }
  if (
    value.completedAt !== undefined
    && (typeof value.completedAt !== "string" || !ISO_INSTANT_PATTERN.test(value.completedAt))
  ) {
    return undefined;
  }
  if (
    Object.keys(value.decisions).some(
      (key) => !["framework", "wireframe", "brand", "assets"].includes(key)
    )
  ) {
    return undefined;
  }
  if (findBuildTracePrivacyViolations(value).length > 0) return undefined;
  return structuredClone(value) as unknown as BuildTraceV1;
}
