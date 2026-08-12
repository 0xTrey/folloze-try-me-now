#!/usr/bin/env node
// Planning-only CLI. It intentionally has no provider SDKs or credential reads.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const manifestPath = process.argv[process.argv.indexOf("--manifest") + 1];
if (!manifestPath || !process.argv.includes("--dry-run")) {
  console.error("Usage: node scripts/try-me-blob-migration.mjs --dry-run --manifest local-snapshot.json"); process.exit(2);
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest.objects)) throw new Error("manifest_objects_required");
const allowed = /^try-me\/(?:sessions\/[A-Za-z0-9_-]{20,64}\.json|leads\/[A-Za-z0-9_-]{20,64}\.json|uploads\/[A-Za-z0-9_-]{20,64}\/[0-9a-f-]{36}\.pdf|upload-status\/[A-Za-z0-9_-]{20,64}\/[0-9a-f-]{36}\.json)$/i;
let bytes = 0;
for (const item of manifest.objects) { if (!item || typeof item.key !== "string" || !allowed.test(item.key) || !Number.isSafeInteger(item.size) || item.size < 0) throw new Error("invalid_manifest_object"); bytes += item.size; }
console.log(JSON.stringify({ dryRun: true, objects: manifest.objects.length, bytes, identities: manifest.objects.map((item) => createHash("sha256").update(item.key).digest("hex")) }, null, 2));
