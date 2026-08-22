import {
  experienceDraftSchema,
  type ExperienceDraft
} from "@/lib/generation/experience-schema";
import type { GenericProductionPage } from "@/lib/generation/generic-production-engine";

const evidenceIdPattern = /^[a-z0-9][a-z0-9._:-]{1,71}$/i;
const internalDirectivePattern =
  /^(?:frame|use|explain|review|present|position|describe|show|write)\b|\b(?:do not claim|only when supported|evidence-bounded|unknowns?)\b/i;

function bounded(
  value: string | undefined,
  min: number,
  max: number,
  fallback: string
): string {
  const clean = value?.replace(/\s+/g, " ").trim();
  return clean &&
    clean.length >= min &&
    clean.length <= max &&
    !internalDirectivePattern.test(clean)
    ? clean
    : fallback;
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
    }
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

  const exploration = page.sections.find(
    (section) =>
      section.status === "complete" &&
      ["pathways", "agenda", "chapter-navigation", "decision-support", "resources"].includes(
        section.role
      )
  );
  if (exploration?.choices?.length === 3) {
    next.sections = exploration.choices.map((choice, index) => ({
      eyebrow: bounded(choice.label, 2, 44, next.sections[index]!.eyebrow),
      headline: bounded(choice.label, 6, 100, next.sections[index]!.headline),
      body: bounded(choice.body, 12, 320, next.sections[index]!.body),
      proof: bounded(choice.body, 8, 180, next.sections[index]!.proof)
    })) as ExperienceDraft["sections"];
    next.signalLabels = exploration.choices.map((choice, index) =>
      bounded(choice.label, 2, 56, next.signalLabels[index]!)
    ) as ExperienceDraft["signalLabels"];
    if (framework) {
      framework.startingPoints.eyebrow = bounded(
        exploration.eyebrow,
        2,
        60,
        framework.startingPoints.eyebrow
      );
      framework.startingPoints.headline = bounded(
        exploration.headline,
        8,
        120,
        framework.startingPoints.headline
      );
      framework.startingPoints.intro = bounded(
        exploration.body,
        12,
        220,
        framework.startingPoints.intro
      );
      framework.startingPoints.choices = exploration.choices.map((choice, index) => ({
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
    }
  }

  return experienceDraftSchema.parse(next);
}
