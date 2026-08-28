/**
 * Two-layer copy review for one page.
 *
 * The layers are deliberately separate and strictly ordered. Hard gates decide
 * whether a candidate is *allowed* to exist: contract validity, evidence scope,
 * invented facts, prohibited claims and ideas, budgets, and safety. Only what
 * survives every gate is ranked, and ranking is persuasion only. A candidate
 * that reads beautifully and cites nothing is therefore never in contention, no
 * matter how it would have scored. A weak persuasion score can lose a section,
 * but a strong one can never buy a factuality exemption.
 *
 * Everything here is a pure function of its inputs. Ranking is integer
 * arithmetic with a fixed rubric and index tie-breaks, so identical inputs
 * always produce an identical winner and a receipt can be checked by re-running.
 */

import {
  copyContractMetadata,
  sectionBriefEvidenceRefs,
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionCopySource
} from "@/lib/generation/section-copy-types";
import { unsupportedCopyClaims } from "@/lib/generation/section-claim-coverage";
import {
  containsBannedInternalPhrase,
  containsInternalNarration,
  readsAsInternallyNarrated,
  CUSTOMER_RESULT_PATTERN,
  INVENTED_URGENCY_PATTERN,
  type SectionWritingContract,
  type StrategySlotKey
} from "@/lib/generation/section-writing-contract";

/** Jaccard similarity at or above this rejects the later section as duplicate. */
export const NEAR_DUPLICATE_THRESHOLD = 0.6;

/** One repair per section, ever. A second pass is rewriting, not repairing. */
export const SECTION_REPAIR_LIMIT = 1;

export type CandidateRejectionCode =
  | "contract_violation"
  | "banned_internal_phrase"
  | "unsupported_claim"
  | "empty_candidate"
  | "duplicate_within_section"
  | "duplicate_across_sections"
  | "placeholder_language"
  | "audience_free_claim"
  | "offer_free_claim"
  | "unsupported_superlative"
  | "duplicate_claim_across_sections"
  | "word_budget_violation"
  | "evidence_outside_contract"
  | "required_evidence_uncited"
  | "internal_narration"
  | "invented_urgency"
  | "prohibited_claim_asserted"
  | "prohibited_idea_used"
  | "unsafe_copy";

/**
 * Draft scaffolding that survived into a candidate. None of it is copy, and
 * none of it can be repaired by editing, so it rejects outright.
 */
const PLACEHOLDER_PATTERN =
  /\b(?:lorem ipsum|TBD|TODO|FIXME|coming soon|placeholder|insert (?:name|value|text|company)|your company here|xxx+)\b|\{\{|\}\}|\[insert|\[your |<[a-z_]+>/i;

/**
 * Markup, control characters, and replacement characters are never copy. Shared
 * with the provider boundary so the deterministic fallback is held to the same
 * safety rule as model output.
 */
export const UNSAFE_COPY_PATTERN =
  /[<>]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|\uFFFD/;

/** Schemes that turn a link into script execution. */
const UNSAFE_URL_PATTERN = /\b(?:javascript|vbscript|data)\s*:/i;

/** Vendor filler. It occupies the budget without telling the reader anything. */
const FILLER_PATTERN =
  /\b(?:leverage|synergy|synergies|holistic|robust|cutting[- ]edge|state of the art|innovative|solutions? provider|end[- ]to[- ]end|next[- ]generation)\b/i;

/* -------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* -------------------------------------------------------------------------- */

function candidateFields(candidate: SectionCopyCandidate): string[] {
  return [
    candidate.eyebrow,
    candidate.headline,
    candidate.body,
    ...(candidate.choices ?? []).flatMap((choice) => [choice.label, choice.body])
  ].filter((value): value is string => Boolean(value?.trim()));
}

function candidateText(candidate: SectionCopyCandidate): string {
  return candidateFields(candidate).join(" ");
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 3)
  );
}

/** Distinctive terms, long enough that a match means the subject was named. */
function subjectTerms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 3);
}

