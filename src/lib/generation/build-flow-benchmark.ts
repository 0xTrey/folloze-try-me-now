import { deterministicDraft } from "../integrations/openai";
import { buildExperienceSpec } from "../experience-contract";
import { applyProductionPageToDraft } from "./production-draft-adapter";
import { buildRenderDesign } from "./build-render-design";
import { createBlindedReviewExport, type ReviewItem } from "./buyer-journey-evaluation";
import { buildFlowBenchmarkFixtures, type BuildFlowBenchmarkCase } from "./build-flow-benchmark-fixtures";
import { renderExperienceHtml } from "./experience-template";
import { compileSessionProductionPage } from "./session-production-engine";

export type BuildFlowBenchmarkCaseResult = {
  id: string;
  family: BuildFlowBenchmarkCase["family"];
  profile: BuildFlowBenchmarkCase["profile"];
  scenario: string;
  expectedOutcome: BuildFlowBenchmarkCase["expectedOutcome"];
  outcome: BuildFlowBenchmarkCase["expectedOutcome"];
  outcomeMatchesExpectation: boolean;
  sectionCount: number;
  inputEvidenceRefs: readonly string[];
  evidenceRefs: readonly string[];
  sourceArtifact?: { artifactId: string; digest: string; status: string };
  fallbackReasons: readonly string[];
  qualityBlockers: readonly string[];
  sectionModes: readonly { sectionId: string; mode: string; status: string }[];
  sectionDiagnostics: readonly {
    sectionId: string;
    rejectionCodes: readonly string[];
    selectionReasons: readonly string[];
  }[];
  timing: { mode: "deterministic-only"; cold: null; durationMs: number };
  humanReview: { comprehension: null; brand: null; usefulness: null; visual: null };
  requiredEvidenceSatisfied: boolean;
  prohibitedOutputAbsent: boolean;
  renderedHtml?: string;
};

export type BuildFlowBenchmarkResult = {
  version: "build-flow-benchmark-v2";
  generatedAt: string;
  cases: readonly BuildFlowBenchmarkCaseResult[];
  blindReview: ReturnType<typeof createBlindedReviewExport>["publicExport"];
  privateReviewMappings: Readonly<Record<string, string>>;
};

type ProductionPage = Parameters<typeof applyProductionPageToDraft>[1];

function pageText(page: ProductionPage | undefined): string {
  return (page?.sections ?? [])
    .flatMap((section) => [
      section.headline,
      section.body,
      ...(section.choices ?? []).flatMap((choice) => [choice.label, choice.body])
    ])
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();
}

function renderCase(
  fixture: BuildFlowBenchmarkCase,
  page: ProductionPage | undefined,
  buildPlan: Awaited<ReturnType<typeof compileSessionProductionPage>>["buildPlan"]
): string | undefined {
  if (!page) return undefined;
  const draft = deterministicDraft({
    brand: fixture.brief.brand,
    targetBrand: fixture.brief.targetBrand,
    useCase: fixture.brief.session.useCase,
    answers: fixture.brief.session.answers
  });
  const adapted = applyProductionPageToDraft(draft, page);
  const spec = buildExperienceSpec(
    fixture.brief.session,
    adapted,
    fixture.brief.brand,
    fixture.brief.targetBrand,
    page
  );
  return renderExperienceHtml({
    draft: adapted,
    brand: fixture.brief.brand,
    targetBrand: fixture.brief.targetBrand,
    useCase: fixture.brief.session.useCase,
    answers: fixture.brief.session.answers,
    wireframeSelection: spec.wireframeSelection,
    productionSections: spec.production?.sections,
    actions: spec.actions,
    ...(buildPlan ? { buildDesign: buildRenderDesign(buildPlan, page.sections) } : {})
  });
}

export async function runBuildFlowBenchmark(): Promise<BuildFlowBenchmarkResult> {
  const reviewItems: ReviewItem[] = [];
  const mappings: Record<string, string> = {};
  const cases: BuildFlowBenchmarkCaseResult[] = [];
  for (const fixture of buildFlowBenchmarkFixtures) {
    const started = performance.now();
    const result = await compileSessionProductionPage({
      session: fixture.brief.session,
      brand: fixture.brief.brand,
      targetBrand: fixture.brief.targetBrand,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });
    const page = result.outcome === "production-page" ? result.artifact.value : undefined;
    const text = pageText(page);
    const evidenceRefs = [...new Set((page?.sections ?? []).flatMap((section) => section.evidenceRefs))].sort();
    const fallbackReasons = [...new Set([
      ...result.buildTrace.fallbacks.map(({ code }) => code),
      ...(result.buildTrace.diagnostics?.lifecycle.fallbackCodes ?? [])
    ])].sort();
    const requiredEvidenceSatisfied = (fixture.expectation.requiredEvidenceRefs ?? []).every(
      (ref) => evidenceRefs.includes(ref)
    );
    const prohibitedOutputAbsent = fixture.expectation.prohibitedOutput.every(
      (phrase) => !text.includes(phrase.toLowerCase())
    );
    const renderedHtml = renderCase(fixture, page, result.buildPlan);
    const reviewId = `review-${reviewItems.length + 1}`;
    mappings[reviewId] = fixture.id;
    reviewItems.push({
      headline: page?.sections[0]?.headline,
      body: page?.sections[0]?.body,
      sections: text,
      sourceSnippets: fixture.brief.session.evidenceItems
        ?.filter(({ disposition }) => disposition !== "excluded")
        .map(({ text: itemText }) => itemText)
        .join("\n")
    });
    cases.push({
      id: fixture.id,
      family: fixture.family,
      profile: fixture.profile,
      scenario: fixture.scenario,
      expectedOutcome: fixture.expectedOutcome,
      outcome: result.outcome,
      outcomeMatchesExpectation: result.outcome === fixture.expectedOutcome,
      sectionCount: page?.sections.length ?? 0,
      inputEvidenceRefs: fixture.brief.session.evidenceItems
        ?.filter(({ disposition }) => disposition !== "excluded")
        .map(({ id }) => id)
        .sort() ?? [],
      evidenceRefs,
      ...(fixture.brief.session.sourceArtifact
        ? {
            sourceArtifact: {
              artifactId: fixture.brief.session.sourceArtifact.artifactId,
              digest: fixture.brief.session.sourceArtifact.digest,
              status: fixture.brief.session.sourceArtifact.status
            }
          }
        : {}),
      fallbackReasons,
      qualityBlockers: result.buildQuality?.blockers ?? [],
      sectionModes: result.buildTrace.sections.map(({ sectionId, writerMode, status }) => ({
        sectionId,
        mode: writerMode,
        status
      })),
      sectionDiagnostics: result.buildTrace.sections.map((section) => ({
        sectionId: section.sectionId,
        rejectionCodes: section.rejectionCodes ?? [],
        selectionReasons: section.selectionReasons
      })),
      timing: { mode: "deterministic-only", cold: null, durationMs: Math.round(performance.now() - started) },
      humanReview: { comprehension: null, brand: null, usefulness: null, visual: null },
      requiredEvidenceSatisfied,
      prohibitedOutputAbsent,
      ...(renderedHtml ? { renderedHtml } : {})
    });
  }
  return {
    version: "build-flow-benchmark-v2",
    generatedAt: new Date().toISOString(),
    cases,
    blindReview: createBlindedReviewExport({ items: reviewItems }).publicExport,
    privateReviewMappings: mappings
  };
}
