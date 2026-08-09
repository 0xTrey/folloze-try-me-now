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

const evidenceId = z.string().min(2).max(72).regex(/^[a-z0-9][a-z0-9._:-]*$/i);

const imageBriefSchema = z
  .object({
    purpose: z.string().min(8).max(180),
    assetType: z.enum([
      "logo-lockup",
      "product-ui",
      "workflow-diagram",
      "customer-proof",
      "source-visual",
      "data-visual",
      "typographic-treatment"
    ]),
    source: z.enum(["seller", "target", "offer", "source", "none"]),
    caption: z.string().min(3).max(140),
    provenance: z.string().min(8).max(180)
  })
  .strict();

export const persuasionFrameworkSchema = z
  .object({
    strategy: z
      .object({
        evidenceMap: z
          .array(
            z
              .object({
                id: evidenceId,
                kind: z.enum([
                  "seller-fact",
                  "target-fact",
                  "source-claim",
                  "mechanism",
                  "proof",
                  "visitor-input"
                ]),
                claim: z.string().min(8).max(240),
                sourceUrl: z.string().url().max(500).nullable()
              })
              .strict()
          )
          .min(2)
          .max(10),
        messageSpine: z.string().min(16).max(320),
        selectedAngle: z.enum(["status-quo-tension", "business-upside", "differentiated-mechanism"]),
        angleRationale: z.string().min(12).max(220)
      })
      .strict(),
    opening: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(120),
        body: z.string().min(16).max(280),
        ctaLabel: z.string().min(2).max(42),
        evidenceIds: z.array(evidenceId).min(1).max(5),
        imageBrief: imageBriefSchema
      })
      .strict(),
    credibility: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(120),
        fact: z.string().min(12).max(240),
        implication: z.string().min(12).max(240),
        evidenceIds: z.array(evidenceId).min(1).max(5),
        imageBrief: imageBriefSchema
      })
      .strict(),
    urgency: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(120),
        change: z.string().min(12).max(220),
        consequence: z.string().min(12).max(220),
        reframe: z.string().min(12).max(220),
        evidenceIds: z.array(evidenceId).min(1).max(5),
        imageBrief: imageBriefSchema
      })
      .strict(),
    startingPoints: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(120),
        intro: z.string().min(12).max(220),
        choices: z
          .array(
            z
              .object({
                label: z.string().min(2).max(48),
                buyerJob: z.string().min(8).max(150),
                outcome: z.string().min(8).max(170),
                validationQuestion: z.string().min(8).max(180),
                evidenceIds: z.array(evidenceId).min(1).max(4),
                imageBrief: imageBriefSchema
              })
              .strict()
          )
          .length(3)
      })
      .strict(),
    mechanism: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(120),
        intro: z.string().min(12).max(220),
        steps: z
          .array(
            z
              .object({
                action: z.string().min(4).max(100),
                capability: z.string().min(8).max(180),
                output: z.string().min(8).max(180),
                evidenceIds: z.array(evidenceId).min(1).max(4)
              })
              .strict()
          )
          .min(3)
          .max(4),
        imageBrief: imageBriefSchema
      })
      .strict(),
    teamValue: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(120),
        intro: z.string().min(12).max(220),
        roles: z
          .array(
            z
              .object({
                role: z.string().min(2).max(70),
                decision: z.string().min(8).max(150),
                risk: z.string().min(8).max(150),
                benefit: z.string().min(8).max(160),
                evidenceNeeded: z.string().min(8).max(160),
                evidenceIds: z.array(evidenceId).min(1).max(4)
              })
              .strict()
          )
          .length(3)
      })
      .strict(),
    nextStep: z
      .object({
        eyebrow: z.string().min(2).max(60),
        headline: z.string().min(8).max(130),
        body: z.string().min(16).max(260),
        scope: z.string().min(4).max(130),
        activity: z.string().min(4).max(130),
        deliverable: z.string().min(4).max(130),
        resultingDecision: z.string().min(4).max(150),
        ctaLabel: z.string().min(2).max(42),
        evidenceIds: z.array(evidenceId).min(1).max(5),
        imageBrief: imageBriefSchema
      })
      .strict()
  })
  .strict();

/**
 * OpenAI Structured Outputs rejects the JSON Schema `uri` format emitted by
 * Zod's `.url()`. Keep the provider-facing field as a bounded nullable string,
 * then pass the parsed result back through `persuasionFrameworkSchema` before
 * any draft can be accepted by the product.
 */
export const persuasionFrameworkResponseSchema = persuasionFrameworkSchema.extend({
  strategy: persuasionFrameworkSchema.shape.strategy.extend({
    evidenceMap: z
      .array(
        z
          .object({
            id: evidenceId,
            kind: z.enum([
              "seller-fact",
              "target-fact",
              "source-claim",
              "mechanism",
              "proof",
              "visitor-input"
            ]),
            claim: z.string().min(8).max(240),
            sourceUrl: z.string().max(500).nullable()
          })
          .strict()
      )
      .min(2)
      .max(10)
  })
});

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
    closingBody: z.string().min(16).max(260),
    /**
     * Canonical seven-section copy contract for account and campaign pages.
     * Optional keeps already-saved previews and the intentionally unchanged
     * content-experience contract readable during the content redesign.
     */
    persuasionFramework: persuasionFrameworkSchema.optional()
  })
  .strict();

export type ExperienceDraft = z.infer<typeof experienceDraftSchema>;
export type PersuasionFramework = z.infer<typeof persuasionFrameworkSchema>;
