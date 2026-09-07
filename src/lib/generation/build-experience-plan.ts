import type { BrandProfile } from "@/lib/types";
import { compileBuildBrandKit, planSectionDesign, type BuildBrandKit, type SectionDesignDirective } from "./build-brand-kit";
import type { BuyerClaim, BuyerDecisionBrief, BuyerSectionAssignment } from "./buyer-decision-journey";
import { compilerDigest } from "./compiler-digest";
import type { SectionStrategyBinding } from "./section-writing-contract";
import type { ThesisStrategySelection } from "./thesis-strategy-bridge";
import type { WireframeDecisionV2 } from "./three-family-contract";
import type { WireframeSelectionV1 } from "./wireframe-library";
import { productionBuildLearningContext, selectApprovedBuildLearningHints, type ApprovedBuildLearningArtifact, type ApprovedBuildLearningHint, type BuildLearningScope } from "./approved-build-learning";

export const BUILD_EXPERIENCE_PLAN_VERSION = "build-experience-plan-v1" as const;
export type BuildClaimScope = "offer" | "workflow-context" | "capability" | "proof" | "resource" | "content-insight" | "event-detail" | "pricing" | "security" | "implementation" | "account-context";
export type BuildPlanClaim = BuyerClaim & { scope: BuildClaimScope };
export type BuildPlanSection = BuyerSectionAssignment & {
  design: SectionDesignDirective;
  dependencyDigest: string;
  evidenceMode: "supported-facts" | "buyer-question" | "omit-if-unearned";
  claimScopes: BuildClaimScope[];
  /** Private, reviewed data only. It is never a user instruction or public projection. */
  approvedLearningHints: readonly ApprovedBuildLearningHint[];
};

/** Internal only. Source text and account context never enter public projections. */
export interface BuildExperiencePlan {
  version: typeof BUILD_EXPERIENCE_PLAN_VERSION;
  sessionId: string;
  revision: number;
  digest: string;
  evidenceDigest: string;
  brandKit: BuildBrandKit;
  buyer: BuyerDecisionBrief;
  claims: BuildPlanClaim[];
  strategy: {
    selectedId?: string;
    binding?: SectionStrategyBinding;
    concepts: { id: string; kind: string; eligible: boolean; score?: number; reasonCodes: string[] }[];
    authority: "selected-thesis" | "evidence-bounded-family";
  };
  composition: { family: WireframeDecisionV2["family"]; id: WireframeSelectionV1["compositionId"]; archetypeId: string };
  sections: BuildPlanSection[];
  /** Private build-only feedback. Receipt and public output deliberately omit it. */
  approvedLearning: { enabled: boolean; hintCount: number };
  readiness: {
    state: "ready" | "limited" | "insufficient";
    reasonCodes: string[];
    offerFactCount: number;
    proofCount: number;
    missing: string[];
    requiresNewInput: false;
  };
  controls: {
    existingInputsOnly: true;
    existingInteractionsOnly: true;
    finalOnly: true;
    automaticWinnerSelection: true;
    claimPolicy: "facts-or-useful-question-or-omit";
    revisionPolicy: "recompute-changed-dependencies";
    experimentalEnrollment: false;
  };
}

function scopedClaims(brief: BuyerDecisionBrief): BuildPlanClaim[] {
  const buckets: readonly [BuildClaimScope, readonly BuyerClaim[]][] = [
    ["content-insight", brief.knowledge.contentInsights ?? []],
    ["event-detail", brief.knowledge.eventDetails ?? []],
    ["offer", brief.knowledge.productOffer],
    ["workflow-context", brief.knowledge.workflowContext],
    ["capability", brief.knowledge.supportedCapabilityWorkflowClaims],
    ["proof", brief.knowledge.proofClaims],
    ["resource", brief.knowledge.resources],
    ["pricing", brief.knowledge.objections.pricing],
    ["security", brief.knowledge.objections.security],
    ["implementation", brief.knowledge.objections.implementation],
    ["account-context", brief.knowledge.targetAccountContext]
  ];
  const explained = new Set([...(brief.knowledge.contentInsights ?? []), ...(brief.knowledge.eventDetails ?? [])].map(({ id }) => id));
  return buckets.flatMap(([scope, claims]) => claims.filter((claim) => scope !== "resource" || !explained.has(claim.id)).map((claim) => ({ ...claim, scope })))
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id));
}

