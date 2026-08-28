import type { UseCase } from "@/lib/types";
import type {
  WireframeAllowedInteraction,
  WireframeComponentSlot,
  WireframeSectionRole,
  WireframeSelectionV1
} from "@/lib/generation/wireframe-library";

export const wireframeFamiliesV2 = ["launch", "guide", "align"] as const;
export const experienceSubtypesV2 = [
  "product",
  "offer",
  "solution",
  "industry",
  "event",
  "webinar",
  "account"
] as const;
export const ctaIdsV2 = [
  "book_meeting",
  "book_working_session",
  "register",
  "explore_use_case",
  "download_resource",
  "review_evidence",
  "plan_validation"
] as const;

export type WireframeFamilyV2 = (typeof wireframeFamiliesV2)[number];
export type ExperienceSubtypeV2 = (typeof experienceSubtypesV2)[number];
export type CtaIdV2 = (typeof ctaIdsV2)[number];
export type EvidenceKindV2 =
  | "seller_fact"
  | "target_fact"
  | "offer"
  | "audience"
  | "proof"
  | "brand"
  | "asset"
  | "visitor_input"
  | "third_party_context";
export type ClaimTypeV2 = "fact" | "implication" | "hypothesis" | "instruction";
export type SectionRoleV2 =
  | "buyer-outcome"
  | "current-friction"
  | "mechanism"
  | "use-cases"
  | "proof"
  | "next-move"
  | "market-change"
  | "stakes"
  | "evaluation-criteria"
  | "solution-mapping"
  | "applications"
  | "evaluation-close"
  | "shared-priority"
  | "account-relevance"
  | "shared-opportunity"
  | "priority-paths"
  | "validation-plan"
  | "first-decision"
  | "proof-depth"
  | "resource";
export type VisualRoleV2 =
  | "hero-image-or-type"
  | "evidence-type"
  | "workflow"
  | "path-selector"
  | "proof-artifact"
  | "cta-panel"
  | "criteria"
  | "scenario-map"
  | "account-observations";
export type InteractionRoleV2 = "select-path" | "reveal-evidence" | "anchor-navigation";

export interface SectionSlotV2 {
  id: string;
  role: SectionRoleV2;
  navigationLabel: string;
  buyerJob: string;
  claimType: ClaimTypeV2;
  requiredEvidenceKinds: EvidenceKindV2[];
  optional: boolean;
  wordBudget: {
    headline: readonly [number, number];
    body: readonly [number, number];
  };
  visualRole: VisualRoleV2;
  interaction?: InteractionRoleV2;
  allowedCtas?: CtaIdV2[];
}

export interface WireframeFactorV2 {
  code:
    | "registration-intent"
    | "promotion-intent"
    | "education-intent"
    | "named-account"
    | "first-decision"
    | "proof-density"
    | "asset-inventory";
  weight: number;
  evidenceRefs: string[];
}

export interface WireframeDecisionV2 {
  version: 2;
  sessionId: string;
  revision: number;
  family: WireframeFamilyV2;
  subtype: ExperienceSubtypeV2;
  confidence: "high" | "medium" | "low";
  factors: readonly WireframeFactorV2[];
  evidenceRefs: readonly string[];
  sectionPlan: readonly SectionSlotV2[];
  reasonCode: string;
  locked: true;
}

export interface ThreeFamilySelectionInput {
  sessionId: string;
  revision: number;
  useCase: UseCase;
  campaignType?: "product" | "solution" | "demand" | "event";
  eventSubtype?: "event" | "webinar";
  intent?: string;
  offerKind?: "product" | "offer" | "solution" | "industry" | "event" | "webinar";
  targetDomain?: string;
  firstDecision?: string;
  proofEvidenceRefs?: readonly string[];
  assetEvidenceRefs?: readonly string[];
  evidenceRefs?: readonly string[];
  includeProofDepth?: boolean;
  includeResource?: boolean;
}

const headlineBudget = [5, 12] as const;
const bodyBudget = [25, 60] as const;

function slot(
  family: WireframeFamilyV2,
  index: number,
  role: SectionRoleV2,
  navigationLabel: string,
  buyerJob: string,
  claimType: ClaimTypeV2,
  requiredEvidenceKinds: EvidenceKindV2[],
  visualRole: VisualRoleV2,
  options: {
    interaction?: InteractionRoleV2;
    allowedCtas?: CtaIdV2[];
    optional?: boolean;
  } = {}
): SectionSlotV2 {
  return {
    id: `${family}-${index}`,
    role,
    navigationLabel,
    buyerJob,
    claimType,
    requiredEvidenceKinds,
    optional: options.optional ?? false,
    wordBudget: { headline: headlineBudget, body: bodyBudget },
    visualRole,
    ...(options.interaction ? { interaction: options.interaction } : {}),
    ...(options.allowedCtas ? { allowedCtas: options.allowedCtas } : {})
  };
}

