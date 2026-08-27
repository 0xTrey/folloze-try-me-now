/**
 * A quality benchmark for the messaging compiler.
 *
 * Contract tests already prove an artifact is well formed. They cannot tell you
 * whether the argument inside it is worth putting in front of a buyer. This
 * module scores the compiled output the way the acceptance contract does: four
 * 25-point dimensions, a set of hard blockers that force a revert regardless of
 * score, and the evaluator's own six-component weighted candidate score carried
 * alongside rather than folded in. The two measure different things and
 * merging them would hide which one moved.
 *
 * Everything here is pure. The scorer does no I/O and reads no environment, so
 * a score is reproducible from the fixture alone; only `runMessagingCompilerBenchmark`
 * observes the clock, and only to report timing.
 */

import { BUYER_FACING_JARGON_PATTERN, rankMessageFrameworks } from "@/lib/generation/message-spine";
import {
  COMPETITOR_SWAPPABLE_PATTERN,
  GENERIC_AUDIENCE_PATTERN,
  compileMessagingArtifact,
  type MessagingCompilerResult
} from "@/lib/generation/message-strategy-compiler";
import {
  MESSAGE_STRATEGY_VERSION,
  MESSAGING_COMPILER_VERSION,
  compilerEvidencePermissions,
  messagingCompilerDigestSource,
  validateMessagingCompilerArtifact,
  type CompilerEvidenceItem,
  type CompilerEvidenceKind,
  type MessageStrategyAngle,
  type MessageStrategyCandidate,
  type MessagingCompilerArtifact,
  type StrategyEvaluation
} from "@/lib/generation/messaging-compiler-contracts";
import { defaultSectionPlanV2, type SectionSlotV2 } from "@/lib/generation/three-family-contract";

import type {
  MessagingCompilerFixture,
  MessagingCompilerFixtureEvidence,
  MessagingCompilerFixtureId
} from "../../../tests/fixtures/messaging-compiler/fixtures";

export const MESSAGING_COMPILER_BENCHMARK_VERSION = "messaging-compiler-benchmark-v1.0.0";

/**
 * Every blocker in `acceptance-and-autoresearch.md`. Any of these forces a
 * revert whatever the score says, so the codes stay verbatim and stable.
 */
export const MESSAGING_COMPILER_BLOCKERS = [
  "wrong_company_identity",
  "invented_claim",
  "unresolved_evidence_reference",
  "generic_recommendation_as_truth",
  "unsafe_image_allocation",
  "private_data_in_telemetry",
  "private_artifact_exposed",
  "leaked_internal_label",
  "stale_revision_overwrite",
  "deadline_exceeded",
  "required_gate_failure"
] as const;
export type MessagingCompilerBlocker = (typeof MESSAGING_COMPILER_BLOCKERS)[number];

/** Deterministic fixture compiles do no network work, so this is generous. */
export const MESSAGING_COMPILER_TIMING_BUDGET_MS = 250;

const TIMING_REPEATS = 8;

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

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

function distinctTerms(value: string): Set<string> {
  return new Set(terms(value));
}

function sharesTerm(left: string, right: string): boolean {
  const rightTerms = distinctTerms(right);
  return terms(left).some((token) => rightTerms.has(token));
}

