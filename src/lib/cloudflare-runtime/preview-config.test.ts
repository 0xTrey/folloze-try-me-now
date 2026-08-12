import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import worker from "../../../cloudflare-runtime/worker";
import type { RuntimeBindings } from "@/lib/cloudflare-runtime/types";

const rootFile = (name: string) => new URL(`../../../cloudflare-runtime/${name}`, import.meta.url);

describe("preview-only Cloudflare resource bindings", () => {
  it("returns fail-closed 404 without touching any bound resource", async () => {
    const touched = vi.fn(() => { throw new Error("binding touched"); });
    const env = {
      ADAPTER_ENABLED: "disabled",
      UPLOAD_DB: { prepare: touched },
      UPLOADS: { head: touched, createMultipartUpload: touched },
      EXTRACTION_QUEUE: { send: touched },
    } as unknown as RuntimeBindings;
    const response = worker.fetch(new Request("https://preview.invalid/anything"), env);
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Not found");
    expect(touched).not.toHaveBeenCalled();
    expect("queue" in worker).toBe(false);
    expect("scheduled" in worker).toBe(false);
  });

  it("binds only named preview resources and has no active route, cron, or consumer", async () => {
    const config = JSON.parse(await readFile(rootFile("wrangler.preview.jsonc"), "utf8"));
    expect(config).toMatchObject({
      workers_dev: false,
      preview_urls: false,
      vars: { ADAPTER_ENABLED: "disabled" },
      d1_databases: [{
        binding: "UPLOAD_DB",
        database_name: "folloze-try-me-now-preview",
        database_id: "f5a087e1-018e-4586-8a71-21b58b4ddb01",
        migrations_dir: "d1/migrations",
        migrations_table: "cf_upload_adapter_migrations",
      }],
      r2_buckets: [{ binding: "UPLOADS", bucket_name: "folloze-try-me-now-uploads-preview" }],
      queues: { producers: [{ binding: "EXTRACTION_QUEUE", queue: "folloze-try-me-now-extraction-preview" }] },
    });
    expect(config.routes).toBeUndefined();
    expect(config.triggers).toBeUndefined();
    expect(config.queues.consumers).toBeUndefined();
    expect(JSON.stringify(config)).not.toMatch(/(?:^|[-_])prod(?:uction)?(?:[-_]|$)/i);
  });

  it("records the supplied empty/unbound receipt and intentionally leaves the DLQ unbound", async () => {
    const receipt = JSON.parse(await readFile(rootFile("preview-resources.json"), "utf8"));
    expect(receipt).toMatchObject({
      scope: "preview-only",
      source: "operator-provided task input",
      live_verification_performed: false,
      reported_initial_state: "empty-and-unbound",
      resources: {
        d1: { id: "f5a087e1-018e-4586-8a71-21b58b4ddb01" },
        dead_letter_queue: { binding: null, name: "folloze-try-me-now-extraction-dlq-preview" },
      },
    });
  });
});
