import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Cloudflare D1 migration isolation", () => {
  it("keeps the D1 schema and its journal outside the Neon lead migration directory", async () => {
    const neonFiles = await readdir(new URL("../../../db/migrations/", import.meta.url));
    expect(neonFiles).not.toContain("009_create_cf_upload_adapter.sql");
    const runner = await readFile(new URL("../../../scripts/migrate-leads.mjs", import.meta.url), "utf8");
    expect(runner).toContain("../db/migrations/");
    const journal = JSON.parse(await readFile(new URL("../../../cloudflare-runtime/d1/journal.json", import.meta.url), "utf8")) as { journal: string; migrations: { id: string }[] };
    expect(journal).toEqual({ journal: "try-me-now-cloudflare-d1", migrations: [{ id: "0001_create_cf_upload_adapter.sql", description: "inactive upload adapter schema" }, { id: "0002_create_migration_receipts.sql", description: "unapplied provider migration ownership receipts" }] });
  });
});