/**
 * True when the copy names the subject. Term-level rather than substring, so
 * "reliability leads" is named by "reliability" but not by an unrelated word
 * that happens to contain it.
 */
function namesSubject(text: string, subject: string): boolean {
  const wanted = subjectTerms(subject);
  if (!wanted.length) return true;
  const present = new Set(subjectTerms(text));
  return wanted.some((term) => present.has(term));
}

/** How many of the subject's distinctive terms the copy actually uses. */
function sharedSubjectTerms(text: string, subject: string | undefined): number {
  if (!subject?.trim()) return 0;
  const present = new Set(subjectTerms(text));
  return new Set(subjectTerms(subject).filter((term) => present.has(term))).size;
}

function ownsSlot(
  contract: SectionWritingContract,
  slot: StrategySlotKey
): boolean {
  return Boolean(contract.strategySlots[slot]?.trim());
}

/** Term overlap between two passages, 0 when either side has no content. */
export function copySimilarity(left: string, right: string): number {
  const a = terms(left);
  const b = terms(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Sentences substantial enough to carry a claim, normalized so punctuation and
 * casing differences do not hide a repeat. Fields are split separately: an
 * unpunctuated headline would otherwise run into the first body sentence and
 * disguise a claim the page has already made.
 */
function claimSentences(fields: readonly string[]): string[] {
  return fields.flatMap((field) =>
    field
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => subjectTerms(sentence).join(" "))
      .filter((sentence) => sentence.split(" ").length >= 4)
  );
}

/* -------------------------------------------------------------------------- */
/* Hard gates                                                                  */
/* -------------------------------------------------------------------------- */

/** Every evidence id a candidate leans on, including the ids on its choices. */
function citedRefs(candidate: SectionCopyCandidate): string[] {
  return [
    ...candidate.evidenceRefs,
    ...(candidate.choices ?? []).flatMap((choice) => choice.evidenceRefs)
  ];
}

export interface HardGateResult {
  rejections: CandidateRejectionCode[];
  reasons: string[];
}

/**
 * Every reason this candidate may not be used, independent of how good it is.
 *
 * Cross-section duplication is not checked here: it needs the rest of the page,
 * so it lives in the selection pass. Everything a section can be judged on
 * alone is checked here, and nothing in this function reads a persuasion score.
 */
export function hardGateRejections(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate
): HardGateResult {
  const rejections: CandidateRejectionCode[] = [];
  const reasons: string[] = [];
  const brief = contract.sectionBrief;

  const issues = validateSectionCopyCandidate(
    candidate,
    contract.slot,
    contract.revision,
    contract.evidence
  );
  if (issues.length) {
    rejections.push("contract_violation");
    reasons.push(...issues.map((issue) => `contract_${issue}`));
    // Named separately so a receipt can distinguish over-long copy from a slot
    // mismatch. Over-budget copy is rejected, never trimmed to fit.
    if (
      issues.includes("word_budget_violation")
      || issues.includes("headline_word_budget_violation")
    ) {
      rejections.push("word_budget_violation");
    }
  }

  // The brief's required and optional refs are the whole permitted set. One id
  // outside it means the section read evidence it was never scoped for, which
  // is a boundary failure rather than a citation the reviewer can drop.
  const permitted = new Set(sectionBriefEvidenceRefs(brief));
  if (citedRefs(candidate).some((ref) => !permitted.has(ref))) {
    rejections.push("evidence_outside_contract");
    reasons.push("cited_evidence_outside_section_scope");
  }

  const text = candidateText(candidate);
  if (candidate.status === "omitted") {
    return { rejections, reasons };
  }

  if (!text.trim()) {
    rejections.push("empty_candidate");
    return { rejections, reasons };
  }

  if (UNSAFE_COPY_PATTERN.test(text) || UNSAFE_URL_PATTERN.test(text)) {
    rejections.push("unsafe_copy");
    reasons.push("copy_contains_markup_control_or_script_url");
  }
  if (containsBannedInternalPhrase(text)) {
    rejections.push("banned_internal_phrase");
  }
  if (containsInternalNarration(text)) {
    rejections.push("internal_narration");
    reasons.push("copy_describes_the_page_or_the_build");
  }
  if (PLACEHOLDER_PATTERN.test(text)) {
    rejections.push("placeholder_language");
    reasons.push("placeholder_text_survived_into_copy");
  }

  // A fact section exists to cite the evidence it was scoped for. Optional
  // refs are support it may use; the required set is support it must use.
  if (
    contract.claimType === "fact"
    && brief.requiredEvidenceRefs.length > 0
    && !candidate.evidenceRefs.some((ref) => brief.requiredEvidenceRefs.includes(ref))
  ) {
    rejections.push("required_evidence_uncited");
    reasons.push("fact_section_cited_no_required_evidence");
  }

  const unsupported = unsupportedCopyClaims({
    text,
    citedRefs: candidate.evidenceRefs,
    evidence: contract.evidence
  });
  if (unsupported.length) {
    rejections.push("unsupported_claim");
    // A rank claim reads as verifiable to a buyer, so it is named separately
    // from an ordinary uncited claim rather than folded into the same code.
    if (unsupported.some((claim) => claim.kind === "qualitative")) {
      rejections.push("unsupported_superlative");
    }
    reasons.push(
      ...[...new Set(unsupported.map((claim) => `unsupported_${claim.kind}_claim`))].sort()
    );
  }

  // Urgency and customer results are role permissions, not writing choices. A
  // section without why-now or proof in its brief cannot manufacture either.
  if (!brief.thesisFields.includes("whyNow") && INVENTED_URGENCY_PATTERN.test(text)) {
    rejections.push("invented_urgency");
    reasons.push("urgency_without_a_why_now_field");
  }
  if (!brief.thesisFields.includes("proof") && CUSTOMER_RESULT_PATTERN.test(text)) {
    rejections.push("prohibited_idea_used");
    reasons.push("customer_result_asserted_outside_a_proof_section");
  }

  // A prohibited claim is a concrete statement the page has ruled out. Two
  // shared distinctive terms is the threshold: one is ordinary business
  // vocabulary, two means the sentence is discussing that claim's subject.
  const present = new Set(subjectTerms(text));
  if (
    brief.prohibitedClaims.some(
      (claim) =>
        new Set(subjectTerms(claim).filter((term) => present.has(term))).size >= 2
    )
  ) {
    rejections.push("prohibited_claim_asserted");
    reasons.push("copy_asserts_a_prohibited_or_unresolved_claim");
  }

  if (candidate.choices) {
    const distinct = new Set(
      candidate.choices.map((choice) => choice.label.trim().toLocaleLowerCase())
    );
    if (distinct.size !== candidate.choices.length) {
      rejections.push("duplicate_within_section");
    }
  }

  // Identity and offer correctness. Judged only against a bound strategy:
  // without one there is no agreed audience or offer to hold the copy to.
  const subject = contract.strategySubject;
  if (subject) {
    if (ownsSlot(contract, "audienceJob") && !namesSubject(text, subject.audienceLabel)) {
      rejections.push("audience_free_claim");
      reasons.push("section_owns_audience_job_without_naming_audience");
    }
    if (
      (ownsSlot(contract, "promise") || ownsSlot(contract, "mechanism")) &&
      !namesSubject(text, subject.offerLabel)
    ) {
      rejections.push("offer_free_claim");
      reasons.push("section_argues_offer_without_naming_it");
    }
  }

  return { rejections, reasons };
}

/* -------------------------------------------------------------------------- */
/* Persuasion ranking                                                          */
/* -------------------------------------------------------------------------- */

export const PERSUASION_DIMENSIONS = [
  "buyerRecognition",
  "offerSpecificity",
  "differentiatedMechanism",
  "narrativeContribution",
  "evidenceUse",
  "clearLanguage",
  "objectionUsefulness",
  "ctaContinuity"
] as const;
export type PersuasionDimension = (typeof PERSUASION_DIMENSIONS)[number];

export const PERSUASION_PENALTIES = ["competitor_swappable", "internally_narrated"] as const;
export type PersuasionPenalty = (typeof PERSUASION_PENALTIES)[number];

/** Fixed ceiling per dimension. Whole points only, so ranking cannot drift. */
export const PERSUASION_DIMENSION_MAX: Record<PersuasionDimension, number> = {
  buyerRecognition: 3,
  offerSpecificity: 3,
  differentiatedMechanism: 2,
  narrativeContribution: 3,
  evidenceUse: 3,
  clearLanguage: 3,
  objectionUsefulness: 2,
  ctaContinuity: 2
};

/**
 * Cost of a penalty, large enough to lose to any ordinary candidate. Copy that
 * survives replacing the seller name, or that narrates the deliverable, is not
 * an argument this seller could have made.
 */
export const PERSUASION_PENALTY_POINTS = 4;

export interface PersuasionScore {
  dimensions: Record<PersuasionDimension, number>;
  penalties: PersuasionPenalty[];
  total: number;
}

function capped(dimension: PersuasionDimension, value: number): number {
  return Math.max(0, Math.min(PERSUASION_DIMENSION_MAX[dimension], value));
}

/** What this section may name, drawn only from its own scoped material. */
function anchors(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate
): { audience: string; offer: string; mechanism: string; evidence: string } {
  const cited = new Set(candidate.evidenceRefs);
  return {
    audience: [
      contract.strategySubject?.audienceLabel ?? contract.brief.audience,
      contract.strategySlots.audienceJob ?? ""
    ].join(" "),
    offer: [
      contract.strategySubject?.offerLabel ?? "",
      contract.brief.sellerName ?? "",
      contract.strategySlots.promise ?? contract.brief.promise
    ].join(" "),
    mechanism: contract.strategySlots.mechanism ?? contract.brief.mechanism,
    evidence: contract.evidence
      .filter((claim) => cited.has(claim.id))
      .map(({ text }) => text)
      .join(" ")
  };
}

/** Mean sentence length across the copy, in words. */
function meanSentenceWords(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim());
  if (!sentences.length) return 0;
  const words = sentences.reduce(
    (total, sentence) => total + sentence.trim().split(/\s+/).length,
    0
  );
  return words / sentences.length;
}

