import { z } from "zod";

import {
  campaignRegisters,
  designRegisters,
  experienceSections,
  experienceShapes,
  wireframeNames
} from "@/lib/generation/campaign-context";

export const EXPERIENCE_DRAFT_LIMITS = {
  audienceLabel: 90
} as const;

const audienceRationaleBoundary =
  /\b(?:aligning|building|connecting|designing|driving|evaluating|focused on|leading|managing|owning|responsible for|securing|validating|who|that)\b/i;

export function normalizeAudienceLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= EXPERIENCE_DRAFT_LIMITS.audienceLabel) return normalized;

  const roleClause = normalized
    .split(audienceRationaleBoundary, 1)[0]
    ?.replace(/[\s,;:/-]+$/g, "")
    .trim();
  if (roleClause && roleClause.length >= 2 && roleClause.length <= EXPERIENCE_DRAFT_LIMITS.audienceLabel) {
    return roleClause;
  }

  const candidate = normalized.slice(0, EXPERIENCE_DRAFT_LIMITS.audienceLabel + 1);
  const lastWordBoundary = candidate.lastIndexOf(" ");
  const bounded = (
    lastWordBoundary >= 2
      ? candidate.slice(0, lastWordBoundary)
      : normalized.slice(0, EXPERIENCE_DRAFT_LIMITS.audienceLabel)
  )
    .replace(/\s+\b(?:a|an|and|for|of|or|the|to|with)$/i, "")
    .replace(/[\s,;:/-]+$/g, "")
    .trim();

  return bounded.length >= 2
    ? bounded
    : normalized.slice(0, EXPERIENCE_DRAFT_LIMITS.audienceLabel);
}

export const experienceDraftSchema = z
  .object({
    campaignRegister: z.enum(campaignRegisters),
    designRegister: z.enum(designRegisters),
    wireframeName: z.enum(wireframeNames),
    experienceShape: z.enum(experienceShapes),
    sectionSequence: z.array(z.enum(experienceSections)).length(3),
    sectionLabels: z
      .object({
        thesis: z.string().min(2).max(48),
        lenses: z.string().min(2).max(56),
        journey: z.string().min(2).max(64),
        close: z.string().min(2).max(48)
      })
      .strict(),
    title: z.string().min(3).max(90),
    eyebrow: z.string().min(2).max(52),
    headline: z.string().min(8).max(120),
    subhead: z.string().min(12).max(280),
    thesisHeadline: z.string().min(8).max(130),
    thesisBody: z.string().min(16).max(320),
    primaryCta: z.string().min(2).max(42),
    audienceLabel: z.string().min(2).max(EXPERIENCE_DRAFT_LIMITS.audienceLabel),
    narrativeArc: z.string().min(8).max(180),
    sections: z
      .array(
        z
          .object({
            eyebrow: z.string().min(2).max(44),
            headline: z.string().min(6).max(100),
            body: z.string().min(12).max(320),
            proof: z.string().min(8).max(180)
          })
          .strict()
      )
      .length(3),
    signalLabels: z.array(z.string().min(2).max(56)).length(3),
    closingHeadline: z.string().min(8).max(130),
    closingBody: z.string().min(16).max(260)
  })
  .strict();

export type ExperienceDraft = z.infer<typeof experienceDraftSchema>;
