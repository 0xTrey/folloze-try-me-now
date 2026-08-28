/**
 * Compiles competing message strategies and selects one before any copy exists.
 *
 * The framework ranker already picks a *shape* for the argument. It does not
 * decide what the argument actually says, and it keeps no record of the
 * arguments it passed over. This module builds three or four materially
 * different arguments from the same evidence, scores each as a complete
 * argument, and selects one deterministically. A model may later validate the
 * choice; it may not invent an alternative outside this set.
 *
 * Every function here is pure. Selection must be reproducible from the inputs
 * alone so a trace receipt can be checked against a re-run.
 */

import type {
  MessageFrameworkId,
  MessageFrameworkRanking,
  MessageSpineSectionUse
} from "@/lib/generation/message-spine";
import {
  MESSAGE_STRATEGY_ANGLES,
  MESSAGE_STRATEGY_VERSION,
  MESSAGING_COMPILER_SCHEMA_VERSION,
  MESSAGING_COMPILER_VERSION,
  STRATEGY_DIMENSION_WEIGHTS,
  evidenceSupportsDeclarativeClaim,
  evidenceSupportsProof,
  type CompilerEvidenceItem,
  type MessageStrategyAngle,
  type MessageStrategyCandidate,
  type MessagingCompilerArtifact,
  type MessagingPagePlanSection,
  type StrategyEvaluation,
  type StrategyEvaluationDimension
} from "@/lib/generation/messaging-compiler-contracts";
import type { RequiredProductionArgument } from "@/lib/generation/production-message-spine";
import type {
  SectionRoleV2,
  SectionSlotV2,
  WireframeFamilyV2
} from "@/lib/generation/three-family-contract";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

export const STRATEGY_JOBS = [
  "audience-job",
  "tension",
  "big-idea",
  "promise",
  "mechanism",
  "proof",
  "objection",
  "why-now",
  "cta"
] as const;
export type StrategyJob = (typeof STRATEGY_JOBS)[number];

/**
 * Which framework best carries each angle. Ordered by fit, so an angle takes
 * the strongest ranked framework it can still claim.
 */
const ANGLE_FRAMEWORK_AFFINITY: Record<MessageStrategyAngle, readonly MessageFrameworkId[]> = {
  tension: ["problem-change", "outcome-mechanism", "event-value"],
  upside: ["outcome-mechanism", "event-value", "problem-change"],
  mechanism: ["technical-validation", "source-insight", "outcome-mechanism"],
  proof: ["proof-led-decision", "source-insight", "technical-validation"]
};

const ANGLE_EVIDENCE_USE: Record<MessageStrategyAngle, MessageSpineSectionUse> = {
  tension: "urgency",
  upside: "hero",
  mechanism: "mechanism",
  proof: "credibility"
};

/**
 * Copy that reads the same with any vendor's name dropped into it. Present in a
 * strategy slot, it is evidence that the argument has no owner.
 */
export const COMPETITOR_SWAPPABLE_PATTERN =
  /\b(?:best[- ]in[- ]class|industry[- ]leading|world[- ]class|market[- ]leading|cutting[- ]edge|next[- ]generation|end[- ]to[- ]end solution|seamless(?:ly)?|holistic|synerg(?:y|ies|istic)|unlock value|drive transformation|trusted partner|innovative solution|one[- ]stop shop)\b/gi;

/** Audience language that names a market segment instead of a person's job. */
export const GENERIC_AUDIENCE_PATTERN =
  /^(?:buyer team|decision makers?|stakeholders?|business leaders?|the market|customers?|users?|everyone|teams?|organizations?|companies)$/i;

const GENERIC_JOB_PATTERN =
  /^(?:evaluate fit|learn more|explore options|understand the market|get informed|make a decision)\.?$/i;

const STOPWORDS = new Set([
  "with", "that", "this", "from", "into", "their", "through", "about", "which",
  "where", "while", "there", "these", "those", "company", "platform", "solution",
  "business", "customer", "customers", "product", "service", "services", "team",
  "teams", "your", "they", "them", "will", "have", "been", "more", "than", "when"
]);

function terms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function distinctiveTerms(value: string): Set<string> {
  return new Set(terms(value));
}

function sharesTerm(left: string, right: string): boolean {
  const rightTerms = distinctiveTerms(right);
  return terms(left).some((token) => rightTerms.has(token));
}

