/**
 * Private, versioned contracts for the messaging compiler.
 *
 * The engine already reconciles evidence, ranks a framework, and compiles a
 * spine. What it never had was a persisted record of the *competing* arguments
 * it could have made, why one won, and which evidence each one was allowed to
 * lean on. These types are that record.
 *
 * Everything here is internal. The ledger holds claim text, so an artifact must
 * never reach a public session payload or a trace; only digests, ids, scores,
 * and reason codes are safe to persist.
 */

import type { MessageFrameworkId, MessageSpineSectionUse } from "@/lib/generation/message-spine";
import type {
  SectionStrategyBinding,
  StrategySlotKey
} from "@/lib/generation/section-writing-contract";
import type { SectionRoleV2, WireframeFamilyV2 } from "@/lib/generation/three-family-contract";
import type { MaterialLiveBriefEvidence } from "@/lib/research/evidence-reconciler";
import type { SessionEvidenceItem } from "@/lib/types";

/** Matches CONTRACT_VERSION_PATTERN so the version is trace-safe verbatim. */
export const MESSAGING_COMPILER_VERSION = "messaging-compiler-v1.0.0";
export const MESSAGING_COMPILER_SCHEMA_VERSION = "1.0";
export const MESSAGE_STRATEGY_VERSION = "message-strategy-v1.0.0";

export const COMPILER_EVIDENCE_KINDS = ["fact", "inference", "visitor-context"] as const;
export type CompilerEvidenceKind = (typeof COMPILER_EVIDENCE_KINDS)[number];

export type CompilerEvidenceConfidence = "high" | "medium" | "low";

/**
 * What an evidence item may never be used *as*, independent of section. A low
 * confidence inference can still shape a question; it can never be stated as a
 * fact, offered as proof, or used to manufacture urgency.
 */
export const COMPILER_PROHIBITED_USES = [
  "declarative-claim",
  "proof-point",
  "urgency-claim",
  "competitive-comparison"
] as const;
export type CompilerProhibitedUse = (typeof COMPILER_PROHIBITED_USES)[number];

export const MESSAGE_STRATEGY_ANGLES = ["tension", "upside", "mechanism", "proof"] as const;
export type MessageStrategyAngle = (typeof MESSAGE_STRATEGY_ANGLES)[number];

export interface CompilerEvidenceItem {
  id: string;
  kind: CompilerEvidenceKind;
  claim: string;
  sourceAuthority: string;
  sourceRef: string;
  confidence: CompilerEvidenceConfidence;
  allowedUses: readonly MessageSpineSectionUse[];
  prohibitedUses: readonly CompilerProhibitedUse[];
}

export interface MessageStrategyCandidate {
  id: string;
  version: string;
  frameworkId: MessageFrameworkId;
  angle: MessageStrategyAngle;
  audienceJob: string;
  tension?: string;
  bigIdea: string;
  promise: string;
  mechanism: string;
  proofPlan: string;
  objectionPlan: string;
  ctaLogic: string;
  whyNow?: string;
  evidenceRefs: string[];
  unknowns: string[];
}

export const STRATEGY_EVALUATION_DIMENSIONS = [
  "audienceRelevance",
  "offerSpecificity",
  "differentiation",
  "evidenceStrength",
  "narrativeCoherence",
  "ctaAlignment"
] as const;
export type StrategyEvaluationDimension = (typeof STRATEGY_EVALUATION_DIMENSIONS)[number];

/** Weights sum to 100 so a total reads directly as a 0-100 score. */
export const STRATEGY_DIMENSION_WEIGHTS: Record<StrategyEvaluationDimension, number> = {
  audienceRelevance: 20,
  offerSpecificity: 20,
  differentiation: 15,
  evidenceStrength: 20,
  narrativeCoherence: 15,
  ctaAlignment: 10
};

export interface StrategyEvaluation {
  candidateId: string;
  total: number;
  dimensions: Record<StrategyEvaluationDimension, number>;
  hardFailures: string[];
  reasonCodes: string[];
}

export interface MessagingPagePlanSection {
  id: string;
  role: SectionRoleV2;
  strategyJobs: string[];
}

export interface MessagingPagePlan {
  family: WireframeFamilyV2;
  sectionPlan: MessagingPagePlanSection[];
}

export interface MessagingCompilerArtifact {
  schemaVersion: typeof MESSAGING_COMPILER_SCHEMA_VERSION;
  compilerVersion: string;
  briefRevision: number;
  evidenceLedger: CompilerEvidenceItem[];
  strategies: MessageStrategyCandidate[];
  evaluations: StrategyEvaluation[];
  selectedStrategyId: string;
  pagePlan: MessagingPagePlan;
  baseExperienceDigest?: string;
  variantPatchDigests?: string[];
  /** Structural marker mirroring the spine artifacts. Never serialized publicly. */
  visibility: "internal";
}

