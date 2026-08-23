import { createHash } from "node:crypto";

import {
  isPrivateObservabilityKey,
  sanitizeObservabilityMeta as baseSanitizeObservabilityMeta,
  sanitizeObservabilityText as baseSanitizeObservabilityText,
  type ObservabilityMeta,
  type ObservabilityValue
} from "@/lib/observability-sanitize";

export type { ObservabilityMeta, ObservabilityValue };

const prohibitedTelemetryKeyPattern =
  /(?:rawsource|sourcebod(?:y|ies)|sourcecontent|modelprompt|providerprompt|promptinput|promptoutput|providerresponse|modelresponse|providermessage|generatedcopy|generatedhtml|uploadedfile|uploadpayload|queryurl|accesstoken|refreshtoken|clientsecret|privatekey)/i;

export function sanitizeObservabilityText(value: string, maxLength = 240): string {
  return baseSanitizeObservabilityText(value, maxLength)
    .replace(
      /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|credential)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted-credential]"
    )
    .replace(/(?:^|\s)\/[^\s?]*\?[^\s]+/g, " [redacted-query-url]")
    .slice(0, maxLength);
}

export function sanitizeObservabilityMeta(
  meta: ObservabilityMeta | undefined
): ObservabilityMeta | undefined {
  const sanitized = baseSanitizeObservabilityMeta(meta);
  if (!sanitized) return undefined;
  return Object.fromEntries(
    Object.entries(sanitized)
      .filter(([key]) => {
        const normalized = key.replace(/[^a-z0-9]/gi, "");
        return !isPrivateObservabilityKey(key) && !prohibitedTelemetryKeyPattern.test(normalized);
      })
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeObservabilityText(value) : value
      ])
  );
}

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
  "revision",
  "useCase",
  "reason",
  "reasonCode",
  "family",
  "sectionCount",
  "evidenceCount",
  "fallbackCode",
  "errorCode",
  "worker",
  "receiptKind",
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
  "revision",
  "fallbackReason",
  "fallbackCode",
  "errorCode",
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
  "worker",
  "workerOutcome",
  "evidenceCount",
  "confidenceBand",
  "family",
  "reasonCode",
  "sectionCount",
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
