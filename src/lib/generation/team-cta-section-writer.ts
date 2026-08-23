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
import type { CtaType } from "@/lib/types";

const OWNED_ROLES = new Set(["seller-validation", "next-action"] as const);
const UNSAFE_OUTPUT_PATTERN =
  /<[^>]*>|```|(?:^|\s)(?:className|style|script)\s*=|[{}]/i;
const GUARANTEE_PATTERN = /\bguarantee(?:d|s)?\b/i;

const CTA_ACTION_COPY: Record<CtaType, string> = {
  "book-meeting": "Use the conversation to address the selected objective",
  "contact-sales": "Contact the team to discuss the selected objective",
  register: "Register for the event connected to the selected objective",
  download: "Download the resource connected to the selected objective",
  explore: "Explore the material connected to the selected objective",
  custom: "Use this next step to address the selected objective"
};

const SELLER_PADDING = [
  "Keep unsupported details framed as questions for review.",
  "Separate current evidence from assumptions that still need confirmation.",
  "Record which points require additional source support."
] as const;

const CTA_PADDING = [
  "Review the current evidence and open questions before proceeding.",
  "Keep the scope tied to this objective."
] as const;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return value.trim() ? value.trim().split(/\s+/) : [];
}

function fitBody(
  body: string,
  fixedWordCount: number,
  slot: SectionWriterSlot,
  padding: readonly string[]
): string | undefined {
  const available = slot.wordBudget.max - fixedWordCount;
  const required = Math.max(1, slot.wordBudget.min - fixedWordCount);
  if (available < required) return undefined;

  const bodyWords = words(body);
  for (const sentence of padding) {
    if (bodyWords.length >= required) break;
    bodyWords.push(...words(sentence));
  }
  if (bodyWords.length < required) return undefined;
  return bodyWords.slice(0, available).join(" ");
}

function failedArtifact(
  input: SectionWriterInput,
  status: "failed" | "stale",
  errorCode: string
): SectionWriterArtifact {
  return {
    worker: "team-cta-writer",
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

function omittedCandidate(slot: SectionWriterSlot): SectionCopyCandidate {
  return {
    sectionId: slot.id,
    role: slot.role,
    ...copyContractMetadata(slot),
    status: "omitted",
    evidenceRefs: [],
    wordCount: 0,
    omissionReason: "no_current_evidence"
  };
}

function completeCandidate(
  slot: SectionWriterSlot,
  draft: Omit<SectionCopyCandidate, "sectionId" | "role" | "status" | "wordCount">,
  padding: readonly string[]
): SectionCopyCandidate | undefined {
  const candidateWithoutBody: SectionCopyCandidate = {
    sectionId: slot.id,
    role: slot.role,
    ...copyContractMetadata(slot),
    status: "complete",
    ...draft,
    body: "",
    wordCount: 0
  };
  const fixedWordCount = sectionCopyWordCount(candidateWithoutBody);
  const body = fitBody(draft.body ?? "", fixedWordCount, slot, padding);
  if (!body) return undefined;

  const candidate: SectionCopyCandidate = {
    ...candidateWithoutBody,
    body,
    wordCount: 0
  };
  candidate.wordCount = sectionCopyWordCount(candidate);
  return candidate;
}

function currentClaimsForSlot(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): SectionEvidenceClaim[] {
  const allowedRefs = new Set(slot.evidenceRefs);
  const seen = new Set<string>();
  return input.evidence.filter((claim) => {
    if (
      claim.revision !== input.revision ||
      !allowedRefs.has(claim.id) ||
      seen.has(claim.id)
    ) {
      return false;
    }
    seen.add(claim.id);
    return (
      plainText(claim.text).length > 0 &&
      !UNSAFE_OUTPUT_PATTERN.test(claim.text) &&
      !GUARANTEE_PATTERN.test(claim.text)
    );
  });
}

function sellerValidationCandidate(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): { candidate?: SectionCopyCandidate; usedEvidence: SectionEvidenceClaim[] } {
  const currentClaims = currentClaimsForSlot(input, slot);
  if (currentClaims.length === 0 && !slot.required) {
    return { candidate: omittedCandidate(slot), usedEvidence: [] };
  }

  const supportedPoints = currentClaims
    .slice(0, 3)
    .map((claim) => plainText(claim.text))
    .join(" ");
  const objective = plainText(input.objective);
  const body = supportedPoints
    ? `For ${objective}, review these supported points with the team: ${supportedPoints} Compare each point with the decision criteria and keep unsupported details as questions.`
    : `For ${objective}, review the available evidence, test the stated mechanism, and note what remains unknown. Use the validation questions to decide what the team needs before moving forward.`;
  const candidate = completeCandidate(
    slot,
    {
      eyebrow: "Team validation",
      headline: currentClaims.length > 0
        ? "Evidence the team can review"
        : "Set the validation questions",
      body,
      evidenceRefs: currentClaims.map(({ id }) => id)
    },
    SELLER_PADDING
  );
  return { candidate, usedEvidence: currentClaims };
}

function nextActionCandidate(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): SectionCopyCandidate | undefined {
  const objective = plainText(input.objective);
  const body =
    `${CTA_ACTION_COPY[input.cta.type]}: ${objective}. ` +
    "Bring the current evidence and open questions into the next step.";
  const headline =
    slot.v2Role === "next-move"
      ? "Take the next useful step toward this outcome"
      : slot.v2Role === "evaluation-close"
        ? "Continue the evaluation with a focused working session"
        : slot.v2Role === "first-decision"
          ? "Make the first working decision together"
          : input.cta.label;
  return completeCandidate(
    slot,
    {
      eyebrow: "Next action",
      headline,
      body,
      cta: {
        type: input.cta.type,
        label: input.cta.label,
        ...(input.cta.id ? { id: input.cta.id } : {})
      },
      evidenceRefs: []
    },
    CTA_PADDING
  );
}

/**
 * Writes only seller-validation and next-action slots. Output is fenced to the
 * active revision and contains plain, evidence-bounded copy rather than markup.
 */
export function writeTeamCtaSections(
  input: SectionWriterInput
): SectionWriterArtifact {
  if (input.worker !== "team-cta-writer") {
    return failedArtifact(input, "failed", "team_cta_writer_worker_mismatch");
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failedArtifact(input, "failed", "invalid_team_cta_writer_revision");
  }
  if (input.revision !== input.activeRevision) {
    return failedArtifact(input, "stale", "team_cta_writer_stale_revision");
  }
  if (
    !plainText(input.objective) ||
    !input.cta.label.trim() ||
    UNSAFE_OUTPUT_PATTERN.test(input.objective) ||
    UNSAFE_OUTPUT_PATTERN.test(input.cta.label)
  ) {
    return failedArtifact(input, "failed", "team_cta_writer_invalid_copy_input");
  }

  const ownedSlots = input.slots.filter((slot) => OWNED_ROLES.has(
    slot.role as "seller-validation" | "next-action"
  ));
  if (ownedSlots.length === 0) {
    return failedArtifact(input, "failed", "team_cta_writer_no_owned_slots");
  }
  if (
    new Set(ownedSlots.map(({ id }) => id)).size !== ownedSlots.length ||
    ownedSlots.some(
      ({ wordBudget }) =>
        !Number.isSafeInteger(wordBudget.min) ||
        !Number.isSafeInteger(wordBudget.max) ||
        wordBudget.min < 1 ||
        wordBudget.min > wordBudget.max
    )
  ) {
    return failedArtifact(input, "failed", "team_cta_writer_invalid_slot");
  }

  const candidates: SectionCopyCandidate[] = [];
  const usedEvidence: SectionEvidenceClaim[] = [];
  let usedFallback = false;
  for (const slot of ownedSlots) {
    if (slot.role === "seller-validation") {
      const result = sellerValidationCandidate(input, slot);
      if (!result.candidate) {
        return failedArtifact(input, "failed", "team_cta_writer_word_budget");
      }
      candidates.push(result.candidate);
      usedEvidence.push(...result.usedEvidence);
      usedFallback ||= result.usedEvidence.length === 0;
      continue;
    }

    const candidate = nextActionCandidate(input, slot);
    if (!candidate) {
      return failedArtifact(input, "failed", "team_cta_writer_word_budget");
    }
    candidates.push(candidate);
  }

  const validationIssues = candidates.flatMap((candidate, index) =>
    validateSectionCopyCandidate(
      candidate,
      ownedSlots[index]!,
      input.revision,
      input.evidence
    )
  );
  if (validationIssues.length > 0) {
    return failedArtifact(input, "failed", "team_cta_writer_invalid_candidate");
  }

  const evidenceRefs = unique(
    candidates.flatMap((candidate) => candidate.evidenceRefs)
  );
  const usedClaims = unique(usedEvidence.map(({ id }) => id))
    .map((id) => usedEvidence.find((claim) => claim.id === id)!)
    .filter(Boolean);
  const confidence =
    usedClaims.length > 0
      ? Math.min(...usedClaims.map(({ confidence }) => boundedConfidence(confidence)))
      : usedFallback
        ? 0.45
        : 0.6;

  return {
    worker: "team-cta-writer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: usedFallback ? "fallback" : "complete",
    value: candidates,
    evidenceRefs,
    confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(usedFallback
      ? { fallbackCode: "team_cta_writer_sparse_evidence" }
      : {})
  };
}
