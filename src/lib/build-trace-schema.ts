/**
 * The exact shape a stored BuildTrace may take.
 *
 * The heuristic string scanner in `build-trace.ts` answers "does this value
 * look like private material?", which a short hostile string can slip past. The
 * schema here answers the stronger question: "is this field allowed to exist at
 * all, and is its value one of the forms we can prove is safe?" Anything the
 * schema does not name is rejected wherever it appears, at any depth, so a
 * provider that invents a key cannot smuggle text into a trace by nesting it.
 *
 * This module owns the primitive formats and limits because both the validator
 * and the normalizers need them, and importing them the other way round would
 * be circular.
 */

import { sanitizeObservabilityText } from "@/lib/observability-sanitize";

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

export const CODE_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,119}$/i;
export const DIGEST_PATTERN = /^dg_[a-f0-9]{32}$/;
export const EVIDENCE_REF_PATTERN = /^ev_[a-f0-9]{20}$/;
export const SOURCE_HASH_PATTERN = /^sh_[a-f0-9]{20}$/;
export const SUPPORT_REF_HASH_PATTERN = /^sr_[a-f0-9]{20}$/;
export const TRACE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/i;
export const PIPELINE_VERSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}-v\d+(?:\.\d+){0,2}$/;
export const CONTRACT_VERSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}-v\d+(?:\.\d+){0,2}$/;
export const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** A dotted label ending in letters reads as a hostname, not a code. */
const HOSTNAME_SHAPED = /(?:^|[^0-9a-z])[a-z0-9-]{2,}\.[a-z]{2,24}(?![a-z0-9])/i;
const KNOWN_SECRET_PREFIX =
  /\b(?:sk-|sk_|pk_live|pk_test|ghp_|github_pat_|xox[baprs]-|re_|AKIA|ASIA|AIza|vercel_blob_|Bearer\s|Basic\s)/;
/** C0/C1 controls. A trace value is a code, so none of them belong in one. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;

export const TERMINAL_STATUSES = ["completed", "fallback", "needs_input", "failed", "stale"] as const;
export const SECTION_STATUSES = ["completed", "fallback", "failed", "stale"] as const;
export const WRITER_MODES = ["model", "deterministic", "repair"] as const;
export const ASSET_ROLES = [
  "hero",
  "product",
  "proof",
  "process",
  "people",
  "supporting",
  "logo",
  "decorative"
] as const;
export const FALLBACK_SCOPES = ["experience", "stage", "section"] as const;

/**
 * True when a string carries material that must never reach a trace: an
 * email, URL, hostname, token, control character, markup, or free prose.
 */
export function isUnsafeTraceString(value: string): boolean {
  if (value.length > BUILD_TRACE_CODE_MAX_LENGTH) return true;
  if (CONTROL_CHARACTERS.test(value)) return true;
  if (/[<>]/.test(value)) return true;
  if (/[@]/.test(value)) return true;
  if (/\s/.test(value)) return true;
  if (KNOWN_SECRET_PREFIX.test(value)) return true;
  if (HOSTNAME_SHAPED.test(value)) return true;
  return sanitizeObservabilityText(value, BUILD_TRACE_CODE_MAX_LENGTH) !== value;
}

export interface BuildTracePrivacyViolation {
  path: string;
  reason:
    | "unsafe_string"
    | "oversized_payload"
    | "unexpected_key"
    | "missing_key"
    | "out_of_bounds"
    | "unsupported_value";
}

/* -------------------------------------------------------------------------- */
/* Schema vocabulary                                                           */
/* -------------------------------------------------------------------------- */

type Spec =
  | { kind: "literal"; value: number | string | boolean }
  | { kind: "pattern"; pattern: RegExp }
  | { kind: "code" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "instant" }
  | { kind: "score" }
  | { kind: "integer"; max: number }
  | { kind: "boolean" }
  | { kind: "array"; of: Spec; max: number }
  | { kind: "object"; fields: Record<string, Spec>; optional?: readonly string[] }
  | { kind: "metricMap"; keys: readonly string[] };

const code: Spec = { kind: "code" };
const instant: Spec = { kind: "instant" };
const score: Spec = { kind: "score" };
const flag: Spec = { kind: "boolean" };

function pattern(value: RegExp): Spec {
  return { kind: "pattern", pattern: value };
}
function list(of: Spec, max: number): Spec {
  return { kind: "array", of, max };
}
function object(
  fields: Record<string, Spec>,
  optional: readonly string[] = []
): Spec {
  return { kind: "object", fields, optional };
}

const evidenceRefs = list(pattern(EVIDENCE_REF_PATTERN), BUILD_TRACE_MAX_EVIDENCE_REFS);
const reasonCodes = list(code, BUILD_TRACE_MAX_REASONS);