/**
 * Terms long enough to name a subject rather than a grammatical connective,
 * with a plural folded onto its singular so "excursion" and "excursions" are
 * recognized as the same subject.
 */
function citationTerms(value: string): Set<string> {
  return new Set(
    terms(value)
      .filter((token) => token.length > 4)
      .map((token) => (token.length > 5 && token.endsWith("s") ? token.slice(0, -1) : token))
  );
}

/** Shared terms below which two passages are not about the same thing. */
const SHARED_TERMS_FOR_CITATION = 2;

/**
 * True when a claim is about the same subject as the directive it would be
 * cited for. Two shared terms is the threshold the copy reviewer already uses:
 * one is ordinary business vocabulary that any two sentences share, and a
 * single word like "every" is exactly how an unrelated ref gets borrowed.
 */
function citationSupportsDirective(directive: string, claim: string): boolean {
  const claimTerms = citationTerms(claim);
  let shared = 0;
  for (const term of citationTerms(directive)) {
    if (claimTerms.has(term)) shared += 1;
    if (shared >= SHARED_TERMS_FOR_CITATION) return true;
  }
  return false;
}

/**
 * The same subject test the evaluator uses, for compilers above this one that
 * must judge an argument by identical rules rather than by their own.
 */
export function argumentSharesSubject(left: string, right: string): boolean {
  return sharesTerm(left, right);
}

function concise(value: string, max = 240): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 40 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

function lowerFirst(value: string): string {
  return value.length ? `${value[0]!.toLocaleLowerCase()}${value.slice(1)}` : value;
}

