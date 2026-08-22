import type { WireframeArchetypeId } from "@/lib/generation/wireframe-library";

/**
 * Presentation-only direction for the canonical experience renderer.
 *
 * This is deliberately a bounded vocabulary: it can change geometry, asset
 * placement, and interaction rhythm, but never copy, proof, citations, CTA
 * intent, or source policy. Those remain the responsibility of the
 * ExperienceSpec and persuasion framework.
 *
 * Model work fills constrained content slots inside a selected grammar. It
 * never invents page geometry, module order, or a new composition id.
 */
export const visualGrammarIds = [
  "editorial-split",
  "evidence-lead",
  "interactive-paths",
  "workflow-spine",
  "data-story",
  "chapter-journey"
] as const;

export type VisualGrammarId = (typeof visualGrammarIds)[number];
export type MotionProfile = "quiet" | "guided" | "demonstrative";
export type HeroMediaRole = "brand-moment" | "product-ui" | "proof-artifact" | "workflow-diagram" | "source-cover" | "data-visual" | "video-still";
export type ProofDevice = "narrative" | "fact-pair" | "choice-panel" | "workflow-steps" | "data-callout" | "chapter-list";
export type Cadence = "editorial" | "evidence" | "interactive" | "system" | "data" | "chaptered";
export type CloseTreatment = "working-session" | "proof-receipt" | "guided-next-step" | "validation-plan" | "methodology-continuation" | "watch-or-continue";
export type NoAssetTreatment = "editorial-evidence" | "proof-receipt" | "choice-map" | "system-map" | "data-frame" | "chapter-index";

/** Slots a model may fill after composition selection. Geometry stays locked. */
export const MODEL_CONSTRAINED_CONTENT_SLOTS = [
  "audience",
  "tension",
  "promise",
  "mechanism",
  "proofPlan",
  "decisionHelp",
  "nextAction",
  "whyNow"
] as const;

export type ModelConstrainedContentSlot = (typeof MODEL_CONSTRAINED_CONTENT_SLOTS)[number];

export interface VisualGrammar {
  id: VisualGrammarId;
  motionProfile: MotionProfile;
  heroMediaRole: HeroMediaRole;
  proofDevice: ProofDevice;
  cadence: Cadence;
  closeTreatment: CloseTreatment;
  noAssetTreatment: NoAssetTreatment;
  /** A hero image is a singular moment, never a generic repeating texture. */
  allowHeroReuse: false;
  /** Explicit contract: writers fill slots; they do not invent layout. */
  modelMayInventGeometry: false;
  constrainedContentSlots: readonly ModelConstrainedContentSlot[];
}

const grammar = (
  id: VisualGrammarId,
  motionProfile: MotionProfile,
  heroMediaRole: HeroMediaRole,
  proofDevice: ProofDevice,
  cadence: Cadence,
  closeTreatment: CloseTreatment,
  noAssetTreatment: NoAssetTreatment
): VisualGrammar => ({
  id,
  motionProfile,
  heroMediaRole,
  proofDevice,
  cadence,
  closeTreatment,
  noAssetTreatment,
  allowHeroReuse: false,
  modelMayInventGeometry: false,
  constrainedContentSlots: MODEL_CONSTRAINED_CONTENT_SLOTS
});

export const visualGrammars: Record<VisualGrammarId, VisualGrammar> = {
  "editorial-split": grammar("editorial-split", "quiet", "brand-moment", "narrative", "editorial", "working-session", "editorial-evidence"),
  "evidence-lead": grammar("evidence-lead", "guided", "proof-artifact", "fact-pair", "evidence", "proof-receipt", "proof-receipt"),
  "interactive-paths": grammar("interactive-paths", "guided", "product-ui", "choice-panel", "interactive", "guided-next-step", "choice-map"),
  "workflow-spine": grammar("workflow-spine", "guided", "workflow-diagram", "workflow-steps", "system", "validation-plan", "system-map"),
  "data-story": grammar("data-story", "quiet", "data-visual", "data-callout", "data", "methodology-continuation", "data-frame"),
  "chapter-journey": grammar("chapter-journey", "demonstrative", "video-still", "chapter-list", "chaptered", "watch-or-continue", "chapter-index")
};

/**
 * Explicit archetype mapping keeps selection inspectable and prevents a
 * template name from silently becoming a renderer fork.
 */
export const visualGrammarByArchetype: Record<WireframeArchetypeId, VisualGrammarId> = {
  "account-executive": "editorial-split",
  "account-technical": "workflow-spine",
  "account-proof": "evidence-lead",
  "account-team": "interactive-paths",
  "account-workshop": "editorial-split",
  "campaign-product": "editorial-split",
  "campaign-demand": "interactive-paths",
  "campaign-use-case": "workflow-spine",
  "campaign-event": "chapter-journey",
  "campaign-proof": "evidence-lead",
  "campaign-nurture": "chapter-journey",
  "content-report": "editorial-split",
  "content-guide": "interactive-paths",
  "content-research": "data-story",
  "content-technical": "workflow-spine",
  "content-webinar": "chapter-journey",
  "content-assessment": "data-story"
};

export function visualGrammarForArchetype(archetypeId: WireframeArchetypeId): VisualGrammar {
  return visualGrammars[visualGrammarByArchetype[archetypeId]];
}

/**
 * Fail-soft guard for generation: if a model proposes a geometry change, keep
 * the reviewed grammar and ignore the invention.
 */
export function rejectInventedGeometry(
  selected: VisualGrammarId,
  proposed: string | null | undefined
): { grammarId: VisualGrammarId; inventedGeometryRejected: boolean } {
  if (!proposed || proposed === selected) {
    return { grammarId: selected, inventedGeometryRejected: false };
  }
  if ((visualGrammarIds as readonly string[]).includes(proposed)) {
    // Alternative reviewed grammars are only allowed through wireframe selection,
    // never by free-form model invention mid-generation.
    return { grammarId: selected, inventedGeometryRejected: true };
  }
  return { grammarId: selected, inventedGeometryRejected: true };
}