/**
 * What travels through the production path: the artifact plus the scores and
 * reason codes needed to write a decision receipt. Carried as one value so the
 * receipt cannot drift from the artifact it explains.
 */
export interface MessagingCompilerReceipt {
  artifact: MessagingCompilerArtifact;
  evaluations: StrategyEvaluation[];
  reasonCodes: string[];
  /**
   * Who the page is for and what it is about. Held on the receipt rather than
   * the artifact because it is review vocabulary, not a compiled decision.
   */
  subject: { audienceLabel: string; offerLabel: string };
}

/**
 * Projects the selected strategy for section binding: the slots each role may
 * draw on, and the one job each section owns. Returns undefined when the
 * selected id is missing from the artifact, so a malformed receipt binds
 * nothing instead of binding the wrong argument.
 */
export function sectionStrategyBinding(
  receipt: MessagingCompilerReceipt
): SectionStrategyBinding | undefined {
  const selected = receipt.artifact.strategies.find(
    ({ id }) => id === receipt.artifact.selectedStrategyId
  );
  if (!selected) return undefined;
  const slots: Partial<Record<StrategySlotKey, string>> = {
    bigIdea: selected.bigIdea,
    audienceJob: selected.audienceJob,
    promise: selected.promise,
    mechanism: selected.mechanism,
    proofPlan: selected.proofPlan,
    objectionPlan: selected.objectionPlan,
    ctaLogic: selected.ctaLogic,
    ...(selected.tension ? { tension: selected.tension } : {}),
    ...(selected.whyNow ? { whyNow: selected.whyNow } : {})
  };
  return {
    slots,
    jobsBySectionId: Object.fromEntries(
      receipt.artifact.pagePlan.sectionPlan.map((section) => [section.id, section.strategyJobs])
    ),
    audienceLabel: receipt.subject.audienceLabel,
    offerLabel: receipt.subject.offerLabel
  };
}

/* -------------------------------------------------------------------------- */
/* Evidence adapters                                                          */
/* -------------------------------------------------------------------------- */

const DECLARATIVE_USES: readonly MessageSpineSectionUse[] = ["hero", "credibility", "urgency"];

function stableUses(
  uses: readonly MessageSpineSectionUse[]
): readonly MessageSpineSectionUse[] {
  return [...new Set(uses)].sort();
}

/**
 * Allowed and prohibited uses follow from kind and confidence rather than from
 * the caller, so an adapter cannot widen what a weak source is permitted to do.
 */
export function compilerEvidencePermissions(
  kind: CompilerEvidenceKind,
  confidence: CompilerEvidenceConfidence
): {
  allowedUses: readonly MessageSpineSectionUse[];
  prohibitedUses: readonly CompilerProhibitedUse[];
} {
  const prohibited = new Set<CompilerProhibitedUse>(["competitive-comparison"]);
  let allowed: MessageSpineSectionUse[];

  if (kind === "fact") {
    allowed = ["hero", "credibility", "urgency", "choice", "mechanism", "team", "cta"];
  } else if (kind === "inference") {
    allowed = ["choice", "mechanism", "team"];
    prohibited.add("proof-point");
    prohibited.add("declarative-claim");
  } else {
    allowed = ["hero", "choice", "cta"];
    prohibited.add("proof-point");
  }

  if (confidence === "low") {
    allowed = allowed.filter((use) => !DECLARATIVE_USES.includes(use));
    prohibited.add("declarative-claim");
    prohibited.add("proof-point");
    prohibited.add("urgency-claim");
  }

  return {
    allowedUses: stableUses(allowed),
    prohibitedUses: [...prohibited].sort()
  };
}

function normalizedClaim(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 400);
}

/**
 * Session evidence is public-source research the visitor may pin or exclude.
 * Excluded items never enter the ledger, so a rejected source cannot resurface
 * as an allowed reference later in the compile.
 */
export function compilerEvidenceFromSessionItems(
  items: readonly SessionEvidenceItem[] | undefined
): CompilerEvidenceItem[] {
  return (items ?? [])
    .filter((item) => item.disposition !== "excluded")
    .flatMap((item) => {
      const claim = normalizedClaim(item.text);
      if (!claim) return [];
      const confidence: CompilerEvidenceConfidence = item.confidence ?? "medium";
      const permissions = compilerEvidencePermissions("fact", confidence);
      return [{
        id: item.id,
        kind: "fact" as const,
        claim,
        sourceAuthority: item.entityRole === "target" ? "target-official" : "seller-official",
        sourceRef: item.sourceUrl,
        confidence,
        ...permissions
      }];
    });
}

