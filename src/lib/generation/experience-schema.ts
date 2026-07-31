import { z } from "zod";

import {
  campaignRegisters,
  designRegisters,
  experienceSections,
  experienceShapes,
  wireframeNames
} from "@/lib/generation/campaign-context";

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
    audienceLabel: z.string().min(2).max(90),
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
