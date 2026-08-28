/**
 * Compiles the competing arguments for one Campaign Thesis and selects a winner.
 *
 * The messaging compiler already builds materially different angles, evaluates
 * them on a fixed rubric, and selects deterministically. This module does not
 * repeat any of that. It adapts the thesis and its narrow evidence input into
 * that compiler's inputs, adds the hard failures the thesis layer can see and
 * the compiler cannot, and runs those failures *before* ranking so a rejected
 * argument is never scored into contention.
 *
 * Everything returned here is private. The selection carries argument text for
 * the section writers; only `thesisStrategyReceipt` is safe to persist.
 */

import {
  campaignThesisDigest,
  thesisFieldValue,
  type CampaignThesis,
  type ThesisEvidenceClaim,
  type ThesisEvidenceInput
} from "@/lib/generation/campaign-thesis";
import { compilerDigest } from "@/lib/generation/compiler-digest";
import { MESSAGE_SPINE_SECTION_USES } from "@/lib/generation/message-spine";
import type {
  MessageFrameworkId,
  MessageFrameworkRanking,
  MessageSpineSectionUse
} from "@/lib/generation/message-spine";
import {
  argumentSharesSubject,
  compileMessageStrategyCandidates,
  selectMessageStrategy,
  type FamilyArgumentBaseline,
  type MessageStrategyCompilerInput,
  type StrategyEvaluationContext
} from "@/lib/generation/message-strategy-compiler";
import {
  COMPILER_PROHIBITED_USES,
  type CompilerEvidenceItem,
  type CompilerProhibitedUse,
  type MessageStrategyAngle,
  type MessageStrategyCandidate,
  type StrategyEvaluation,
  type StrategyEvaluationDimension
} from "@/lib/generation/messaging-compiler-contracts";
import { validateThesisForRecipe, type PageRecipeId } from "@/lib/generation/page-recipes";
import type { WireframeFamilyV2 } from "@/lib/generation/three-family-contract";

export const THESIS_STRATEGY_SCHEMA_VERSION = "1.0" as const;
/** Matches CONTRACT_VERSION_PATTERN so the version is trace-safe verbatim. */
export const THESIS_STRATEGY_VERSION = "thesis-strategy-v1.0.0";

/**
 * The three arguments the release requires, expressed in the vocabulary of the
 * existing angles. A fourth is kept when it survives its own hard failures.
 */
export const REQUIRED_ARGUMENT_KINDS = ["outcome-led", "tension-led", "mechanism-or-proof-led"] as const;
export type ArgumentKind = (typeof REQUIRED_ARGUMENT_KINDS)[number];

const ARGUMENT_KIND_BY_ANGLE: Record<MessageStrategyAngle, ArgumentKind> = {
  upside: "outcome-led",
  tension: "tension-led",
  mechanism: "mechanism-or-proof-led",
  proof: "mechanism-or-proof-led"
};

/* -------------------------------------------------------------------------- */
/* Evidence adaptation                                                         */
/* -------------------------------------------------------------------------- */

const SECTION_USES = new Set<string>(MESSAGE_SPINE_SECTION_USES);
const PROHIBITED_USES = new Set<string>(COMPILER_PROHIBITED_USES);

function narrowedUses(uses: readonly string[]): readonly MessageSpineSectionUse[] {
  return [...new Set(uses.filter((use): use is MessageSpineSectionUse => SECTION_USES.has(use)))].sort();
}

function narrowedProhibitions(uses: readonly string[]): readonly CompilerProhibitedUse[] {
  return [
    ...new Set(uses.filter((use): use is CompilerProhibitedUse => PROHIBITED_USES.has(use)))
  ].sort();
}

/**
 * Adapts executed claims into the compiler's ledger.
 *
 * Unknown claims and claims that may not be shown to a buyer never enter: the
 * ledger is what the argument and, later, the copy may lean on, so a claim that
 * cannot be said out loud has no business being citable. Permissions are carried
 * across verbatim rather than re-derived, because narrowing an upstream
 * permission here would quietly grant a use the graph refused.
 */