const defaultPlans: Record<WireframeFamilyV2, readonly SectionSlotV2[]> = {
  launch: [
    slot("launch", 1, "buyer-outcome", "Outcome", "Understand the promoted change", "implication", ["offer", "audience"], "hero-image-or-type", {
      allowedCtas: ["book_meeting", "register"]
    }),
    slot("launch", 2, "current-friction", "Why change", "Recognize the current friction", "implication", ["offer"], "evidence-type"),
    slot("launch", 3, "mechanism", "How it works", "Understand how the offer works", "fact", ["offer"], "workflow"),
    slot("launch", 4, "use-cases", "Use cases", "Choose a relevant buyer job", "implication", ["audience", "offer"], "path-selector", {
      interaction: "select-path"
    }),
    slot("launch", 5, "proof", "Evidence", "Judge reasons to believe", "fact", ["proof"], "proof-artifact"),
    slot("launch", 6, "next-move", "Next step", "Take one bounded next action", "instruction", ["visitor_input"], "cta-panel", {
      allowedCtas: ["book_meeting", "register", "explore_use_case", "download_resource", "review_evidence"]
    })
  ],
  guide: [
    slot("guide", 1, "market-change", "What changed", "Understand the decision change", "implication", ["seller_fact", "offer"], "hero-image-or-type", {
      allowedCtas: ["book_working_session"]
    }),
    slot("guide", 2, "stakes", "What is at stake", "Connect consequences to buyer questions", "implication", ["audience", "offer"], "evidence-type"),
    slot("guide", 3, "evaluation-criteria", "What to evaluate", "Use observable evaluation criteria", "instruction", ["offer"], "criteria"),
    slot("guide", 4, "solution-mapping", "How it answers", "Map criteria to supported capability", "fact", ["offer"], "workflow"),
    slot("guide", 5, "applications", "Where it applies", "Locate a relevant trigger and decision", "implication", ["audience", "offer"], "scenario-map", {
      interaction: "select-path"
    }),
    slot("guide", 6, "evaluation-close", "Continue", "Continue with evidence and a working session", "instruction", ["visitor_input"], "cta-panel", {
      allowedCtas: ["book_working_session", "download_resource", "review_evidence"]
    })
  ],
  align: [
    slot("align", 1, "shared-priority", "Shared priority", "Understand the account-specific hypothesis", "hypothesis", ["target_fact", "offer"], "hero-image-or-type", {
      allowedCtas: ["book_working_session", "download_resource", "plan_validation"]
    }),
    slot("align", 2, "account-relevance", "Why it matters here", "Separate public observation from implication", "implication", ["target_fact", "offer"], "account-observations"),
    slot("align", 3, "shared-opportunity", "Opportunity", "See practical workstreams and outputs", "hypothesis", ["target_fact", "offer"], "workflow"),
    slot("align", 4, "priority-paths", "Choose a priority", "Choose a target-specific validation path", "hypothesis", ["target_fact", "audience"], "path-selector", {
      interaction: "select-path"
    }),
    slot("align", 5, "validation-plan", "Proof and validation", "Judge relevant proof or a validation plan", "instruction", ["proof", "offer"], "proof-artifact"),
    slot("align", 6, "first-decision", "First decision", "Define the first working decision", "instruction", ["visitor_input"], "cta-panel", {
      allowedCtas: ["book_working_session", "plan_validation"]
    })
  ]
};

export function defaultSectionPlanV2(
  family: WireframeFamilyV2,
  options: { includeProofDepth?: boolean; includeResource?: boolean } = {}
): SectionSlotV2[] {
  const sections: SectionSlotV2[] = defaultPlans[family].map((section) => ({
    ...section,
    requiredEvidenceKinds: [...section.requiredEvidenceKinds],
    wordBudget: {
      headline: [...section.wordBudget.headline] as [number, number],
      body: [...section.wordBudget.body] as [number, number]
    },
    ...(section.allowedCtas ? { allowedCtas: [...section.allowedCtas] } : {})
  }));
  if (options.includeProofDepth) {
    sections.splice(
      sections.length - 1,
      0,
      slot(family, 7, "proof-depth", "More evidence", "Inspect additional relevant proof", "fact", ["proof"], "proof-artifact", {
        optional: true,
        allowedCtas: ["review_evidence"]
      })
    );
  }
  if (options.includeResource) {
    sections.splice(
      sections.length - 1,
      0,
      slot(family, 8, "resource", "Resources", "Answer a material question with a verified resource", "fact", ["proof"], "proof-artifact", {
        optional: true,
        allowedCtas: ["review_evidence"]
      })
    );
  }
  return sections.slice(0, 8);
}

