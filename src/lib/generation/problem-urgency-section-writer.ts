import {
  copyContractMetadata,
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

const WORKER = "problem-urgency-writer" as const;

const neutralReviewLanguage = [
  "Compare the available evidence with the stated objective.",
  "Separate supported points from questions that still need validation.",
  "Assess fit before choosing a next step.",
  "Use the cited facts as the boundary for the discussion.",
  "Treat unknowns as questions rather than assumptions.",
  "Keep the review focused on the buyer's stated decision.",
  "Identify what the evidence can establish and what remains open."
].join(" ");

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function plainText(value: string | undefined): string {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return value.trim() ? value.trim().split(/\s+/) : [];
}

function failedArtifact(
  input: SectionWriterInput,
  status: "failed" | "stale",
  errorCode: string
): SectionWriterArtifact {
  return {
    worker: WORKER,
    sessionId: input.sessionId,
    revision: input.revision,
    status,
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCode
  };
}

function validWordBudget(slot: SectionWriterSlot): boolean {
  return (
    Number.isSafeInteger(slot.wordBudget.min) &&
    Number.isSafeInteger(slot.wordBudget.max) &&
    slot.wordBudget.min >= 2 &&
    slot.wordBudget.max >= slot.wordBudget.min
  );
}

function headlineFor(
  hasTension: boolean,
  hasWhyNow: boolean,
  maxWords: number
): string {
  const options = hasTension
    ? hasWhyNow
      ? ["The constraint and its timing", "Why this matters", "The constraint", "Context"]
      : ["The constraint worth evaluating", "The constraint", "Context"]
    : hasWhyNow
      ? ["Why this merits attention now", "Why now", "Context"]
      : ["What to evaluate next", "What to evaluate", "Evaluate", "Context"];

  return options.find((option) => words(option).length <= maxWords) ?? "Context";
}

function headlineForSlot(
  slot: SectionWriterSlot,
  hasTension: boolean,
  hasWhyNow: boolean
): string {
  if (slot.v2Role === "current-friction") {
    return "Why the current approach creates avoidable friction";
  }
  if (slot.v2Role === "stakes") {
    return "What is at stake in this decision";
  }
  if (slot.v2Role === "account-relevance") {
    return "Why this priority matters for your team";
  }
  return headlineFor(hasTension, hasWhyNow, slot.wordBudget.max - 1);
}

function bodyFor(seed: string, targetWords: number): string {
  const seedWords = words(seed);
  const fillerWords = words(neutralReviewLanguage);
  const result = seedWords.slice(0, targetWords);
  let fillerIndex = 0;

  while (result.length < targetWords) {
    result.push(fillerWords[fillerIndex % fillerWords.length]!);
    fillerIndex += 1;
  }

  const body = result.join(" ").replace(/[,:;]$/, "");
  return /[.!?]$/.test(body) ? body : `${body}.`;
}

function completeCandidate(
  slot: SectionWriterSlot,
  input: SectionWriterInput,
  evidenceRefs: readonly string[],
  supportedContext: boolean
): SectionCopyCandidate {
  const tension = supportedContext ? plainText(input.brief.tension) : "";
  const whyNow = supportedContext ? plainText(input.brief.whyNow) : "";
  const headline = headlineForSlot(slot, Boolean(tension), Boolean(whyNow));
  const headlineWords = words(headline).length;
  const bodyCapacity = slot.wordBudget.max - headlineWords;
  const seed = supportedContext
    ? unique([tension, whyNow]).join(" ")
    : neutralReviewLanguage;
  const seedWordCount = words(seed).length;
  const bodyWordCount = Math.min(
    bodyCapacity,
    Math.max(1, slot.wordBudget.min - headlineWords, seedWordCount)
  );
  const candidate: SectionCopyCandidate = {
    sectionId: slot.id,
    role: "context",
    ...copyContractMetadata(slot),
    status: "complete",
    headline,
    body: bodyFor(seed || neutralReviewLanguage, bodyWordCount),
    evidenceRefs: [...evidenceRefs],
    wordCount: 0
  };
  candidate.wordCount = sectionCopyWordCount(candidate);
  return candidate;
}

/**
 * Writes only context slots. Optional unsupported context is explicitly
 * omitted; required context falls back to neutral evaluation framing.
 */
export function writeProblemUrgencySections(
  input: SectionWriterInput
): SectionWriterArtifact {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failedArtifact(input, "failed", "invalid_problem_urgency_revision");
  }
  if (input.revision !== input.activeRevision) {
    return failedArtifact(input, "stale", "problem_urgency_stale_revision");
  }
  if (input.worker !== WORKER) {
    return failedArtifact(input, "failed", "problem_urgency_worker_mismatch");
  }

  const slots = input.slots.filter((slot) => slot.role === "context");
  if (slots.some((slot) => !validWordBudget(slot))) {
    return failedArtifact(input, "failed", "problem_urgency_invalid_word_budget");
  }

  const currentEvidence = new Map(
    input.evidence
      .filter((claim) => claim.revision === input.revision)
      .map((claim) => [claim.id, claim] as const)
  );
  const hasContextBrief = Boolean(
    plainText(input.brief.tension) || plainText(input.brief.whyNow)
  );
  let usedNeutralFallback = false;
  const candidates = slots.map((slot): SectionCopyCandidate => {
    const validRefs = unique(
      slot.evidenceRefs.filter((evidenceRef) => currentEvidence.has(evidenceRef))
    );
    const supportedContext = hasContextBrief && validRefs.length > 0;

    if (!supportedContext && !slot.required) {
      return {
        sectionId: slot.id,
        role: "context",
        ...copyContractMetadata(slot),
        status: "omitted",
        evidenceRefs: [],
        wordCount: 0,
        omissionReason: hasContextBrief
          ? "no_current_evidence"
          : "unsupported_optional_slot"
      };
    }

    usedNeutralFallback ||= !supportedContext;
    return completeCandidate(
      slot,
      input,
      supportedContext ? validRefs : [],
      supportedContext
    );
  });

  const validationIssues = candidates.flatMap((candidate, index) =>
    validateSectionCopyCandidate(
      candidate,
      slots[index]!,
      input.revision,
      input.evidence
    )
  );
  if (validationIssues.length > 0) {
    return failedArtifact(input, "failed", "problem_urgency_invalid_candidate");
  }

  const evidenceRefs = unique(
    candidates.flatMap((candidate) => candidate.evidenceRefs)
  );
  const supportingClaims = evidenceRefs
    .map((evidenceRef) => currentEvidence.get(evidenceRef))
    .filter((claim): claim is SectionEvidenceClaim => claim !== undefined);
  const confidence =
    supportingClaims.length > 0
      ? Math.min(...supportingClaims.map((claim) => boundedConfidence(claim.confidence)))
      : 0;

  return {
    worker: WORKER,
    sessionId: input.sessionId,
    revision: input.revision,
    status: usedNeutralFallback ? "fallback" : "complete",
    value: candidates,
    evidenceRefs,
    confidence: usedNeutralFallback ? Math.min(confidence, 0.55) : confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(usedNeutralFallback
      ? { fallbackCode: "problem_urgency_required_context_neutral" }
      : {})
  };
}
