import {
  experienceDraftSchema,
  type ExperienceDraft
} from "@/lib/generation/experience-schema";
import type { GenericProductionPage } from "@/lib/generation/generic-production-engine";

const evidenceIdPattern = /^[a-z0-9][a-z0-9._:-]{1,71}$/i;

function bounded(
  value: string | undefined,
  min: number,
  max: number,
  fallback: string
): string {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < min) return fallback;
  if (clean.length <= max) return clean;

  const candidate = clean.slice(0, max + 1);
  const sentenceBoundary = Math.max(
    candidate.lastIndexOf("."),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?")
  );
  const wordBoundary = candidate.lastIndexOf(" ");
  const boundary = sentenceBoundary >= min
    ? sentenceBoundary + 1
    : wordBoundary >= min
      ? wordBoundary
      : max;
  const excerpt = candidate.slice(0, boundary).trim().replace(/[,;:]+$/, "");
  return excerpt.length >= min ? excerpt : fallback;
}

function evidenceIds(
  refs: readonly string[],
  fallback: readonly string[]
): string[] {
  const valid = [...new Set(refs.filter((ref) => evidenceIdPattern.test(ref)))].slice(0, 5);
  return valid.length ? valid : [...fallback].slice(0, 5);
}

/**
 * Projects reviewed production copy into the existing canonical draft shape.
 * It cannot add markup, styles, scripts, actions, or unreviewed section kinds.
 */
