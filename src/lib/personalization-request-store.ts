import { createHash, randomUUID } from "node:crypto";

import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

import { hasBlob } from "@/lib/config";
import { HttpError } from "@/lib/http";
import { assertBusinessEmail, normalizeDomain } from "@/lib/validation";

export const PERSONALIZATION_TARGET_COUNT = 3 as const;

export type PersonalizationTargetStatus =
  | "pending"
  | "researching"
  | "ready"
  | "needs_review"
  | "failed";

export type PersonalizationRequestStatus =
  | "awaiting_targets"
  | "queued"
  | "generating"
  | "completed"
  | "partial"
  | "needs_review"
  | "failed";

export type PersonalizationTargetSelectionMode = "manual" | "representative";

export interface PersonalizationTarget {
  id: string;
  position: number;
  domain: string;
  role?: string;
  status: PersonalizationTargetStatus;
  generatedSessionId: string;
  link?: string;
  artifactDigest?: string;
  evidenceCount?: number;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PersonalizationRequest {
  id: string;
  sessionId: string;
  email: string;
  targets: PersonalizationTarget[];
  baselineArtifactRevision: number;
  baselineArtifactDigest: string;
  status: PersonalizationRequestStatus;
  selectionMode?: PersonalizationTargetSelectionMode;
  variantCount: typeof PERSONALIZATION_TARGET_COUNT;
  consentScope: "transactional_experience_delivery";
  executionAttemptId?: string;
  executionLeaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface PublicPersonalizationTarget {
  id: string;
  position: number;
  domain: string;
  role?: string;
  status: PersonalizationTargetStatus;
  link?: string;
  evidenceCount?: number;
  errorCode?: string;
}

export interface PublicPersonalizationRequest {
  id: string;
  sessionId: string;
  emailMasked: string;
  targetCount: number;
  targets: PublicPersonalizationTarget[];
  baselineArtifactRevision: number;
  status: PersonalizationRequestStatus;
  selectionMode?: PersonalizationTargetSelectionMode;
  variantCount: typeof PERSONALIZATION_TARGET_COUNT;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type PersonalizationTargetInput = {
  domain: string;
  role?: string;
};

declare global {
  var __follozePersonalizationRequests:
    | Map<string, PersonalizationRequest>
    | undefined;
}

const memory =
  globalThis.__follozePersonalizationRequests ??
  new Map<string, PersonalizationRequest>();
globalThis.__follozePersonalizationRequests = memory;

const useBlob = hasBlob && process.env.NODE_ENV !== "test";
const pathFor = (sessionId: string) =>
  `try-me/personalization-requests/${sessionId}.json`;
const strongEtag = (etag: string) => etag.replace(/^W\//, "");
const TERMINAL_TARGET_STATUSES = new Set<PersonalizationTargetStatus>([
  "ready",
  "needs_review",
  "failed"
]);
const TERMINAL_REQUEST_STATUSES = new Set<PersonalizationRequestStatus>([
  "completed",
  "partial",
  "needs_review",
  "failed"
]);

type RequestSnapshot = {
  record: PersonalizationRequest;
  etag?: string;
};

function assertDurableRequestStore(): void {
  if (process.env.NODE_ENV === "production" && !hasBlob) {
    throw new HttpError(
      503,
      "personalization_store_unavailable",
      "Personalization requests are temporarily unavailable. Please try again shortly."
    );
  }
}

function maskEmail(email: string): string {
  const [local = "", domain = "redacted"] = email.split("@");
  return `${local.slice(0, 1) || "*"}***@${domain}`;
}

function targetHash(requestId: string, position: number, domain: string): string {
  return createHash("sha256")
    .update(`${requestId}:${position}:${domain}`)
    .digest("hex")
    .slice(0, 32);
}

function boundedErrorCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || undefined;
}

function normalizedRole(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "invalid_target_role",
      "Buyer roles must be plain text."
    );
  }
  const role = value.replace(/\s+/g, " ").trim();
  if (!role) return undefined;
  if (role.length > 120) {
    throw new HttpError(
      400,
      "invalid_target_role",
      "Buyer roles must be 120 characters or fewer."
    );
  }
  return role;
}

function normalizeTargetDomain(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "invalid_target_domain",
      "Each target requires a public company domain."
    );
  }
  try {
    return normalizeDomain(value);
  } catch {
    throw new HttpError(
      400,
      "invalid_target_domain",
      "Enter each target as a public company domain, such as acme.com."
    );
  }
}

