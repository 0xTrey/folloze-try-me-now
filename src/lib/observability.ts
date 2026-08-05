import { createHash } from "node:crypto";

export type ObservabilityValue = string | number | boolean | null | undefined;

export type ObservabilityMeta = Record<string, ObservabilityValue>;

type StructuredLogRecord = {
  type: "try_me_request" | "try_me_trace" | "try_me_error";
  details?: ObservabilityMeta;
  [key: string]: ObservabilityValue | ObservabilityMeta;
};

const privateKeyPattern =
  /(?:authorization|cookie|credential|domain|hostname|host|sessionid|email|html|content|copy|password|passphrase|prompt(?:body|text|data|value)?|response(?:body|text|data|value)?|message|stack|cause|headers?|body|secret|token|apikey|sourceurl|sourcebody|sourcecontent|sourcename|filename|filepath|fileid|uploadid|uploadname|uploadpath)$/i;

const safeTopLevelKeys = new Set([
  "type",
  "event",
  "eventId",
  "requestId",
  "traceId",
  "supportRef",
  "spanId",
  "route",
  "method",
  "operation",
  "stage",
  "outcome",
  "status",
  "code",
  "errorName",
  "durationMs",
  "useCase",
  "reason",
  "model",
  "scanned",
  "completed",
  "reconciled",
  "resumed",
  "retryable",
  "pending",
  "failed",
  "missing",
  "stale",
  "deleted",
  "pdfsDeleted",
  "statusRecordsDeleted",
  "maximumSizeInBytes",
  "byteSizeBucket",
  "mode"
]);

const safeDetailKeys = new Set([
  "attemptId",
  "priorAttemptId",
  "requestId",
  "useCase",
  "source",
  "sourceKind",
  "priorSource",
  "identityConfidence",
  "identityFallback",
  "identityRejectionReason",
  "count",
  "categorySource",
  "sellerCategorySource",
  "targetCategorySource",
  "recommendationId",
  "status",
  "hasValue",
  "publishMode",
  "publishStatus",
  "emailStatus",
  "error",
  "durationMs",
  "fallbackReason",
  "model",
  "logoStrategy",
  "logoAvailable",
  "acceptedLogoAvailable",
  "logoCandidateCount",
  "inlineLogoCandidateCount",
  "logoSelectedSource",
  "logoAssetPath",
  "harvestedSource",
  "harvestedColorCount",
  "logoValidationAttempted",
  "logoValidationRejected",
  "brandPublicPageProvider",
  "brandPublicPageAttempts",
  "brandRemoteBrowserProvider",
  "brandfetchProvider",
  "brandfetchLogoApiProvider",
  "brandfetchBrandApiProvider",
  "brandfetchQualityTier",
  "brandfetchClaimed",
  "brandfetchColorCount",
  "brandfetchFontCount",
  "brandfetchImageCount",
  "brandfetchIndustryCount",
  "brandReadiness",
  "paletteConfidence",
  "verifiedBrandFallback",
  "remoteBrowserConfigured",
  "brandfetchConfigured",
  "verifiedFallbackAvailable",
  "stylesheetAttempted",
  "stylesheetSucceeded",
  "colorCount",
  "versionNumber",
  "artifactRevision",
  "submissionToPreviewMs",
  "qualityGate",
  "reason",
  "clientCode",
  "fileSizeBucket",
  "targetStatus",
  "slot",
  "mode",
  "upstreamStatus",
  "contentTypeHint",
  "detectedKind",
  "colorSpan",
  "contrastPermille"
]);

function isPrivateKey(key: string): boolean {
  return privateKeyPattern.test(key.replace(/[^a-z0-9]/gi, ""));
}

const secretPatterns: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
  [/https?:\/\/\S+/gi, "[redacted-url]"],
  [/\b[^\s/\\]+\.pdf\b/gi, "[redacted-pdf]"],
  [/\bfile-[A-Za-z0-9_-]{8,}\b/g, "[redacted-file-id]"],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "[redacted-authorization]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-jwt]"],
  [
    /\b(?:sk_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{12,}|vercel_blob_[A-Za-z0-9_-]{12,}|re_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    "[redacted-secret]"
  ],
  [/\btmn_editor(?:_[a-z0-9_-]+)?=[^;\s]+/gi, "[redacted-editor-cookie]"]
];

export function sanitizeObservabilityText(value: string, maxLength = 240): string {
  return secretPatterns
    .reduce((safe, [pattern, replacement]) => safe.replace(pattern, replacement), value)
    .slice(0, maxLength);
}

export function supportRefForTraceId(traceId: string): string {
  return `TMN-${createHash("sha256").update(traceId).digest("hex").slice(0, 12).toUpperCase()}`;
}

export function sanitizeObservabilityMeta(
  meta: ObservabilityMeta | undefined
): ObservabilityMeta | undefined {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([key, value]) => value !== undefined && !isPrivateKey(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeObservabilityText(value) : value
      ])
  );
}

function sanitizedRecord(record: StructuredLogRecord): Record<string, unknown> {
  const { details, ...fields } = record;
  const topLevel = Object.fromEntries(
    Object.entries(sanitizeObservabilityMeta(fields as ObservabilityMeta) ?? {}).filter(([key]) =>
      safeTopLevelKeys.has(key)
    )
  );
  const safeDetails = Object.fromEntries(
    Object.entries(sanitizeObservabilityMeta(details) ?? {}).filter(([key]) =>
      safeDetailKeys.has(key)
    )
  );
  return {
    ...topLevel,
    at: new Date().toISOString(),
    ...(Object.keys(safeDetails).length ? { details: safeDetails } : {})
  };
}

export function emitObservabilityLog(
  level: "info" | "warn" | "error",
  record: StructuredLogRecord
): void {
  console[level](JSON.stringify(sanitizedRecord(record)));
}
