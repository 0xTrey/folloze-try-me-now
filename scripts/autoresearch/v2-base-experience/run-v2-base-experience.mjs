import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const outputDirectory = resolve(
  root,
  "docs/cursor-handoffs/2026-08-27-v2-final-only-base-experience/evidence"
);
const runtimeArtifactPath = resolve(outputDirectory, "v2-base-experience-runtime-runs.json");
const releaseArtifactPath = resolve(outputDirectory, "v2-base-experience-latest.json");
const degradedArtifactPath = resolve(outputDirectory, "v2-base-experience-degraded.json");
const fixtures = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/v2-base-experience/fixtures.json"), "utf8")
);

function average(values) {
  if (values.length === 0) return null;
  return Math.round(
    (values.reduce((sum, value) => sum + value, 0) / values.length) * 100
  ) / 100;
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * percentileValue)
  );
  return sorted[index];
}

function runRuntimeBenchmark(includeDegraded) {
  execFileSync(
    "npx",
    ["vitest", "run", "src/lib/generation/v2-base-experience-benchmark.test.ts"],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        EMIT_V2_BASE_EXPERIENCE_BENCHMARK: "1",
        ...(includeDegraded
          ? { INCLUDE_V2_BASE_EXPERIENCE_DEGRADED: "1" }
          : {})
      }
    }
  );
  return JSON.parse(readFileSync(runtimeArtifactPath, "utf8")).runs;
}

function contractBlockers(fixture, run, includeDegraded) {
  const blockers = [];
  if (run.outcome !== fixture.expectedOutcome) {
    blockers.push(`unexpected_outcome_${run.outcome}`);
  }
  if ((run.instructionCode ?? null) !== (fixture.expectedInstructionCode ?? null)) {
    blockers.push(`unexpected_instruction_${run.instructionCode ?? "none"}`);
  }
  if (run.writerSource !== fixture.expectedWriterSource) {
    blockers.push(`unexpected_writer_${run.writerSource}`);
  }
  if (run.elapsedMs > 60_000) blockers.push("runtime_over_60s");

  if (fixture.qualityFixture) {
    if (run.outcome !== "production-page") blockers.push("quality_fixture_not_rendered");
    if (!run.tracePresent) blockers.push("missing_trace");
    if (!run.recipeActivated || run.recipe !== "product-solution") {
      blockers.push("wrong_recipe");
    }
    if (!run.strategy) blockers.push("missing_strategy");
    if (run.sectionCount < 4 || run.sectionCount > 7) blockers.push("invalid_section_count");
    const evidenceRequiredSections = (run.sectionReceipts ?? []).filter(
      ({ role }) => role !== "next-move"
    );
    if (evidenceRequiredSections.some(({ evidenceRefCount }) => evidenceRefCount === 0)) {
      blockers.push("section_without_evidence");
    }
    if (!run.copyChecks.buyerSpecific) blockers.push("buyer_not_specific");
    if (!run.copyChecks.offerSpecific) blockers.push("offer_not_specific");
    if (!run.copyChecks.genericPhraseFree) blockers.push("generic_copy");
    if (!run.copyChecks.uniqueHeadlines) blockers.push("duplicate_headlines");
    if (!run.copyChecks.primaryCtaPresent) blockers.push("missing_cta");
    if (!Array.isArray(run.traceTimings) || run.traceTimings.length === 0) {
      blockers.push("missing_stage_timings");
    }
  }

  if (includeDegraded && fixture.degraded && !run.copyChecks.genericPhraseFree) {
    blockers.push("generic_candidate_rejected");
  }
  return [...new Set(blockers)];
}

function dimensionScores(run, blockers) {
  const buyerOfferSpecificity = Math.min(
    25,
    (run.copyChecks.buyerSpecific ? 7 : 0) +
      (run.copyChecks.offerSpecific ? 7 : 0) +
      (run.copyChecks.genericPhraseFree ? 5 : 0) +
      (run.copyChecks.uniqueHeadlines ? 3 : 0) +
      (run.copyChecks.primaryCtaPresent ? 3 : 0)
  );
  const evidenceRequiredSections = (run.sectionReceipts ?? []).filter(
    ({ role }) => role !== "next-move"
  );
  const evidenceRatio = evidenceRequiredSections.length > 0
    ? evidenceRequiredSections.filter(({ evidenceRefCount }) => evidenceRefCount > 0).length /
      evidenceRequiredSections.length
    : 0;
  const evidenceTrust = Math.min(
    25,
    (run.tracePresent ? 6 : 0) +
      Math.round(evidenceRatio * 10) +
      (run.instructionCode === null ? 4 : 0) +
      (blockers.length === 0 ? 5 : 0)
  );
  const argumentPageQuality = Math.min(
    25,
    (run.sectionCount >= 4 && run.sectionCount <= 7 ? 5 : 0) +
      (run.recipe === "product-solution" ? 5 : 0) +
      (run.strategy ? 5 : 0) +
      (run.copyChecks.uniqueHeadlines ? 4 : 0) +
      (run.copyChecks.primaryCtaPresent ? 3 : 0) +
      (run.copyChecks.genericPhraseFree ? 3 : 0)
  );
  const brandFlowReliability = Math.min(
    25,
    (run.elapsedMs <= 60_000 ? 8 : 0) +
      (run.finalArtifact ? 4 : 0) +
      (run.recipeActivated ? 4 : 0) +
      (run.writerSource !== "none" ? 4 : 0) +
      (blockers.length === 0 ? 5 : 0)
  );
  return {
    buyerOfferSpecificity,
    evidenceTrust,
    argumentPageQuality,
    brandFlowReliability
  };
}