function swappableMatches(value: string): number {
  return value.match(COMPETITOR_SWAPPABLE_PATTERN)?.length ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Candidate compilation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The route contract's own wording for the slots a family owns. The angle may
 * not overwrite these: which family a page belongs to is already a decided,
 * evidence-backed question, and re-arguing it per angle would produce four
 * pages that differ in voice rather than in argument.
 */
export interface FamilyArgumentBaseline {
  promise: string;
  mechanism: string;
  decisionHelp: string;
  nextAction: string;
  /**
   * The route's own framing of the status quo, used only when no evidence
   * supports a specific one. Keeping it means a locked section that argues
   * from tension still resolves instead of vanishing from the page.
   */
  tension?: string;
}

export interface MessageStrategyCompilerInput {
  ranking: MessageFrameworkRanking;
  family: WireframeFamilyV2;
  baseline: FamilyArgumentBaseline;
  ledger: readonly CompilerEvidenceItem[];
  sellerName: string;
  targetName?: string;
  offer: string;
  audienceLabel: string;
  audienceJob: string;
  objective: string;
  ctaLabel: string;
  unknowns?: readonly string[];
}

function rankedFrameworkIds(ranking: MessageFrameworkRanking): MessageFrameworkId[] {
  return [ranking.selected, ...ranking.alternatives].map(({ id }) => id);
}

function evidenceForAngle(
  ledger: readonly CompilerEvidenceItem[],
  angle: MessageStrategyAngle
): CompilerEvidenceItem[] {
  const use = ANGLE_EVIDENCE_USE[angle];
  return ledger.filter((item) => {
    if (!item.allowedUses.includes(use)) return false;
    if (angle === "proof") return evidenceSupportsProof(item);
    if (angle === "tension") return evidenceSupportsDeclarativeClaim(item);
    return true;
  });
}

interface AngleSlots {
  bigIdea: string;
  promise: string;
  mechanism: string;
  proofPlan: string;
  objectionPlan: string;
  ctaLogic: string;
  tension?: string;
  whyNow?: string;
}

/**
 * The angle owns the argument spine: what the page is fundamentally claiming,
 * whether a tension is stated at all, how proof is handled when evidence runs
 * out, and what objection the page answers. The family keeps its own slots.
 */
function angleSlots(
  angle: MessageStrategyAngle,
  input: MessageStrategyCompilerInput,
  support: readonly CompilerEvidenceItem[]
): AngleSlots {
  const { baseline, offer, audienceLabel, objective, sellerName, targetName } = input;
  const objectiveAction = objective.trim() ? lowerFirst(objective.trim()) : "validate the next decision";
  const owner = targetName ?? audienceLabel;
  const proofClaim = support.find((item) => evidenceSupportsProof(item))?.claim;
  // Seller positioning already opens the page. Reusing it as the status quo
  // would restate one claim in two sections, so only referenced research
  // evidence can supply a tension the page has not already made.
  const contextClaim = support.find((item) => item.kind === "fact")?.claim;

  // Every angle carries the tension when one is supported; the angle decides
  // whether it leads the argument, not whether the page may acknowledge it.
  const tension = contextClaim?.trim() || baseline.tension?.trim();
  const family = {
    promise: baseline.promise,
    mechanism: baseline.mechanism,
    ctaLogic: baseline.nextAction,
    ...(tension ? { tension: concise(tension) } : {})
  };

  if (angle === "tension") {
    return {
      ...family,
      bigIdea: `The current approach costs ${owner} more than ${offer} would.`,
      objectionPlan: `${baseline.decisionHelp} Answer the cost question with referenced evidence and phrase anything unreferenced as a question.`,
      proofPlan: proofClaim
        ? "Lead with the referenced evidence that the current approach carries this cost, then state its limits."
        : `Use a validation plan instead of declarative proof; ask ${audienceLabel} to confirm the cost against their own numbers.`,
      whyNow: `${objective} is the decision ${owner} is already facing.`
    };
  }

  if (angle === "upside") {
    return {
      ...family,
      bigIdea: `${offer} makes ${objectiveAction} a routine outcome for ${audienceLabel}.`,
      objectionPlan: `${baseline.decisionHelp} Separate what the outcome depends on from what is already supported.`,
      proofPlan: proofClaim
        ? `Use referenced ${sellerName} evidence only; separate supported facts from validation questions.`
        : `Use a validation plan instead of declarative proof; ask ${audienceLabel} to verify the mechanism and the fit.`,
      whyNow: `${objectiveAction} is the next useful buyer action for ${offer}.`
    };
  }

  if (angle === "mechanism") {
    return {
      ...family,
      bigIdea: `How ${offer} works is the reason ${audienceLabel} can trust the outcome.`,
      objectionPlan: `${baseline.decisionHelp} Make each step checkable rather than asking for trust.`,
      proofPlan: proofClaim
        ? "Attach each mechanism step to the referenced evidence that shows it working."
        : `Ask ${audienceLabel} to test each mechanism step rather than asserting an unreferenced result.`,
      whyNow: `${offer} changes what ${audienceLabel} should examine before making this decision.`
    };
  }

  return {
    ...family,
    bigIdea: `What ${sellerName} can already show decides whether ${offer} is worth ${owner}'s time.`,
    objectionPlan: `${baseline.decisionHelp} Mark plainly where the evidence stops.`,
    proofPlan: proofClaim
      ? "Lead with the strongest referenced evidence, state its limits, and keep every proof statement traceable."
      : "State plainly that supporting evidence is not yet available and offer a validation plan instead.",
    whyNow: `${owner} can ${objectiveAction} once the evidence is in front of them.`
  };
}

/**
 * One candidate per supported angle, each on its own framework so the set is a
 * choice between arguments rather than between phrasings of one argument.
 */
export function compileMessageStrategyCandidates(
  input: MessageStrategyCompilerInput
): MessageStrategyCandidate[] {
  const ranked = rankedFrameworkIds(input.ranking);
  const claimed = new Set<MessageFrameworkId>();
  const candidates: MessageStrategyCandidate[] = [];

  for (const angle of MESSAGE_STRATEGY_ANGLES) {
    const affinity = ANGLE_FRAMEWORK_AFFINITY[angle];
    const frameworkId =
      ranked.find((id) => affinity.includes(id) && !claimed.has(id)) ??
      ranked.find((id) => !claimed.has(id));
    if (!frameworkId) continue;
    claimed.add(frameworkId);

    const support = evidenceForAngle(input.ledger, angle);
    const slots = angleSlots(angle, input, support);
    const unknowns = [...(input.unknowns ?? [])];
    if (angle === "proof" && !support.some((item) => evidenceSupportsProof(item))) {
      unknowns.push("No referenced evidence supports a declarative proof claim.");
    }
    if (!support.some((item) => item.kind === "fact")) {
      unknowns.push("No evidence-bounded status-quo tension was supplied.");
    }

    candidates.push({
      id: `strategy-${angle}`,
      version: MESSAGE_STRATEGY_VERSION,
      frameworkId,
      angle,
      audienceJob: concise(input.audienceJob, 200),
      ...(slots.tension ? { tension: slots.tension } : {}),
      bigIdea: concise(slots.bigIdea),
      promise: concise(slots.promise),
      mechanism: concise(slots.mechanism),
      proofPlan: concise(slots.proofPlan),
      objectionPlan: concise(slots.objectionPlan),
      ctaLogic: concise(slots.ctaLogic),
      ...(slots.whyNow ? { whyNow: concise(slots.whyNow) } : {}),
      evidenceRefs: [...new Set(support.map(({ id }) => id))].sort(),
      unknowns: [...new Set(unknowns)].sort()
    });
  }

  return candidates;
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                  */
/* -------------------------------------------------------------------------- */

export interface StrategyEvaluationContext {
  ledger: readonly CompilerEvidenceItem[];
  offer: string;
  audienceLabel: string;
  objective: string;
  ctaLabel: string;
  sellerName: string;
}

function candidateProse(candidate: MessageStrategyCandidate): string {
  return [
    candidate.bigIdea,
    candidate.promise,
    candidate.mechanism,
    candidate.proofPlan,
    candidate.objectionPlan,
    candidate.ctaLogic,
    candidate.tension ?? "",
    candidate.whyNow ?? ""
  ]
    .filter(Boolean)
    .join(" ");
}

function hardFailuresFor(
  candidate: MessageStrategyCandidate,
  context: StrategyEvaluationContext
): string[] {
  const failures: string[] = [];
  const byId = new Map(context.ledger.map((item) => [item.id, item]));
  const prose = candidateProse(candidate);

  if (candidate.evidenceRefs.some((ref) => !byId.has(ref))) {
    failures.push("dangling_evidence_ref");
  }
  if (candidate.evidenceRefs.length === 0) {
    failures.push("angle_without_supporting_evidence");
  }
  if (
    GENERIC_AUDIENCE_PATTERN.test(context.audienceLabel.trim()) &&
    GENERIC_JOB_PATTERN.test(candidate.audienceJob.trim())
  ) {
    failures.push("generic_audience_language");
  }
  if (!sharesTerm(context.offer, `${candidate.bigIdea} ${candidate.promise}`)) {
    failures.push("offer_identity_missing");
  }
  if (!candidate.ctaLogic.toLocaleLowerCase().includes(context.ctaLabel.trim().toLocaleLowerCase())) {
    failures.push("cta_mismatch");
  }
  if (
    candidate.angle === "proof" &&
    !candidate.evidenceRefs
      .map((ref) => byId.get(ref))
      .some((item) => item && evidenceSupportsProof(item))
  ) {
    failures.push("proof_angle_without_proof_evidence");
  }
  // A page that leads with tension has to be leading with a real one. Route
  // boilerplate about "needing a reason to change" is not a status quo.
  if (candidate.angle === "tension") {
    const tension = candidate.tension?.trim();
    const referenced = candidate.evidenceRefs
      .map((ref) => byId.get(ref)?.claim ?? "")
      .join(" ");
    if (!tension || !sharesTerm(tension, referenced)) {
      failures.push("tension_not_evidence_bound");
    }
  }
  if (swappableMatches(prose) >= 3) {
    failures.push("competitor_swappable_argument");
  }
  return [...new Set(failures)].sort();
}

function scoreOf(fraction: number, weight: number): number {
  const bounded = Math.max(0, Math.min(1, fraction));
  return Math.round(bounded * weight * 100) / 100;
}

function evidenceWeight(item: CompilerEvidenceItem): number {
  if (item.confidence === "high") return 1;
  if (item.confidence === "medium") return 0.6;
  return 0.25;
}

export function evaluateMessageStrategy(
  candidate: MessageStrategyCandidate,
  context: StrategyEvaluationContext
): StrategyEvaluation {
  const hardFailures = hardFailuresFor(candidate, context);
  const reasonCodes = new Set<string>([`angle_${candidate.angle}`, `framework_${candidate.frameworkId}`]);
  const byId = new Map(context.ledger.map((item) => [item.id, item]));
  const support = candidate.evidenceRefs.flatMap((ref) => {
    const item = byId.get(ref);
    return item ? [item] : [];
  });
  const prose = candidateProse(candidate);

  if (hardFailures.length > 0) {
    for (const failure of hardFailures) reasonCodes.add(`hard_failure_${failure}`);
    const zeroed = Object.fromEntries(
      Object.keys(STRATEGY_DIMENSION_WEIGHTS).map((key) => [key, 0])
    ) as Record<StrategyEvaluationDimension, number>;
    return {
      candidateId: candidate.id,
      total: 0,
      dimensions: zeroed,
      hardFailures,
      reasonCodes: [...reasonCodes].sort()
    };
  }

  const jobSpecific =
    !GENERIC_JOB_PATTERN.test(candidate.audienceJob.trim()) &&
    distinctiveTerms(candidate.audienceJob).size >= 3;
  const audienceNamed = sharesTerm(context.audienceLabel, `${candidate.bigIdea} ${candidate.promise}`);
  const audienceRelevance = scoreOf(
    (jobSpecific ? 0.45 : 0.1) + (audienceNamed ? 0.35 : 0) + (candidate.audienceJob.trim() ? 0.2 : 0),
    STRATEGY_DIMENSION_WEIGHTS.audienceRelevance
  );
  if (jobSpecific) reasonCodes.add("audience_job_specific");
  if (audienceNamed) reasonCodes.add("audience_named_in_argument");

  const offerInPromise = sharesTerm(context.offer, candidate.promise);
  const offerInMechanism = sharesTerm(context.offer, candidate.mechanism);
  const mechanismSpecific = distinctiveTerms(candidate.mechanism).size >= 6;
  const offerSpecificity = scoreOf(
    (offerInPromise ? 0.4 : 0) + (offerInMechanism ? 0.3 : 0) + (mechanismSpecific ? 0.3 : 0),
    STRATEGY_DIMENSION_WEIGHTS.offerSpecificity
  );
  if (offerInMechanism) reasonCodes.add("offer_named_in_mechanism");

  const swappable = swappableMatches(prose);
  const distinctive = distinctiveTerms(prose).size;
  const differentiation = scoreOf(
    Math.max(0, 1 - swappable * 0.35) * (distinctive >= 12 ? 1 : distinctive / 12),
    STRATEGY_DIMENSION_WEIGHTS.differentiation
  );
  if (swappable > 0) reasonCodes.add("competitor_swappable_language");

  const evidenceScore = support.reduce((sum, item) => sum + evidenceWeight(item), 0);
  const provableSupport = support.some((item) => evidenceSupportsProof(item));
  const evidenceStrength = scoreOf(
    Math.min(1, evidenceScore / 3) * (provableSupport ? 1 : 0.7),
    STRATEGY_DIMENSION_WEIGHTS.evidenceStrength
  );
  if (provableSupport) reasonCodes.add("evidence_supports_proof");
  if (!support.length) reasonCodes.add("evidence_absent");

  const mechanismConnects = sharesTerm(candidate.promise, candidate.mechanism);
  const proofHonest = provableSupport
    ? !/validation plan instead/i.test(candidate.proofPlan)
    : /validation plan|not yet available|verify|test each/i.test(candidate.proofPlan);
  const objectionNamed = candidate.objectionPlan.trim().length > 0;
  const timingHonest = Boolean(candidate.whyNow?.trim()) || candidate.unknowns.length > 0;
  const narrativeCoherence = scoreOf(
    (mechanismConnects ? 0.3 : 0) +
      (proofHonest ? 0.3 : 0) +
      (objectionNamed ? 0.2 : 0) +
      (timingHonest ? 0.2 : 0),
    STRATEGY_DIMENSION_WEIGHTS.narrativeCoherence
  );
  if (proofHonest) reasonCodes.add("proof_plan_matches_evidence");
  if (!mechanismConnects) reasonCodes.add("mechanism_disconnected_from_promise");

  const ctaNamed = candidate.ctaLogic
    .toLocaleLowerCase()
    .includes(context.ctaLabel.trim().toLocaleLowerCase());
  const ctaResolvesObjective = sharesTerm(context.objective, candidate.ctaLogic);
  const ctaAlignment = scoreOf(
    (ctaNamed ? 0.5 : 0) + (ctaResolvesObjective ? 0.5 : 0),
    STRATEGY_DIMENSION_WEIGHTS.ctaAlignment
  );
  if (ctaResolvesObjective) reasonCodes.add("cta_resolves_objective");

  const dimensions: Record<StrategyEvaluationDimension, number> = {
    audienceRelevance,
    offerSpecificity,
    differentiation,
    evidenceStrength,
    narrativeCoherence,
    ctaAlignment
  };
  const total =
    Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) * 100) / 100;

  return {
    candidateId: candidate.id,
    total,
    dimensions,
    hardFailures,
    reasonCodes: [...reasonCodes].sort()
  };
}