/**
 * The per-section metrics a receipt may carry. Closed rather than open: the
 * producer is internal, so a key outside this list means something upstream
 * invented a field, which is precisely the case worth rejecting.
 */
export const SECTION_QUALITY_KEYS = [
  "evidencecount",
  "required",
  "withinwordbudget",
  "wordcount"
] as const;

const RANKED_DECISION: Spec = object({
  decision: code,
  version: pattern(CONTRACT_VERSION_PATTERN),
  selectedCandidateId: code,
  candidates: list(
    object({
      candidateId: code,
      score,
      selected: flag,
      reasonCodes
    }),
    BUILD_TRACE_MAX_CANDIDATES
  ),
  evidenceRefs,
  confidence: score,
  reasonCodes
});

const BRAND_DECISION: Spec = object({
  version: pattern(CONTRACT_VERSION_PATTERN),
  readiness: code,
  confidence: score,
  roles: list(
    object({
      role: code,
      valueDigest: pattern(DIGEST_PATTERN),
      sourceAuthority: code,
      candidateCount: { kind: "integer", max: 1000 },
      confidence: score,
      selectionReasons: reasonCodes,
      evidenceRefs
    }),
    BUILD_TRACE_MAX_ROLES
  ),
  warnings: reasonCodes,
  evidenceRefs
});

const ASSET_ALLOCATION: Spec = object({
  version: pattern(CONTRACT_VERSION_PATTERN),
  allocations: list(
    object({
      allocationKey: code,
      sectionId: code,
      semanticRole: { kind: "enum", values: ASSET_ROLES },
      assetDigest: pattern(DIGEST_PATTERN),
      evidenceRef: pattern(EVIDENCE_REF_PATTERN),
      sourceUrlHash: pattern(SOURCE_HASH_PATTERN),
      purpose: code,
      reusable: flag,
      score
    }),
    BUILD_TRACE_MAX_ALLOCATIONS
  ),
  substantiveCount: { kind: "integer", max: BUILD_TRACE_MAX_ALLOCATIONS },
  reusableCount: { kind: "integer", max: BUILD_TRACE_MAX_ALLOCATIONS },
  rejectedCount: { kind: "integer", max: 10_000 },
  rejectionReasons: reasonCodes
});

const SECTION: Spec = object(
  {
    sectionId: code,
    role: code,
    promptVersion: pattern(CONTRACT_VERSION_PATTERN),
    templateVersion: pattern(CONTRACT_VERSION_PATTERN),
    writerMode: { kind: "enum", values: WRITER_MODES },
    model: code,
    inputEvidenceRefs: evidenceRefs,
    inputDigest: pattern(DIGEST_PATTERN),
    candidateDigests: list(pattern(DIGEST_PATTERN), BUILD_TRACE_MAX_CANDIDATES),
    selectedCandidate: { kind: "integer", max: BUILD_TRACE_MAX_CANDIDATES },
    selectionReasons: reasonCodes,
    outputDigest: pattern(DIGEST_PATTERN),
    quality: { kind: "metricMap", keys: SECTION_QUALITY_KEYS },
    startedAt: instant,
    completedAt: instant,
    status: { kind: "enum", values: SECTION_STATUSES },
    fallbackCode: code
  },
  ["model", "fallbackCode"]
);

const QUALITY: Spec = object({
  dimension: code,
  score,
  blocking: { kind: "literal", value: false },
  warnings: reasonCodes,
  violations: reasonCodes,
  evidenceRefs
});

const FALLBACK: Spec = object(
  {
    stage: code,
    code,
    scope: { kind: "enum", values: FALLBACK_SCOPES },
    at: instant,
    sectionId: code
  },
  ["sectionId"]
);

const TIMING: Spec = object({
  stage: code,
  startedAt: instant,
  completedAt: instant,
  durationMs: { kind: "integer", max: 300_000 },
  status: code
});

/** The complete contract. Every field a stored trace may contain is here. */
export const BUILD_TRACE_SPEC: Spec = object(
  {
    schemaVersion: { kind: "literal", value: BUILD_TRACE_SCHEMA_VERSION },
    traceId: pattern(TRACE_ID_PATTERN),
    sessionId: pattern(TRACE_ID_PATTERN),
    attemptId: pattern(TRACE_ID_PATTERN),
    revision: { kind: "integer", max: 100_000 },
    pipelineVersion: pattern(PIPELINE_VERSION_PATTERN),
    supportRefHash: pattern(SUPPORT_REF_HASH_PATTERN),
    startedAt: instant,
    completedAt: instant,
    terminalStatus: { kind: "enum", values: TERMINAL_STATUSES },
    evidenceRefs,
    decisions: object(
      {
        framework: RANKED_DECISION,
        wireframe: RANKED_DECISION,
        brand: BRAND_DECISION,
        assets: ASSET_ALLOCATION
      },
      ["framework", "wireframe", "brand", "assets"]
    ),
    sections: list(SECTION, BUILD_TRACE_MAX_SECTIONS),
    quality: list(QUALITY, BUILD_TRACE_MAX_QUALITY),
    fallbacks: list(FALLBACK, BUILD_TRACE_MAX_FALLBACKS),
    timings: list(TIMING, BUILD_TRACE_MAX_TIMINGS)
  },
  ["supportRefHash", "completedAt"]
);

