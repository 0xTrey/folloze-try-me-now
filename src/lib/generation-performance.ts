import type { TraceEventRecord } from "@/lib/trace-store";

/**
 * A deliberately small, safe projection of trace records used for the
 * 60-second dashboard. This module must never receive raw session data,
 * submitted inputs, source material, or provider responses.
 */
export type GenerationPerformanceRecord = Pick<
  TraceEventRecord,
  "event" | "at" | "outcome" | "spanId" | "durationMs" | "meta"
>;

export type DurationDistribution = {
  count: number;
  p50Ms?: number;
  p95Ms?: number;
  underTargetCount: number;
  underTargetRate?: number;
};

export type GenerationPerformanceSummary = {
  attemptsObserved: number;
  terminalAttempts: number;
  incompleteAttempts: number;
  excludedDiscardedAttempts: number;
  attemptsWithoutEligibility: number;
  failedAttempts: number;
  fallbackAttempts: number;
  unsafeRecordsRejected: number;
  ignoredRecords: number;
  eligibleToProvisional: DurationDistribution;
  eligibleToTerminal: DurationDistribution;
};

export type GenerationPerformanceDashboardRow = {
  metric: string;
  value: number | undefined;
  targetMs?: number;
  sampleSize: number;
  status: "healthy" | "breach" | "insufficient-data";
};

type AttemptState = {
  eligibleAt?: number;
  provisionalAt?: number;
  terminalAt?: number;
  failed: boolean;
  discarded: boolean;
  fallback: boolean;
};

const trackedEvents = new Set([
  "generation_eligible",
  "preview_provisional_ready",
  "generation_completed",
  "generation_failed",
  "generation_discarded",
  "preview_ready",
  // Reserved for the browser/iframe acknowledgement. Including it now makes
  // the aggregation forward-compatible without making it a UI dependency.
  "preview_rendered"
]);

const privateField =
  /(email|domain|hostname|host|session|token|secret|password|prompt|content|copy|html|source(?:url|body|content)?|url|filename|filepath|fileid|uploadid)/i;
const privateValue = /(?:@|https?:\/\/|\bsk[-_]|\beyJ[A-Za-z0-9_-]{8,}|tmn_editor)/i;
const safeAttemptId = /^[a-zA-Z0-9_-]{1,160}$/;
const safeMetricMetaKeys = new Set([
  "attemptId",
  "source",
  "fallbackReason",
  "model",
  "qualityGate",
  "artifactRevision",
  "durationMs",
  "generationEligibleToPreviewMs",
  "provisionalToFinalMs",
  "submissionToPreviewMs"
]);

function safeMeta(meta: GenerationPerformanceRecord["meta"]): boolean {
  if (!meta) return true;
  return Object.entries(meta).every(([key, value]) => {
    // `source` is a bounded runtime mode (for example, deterministic-fallback),
    // while sourceUrl/sourceBody are private. Require the small metric-specific
    // allowlist instead of relying on a broad string-pattern distinction.
    if (!safeMetricMetaKeys.has(key) || privateField.test(key) && key !== "source") return false;
    return typeof value !== "string" || !privateValue.test(value);
  });
}

/**
 * Trace span IDs are preferred. Older records can use the existing allowlisted
 * `attemptId` metadata. Anything else is intentionally excluded rather than
 * inventing correlation from a session identifier.
 */
export function generationAttemptKey(record: GenerationPerformanceRecord): string | undefined {
  const candidate = record.spanId ?? record.meta?.attemptId;
  return typeof candidate === "string" && safeAttemptId.test(candidate)
    ? candidate
    : undefined;
}

function validTimestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentile(sorted: number[], percentileValue: number): number | undefined {
  if (!sorted.length) return undefined;
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function summarizeDurations(values: number[], targetMs: number): DurationDistribution {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const underTargetCount = sorted.filter((value) => value <= targetMs).length;
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    underTargetCount,
    underTargetRate: sorted.length ? underTargetCount / sorted.length : undefined
  };
}

/**
 * Produces dashboard-ready, non-identifying performance statistics. Discarded
 * attempts are deliberately excluded from service-level metrics: they represent
 * a user edit or superseded revision, not a completed customer attempt.
 */
