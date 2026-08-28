import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { SectionModelClient } from "./section-model-writer";
import { compileSessionProductionPage } from "./session-production-engine";
import type { BrandProfile, TryMeSession } from "@/lib/types";

type Fixture = {
  id: string;
  seller: string;
  offer: string;
  buyer: string;
  job: string;
  evidence: number;
  logo: boolean;
  colors: boolean;
  model: "section" | "fallback" | "invalid" | "slow";
  recipe: string;
  strategy: string;
  copy: string[];
  fallback?: string;
  degraded?: boolean;
  staleRevision?: boolean;
  expectedOutcome: "production-page" | "safe-deterministic-fallback";
  expectedInstructionCode?: string;
  expectedWriterSource: "mixed" | "deterministic" | "none";
  qualityFixture: boolean;
};

const fixtures = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "tests/fixtures/v2-base-experience/fixtures.json"),
    "utf8"
  )
) as Fixture[];

const OUT = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-27-v2-final-only-base-experience/evidence/v2-base-experience-runtime-runs.json"
);

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+/g, "");
}

function brand(fixture: Fixture): BrandProfile {
  const domain = `${slug(fixture.seller)}.example`;
  return {
    domain,
    canonicalDomain: domain,
    companyName: fixture.seller,
    title: fixture.offer,
    description: `${fixture.seller} provides ${fixture.offer}.`,
    publicContext: `Teams use ${fixture.offer} to ${fixture.job}.`,
    publicTopics: [fixture.offer, fixture.buyer],
    logoUrl: fixture.logo ? `https://${domain}/logo.svg` : undefined,
    imageUrls: fixture.colors ? [`https://${domain}/hero.jpg`] : [],
    colors: fixture.colors ? ["#101828", "#ffffff", "#18a957"] : [],
    primaryColor: fixture.colors ? "#101828" : "#ffffff",
    accentColor: fixture.colors ? "#18a957" : "#667085",
    surfaceColor: "#ffffff",
    source: fixture.logo && fixture.colors ? "brand-harvester" : "fallback",
    sourceUrl: `https://${domain}/`
  };
}

function session(fixture: Fixture): TryMeSession {
  const profile = brand(fixture);
  return {
    id: `bench-${fixture.id}`,
    editorTokenHash: "bench",
    useCase: "campaign",
    companyDomain: profile.domain,
    status: "generating",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    temporaryUrl: `https://example.test/e/bench-${fixture.id}`,
    revision: 1,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "running", startedAt: "2026-08-27T00:00:00.000Z" }
    },
    answers: {
      campaignType: "product",
      promotedOffer: fixture.offer,
      audience: fixture.buyer,
      objective: fixture.job,
      ctaType: "book-meeting",
      ctaStyle: "solid"
    },
    brand: profile,
    audienceSuggestions: [fixture.buyer],
    audienceRecommendations: [],
    evidenceItems: Array.from({ length: fixture.evidence }, (_, index) => ({
      id: `evidence-${fixture.id}-${index}`,
      type: "public-positioning",
      label: `${fixture.offer} evidence`,
      text: `${fixture.seller} publishes information about ${fixture.offer}`,
      sourceUrl: `https://${profile.domain}/`,
      signals: [fixture.offer],
      disposition: "available"
    })),
    events: []
  } as TryMeSession;
}

function invalidClient(): SectionModelClient {
  return {
    async writeSection(contract) {
      return {
        sectionId: contract.sectionId,
        candidates: [{
          headline: "<script>not buyer-safe</script>",
          body: "Generic business outcomes unlock value with an unsupported claim.",
          evidenceRefs: ["outside-the-section-contract"]
        }]
      };
    }
  };
}

function slowClient(): SectionModelClient {
  return {
    async writeSection(contract) {
      await new Promise<void>((resolveDelay) => {
        setTimeout(resolveDelay, 30).unref?.();
      });
      return { sectionId: contract.sectionId, candidates: [] };
    }
  };
}

async function acceptedModelClient(
  fixture: Fixture,
  baseSession: TryMeSession,
  profile: BrandProfile
): Promise<SectionModelClient> {
  const baseline = await compileSessionProductionPage({
    session: baseSession,
    brand: profile,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000
  });
  if (baseline.outcome !== "production-page" || !baseline.artifact.value?.sections[0]) {
    throw new Error(`benchmark_model_baseline_unavailable:${fixture.id}`);
  }
  const target = baseline.artifact.value.sections[0];
  let answered = false;
  return {
    async writeSection(contract) {
      if (answered || contract.sectionId !== target.sectionId) {
        return { sectionId: contract.sectionId, candidates: [] };
      }
      answered = true;
      return {
        sectionId: contract.sectionId,
        candidates: [{
          headline: `${fixture.offer} gives ${fixture.buyer} a clearer next decision`,
          body: target.body,
          evidenceRefs: [...target.evidenceRefs]
        }]
      };
    }
  };
}

function containsMeaningfulWords(haystack: string, needle: string): boolean {
  const words = needle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  return words.length > 0 && words.every((word) => haystack.includes(word));
}

