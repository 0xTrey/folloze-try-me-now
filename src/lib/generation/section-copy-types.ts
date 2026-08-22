import type { WireframeSectionRole } from "@/lib/generation/wireframe-library";
import type { ProductionArtifact, ProductionWorkerKind } from "@/lib/orchestration/worker-types";
import type { CtaType } from "@/lib/types";

export type SectionWriterKind = Extract<
  ProductionWorkerKind,
  | "opening-writer"
  | "problem-urgency-writer"
  | "exploration-writer"
  | "mechanism-proof-writer"
  | "team-cta-writer"
>;

export interface SectionEvidenceClaim {
  id: string;
  text: string;
  confidence: number;
  revision: number;
  sourceRole: "visitor" | "seller" | "target" | "offer" | "source";
}

export interface SectionWriterSlot {
  id: string;
  role: WireframeSectionRole;
  label: string;
  wordBudget: {
    min: number;
    max: number;
  };
  componentSlots: readonly string[];
  allowedInteractions: readonly string[];
  evidenceRefs: readonly string[];
  required: boolean;
}

export interface SectionWriterBrief {
  audience: string;
  promise: string;
  mechanism: string;
  proofPlan: string;
  decisionHelp: string;
  nextAction: string;
  tension?: string;
  whyNow?: string;
  unknowns: readonly string[];
}

export interface SectionWriterInput {
  worker: SectionWriterKind;
  sessionId: string;
  revision: number;
  activeRevision: number;
  startedAt: string;
  completedAt: string;
  slots: readonly SectionWriterSlot[];
  brief: SectionWriterBrief;
  evidence: readonly SectionEvidenceClaim[];
  objective: string;
  cta: {
    type: CtaType;
    label: string;
  };
}

export interface SectionCopyChoice {
  label: string;
  body: string;
  evidenceRefs: readonly string[];
}

export interface SectionCopyCandidate {
  sectionId: string;
  role: WireframeSectionRole;
  status: "complete" | "omitted";
  eyebrow?: string;
  headline?: string;
  body?: string;
  choices?: readonly [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice];
  cta?: {
    type: CtaType;
    label: string;
  };
  evidenceRefs: readonly string[];
  wordCount: number;
  omissionReason?: "unsupported_optional_slot" | "no_current_evidence";
}

export type SectionWriterArtifact = ProductionArtifact<readonly SectionCopyCandidate[]>;

function textWordCount(value: string | undefined): number {
  return value?.trim() ? value.trim().split(/\s+/).length : 0;
}

export function sectionCopyWordCount(candidate: SectionCopyCandidate): number {
  return (
    textWordCount(candidate.eyebrow) +
    textWordCount(candidate.headline) +
    textWordCount(candidate.body) +
    (candidate.choices ?? []).reduce(
      (sum, choice) => sum + textWordCount(choice.label) + textWordCount(choice.body),
      0
    ) +
    textWordCount(candidate.cta?.label)
  );
}

export function validateSectionCopyCandidate(
  candidate: SectionCopyCandidate,
  slot: SectionWriterSlot,
  revision: number,
  evidence: readonly SectionEvidenceClaim[]
): string[] {
  const issues: string[] = [];
  const currentEvidenceIds = new Set(
    evidence.filter((claim) => claim.revision === revision).map(({ id }) => id)
  );
  if (candidate.sectionId !== slot.id || candidate.role !== slot.role) {
    issues.push("slot_mismatch");
  }
  if (candidate.status === "omitted") {
    if (slot.required) issues.push("required_section_omitted");
    if (!candidate.omissionReason) issues.push("missing_omission_reason");
    return issues;
  }
  if (!candidate.headline?.trim() || !candidate.body?.trim()) {
    issues.push("missing_section_copy");
  }
  if (
    candidate.wordCount !== sectionCopyWordCount(candidate) ||
    candidate.wordCount < slot.wordBudget.min ||
    candidate.wordCount > slot.wordBudget.max
  ) {
    issues.push("word_budget_violation");
  }
  if (candidate.evidenceRefs.some((id) => !currentEvidenceIds.has(id))) {
    issues.push("invalid_evidence_ref");
  }
  if (
    candidate.choices &&
    new Set(candidate.choices.map(({ label }) => label.trim().toLocaleLowerCase())).size !== 3
  ) {
    issues.push("duplicate_choices");
  }
  return issues;
}