export function normalizePersonalizationTargets(
  value: unknown,
  options: { requestId: string; sellerDomain: string }
): [PersonalizationTarget, PersonalizationTarget, PersonalizationTarget] {
  if (!Array.isArray(value) || value.length !== PERSONALIZATION_TARGET_COUNT) {
    throw new HttpError(
      400,
      "personalization_target_count_invalid",
      "Provide exactly three target company domains."
    );
  }

  const sellerDomain = normalizeTargetDomain(options.sellerDomain);
  const seen = new Set<string>();
  const targets = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new HttpError(
        400,
        "invalid_personalization_target",
        "Each target requires a company domain."
      );
    }
    const record = candidate as Record<string, unknown>;
    const domain = normalizeTargetDomain(record.domain);
    if (domain === sellerDomain) {
      throw new HttpError(
        400,
        "seller_cannot_be_target",
        "Choose target accounts other than the company offering the experience."
      );
    }
    if (seen.has(domain)) {
      throw new HttpError(
        400,
        "duplicate_target_domain",
        "Choose three different target companies."
      );
    }
    seen.add(domain);
    const position = index + 1;
    const hash = targetHash(options.requestId, position, domain);
    const role = normalizedRole(record.role);
    return {
      id: `target_${position}_${hash.slice(0, 12)}`,
      position,
      domain,
      ...(role ? { role } : {}),
      status: "pending" as const,
      generatedSessionId: `pv_${hash}`
    };
  });

  return targets as [
    PersonalizationTarget,
    PersonalizationTarget,
    PersonalizationTarget
  ];
}

export function validateTargetDomains(values: unknown): string[] {
  return normalizePersonalizationTargets(values, {
    requestId: "validation-only",
    sellerDomain: "seller.invalid"
  }).map((target) => target.domain);
}

async function readSnapshot(sessionId: string): Promise<RequestSnapshot | undefined> {
  assertDurableRequestStore();
  if (!useBlob) {
    const record = memory.get(sessionId);
    return record ? { record: structuredClone(record) } : undefined;
  }
  const result = await get(pathFor(sessionId), {
    access: "private",
    useCache: false
  });
  if (!result || result.statusCode !== 200) return undefined;
  return {
    record: (await new Response(result.stream).json()) as PersonalizationRequest,
    etag: strongEtag(result.blob.etag)
  };
}

async function writeRequest(
  record: PersonalizationRequest,
  options: { etag?: string } = {}
): Promise<void> {
  if (!useBlob) {
    memory.set(record.sessionId, structuredClone(record));
    return;
  }
  await put(pathFor(record.sessionId), JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: Boolean(options.etag),
    cacheControlMaxAge: 60,
    contentType: "application/json",
    ...(options.etag ? { ifMatch: options.etag } : {})
  });
}

async function mutateRequest(
  sessionId: string,
  updater: (
    current: PersonalizationRequest
  ) => PersonalizationRequest | undefined
): Promise<PersonalizationRequest> {
  if (!useBlob) {
    const current = memory.get(sessionId);
    if (!current) {
      throw new HttpError(
        404,
        "personalization_request_not_found",
        "This personalization request is no longer available."
      );
    }
    const next = updater(structuredClone(current));
    if (!next) return structuredClone(current);
    next.updatedAt = new Date().toISOString();
    memory.set(sessionId, structuredClone(next));
    return next;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await readSnapshot(sessionId);
    if (!snapshot) {
      throw new HttpError(
        404,
        "personalization_request_not_found",
        "This personalization request is no longer available."
      );
    }
    const next = updater(structuredClone(snapshot.record));
    if (!next) return snapshot.record;
    next.updatedAt = new Date().toISOString();
    try {
      await writeRequest(next, { etag: snapshot.etag });
      return next;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      throw error;
    }
  }
  throw new HttpError(
    409,
    "personalization_request_changed",
    "The request changed while it was being updated. Please retry."
  );
}