export interface MessageStrategySelection {
  selected?: MessageStrategyCandidate;
  evaluations: StrategyEvaluation[];
  reasonCodes: string[];
}

/**
 * Highest total wins. Ties fall back to the framework ranker's order, then the
 * fixed angle order, then the id, so the same inputs always select the same
 * argument no matter how the candidate list was assembled.
 */
export function selectMessageStrategy(
  candidates: readonly MessageStrategyCandidate[],
  context: StrategyEvaluationContext,
  ranking: MessageFrameworkRanking
): MessageStrategySelection {
  const evaluations = candidates.map((candidate) => evaluateMessageStrategy(candidate, context));
  const byId = new Map(evaluations.map((evaluation) => [evaluation.candidateId, evaluation]));
  const frameworkOrder = rankedFrameworkIds(ranking);

  const eligible = candidates.filter(
    (candidate) => (byId.get(candidate.id)?.hardFailures.length ?? 1) === 0
  );
  const ordered = [...eligible].sort((left, right) => {
    const leftTotal = byId.get(left.id)?.total ?? 0;
    const rightTotal = byId.get(right.id)?.total ?? 0;
    if (rightTotal !== leftTotal) return rightTotal - leftTotal;
    const leftRank = frameworkOrder.indexOf(left.frameworkId);
    const rightRank = frameworkOrder.indexOf(right.frameworkId);
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftAngle = MESSAGE_STRATEGY_ANGLES.indexOf(left.angle);
    const rightAngle = MESSAGE_STRATEGY_ANGLES.indexOf(right.angle);
    if (leftAngle !== rightAngle) return leftAngle - rightAngle;
    return left.id.localeCompare(right.id);
  });

  const selected = ordered[0];
  const reasonCodes = new Set<string>();
  if (selected) {
    reasonCodes.add(`selected_${selected.angle}`);
    reasonCodes.add(`selected_framework_${selected.frameworkId}`);
    if (ordered.length > 1) reasonCodes.add("selected_by_score");
    for (const code of byId.get(selected.id)?.reasonCodes ?? []) reasonCodes.add(code);
  } else {
    reasonCodes.add("no_eligible_strategy");
  }
  for (const candidate of candidates) {
    if (candidate.id === selected?.id) continue;
    for (const failure of byId.get(candidate.id)?.hardFailures ?? []) {
      reasonCodes.add(`rejected_${failure}`);
    }
  }

  return {
    ...(selected ? { selected } : {}),
    evaluations,
    reasonCodes: [...reasonCodes].sort()
  };
}

