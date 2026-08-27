/**
 * Autoresearch loop for the messaging-compiler quality benchmark.
 *
 * The scorer lives in TypeScript under `src/lib/generation/` and there is no
 * tsx or ts-node in this repo, so this runner cannot import it. It shells out
 * to the benchmark test with `EMIT_MESSAGING_COMPILER_BENCHMARK=1` and reads
 * the JSON that test writes, the same arrangement `three-family-evaluator.mjs`
 * uses against `visual-evidence-manifest.json`, except the artifact is produced
 * on demand here rather than assumed to be on disk. Shelling out is the choice
 * because a stale artifact would silently score an older compiler.
 *
 * Two things happen, in order, and the second only matters because of the first:
 *
 * 1. The release gate. The current source tree is scored twice, back to back,
 *    from two independent benchmark emissions. Both evaluations must be free of
 *    blockers and at or above the release score before anything else counts,
 *    and the command exits non-zero when they are not. Two runs rather than one
 *    because a single clean score cannot distinguish a stable compiler from a
 *    lucky one.
 *
 * 2. The mutation experiments. Every mutation in the manifest is a *benchmark
 *    simulation*: a pure transform of the fixture manifest, scored in memory.
 *    A "revert" decision discards that simulated candidate from the loop. It
 *    does not revert, patch, or otherwise touch the source tree, and this
 *    runner never writes to `src/`.
 *
 * Retention follows `acceptance-and-autoresearch.md` literally: a strict
 * improvement before three completed experiments, then `median + 1.4826 * MAD`,
 * any blocker forces a revert, and the loop stops after five consecutive
 * reverts. The median and the MAD behind each decision are written onto the
 * record itself, so a threshold can be re-derived from the log rather than
 * taken on faith.
 *
 * This runner owns `compiler-autoresearch.jsonl` only. The legacy three-family
 * log has its own runner and is never opened here.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const HANDOFF = "docs/cursor-handoffs/2026-08-27-messaging-compiler-autoresearch/autoresearch";
const BENCHMARK_TEST = "src/lib/generation/messaging-compiler-benchmark.test.ts";
const CONSECUTIVE_REVERT_LIMIT = 5;
const STRICT_IMPROVEMENT_EXPERIMENTS = 3;
/** Scale factor that makes the MAD a consistent estimator of sigma for normal data. */
const MAD_SIGMA_SCALE = 1.4826;
/** The score the current tree must reach, twice in a row, to be releasable. */
const RELEASE_SCORE = 90;
const RELEASE_EVALUATIONS = 2;

const outputDirectory = resolve(process.cwd(), HANDOFF);
const runsPath = resolve(outputDirectory, "compiler-benchmark-runs.json");
const logPath = resolve(outputDirectory, "compiler-autoresearch.jsonl");

function sourceSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function emitBenchmarkRuns() {
  execFileSync("npx", ["vitest", "run", BENCHMARK_TEST], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, EMIT_MESSAGING_COMPILER_BENCHMARK: "1" }
  });
  return JSON.parse(readFileSync(runsPath, "utf8"));
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Median absolute deviation. Nothing in the repo has one, so it lives here. */
function medianAbsoluteDeviation(values) {
  if (values.length === 0) return 0;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** The median, the MAD, and the retention threshold the two of them imply. */
function dispersion(observed) {
  const center = median(observed);
  const mad = medianAbsoluteDeviation(observed);
  return {
    medianTotal: round2(center),
    madTotal: round2(mad),
    retentionThreshold: round2(center + MAD_SIGMA_SCALE * mad)
  };
}

function decide(run, state, stats) {
  if (run.blockers.length > 0) {
    return { decision: "revert", rationale: `hard blocker: ${run.blockers.join(", ")}` };
  }
  if (state.completed < STRICT_IMPROVEMENT_EXPERIMENTS) {
    return run.total > state.bestTotal
      ? { decision: "keep", rationale: `strict improvement over ${round2(state.bestTotal)}` }
      : {
          decision: "revert",
          rationale: `no strict improvement over ${round2(state.bestTotal)}`
        };
  }
  return run.total > stats.retentionThreshold
    ? {
        decision: "keep",
        rationale: `score above median + 1.4826 * MAD (${stats.retentionThreshold})`
      }
    : {
        decision: "revert",
        rationale: `score at or below median + 1.4826 * MAD (${stats.retentionThreshold})`
      };
}

function record(input) {
  const { run, sha, index, decision, rationale, stats, evaluationKind } = input;
  return {
    experimentId: `compiler-${sha}-${String(index).padStart(2, "0")}`,
    timestamp: new Date().toISOString(),
    sourceSha: sha,
    evaluationKind,
    candidateDigest: run.candidateDigest,
    mutation: run.mutation,
    fixtureIds: run.fixtureIds,
    dimensions: run.dimensions,
    total: run.total,
    blockerCodes: run.blockers,
    p50Ms: run.timing.p50,
    p95Ms: run.timing.p95,
    medianTotal: stats.medianTotal,
    madTotal: stats.madTotal,
    retentionThreshold: stats.retentionThreshold,
    decision,
    rationale,
    // Said on every record so a reader of the log never has to infer it: a
    // reverted mutation was discarded from this loop, not from the source tree.
    decisionScope:
      evaluationKind === "release-evaluation"
        ? "current source tree, scored as-is"
        : "benchmark simulation over the fixture manifest; no source-tree change"
  };
}

function main() {
  const sha = sourceSha();
  const records = [];

  // 1. Release gate: two consecutive evaluations of the current tree.
  const releaseTotals = [];
  const releaseRuns = [];
  let artifact;
  for (let attempt = 1; attempt <= RELEASE_EVALUATIONS; attempt += 1) {
    artifact = emitBenchmarkRuns();
    const current = artifact.runs.find((run) => run.mutation === "current");
    if (!current) throw new Error("Benchmark artifact is missing the current baseline run.");
    releaseRuns.push(current);
    releaseTotals.push(current.total);
    const clean = current.blockers.length === 0 && current.total >= RELEASE_SCORE;
    records.push(
      record({
        run: current,
        sha,
        index: records.length + 1,
        evaluationKind: "release-evaluation",
        stats: dispersion(releaseTotals),
        decision: clean ? "keep" : "revert",
        rationale: clean
          ? `release evaluation ${attempt} of ${RELEASE_EVALUATIONS}: ${current.total} >= ${RELEASE_SCORE} with no blockers`
          : `release evaluation ${attempt} of ${RELEASE_EVALUATIONS} failed: total ${current.total}, blockers [${current.blockers.join(", ")}]`
      })
    );
  }

  const releasePassed = releaseRuns.every(
    (run) => run.blockers.length === 0 && run.total >= RELEASE_SCORE
  );
  const baseline = releaseRuns[releaseRuns.length - 1];

  mkdirSync(outputDirectory, { recursive: true });

  // 2. Bounded mutation experiments. Simulations, scored in memory.
  const state = { completed: 0, bestTotal: baseline.total, observed: [baseline.total] };
  let consecutiveReverts = 0;
  let stopReason = "every bounded mutation was evaluated";
  const notEvaluated = [];

  for (const run of artifact.runs) {
    if (run.mutation === "current") continue;
    if (consecutiveReverts >= CONSECUTIVE_REVERT_LIMIT) {
      notEvaluated.push(run.mutation);
      continue;
    }
    const stats = dispersion(state.observed);
    const { decision, rationale } = decide(run, state, stats);
    records.push({
      ...record({
        run,
        sha,
        index: records.length + 1,
        evaluationKind: "benchmark-simulation",
        stats,
        decision,
        rationale
      })
    });
    state.completed += 1;
    state.observed.push(run.total);
    if (decision === "keep") {
      state.bestTotal = Math.max(state.bestTotal, run.total);
      consecutiveReverts = 0;
    } else {
      consecutiveReverts += 1;
      if (consecutiveReverts >= CONSECUTIVE_REVERT_LIMIT) {
        stopReason = `stopped after ${CONSECUTIVE_REVERT_LIMIT} consecutive reverts`;
      }
    }
  }

  appendFileSync(logPath, records.map((entry) => `${JSON.stringify(entry)}\n`).join(""));

  const simulations = records.filter(
    ({ evaluationKind }) => evaluationKind === "benchmark-simulation"
  );
  const summary = {
    metric: "messaging_compiler_release_score",
    disclaimer:
      "Four-dimension release score over deterministic fixtures. The evaluator's six-component candidate score is reported separately in the benchmark artifact.",
    mutationSemantics:
      "Every mutation below is a benchmark simulation over the fixture manifest. A revert discards the simulated candidate; nothing in the source tree is changed or reverted by this command.",
    sourceSha: sha,
    release: {
      required: `${RELEASE_EVALUATIONS} consecutive blocker-free evaluations at or above ${RELEASE_SCORE}`,
      totals: releaseTotals,
      blockerCodes: releaseRuns.flatMap((run) => run.blockers),
      ...dispersion(releaseTotals),
      passed: releasePassed
    },
    baselineTotal: baseline.total,
    bestTotal: round2(state.bestTotal),
    experimentCount: records.length,
    keptMutations: simulations
      .filter(({ decision }) => decision === "keep")
      .map(({ mutation }) => mutation),
    revertedMutations: simulations
      .filter(({ decision }) => decision === "revert")
      .map(({ mutation }) => mutation),
    notEvaluated,
    stopReason,
    log: HANDOFF.concat("/compiler-autoresearch.jsonl")
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!releasePassed) {
    process.stderr.write(
      `Release gate failed: ${RELEASE_EVALUATIONS} consecutive blocker-free evaluations at or above ${RELEASE_SCORE} are required, observed ${JSON.stringify(releaseTotals)}.\n`
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