function normalizedIntent(input: ThreeFamilySelectionInput): string {
  return `${input.intent ?? ""} ${input.firstDecision ?? ""}`.trim().toLocaleLowerCase();
}

function subtypeFor(input: ThreeFamilySelectionInput, family: WireframeFamilyV2): ExperienceSubtypeV2 {
  if (input.eventSubtype) return input.eventSubtype;
  if (
    input.campaignType === "event" ||
    input.offerKind === "event" ||
    input.offerKind === "webinar" ||
    /\b(?:event|webinar|register|registration|attend|rsvp)\b/i.test(input.intent ?? "")
  ) {
    return input.offerKind === "webinar" || /\bwebinar\b/i.test(input.intent ?? "")
      ? "webinar"
      : "event";
  }
  if (family === "align") return "account";
  if (input.offerKind) return input.offerKind;
  if (input.campaignType === "product") return "product";
  if (input.campaignType === "solution") return "solution";
  return family === "guide" ? "solution" : "offer";
}

function factor(
  code: WireframeFactorV2["code"],
  weight: number,
  evidenceRefs: readonly string[] = []
): WireframeFactorV2 {
  return { code, weight, evidenceRefs: [...evidenceRefs].sort() };
}

export function selectThreeFamilyDecision(
  input: ThreeFamilySelectionInput
): WireframeDecisionV2 {
  const intent = normalizedIntent(input);
  const eventIntent =
    input.campaignType === "event" ||
    input.offerKind === "event" ||
    input.offerKind === "webinar" ||
    /\b(?:event|webinar|register|registration|attend|rsvp)\b/.test(intent);
  const namedAccount = input.useCase === "abm" || Boolean(input.targetDomain?.trim());
  const promotionalIntent =
    input.campaignType === "product" ||
    input.offerKind === "product" ||
    input.offerKind === "offer";
  const educationalIntent =
    input.useCase === "content" ||
    input.campaignType === "solution" ||
    input.offerKind === "solution" ||
    input.offerKind === "industry" ||
    /\b(?:educat|evaluat|guide|category|industry|criteria|learn)\w*\b/.test(intent);
  const factors: WireframeFactorV2[] = [];
  let family: WireframeFamilyV2;
  let reasonCode: string;

  if (eventIntent) {
    family = "launch";
    reasonCode = "v2-event-registration-launch";
    factors.push(factor("registration-intent", 100, input.evidenceRefs));
  } else if (namedAccount) {
    family = "align";
    reasonCode = input.firstDecision
      ? "v2-named-account-first-decision-align"
      : "v2-named-account-align";
    factors.push(factor("named-account", 90, input.evidenceRefs));
    if (input.firstDecision) factors.push(factor("first-decision", 20, input.evidenceRefs));
  } else if (promotionalIntent) {
    family = "launch";
    reasonCode = "v2-offer-promotion-launch";
    factors.push(factor("promotion-intent", 85, input.evidenceRefs));
  } else if (educationalIntent) {
    family = "guide";
    reasonCode = "v2-education-evaluation-guide";
    factors.push(factor("education-intent", 80, input.evidenceRefs));
  } else {
    family = "launch";
    reasonCode = "v2-offer-promotion-launch";
    factors.push(factor("promotion-intent", 70, input.evidenceRefs));
  }

  if (input.proofEvidenceRefs?.length) {
    factors.push(factor("proof-density", input.proofEvidenceRefs.length * 3, input.proofEvidenceRefs));
  }
  if (input.assetEvidenceRefs?.length) {
    factors.push(factor("asset-inventory", input.assetEvidenceRefs.length * 2, input.assetEvidenceRefs));
  }
  const evidenceRefs = [
    ...new Set([
      ...(input.evidenceRefs ?? []),
      ...(input.proofEvidenceRefs ?? []),
      ...(input.assetEvidenceRefs ?? [])
    ])
  ].sort();
  const confidence =
    evidenceRefs.length >= 4 ? "high" : evidenceRefs.length >= 1 ? "medium" : "low";

  return {
    version: 2,
    sessionId: input.sessionId,
    revision: input.revision,
    family,
    subtype: subtypeFor(input, family),
    confidence,
    factors,
    evidenceRefs,
    sectionPlan: defaultSectionPlanV2(family, {
      includeProofDepth:
        input.includeProofDepth === true && (input.proofEvidenceRefs?.length ?? 0) >= 2,
      includeResource:
        input.includeResource === true && (input.proofEvidenceRefs?.length ?? 0) >= 1
    }),
    reasonCode,
    locked: true
  };
}

