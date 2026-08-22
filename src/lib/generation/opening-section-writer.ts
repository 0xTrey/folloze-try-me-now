import {
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

const FORBIDDEN_COPY =
  /\b(?:account thesis|best-in-class|buying committee|decision path|make progress with confidence|narrative arc|seamless|stakeholder map|supporting proof|transform your business|unlock value)\b/i;
const CODE_OR_MARKUP =
  /```|<\/?[a-z][^>]*>|(?:^|\s)(?:class|const|export|function|import|let|var)\s+|(?:^|\s)[.#][a-z][\w-]*\s*\{/i;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeCopy(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || FORBIDDEN_COPY.test(normalized) || CODE_OR_MARKUP.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function wordCount(value: string | undefined): number {
  return value?.trim() ? value.trim().split(/\s+/).length : 0;
}

function truncateWords(value: string, limit: number): string {
  if (limit <= 0) return "";
  const words = value.trim().split(/\s+/);
  if (words.length <= limit) return value;
  return words
    .slice(0, limit)
    .join(" ")
    .replace(/[,;:-]+$/g, "");
}

const DECISION_PROMPTS: Record<number, string> = {
  1: "Evaluate.",
  2: "Assess fit.",
  3: "Assess the fit.",
  4: "Assess fit against priorities.",
  5: "Assess the fit against priorities.",
  6: "Assess the evidence against your priorities.",
  7: "Assess the current evidence against your priorities.",
  8: "Assess the current evidence against your stated priorities.",
  9: "Assess the current evidence against your team's stated priorities.",
  10: "Assess the current evidence against your team's priorities before proceeding.",
  11: "Assess the evidence against your team's priorities before choosing next steps.",
  12: "Assess the current evidence against your team's priorities before choosing next steps.",
  13: "Assess the evidence against your team's priorities, then decide what needs validation next."
};

/**
 * Produces an exact-length, non-factual decision prompt. It can fill a narrow
 * composition budget without adding claims, proof, outcomes, or urgency.
 */
function decisionPrompt(words: number): string {
  if (words <= 0) return "";
  if (words <= 13) return DECISION_PROMPTS[words]!;
  return `${DECISION_PROMPTS[13]} ${decisionPrompt(words - 13)}`;
}

function fitCandidateToBudget(
  candidate: SectionCopyCandidate,
  slot: SectionWriterSlot
): SectionCopyCandidate | undefined {
  const fitted: SectionCopyCandidate = {
    ...candidate,
    wordCount: sectionCopyWordCount(candidate)
  };

  if (fitted.wordCount > slot.wordBudget.max && fitted.cta) {
    delete fitted.cta;
    fitted.wordCount = sectionCopyWordCount(fitted);
  }
  if (fitted.wordCount > slot.wordBudget.max && fitted.eyebrow) {
    delete fitted.eyebrow;
    fitted.wordCount = sectionCopyWordCount(fitted);
  }
  if (fitted.wordCount > slot.wordBudget.max && fitted.body) {
    const excess = fitted.wordCount - slot.wordBudget.max;
    fitted.body = truncateWords(fitted.body, Math.max(1, wordCount(fitted.body) - excess));
    fitted.wordCount = sectionCopyWordCount(fitted);
  }
  if (fitted.wordCount > slot.wordBudget.max && fitted.headline) {
    const excess = fitted.wordCount - slot.wordBudget.max;
    fitted.headline = truncateWords(
      fitted.headline,
      Math.max(1, wordCount(fitted.headline) - excess)
    );
    fitted.wordCount = sectionCopyWordCount(fitted);
  }
  if (fitted.wordCount > slot.wordBudget.max || !fitted.headline || !fitted.body) {
    return undefined;
  }

  if (fitted.wordCount < slot.wordBudget.min) {
    const missingWords = slot.wordBudget.min - fitted.wordCount;
    fitted.body = `${fitted.body} ${decisionPrompt(missingWords)}`;
    fitted.wordCount = sectionCopyWordCount(fitted);
  }

  return fitted.wordCount <= slot.wordBudget.max ? fitted : undefined;
}

function currentClaimsForSlot(
  slot: SectionWriterSlot,
  input: SectionWriterInput
): SectionEvidenceClaim[] {
  const currentClaims = new Map(
    input.evidence
      .filter((claim) => claim.revision === input.revision)
      .map((claim) => [claim.id, claim])
  );
  return slot.evidenceRefs.flatMap((ref) => {
    const claim = currentClaims.get(ref);
    return claim ? [claim] : [];
  });
}

function buildCandidate(
  slot: SectionWriterSlot,
  claims: readonly SectionEvidenceClaim[],
  input: SectionWriterInput
): SectionCopyCandidate | undefined {
  const safeClaims = claims
    .map((claim) => ({ claim, text: normalizeCopy(claim.text) }))
    .filter(
      (item): item is { claim: SectionEvidenceClaim; text: string } =>
        item.text !== undefined
    );
  if (safeClaims.length === 0) return undefined;
  const promise = normalizeCopy(input.brief.promise) ?? safeClaims[0]?.text;
  if (!promise) return undefined;

  const audience = normalizeCopy(input.brief.audience);
  const claimText = unique(
    safeClaims
      .map(({ text }) => text)
      .filter(
        (text) =>
          text.toLocaleLowerCase() !== promise.toLocaleLowerCase() &&
          text.toLocaleLowerCase() !== audience?.toLocaleLowerCase()
      )
  ).join(" ");
  const body =
    claimText ||
    "Assess the evidence against your priorities, then decide what needs validation next.";
  const ctaLabel = normalizeCopy(input.cta.label);
  const evidenceRefs = unique(safeClaims.map(({ claim }) => claim.id));

  return fitCandidateToBudget(
    {
      sectionId: slot.id,
      role: "hero",
      status: "complete",
      ...(audience ? { eyebrow: audience } : {}),
      headline: promise,
      body,
      ...(ctaLabel ? { cta: { type: input.cta.type, label: ctaLabel } } : {}),
      evidenceRefs,
      wordCount: 0
    },
    slot
  );
}

function failedArtifact(
  input: SectionWriterInput,
  errorCode: string
): SectionWriterArtifact {
  return {
    worker: "opening-writer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: "failed",
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCode
  };
}

/**
 * Writes only current-revision hero slots. No media, markup, or styling is
 * emitted, so typographic and no-image composition choices remain unchanged.
 */
export function writeOpeningSections(
  input: SectionWriterInput
): SectionWriterArtifact {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failedArtifact(input, "invalid_opening_writer_revision");
  }
  if (input.revision !== input.activeRevision) {
    return {
      worker: "opening-writer",
      sessionId: input.sessionId,
      revision: input.revision,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorCode: "opening_writer_stale_revision"
    };
  }
  if (input.worker !== "opening-writer") {
    return failedArtifact(input, "opening_writer_worker_mismatch");
  }

  const heroSlots = input.slots.filter((slot) => slot.role === "hero");
  if (
    heroSlots.some(
      ({ wordBudget }) =>
        !Number.isSafeInteger(wordBudget.min) ||
        !Number.isSafeInteger(wordBudget.max) ||
        wordBudget.min < 2 ||
        wordBudget.min > wordBudget.max
    )
  ) {
    return failedArtifact(input, "invalid_opening_writer_word_budget");
  }

  const candidates: SectionCopyCandidate[] = [];
  let omittedOptionalSlot = false;
  let ignoredInvalidRef = false;
  for (const slot of heroSlots) {
    const claims = currentClaimsForSlot(slot, input);
    if (claims.length !== slot.evidenceRefs.length) ignoredInvalidRef = true;

    if (claims.length === 0) {
      if (slot.required) {
        return failedArtifact(input, "opening_writer_required_evidence_missing");
      }
      omittedOptionalSlot = true;
      candidates.push({
        sectionId: slot.id,
        role: "hero",
        status: "omitted",
        evidenceRefs: [],
        wordCount: 0,
        omissionReason: "no_current_evidence"
      });
      continue;
    }

    const candidate = buildCandidate(slot, claims, input);
    if (!candidate) {
      if (slot.required) {
        return failedArtifact(input, "opening_writer_safe_copy_unavailable");
      }
      omittedOptionalSlot = true;
      candidates.push({
        sectionId: slot.id,
        role: "hero",
        status: "omitted",
        evidenceRefs: [],
        wordCount: 0,
        omissionReason: "unsupported_optional_slot"
      });
      continue;
    }

    const issues = validateSectionCopyCandidate(
      candidate,
      slot,
      input.revision,
      input.evidence
    );
    if (issues.length > 0) {
      return failedArtifact(input, `opening_writer_invalid_candidate:${issues.join(",")}`);
    }
    candidates.push(candidate);
  }

  const evidenceRefs = unique(candidates.flatMap((candidate) => candidate.evidenceRefs));
  const confidenceById = new Map(
    input.evidence
      .filter((claim) => claim.revision === input.revision)
      .map((claim) => [claim.id, boundedConfidence(claim.confidence)])
  );
  const confidence =
    evidenceRefs.length > 0
      ? Math.min(...evidenceRefs.map((ref) => confidenceById.get(ref) ?? 0))
      : 0;
  const fallbackCode = ignoredInvalidRef
    ? "opening_writer_invalid_evidence_refs_ignored"
    : omittedOptionalSlot
      ? "opening_writer_optional_slot_omitted"
      : undefined;

  return {
    worker: "opening-writer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: fallbackCode ? "fallback" : "complete",
    value: candidates,
    evidenceRefs,
    confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(fallbackCode ? { fallbackCode } : {})
  };
}
