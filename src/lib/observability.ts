import { createHash } from "node:crypto";

import {
  sanitizeObservabilityMeta,
  sanitizeObservabilityText,
  type ObservabilityMeta,
  type ObservabilityValue
} from "@/lib/observability-sanitize";

export type { ObservabilityMeta, ObservabilityValue };
export { sanitizeObservabilityMeta, sanitizeObservabilityText };

type StructuredLogRecord = {
  type: "try_me_request" | "try_me_trace" | "try_me_error";
  details?: ObservabilityMeta;
  [key: string]: ObservabilityValue | ObservabilityMeta;
};

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
  "brandDesignReady",
  "brandDesignFidelityScore",
  "brandDesignMissing",
  "brandHarvestRequestId",
  "brandDesignSource",
  "brandDesignConfidence",
  "designReady",
  "designFidelityScore",
  "designMissing",
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
  "providerType",
  "retryable",
  "contentTypeHint",
  "detectedKind",
  "colorSpan",
  "contrastPermille",
  "workerName",
  "workerOutcome",
  "fieldKey",
  "fieldAction",
  "compositionId",
  "variantId",
  "modalKind",
  "interactionType",
  "interactionTarget",
  "entrySurface",
  "domainRole",
  "normalization",
  "interpretation",
  "retryScope",
  "receiptKind"
]);

export function supportRefForTraceId(traceId: string): string {
  return `TMN-${createHash("sha256").update(traceId).digest("hex").slice(0, 12).toUpperCase()}`;
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
