import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import {
  BUYER_FACING_NAVIGATION,
  sanitizeBuyerFacingLabel
} from "@/lib/generation/message-spine";
import {
  applyPersonalizationVariant,
  availablePersonalizationVariantIds,
  compilePersonalizationPlan,
  personalizationRuntimePayload,
  personalizationVariantById
} from "@/lib/generation/personalization-preview";
import {
  archetypeForLegacyWireframe,
  getWireframeArchetype,
  type CompositionId,
  type WireframeFamily,
  type WireframeArchetypeId,
  type WireframeSelectionV1
} from "@/lib/generation/wireframe-library";
import {
  visualGrammarForArchetype,
  type VisualGrammar
} from "@/lib/generation/visual-grammar";

export type ExperienceTemplateFamily = "account-abm" | "campaign-launch" | "content-source";

export type ExperiencePrimitive = "thesis" | "lenses" | "resources";

export interface ExperienceTemplateComposition {
  family: ExperienceTemplateFamily;
  archetypeId: WireframeArchetypeId;
  compositionId: CompositionId;
  fingerprint: string;
  heroLabel: string;
  signatureAriaLabel: string;
  signatureEyebrow: (audience: string, targetName?: string) => string;
  navigation: Record<ExperiencePrimitive, string>;
  regionOrder: readonly ExperiencePrimitive[];
  resourcesEyebrow: string;
  resourceAction: string;
  journeyNavigation: readonly string[];
  /** Presentation-only grammar; copy and proof stay in the ExperienceSpec. */
  visualGrammar: VisualGrammar;
}

const canonicalRegionOrder: readonly ExperiencePrimitive[] = [
  "thesis",
  "lenses",
  "resources"
];

const accountComposition: ExperienceTemplateComposition = {
  family: "account-abm",
  archetypeId: "account-executive",
  compositionId: "editorial-split",
  fingerprint: "v4-account-seven-section-persuasion",
  heroLabel: "Account experience",
  signatureAriaLabel: "Where to start",
  signatureEyebrow: (audience, targetName) =>
    `Where to start for ${targetName ?? audience}`,
  navigation: {
    thesis: BUYER_FACING_NAVIGATION.account[0],
    lenses: BUYER_FACING_NAVIGATION.account[2],
    resources: BUYER_FACING_NAVIGATION.account[5]
  },
  regionOrder: canonicalRegionOrder,
  resourcesEyebrow: "Evidence to carry forward",
  resourceAction: "Explore the evidence",
  journeyNavigation: [...BUYER_FACING_NAVIGATION.account],
  visualGrammar: visualGrammarForArchetype("account-executive")
};

const campaignComposition: ExperienceTemplateComposition = {
  family: "campaign-launch",
  archetypeId: "campaign-demand",
  compositionId: "interactive-paths",
  fingerprint: "v4-campaign-seven-section-persuasion",
  heroLabel: "Campaign",
  signatureAriaLabel: "Campaign exploration paths",
  signatureEyebrow: (audience) => `Three ways in for ${audience}`,
  navigation: {
    thesis: "Why it matters",
    lenses: "Explore the offer",
    resources: "Proof and resources"
  },
  regionOrder: canonicalRegionOrder,
  resourcesEyebrow: "Proof for the campaign",
  resourceAction: "Explore this proof",
  journeyNavigation: [...BUYER_FACING_NAVIGATION.campaign],
  visualGrammar: visualGrammarForArchetype("campaign-demand")
};

const contentComposition: ExperienceTemplateComposition = {
  family: "content-source",
  archetypeId: "content-report",
  compositionId: "editorial-split",
  fingerprint: "v3-content-source-findings-paths",
  heroLabel: "Interactive source",
  signatureAriaLabel: "Source exploration paths",
  signatureEyebrow: () => "Choose how to explore the source",
  navigation: {
    thesis: "Key finding",
    lenses: "Explore the source",
    resources: "Source highlights"
  },
  regionOrder: canonicalRegionOrder,
  resourcesEyebrow: "From the source",
  resourceAction: "Explore this highlight",
  journeyNavigation: [...BUYER_FACING_NAVIGATION.content],
  visualGrammar: visualGrammarForArchetype("content-report")
};

export const SHARED_EXPERIENCE_PRIMITIVES = [
  "brand-lockup",
  "hero",
  "signature-paths",
  "thesis",
  "lenses",
  "resources",
  "close",
  "analytics"
] as const;

export {
  applyPersonalizationVariant,
  availablePersonalizationVariantIds,
  compilePersonalizationPlan,
  personalizationRuntimePayload,
  personalizationVariantById
};

export function experienceTemplateFor(
  draft: Pick<ExperienceDraft, "campaignRegister" | "wireframeName">,
  selection?: WireframeSelectionV1
): ExperienceTemplateComposition {
  const base = draft.campaignRegister === "one-to-one-abm"
    ? accountComposition
    : draft.campaignRegister === "content-magic"
      ? contentComposition
      : campaignComposition;
  const family: WireframeFamily = base.family === "account-abm"
    ? "account"
    : base.family === "content-source"
      ? "content"
      : "campaign";
  const archetypeId = selection?.archetypeId ?? archetypeForLegacyWireframe(
    draft.wireframeName,
    family
  );
  if (!archetypeId) return base;
  const archetype = getWireframeArchetype(archetypeId);
  const compositionId = selection?.compositionId ?? archetype.primaryCompositionId;
  const regionOrder: readonly ExperiencePrimitive[] =
    compositionId === "evidence-lead"
      ? ["resources", "thesis", "lenses"]
      : compositionId === "interactive-paths"
        ? ["lenses", "thesis", "resources"]
        : compositionId === "data-story"
          ? ["resources", "lenses", "thesis"]
          : compositionId === "chapter-journey"
            ? ["lenses", "resources", "thesis"]
            : canonicalRegionOrder;

  return {
    ...base,
    archetypeId: archetype.id,
    compositionId,
    fingerprint: `v5-${archetype.id}-${compositionId}`,
    heroLabel: archetype.label,
    signatureAriaLabel: `${archetype.label} exploration`,
    signatureEyebrow: (_audience, targetName) =>
      targetName ? `${archetype.label} for ${targetName}` : archetype.label,
    navigation: {
      thesis: sanitizeBuyerFacingLabel(
        archetype.navigationLabels[1] ?? base.navigation.thesis,
        base.navigation.thesis
      ),
      lenses: sanitizeBuyerFacingLabel(
        archetype.navigationLabels[2] ?? base.navigation.lenses,
        base.navigation.lenses
      ),
      resources: sanitizeBuyerFacingLabel(
        archetype.navigationLabels.at(-2) ?? base.navigation.resources,
        base.navigation.resources
      )
    },
    regionOrder,
    resourcesEyebrow:
      archetype.contentPolicy === "source-preserving"
        ? "From the approved source"
        : "Evidence to carry forward",
    resourceAction:
      archetype.contentPolicy === "source-preserving"
        ? "Explore this source point"
        : "Explore the evidence",
    journeyNavigation: archetype.navigationLabels.map((label) =>
      sanitizeBuyerFacingLabel(label, label)
    ),
    visualGrammar: visualGrammarForArchetype(archetype.id)
  };
}
