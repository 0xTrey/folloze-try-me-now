import type { PreviewWorkerKind } from "./worker-types";
import type { SessionAnswers, UseCase } from "@/lib/types";
import {
  buildResearchQueryPlanV2,
  type ResearchQueryPlanV2
} from "./research-query-plan-v2";

export type ResearchAuthorityRole = "seller" | "target" | "source";

export interface StabilizedResearchJob {
  worker: PreviewWorkerKind;
  role: ResearchAuthorityRole;
  sessionId?: string;
  revision?: number;
  /** Stable key for single-flight dedupe (domain or URL). */
  key: string;
  reason:
    | "seller_domain_stabilized"
    | "target_domain_stabilized"
    | "source_url_stabilized"
    | "offer_source_url_stabilized";
  /** Soft per-job ceiling inside the shared customer deadline. */
  timeoutMs: number;
}

export interface EarlyResearchPlan {
  jobs: StabilizedResearchJob[];
  sellerAuthorityKey: string;
  targetEvidenceKey?: string;
  queryPlan?: ResearchQueryPlanV2;
  generationEligible: boolean;
  /** True when a target job is planned without mutating seller authority. */
  sellerAuthorityPreserved: boolean;
  deadlineAt?: number;
  fallbackCode?: "research_attempt_deadline_elapsed";
}

export interface PlanEarlyResearchInput {
  sessionId?: string;
  revision?: number;
  useCase: UseCase;
  companyDomain: string;
  companyName?: string;
  officialNavigationTerms?: readonly string[];
  answers: Pick<
    SessionAnswers,
    "targetDomain" | "sourceUrl" | "offerSourceUrl" | "audience" | "objective" | "campaignType" | "promotedOffer" | "eventSource" | "sourceName" | "messageBelief"
  >;
  /** Skip jobs whose artifacts are already present for the same key. */
  completedKeys?: Iterable<string>;
  /** Current coordinator time for deterministic deadline tests. */
  nowMs?: number;
  /** Shared attempt cutoff. No new jobs are planned at or after this time. */
  attemptDeadlineAt?: number;
}

const SELLER_BRAND_TIMEOUT_MS = 25_000;
const TARGET_ACCOUNT_TIMEOUT_MS = 25_000;
const SOURCE_INTELLIGENCE_TIMEOUT_MS = 15_000;

/**
 * Material brief eligibility for generation. Provisional rendering may begin
 * only after this returns true; early research may start before it.
 */
export function isMaterialBriefEligible(
  useCase: UseCase,
  answers: PlanEarlyResearchInput["answers"]
): boolean {
  // Content Magic is source-led: the uploaded document or public URL is the
  // brief. Audience and objective are inferred by the production engine rather
  // than collected as blocking questions.
  if (useCase === "content") {
    return Boolean(answers.sourceUrl || answers.sourceName);
  }
  const common = Boolean(answers.audience && answers.objective);
  if (!common) return false;
  if (useCase === "abm") {
    const productContextReady =
      answers.objective !== "Introduce a product" ||
      Boolean(answers.sourceUrl || answers.sourceName || answers.messageBelief?.trim());
    return Boolean(answers.targetDomain && productContextReady);
  }
  if (useCase === "campaign") {
    return Boolean(
      answers.campaignType &&
        (answers.promotedOffer?.trim() || answers.offerSourceUrl) &&
        (answers.campaignType !== "event" || answers.eventSource)
    );
  }
  return false;
}

function normalizeStabilizedDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim().toLowerCase();
  let trimmed = raw;
  try {
    trimmed = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return undefined;
  }
  trimmed = trimmed.replace(/^www\./, "").replace(/\.$/, "");
  if (!trimmed || trimmed.includes(" ") || !trimmed.includes(".")) return undefined;
  return trimmed;
}

function normalizeStabilizedUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Plans bounded brand, account, and source work from stabilized inputs.
 * Seller and target remain separate authority roles; target evidence never
 * replaces the seller domain key.
 */