export function summarizeGenerationPerformance(
  records: GenerationPerformanceRecord[]
): GenerationPerformanceSummary {
  const attempts = new Map<string, AttemptState>();
  let unsafeRecordsRejected = 0;
  let ignoredRecords = 0;

  for (const record of records) {
    if (!trackedEvents.has(record.event)) {
      ignoredRecords += 1;
      continue;
    }
    if (!safeMeta(record.meta)) {
      unsafeRecordsRejected += 1;
      continue;
    }
    const attemptId = generationAttemptKey(record);
    const at = validTimestamp(record.at);
    if (!attemptId || at === undefined) {
      unsafeRecordsRejected += 1;
      continue;
    }
    const current = attempts.get(attemptId) ?? { failed: false, discarded: false, fallback: false };
    if (record.event === "generation_eligible") current.eligibleAt ??= at;
    if (record.event === "preview_provisional_ready") current.provisionalAt ??= at;
    if (record.event === "preview_ready" || record.event === "preview_rendered") {
      current.terminalAt ??= at;
    }
    if (record.event === "generation_failed") current.failed = true;
    if (record.event === "generation_discarded") current.discarded = true;
    if (
      record.outcome === "fallback" ||
      record.meta?.source === "deterministic-fallback" ||
      typeof record.meta?.fallbackReason === "string"
    ) {
      current.fallback = true;
    }
    attempts.set(attemptId, current);
  }

  const eligibleToProvisional: number[] = [];
  const eligibleToTerminal: number[] = [];
  let terminalAttempts = 0;
  let incompleteAttempts = 0;
  let excludedDiscardedAttempts = 0;
  let attemptsWithoutEligibility = 0;
  let failedAttempts = 0;
  let fallbackAttempts = 0;

  for (const attempt of attempts.values()) {
    if (attempt.discarded) {
      excludedDiscardedAttempts += 1;
      continue;
    }
    if (!attempt.eligibleAt) attemptsWithoutEligibility += 1;
    if (attempt.failed) failedAttempts += 1;
    if (attempt.fallback) fallbackAttempts += 1;
    if (attempt.eligibleAt !== undefined && attempt.provisionalAt !== undefined) {
      eligibleToProvisional.push(Math.max(0, attempt.provisionalAt - attempt.eligibleAt));
    }
    if (attempt.eligibleAt !== undefined && attempt.terminalAt !== undefined) {
      terminalAttempts += 1;
      eligibleToTerminal.push(Math.max(0, attempt.terminalAt - attempt.eligibleAt));
    } else if (!attempt.failed) {
      incompleteAttempts += 1;
    }
  }

  return {
    attemptsObserved: attempts.size,
    terminalAttempts,
    incompleteAttempts,
    excludedDiscardedAttempts,
    attemptsWithoutEligibility,
    failedAttempts,
    fallbackAttempts,
    unsafeRecordsRejected,
    ignoredRecords,
    eligibleToProvisional: summarizeDurations(eligibleToProvisional, 15_000),
    eligibleToTerminal: summarizeDurations(eligibleToTerminal, 60_000)
  };
}

/**
 * This is the dashboard/API contract for a future operator endpoint. It is
 * intentionally aggregate-only: no support refs, trace IDs, domains, or input
 * data are returned to the product dashboard.
 */
export function generationPerformanceDashboardRows(
  summary: GenerationPerformanceSummary
): GenerationPerformanceDashboardRow[] {
  const metric = (
    name: string,
    distribution: DurationDistribution,
    targetMs: number
  ): GenerationPerformanceDashboardRow => ({
    metric: name,
    value: distribution.p95Ms,
    targetMs,
    sampleSize: distribution.count,
    status: distribution.count < 20
      ? "insufficient-data"
      : distribution.p95Ms !== undefined && distribution.p95Ms <= targetMs
        ? "healthy"
        : "breach"
  });

  return [
    metric("eligible_to_provisional_p95_ms", summary.eligibleToProvisional, 15_000),
    metric("eligible_to_terminal_p95_ms", summary.eligibleToTerminal, 60_000),
    {
      metric: "fallback_rate",
      value: summary.terminalAttempts
        ? summary.fallbackAttempts / summary.terminalAttempts
        : undefined,
      sampleSize: summary.terminalAttempts,
      status: summary.terminalAttempts < 20 ? "insufficient-data" : "healthy"
    },
    {
      metric: "failed_attempt_rate",
      value: summary.attemptsObserved
        ? summary.failedAttempts / summary.attemptsObserved
        : undefined,
      sampleSize: summary.attemptsObserved,
      status: summary.attemptsObserved < 20 ? "insufficient-data" : "healthy"
    }
  ];
}
