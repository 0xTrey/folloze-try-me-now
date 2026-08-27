import {
  copyContractMetadata,
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate
} from "@/lib/generation/section-copy-types";
import { unsupportedCopyClaims } from "@/lib/generation/section-claim-coverage";
import {
  containsBannedInternalPhrase,
  type SectionWritingContract,
  type StrategySlotKey
} from "@/lib/generation/section-writing-contract";

/** Jaccard similarity at or above this rejects the later section as duplicate. */
export const NEAR_DUPLICATE_THRESHOLD = 0.6;

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
  | "duplicate_claim_across_sections";

/**
 * Draft scaffolding that survived into a candidate. None of it is copy, and
 * none of it can be repaired by editing, so it rejects outright.
 */
const PLACEHOLDER_PATTERN =
  /\b(?:lorem ipsum|TBD|TODO|FIXME|coming soon|placeholder|insert (?:name|value|text|company)|your company here|xxx+)\b|\{\{|\}\}|\[insert|\[your |<[a-z_]+>/i;


export interface CandidateEvaluation {
  index: number;
  accepted: boolean;
  score: number;
  reasons: string[];
  rejections: CandidateRejectionCode[];
}

export interface SectionSelection {
  sectionId: string;
  candidate: SectionCopyCandidate | undefined;
  selectedIndex: number;
  evaluations: CandidateEvaluation[];
  selectionReasons: string[];
  /** True when the selected copy is a repaired form of the candidate at that index. */
  repaired?: boolean;
}

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

/**
 * Scores one candidate against its contract. Scoring is deterministic so two
 * runs over the same candidates always pick the same copy.
 */
export function evaluateCandidate(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate,
  index: number
): CandidateEvaluation {
  const rejections: CandidateRejectionCode[] = [];
  const reasons: string[] = [];

  const issues = validateSectionCopyCandidate(
    candidate,
    contract.slot,
    contract.revision,
    contract.evidence
  );
  if (issues.length) {
    rejections.push("contract_violation");
    reasons.push(...issues.map((issue) => `contract_${issue}`));
  }

  const text = candidateText(candidate);
  if (candidate.status === "complete" && !text.trim()) {
    rejections.push("empty_candidate");
  }
  if (containsBannedInternalPhrase(text)) {
    rejections.push("banned_internal_phrase");
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

  if (candidate.choices) {
    const distinct = new Set(
      candidate.choices.map((choice) => choice.label.trim().toLocaleLowerCase())
    );
    if (distinct.size !== candidate.choices.length) {
      rejections.push("duplicate_within_section");
    }
  }

  // An omitted section has no copy to judge. Safe omission stays valid.
  if (candidate.status === "complete" && text.trim()) {
    if (PLACEHOLDER_PATTERN.test(text)) {
      rejections.push("placeholder_language");
      reasons.push("placeholder_text_survived_into_copy");
    }
    // Specificity is judged only against a bound strategy: without one there is
    // no agreed audience or offer to hold the copy to.
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
  }

  // Prefer well-cited copy that sits mid-budget over copy that only just fits.
  const budget = contract.slot.wordBudget;
  const span = Math.max(1, budget.max - budget.min);
  const midpoint = budget.min + span / 2;
  const budgetFit =
    1 - Math.min(1, Math.abs(sectionCopyWordCount(candidate) - midpoint) / span);
  const citationRate = contract.evidenceRefs.length
    ? Math.min(1, candidate.evidenceRefs.length / contract.evidenceRefs.length)
    : candidate.evidenceRefs.length === 0
      ? 1
      : 0;
  const score = rejections.length
    ? 0
    : Math.round((budgetFit * 0.45 + citationRate * 0.55) * 10_000) / 10_000;

  if (!rejections.length) reasons.push("contract_satisfied");

  return { index, accepted: rejections.length === 0, score, reasons, rejections };
}

/**
 * The one repair the reviewer is allowed to make: drop body sentences an
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

/**
 * Picks one candidate per section, then reviews the accepted set across
 * sections so a later section cannot repeat an earlier one. Sections are
 * reviewed in contract order, so the earlier section keeps the copy.
 */
export function selectSectionCopy(
  entries: readonly {
    contract: SectionWritingContract;
    candidates: readonly SectionCopyCandidate[];
  }[]
): SectionSelection[] {
  const ordered = [...entries].sort((left, right) => left.contract.order - right.contract.order);
  const selections: SectionSelection[] = [];
  const acceptedText: { sectionId: string; text: string }[] = [];
  const acceptedClaims = new Set<string>();

  for (const { contract, candidates } of ordered) {
    const evaluations = candidates.map((candidate, index) =>
      evaluateCandidate(contract, candidate, index)
    );
    const ranked = evaluations
      .filter((evaluation) => evaluation.accepted)
      .sort((left, right) => right.score - left.score || left.index - right.index);

    // Whole-section overlap can sit under the threshold while one load-bearing
    // sentence is repeated verbatim. That is the repetition a reader notices,
    // so both are checked before a candidate is accepted.
    const repetitionIn = (
      subject: SectionCopyCandidate
    ): CandidateRejectionCode | undefined => {
      const text = candidateText(subject);
      if (
        acceptedText.some((entry) => copySimilarity(entry.text, text) >= NEAR_DUPLICATE_THRESHOLD)
      ) {
        return "duplicate_across_sections";
      }
      if (claimSentences(candidateFields(subject)).some((claim) => acceptedClaims.has(claim))) {
        return "duplicate_claim_across_sections";
      }
      return undefined;
    };

    let selectedIndex = -1;
    let selected: SectionCopyCandidate | undefined;
    let repaired = false;
    let repairSpent = false;
    const selectionReasons: string[] = [];
    for (const evaluation of ranked) {
      const original = candidates[evaluation.index]!;
      const repetition = repetitionIn(original);
      let accepted: SectionCopyCandidate | undefined = repetition ? undefined : original;

      // One repair per section, and only for repetition: a rejected claim or a
      // placeholder is a content failure that editing cannot honestly fix.
      if (repetition && !repairSpent) {
        repairSpent = true;
        const attempt = repairDuplicateCopy(contract, original, acceptedClaims);
        if (
          attempt &&
          evaluateCandidate(contract, attempt, evaluation.index).accepted &&
          !repetitionIn(attempt)
        ) {
          accepted = attempt;
          repaired = true;
          evaluation.reasons.push("repaired_duplicate_claim");
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
      selectionReasons.push(...evaluation.reasons, `selected_candidate_${evaluation.index}`);
      acceptedText.push({ sectionId: contract.sectionId, text: candidateText(accepted) });
      for (const claim of claimSentences(candidateFields(accepted))) acceptedClaims.add(claim);
      break;
    }

    if (selectedIndex < 0) {
      selectionReasons.push(
        "no_candidate_accepted",
        ...[...new Set(evaluations.flatMap(({ rejections }) => rejections))].sort()
      );
      // An optional section with nothing of its own to say omits. Filling it to
      // reach a section count is the generic copy this review exists to stop.
      if (!contract.required) {
        selected = {
          sectionId: contract.sectionId,
          role: contract.slot.role,
          ...copyContractMetadata(contract.slot),
          evidenceRefs: [],
          status: "omitted",
          omissionReason: "unsupported_optional_slot",
          wordCount: 0
        };
        selectionReasons.push("omitted_rather_than_filled");
      }
    }

    selections.push({
      sectionId: contract.sectionId,
      candidate: selected,
      selectedIndex,
      evaluations,
      selectionReasons,
      ...(repaired ? { repaired: true } : {})
    });
  }

  return selections;
}