function jaccard(left: string, right: string): number {
  const leftTerms = distinctTerms(left);
  const rightTerms = distinctTerms(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
  let shared = 0;
  for (const token of leftTerms) {
    if (rightTerms.has(token)) shared += 1;
  }
  return shared / (leftTerms.size + rightTerms.size - shared);
}

function swappableMatches(value: string): number {
  return value.match(COMPETITOR_SWAPPABLE_PATTERN)?.length ?? 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * FNV-1a with a second avalanche accumulator, written inline so the benchmark
 * stays dependency-free and identical in Node and the edge runtime. The input
 * is always a text-free projection, so the digest can be published.
 */
function digestOf(value: unknown): string {
  const json = JSON.stringify(value) ?? "";
  let low = 0x811c_9dc5;
  let high = 0x0100_0193;
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    low = Math.imul(low ^ code, 0x0100_0193) >>> 0;
    high = Math.imul(high ^ (code + index), 0x85eb_ca6b) >>> 0;
  }
  return `${low.toString(16).padStart(8, "0")}${high.toString(16).padStart(8, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Fixture compilation                                                        */
/* -------------------------------------------------------------------------- */

function ledgerItem(
  item: MessagingCompilerFixtureEvidence,
  kind: CompilerEvidenceKind
): CompilerEvidenceItem {
  return {
    id: item.id,
    kind,
    claim: item.claim,
    sourceAuthority: item.sourceAuthority,
    sourceRef: item.sourceRef,
    confidence: item.confidence,
    ...compilerEvidencePermissions(kind, item.confidence)
  };
}

/**
 * The ledger is sorted by id exactly as `compileEvidenceLedger` sorts it, so a
 * fixture compile and a production compile pick the same first supporting fact.
 */
export function messagingCompilerLedger(
  fixture: MessagingCompilerFixture
): CompilerEvidenceItem[] {
  return [
    ...fixture.facts.map((item) => ledgerItem(item, "fact")),
    ...fixture.permittedInferences.map((item) => ledgerItem(item, "inference")),
    ...fixture.visitorContext.map((item) => ledgerItem(item, "visitor-context"))
  ].sort((left, right) => left.id.localeCompare(right.id));
}

export interface CompiledMessagingCompilerFixture {
  ledger: CompilerEvidenceItem[];
  sectionPlan: SectionSlotV2[];
  result: MessagingCompilerResult;
}

export function compileMessagingCompilerFixture(
  fixture: MessagingCompilerFixture
): CompiledMessagingCompilerFixture {
  const ledger = messagingCompilerLedger(fixture);
  const sectionPlan = defaultSectionPlanV2(fixture.family, fixture.sectionPlanOptions ?? {});
  const ranking = rankMessageFrameworks({
    motion: fixture.frameworkSignals.motion,
    audience: fixture.audienceLabel,
    objective: fixture.objective,
    cta: fixture.ctaLabel,
    offerMaturity: fixture.frameworkSignals.offerMaturity,
    proofDensity: fixture.frameworkSignals.proofDensity,
    contentVolume: fixture.frameworkSignals.contentVolume,
    decisionComplexity: fixture.frameworkSignals.decisionComplexity
  });
  const result = compileMessagingArtifact({
    ranking,
    family: fixture.family,
    baseline: fixture.baseline,
    ledger,
    sellerName: fixture.sellerName,
    ...(fixture.targetName ? { targetName: fixture.targetName } : {}),
    offer: fixture.offer,
    audienceLabel: fixture.audienceLabel,
    audienceJob: fixture.audienceJob,
    objective: fixture.objective,
    ctaLabel: fixture.ctaLabel,
    briefRevision: fixture.briefRevision,
    sectionPlan
  });
  return { ledger, sectionPlan, result };
}

function strategySlots(strategy: MessageStrategyCandidate): string[] {
  return [
    strategy.bigIdea,
    strategy.promise,
    strategy.mechanism,
    strategy.proofPlan,
    strategy.objectionPlan,
    strategy.ctaLogic,
    ...(strategy.tension ? [strategy.tension] : []),
    ...(strategy.whyNow ? [strategy.whyNow] : [])
  ];
}

/** Every word the selected strategy would hand a section writer. */
export function messagingCompilerStrategyProse(strategy: MessageStrategyCandidate): string {
  return [strategy.audienceJob, ...strategySlots(strategy)].join(" ");
}

/* -------------------------------------------------------------------------- */
/* Dimension scoring                                                          */
/* -------------------------------------------------------------------------- */

interface Check {
  code: string;
  points: number;
  passed: boolean;
}

function awarded(checks: readonly Check[]): number {
  return round2(checks.reduce((sum, check) => sum + (check.passed ? check.points : 0), 0));
}

const PLACEHOLDER_PATTERN = /\b(?:tbd|todo|lorem ipsum|placeholder|coming soon)\b|\[insert|\{\{/i;
const MARKUP_PATTERN = /[<>{}]|style\s*=|class\s*=|https?:\/\//i;
const NUMBER_PATTERN = /\d[\d,.]*/g;
const DEADLINE_PATTERN =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|next quarter|this quarter|next week)\b/gi;
const PRIVATE_DATA_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/|\bsk-[a-z0-9]{8,}|\?[\w-]+=/i;
const INTERNAL_LABEL_PATTERN =
  /\b(?:strategy-(?:tension|upside|mechanism|proof)|outcome-mechanism|problem-change|technical-validation|proof-led-decision|event-value|source-insight|evidenceRefs|objectionPlan|ctaLogic|bigIdea)\b/i;

export interface MessagingCompilerDimensionScores {
  buyerSpecificityAndEvidence: number;
  narrativeCoherence: number;
  brandAndCompositionFidelity: number;
  reliabilityAndHonesty: number;
}

interface ScoringContext {
  fixture: MessagingCompilerFixture;
  compiled: CompiledMessagingCompilerFixture;
  ledgerText: string;
  ledgerIds: Set<string>;
  selected?: MessageStrategyCandidate;
  artifact?: MessagingCompilerArtifact;
  prose: string;
  slots: string[];
}

function buyerSpecificityChecks(context: ScoringContext): Check[] {
  const { fixture, selected, ledgerIds } = context;
  const audienceJob = selected?.audienceJob.toLocaleLowerCase() ?? "";
  const headline = selected ? `${selected.bigIdea} ${selected.promise}` : "";
  const prohibited = fixture.prohibitedClaims.some((claim) =>
    context.prose.toLocaleLowerCase().includes(claim.toLocaleLowerCase())
  );
  const inventedNumber = (context.prose.match(NUMBER_PATTERN) ?? []).some(
    (value) => !context.ledgerText.includes(value)
  );
  return [
    {
      code: "audience_job_covered",
      points: 4,
      passed:
        Boolean(selected) &&
        fixture.expectedAudienceJobs.every((term) => audienceJob.includes(term.toLocaleLowerCase()))
    },
    {
      code: "audience_role_named",
      points: 2,
      passed: Boolean(selected) && sharesTerm(fixture.audienceLabel, headline)
    },
    {
      code: "offer_named_in_promise_and_mechanism",
      points: 5,
      passed:
        Boolean(selected) &&
        sharesTerm(fixture.offer, selected!.promise) &&
        sharesTerm(fixture.offer, selected!.mechanism)
    },
    {
      code: "claims_resolve_to_allowed_evidence",
      points: 3,
      passed:
        Boolean(selected) &&
        selected!.evidenceRefs.length > 0 &&
        selected!.evidenceRefs.every((ref) => ledgerIds.has(ref))
    },
    {
      // A stated status quo is a factual claim. When the only thing behind it
      // is the route's own framing, the page is asserting a shape rather than
      // an observation. Omitting it is the honest move, so omission passes.
      code: "stated_tension_is_evidence_bound",
      points: 2,
      passed:
        Boolean(selected) &&
        (!selected!.tension?.trim() ||
          context.compiled.ledger.some(
            (item) =>
              item.kind === "fact" &&
              !item.prohibitedUses.includes("declarative-claim") &&
              sharesTerm(selected!.tension!, item.claim)
          ))
    },
    {
      code: "not_competitor_swappable",
      points: 5,
      passed: Boolean(selected) && swappableMatches(context.prose) === 0
    },
    {
      code: "unsupported_facts_omitted",
      points: 4,
      passed: Boolean(selected) && !prohibited && !inventedNumber
    }
  ];
}

function narrativeCoherenceChecks(context: ScoringContext): Check[] {
  const { fixture, selected, artifact } = context;
  const sections = artifact?.pagePlan.sectionPlan ?? [];
  const jobs = sections.flatMap((section) => section.strategyJobs);
  const ctaLogic = selected?.ctaLogic.toLocaleLowerCase() ?? "";
  let maxOverlap = 0;
  for (let left = 0; left < context.slots.length; left += 1) {
    for (let right = left + 1; right < context.slots.length; right += 1) {
      maxOverlap = Math.max(maxOverlap, jaccard(context.slots[left]!, context.slots[right]!));
    }
  }
  return [
    {
      code: "single_governing_strategy",
      points: 4,
      passed:
        Boolean(artifact) &&
        artifact!.selectedStrategyId === selected?.id &&
        artifact!.pagePlan.family === fixture.family
    },
    {
      code: "spine_connected",
      points: 5,
      passed:
        Boolean(selected) &&
        sharesTerm(selected!.promise, selected!.mechanism) &&
        selected!.objectionPlan.trim().length > 0 &&
        (Boolean(selected!.whyNow?.trim()) || selected!.unknowns.length > 0)
    },
    {
      code: "sections_perform_distinct_jobs",
      points: 5,
      passed:
        sections.length > 0 &&
        sections.every((section) => section.strategyJobs.length > 0) &&
        new Set(jobs).size === jobs.length
    },
    {
      code: "claims_not_duplicated",
      points: 5,
      passed: Boolean(selected) && maxOverlap < 0.7
    },
    {
      code: "cta_resolves_framed_decision",
      points: 4,
      passed:
        Boolean(selected) &&
        ctaLogic.includes(fixture.ctaLabel.toLocaleLowerCase()) &&
        fixture.expectedCtaLogic.every((term) => ctaLogic.includes(term.toLocaleLowerCase()))
    },
    {
      code: "selected_angle_supported",
      points: 2,
      passed: Boolean(selected) && fixture.acceptableAngles.includes(selected!.angle)
    }
  ];
}

function brandFidelityChecks(context: ScoringContext, deterministic: boolean): Check[] {
  const { fixture } = context;
  const { brand } = fixture;
  const verified = new Set(brand.evidenceRefs);
  const roleNames = brand.colorRoles.map(({ role }) => role);
  const semanticRoles = brand.imageAllocations.map(({ semanticRole }) => semanticRole);
  const assetRefs = brand.imageAllocations.map(({ assetRef }) => assetRef);
  return [
    {
      code: "verified_identity_preserved",
      points: 4,
      passed: fixture.sellerName === brand.verifiedIdentity && verified.has(brand.logoEvidenceRef)
    },
    {
      code: "brand_roles_resolve_to_evidence",
      points: 4,
      passed:
        brand.colorRoles.every(({ evidenceRef }) => verified.has(evidenceRef)) &&
        brand.typographyEvidenceRefs.every((ref) => verified.has(ref))
    },
    {
      code: "brand_roles_complete",
      points: 2,
      passed:
        (["ink", "surface", "action"] as const).every((role) => roleNames.includes(role)) &&
        brand.typographyEvidenceRefs.length >= 2
    },
    {
      code: "imagery_allocated_once_per_role",
      points: 5,
      passed:
        brand.imageAllocations.length > 0 &&
        new Set(semanticRoles).size === semanticRoles.length &&
        new Set(assetRefs).size === assetRefs.length &&
        assetRefs.every((ref) => ref.startsWith("asset:"))
    },
    { code: "wireframe_selection_deterministic", points: 5, passed: deterministic },
    {
      code: "renderer_receives_semantic_content",
      points: 5,
      passed:
        context.slots.length > 0 && !context.slots.some((slot) => MARKUP_PATTERN.test(slot))
    }
  ];
}

function reliabilityChecks(context: ScoringContext): Check[] {
  const { fixture, artifact, selected } = context;
  const inventedNumber = (context.prose.match(NUMBER_PATTERN) ?? []).some(
    (value) => !context.ledgerText.includes(value)
  );
  const inventedDeadline = (context.prose.match(DEADLINE_PATTERN) ?? []).some(
    (value) => !context.ledgerText.includes(value.toLocaleLowerCase())
  );
  const digestJson = artifact ? JSON.stringify(messagingCompilerDigestSource(artifact)) : "";
  const claimLeak = context.compiled.ledger.some((item) =>
    digestJson.includes(item.claim.slice(0, 24))
  );
  const refsPrivate = context.compiled.ledger.some(
    (item) => PRIVATE_DATA_PATTERN.test(item.sourceRef) || PRIVATE_DATA_PATTERN.test(item.id)
  );
  return [
    {
      code: "no_placeholders",
      points: 4,
      passed: Boolean(selected) && !PLACEHOLDER_PATTERN.test(context.prose)
    },
    {
      code: "no_invented_metrics_or_deadlines",
      points: 5,
      passed: Boolean(selected) && !inventedNumber && !inventedDeadline
    },
    {
      code: "no_leaked_internal_labels",
      points: 4,
      passed:
        Boolean(selected) &&
        !BUYER_FACING_JARGON_PATTERN.test(context.prose) &&
        !INTERNAL_LABEL_PATTERN.test(context.prose) &&
        !context.prose.includes(MESSAGING_COMPILER_VERSION) &&
        !context.prose.includes(MESSAGE_STRATEGY_VERSION)
    },
    {
      code: "no_dangling_evidence_references",
      points: 4,
      passed: Boolean(artifact) && validateMessagingCompilerArtifact(artifact!).length === 0
    },
    {
      code: "private_compiler_data_contained",
      points: 4,
      passed: artifact?.visibility === "internal" && !claimLeak && !refsPrivate
    },
    {
      code: "revision_fencing_intact",
      points: 4,
      passed: artifact?.briefRevision === fixture.briefRevision && fixture.briefRevision >= 0
    }
  ];
}

/* -------------------------------------------------------------------------- */
/* Blockers                                                                   */
/* -------------------------------------------------------------------------- */

function blockersFor(context: ScoringContext, checks: Record<string, Check>): string[] {
  const { fixture, artifact, selected, compiled } = context;
  const blockers = new Set<MessagingCompilerBlocker>();
  const evaluations = compiled.result.selection.evaluations;
  const audienceJob = selected?.audienceJob.toLocaleLowerCase() ?? "";

  if (!artifact || !selected) blockers.add("required_gate_failure");
  if (artifact && validateMessagingCompilerArtifact(artifact).length > 0) {
    blockers.add("required_gate_failure");
  }

  if (
    evaluations.some((evaluation) => evaluation.hardFailures.includes("generic_audience_language")) ||
    GENERIC_AUDIENCE_PATTERN.test(fixture.audienceLabel.trim()) ||
    (selected &&
      !fixture.expectedAudienceJobs.some((term) => audienceJob.includes(term.toLocaleLowerCase())))
  ) {
    blockers.add("generic_recommendation_as_truth");
  }

  if (selected && !checks.unsupported_facts_omitted?.passed) blockers.add("invented_claim");
  if (selected && !checks.no_invented_metrics_or_deadlines?.passed) blockers.add("invented_claim");

  const verified = new Set(fixture.brand.evidenceRefs);
  const brandRefsResolve =
    verified.has(fixture.brand.logoEvidenceRef) &&
    fixture.brand.colorRoles.every(({ evidenceRef }) => verified.has(evidenceRef)) &&
    fixture.brand.typographyEvidenceRefs.every((ref) => verified.has(ref));
  const strategyRefsResolve =
    !selected || selected.evidenceRefs.every((ref) => context.ledgerIds.has(ref));
  if (!brandRefsResolve || !strategyRefsResolve) blockers.add("unresolved_evidence_reference");

  if (fixture.sellerName !== fixture.brand.verifiedIdentity) blockers.add("wrong_company_identity");
  if (!checks.imagery_allocated_once_per_role?.passed) blockers.add("unsafe_image_allocation");
  if (selected && !checks.no_leaked_internal_labels?.passed) blockers.add("leaked_internal_label");
  if (!checks.private_compiler_data_contained?.passed && artifact) {
    blockers.add("private_artifact_exposed");
  }
  if (
    compiled.ledger.some(
      (item) => PRIVATE_DATA_PATTERN.test(item.sourceRef) || PRIVATE_DATA_PATTERN.test(item.id)
    )
  ) {
    blockers.add("private_data_in_telemetry");
  }
  if (artifact && !checks.revision_fencing_intact?.passed) blockers.add("stale_revision_overwrite");

  return [...blockers].sort();
}

/* -------------------------------------------------------------------------- */
/* Fixture score                                                              */
/* -------------------------------------------------------------------------- */

export interface MessagingCompilerFixtureScore {
  fixtureId: MessagingCompilerFixtureId;
  dimensions: MessagingCompilerDimensionScores;
  /** The 0-100 release score from the four acceptance dimensions. */
  total: number;
  blockers: string[];
  /** Every check that did not earn its points, for a readable receipt. */
  missedChecks: string[];
  selectedStrategyId?: string;
  selectedAngle?: MessageStrategyAngle;
  /** Source-free digest of the compiled artifact. Safe to publish. */
  candidateDigest: string;
  /**
   * The evaluator's separate six-component weighted candidate score. Reported
   * beside the release score, never merged into it.
   */
  strategyScore?: StrategyEvaluation;
  strategyEvaluations: StrategyEvaluation[];
}

export function scoreMessagingCompilerFixture(
  fixture: MessagingCompilerFixture
): MessagingCompilerFixtureScore {
  const compiled = compileMessagingCompilerFixture(fixture);
  const repeat = compileMessagingCompilerFixture(fixture);
  const selected = compiled.result.selection.selected;
  const artifact = compiled.result.artifact;
  const slots = selected ? strategySlots(selected) : [];
  const context: ScoringContext = {
    fixture,
    compiled,
    ledgerText: compiled.ledger.map((item) => item.claim).join(" ").toLocaleLowerCase(),
    ledgerIds: new Set(compiled.ledger.map(({ id }) => id)),
    ...(selected ? { selected } : {}),
    ...(artifact ? { artifact } : {}),
    prose: selected ? messagingCompilerStrategyProse(selected) : "",
    slots
  };
  const candidateDigest = artifact ? digestOf(messagingCompilerDigestSource(artifact)) : "unbuilt";
  const deterministic =
    Boolean(repeat.result.artifact) === Boolean(artifact) &&
    (!artifact ||
      digestOf(messagingCompilerDigestSource(repeat.result.artifact!)) === candidateDigest);

  const buyer = buyerSpecificityChecks(context);
  const narrative = narrativeCoherenceChecks(context);
  const brand = brandFidelityChecks(context, deterministic);
  const reliability = reliabilityChecks(context);
  const allChecks = [...buyer, ...narrative, ...brand, ...reliability];
  const byCode = Object.fromEntries(allChecks.map((check) => [check.code, check]));

  const dimensions: MessagingCompilerDimensionScores = {
    buyerSpecificityAndEvidence: awarded(buyer),
    narrativeCoherence: awarded(narrative),
    brandAndCompositionFidelity: awarded(brand),
    reliabilityAndHonesty: awarded(reliability)
  };

  return {
    fixtureId: fixture.id,
    dimensions,
    total: round2(Object.values(dimensions).reduce((sum, value) => sum + value, 0)),
    blockers: blockersFor(context, byCode),
    missedChecks: allChecks.filter((check) => !check.passed).map(({ code }) => code).sort(),
    ...(selected ? { selectedStrategyId: selected.id, selectedAngle: selected.angle } : {}),
    candidateDigest,
    ...(selected
      ? {
          strategyScore: compiled.result.selection.evaluations.find(
            ({ candidateId }) => candidateId === selected.id
          )
        }
      : {}),
    strategyEvaluations: compiled.result.selection.evaluations
  };
}

/* -------------------------------------------------------------------------- */
/* Bounded mutations                                                          */
/* -------------------------------------------------------------------------- */

export const MESSAGING_COMPILER_MUTATION_NAMES = [
  "current",
  "audience-specificity",
  "offer-mechanism",
  "strategy-selection",
  "claim-deduplication",
  "evidence-tightening",
  "cta-alignment",
  "brand-role-reconciliation",
  "image-allocation",
  "timing"
] as const;
export type MessagingCompilerMutationName = (typeof MESSAGING_COMPILER_MUTATION_NAMES)[number];

export type MessagingCompilerMutation = (
  fixture: MessagingCompilerFixture
) => MessagingCompilerFixture;

/**
 * Each mutation changes exactly one variable so a score delta is attributable.
 * They are deliberately degrading: with the compiler held fixed, the useful
 * question is which quality property the scorer can still see when it is
 * removed, not whether a random perturbation happens to help.
 */
export const MUTATIONS: Record<MessagingCompilerMutationName, MessagingCompilerMutation> = {
  current: (fixture) => fixture,
  "audience-specificity": (fixture) => ({
    ...fixture,
    audienceLabel: "decision makers",
    audienceJob: "Evaluate fit"
  }),
  "offer-mechanism": (fixture) => ({
    ...fixture,
    baseline: {
      ...fixture.baseline,
      mechanism: "A holistic, industry-leading approach that helps teams move forward together."
    }
  }),
  "strategy-selection": (fixture) => ({
    ...fixture,
    frameworkSignals: {
      ...fixture.frameworkSignals,
      offerMaturity: "unconfirmed",
      proofDensity: "sparse",
      decisionComplexity: "low"
    }
  }),
  "claim-deduplication": (fixture) => ({
    ...fixture,
    baseline: {
      ...fixture.baseline,
      mechanism: fixture.baseline.promise,
      decisionHelp: fixture.baseline.promise
    }
  }),
  "evidence-tightening": (fixture) => ({
    ...fixture,
    facts: [],
    permittedInferences: [
      ...fixture.permittedInferences,
      ...fixture.facts.map((item) => ({ ...item, confidence: "low" as const }))
    ]
  }),
  "cta-alignment": (fixture) => ({
    ...fixture,
    baseline: {
      ...fixture.baseline,
      nextAction: `Continue with the ${fixture.ctaLabel} when the team is ready.`
    }
  }),
  "brand-role-reconciliation": (fixture) => ({
    ...fixture,
    brand: {
      ...fixture.brand,
      colorRoles: fixture.brand.colorRoles.map((role, index) =>
        index === 0 ? { ...role, evidenceRef: `${role.evidenceRef}-unverified` } : role
      )
    }
  }),
  "image-allocation": (fixture) => ({
    ...fixture,
    brand: {
      ...fixture.brand,
      imageAllocations: [
        ...fixture.brand.imageAllocations,
        {
          semanticRole: "secondary",
          assetRef: fixture.brand.imageAllocations[0]?.assetRef ?? "asset:missing/hero"
        }
      ]
    }
  }),
  timing: (fixture) => ({
    ...fixture,
    sectionPlanOptions: { includeProofDepth: true, includeResource: true }
  })
};

/* -------------------------------------------------------------------------- */
/* Benchmark run                                                              */
/* -------------------------------------------------------------------------- */

/** Percentile over the observed samples, matching the build-trace emitter. */
function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return round2(sorted[Math.max(0, index)] ?? 0);
}

export interface MessagingCompilerTiming {
  unit: "ms";
  samples: number;
  p50: number;
  p95: number;
  max: number;
}

export interface MessagingCompilerBenchmarkRun {
  version: string;
  mutation: MessagingCompilerMutationName;
  fixtureIds: MessagingCompilerFixtureId[];
  fixtures: MessagingCompilerFixtureScore[];
  dimensions: MessagingCompilerDimensionScores;
  /** Mean release score across fixtures, 0 through 100. */
  total: number;
  /** Mean of the evaluator's separate six-component candidate score. */
  strategyScore: number;
  blockers: string[];
  timing: MessagingCompilerTiming;
  candidateDigest: string;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function runMessagingCompilerBenchmark(
  fixtures: readonly MessagingCompilerFixture[],
  mutation: MessagingCompilerMutationName = "current"
): MessagingCompilerBenchmarkRun {
  const mutate = MUTATIONS[mutation];
  const mutated = fixtures.map(mutate);
  const scores = mutated.map(scoreMessagingCompilerFixture);

  const samples: number[] = [];
  for (const fixture of mutated) {
    for (let run = 0; run < TIMING_REPEATS; run += 1) {
      const startedAt = performance.now();
      compileMessagingCompilerFixture(fixture);
      samples.push(performance.now() - startedAt);
    }
  }
  const timing: MessagingCompilerTiming = {
    unit: "ms",
    samples: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: round2(Math.max(...samples, 0))
  };

  const blockers = new Set(scores.flatMap(({ blockers: codes }) => codes));
  if (timing.p95 > MESSAGING_COMPILER_TIMING_BUDGET_MS) blockers.add("deadline_exceeded");

  return {
    version: MESSAGING_COMPILER_BENCHMARK_VERSION,
    mutation,
    fixtureIds: mutated.map(({ id }) => id),
    fixtures: scores,
    dimensions: {
      buyerSpecificityAndEvidence: mean(
        scores.map(({ dimensions }) => dimensions.buyerSpecificityAndEvidence)
      ),
      narrativeCoherence: mean(scores.map(({ dimensions }) => dimensions.narrativeCoherence)),
      brandAndCompositionFidelity: mean(
        scores.map(({ dimensions }) => dimensions.brandAndCompositionFidelity)
      ),
      reliabilityAndHonesty: mean(scores.map(({ dimensions }) => dimensions.reliabilityAndHonesty))
    },
    total: mean(scores.map(({ total }) => total)),
    strategyScore: mean(scores.map(({ strategyScore }) => strategyScore?.total ?? 0)),
    blockers: [...blockers].sort(),
    timing,
    candidateDigest: digestOf({
      version: MESSAGING_COMPILER_BENCHMARK_VERSION,
      mutation,
      fixtures: scores.map(({ fixtureId, candidateDigest }) => `${fixtureId}:${candidateDigest}`)
    })
  };
}
