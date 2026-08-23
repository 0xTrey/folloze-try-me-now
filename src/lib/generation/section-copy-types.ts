import type { WireframeSectionRole } from "@/lib/generation/wireframe-library";
import {
  ctaIdsV2,
  type ClaimTypeV2,
  type CtaIdV2,
  type SectionRoleV2,
  type SectionSlotV2,
  type WireframeFamilyV2
} from "@/lib/generation/three-family-contract";
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
  family?: WireframeFamilyV2;
  v2Role?: SectionRoleV2;
  claimType?: ClaimTypeV2;
  label: string;
  wordBudget: {
    min: number;
    max: number;
  };
  headlineWordBudget?: {
    min: number;
    max: number;
  };
  componentSlots: readonly string[];
  allowedInteractions: readonly string[];
  evidenceRefs: readonly string[];
  allowedCtas?: readonly CtaIdV2[];
  spineOrder?: number;
  required: boolean;
}

export interface SectionWriterBrief {
  family?: WireframeFamilyV2;
  sellerName?: string;
  targetName?: string;
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
    id?: CtaIdV2;
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
  family?: WireframeFamilyV2;
  v2Role?: SectionRoleV2;
  claimType?: ClaimTypeV2;
  status: "complete" | "omitted";
  eyebrow?: string;
  headline?: string;
  body?: string;
  choices?: readonly [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice];
  cta?: {
    type: CtaType;
    label: string;
    id?: CtaIdV2;
  };
  evidenceRefs: readonly string[];
  wordCount: number;
  omissionReason?: "unsupported_optional_slot" | "no_current_evidence";
}

export type SectionWriterArtifact = ProductionArtifact<readonly SectionCopyCandidate[]>;

export const CTA_LIBRARY_V2 = {
  book_meeting: { label: "Book a meeting", type: "book-meeting" },
  book_working_session: {
    label: "Book a working session",
    type: "book-meeting"
  },
  register: { label: "Register", type: "register" },
  explore_use_case: { label: "Explore the use case", type: "explore" },
  review_evidence: { label: "Review the evidence", type: "explore" },
  plan_validation: {
    label: "Plan a validation session",
    type: "book-meeting"
  }
} as const satisfies Record<CtaIdV2, { label: string; type: CtaType }>;

const V2_WRITER_ROLE: Record<SectionRoleV2, WireframeSectionRole> = {
  "buyer-outcome": "hero",
  "current-friction": "context",
  mechanism: "mechanism",
  "use-cases": "pathways",
  proof: "proof",
  "next-move": "next-action",
  "market-change": "hero",
  stakes: "context",
  "evaluation-criteria": "decision-support",
  "solution-mapping": "mechanism",
  applications: "pathways",
  "evaluation-close": "next-action",
  "shared-priority": "hero",
  "account-relevance": "context",
  "shared-opportunity": "mechanism",
  "priority-paths": "pathways",
  "validation-plan": "proof",
  "first-decision": "next-action",
  "proof-depth": "proof",
  resource: "resources"
};

export function boundedCtaV2(id: CtaIdV2): {
  id: CtaIdV2;
  label: string;
  type: CtaType;
} {
  return { id, ...CTA_LIBRARY_V2[id] };
}

export function isBoundedCtaV2(value: {
  id?: string;
  label: string;
  type: CtaType;
}): boolean {
  if (!value.id || !ctaIdsV2.includes(value.id as CtaIdV2)) return false;
  const bounded = CTA_LIBRARY_V2[value.id as CtaIdV2];
  return bounded.label === value.label.trim() && bounded.type === value.type;
}

/**
 * Adapts a locked V2 slot to the existing bounded writer boundary. The V2 role,
 * claim type, CTA set, word budgets, and reviewed visual/interaction recipe are
 * retained as metadata; writers do not select geometry.
 */
export function adaptSectionSlotV2(
  family: WireframeFamilyV2,
  slot: SectionSlotV2,
  order: number,
  evidenceRefs: readonly string[]
): SectionWriterSlot {
  return {
    id: slot.id,
    role: V2_WRITER_ROLE[slot.role],
    family,
    v2Role: slot.role,
    claimType: slot.claimType,
    label: slot.navigationLabel,
    wordBudget: {
      min: slot.wordBudget.headline[0] + slot.wordBudget.body[0],
      max: slot.wordBudget.headline[1] + slot.wordBudget.body[1]
    },
    headlineWordBudget: {
      min: slot.wordBudget.headline[0],
      max: slot.wordBudget.headline[1]
    },
    componentSlots: [slot.visualRole],
    allowedInteractions: slot.interaction ? [slot.interaction] : [],
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    ...(slot.allowedCtas ? { allowedCtas: [...slot.allowedCtas] } : {}),
    spineOrder: order,
    required: !slot.optional
  };
}

export function copyContractMetadata(
  slot: SectionWriterSlot
): Pick<SectionCopyCandidate, "family" | "v2Role" | "claimType"> {
  return {
    ...(slot.family ? { family: slot.family } : {}),
    ...(slot.v2Role ? { v2Role: slot.v2Role } : {}),
    ...(slot.claimType ? { claimType: slot.claimType } : {})
  };
}

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
  if (
    slot.family &&
    (candidate.family !== slot.family ||
      candidate.v2Role !== slot.v2Role ||
      candidate.claimType !== slot.claimType)
  ) {
    issues.push("v2_contract_mismatch");
  }
  if (candidate.status === "omitted") {
    if (slot.required) issues.push("required_section_omitted");
    if (!candidate.omissionReason) issues.push("missing_omission_reason");
    return issues;
  }
  if (!candidate.headline?.trim() || !candidate.body?.trim()) {
    issues.push("missing_section_copy");
  }
  const headlineWords = textWordCount(candidate.headline);
  if (
    slot.headlineWordBudget &&
    (headlineWords < slot.headlineWordBudget.min ||
      headlineWords > slot.headlineWordBudget.max)
  ) {
    issues.push("headline_word_budget_violation");
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
    slot.claimType === "fact" &&
    candidate.evidenceRefs.length === 0
  ) {
    issues.push("fact_without_evidence");
  }
  if (slot.allowedCtas && candidate.cta) {
    if (
      !candidate.cta.id ||
      !slot.allowedCtas.includes(candidate.cta.id) ||
      !isBoundedCtaV2(candidate.cta)
    ) {
      issues.push("unbounded_cta");
    }
  }
  if (
    candidate.choices &&
    new Set(candidate.choices.map(({ label }) => label.trim().toLocaleLowerCase())).size !== 3
  ) {
    issues.push("duplicate_choices");
  }
  return issues;
}