export function planEarlyResearch(input: PlanEarlyResearchInput): EarlyResearchPlan {
  const completed = new Set(
    [...(input.completedKeys ?? [])].map((key) => key.trim().toLowerCase()).filter(Boolean)
  );
  const sellerAuthorityKey = normalizeStabilizedDomain(input.companyDomain) ?? "";
  const jobs: StabilizedResearchJob[] = [];
  const nowMs = input.nowMs;
  const deadlineAt = input.attemptDeadlineAt;
  const canStartWork =
    nowMs === undefined || deadlineAt === undefined || nowMs < deadlineAt;
  const boundedTimeout = (timeoutMs: number) =>
    nowMs !== undefined && deadlineAt !== undefined
      ? Math.max(0, Math.min(timeoutMs, deadlineAt - nowMs))
      : timeoutMs;
  const jobContext =
    input.sessionId && input.revision !== undefined
      ? { sessionId: input.sessionId, revision: input.revision }
      : {};

  if (
    canStartWork &&
    sellerAuthorityKey &&
    !completed.has(`seller:${sellerAuthorityKey}`)
  ) {
    jobs.push({
      ...jobContext,
      worker: "brand-enrichment",
      role: "seller",
      key: sellerAuthorityKey,
      reason: "seller_domain_stabilized",
      timeoutMs: boundedTimeout(SELLER_BRAND_TIMEOUT_MS)
    });
  }

  const targetEvidenceKey =
    input.useCase === "abm"
      ? normalizeStabilizedDomain(input.answers.targetDomain)
      : undefined;
  if (
    canStartWork &&
    targetEvidenceKey &&
    !completed.has(`target:${targetEvidenceKey}`)
  ) {
    jobs.push({
      ...jobContext,
      worker: "account-research",
      role: "target",
      key: targetEvidenceKey,
      reason: "target_domain_stabilized",
      timeoutMs: boundedTimeout(TARGET_ACCOUNT_TIMEOUT_MS)
    });
  }

  const offerSourceUrl =
    input.useCase === "campaign"
      ? normalizeStabilizedUrl(input.answers.offerSourceUrl)
      : undefined;
  const sourceUrl =
    input.useCase === "content" || input.useCase === "abm"
      ? normalizeStabilizedUrl(input.answers.sourceUrl)
      : undefined;
  const activeSourceUrl = offerSourceUrl ?? sourceUrl;
  if (
    canStartWork &&
    activeSourceUrl &&
    !completed.has(`source:${activeSourceUrl}`)
  ) {
    jobs.push({
      ...jobContext,
      worker: "source-intelligence",
      role: "source",
      key: activeSourceUrl,
      reason: offerSourceUrl ? "offer_source_url_stabilized" : "source_url_stabilized",
      timeoutMs: boundedTimeout(SOURCE_INTELLIGENCE_TIMEOUT_MS)
    });
  }

  const queryPlan =
    sellerAuthorityKey &&
    input.sessionId &&
    input.revision !== undefined
      ? buildResearchQueryPlanV2({
          sessionId: input.sessionId,
          revision: input.revision,
          sellerDomain: sellerAuthorityKey,
          companyName: input.companyName,
          officialNavigationTerms: input.officialNavigationTerms,
          sourceUrls: activeSourceUrl ? [activeSourceUrl] : [],
          targetDomain:
            input.useCase === "abm" ? targetEvidenceKey : undefined
        })
      : undefined;

  // Target evidence is a separate lane. It may share a domain string with the
  // seller, but it never claims the seller brand-enrichment worker.
  const sellerAuthorityPreserved =
    Boolean(sellerAuthorityKey) &&
    jobs.every((job) => (job.role === "seller" ? job.key === sellerAuthorityKey : true)) &&
    jobs.every((job) => (job.role === "target" ? job.worker === "account-research" : true));

  return {
    jobs,
    sellerAuthorityKey,
    ...(targetEvidenceKey ? { targetEvidenceKey } : {}),
    ...(queryPlan ? { queryPlan } : {}),
    generationEligible: isMaterialBriefEligible(input.useCase, input.answers),
    sellerAuthorityPreserved,
    ...(deadlineAt !== undefined ? { deadlineAt } : {}),
    ...(!canStartWork ? { fallbackCode: "research_attempt_deadline_elapsed" as const } : {})
  };
}

/** Single-flight key for a planned research job. */
export function researchFlightKey(job: StabilizedResearchJob): string {
  const scope =
    job.sessionId && job.revision !== undefined
      ? `${job.sessionId}:${job.revision}:`
      : "";
  return `${scope}${job.role}:${job.key}`;
}

/** Deduplicate planned jobs that share the same flight key. */
export function dedupeResearchJobs(jobs: StabilizedResearchJob[]): StabilizedResearchJob[] {
  const seen = new Set<string>();
  const unique: StabilizedResearchJob[] = [];
  for (const job of jobs) {
    const key = researchFlightKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(job);
  }
  return unique;
}