export function compilerLedgerFromThesisEvidence(
  evidence: ThesisEvidenceInput
): CompilerEvidenceItem[] {
  return evidence.claims
    .filter((claim) => claim.status !== "unknown" && claim.buyerFacing)
    .map((claim) => ({
      id: claim.id,
      kind: claim.status === "fact" ? ("fact" as const) : ("inference" as const),
      claim: claim.claim,
      sourceAuthority: "evidence-graph",
      sourceRef: claim.id,
      confidence: claim.confidence,
      allowedUses: narrowedUses(claim.allowedUses),
      prohibitedUses: narrowedProhibitions(claim.prohibitedUses)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/* -------------------------------------------------------------------------- */
/* Hard failures the thesis layer owns                                         */
/* -------------------------------------------------------------------------- */

export const THESIS_STRATEGY_HARD_FAILURES = [
  "missing_required_thesis_field",
  "wrong_identity",
  "dangling_evidence_ref",
  "prohibited_evidence_use",
  "unsupported_claim",
  "audience_free_argument",
  "offer_free_argument",
  "cta_does_not_resolve_decision"
] as const;
export type ThesisStrategyHardFailure = (typeof THESIS_STRATEGY_HARD_FAILURES)[number];

/**
 * What each angle asserts about the world, as the uses a cited claim must not
 * prohibit. The mechanism angle is absent on purpose: its directives explain how
 * something works and ask the reader to check each step, which an inference is
 * permitted to support.
 */
const ANGLE_ASSERTED_USES: Record<MessageStrategyAngle, readonly CompilerProhibitedUse[]> = {
  upside: ["declarative-claim"],
  tension: ["declarative-claim", "urgency-claim"],
  proof: ["proof-point"],
  mechanism: []
};

/** Proof framed as an open question rather than asserted. */
const PROOF_AS_QUESTION_PATTERN =
  /validation plan|not yet available|verify|test each|confirm the cost|ask .* to (?:confirm|verify|test)/i;

function normalizedName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * True when the thesis names a seller the evidence graph actually resolved. With
 * no seller entity there is nothing to check against, so the field's own status
 * remains the only guarantee.
 */
function identityResolves(thesis: CampaignThesis, evidence: ThesisEvidenceInput): boolean {
  const sellers = evidence.entities.filter((entity) => entity.kind === "seller");
  if (sellers.length === 0) return true;
  const seller = normalizedName(thesisFieldValue(thesis, "seller") ?? "");
  if (!seller) return false;
  return sellers.some((entity) =>
    [entity.canonicalName, ...(entity.aliases ?? [])]
      .map(normalizedName)
      .filter(Boolean)
      .some((name) => seller.includes(name) || name.includes(seller))
  );
}

function bridgeHardFailures(input: {
  candidate: MessageStrategyCandidate;
  thesis: CampaignThesis;
  claimsById: ReadonlyMap<string, ThesisEvidenceClaim>;
  identityOk: boolean;
}): ThesisStrategyHardFailure[] {
  const { candidate, thesis, claimsById, identityOk } = input;
  const failures = new Set<ThesisStrategyHardFailure>();

  if (!identityOk) failures.add("wrong_identity");

  const cited: ThesisEvidenceClaim[] = [];
  for (const ref of candidate.evidenceRefs) {
    const claim = claimsById.get(ref);
    if (!claim) {
      failures.add("dangling_evidence_ref");
      continue;
    }
    cited.push(claim);
  }

  const asserted = ANGLE_ASSERTED_USES[candidate.angle];
  if (cited.some((claim) => asserted.some((use) => claim.prohibitedUses.includes(use)))) {
    failures.add("prohibited_evidence_use");
  }

  // A proof statement the page intends to assert needs a claim permitted as a
  // proof point. Framed as a question, it needs nothing.
  if (!PROOF_AS_QUESTION_PATTERN.test(candidate.proofPlan)) {
    const provable = cited.some(
      (claim) => claim.status === "fact" && !claim.prohibitedUses.includes("proof-point")
    );
    if (!provable) failures.add("unsupported_claim");
  }

  const audienceJob = candidate.audienceJob.trim();
  if (!audienceJob || !thesisFieldValue(thesis, "audience")) {
    failures.add("audience_free_argument");
  }
  const offer = thesisFieldValue(thesis, "offer");
  if (!offer || !argumentSharesSubject(offer, `${candidate.bigIdea} ${candidate.promise}`)) {
    failures.add("offer_free_argument");
  }

  // The CTA has to resolve the decision the page framed, not merely exist.
  const nextAction = thesisFieldValue(thesis, "nextAction");
  if (!nextAction || !argumentSharesSubject(nextAction, candidate.ctaLogic)) {
    failures.add("cta_does_not_resolve_decision");
  }

  return [...failures].sort();
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

export interface ThesisStrategyInput {
  thesis: CampaignThesis;
  evidence: ThesisEvidenceInput;
  recipeId: PageRecipeId;
  ranking: MessageFrameworkRanking;
  family: WireframeFamilyV2;
  baseline: FamilyArgumentBaseline;
  /** The button's own words, which the winning CTA logic must contain. */
  ctaLabel: string;
  objective: string;
  targetName?: string;
}

export interface ThesisStrategyCandidateRecord {
  candidateId: string;
  angle: MessageStrategyAngle;
  argumentKind: ArgumentKind;
  frameworkId: MessageFrameworkId;
  hardFailures: string[];
  /** Present only for candidates that reached ranking. */
  dimensions?: Record<StrategyEvaluationDimension, number>;
  total?: number;
  reasonCodes: string[];
}

export interface ThesisStrategySelection {
  schemaVersion: typeof THESIS_STRATEGY_SCHEMA_VERSION;
  version: string;
  thesisDigest: string;
  selected?: MessageStrategyCandidate;
  selectedId?: string;
  candidates: MessageStrategyCandidate[];
  records: ThesisStrategyCandidateRecord[];
  rejectedIds: string[];
  reasonCodes: string[];
  digest: string;
  visibility: "internal";
}

function compilerInputFromThesis(input: ThesisStrategyInput): MessageStrategyCompilerInput {
  const { thesis } = input;
  return {
    ranking: input.ranking,
    family: input.family,
    baseline: input.baseline,
    ledger: compilerLedgerFromThesisEvidence(input.evidence),
    sellerName: thesisFieldValue(thesis, "seller") ?? "",
    ...(input.targetName ? { targetName: input.targetName } : {}),
    offer: thesisFieldValue(thesis, "offer") ?? "",
    audienceLabel: thesisFieldValue(thesis, "audience") ?? "",
    audienceJob: thesisFieldValue(thesis, "audienceJob") ?? "",
    objective: input.objective,
    ctaLabel: input.ctaLabel,
    unknowns: thesis.unknowns
  };
}

function emptySelection(
  thesis: CampaignThesis,
  reasonCodes: readonly string[]
): ThesisStrategySelection {
  const base = {
    schemaVersion: THESIS_STRATEGY_SCHEMA_VERSION,
    version: THESIS_STRATEGY_VERSION,
    thesisDigest: campaignThesisDigest(thesis),
    candidates: [],
    records: [],
    rejectedIds: [],
    reasonCodes: [...new Set(reasonCodes)].sort(),
    visibility: "internal" as const
  };
  return { ...base, digest: thesisStrategyDigest(base) };
}

/**
 * Compiles the candidate set and selects one argument.
 *
 * Fail-soft by construction: an unusable thesis or a set with no survivor
 * returns no selection, and the caller keeps the deterministic argument it
 * already had rather than shipping a rejected one.
 */
export function compileThesisStrategy(input: ThesisStrategyInput): ThesisStrategySelection {
  const { thesis } = input;
  const validation = validateThesisForRecipe(thesis, input.recipeId);
  if (!validation.valid) {
    return emptySelection(thesis, [
      "hard_failure_missing_required_thesis_field",
      ...validation.issues
    ]);
  }

  const compilerInput = compilerInputFromThesis(input);
  const candidates = compileMessageStrategyCandidates(compilerInput);
  const claimsById = new Map(input.evidence.claims.map((claim) => [claim.id, claim]));
  const identityOk = identityResolves(thesis, input.evidence);

  const failuresById = new Map<string, ThesisStrategyHardFailure[]>();
  for (const candidate of candidates) {
    failuresById.set(
      candidate.id,
      bridgeHardFailures({ candidate, thesis, claimsById, identityOk })
    );
  }

  const eligible = candidates.filter(
    (candidate) => (failuresById.get(candidate.id)?.length ?? 0) === 0
  );
  const context: StrategyEvaluationContext = {
    ledger: compilerInput.ledger,
    offer: compilerInput.offer,
    audienceLabel: compilerInput.audienceLabel,
    objective: compilerInput.objective,
    ctaLabel: compilerInput.ctaLabel,
    sellerName: compilerInput.sellerName
  };
  const selection = selectMessageStrategy(eligible, context, input.ranking);
  const evaluationsById = new Map<string, StrategyEvaluation>(
    selection.evaluations.map((evaluation) => [evaluation.candidateId, evaluation])
  );

  const records: ThesisStrategyCandidateRecord[] = candidates
    .map((candidate) => {
      const bridge = failuresById.get(candidate.id) ?? [];
      const evaluation = evaluationsById.get(candidate.id);
      const hardFailures = [...new Set([...bridge, ...(evaluation?.hardFailures ?? [])])].sort();
      return {
        candidateId: candidate.id,
        angle: candidate.angle,
        argumentKind: ARGUMENT_KIND_BY_ANGLE[candidate.angle],
        frameworkId: candidate.frameworkId,
        hardFailures,
        ...(evaluation && hardFailures.length === 0
          ? { dimensions: evaluation.dimensions, total: evaluation.total }
          : {}),
        reasonCodes: [
          ...new Set([
            ...(evaluation?.reasonCodes ?? []),
            ...bridge.map((failure) => `hard_failure_${failure}`)
          ])
        ].sort()
      };
    })
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));

  const reasonCodes = new Set<string>(selection.reasonCodes);
  const completeKinds = new Set(
    records
      .filter((record) => record.hardFailures.length === 0)
      .map((record) => record.argumentKind)
  );
  for (const kind of REQUIRED_ARGUMENT_KINDS) {
    if (!completeKinds.has(kind)) reasonCodes.add(`argument_kind_unavailable_${kind}`);
  }
  for (const record of records) {
    for (const failure of record.hardFailures) reasonCodes.add(`rejected_${failure}`);
  }

  const base = {
    schemaVersion: THESIS_STRATEGY_SCHEMA_VERSION,
    version: THESIS_STRATEGY_VERSION,
    thesisDigest: campaignThesisDigest(thesis),
    ...(selection.selected ? { selected: selection.selected, selectedId: selection.selected.id } : {}),
    candidates,
    records,
    rejectedIds: records
      .filter((record) => record.candidateId !== selection.selected?.id)
      .map(({ candidateId }) => candidateId)
      .sort(),
    reasonCodes: [...reasonCodes].sort(),
    visibility: "internal" as const
  };

  return { ...base, digest: thesisStrategyDigest(base) };
}

/* -------------------------------------------------------------------------- */
/* Receipts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Source-free projection for the private BuildTrace: ids, angles, dimension
 * results, and reason codes, with no argument text and no claim text.
 */
export function thesisStrategyReceipt(selection: ThesisStrategySelection): {
  version: string;
  thesisDigest: string;
  strategyDigest: string;
  selectedId?: string;
  rejectedIds: string[];
  records: ThesisStrategyCandidateRecord[];
  reasonCodes: string[];
} {
  return {
    version: selection.version,
    thesisDigest: selection.thesisDigest,
    strategyDigest: selection.digest,
    ...(selection.selectedId ? { selectedId: selection.selectedId } : {}),
    rejectedIds: [...selection.rejectedIds],
    records: selection.records.map((record) => ({ ...record })),
    reasonCodes: [...selection.reasonCodes]
  };
}

export function thesisStrategyDigest(
  selection: Omit<ThesisStrategySelection, "digest">
): string {
  return `st_${compilerDigest("thesis-strategy-v1", {
    schemaVersion: selection.schemaVersion,
    version: selection.version,
    thesisDigest: selection.thesisDigest,
    selectedId: selection.selectedId,
    records: selection.records.map((record) => ({
      candidateId: record.candidateId,
      angle: record.angle,
      argumentKind: record.argumentKind,
      frameworkId: record.frameworkId,
      hardFailures: record.hardFailures,
      total: record.total,
      dimensions: record.dimensions
    })),
    reasonCodes: selection.reasonCodes
  })}`;
}