function timingSummary(rows) {
  const stageDurations = new Map();
  for (const row of rows) {
    for (const timing of row.traceTimings ?? []) {
      const values = stageDurations.get(timing.stage) ?? [];
      values.push(timing.durationMs);
      stageDurations.set(timing.stage, values);
    }
  }
  return Object.fromEntries(
    [...stageDurations.entries()].map(([stage, values]) => [
      stage,
      {
        p50Ms: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        samples: values.length
      }
    ])
  );
}

function evaluate(includeDegraded) {
  const runtimeRows = runRuntimeBenchmark(includeDegraded);
  const rows = runtimeRows
    .filter((run) => includeDegraded || run.id !== "generic-degradation")
    .map((run) => {
      const fixture = fixtures.find(({ id }) => id === run.id);
      if (!fixture) throw new Error(`missing_fixture_contract:${run.id}`);
      const blockers = contractBlockers(fixture, run, includeDegraded);
      const dimensions = fixture.qualityFixture
        ? dimensionScores(run, blockers)
        : null;
      return {
        ...run,
        expectedOutcome: fixture.expectedOutcome,
        expectedInstructionCode: fixture.expectedInstructionCode ?? null,
        expectedWriterSource: fixture.expectedWriterSource,
        qualityFixture: fixture.qualityFixture,
        degradedFixture: Boolean(fixture.degraded),
        blockers,
        dimensions,
        total: dimensions
          ? Object.values(dimensions).reduce((sum, value) => sum + value, 0)
          : null
      };
    });
  const qualityRows = rows.filter(({ qualityFixture }) => qualityFixture);
  const total = average(qualityRows.map(({ total }) => total));
  const blockers = rows.flatMap((row) =>
    row.blockers.map((code) => `${row.id}:${code}`)
  );
  const dimensionNames = [
    "buyerOfferSpecificity",
    "evidenceTrust",
    "argumentPageQuality",
    "brandFlowReliability"
  ];

  return {
    schemaVersion: "v2-base-runtime-evaluation-1.1",
    evaluationKind: includeDegraded
      ? "deliberate-degradation"
      : "release-evaluation",
    fixtureCount: rows.length,
    qualityFixtureCount: qualityRows.length,
    total,
    dimensions: Object.fromEntries(
      dimensionNames.map((name) => [
        name,
        average(qualityRows.map(({ dimensions }) => dimensions[name]))
      ])
    ),
    blockers,
    totalTiming: {
      p50Ms: percentile(rows.map(({ elapsedMs }) => elapsedMs), 0.5),
      p95Ms: percentile(rows.map(({ elapsedMs }) => elapsedMs), 0.95)
    },
    stageTimings: timingSummary(rows),
    writerSourceDistribution: Object.fromEntries(
      [...new Set(rows.map(({ writerSource }) => writerSource))].map((source) => [
        source,
        rows.filter(({ writerSource }) => writerSource === source).length
      ])
    ),
    fallbackRate: rows.filter(({ outcome }) => outcome !== "production-page").length / rows.length,
    recipeDistribution: Object.fromEntries(
      [...new Set(rows.map(({ recipe }) => recipe ?? "none"))].map((recipe) => [
        recipe,
        rows.filter(({ recipe: selected }) => (selected ?? "none") === recipe).length
      ])
    ),
    strategyDistribution: Object.fromEntries(
      [...new Set(rows.map(({ strategy }) => strategy ?? "none"))].map((strategy) => [
        strategy,
        rows.filter(({ strategy: selected }) => (selected ?? "none") === strategy).length
      ])
    ),
    fixtureResults: rows,
    passed: blockers.length === 0 && total !== null && total >= 90
  };
}

const includeDegraded = process.argv.includes("--include-degraded");
const evaluations = [evaluate(includeDegraded), evaluate(includeDegraded)];
const degradationDetected = includeDegraded && evaluations.every(
  ({ blockers }) => blockers.some((code) => code.endsWith(":generic_candidate_rejected"))
);
const releasePassed = !includeDegraded && evaluations.every(({ passed }) => passed);
const report = {
  ...evaluations[1],
  releaseRuns: evaluations.map(({ total, blockers, passed }) => ({ total, blockers, passed })),
  releasePassed,
  degradationDetected,
  limitations: [
    "Vitest executes the real session production compiler with deterministic public-safe inputs.",
    "No network or secrets are used.",
    "Compiler stage timings are measured from private BuildTrace receipts. Persistence and readback are covered by lifecycle tests and browser verification."
  ]
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  includeDegraded ? degradedArtifactPath : releaseArtifactPath,
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify({
  evaluationKind: report.evaluationKind,
  total: report.total,
  blockers: report.blockers,
  totalTiming: report.totalTiming,
  releasePassed: report.releasePassed,
  degradationDetected: report.degradationDetected
}, null, 2));

if (includeDegraded) {
  process.exitCode = degradationDetected ? 1 : 2;
} else if (!releasePassed) {
  process.exitCode = 1;
}
