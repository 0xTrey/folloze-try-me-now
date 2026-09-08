import {
  copyContractMetadata,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import { evidenceChoiceCandidate } from "./evidence-choice-copy";
import type { WireframeSectionRole } from "@/lib/generation/wireframe-library";

const ownedRoles = new Set<WireframeSectionRole>([
  "pathways",
  "agenda",
  "chapter-navigation",
  "decision-support",
  "resources"
]);

const headlines: Partial<Record<WireframeSectionRole, string>> = {
  pathways: "Capabilities and their scope",
  agenda: "A focused agenda for the session",
  "chapter-navigation": "The ideas in sequence",
  "decision-support": "Capabilities that shape the decision",
  resources: "Continue with the source material"
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function candidateForSlot(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): { candidate: SectionCopyCandidate; sparse: boolean } {
  const allowed = new Set(slot.evidenceRefs);
  const claims = input.evidence.filter((claim) =>
    claim.revision === input.revision && allowed.has(claim.id) && claim.sourceRole !== "visitor");
  const headline = slot.v2Role === "priority-paths" && input.brief.targetName
    ? `Priorities for ${input.brief.targetName}`
    : headlines[slot.role] ?? "Capabilities and their scope";
  const candidate = evidenceChoiceCandidate({ slot, claims, headline });
  if (candidate) return { candidate, sparse: false };
  return {
    candidate: { sectionId: slot.id, role: slot.role, ...copyContractMetadata(slot), status: "omitted",
      evidenceRefs: [], wordCount: 0,
      omissionReason: slot.required ? "no_current_evidence" : "unsupported_optional_slot" },
    sparse: true
  };
}

function failedArtifact(
  input: SectionWriterInput,
  status: "failed" | "stale",
  errorCode: string
): SectionWriterArtifact {
  return {
    worker: "exploration-writer",
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

function invalidSlotRefs(input: SectionWriterInput, slots: readonly SectionWriterSlot[]): boolean {
  const currentIds = new Set(
    input.evidence
      .filter(({ revision }) => revision === input.revision)
      .map(({ id }) => id)
  );
  return slots.some((slot) =>
    slot.evidenceRefs.some((evidenceRef) => !currentIds.has(evidenceRef))
  );
}

/**
 * Writes only exploration-owned section slots. Every choice is revision-bound,
 * evidence-referenced when evidence exists, and constrained by the selected slot.
 */
export function writeExplorationSections(input: SectionWriterInput): SectionWriterArtifact {
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    input.worker !== "exploration-writer"
  ) {
    return failedArtifact(input, "failed", "invalid_exploration_writer_input");
  }
  if (input.revision !== input.activeRevision) {
    return failedArtifact(input, "stale", "exploration_writer_stale_revision");
  }

  const slots = input.slots.filter((slot) => ownedRoles.has(slot.role));
  if (new Set(slots.map(({ id }) => id)).size !== slots.length) {
    return failedArtifact(input, "failed", "exploration_writer_duplicate_slot");
  }
  if (invalidSlotRefs(input, slots)) {
    return failedArtifact(input, "failed", "exploration_writer_invalid_evidence_ref");
  }

  const written = slots.map((slot) => ({
    slot,
    ...candidateForSlot(input, slot)
  }));
  if (written.some(({ candidate }) => candidate === undefined)) {
    return failedArtifact(input, "failed", "exploration_writer_word_budget");
  }

  const candidates = written.map(({ candidate }) => candidate!);
  const hasValidationIssue = candidates.some((candidate, index) => {
    const slot = written[index]!.slot;
    const choiceRefs = candidate.choices?.flatMap((choice) => choice.evidenceRefs) ?? [];
    const currentIds = new Set(
      input.evidence
        .filter(({ revision }) => revision === input.revision)
        .map(({ id }) => id)
    );
    return (
      choiceRefs.some((ref) => !currentIds.has(ref) || !slot.evidenceRefs.includes(ref)) ||
      validateSectionCopyCandidate(candidate, slot, input.revision, input.evidence)
        .some((issue) => issue !== "required_section_omitted")
    );
  });
  if (hasValidationIssue) {
    return failedArtifact(input, "failed", "exploration_writer_invalid_candidate");
  }

  const evidenceRefs = unique(candidates.flatMap((candidate) => candidate.evidenceRefs));
  const confidenceValues = input.evidence
    .filter(
      ({ id, revision }) =>
        revision === input.revision && evidenceRefs.includes(id)
    )
    .map(({ confidence }) =>
      Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0
    );
  const sparse = written.some((item) => item.sparse);
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) /
      confidenceValues.length
    : 0;

  return {
    worker: "exploration-writer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: sparse ? "fallback" : "complete",
    value: candidates,
    evidenceRefs,
    confidence: sparse ? Math.min(confidence, 0.55) : confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(sparse
      ? { fallbackCode: "exploration_writer_sparse_evidence" }
      : {})
  };
}