function resultSummary(
  fixture: Fixture,
  result: Awaited<ReturnType<typeof compileSessionProductionPage>>,
  elapsedMs: number
) {
  const production = result.outcome === "production-page";
  const page = production ? result.artifact.value : undefined;
  const trace = result.buildTrace;
  const diagnostics = trace.diagnostics;
  const instructionCode = production ? null : result.instruction.code;
  const writerModes = [...new Set(trace.sections.map(({ writerMode }) => writerMode))].sort();
  const writerSource = writerModes.includes("model") && writerModes.includes("deterministic")
    ? "mixed"
    : writerModes.includes("model")
      ? "model"
      : writerModes.includes("deterministic")
        ? "deterministic"
        : "none";
  const pageText = (page?.sections ?? [])
    .flatMap((section) => [section.headline, section.body])
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  const duplicateHeadlines = (page?.sections ?? []).length - new Set(
    (page?.sections ?? []).map(({ headline }) => headline?.trim().toLowerCase()).filter(Boolean)
  ).size;

  return {
    id: fixture.id,
    outcome: result.outcome,
    instructionCode,
    elapsedMs,
    recipe: diagnostics?.recipe?.recipeId ?? null,
    recipeActivated: diagnostics?.recipe?.activated ?? false,
    strategy: diagnostics?.strategy?.selectedCandidateId ?? null,
    writerModes,
    writerSource,
    fallbackCodes: diagnostics?.lifecycle.fallbackCodes ?? [],
    traceTimings: trace.timings.map(({ stage, durationMs }) => ({ stage, durationMs })),
    sectionReceipts: trace.sections.map(({ sectionId, role, writerMode, inputEvidenceRefs, status }) => ({
      sectionId,
      role,
      writerMode,
      evidenceRefCount: inputEvidenceRefs.length,
      status
    })),
    sectionCount: page?.sections.length ?? 0,
    evidenceLinkedSectionCount: (page?.sections ?? []).filter(
      ({ evidenceRefs }) => evidenceRefs.length > 0
    ).length,
    tracePresent: Boolean(trace),
    finalArtifact: production,
    copyChecks: {
      buyerSpecific: production && containsMeaningfulWords(pageText, fixture.buyer),
      offerSpecific: production && containsMeaningfulWords(pageText, fixture.offer),
      genericPhraseFree: !/(business outcomes|unlock value|transform your business|powerful solution)/i.test(
        pageText
      ),
      uniqueHeadlines: duplicateHeadlines === 0,
      primaryCtaPresent: Boolean(page?.sections.some(({ cta }) => cta?.label))
    }
  };
}

describe("V2 base experience runtime benchmark", () => {
  it("executes the production engine against every public-safe fixture", async () => {
    const runs = [];
    for (const fixture of fixtures) {
      const profile = brand(fixture);
      const activeSession = session(fixture);
      const sectionModelClient = fixture.model === "section"
        ? await acceptedModelClient(fixture, activeSession, profile)
        : fixture.model === "invalid"
          ? invalidClient()
          : fixture.model === "slow"
            ? slowClient()
            : undefined;
      const started = performance.now();
      const result = await compileSessionProductionPage({
        session: activeSession,
        brand: profile,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000,
        ...(sectionModelClient ? { sectionModelClient } : {}),
        ...(fixture.model === "slow" ? { sectionWriterDeadlineMs: 5 } : {}),
        ...(fixture.staleRevision
          ? { currentRevision: () => activeSession.revision + 1 }
          : {})
      });
      runs.push(resultSummary(fixture, result, Math.round(performance.now() - started)));
    }

    if (process.env.EMIT_V2_BASE_EXPERIENCE_BENCHMARK === "1") {
      writeFileSync(
        OUT,
        `${JSON.stringify({
          schemaVersion: "v2-base-runtime-1.1",
          generatedAt: new Date().toISOString(),
          runs
        }, null, 2)}\n`
      );
    }

    expect(runs).toHaveLength(fixtures.length);
    expect(
      runs.every(
        ({ outcome }) => outcome === "production-page" || outcome === "safe-deterministic-fallback"
      )
    ).toBe(true);
    for (const run of runs.filter(({ outcome }) => outcome === "production-page")) {
      expect(run.tracePresent, `${run.id} missing result-level BuildTrace`).toBe(true);
      expect(run.sectionCount).toBeGreaterThanOrEqual(4);
      expect(run.sectionCount).toBeLessThanOrEqual(7);
      expect(run.recipe).toBe("product-solution");
      expect(run.recipeActivated).toBe(true);
      if (run.id !== "generic-degradation") {
        expect(run.strategy, `${run.id} missing selected thesis strategy`).toBeTruthy();
      }
      expect(run.writerModes.length, `${run.id} missing observed writer mode`).toBeGreaterThan(0);
      if (run.id !== "generic-degradation") {
        expect(run.copyChecks.genericPhraseFree, `${run.id} contains generic copy`).toBe(true);
      }
    }
    for (const run of runs) {
      const fixture = fixtures.find(({ id }) => id === run.id);
      expect(fixture, `${run.id} has no fixture contract`).toBeTruthy();
      expect(run.outcome, `${run.id} returned an unexpected outcome`).toBe(
        fixture?.expectedOutcome
      );
      expect(run.instructionCode, `${run.id} returned an unexpected instruction code`).toBe(
        fixture?.expectedInstructionCode ?? null
      );
      expect(run.writerSource, `${run.id} returned an unexpected writer source`).toBe(
        fixture?.expectedWriterSource
      );
    }
  }, 65_000);
});