/** Permissions travel with each section; citation presence is not role eligibility. */
export function claimAllowedForBuildSection(scope: BuildClaimScope, role: BuyerSectionAssignment["role"]): boolean {
  if (scope === "content-insight" || scope === "event-detail") return !["proof", "proof-depth", "account-relevance"].includes(role);
  if (role === "resource") return scope === "resource";
  if (role === "proof" || role === "proof-depth") return scope === "proof";
  if (role === "account-relevance") return scope === "account-context";
  if (role === "current-friction" || role === "stakes") return scope === "workflow-context" || scope === "account-context";
  if (role === "evaluation-criteria") return ["capability", "pricing", "security", "implementation"].includes(scope);
  if (["mechanism", "solution-mapping", "use-cases", "applications"].includes(role)) return scope === "capability";
  if (role === "shared-opportunity" || role === "priority-paths") return scope === "capability" || scope === "account-context";
  if (role === "validation-plan") return scope === "capability" || scope === "proof";
  if (role === "first-decision") return scope !== "resource";
  if (["next-move", "evaluation-close", "first-decision"].includes(role)) return scope !== "resource" && scope !== "account-context";
  return ["offer", "capability", "workflow-context", "account-context"].includes(scope);
}

export function compileBuildExperiencePlan(input: {
  sessionId: string;
  revision: number;
  brand: BrandProfile;
  brief: BuyerDecisionBrief;
  assignments: readonly BuyerSectionAssignment[];
  decision: WireframeDecisionV2;
  composition: WireframeSelectionV1;
  strategy?: SectionStrategyBinding;
  strategySelection?: ThesisStrategySelection;
  contentSource?: { required: boolean; ready: boolean };
  /** Internal caller-provided artifact and ledger scope. Never derive this from session or model data. */
  approvedLearning?: { artifact?: ApprovedBuildLearningArtifact; scope?: BuildLearningScope };
}): BuildExperiencePlan {
  const kit = compileBuildBrandKit({ brand: input.brand, brief: input.brief });
  const claims = scopedClaims(input.brief);
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const evidenceDigest = compilerDigest("build-learning-evidence-v1", claims);
  const learning = input.approvedLearning ?? productionBuildLearningContext({
    brandScope: input.brand.canonicalDomain ?? input.brand.domain,
    offerScope: input.brief.product.label ?? "unknown",
    evidenceDigest, evidenceVersion: input.brief.schemaVersion
  });
  const approvedHints = learning.scope
    ? selectApprovedBuildLearningHints(learning.artifact, learning.scope)
    : [];
  const sections = input.assignments.map((source): BuildPlanSection => {
    const permitted = source.claimRefs.flatMap((id) => {
      const claim = byId.get(id);
      return claim && claimAllowedForBuildSection(claim.scope, source.role) ? [claim] : [];
    });
    const assignment = { ...source, claimRefs: permitted.map(({ id }) => id) };
    // A hint may only follow every evidence reference into the writer section
    // that already owns those permitted claims. It cannot broaden evidence scope.
    const sectionHints = approvedHints.filter((hint) => hint.evidenceRefs.every((ref) => assignment.claimRefs.includes(ref)));
    const design = planSectionDesign({ kit, assignment });
    const evidenceMode = permitted.length ? "supported-facts" as const : source.optional
      ? "omit-if-unearned" as const : "buyer-question" as const;
    const dependencyDigest = compilerDigest("build-section-dependencies-v1", {
      kit: kit.digest,
      role: assignment.role,
      question: assignment.buyerQuestion,
      conclusion: assignment.desiredConclusion,
      objection: assignment.objection,
      claims: permitted,
      audience: input.brief.audience,
      product: input.brief.product,
      design: design.visual,
      approvedLearningHints: sectionHints,
      // A source-link change only invalidates sections that own an action.
      ...(["next-move", "evaluation-close", "first-decision"].includes(source.role)
        ? { cta: input.brief.cta } : {})
    });
    return { ...assignment, design, dependencyDigest, evidenceMode, approvedLearningHints: sectionHints,
      claimScopes: [...new Set(permitted.map(({ scope }) => scope))].sort() };
  });
  const offerFactCount = claims.filter(({ scope }) => ["offer", "capability", "content-insight", "event-detail"].includes(scope)).length;
  const reasonCodes: string[] = [];
  const missing: string[] = [];
  if (input.brief.product.status !== "exact") { reasonCodes.push("offer_identity_unresolved"); missing.push("offer-identity"); }
  if (!offerFactCount) { reasonCodes.push("offer_explanation_not_sourced"); missing.push("offer-explanation"); }
  if (input.contentSource?.required && !input.contentSource.ready) {
    reasonCodes.push("content_source_incomplete"); missing.push("content-source");
  }
  if (!claims.some(({ scope }) => scope === "proof")) reasonCodes.push("no_permitted_customer_proof");
  if (kit.readiness !== "verified") reasonCodes.push("brand_evidence_partial");
  if (input.brief.trafficIntent.status === "unknown") reasonCodes.push("traffic_intent_unknown");
  if (input.brief.buyingStage.source.startsWith("inferred")) reasonCodes.push("buyer_stage_inferred");
  if (input.brief.knowledge.voice.status === "unknown") reasonCodes.push("brand_voice_unknown");
  const readiness: BuildExperiencePlan["readiness"] = {
    state: !offerFactCount || reasonCodes.includes("content_source_incomplete") ? "insufficient" : missing.length || reasonCodes.some((code) =>
      ["brand_evidence_partial", "traffic_intent_unknown", "brand_voice_unknown"].includes(code)) ? "limited" : "ready",
    reasonCodes, offerFactCount, proofCount: input.brief.knowledge.proofClaims.length, missing, requiresNewInput: false
  };
  const strategy: BuildExperiencePlan["strategy"] = {
    ...(input.strategySelection?.selectedId ? { selectedId: input.strategySelection.selectedId } : {}),
    ...(input.strategy ? { binding: structuredClone(input.strategy) } : {}),
    concepts: (input.strategySelection?.records ?? []).map((record) => ({
      id: record.candidateId, kind: record.argumentKind, eligible: !record.hardFailures.length,
      ...(record.total !== undefined ? { score: record.total } : {}),
      reasonCodes: [...record.hardFailures, ...record.reasonCodes]
    })),
    authority: input.strategy ? "selected-thesis" : "evidence-bounded-family"
  };
  const content = {
    brandKit: kit, buyer: input.brief, claims, strategy, evidenceDigest,
    composition: { family: input.decision.family, id: input.composition.compositionId, archetypeId: input.composition.archetypeId },
    sections, readiness, approvedLearning: { enabled: approvedHints.length > 0, hintCount: approvedHints.length }
  };
  // Creation time and revision are fences, not creative dependencies.
  const stableBuyer = { ...content.buyer, fetchedAt: undefined, expiresAt: undefined };
  return {
    version: BUILD_EXPERIENCE_PLAN_VERSION, sessionId: input.sessionId, revision: input.revision,
    digest: compilerDigest(BUILD_EXPERIENCE_PLAN_VERSION, { ...content, buyer: stableBuyer }),
    ...content,
    controls: { existingInputsOnly: true, existingInteractionsOnly: true, finalOnly: true,
      automaticWinnerSelection: true, claimPolicy: "facts-or-useful-question-or-omit",
      revisionPolicy: "recompute-changed-dependencies", experimentalEnrollment: false }
  };
}

