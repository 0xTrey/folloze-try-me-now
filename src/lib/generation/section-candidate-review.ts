import {
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate
} from "@/lib/generation/section-copy-types";
import {
  containsBannedInternalPhrase,
  type SectionWritingContract
} from "@/lib/generation/section-writing-contract";

/** Jaccard similarity at or above this rejects the later section as duplicate. */
export const NEAR_DUPLICATE_THRESHOLD = 0.6;

export type CandidateRejectionCode =
  | "contract_violation"
  | "banned_internal_phrase"
  | "unsupported_claim"
  | "empty_candidate"
  | "duplicate_within_section"
  | "duplicate_across_sections";

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
}

function candidateText(candidate: SectionCopyCandidate): string {
  return [
    candidate.eyebrow,
    candidate.headline,
    candidate.body,
    ...(candidate.choices ?? []).flatMap((choice) => [choice.label, choice.body])
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 3)
  );
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
 * Numeric or proper-noun assertions a reader would treat as verifiable fact.
 * Anything matched here must trace to cited evidence.
 */
function verifiableAssertions(value: string): string[] {
  return [
    ...(value.match(
      /\b\d[\d,.]*\s?(?:%|\b(?:percent|x|hours?|days?|weeks?|months?|years?)\b)/gi
    ) ?? []),
    ...(value.match(/\$\s?\d[\d,.]*(?:\s?[kmb])?\b/gi) ?? [])
  ].map((match) => match.trim());
}

function evidenceSupports(
  contract: SectionWritingContract,
  candidate: SectionCopyCandidate,
  assertion: string
): boolean {
  const cited = new Set(candidate.evidenceRefs);
  return contract.evidence.some(
    (claim) =>
      cited.has(claim.id)
      && claim.text.toLocaleLowerCase().includes(assertion.toLocaleLowerCase())
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

  const unsupported = verifiableAssertions(text).filter(
    (assertion) => !evidenceSupports(contract, candidate, assertion)
  );
  if (unsupported.length) {
    rejections.push("unsupported_claim");
    reasons.push(`unsupported_assertions_${unsupported.length}`);
  }

  if (candidate.choices) {
    const distinct = new Set(
      candidate.choices.map((choice) => choice.label.trim().toLocaleLowerCase())
    );
    if (distinct.size !== candidate.choices.length) {
      rejections.push("duplicate_within_section");
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

  for (const { contract, candidates } of ordered) {
    const evaluations = candidates.map((candidate, index) =>
      evaluateCandidate(contract, candidate, index)
    );
    const ranked = evaluations
      .filter((evaluation) => evaluation.accepted)
      .sort((left, right) => right.score - left.score || left.index - right.index);

    let selectedIndex = -1;
    const selectionReasons: string[] = [];
    for (const evaluation of ranked) {
      const text = candidateText(candidates[evaluation.index]!);
      const clash = acceptedText.find(
        (entry) => copySimilarity(entry.text, text) >= NEAR_DUPLICATE_THRESHOLD
      );
      if (clash) {
        evaluation.accepted = false;
        evaluation.rejections.push("duplicate_across_sections");
        evaluation.reasons.push("near_duplicate_of_earlier_section");
        continue;
      }
      selectedIndex = evaluation.index;
      selectionReasons.push(...evaluation.reasons, `selected_candidate_${evaluation.index}`);
      acceptedText.push({ sectionId: contract.sectionId, text });
      break;
    }

    if (selectedIndex < 0) {
      selectionReasons.push(
        "no_candidate_accepted",
        ...[...new Set(evaluations.flatMap(({ rejections }) => rejections))].sort()
      );
    }

    selections.push({
      sectionId: contract.sectionId,
      candidate: selectedIndex >= 0 ? candidates[selectedIndex] : undefined,
      selectedIndex,
      evaluations,
      selectionReasons
    });
  }

  return selections;
}