export function applyProductionPageToDraft(
  draft: ExperienceDraft,
  page: GenericProductionPage
): ExperienceDraft {
  const next = structuredClone(draft);
  const framework = next.persuasionFramework;
  const byRole = new Map(page.sections.map((section) => [section.role, section]));
  const byV2Role = new Map(
    page.sections.flatMap((section) =>
      section.v2Role ? [[section.v2Role, section] as const] : []
    )
  );
  const opening = byRole.get("hero");
  if (opening?.status === "complete") {
    next.eyebrow = bounded(opening.eyebrow, 2, 52, next.eyebrow);
    next.headline = bounded(opening.headline, 8, 120, next.headline);
    next.subhead = bounded(opening.body, 12, 280, next.subhead);
    if (framework) {
      framework.opening.eyebrow = bounded(
        opening.eyebrow,
        2,
        60,
        framework.opening.eyebrow
      );
      framework.opening.headline = bounded(
        opening.headline,
        8,
        120,
        framework.opening.headline
      );
      framework.opening.body = bounded(opening.body, 16, 280, framework.opening.body);
      framework.opening.evidenceIds = evidenceIds(
        opening.evidenceRefs,
        framework.opening.evidenceIds
      );
      if (opening.cta?.label) {
        framework.opening.ctaLabel = opening.cta.label;
      }
    }
    if (opening.cta?.label) next.primaryCta = opening.cta.label;
  }

  const context = byRole.get("context");
  if (context?.status === "complete") {
    next.thesisHeadline = bounded(context.headline, 8, 130, next.thesisHeadline);
    next.thesisBody = bounded(context.body, 16, 320, next.thesisBody);
    if (framework) {
      framework.urgency.eyebrow = bounded(
        context.eyebrow,
        2,
        60,
        framework.urgency.eyebrow
      );
      framework.urgency.headline = bounded(
        context.headline,
        8,
        120,
        framework.urgency.headline
      );
      framework.urgency.change = bounded(
        context.body,
        12,
        220,
        framework.urgency.change
      );
      framework.urgency.evidenceIds = evidenceIds(
        context.evidenceRefs,
        framework.urgency.evidenceIds
      );
    }
  }

  const pathExploration =
    byV2Role.get("use-cases") ??
    byV2Role.get("applications") ??
    byV2Role.get("priority-paths") ??
    page.sections.find(
      (section) => section.status === "complete" && section.role === "pathways"
    );
  const criteriaExploration =
    byV2Role.get("evaluation-criteria") ??
    page.sections.find(
      (section) =>
        section.status === "complete" && section.role === "decision-support"
    );
  if (pathExploration?.choices?.length === 3) {
    next.sectionLabels.lenses = bounded(
      pathExploration.headline,
      6,
      100,
      next.sectionLabels.lenses
    );
    next.sections = pathExploration.choices.map((choice, index) => ({
      eyebrow: bounded(choice.label, 2, 44, next.sections[index]!.eyebrow),
      headline: bounded(choice.label, 6, 100, next.sections[index]!.headline),
      body: bounded(choice.body, 12, 320, next.sections[index]!.body),
      proof: bounded(choice.body, 8, 180, next.sections[index]!.proof)
    })) as ExperienceDraft["sections"];
    next.signalLabels = pathExploration.choices.map((choice, index) =>
      bounded(choice.label, 2, 56, next.signalLabels[index]!)
    ) as ExperienceDraft["signalLabels"];
  }
  const frameworkExploration = criteriaExploration ?? pathExploration;
  if (frameworkExploration?.choices?.length === 3 && framework) {
      framework.startingPoints.eyebrow = bounded(
        frameworkExploration.eyebrow,
        2,
        60,
        framework.startingPoints.eyebrow
      );
      framework.startingPoints.headline = bounded(
        frameworkExploration.headline,
        8,
        120,
        framework.startingPoints.headline
      );
      framework.startingPoints.intro = bounded(
        frameworkExploration.body,
        12,
        220,
        framework.startingPoints.intro
      );
      framework.startingPoints.choices = frameworkExploration.choices.map((choice, index) => ({
        ...framework.startingPoints.choices[index]!,
        label: bounded(
          choice.label,
          2,
          48,
          framework.startingPoints.choices[index]!.label
        ),
        buyerJob: bounded(
          choice.body,
          8,
          150,
          framework.startingPoints.choices[index]!.buyerJob
        ),
        evidenceIds: evidenceIds(
          choice.evidenceRefs,
          framework.startingPoints.choices[index]!.evidenceIds
        )
      })) as typeof framework.startingPoints.choices;
  }

  const mechanism = byRole.get("mechanism");
  if (mechanism?.status === "complete" && framework) {
    framework.mechanism.eyebrow = bounded(
      mechanism.eyebrow,
      2,
      60,
      framework.mechanism.eyebrow
    );
    framework.mechanism.headline = bounded(
      mechanism.headline,
      8,
      120,
      framework.mechanism.headline
    );
    framework.mechanism.intro = bounded(
      mechanism.body,
      12,
      220,
      framework.mechanism.intro
    );
  }

  const proof = byRole.get("proof");
  if (proof?.status === "complete" && framework) {
    framework.credibility.eyebrow = bounded(
      proof.eyebrow,
      2,
      60,
      framework.credibility.eyebrow
    );
    framework.credibility.headline = bounded(
      proof.headline,
      8,
      120,
      framework.credibility.headline
    );
    framework.credibility.fact = bounded(
      proof.body,
      12,
      240,
      framework.credibility.fact
    );
    framework.credibility.evidenceIds = evidenceIds(
      proof.evidenceRefs,
      framework.credibility.evidenceIds
    );
  }

  const team = byRole.get("seller-validation");
  if (team?.status === "complete" && framework) {
    framework.teamValue.eyebrow = bounded(
      team.eyebrow,
      2,
      60,
      framework.teamValue.eyebrow
    );
    framework.teamValue.headline = bounded(
      team.headline,
      8,
      120,
      framework.teamValue.headline
    );
    framework.teamValue.intro = bounded(
      team.body,
      12,
      220,
      framework.teamValue.intro
    );
  }

  const close = byRole.get("next-action");
  if (close?.status === "complete") {
    next.closingHeadline = bounded(close.headline, 8, 130, next.closingHeadline);
    next.closingBody = bounded(close.body, 16, 260, next.closingBody);
    if (framework) {
      framework.nextStep.eyebrow = bounded(
        close.eyebrow,
        2,
        60,
        framework.nextStep.eyebrow
      );
      framework.nextStep.headline = bounded(
        close.headline,
        8,
        130,
        framework.nextStep.headline
      );
      framework.nextStep.body = bounded(close.body, 16, 260, framework.nextStep.body);
      framework.nextStep.evidenceIds = evidenceIds(
        close.evidenceRefs,
        framework.nextStep.evidenceIds
      );
      if (close.cta?.label) framework.nextStep.ctaLabel = close.cta.label;
    }
    if (close.cta?.label) next.primaryCta = close.cta.label;
  }

  return experienceDraftSchema.parse(next);
}