/** Numeric worker confidence collapses to the ledger's three bands. */
export function compilerConfidenceBand(value: number): CompilerEvidenceConfidence {
  if (!Number.isFinite(value)) return "low";
  if (value >= 0.8) return "high";
  if (value >= 0.5) return "medium";
  return "low";
}

const LIVE_BRIEF_CLAIM_LABELS: Record<string, string> = {
  companyName: "Seller identity",
  canonicalDomain: "Seller canonical domain",
  company: "Seller description",
  category: "Seller category",
  positioning: "Seller positioning",
  offer: "Promoted offer",
  audience: "Buyer audience and owned job",
  objective: "Campaign objective",
  cta: "Next action",
  brandVisual: "Brand visual system"
};

function liveBriefClaimText(field: string, value: unknown): string {
  if (typeof value === "string") return normalizedClaim(`${LIVE_BRIEF_CLAIM_LABELS[field] ?? field}: ${value}`);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : undefined;
    const job = typeof record.buyerJob === "string" ? record.buyerJob : undefined;
    const detail = [label, job].filter(Boolean).join(": ");
    if (detail) return normalizedClaim(`${LIVE_BRIEF_CLAIM_LABELS[field] ?? field}: ${detail}`);
  }
  return "";
}

/**
 * Reconciled brief fields carry the visitor's own answers and the workers'
 * derived reads. A visitor-edited field is `visitor-context`: authoritative for
 * what the page should be about, never usable as proof that a claim is true.
 */
export function compilerEvidenceFromLiveBrief(
  evidence: MaterialLiveBriefEvidence | undefined
): CompilerEvidenceItem[] {
  if (!evidence) return [];
  return Object.entries(evidence.fields).flatMap(([field, reconciled]) => {
    if (!reconciled) return [];
    const claim = liveBriefClaimText(field, reconciled.value);
    if (!claim) return [];
    const kind: CompilerEvidenceKind = reconciled.visitorEdited ? "visitor-context" : "inference";
    const confidence = compilerConfidenceBand(reconciled.confidence);
    const provenance = reconciled.provenance[0];
    const permissions = compilerEvidencePermissions(kind, confidence);
    return [{
      id: `brief:${field}`,
      kind,
      claim,
      sourceAuthority: provenance?.authority ?? "deterministic",
      sourceRef: reconciled.evidenceRefs[0] ?? provenance?.source ?? `brief:${field}`,
      confidence,
      ...permissions
    }];
  });
}

/**
 * One canonical ledger. Later duplicates lose to earlier ones so session
 * research keeps its stronger `fact` classification when a brief field would
 * otherwise restate it as an inference.
 */