/**
 * The fixed persuasion rubric.
 *
 * Exported so a test can prove the boundary directly: an unsupported candidate
 * can score higher here and still lose, because selection reads the gates
 * first. Nothing in this function can clear a rejection.
 */
export function scoreSectionCandidate(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate
): PersuasionScore {
  const brief = contract.sectionBrief;
  const text = candidateText(candidate);
  const anchor = anchors(contract, candidate);
  const penalties: PersuasionPenalty[] = [];

  const buyerRecognition = capped(
    "buyerRecognition",
    sharedSubjectTerms(text, anchor.audience)
  );
  const offerSpecificity = capped("offerSpecificity", sharedSubjectTerms(text, anchor.offer));
  const differentiatedMechanism = capped(
    "differentiatedMechanism",
    sharedSubjectTerms(text, anchor.mechanism)
  );

  // The section's contribution to the whole page: it argues its own movement,
  // it does the job it was given, and it hands the next section its setup. A
  // terminal section scores the last point because it has nothing to set up;
  // ranking only ever compares candidates within one section, so the free
  // point cannot move a decision.
  const narrativeContribution = capped(
    "narrativeContribution",
    (sharedSubjectTerms(text, brief.buyerMovement) > 0 ? 1 : 0)
      + (sharedSubjectTerms(text, brief.semanticJob) > 0 ? 1 : 0)
      + (!brief.nextSetup || sharedSubjectTerms(text, brief.nextSetup) > 0 ? 1 : 0)
  );

  const scoped = contract.evidenceRefs.length;
  const evidenceUse = capped(
    "evidenceUse",
    scoped === 0
      ? candidate.evidenceRefs.length === 0
        ? 3
        : 0
      : (candidate.evidenceRefs.length > 0 ? 1 : 0)
        + Math.round((2 * Math.min(scoped, candidate.evidenceRefs.length)) / scoped)
  );

  const budget = contract.slot.wordBudget;
  const span = Math.max(1, budget.max - budget.min);
  const midpoint = budget.min + span / 2;
  const drift = Math.abs(sectionCopyWordCount(candidate) - midpoint) / span;
  const clearLanguage = capped(
    "clearLanguage",
    (drift <= 0.25 ? 2 : drift <= 0.5 ? 1 : 0)
      + (meanSentenceWords(text) <= 24 && !FILLER_PATTERN.test(text) ? 1 : 0)
  );

  // Scored only when the section owns the objection. A section that does not
  // gets a constant zero, which leaves its ranking untouched.
  const objectionSource = contract.strategySlots.objectionPlan ?? contract.brief.decisionHelp;
  const ownsObjection =
    brief.thesisFields.includes("objection") || ownsSlot(contract, "objectionPlan");
  const objectionUsefulness = capped(
    "objectionUsefulness",
    ownsObjection ? sharedSubjectTerms(text, objectionSource) : 0
  );

  const ctaContinuity = capped(
    "ctaContinuity",
    brief.allowedCtas.length
      ? candidate.cta?.id && brief.allowedCtas.includes(candidate.cta.id)
        ? 2
        : 0
      : candidate.cta
        ? 0
        : 2
  );

  // The logo-swap test. Copy that names nothing from this seller's own audience,
  // offer, mechanism, or cited evidence would survive a competitor pasting their
  // name over it, which is the definition of a generic page.
  if (
    candidate.status === "complete"
    && buyerRecognition === 0
    && offerSpecificity === 0
    && differentiatedMechanism === 0
    && sharedSubjectTerms(text, anchor.evidence) === 0
  ) {
    penalties.push("competitor_swappable");
  }
  if (readsAsInternallyNarrated(text)) penalties.push("internally_narrated");

  const dimensions: Record<PersuasionDimension, number> = {
    buyerRecognition,
    offerSpecificity,
    differentiatedMechanism,
    narrativeContribution,
    evidenceUse,
    clearLanguage,
    objectionUsefulness,
    ctaContinuity
  };
  const earned = PERSUASION_DIMENSIONS.reduce(
    (total, dimension) => total + dimensions[dimension],
    0
  );
  return {
    dimensions,
    penalties,
    total: earned - penalties.length * PERSUASION_PENALTY_POINTS
  };
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                  */
/* -------------------------------------------------------------------------- */

export interface CandidateEvaluation {
  index: number;
  accepted: boolean;
  score: number;
  reasons: string[];
  rejections: CandidateRejectionCode[];
  /** Present only for a candidate that cleared every hard gate. */
  persuasion?: PersuasionScore;
}

/**
 * Gates one candidate, then ranks it only if it passed.
 *
 * A rejected candidate scores zero: it is not weakly persuasive, it is
 * unusable. An accepted one scores at least one, so a heavily penalized but
 * truthful candidate is still ranked above nothing at all.
 */
export function evaluateCandidate(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate,
  index: number
): CandidateEvaluation {
  const gate = hardGateRejections(contract, candidate);
  if (gate.rejections.length) {
    return {
      index,
      accepted: false,
      score: 0,
      reasons: gate.reasons,
      rejections: gate.rejections
    };
  }

  const persuasion = scoreSectionCandidate(contract, candidate);
  return {
    index,
    accepted: true,
    score: Math.max(1, persuasion.total),
    reasons: [
      "contract_satisfied",
      ...persuasion.penalties.map((penalty) => `penalty_${penalty}`)
    ],
    rejections: [],
    persuasion
  };
}

/* -------------------------------------------------------------------------- */
/* Page ledger                                                                 */
/* -------------------------------------------------------------------------- */

export interface PageCopyLedgerEntry {
  sectionId: string;
  text: string;
  claims: readonly string[];
}

/** The copy the page has already committed to, in section order. */
export interface PageCopyLedger {
  entries: readonly PageCopyLedgerEntry[];
}

export const EMPTY_PAGE_LEDGER: PageCopyLedger = { entries: [] };

/**
 * How this candidate repeats the page, if it does.
 *
 * Whole-section overlap can sit under the threshold while one load-bearing
 * sentence is repeated almost verbatim. That is the repetition a reader
 * notices, so both are checked, and a claim counts as repeated when it is only
 * near-identical rather than identical.
 */
export function pageRepetition(
  ledger: PageCopyLedger,
  candidate: SectionCopyCandidate
): CandidateRejectionCode | undefined {
  if (candidate.status === "omitted") return undefined;
  const text = candidateText(candidate);
  if (
    ledger.entries.some(
      (entry) => copySimilarity(entry.text, text) >= NEAR_DUPLICATE_THRESHOLD
    )
  ) {
    return "duplicate_across_sections";
  }
  const claims = claimSentences(candidateFields(candidate));
  const seen = ledger.entries.flatMap((entry) => entry.claims);
  if (
    claims.some((claim) =>
      seen.some(
        (earlier) =>
          earlier === claim || copySimilarity(earlier, claim) >= NEAR_DUPLICATE_THRESHOLD
      )
    )
  ) {
    return "duplicate_claim_across_sections";
  }
  return undefined;
}

export function withAcceptedSection(
  ledger: PageCopyLedger,
  sectionId: string,
  candidate: SectionCopyCandidate
): PageCopyLedger {
  if (candidate.status === "omitted") return ledger;
  return {
    entries: [
      ...ledger.entries,
      {
        sectionId,
        text: candidateText(candidate),
        claims: claimSentences(candidateFields(candidate))
      }
    ]
  };
}

/** Every normalized claim sentence the page has committed to. */
function ledgerClaims(ledger: PageCopyLedger): Set<string> {
  return new Set(ledger.entries.flatMap((entry) => entry.claims));
}

/* -------------------------------------------------------------------------- */
/* Repair                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The one repair the reviewer can make on its own: drop body sentences an
 * earlier section already used. Returns undefined when nothing was removed,
 * when the body would be emptied, or when what remains falls under the slot's
 * word budget. A section trimmed to a fragment is worse than the deterministic
 * writer's copy, and repairing twice is rewriting.
 */
export function repairDuplicateCopy(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate,
  usedClaims: ReadonlySet<string>
): SectionCopyCandidate | undefined {
  const body = candidate.body?.trim();
  if (!body) return undefined;
  const sentences = body.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(
    (sentence) => !usedClaims.has(subjectTerms(sentence).join(" "))
  );
  if (kept.length === sentences.length || !kept.length) return undefined;
  const repaired: SectionCopyCandidate = {
    ...candidate,
    body: kept.join(" ").trim(),
    wordCount: 0
  };
  const counted = { ...repaired, wordCount: sectionCopyWordCount(repaired) };
  if (counted.wordCount < contract.slot.wordBudget.min) return undefined;
  return counted;
}

export interface RepairedCandidateReview {
  accepted?: SectionCopyCandidate;
  evaluation: CandidateEvaluation;
  repetition?: CandidateRejectionCode;
}

/**
 * Reviews a repaired candidate against the page as it already stands.
 *
 * Used for the one bounded model repair, which happens after the first
 * selection pass. Checking it here rather than re-running the whole page keeps
 * the earlier sections' decisions fixed, so a repair can only ever add a
 * section and never change one that was already settled.
 */
export function reviewRepairedCandidate(input: {
  contract: SectionWritingContract;
  candidate: SectionCopyCandidate;
  page: PageCopyLedger;
  index?: number;
}): RepairedCandidateReview {
  const evaluation = evaluateCandidate(
    input.contract,
    input.candidate,
    input.index ?? 0
  );
  if (!evaluation.accepted) return { evaluation };
  const repetition = pageRepetition(input.page, input.candidate);
  if (repetition) {
    return {
      evaluation: {
        ...evaluation,
        accepted: false,
        score: 0,
        rejections: [repetition],
        reasons: [...evaluation.reasons, "repair_still_repeats_the_page"]
      },
      repetition
    };
  }
  return { accepted: input.candidate, evaluation };
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

export interface SectionSelectionEntry {
  contract: SectionWritingContract;
  candidates: readonly SectionCopyCandidate[];
  /**
   * The deterministic recipe copy for this section. Supplied so it can be
   * validated before it is used: a fallback that fails the same gates is not a
   * safe default, it is an unreviewed one.
   */
  fallback?: SectionCopyCandidate;
}

export interface SectionSelection {
  sectionId: string;
  candidate: SectionCopyCandidate | undefined;
  selectedIndex: number;
  evaluations: CandidateEvaluation[];
  selectionReasons: string[];
  /** True when the selected copy is a repaired form of the candidate at that index. */
  repaired?: boolean;
  /** Where the selected copy came from. Reported per section in the trace. */
  source: SectionCopySource;
  /** True once this section has spent its single repair, accepted or not. */
  repairAttempted: boolean;
  candidateCount: number;
  acceptedCandidateCount: number;
  rejectionCodes: CandidateRejectionCode[];
  omissionReason?: SectionCopyCandidate["omissionReason"];
}

export interface SectionCopyReview {
  selections: SectionSelection[];
  /** The copy the page committed to, for a later bounded repair to check. */
  page: PageCopyLedger;
}

function omittedCandidate(
  contract: SectionWritingContract
): SectionCopyCandidate {
  return {
    sectionId: contract.sectionId,
    role: contract.slot.role,
    ...copyContractMetadata(contract.slot),
    evidenceRefs: [],
    status: "omitted",
    // A section with nothing scoped had no material; one with material that
    // could not be used honestly had no argument. The reader sees neither, but
    // the receipt has to tell them apart.
    omissionReason: contract.evidenceRefs.length
      ? "unsupported_optional_slot"
      : "no_current_evidence",
    wordCount: 0
  };
}

/**
 * Reviews one page.
 *
 * Sections are processed in contract order, so the earlier section keeps the
 * copy and the later one has to say something new. Per section the order is
 * fixed: gate every candidate, rank the survivors, reject page repetition,
 * spend at most one repair, then fall back to prevalidated deterministic copy
 * or omit an optional section.
 */
export function reviewSectionCopy(
  entries: readonly SectionSelectionEntry[]
): SectionCopyReview {
  const ordered = [...entries].sort(
    (left, right) => left.contract.order - right.contract.order
  );
  const selections: SectionSelection[] = [];
  let page: PageCopyLedger = EMPTY_PAGE_LEDGER;

  for (const { contract, candidates, fallback } of ordered) {
    const evaluations = candidates.map((candidate, index) =>
      evaluateCandidate(contract, candidate, index)
    );
    const ranked = evaluations
      .filter((evaluation) => evaluation.accepted)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const acceptedCandidateCount = ranked.length;

    let selectedIndex = -1;
    let selected: SectionCopyCandidate | undefined;
    let source: SectionCopySource = "none";
    let repaired = false;
    let repairAttempted = false;
    const selectionReasons: string[] = [];

    for (const evaluation of ranked) {
      const original = candidates[evaluation.index]!;
      const repetition = pageRepetition(page, original);
      let accepted: SectionCopyCandidate | undefined = repetition ? undefined : original;

      // One repair per section, and only for repetition: a rejected claim or a
      // placeholder is a content failure that editing cannot honestly fix.
      if (repetition && !repairAttempted) {
        repairAttempted = true;
        const attempt = repairDuplicateCopy(contract, original, ledgerClaims(page));
        if (attempt) {
          const review = reviewRepairedCandidate({
            contract,
            candidate: attempt,
            page,
            index: evaluation.index
          });
          if (review.accepted) {
            accepted = review.accepted;
            repaired = true;
            evaluation.reasons.push("repaired_duplicate_claim");
          }
        }
      }

      if (!accepted) {
        evaluation.accepted = false;
        evaluation.rejections.push(repetition!);
        evaluation.reasons.push(
          repetition === "duplicate_across_sections"
            ? "near_duplicate_of_earlier_section"
            : "claim_already_made_by_earlier_section"
        );
        continue;
      }

      selectedIndex = evaluation.index;
      selected = accepted;
      source = repaired ? "repaired-model" : "model";
      selectionReasons.push(...evaluation.reasons, `selected_candidate_${evaluation.index}`);
      break;
    }

    if (!selected) {
      selectionReasons.push(
        "no_candidate_accepted",
        ...[...new Set(evaluations.flatMap(({ rejections }) => rejections))].sort()
      );
      const decision = fallbackDecision(contract, fallback, page);
      selected = decision.candidate;
      source = decision.source;
      selectionReasons.push(...decision.reasons);
    }

    // Only reviewed copy joins the ledger. A required fallback that failed its
    // own gates is still rendered, but it must not be allowed to suppress a
    // later section that would have passed.
    if (selected && source !== "omitted" && source !== "none") {
      page = withAcceptedSection(page, contract.sectionId, selected);
    }

    selections.push({
      sectionId: contract.sectionId,
      candidate: selected,
      selectedIndex,
      evaluations,
      selectionReasons,
      ...(repaired ? { repaired: true } : {}),
      source,
      repairAttempted,
      candidateCount: candidates.length,
      acceptedCandidateCount,
      rejectionCodes: [
        ...new Set(evaluations.flatMap(({ rejections }) => rejections))
      ].sort(),
      ...(selected?.omissionReason ? { omissionReason: selected.omissionReason } : {})
    });
  }

  return { selections, page };
}

/**
 * What a section falls back to when no candidate survived.
 *
 * The deterministic copy is gated before it is used. A required section renders
 * it regardless, because a hole in the page is worse than weak copy and the
 * recoverable-failure decision belongs to the lifecycle rather than here. An
 * optional section omits instead: filling it to reach a section count is the
 * generic page this review exists to prevent.
 */
function fallbackDecision(
  contract: SectionWritingContract,
  fallback: SectionCopyCandidate | undefined,
  page: PageCopyLedger
): { candidate: SectionCopyCandidate | undefined; source: SectionCopySource; reasons: string[] } {
  if (!fallback) {
    return contract.required
      ? { candidate: undefined, source: "none", reasons: ["no_prevalidated_fallback"] }
      : {
          candidate: omittedCandidate(contract),
          source: "omitted",
          reasons: ["omitted_rather_than_filled"]
        };
  }

  const gate = hardGateRejections(contract, fallback);
  const repetition = pageRepetition(page, fallback);
  if (!gate.rejections.length) {
    return {
      candidate: fallback,
      source: "fallback",
      reasons: [
        "prevalidated_fallback_used",
        ...(repetition ? ["fallback_repeats_page"] : [])
      ]
    };
  }
  if (!contract.required) {
    return {
      candidate: omittedCandidate(contract),
      source: "omitted",
      reasons: ["omitted_rather_than_filled", ...gate.rejections.map((code) => `fallback_${code}`)]
    };
  }
  return {
    candidate: fallback,
    source: "fallback",
    reasons: [
      "required_section_kept_unvalidated_fallback",
      ...gate.rejections.map((code) => `fallback_${code}`)
    ]
  };
}

/**
 * Picks one candidate per section. Retained for callers that only need the
 * selections; `reviewSectionCopy` also returns the page ledger a later bounded
 * repair has to be checked against.
 */
export function selectSectionCopy(
  entries: readonly SectionSelectionEntry[]
): SectionSelection[] {
  return reviewSectionCopy(entries).selections;
}