/* -------------------------------------------------------------------------- */
/* Page plan                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Preferred jobs per section role, in order. A role takes the first job no
 * earlier section has claimed, so no two sections argue the same point.
 */
const ROLE_STRATEGY_JOBS: Record<SectionRoleV2, readonly StrategyJob[]> = {
  "buyer-outcome": ["big-idea", "promise", "audience-job"],
  "current-friction": ["tension", "audience-job", "objection"],
  mechanism: ["mechanism", "promise"],
  "use-cases": ["audience-job", "mechanism", "objection"],
  proof: ["proof", "objection"],
  "next-move": ["cta", "promise"],
  "market-change": ["why-now", "big-idea", "promise"],
  stakes: ["tension", "objection"],
  "evaluation-criteria": ["objection", "audience-job"],
  "solution-mapping": ["mechanism", "promise"],
  applications: ["audience-job", "mechanism"],
  "evaluation-close": ["cta", "proof"],
  "shared-priority": ["audience-job", "why-now", "big-idea"],
  "account-relevance": ["tension", "why-now", "audience-job"],
  "shared-opportunity": ["big-idea", "promise", "mechanism"],
  "priority-paths": ["audience-job", "objection", "why-now"],
  "validation-plan": ["proof", "mechanism"],
  "first-decision": ["cta", "objection"],
  "proof-depth": ["proof", "objection"],
  resource: ["proof", "objection"]
};

