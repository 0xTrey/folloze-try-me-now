import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import ts from "typescript";

const CONFIG_NAME = "try-me-now-upload-adapter-preview";
const CONFIG_PATH = "cloudflare-runtime/wrangler.preview.jsonc";
const WORKER_PATH = "cloudflare-runtime/worker.ts";
const WORKFLOW_PATH = ".github/workflows/cloudflare-preview-adapter.yml";
const EXPECTED_TOP_LEVEL = [
  "$schema",
  "compatibility_date",
  "d1_databases",
  "main",
  "name",
  "preview_urls",
  "queues",
  "r2_buckets",
  "vars",
  "workers_dev",
].sort();

const { values } = parseArgs({
  options: {
    config: { type: "string", default: CONFIG_PATH },
    worker: { type: "string", default: WORKER_PATH },
    workflow: { type: "string", default: WORKFLOW_PATH },
  },
});

const assert = (condition, message) => {
  if (!condition) throw new Error(`preview deploy preflight: ${message}`);
};
const ownKeys = (value) => Object.keys(value ?? {}).sort();
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

const config = JSON.parse(await readFile(values.config, "utf8"));
assert(same(ownKeys(config), EXPECTED_TOP_LEVEL), `unexpected Wrangler top-level keys: ${ownKeys(config).join(", ")}`);
assert(config.name === CONFIG_NAME, "unexpected Worker name");
assert(config.main === "worker.ts", "preview config must use the isolated worker.ts entry");
assert(config.vars?.ADAPTER_ENABLED === "disabled" && same(ownKeys(config.vars), ["ADAPTER_ENABLED"]), "ADAPTER_ENABLED must be the only variable and remain disabled");
assert(config.workers_dev === false && config.preview_urls === false, "workers.dev and version preview URLs must remain disabled");
assert(config.routes === undefined && config.route === undefined && config.triggers === undefined, "routes and triggers are forbidden");
assert(same(ownKeys(config.queues), ["producers"]), "Queue consumers and other Queue configuration are forbidden");
assert(config.queues.producers?.length === 1, "exactly one Queue producer is required");

const [d1] = config.d1_databases ?? [];
const [r2] = config.r2_buckets ?? [];
const [queue] = config.queues.producers;
assert(config.d1_databases?.length === 1 && d1.binding === "UPLOAD_DB" && d1.database_name === "folloze-try-me-now-preview" && d1.database_id === "f5a087e1-018e-4586-8a71-21b58b4ddb01" && d1.preview_database_id === d1.database_id, "unexpected preview D1 binding");
assert(d1.migrations_dir === "d1/migrations" && d1.migrations_table === "cf_upload_adapter_migrations", "D1 must use the dedicated migration path and journal");
assert(config.r2_buckets?.length === 1 && r2.binding === "UPLOADS" && r2.bucket_name === "folloze-try-me-now-uploads-preview" && r2.preview_bucket_name === r2.bucket_name, "unexpected preview R2 binding");
assert(queue.binding === "EXTRACTION_QUEUE" && queue.queue === "folloze-try-me-now-extraction-preview", "unexpected preview Queue producer binding");
for (const resourceName of [d1.database_name, r2.bucket_name, queue.queue]) assert(resourceName.endsWith("-preview"), `non-preview resource name: ${resourceName}`);

const workerSource = await readFile(values.worker, "utf8");
const sourceFile = ts.createSourceFile(values.worker, workerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const variables = new Map();
const defaultExports = [];
for (const statement of sourceFile.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) variables.set(declaration.name.text, declaration.initializer);
    }
  }
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) defaultExports.push(statement.expression);
  if (ts.isExportDeclaration(statement)) assert(false, "named or re-exported Worker entrypoints are forbidden");
  assert(ts.isImportDeclaration(statement) || ts.isVariableStatement(statement) || ts.isExportAssignment(statement), "unexpected top-level Worker statement");
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
  if (!ts.isExportAssignment(statement) && modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) assert(false, "named Worker exports are forbidden");
}
assert(defaultExports.length === 1, "exactly one default Worker export is required");
const exported = ts.isIdentifier(defaultExports[0]) ? variables.get(defaultExports[0].text) : defaultExports[0];
assert(exported && ts.isObjectLiteralExpression(exported), "default Worker export must resolve to an object literal");
const handlers = exported.properties.map((property) => {
  assert(!ts.isSpreadAssignment(property), "spread handlers are forbidden");
  assert(ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property), "Worker handlers must be static methods or properties");
  assert(property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), "computed Worker handlers are forbidden");
  return property.name.text;
}).sort();
assert(same(handlers, ["fetch"]), `Worker must export only fetch; found: ${handlers.join(", ")}`);

const workflow = await readFile(values.workflow, "utf8");
const lines = workflow.split(/\r?\n/);
const topBlock = (key) => {
  const start = lines.findIndex((line) => line === `${key}:`);
  assert(start >= 0, `workflow is missing top-level ${key}`);
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !line.startsWith(" ") && !line.startsWith("#")) break;
    block.push(line);
  }
  return block;
};
const triggerKeys = topBlock("on").flatMap((line) => {
  const match = /^  ([A-Za-z_][\w-]*):/.exec(line);
  return match ? [match[1]] : [];
});
assert(same(triggerKeys, ["workflow_dispatch"]), `workflow must be manual-only; found triggers: ${triggerKeys.join(", ")}`);
assert(/environment:\s*\n\s+name: cloudflare-preview/.test(workflow), "deploy job must use the cloudflare-preview environment");
assert(workflow.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"), "workflow must use the named environment secret");
assert(workflow.includes("CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}"), "workflow must use the named environment variable");
assert(workflow.includes('WRANGLER_VERSION: "4.122.0"'), "Wrangler must remain pinned to 4.122.0");

const deployLines = lines.filter((line) => line.includes('"wrangler@${WRANGLER_VERSION}" deploy'));
assert(deployLines.length === 2, "workflow must contain exactly one dry-run and one deployment command");
assert(deployLines.filter((line) => line.includes("--dry-run")).length === 1, "exactly one Wrangler dry-run is required");
assert(deployLines.every((line) => line.includes('--config "${WRANGLER_CONFIG}"') && line.includes("--strict") && line.includes("--autoconfig=false")), "Wrangler deploy commands must use the exact config, strict mode, and no autoconfig");
assert(deployLines.find((line) => !line.includes("--dry-run"))?.includes('--tag "${VERSION_TAG}"'), "deployment must use the unique commit/run/attempt tag");
assert(!/(wrangler[^\n]*(?:\bd1\b|\br2\b|\bqueues?\b)|migrations?\s+apply|\/d1\/|\/r2\/|\/queues\/)/i.test(workflow), "workflow may not invoke migration or resource/data commands");

const apiLines = lines.filter((line) => line.includes("https://api.cloudflare.com"));
const allowedMetadataPaths = [
  "/workers/scripts\"",
  "/workers/scripts/${WORKER_NAME}/subdomain\"",
  "/workers/scripts/${WORKER_NAME}/schedules\"",
  "/workers/domains?service=${WORKER_NAME}\"",
];
assert(apiLines.length === allowedMetadataPaths.length, "post-deploy must use only the four allowlisted metadata requests");
for (const line of apiLines) assert(allowedMetadataPaths.some((path) => line.includes(path)), `non-allowlisted Cloudflare API request: ${line.trim()}`);

process.stdout.write("preview deploy preflight passed: manual-only, disabled, fetch-only, no public route/cron/consumer, preview bindings only\n");