export async function createPersonalizationRequest(input: {
  sessionId: string;
  email: string;
  artifactRevision: number;
  artifactDigest: string;
}): Promise<PersonalizationRequest> {
  const email = assertBusinessEmail(input.email);
  if (!Number.isInteger(input.artifactRevision) || input.artifactRevision < 1) {
    throw new HttpError(
      409,
      "personalization_baseline_invalid",
      "The finished experience revision could not be verified."
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(input.artifactDigest)) {
    throw new HttpError(
      409,
      "personalization_baseline_invalid",
      "The finished experience could not be verified."
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await readSnapshot(input.sessionId);
    if (existing) {
      if (Date.parse(existing.record.expiresAt) <= Date.now()) {
        const now = new Date();
        const replacement: PersonalizationRequest = {
          id: randomUUID(),
          sessionId: input.sessionId,
          email,
          targets: [],
          baselineArtifactRevision: input.artifactRevision,
          baselineArtifactDigest: input.artifactDigest,
          status: "awaiting_targets",
          variantCount: PERSONALIZATION_TARGET_COUNT,
          consentScope: "transactional_experience_delivery",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000).toISOString()
        };
        try {
          await writeRequest(replacement, { etag: existing.etag });
          return replacement;
        } catch (error) {
          if (error instanceof BlobPreconditionFailedError) continue;
          throw error;
        }
      }
      if (existing.record.email !== email) {
        throw new HttpError(
          409,
          "personalization_email_mismatch",
          "This experience already has a request under another email."
        );
      }
      if (
        existing.record.baselineArtifactRevision !== input.artifactRevision ||
        existing.record.baselineArtifactDigest !== input.artifactDigest
      ) {
        throw new HttpError(
          409,
          "personalization_baseline_changed",
          "The finished experience changed after this request started. Start a new request."
        );
      }
      return existing.record;
    }

    const now = new Date();
    const record: PersonalizationRequest = {
      id: randomUUID(),
      sessionId: input.sessionId,
      email,
      targets: [],
      baselineArtifactRevision: input.artifactRevision,
      baselineArtifactDigest: input.artifactDigest,
      status: "awaiting_targets",
      variantCount: PERSONALIZATION_TARGET_COUNT,
      consentScope: "transactional_experience_delivery",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000).toISOString()
    };
    try {
      await writeRequest(record);
      return record;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      throw error;
    }
  }

  throw new HttpError(
    409,
    "personalization_request_changed",
    "The request changed while it was being created. Please retry."
  );
}

export async function addPersonalizationTargets(
  sessionId: string,
  value: unknown,
  sellerDomain: string,
  options: { selectionMode?: PersonalizationTargetSelectionMode } = {}
): Promise<PersonalizationRequest> {
  return mutateRequest(sessionId, (current) => {
    const selectionMode = options.selectionMode ?? "manual";
    const targets = normalizePersonalizationTargets(value, {
      requestId: current.id,
      sellerDomain
    });
    if (current.status !== "awaiting_targets") {
      const unchanged = current.targets.every(
        (target, index) =>
          target.domain === targets[index]?.domain &&
          (target.role ?? "") === (targets[index]?.role ?? "")
      ) && (current.selectionMode ?? "manual") === selectionMode;
      if (unchanged) return undefined;
      throw new HttpError(
        409,
        "personalization_targets_locked",
        "These target accounts are already being built."
      );
    }
    return {
      ...current,
      targets,
      selectionMode,
      status: "queued"
    };
  });
}

export async function getPersonalizationRequest(
  sessionId: string
): Promise<PersonalizationRequest | undefined> {
  const record = (await readSnapshot(sessionId))?.record;
  if (!record || Date.parse(record.expiresAt) <= Date.now()) return undefined;
  return record;
}

export async function acquirePersonalizationExecution(
  sessionId: string,
  leaseSeconds = 300
): Promise<
  | { acquired: false; request: PersonalizationRequest }
  | { acquired: true; request: PersonalizationRequest; attemptId: string }
> {
  let acquiredAttemptId: string | undefined;
  const request = await mutateRequest(sessionId, (current) => {
    if (TERMINAL_REQUEST_STATUSES.has(current.status)) return undefined;
    if (!current.targets.length || current.status === "awaiting_targets") return undefined;
    const leaseExpiresAt = Date.parse(current.executionLeaseExpiresAt ?? "");
    if (
      current.status === "generating" &&
      Number.isFinite(leaseExpiresAt) &&
      leaseExpiresAt > Date.now()
    ) {
      return undefined;
    }
    acquiredAttemptId = randomUUID();
    return {
      ...current,
      status: "generating",
      executionAttemptId: acquiredAttemptId,
      executionLeaseExpiresAt: new Date(
        Date.now() + Math.max(30, Math.min(600, leaseSeconds)) * 1_000
      ).toISOString()
    };
  });
  return acquiredAttemptId
    ? { acquired: true, request, attemptId: acquiredAttemptId }
    : { acquired: false, request };
}

