import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BUILD_FLOW_OUTCOMES_REPORT_VERSION = "build-flow-outcomes-report-v2";
const MAX_INPUT_BYTES = 10_000_000;
const MAX_EXPOSURES = 100_000;

function assertInsideRepo(repoRoot, candidate, allowMissing) {
  const absolute = path.resolve(repoRoot, candidate);
  const relative = path.relative(repoRoot, absolute);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path must be a file inside the repo");
  }
  let current = repoRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error("symlink paths are not allowed");
    }
  }
  if (!allowMissing && !fs.existsSync(absolute)) throw new Error("input file does not exist");
  return absolute;
}

function repoRoot(cwd) {
  return fs.realpathSync(
    execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
  );
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

/**
 * Node 22 cannot load this project's extensionless TypeScript import chain.
 * Transpiling the two dependency-free outcome modules into a private temp
 * directory keeps the CLI on the canonical analysis logic without adding a
 * runtime dependency or emitting any repository files.
 */
async function loadOutcomeAnalysis() {
  const typescript = await import("typescript");
  const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/generation");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "build-flow-outcomes-"));
  const files = ["buyer-journey-evaluation", "build-flow-outcomes"];
  try {
    for (const name of files) {
      const source = fs.readFileSync(path.join(sourceDir, `${name}.ts`), "utf8");
      let output = typescript.transpileModule(source, {
        compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext }
      }).outputText;
      if (name === "build-flow-outcomes") {
        output = output.replace('from "./buyer-journey-evaluation"', 'from "./buyer-journey-evaluation.mjs"');
      }
      fs.writeFileSync(path.join(temp, `${name}.mjs`), output, { mode: 0o600 });
    }
    const loadedModule = await import(`${pathToFileURL(path.join(temp, "build-flow-outcomes.mjs")).href}?nonce=${Date.now()}`);
    return loadedModule;
  } finally {
    // Imported ESM modules remain available after load. The directory contains
    // only transient transpilation output and no caller data.
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function assertInput(data) {
  if (!data || data.version !== "build-flow-outcomes-input-v2" || !data.registration || !Array.isArray(data.exposures)) {
    throw new Error("versioned registration and exposures are required");
  }
  if (data.exposures.length > MAX_EXPOSURES) throw new Error("exposure limit exceeded");
}

function reportFrom(result, asOf) {
  return {
    version: BUILD_FLOW_OUTCOMES_REPORT_VERSION,
    asOf,
    state: result.state,
    winnerDeclared: false,
    limitations: result.limitations,
    registration: {
      experimentId: result.registration.experimentId,
      version: result.registration.version,
      randomizationUnit: result.registration.randomizationUnit,
      qualifiedActionDefinition: result.registration.qualifiedActionDefinition,
      registeredAt: result.registration.registeredAt,
      startsAt: result.registration.startsAt,
      horizonEndsAt: result.registration.horizonEndsAt,
      minimumUnits: result.registration.minimumUnits,
      arms: result.registration.arms.map(({ id, label }) => ({ id, ...(label ? { label } : {}) }))
    },
    aggregate: {
      variants: result.variants.map((variant) => ({
        armId: variant.armId,
        eligibleUnits: variant.eligibleUnits,
        qualifiedActions: variant.qualifiedActions,
        uncertainty: variant.uncertainty
      })),
      invalidRecords: result.invalidRecords,
      excludedRecords: result.excludedRecords,
      deduplicatedRecords: result.deduplicatedRecords
    }
  };
}

export async function analyzeOutcomeInput(data, asOf) {
  assertInput(data);
  if (typeof asOf !== "string" || !Number.isFinite(Date.parse(asOf))) {
    throw new Error("--as-of must be a valid date");
  }
  const { summarizeRegisteredOutcomes } = await loadOutcomeAnalysis();
  return reportFrom(summarizeRegisteredOutcomes(data.registration, data.exposures, asOf), new Date(asOf).toISOString());
}

export async function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const inputArg = option(argv, "--input");
  const outputArg = option(argv, "--output");
  const asOf = option(argv, "--as-of");
  if (!inputArg || !outputArg || !asOf) throw new Error("--input, --output, and --as-of are required");
  const root = repoRoot(cwd);
  const input = assertInsideRepo(root, inputArg, false);
  const output = assertInsideRepo(root, outputArg, true);
  if (input === output) throw new Error("input and output must be distinct");
  const source = fs.readFileSync(input, "utf8");
  if (Buffer.byteLength(source) > MAX_INPUT_BYTES) throw new Error("input exceeds size limit");
  const report = await analyzeOutcomeInput(JSON.parse(source), asOf);
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
