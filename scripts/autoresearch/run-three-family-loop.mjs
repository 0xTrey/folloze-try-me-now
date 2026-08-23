import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateThreeFamilyArtifacts } from "./three-family-evaluator.mjs";

const outputDirectory = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-23-three-family-production-system/evidence/autoresearch"
);
const candidates = [
  "current",
  "family-threshold",
  "section-shape",
  "evidence-authority",
  "sparse-asset",
  "cta-semantics",
  "copy-hierarchy"
];
const iterations = [];
let best = {
  iteration: 0,
  mutation: "none",
  manifestContractScore: -1,
  blockers: []
};
let iterationsWithoutImprovement = 0;

for (const [index, mutation] of candidates.entries()) {
  const result = evaluateThreeFamilyArtifacts(mutation);
  const retained =
    result.passed && result.manifestContractScore > best.manifestContractScore;
  const iteration = {
    iteration: index + 1,
    changedVariable: mutation,
    ...result,
    retained
  };
  iterations.push(iteration);
  if (retained) {
    best = {
      iteration: iteration.iteration,
      mutation,
      manifestContractScore: result.manifestContractScore,
      blockers: result.blockers
    };
    iterationsWithoutImprovement = 0;
  } else {
    iterationsWithoutImprovement += 1;
  }
  if (iterations.length >= 5 && iterationsWithoutImprovement >= 2) break;
}

const summary = {
  metric: "manifest_contract_score",
  disclaimer: "Contract/runtime integrity only; not a product-design or live-provider score.",
  baselineManifestContractScore: null,
  baselineNote:
    "The prior 43/100 used a different quality rubric and is intentionally not compared to this manifest contract score.",
  best,
  stopReason:
    best.manifestContractScore === 100
      ? "all rubric checks passed"
      : "two bounded iterations produced no improvement",
  iterationCount: iterations.length,
  iterations
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  resolve(outputDirectory, "three-family-loop.json"),
  `${JSON.stringify(summary, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
