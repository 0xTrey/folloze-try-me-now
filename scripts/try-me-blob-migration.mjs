#!/usr/bin/env node
// Planning-only: no SDK, environment, credential, or network dependency.
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

const fail = (code, status = 2) => { process.stderr.write(`${code}\n`); process.exit(status); };
const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--dry-run" || args[1] !== "--manifest" || !args[2] || args[2].startsWith("-")) fail("invalid_arguments");
let stat;
try { stat = await lstat(args[2]); } catch { fail("manifest_unreadable"); }
if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) fail("invalid_manifest_file");
let manifest;
try { manifest = JSON.parse(await readFile(args[2], "utf8")); } catch { fail("invalid_manifest_json"); }
if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || Object.keys(manifest).length !== 1 || !Array.isArray(manifest.objects)) fail("invalid_manifest_schema");
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const allowed = new RegExp(`^try-me/(?:sessions/[A-Za-z0-9_-]{20,64}\\.json|leads/[A-Za-z0-9_-]{20,64}\\.json|uploads/[A-Za-z0-9_-]{20,64}/${uuid}\\.pdf|upload-status/[A-Za-z0-9_-]{20,64}/${uuid}\\.json)$`, "i");
let bytes = 0; const identities = new Set();
for (const item of manifest.objects) {
  if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 2 || typeof item.key !== "string" || !Number.isSafeInteger(item.size) || item.size < 0 || !allowed.test(item.key)) fail("invalid_manifest_object");
  const identity = createHash("sha256").update(item.key).digest("hex"); if (identities.has(identity)) fail("duplicate_manifest_identity"); identities.add(identity);
  if (bytes > Number.MAX_SAFE_INTEGER - item.size) fail("manifest_byte_overflow"); bytes += item.size;
}
process.stdout.write(`${JSON.stringify({ mode: "dry-run", objects: manifest.objects.length, bytes, identities: [...identities] })}\n`);