export function compileEvidenceLedger(input: {
  sessionEvidence?: readonly SessionEvidenceItem[];
  liveBriefEvidence?: MaterialLiveBriefEvidence;
}): CompilerEvidenceItem[] {
  const merged = [
    ...compilerEvidenceFromSessionItems(input.sessionEvidence),
    ...compilerEvidenceFromLiveBrief(input.liveBriefEvidence)
  ];
  const byId = new Map<string, CompilerEvidenceItem>();
  for (const item of merged) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** True when this item may back a stated fact rather than only a question. */
export function evidenceSupportsDeclarativeClaim(item: CompilerEvidenceItem): boolean {
  return (
    !item.prohibitedUses.includes("declarative-claim") &&
    item.allowedUses.includes("credibility")
  );
}

/** True when this item may be presented as proof. */
export function evidenceSupportsProof(item: CompilerEvidenceItem): boolean {
  return !item.prohibitedUses.includes("proof-point") && item.kind === "fact";
}

/* -------------------------------------------------------------------------- */
/* Artifact validation                                                        */
/* -------------------------------------------------------------------------- */

export type MessagingCompilerArtifactIssue =
  | "invalid_schema_version"
  | "invalid_compiler_version"
  | "invalid_brief_revision"
  | "duplicate_evidence_id"
  | "empty_evidence_claim"
  | "duplicate_strategy_id"
  | "dangling_evidence_ref"
  | "missing_evaluation"
  | "duplicate_evaluation"
  | "orphan_evaluation"
  | "non_finite_score"
  | "score_out_of_range"
  | "invalid_selected_strategy"
  | "selected_strategy_failed"
  | "duplicate_section_id"
  | "section_without_strategy_job"
  | "duplicate_strategy_job";

/**
 * Returns every problem rather than the first, so a caller rejecting an
 * artifact can say how badly it was malformed without revalidating.
 */
export function validateMessagingCompilerArtifact(
  artifact: MessagingCompilerArtifact
): MessagingCompilerArtifactIssue[] {
  const issues = new Set<MessagingCompilerArtifactIssue>();

  if (artifact.schemaVersion !== MESSAGING_COMPILER_SCHEMA_VERSION) {
    issues.add("invalid_schema_version");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,39}-v\d+(?:\.\d+){0,2}$/.test(artifact.compilerVersion)) {
    issues.add("invalid_compiler_version");
  }
  if (!Number.isSafeInteger(artifact.briefRevision) || artifact.briefRevision < 0) {
    issues.add("invalid_brief_revision");
  }

  const evidenceIds = new Set<string>();
  for (const item of artifact.evidenceLedger) {
    if (evidenceIds.has(item.id)) issues.add("duplicate_evidence_id");
    evidenceIds.add(item.id);
    if (!item.claim.trim()) issues.add("empty_evidence_claim");
  }

  const strategyIds = new Set<string>();
  for (const strategy of artifact.strategies) {
    if (strategyIds.has(strategy.id)) issues.add("duplicate_strategy_id");
    strategyIds.add(strategy.id);
    for (const ref of strategy.evidenceRefs) {
      if (!evidenceIds.has(ref)) issues.add("dangling_evidence_ref");
    }
  }

  const evaluated = new Set<string>();
  for (const evaluation of artifact.evaluations) {
    if (evaluated.has(evaluation.candidateId)) issues.add("duplicate_evaluation");
    evaluated.add(evaluation.candidateId);
    if (!strategyIds.has(evaluation.candidateId)) issues.add("orphan_evaluation");
    const scores = [evaluation.total, ...Object.values(evaluation.dimensions)];
    if (scores.some((value) => !Number.isFinite(value))) issues.add("non_finite_score");
    if (evaluation.total < 0 || evaluation.total > 100) issues.add("score_out_of_range");
    for (const dimension of STRATEGY_EVALUATION_DIMENSIONS) {
      const value = evaluation.dimensions[dimension];
      if (Number.isFinite(value) && (value < 0 || value > STRATEGY_DIMENSION_WEIGHTS[dimension])) {
        issues.add("score_out_of_range");
      }
    }
  }
  for (const id of strategyIds) {
    if (!evaluated.has(id)) issues.add("missing_evaluation");
  }

  if (!strategyIds.has(artifact.selectedStrategyId)) {
    issues.add("invalid_selected_strategy");
  } else {
    const selected = artifact.evaluations.find(
      ({ candidateId }) => candidateId === artifact.selectedStrategyId
    );
    if (selected && selected.hardFailures.length > 0) issues.add("selected_strategy_failed");
  }

  const sectionIds = new Set<string>();
  const claimedJobs = new Set<string>();
  for (const section of artifact.pagePlan.sectionPlan) {
    if (sectionIds.has(section.id)) issues.add("duplicate_section_id");
    sectionIds.add(section.id);
    if (section.strategyJobs.length === 0) issues.add("section_without_strategy_job");
    for (const job of section.strategyJobs) {
      if (claimedJobs.has(job)) issues.add("duplicate_strategy_job");
      claimedJobs.add(job);
    }
  }

  return [...issues].sort();
}

/**
 * Digest-safe projection. Claim text, directives, and source refs are replaced
 * by counts and ids so an artifact can be receipted without being disclosed.
 */
export function messagingCompilerDigestSource(artifact: MessagingCompilerArtifact): unknown {
  return {
    schemaVersion: artifact.schemaVersion,
    compilerVersion: artifact.compilerVersion,
    briefRevision: artifact.briefRevision,
    evidenceCount: artifact.evidenceLedger.length,
    evidenceIds: [...artifact.evidenceLedger.map(({ id }) => id)].sort(),
    strategyIds: [...artifact.strategies.map(({ id }) => id)].sort(),
    selectedStrategyId: artifact.selectedStrategyId,
    family: artifact.pagePlan.family,
    sectionRoles: artifact.pagePlan.sectionPlan.map(({ id, role }) => `${id}:${role}`)
  };
}

/** Digest-safe projection of one candidate. The argument text stays private. */
export function messageStrategyDigestSource(strategy: MessageStrategyCandidate): unknown {
  return {
    id: strategy.id,
    version: strategy.version,
    frameworkId: strategy.frameworkId,
    angle: strategy.angle,
    evidenceRefs: [...strategy.evidenceRefs].sort(),
    unknownCount: strategy.unknowns.length,
    hasTension: Boolean(strategy.tension?.trim()),
    hasWhyNow: Boolean(strategy.whyNow?.trim()),
    slots: {
      bigIdea: strategy.bigIdea,
      promise: strategy.promise,
      mechanism: strategy.mechanism,
      proofPlan: strategy.proofPlan,
      objectionPlan: strategy.objectionPlan,
      ctaLogic: strategy.ctaLogic
    }
  };
}
