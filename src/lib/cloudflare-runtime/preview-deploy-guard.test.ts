import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const preflight = join(root, "scripts/validate-cloudflare-preview-deploy.mjs");
const verify = join(root, "scripts/verify-cloudflare-preview-deployment.mjs");
const current = (path: string) => readFileSync(join(root, path), "utf8");
const run = (script: string, args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
const temp = () => mkdtempSync(join(tmpdir(), "try-me-cf-preview-"));

describe("disabled preview deploy preflight", () => {
  it("accepts the reviewed config, fetch-only Worker, and manual workflow", () => {
    const result = run(preflight, []);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("manual-only, disabled, fetch-only");
  });

  it.each([
    ["enabled selector", (config: Record<string, unknown>) => { (config.vars as Record<string, string>).ADAPTER_ENABLED = "enabled"; }],
    ["workers.dev URL", (config: Record<string, unknown>) => { config.workers_dev = true; }],
    ["version preview URL", (config: Record<string, unknown>) => { config.preview_urls = true; }],
    ["public route", (config: Record<string, unknown>) => { config.routes = [{ pattern: "example.com/*" }]; }],
    ["cron trigger", (config: Record<string, unknown>) => { config.triggers = { crons: ["* * * * *"] }; }],
    ["Queue consumer", (config: Record<string, unknown>) => { (config.queues as Record<string, unknown>).consumers = [{ queue: "preview" }]; }],
    ["wrong D1", (config: Record<string, unknown>) => { ((config.d1_databases as Array<Record<string, string>>)[0]).database_name = "production"; }],
  ])("rejects %s configuration", (_label, mutate) => {
    const dir = temp();
    try {
      const config = JSON.parse(current("cloudflare-runtime/wrangler.preview.jsonc"));
      mutate(config);
      const configPath = join(dir, "wrangler.preview.jsonc");
      writeFileSync(configPath, JSON.stringify(config));
      const result = run(preflight, ["--config", configPath]);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["scheduled", "queue"])("rejects a %s Worker handler", (handler) => {
    const dir = temp();
    try {
      const workerPath = join(dir, "worker.ts");
      writeFileSync(workerPath, current("cloudflare-runtime/worker.ts").replace("const worker = {", `const worker = {\n  ${handler}() {},`));
      const result = run(preflight, ["--worker", workerPath]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Worker must export only fetch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects any automatic workflow trigger", () => {
    const dir = temp();
    try {
      const workflowPath = join(dir, "workflow.yml");
      writeFileSync(workflowPath, current(".github/workflows/cloudflare-preview-adapter.yml").replace("on:\n  workflow_dispatch:", "on:\n  push:\n  workflow_dispatch:"));
      const result = run(preflight, ["--workflow", workflowPath]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("workflow must be manual-only");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const versionId = "11111111-1111-4111-8111-111111111111";
const otherVersionId = "22222222-2222-4222-8222-222222222222";
const tag = "0123456789abcdef0123456789abcdef01234567";
const api = <T,>(result: T) => ({ success: true, errors: [], messages: [], result });
const metadataFixtures = () => ({
  versions: [{ id: versionId, annotations: { "workers/tag": tag } }],
  version: {
    id: versionId,
    annotations: { "workers/tag": tag },
    metadata: { source: "wrangler" },
    resources: {
      script: { handlers: ["fetch"], named_handlers: [] },
      script_runtime: { compatibility_date: "2026-08-12" },
      bindings: [
        { name: "ADAPTER_ENABLED", type: "plain_text", text: "disabled" },
        { name: "UPLOAD_DB", type: "d1", database_id: "f5a087e1-018e-4586-8a71-21b58b4ddb01" },
        { name: "UPLOADS", type: "r2_bucket", bucket_name: "folloze-try-me-now-uploads-preview" },
        { name: "EXTRACTION_QUEUE", type: "queue", queue_name: "folloze-try-me-now-extraction-preview" },
      ],
    },
  },
  scripts: api([{ id: "try-me-now-upload-adapter-preview", routes: null as null | Array<{ pattern: string }> }]),
  subdomain: api({ enabled: false, previews_enabled: false }),
  domains: { success: true, errors: null as null | Array<{ code: number; message: string }>, messages: [], result: [] as Array<{ hostname: string }> },
  schedules: api({ schedules: [] as Array<{ cron: string }> }),
  deployment: { versions: [{ version_id: versionId, percentage: 100 }] },
});

const writeFixtures = (fixtures: ReturnType<typeof metadataFixtures>) => {
  const dir = temp();
  for (const [name, value] of Object.entries(fixtures)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(value));
  return dir;
};
const verifyArgs = (dir: string) => [
  "verify",
  "--version", join(dir, "version.json"),
  "--scripts", join(dir, "scripts.json"),
  "--subdomain", join(dir, "subdomain.json"),
  "--domains", join(dir, "domains.json"),
  "--schedules", join(dir, "schedules.json"),
  "--expected-tag", tag,
  "--expected-version", versionId,
];
const activeArgs = (dir: string) => ["active", "--deployment", join(dir, "deployment.json"), "--expected-version", versionId];

describe("post-deploy metadata verification", () => {
  it("selects the exact commit-tagged Wrangler version", () => {
    const dir = writeFixtures(metadataFixtures());
    try {
      const result = run(verify, ["select", "--versions", join(dir, "versions.json"), "--expected-tag", tag]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(versionId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts only the disabled fetch-only binding and routing metadata", () => {
    const dir = writeFixtures(metadataFixtures());
    try {
      const result = run(verify, verifyArgs(dir));
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("no public route or cron");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("also accepts an explicit empty zone-routes array", () => {
    const fixtures = metadataFixtures();
    fixtures.scripts.result[0].routes = [];
    const dir = writeFixtures(fixtures);
    try {
      const result = run(verify, verifyArgs(dir));
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires the verified version as the sole active deployment at 100%", () => {
    const dir = writeFixtures(metadataFixtures());
    try {
      const result = run(verify, activeArgs(dir));
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("sole version at 100%");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a safe tagged version when a different version is active", () => {
    const fixtures = metadataFixtures();
    fixtures.deployment.versions[0].version_id = otherVersionId;
    const dir = writeFixtures(fixtures);
    try {
      const selected = run(verify, ["select", "--versions", join(dir, "versions.json"), "--expected-tag", tag]);
      expect(selected.status, selected.stderr).toBe(0);
      expect(selected.stdout.trim()).toBe(versionId);
      const active = run(verify, activeArgs(dir));
      expect(active.status).not.toBe(0);
      expect(active.stderr).toContain("expected verified version is not the active deployment");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["split traffic", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.deployment.versions.push({ version_id: otherVersionId, percentage: 10 }); fixture.deployment.versions[0].percentage = 90; }],
    ["partial traffic", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.deployment.versions[0].percentage = 99; }],
  ])("rejects %s active-deployment metadata", (_label, mutate) => {
    const fixtures = metadataFixtures();
    mutate(fixtures);
    const dir = writeFixtures(fixtures);
    try {
      expect(run(verify, activeArgs(dir)).status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["enabled selector", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.version.resources.bindings[0].text = "enabled"; }],
    ["wrong D1", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.version.resources.bindings[1].database_id = "00000000-0000-0000-0000-000000000000"; }],
    ["queue handler", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.version.resources.script.handlers.push("queue"); }],
    ["zone route", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.scripts.result[0].routes = [{ pattern: "example.com/*" }]; }],
    ["missing zone-routes field", (fixture: ReturnType<typeof metadataFixtures>) => { delete (fixture.scripts.result[0] as { routes?: unknown }).routes; }],
    ["malformed zone-routes field", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.scripts.result[0].routes = {} as never; }],
    ["workers.dev URL", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.subdomain.result.enabled = true; }],
    ["custom domain", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.domains.result.push({ hostname: "example.com" }); }],
    ["cron trigger", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.schedules.result.schedules.push({ cron: "* * * * *" }); }],
  ])("rejects post-deploy %s metadata", (_label, mutate) => {
    const fixtures = metadataFixtures();
    mutate(fixtures);
    const dir = writeFixtures(fixtures);
    try {
      expect(run(verify, verifyArgs(dir)).status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing API errors", (fixture: ReturnType<typeof metadataFixtures>) => { delete (fixture.domains as { errors?: unknown }).errors; }],
    ["malformed API errors", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.domains.errors = {} as never; }],
    ["reported API error", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.domains.errors = [{ code: 1000, message: "synthetic failure" }]; }],
    ["unsuccessful API response", (fixture: ReturnType<typeof metadataFixtures>) => { fixture.domains.success = false; }],
  ])("rejects %s metadata envelopes", (_label, mutate) => {
    const fixtures = metadataFixtures();
    mutate(fixtures);
    const dir = writeFixtures(fixtures);
    try {
      expect(run(verify, verifyArgs(dir)).status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