/** Hash-only receipt is suitable for telemetry; plan prose and source URLs are not. */
export function buildExperiencePlanReceipt(plan: BuildExperiencePlan) {
  return {
    version: plan.version, digest: plan.digest, brandKitDigest: plan.brandKit.digest,
    evidenceDigest: plan.evidenceDigest, evidenceVersion: plan.buyer.schemaVersion,
    readiness: plan.readiness.state, reasonCodes: plan.readiness.reasonCodes,
    offerFactCount: plan.readiness.offerFactCount, proofCount: plan.readiness.proofCount,
    conceptCount: plan.strategy.concepts.length, selectedStrategyId: plan.strategy.selectedId,
    sectionCount: plan.sections.length,
    sectionDependencies: plan.sections.map(({ id, dependencyDigest, evidenceMode, claimScopes }) =>
      ({ sectionId: id, digest: dependencyDigest, evidenceMode, claimScopes }))
  };
}

export function compareBuildPlanDependencies(previous: BuildExperiencePlan, next: BuildExperiencePlan) {
  if (previous.sessionId !== next.sessionId) return {
    reusableSectionIds: [] as string[], changedSectionIds: next.sections.map(({ id }) => id), reason: "session_isolation" as const
  };
  const before = new Map(previous.sections.map((section) => [section.id, section.dependencyDigest]));
  return {
    reusableSectionIds: next.sections.filter((section) => before.get(section.id) === section.dependencyDigest).map(({ id }) => id),
    changedSectionIds: next.sections.filter((section) => before.get(section.id) !== section.dependencyDigest).map(({ id }) => id),
    reason: "dependency_comparison" as const
  };
}
