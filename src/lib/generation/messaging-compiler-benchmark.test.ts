/**
 * Quality assertions for the messaging-compiler benchmark, plus the artifact
 * the autoresearch runner consumes.
 *
 * The emission is gated on `EMIT_MESSAGING_COMPILER_BENCHMARK=1` for the same
 * reason `scripts/emit-build-trace-evidence.test.ts` gates its own: there is no
 * tsx or ts-node in this repo, so a `.mjs` runner cannot reach into `src/`. A
 * vitest test is the only sanctioned way to run TypeScript from a script path,
 * and running the assertions on every `npm test` is what keeps the artifact
 * honest between emissions.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MESSAGING_COMPILER_BENCHMARK_VERSION,
  MESSAGING_COMPILER_MUTATION_NAMES,
  MUTATIONS,
  compileMessagingCompilerFixture,
  messagingCompilerStrategyProse,
  runMessagingCompilerBenchmark,
  scoreMessagingCompilerFixture
} from "@/lib/generation/messaging-compiler-benchmark";
import {
  MESSAGING_COMPILER_FIXTURES,
  messagingCompilerFixture
} from "../../../tests/fixtures/messaging-compiler/fixtures";

const SHOULD_WRITE = process.env.EMIT_MESSAGING_COMPILER_BENCHMARK === "1";

const OUT = join(
  process.cwd(),
  "docs",
  "cursor-handoffs",
  "2026-08-27-messaging-compiler-autoresearch",
  "autoresearch"
);

function selectedProse(fixtureId: (typeof MESSAGING_COMPILER_FIXTURES)[number]["id"]): string {
  const { result } = compileMessagingCompilerFixture(messagingCompilerFixture(fixtureId));
  const selected = result.selection.selected;
  if (!selected) throw new Error(`Fixture selected no strategy: ${fixtureId}`);
  return messagingCompilerStrategyProse(selected);
}

describe("messaging compiler quality benchmark", () => {
  it("compiles and scores every reviewed fixture without a blocker", () => {
    expect(MESSAGING_COMPILER_FIXTURES.map(({ id }) => id)).toEqual([
      "adp-launch",
      "apple-guide",
      "servicetitan-align",
      "product",
      "event",
      "sparse-brand",
      "no-evidence"
    ]);

    const run = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "current");
    expect(run.version).toBe(MESSAGING_COMPILER_BENCHMARK_VERSION);
    expect(run.fixtures).toHaveLength(7);
    expect(run.blockers).toEqual([]);
    for (const fixture of run.fixtures) {
      expect(fixture.blockers, `${fixture.fixtureId} blockers`).toEqual([]);
      expect(fixture.selectedStrategyId, `${fixture.fixtureId} selection`).toBeDefined();
      expect(fixture.total).toBeGreaterThan(0);
      expect(fixture.total).toBeLessThanOrEqual(100);
    }
    expect(run.total).toBeGreaterThanOrEqual(80);
  });

  it("reports the release score and the six-component candidate score side by side", () => {
    const score = scoreMessagingCompilerFixture(messagingCompilerFixture("adp-launch"));
    const dimensionTotal = Object.values(score.dimensions).reduce((sum, value) => sum + value, 0);
    expect(Math.round(dimensionTotal * 100) / 100).toBe(score.total);
    expect(score.strategyScore?.candidateId).toBe(score.selectedStrategyId);
    expect(Object.keys(score.strategyScore?.dimensions ?? {})).toEqual([
      "audienceRelevance",
      "offerSpecificity",
      "differentiation",
      "evidenceStrength",
      "narrativeCoherence",
      "ctaAlignment"
    ]);
    expect(score.strategyEvaluations.length).toBeGreaterThan(1);

    // The two scores measure different things, so at least one fixture has to
    // separate them; a run where they always agreed would mean one is derived.
    const run = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "current");
    expect(
      run.fixtures.some((fixture) => fixture.strategyScore?.total !== fixture.total)
    ).toBe(true);
  });

  it("rejects a deliberately degraded candidate instead of scoring it as acceptable", () => {
    const baseline = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "current");
    const degraded = runMessagingCompilerBenchmark(
      MESSAGING_COMPILER_FIXTURES,
      "audience-specificity"
    );
    expect(degraded.blockers).toContain("generic_recommendation_as_truth");
    expect(degraded.blockers).toContain("required_gate_failure");
    expect(degraded.total).toBeLessThan(baseline.total);
    expect(degraded.fixtures.every(({ selectedStrategyId }) => selectedStrategyId === undefined))
      .toBe(true);
  });

  it("penalizes swappable mechanism copy without pretending it is a blocker", () => {
    const baseline = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "current");
    const degraded = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "offer-mechanism");
    expect(degraded.total).toBeLessThan(baseline.total);
    expect(degraded.dimensions.buyerSpecificityAndEvidence).toBeLessThan(
      baseline.dimensions.buyerSpecificityAndEvidence
    );
  });

  it("raises an unresolved evidence reference when a brand role loses its source", () => {
    const degraded = runMessagingCompilerBenchmark(
      MESSAGING_COMPILER_FIXTURES,
      "brand-role-reconciliation"
    );
    expect(degraded.blockers).toContain("unresolved_evidence_reference");
  });

  it("raises an unsafe allocation when one asset is reused for two semantic roles", () => {
    const degraded = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "image-allocation");
    expect(degraded.blockers).toContain("unsafe_image_allocation");
  });

  it("omits rather than invents when the fixture has no researched evidence", () => {
    const fixture = messagingCompilerFixture("no-evidence");
    const score = scoreMessagingCompilerFixture(fixture);
    const prose = selectedProse("no-evidence").toLocaleLowerCase();

    expect(score.blockers).toEqual([]);
    for (const claim of fixture.prohibitedClaims) {
      expect(prose).not.toContain(claim.toLocaleLowerCase());
    }
    expect(score.dimensions.reliabilityAndHonesty).toBeGreaterThanOrEqual(22);
    expect(prose).toMatch(/validation plan|verify|test each/i);
  });

  it("keeps every fixture clear of its own prohibited claims", () => {
    for (const fixture of MESSAGING_COMPILER_FIXTURES) {
      const prose = selectedProse(fixture.id).toLocaleLowerCase();
      for (const claim of fixture.prohibitedClaims) {
        expect(prose, `${fixture.id} must omit "${claim}"`).not.toContain(
          claim.toLocaleLowerCase()
        );
      }
    }
  });

  it("scores identically across repeated runs", () => {
    const first = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "current");
    const second = runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, "current");
    expect(second.dimensions).toEqual(first.dimensions);
    expect(second.total).toBe(first.total);
    expect(second.blockers).toEqual(first.blockers);
    expect(second.candidateDigest).toBe(first.candidateDigest);
    expect(second.fixtures.map(({ missedChecks }) => missedChecks)).toEqual(
      first.fixtures.map(({ missedChecks }) => missedChecks)
    );
  });

  it("keeps every bounded mutation a pure transform of the fixture manifest", () => {
    const snapshot = JSON.stringify(MESSAGING_COMPILER_FIXTURES);
    for (const name of MESSAGING_COMPILER_MUTATION_NAMES) {
      const mutated = MESSAGING_COMPILER_FIXTURES.map(MUTATIONS[name]);
      expect(mutated).toHaveLength(MESSAGING_COMPILER_FIXTURES.length);
      expect(JSON.stringify(MESSAGING_COMPILER_FIXTURES)).toBe(snapshot);
    }
  });

  it("emits the run artifact the autoresearch loop consumes", () => {
    const runs = MESSAGING_COMPILER_MUTATION_NAMES.map((mutation) =>
      runMessagingCompilerBenchmark(MESSAGING_COMPILER_FIXTURES, mutation)
    );
    const artifact = {
      version: MESSAGING_COMPILER_BENCHMARK_VERSION,
      fixtureIds: MESSAGING_COMPILER_FIXTURES.map(({ id }) => id),
      runs
    };

    // Nothing published here may carry source text, an address, or a live URL.
    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toMatch(/https?:\/\/|[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(runs[0]?.timing.p95).toBeLessThan(250);

    if (!SHOULD_WRITE) return;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, "compiler-benchmark-runs.json"),
      `${JSON.stringify(artifact, null, 2)}\n`
    );
    process.stdout.write(
      [
        `benchmark=${MESSAGING_COMPILER_BENCHMARK_VERSION}`,
        `mutations=${runs.length}`,
        `baselineTotal=${runs[0]?.total}`,
        `p50=${runs[0]?.timing.p50}ms`,
        `p95=${runs[0]?.timing.p95}ms`,
        ""
      ].join("\n")
    );
  });
});