export type LegacyWireframeFamily = "account" | "campaign" | "content";

export function decodeWireframeFamilyV2(
  family: WireframeFamilyV2 | LegacyWireframeFamily,
  subtype?: ExperienceSubtypeV2
): WireframeFamilyV2 {
  if (wireframeFamiliesV2.includes(family as WireframeFamilyV2)) {
    return family as WireframeFamilyV2;
  }
  if (family === "account") return "align";
  if (family === "content") return "guide";
  return subtype === "solution" || subtype === "industry" ? "guide" : "launch";
}

export function assertWireframeDecisionV2(
  decision: WireframeDecisionV2
): WireframeDecisionV2 {
  if (!wireframeFamiliesV2.includes(decision.family)) {
    throw new Error(`Unsupported V2 wireframe family: ${String(decision.family)}`);
  }
  if (!experienceSubtypesV2.includes(decision.subtype)) {
    throw new Error(`Unsupported V2 experience subtype: ${String(decision.subtype)}`);
  }
  if (decision.sectionPlan.length < 4 || decision.sectionPlan.length > 8) {
    throw new Error("V2 section plan must contain four through eight sections");
  }
  if (!decision.locked || decision.version !== 2) {
    throw new Error("V2 wireframe decision must be version 2 and locked");
  }
  const explorationCount = decision.sectionPlan.filter(
    (section) => section.interaction && section.interaction !== "anchor-navigation"
  ).length;
  if (explorationCount > 1) {
    throw new Error("V2 section plan permits one primary exploration device");
  }
  return decision;
}

const legacyRoleByV2Role: Record<SectionRoleV2, WireframeSectionRole> = {
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

const legacyComponentByVisualRole: Record<VisualRoleV2, WireframeComponentSlot> = {
  "hero-image-or-type": "image-hero",
  "evidence-type": "narrative-copy",
  workflow: "step-sequence",
  "path-selector": "choice-cards",
  "proof-artifact": "proof-artifact",
  "cta-panel": "cta-panel",
  criteria: "decision-matrix",
  "scenario-map": "choice-cards",
  "account-observations": "fact-pair"
};

const legacyInteractionByV2: Record<InteractionRoleV2, WireframeAllowedInteraction> = {
  "select-path": "select-path",
  "reveal-evidence": "expand-details",
  "anchor-navigation": "anchor-scroll"
};

/**
 * Keeps existing renderers and persisted V1 archetypes while making the V2
 * family section contract authoritative for current production.
 */
export function applyV2SectionPlanToLegacySelection(
  selection: WireframeSelectionV1,
  decision: WireframeDecisionV2
): WireframeSelectionV1 {
  assertWireframeDecisionV2(decision);
  const sections = decision.sectionPlan.map((section) => ({
    role: legacyRoleByV2Role[section.role],
    label: section.navigationLabel,
    wordBudget: {
      min: section.wordBudget.headline[0] + section.wordBudget.body[0],
      max: section.wordBudget.headline[1] + section.wordBudget.body[1]
    },
    componentSlots: [legacyComponentByVisualRole[section.visualRole]],
    allowedInteractions: section.interaction
      ? [legacyInteractionByV2[section.interaction]]
      : (["none"] as WireframeAllowedInteraction[])
  }));
  return {
    ...selection,
    locked: true,
    selectedBy: "system",
    alternativeIds: [],
    compositionPlan: {
      ...selection.compositionPlan,
      sectionCount: sections.length as 4 | 5 | 6 | 7 | 8,
      sections,
      totalWordBudget: sections.reduce(
        (total, section) => ({
          min: total.min + section.wordBudget.min,
          max: total.max + section.wordBudget.max
        }),
        { min: 0, max: 0 }
      ),
      alternatives: [],
      visibility: "internal"
    }
  };
}