/**
 * Binds every section role to a distinct job in the selected strategy. A
 * section with nothing left to argue gets an explicit support job rather than
 * a second copy of an argument another section already owns.
 */
export function compileMessagingPagePlan(input: {
  family: WireframeFamilyV2;
  sectionPlan: readonly SectionSlotV2[];
  strategy: MessageStrategyCandidate;
}): MessagingPagePlanSection[] {
  const claimed = new Set<string>();
  const available = new Set<StrategyJob>(STRATEGY_JOBS);
  if (!input.strategy.tension?.trim()) available.delete("tension");
  if (!input.strategy.whyNow?.trim()) available.delete("why-now");

  return input.sectionPlan.map((slot) => {
    const preferred = ROLE_STRATEGY_JOBS[slot.role] ?? [];
    const job = preferred.find((candidate) => available.has(candidate) && !claimed.has(candidate));
    const resolved = job ?? `${slot.id}-support`;
    claimed.add(resolved);
    return { id: slot.id, role: slot.role, strategyJobs: [resolved] };
  });
}

/* -------------------------------------------------------------------------- */
/* Production argument mapping                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What each production slot asserts, expressed as the section use an evidence
 * item must permit before it may back that slot. A tension and a why-now both
 * claim something about the present moment, which is the use an inference or a
 * visitor answer is explicitly not allowed to carry.
 */