/* -------------------------------------------------------------------------- */
/* Validator                                                                   */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validate(
  value: unknown,
  spec: Spec,
  path: string,
  violations: BuildTracePrivacyViolation[]
): void {
  switch (spec.kind) {
    case "literal": {
      if (value !== spec.value) violations.push({ path, reason: "unsupported_value" });
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") violations.push({ path, reason: "unsupported_value" });
      return;
    }
    case "score": {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        violations.push({ path, reason: "out_of_bounds" });
      }
      return;
    }
    case "integer": {
      if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > spec.max) {
        violations.push({ path, reason: "out_of_bounds" });
      }
      return;
    }
    case "instant": {
      if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) {
        violations.push({ path, reason: "unsafe_string" });
      }
      return;
    }
    case "pattern": {
      if (typeof value !== "string" || !spec.pattern.test(value)) {
        violations.push({ path, reason: "unsafe_string" });
      }
      return;
    }
    case "enum": {
      if (typeof value !== "string" || !spec.values.includes(value)) {
        violations.push({ path, reason: "unsupported_value" });
      }
      return;
    }
    case "code": {
      if (
        typeof value !== "string"
        || !CODE_PATTERN.test(value)
        || isUnsafeTraceString(value)
      ) {
        violations.push({ path, reason: "unsafe_string" });
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        violations.push({ path, reason: "unsupported_value" });
        return;
      }
      if (value.length > spec.max) violations.push({ path, reason: "out_of_bounds" });
      value.forEach((item, index) => validate(item, spec.of, `${path}[${index}]`, violations));
      return;
    }
    case "metricMap": {
      if (!isRecord(value)) {
        violations.push({ path, reason: "unsupported_value" });
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (!spec.keys.includes(key)) {
          violations.push({ path: childPath, reason: "unexpected_key" });
          continue;
        }
        if (typeof item === "boolean") continue;
        if (typeof item === "number") {
          if (!Number.isFinite(item)) violations.push({ path: childPath, reason: "out_of_bounds" });
          continue;
        }
        validate(item, code, childPath, violations);
      }
      return;
    }
    case "object": {
      if (!isRecord(value)) {
        violations.push({ path, reason: "unsupported_value" });
        return;
      }
      const optional = new Set(spec.optional ?? []);
      for (const key of Object.keys(value)) {
        if (!(key in spec.fields)) {
          violations.push({ path: `${path}.${key}`, reason: "unexpected_key" });
        }
      }
      for (const [key, fieldSpec] of Object.entries(spec.fields)) {
        const child = value[key];
        if (child === undefined) {
          if (!optional.has(key)) violations.push({ path: `${path}.${key}`, reason: "missing_key" });
          continue;
        }
        validate(child, fieldSpec, `${path}.${key}`, violations);
      }
      return;
    }
  }
}

/**
 * Validates a trace against the exact contract. Returns every problem rather
 * than the first, so a caller logging a rejection can say how badly the value
 * was malformed without re-running the check.
 */
export function validateBuildTraceShape(value: unknown): BuildTracePrivacyViolation[] {
  const violations: BuildTracePrivacyViolation[] = [];
  validate(value, BUILD_TRACE_SPEC, "trace", violations);
  return violations;
}

/** The named sub-contracts, so a normalizer's output can be checked alone. */
const FRAGMENT_SPECS = {
  rankedDecision: RANKED_DECISION,
  brandDecision: BRAND_DECISION,
  assetAllocation: ASSET_ALLOCATION,
  section: SECTION,
  quality: QUALITY,
  fallback: FALLBACK,
  timing: TIMING
} as const;

export type BuildTraceFragmentKind = keyof typeof FRAGMENT_SPECS;

/**
 * Validates one piece of a trace against its own contract. A normalizer can be
 * proven correct without assembling a whole trace around its output.
 */
export function validateBuildTraceFragment(
  kind: BuildTraceFragmentKind,
  value: unknown
): BuildTracePrivacyViolation[] {
  const violations: BuildTracePrivacyViolation[] = [];
  validate(value, FRAGMENT_SPECS[kind], kind, violations);
  return violations;
}
