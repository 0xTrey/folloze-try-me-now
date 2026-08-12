import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const WORKER_NAME = "try-me-now-upload-adapter-preview";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assert = (condition, message) => {
  if (!condition) throw new Error(`preview deployment verification: ${message}`);
};
const jsonFile = async (path) => JSON.parse(await readFile(path, "utf8"));
const tagOf = (version) => version.annotations?.["workers/tag"];

const [mode, ...args] = process.argv.slice(2);
assert(mode === "select" || mode === "verify" || mode === "active", "first argument must be select, verify, or active");

if (mode === "select") {
  const { values } = parseArgs({ args, options: { versions: { type: "string" }, "expected-tag": { type: "string" } } });
  assert(values.versions && values["expected-tag"], "select requires --versions and --expected-tag");
  const versions = await jsonFile(values.versions);
  assert(Array.isArray(versions), "Wrangler versions list must return an array");
  const matching = versions.filter((version) => tagOf(version) === values["expected-tag"]);
  assert(matching.length === 1 && UUID.test(matching[0].id), "exactly one tagged deployed version must be present");
  process.stdout.write(`${matching[0].id}\n`);
  process.exit(0);
}

if (mode === "active") {
  const { values } = parseArgs({ args, options: { deployment: { type: "string" }, "expected-version": { type: "string" } } });
  assert(values.deployment && values["expected-version"], "active requires --deployment and --expected-version");
  const deployment = await jsonFile(values.deployment);
  assert(Array.isArray(deployment?.versions), "Wrangler deployment status must include a versions array");
  assert(deployment.versions.length === 1, "active deployment must contain exactly one version");
  const [active] = deployment.versions;
  assert(active.version_id === values["expected-version"] && UUID.test(active.version_id), "expected verified version is not the active deployment");
  assert(active.percentage === 100, "expected verified version must receive exactly 100% of traffic");
  process.stdout.write(`verified active deployment: ${active.version_id} is the sole version at 100%\n`);
  process.exit(0);
}

const { values } = parseArgs({
  args,
  options: {
    version: { type: "string" },
    scripts: { type: "string" },
    subdomain: { type: "string" },
    domains: { type: "string" },
    schedules: { type: "string" },
    "expected-tag": { type: "string" },
    "expected-version": { type: "string" },
  },
});
for (const key of ["version", "scripts", "subdomain", "domains", "schedules", "expected-tag", "expected-version"]) assert(values[key], `verify requires --${key}`);

const [version, scripts, subdomain, domains, schedules] = await Promise.all([
  jsonFile(values.version),
  jsonFile(values.scripts),
  jsonFile(values.subdomain),
  jsonFile(values.domains),
  jsonFile(values.schedules),
]);
const envelope = (value, label) => {
  const errors = value?.errors;
  const successfulErrors = errors === null || (Array.isArray(errors) && errors.length === 0);
  assert(value?.success === true && Object.hasOwn(value, "errors") && successfulErrors, `${label} API metadata request failed`);
  return value.result;
};

assert(version.id === values["expected-version"] && UUID.test(version.id), "version ID mismatch");
assert(tagOf(version) === values["expected-tag"], "deployed version tag mismatch");
assert(version.metadata?.source === "wrangler", "deployed version source must be Wrangler");
assert(JSON.stringify([...(version.resources?.script?.handlers ?? [])].sort()) === JSON.stringify(["fetch"]), "deployed Worker must expose only fetch");
assert((version.resources?.script?.named_handlers ?? []).length === 0, "named Worker handlers are forbidden");
assert(version.resources?.script_runtime?.compatibility_date === "2026-08-12", "compatibility date mismatch");

const bindings = version.resources?.bindings;
assert(Array.isArray(bindings) && bindings.length === 4, "deployed version must have exactly four bindings");
const binding = (name, type) => {
  const matching = bindings.filter((candidate) => candidate.name === name && candidate.type === type);
  assert(matching.length === 1, `missing or duplicate ${name} ${type} binding`);
  return matching[0];
};
assert(binding("ADAPTER_ENABLED", "plain_text").text === "disabled", "deployed adapter selector must remain disabled");
assert(binding("UPLOAD_DB", "d1").database_id === "f5a087e1-018e-4586-8a71-21b58b4ddb01", "deployed D1 binding mismatch");
assert(binding("UPLOADS", "r2_bucket").bucket_name === "folloze-try-me-now-uploads-preview", "deployed R2 binding mismatch");
assert(binding("EXTRACTION_QUEUE", "queue").queue_name === "folloze-try-me-now-extraction-preview", "deployed Queue binding mismatch");

const scriptsResult = envelope(scripts, "scripts");
assert(Array.isArray(scriptsResult), "scripts metadata result must be an array");
const deployedScript = scriptsResult.filter((script) => script.id === WORKER_NAME);
assert(deployedScript.length === 1, "deployed Worker must be present exactly once in scripts metadata");
assert(Object.hasOwn(deployedScript[0], "routes"), "deployed Worker scripts metadata must include zone routes");
const zoneRoutes = deployedScript[0].routes;
assert(zoneRoutes === null || (Array.isArray(zoneRoutes) && zoneRoutes.length === 0), "deployed Worker must have no zone routes");
const subdomainResult = envelope(subdomain, "subdomain");
assert(subdomainResult?.enabled === false && subdomainResult?.previews_enabled === false, "workers.dev and preview URLs must remain disabled remotely");
const domainsResult = envelope(domains, "domains");
assert(Array.isArray(domainsResult) && domainsResult.length === 0, "deployed Worker must have no custom domains");
const schedulesResult = envelope(schedules, "schedules");
assert(Array.isArray(schedulesResult?.schedules) && schedulesResult.schedules.length === 0, "deployed Worker must have no cron triggers");

process.stdout.write(`verified disabled preview Worker version ${version.id}: fetch-only, four expected bindings, no public route or cron\n`);