const SLOT_EVIDENCE_USE = {
  tension: "urgency",
  proofPlan: "credibility",
  decisionHelp: "choice",
  whyNow: "urgency"
} as const satisfies Record<string, MessageSpineSectionUse>;

type AngleAuthoredSlot = keyof typeof SLOT_EVIDENCE_USE;

/**
 * The evidence that may back one slot: referenced by the selected strategy,
 * permitted for what the slot asserts, and actually about the directive's own
 * subject. All three are required. A ref that the strategy cited for its
 * mechanism does not become proof of a tension by sitting in the same argument,
 * and the previous mapping, which handed every slot the baseline promise and
 * mechanism refs, produced exactly that kind of borrowed citation.
 */
function slotEvidenceRefs(input: {
  directive: string;
  slot: AngleAuthoredSlot;
  strategy: MessageStrategyCandidate;
  ledger: readonly CompilerEvidenceItem[];
}): string[] {
  const referenced = new Set(input.strategy.evidenceRefs);
  const use = SLOT_EVIDENCE_USE[input.slot];
  return input.ledger
    .filter((item) => referenced.has(item.id))
    .filter((item) => item.allowedUses.includes(use))
    .filter((item) =>
      input.slot === "proofPlan" ? evidenceSupportsProof(item) : true
    )
    .filter((item) =>
      input.slot === "tension" || input.slot === "whyNow"
        ? evidenceSupportsDeclarativeClaim(item)
        : true
    )
    .filter((item) => citationSupportsDirective(input.directive, item.claim))
    .map(({ id }) => id)
    .sort();
}

/**
 * Maps the selected strategy into the existing production argument slots.
 *
 * The split is between slots the route still owns and slots the angle wrote.
 * Audience, promise, mechanism, and next action keep their own reconciled refs:
 * the strategy restates the same subject the reconciler already supported for
 * that exact slot. Tension, why-now, proof, and objection are the angle's own
 * work, so they must earn citations from the evidence the strategy actually
 * referenced. A rewritten optional slot that earns none is dropped rather than
 * shipped on borrowed support, which lets the section that would have argued it
 * omit or fall back to the deterministic writer.
 */
