import { createHash } from "node:crypto";

const PATHS = [{ prefix: "try-me/sessions/", type: "session" }, { prefix: "try-me/leads/", type: "lead" }];
const SIMPLE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const canonical = (value) => JSON.stringify(value, (_key, item) => !item || typeof item !== "object" || Array.isArray(item) ? item : Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])));
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const strongEtag = (etag) => typeof etag === "string" && etag.length <= 1024 ? etag.replace(/^W\//, "") : "";
const envelope = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value) && value.version === 1 && value.algorithm === "AES-256-GCM" && typeof value.keyId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.keyId) && typeof value.nonce === "string" && /^[A-Za-z0-9+/]{16}$/.test(value.nonce) && typeof value.tag === "string" && /^[A-Za-z0-9+/]{22}==$/.test(value.tag) && typeof value.ciphertext === "string" && value.ciphertext.length > 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value.ciphertext));

export function migrationContext(pathname) {
  if (typeof pathname !== "string") return null;
  for (const { prefix, type } of PATHS) {
    if (!pathname.startsWith(prefix) || !pathname.endsWith(".json")) continue;
    const id = pathname.slice(prefix.length, -5);
    if (SIMPLE_ID.test(id)) return { type, id };
  }
  return null;
}
function failure(result, code) { result.failed += 1; result.errors.push(code); }
function precondition(error) { return error instanceof Error && error.name === "BlobPreconditionFailedError"; }
async function one({ storage, protectJson, unprotectJson, apply, result, pathname, context }) {
  result.scanned += 1;
  try {
    const current = await storage.get(pathname);
    if (!current) { result.skipped += 1; return; }
    const etag = strongEtag(current.etag);
    if (!etag) { failure(result, "etag_missing"); return; }
    const original = await current.json();
    let plain;
    try { plain = await unprotectJson(original, context); } catch { failure(result, "authentication_failed"); return; }
    if (envelope(original)) { result.skipped += 1; return; }
    const encrypted = await protectJson(plain, context);
    if (!envelope(encrypted)) { failure(result, "encryption_unavailable"); return; }
    try { if (digest(plain) !== digest(await unprotectJson(encrypted, context))) throw new Error("bad"); } catch { failure(result, "encryption_verification_failed"); return; }
    if (!apply) { result.encrypted += 1; return; }
    const written = await storage.put(pathname, JSON.stringify(encrypted), { access: "private", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json", ifMatch: etag });
    const writeEtag = strongEtag(written?.etag);
    if (!writeEtag) { result.conflicts += 1; return; }
    const readback = await storage.get(pathname);
    if (!readback || strongEtag(readback.etag) !== writeEtag) { result.conflicts += 1; return; }
    const value = await readback.json();
    if (!envelope(value) || digest(await unprotectJson(value, context)) !== digest(plain)) { result.conflicts += 1; return; }
    result.encrypted += 1;
  } catch (error) {
    if (precondition(error)) result.conflicts += 1;
    else failure(result, "migration_failed");
  }
}
export async function migrateSensitiveBlobs({ storage, protectJson, unprotectJson, apply = false, pageSize = 100 }) {
  const result = { mode: apply ? "apply" : "dry-run", scanned: 0, encrypted: 0, skipped: 0, conflicts: 0, failed: 0, incomplete: false, errors: [] };
  const limit = Math.min(Math.max(Number.isInteger(pageSize) ? pageSize : 100, 1), 1000);
  for (const { prefix } of PATHS) {
    let cursor;
    const seen = new Set();
    do {
      const page = await storage.list({ prefix, cursor, limit });
      for (const blob of page?.blobs ?? []) { const context = migrationContext(blob.pathname); if (context) await one({ storage, protectJson, unprotectJson, apply, result, pathname: blob.pathname, context }); }
      if (!page || typeof page.hasMore !== "boolean") { result.incomplete = true; failure(result, "page_incomplete"); break; }
      if (!page.hasMore) break;
      if (typeof page.cursor !== "string" || !page.cursor || page.cursor.length > 4096 || seen.has(page.cursor)) { result.incomplete = true; failure(result, "page_cursor_invalid"); break; }
      seen.add(page.cursor); cursor = page.cursor;
    } while (true);
  }
  return result;
}
export async function runCli({ apply = false } = {}) {
  const { list, get, put } = await import("@vercel/blob");
  const { protectJson, unprotectJson } = await import("../src/lib/sensitive-storage.ts");
  return migrateSensitiveBlobs({ apply, protectJson, unprotectJson, storage: { list: (options) => list(options), async get(pathname) { const value = await get(pathname, { access: "private", useCache: false }); return value && value.statusCode === 200 ? { etag: value.blob.etag, json: () => new Response(value.stream).json() } : null; }, put } });
}
if (import.meta.url === "file://" + process.argv[1]) {
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply");
  if (unknown.length) { console.error("Unknown migration flag."); process.exitCode = 2; }
  else try { const result = await runCli({ apply: process.argv.includes("--apply") }); console.log(JSON.stringify(result)); if (result.failed || result.conflicts || result.incomplete) process.exitCode = 1; } catch { console.error("Sensitive blob migration failed."); process.exitCode = 1; }
}
