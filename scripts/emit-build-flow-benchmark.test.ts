import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vitest";

import { runBuildFlowBenchmark } from "../src/lib/generation/build-flow-benchmark";

function emissionLabel(): "baseline" | "candidate" {
  const value = process.env.BUILD_FLOW_BENCHMARK_LABEL ?? "baseline";
  if (value !== "baseline" && value !== "candidate") {
    throw new Error("BUILD_FLOW_BENCHMARK_LABEL must be baseline or candidate.");
  }
  return value;
}

it("runs the benchmark and emits immutable offline evidence only when explicitly requested", async () => {
  const result = await runBuildFlowBenchmark();
  expect(result.cases).toHaveLength(30);
  if (process.env.EMIT_BUILD_FLOW_BENCHMARK !== "1") return;

  const label = emissionLabel();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = resolve("output/build-flow-benchmark");
  const htmlOutput = resolve(output, "html");
  mkdirSync(htmlOutput, { recursive: true });
  writeFileSync(resolve(output, `${label}-${stamp}.json`), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(resolve(output, `blind-review-${label}-${stamp}.json`), `${JSON.stringify(result.blindReview, null, 2)}\n`);
  for (const run of result.cases) {
    if (run.outcome !== "production-page" || !run.renderedHtml) continue;
    writeFileSync(resolve(htmlOutput, `${label}-${stamp}-${run.id}.html`), run.renderedHtml.replace(/[ \t]+$/gm, ""));
  }
});