export function productionArgumentFromStrategy(input: {
  base: RequiredProductionArgument;
  strategy: MessageStrategyCandidate;
  ledger: readonly CompilerEvidenceItem[];
}): RequiredProductionArgument {
  const { base, strategy, ledger } = input;

  const bind = (
    slot: AngleAuthoredSlot,
    directive: string,
    baseSlot:
      | { directive: string; evidenceRefs: readonly string[]; unknowns: readonly string[] }
      | undefined
  ) => {
    // Unchanged wording is still the claim the reconciler supported, so the
    // slot's own refs continue to describe it.
    if (baseSlot && baseSlot.directive === directive) {
      return {
        directive,
        evidenceRefs: [...baseSlot.evidenceRefs],
        unknowns: [...baseSlot.unknowns]
      };
    }
    const evidenceRefs = slotEvidenceRefs({ directive, slot, strategy, ledger });
    return {
      directive,
      evidenceRefs,
      // An unsupported slot says so, so a writer treats it as a question to
      // raise rather than a fact it may assert.
      unknowns: evidenceRefs.length
        ? []
        : [`No referenced evidence supports the ${slot} the selected strategy argues.`]
    };
  };

  const tension = strategy.tension ? bind("tension", strategy.tension, base.tension) : undefined;
  const whyNow = strategy.whyNow ? bind("whyNow", strategy.whyNow, base.whyNow) : undefined;
  // Said out loud on the slot so a writer treats proof as a question to raise
  // rather than a fact it may assert, even where the reconciler resolved refs.
  const strategyProofUnknowns = strategy.unknowns.filter((unknown) =>
    unknown.includes("declarative proof claim")
  );

  return {
    audience: {
      directive: strategy.audienceJob,
      evidenceRefs: [...base.audience.evidenceRefs],
      unknowns: [...base.audience.unknowns]
    },
    // Optional slots vanish when the strategy rewrote them and nothing it cited
    // holds them up. A section that needed one omits instead of asserting it.
    ...(tension?.evidenceRefs.length ? { tension } : {}),
    promise: {
      directive: strategy.promise,
      evidenceRefs: [...base.promise.evidenceRefs],
      unknowns: [...base.promise.unknowns]
    },
    mechanism: {
      directive: strategy.mechanism,
      evidenceRefs: [...base.mechanism.evidenceRefs],
      unknowns: [...base.mechanism.unknowns]
    },
    // Proof and objection keep the refs the reconciler resolved for those exact
    // slots. They were never cross-wired, and those refs live in the live-brief
    // ref space, not the ledger's: re-deriving them from ledger ids would judge
    // one system's citations by another system's rules and put ids into the
    // spine that the section evidence set cannot resolve. The strategy's own
    // proof availability is already carried as an unknown on the candidate.
    proofPlan: {
      directive: strategy.proofPlan,
      evidenceRefs: [...base.proofPlan.evidenceRefs],
      unknowns: strategyProofUnknowns.length
        ? [...new Set([...base.proofPlan.unknowns, ...strategyProofUnknowns])]
        : [...base.proofPlan.unknowns]
    },
    decisionHelp: {
      directive: strategy.objectionPlan,
      evidenceRefs: [...base.decisionHelp.evidenceRefs],
      unknowns: [...base.decisionHelp.unknowns]
    },
    nextAction: {
      directive: strategy.ctaLogic,
      evidenceRefs: [...base.nextAction.evidenceRefs],
      unknowns: []
    },
    ...(whyNow?.evidenceRefs.length ? { whyNow } : {})
  };
}

/* -------------------------------------------------------------------------- */
/* Artifact assembly                                                           */
/* -------------------------------------------------------------------------- */

export interface CompileMessagingArtifactInput extends MessageStrategyCompilerInput {
  briefRevision: number;
  sectionPlan: readonly SectionSlotV2[];
}

export interface MessagingCompilerResult {
  artifact?: MessagingCompilerArtifact;
  candidates: MessageStrategyCandidate[];
  selection: MessageStrategySelection;
}

/**
 * Fail-soft by construction: when no candidate survives its hard failures the
 * result carries the evaluations but no artifact, and the caller keeps the
 * existing deterministic argument rather than shipping a rejected strategy.
 */
export function compileMessagingArtifact(
  input: CompileMessagingArtifactInput
): MessagingCompilerResult {
  const candidates = compileMessageStrategyCandidates(input);
  const context: StrategyEvaluationContext = {
    ledger: input.ledger,
    offer: input.offer,
    audienceLabel: input.audienceLabel,
    objective: input.objective,
    ctaLabel: input.ctaLabel,
    sellerName: input.sellerName
  };
  const selection = selectMessageStrategy(candidates, context, input.ranking);
  if (!selection.selected) return { candidates, selection };

  const artifact: MessagingCompilerArtifact = {
    schemaVersion: MESSAGING_COMPILER_SCHEMA_VERSION,
    compilerVersion: MESSAGING_COMPILER_VERSION,
    briefRevision: input.briefRevision,
    evidenceLedger: [...input.ledger],
    strategies: candidates,
    evaluations: selection.evaluations,
    selectedStrategyId: selection.selected.id,
    pagePlan: {
      family: input.family,
      sectionPlan: compileMessagingPagePlan({
        family: input.family,
        sectionPlan: input.sectionPlan,
        strategy: selection.selected
      })
    },
    visibility: "internal"
  };

  return { artifact, candidates, selection };
}