/**
 * Moves every queued target into the visible research phase with one
 * conditional write. The generation work can then fan out without three
 * workers contending on the same request record just to announce startup.
 */
export async function markPersonalizationTargetsResearching(
  sessionId: string,
  attemptId: string
): Promise<PersonalizationRequest> {
  return mutateRequest(sessionId, (current) => {
    if (current.executionAttemptId !== attemptId) return undefined;
    const now = new Date().toISOString();
    let changed = false;
    const targets = current.targets.map((target) => {
      if (TERMINAL_TARGET_STATUSES.has(target.status) || target.status === "researching") {
        return target;
      }
      changed = true;
      return {
        ...target,
        status: "researching" as const,
        startedAt: target.startedAt ?? now
      };
    });
    return changed ? { ...current, targets } : undefined;
  });
}

export async function updatePersonalizationTarget(input: {
  sessionId: string;
  attemptId: string;
  targetId: string;
  status: PersonalizationTargetStatus;
  link?: string;
  artifactDigest?: string;
  evidenceCount?: number;
  errorCode?: string;
}): Promise<PersonalizationRequest> {
  return mutateRequest(input.sessionId, (current) => {
    if (current.executionAttemptId !== input.attemptId) return undefined;
    const targetIndex = current.targets.findIndex(
      (target) => target.id === input.targetId
    );
    if (targetIndex < 0) {
      throw new HttpError(
        404,
        "personalization_target_not_found",
        "The target account could not be found."
      );
    }
    const previous = current.targets[targetIndex]!;
    if (TERMINAL_TARGET_STATUSES.has(previous.status)) return undefined;
    const now = new Date().toISOString();
    const nextTarget: PersonalizationTarget = {
      ...previous,
      status: input.status,
      ...(input.link ? { link: input.link } : {}),
      ...(input.artifactDigest
        ? { artifactDigest: input.artifactDigest }
        : {}),
      ...(input.evidenceCount !== undefined
        ? { evidenceCount: Math.max(0, Math.trunc(input.evidenceCount)) }
        : {}),
      ...(boundedErrorCode(input.errorCode)
        ? { errorCode: boundedErrorCode(input.errorCode) }
        : {}),
      ...(!previous.startedAt ? { startedAt: now } : {}),
      ...(TERMINAL_TARGET_STATUSES.has(input.status)
        ? { completedAt: now }
        : {})
    };
    const targets = [...current.targets];
    targets[targetIndex] = nextTarget;
    return { ...current, targets };
  });
}

export async function finishPersonalizationExecution(
  sessionId: string,
  attemptId: string
): Promise<PersonalizationRequest> {
  return mutateRequest(sessionId, (current) => {
    if (current.executionAttemptId !== attemptId) return undefined;
    const terminal = current.targets.every((target) =>
      TERMINAL_TARGET_STATUSES.has(target.status)
    );
    if (!terminal) return { ...current, status: "generating" };
    const readyCount = current.targets.filter(
      (target) => target.status === "ready"
    ).length;
    const reviewCount = current.targets.filter(
      (target) => target.status === "needs_review"
    ).length;
    const status: PersonalizationRequestStatus =
      readyCount === PERSONALIZATION_TARGET_COUNT
        ? "completed"
        : readyCount > 0
          ? "partial"
          : reviewCount > 0
            ? "needs_review"
            : "failed";
    const settled = structuredClone(current);
    delete settled.executionAttemptId;
    delete settled.executionLeaseExpiresAt;
    return { ...settled, status };
  });
}

export function toPublicPersonalizationRequest(
  request: PersonalizationRequest
): PublicPersonalizationRequest {
  return {
    id: request.id,
    sessionId: request.sessionId,
    emailMasked: maskEmail(request.email),
    targetCount: request.targets.length,
    targets: request.targets.map(
      ({ id, position, domain, role, status, link, evidenceCount, errorCode }) => ({
        id,
        position,
        domain,
        ...(role ? { role } : {}),
        status,
        ...(link ? { link } : {}),
        ...(evidenceCount !== undefined ? { evidenceCount } : {}),
        ...(errorCode ? { errorCode } : {})
      })
    ),
    baselineArtifactRevision: request.baselineArtifactRevision,
    status: request.status,
    ...(request.selectionMode ? { selectionMode: request.selectionMode } : {}),
    variantCount: PERSONALIZATION_TARGET_COUNT,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    expiresAt: request.expiresAt
  };
}

export function clearMemoryPersonalizationRequestsForTest(): void {
  memory.clear();
}
