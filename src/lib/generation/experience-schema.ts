import { z } from "zod";

export const experienceDraftSchema = z
  .object({
    title: z.string().min(3).max(90),
    eyebrow: z.string().min(2).max(52),
    headline: z.string().min(8).max(110),
    subhead: z.string().min(12).max(240),
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
    signalLabels: z.array(z.string().min(2).max(56)).length(3)
  })
  .strict();

export type ExperienceDraft = z.infer<typeof experienceDraftSchema>;
