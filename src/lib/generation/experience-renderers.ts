import type { ExperienceDraft } from "@/lib/generation/experience-schema";

export type ExperienceTemplateFamily = "account-abm" | "campaign-launch" | "content-source";

export type ExperiencePrimitive = "thesis" | "lenses" | "resources";

export interface ExperienceTemplateComposition {
  family: ExperienceTemplateFamily;
  fingerprint: string;
  heroLabel: string;
  signatureAriaLabel: string;
  signatureEyebrow: (audience: string, targetName?: string) => string;
  navigation: Record<ExperiencePrimitive, string>;
  regionOrder: readonly ExperiencePrimitive[];
  resourcesEyebrow: string;
  resourceAction: string;
}

const canonicalRegionOrder: readonly ExperiencePrimitive[] = [
  "thesis",
  "lenses",
  "resources"
];

const accountComposition: ExperienceTemplateComposition = {
  family: "account-abm",
  fingerprint: "v3-account-thesis-paths-proof",
  heroLabel: "Account brief",
  signatureAriaLabel: "Account decision paths",
  signatureEyebrow: (audience, targetName) =>
    `Decision paths for ${targetName ?? audience}`,
  navigation: {
    thesis: "Account thesis",
    lenses: "Decision paths",
    resources: "Supporting proof"
  },
  regionOrder: canonicalRegionOrder,
  resourcesEyebrow: "Evidence to carry forward",
  resourceAction: "Explore the evidence"
};

const campaignComposition: ExperienceTemplateComposition = {
  family: "campaign-launch",
  fingerprint: "v3-campaign-routes-proof-thesis",
  heroLabel: "Campaign experience",
  signatureAriaLabel: "Campaign exploration paths",
  signatureEyebrow: (audience) => `Three ways in for ${audience}`,
  navigation: {
    thesis: "Why it matters",
    lenses: "Explore the offer",
    resources: "Proof and resources"
  },
  regionOrder: canonicalRegionOrder,
  resourcesEyebrow: "Proof for the campaign",
  resourceAction: "Explore this proof"
};

const contentComposition: ExperienceTemplateComposition = {
  family: "content-source",
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
  resourceAction: "Explore this highlight"
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

export function experienceTemplateFor(
  draft: Pick<ExperienceDraft, "campaignRegister">
): ExperienceTemplateComposition {
  if (draft.campaignRegister === "one-to-one-abm") return accountComposition;
  if (draft.campaignRegister === "content-magic") return contentComposition;
  return campaignComposition;
}
