import { describe, expect, it } from "vitest";
import { migrateSensitiveBlobs, migrationContext } from "./migrate-sensitive-blobs.mjs";

type Envelope = { version: 1; algorithm: "AES-256-GCM"; keyId: string; nonce: string; ciphertext: string; tag: string };
type Item = { pathname: string; etag: string; value: unknown };
type Options = { ifMatch: string; access: string; addRandomSuffix: boolean };
type Page = { blobs: { pathname: string }[]; hasMore: boolean; cursor?: string };
const box = (value: unknown): Envelope => ({ version: 1, algorithm: "AES-256-GCM", keyId: "key", nonce: "AAAAAAAAAAAAAAAA", ciphertext: Buffer.from(JSON.stringify(value)).toString("base64"), tag: "AAAAAAAAAAAAAAAAAAAAAA==" });
const unprotect = (value: unknown): unknown => value && typeof value === "object" && "version" in value ? JSON.parse(Buffer.from((value as Envelope).ciphertext, "base64").toString()) as unknown : value;
const protect = (value: unknown): Envelope => box(value);
function make(items: Item[], pages?: Page[]) {
  const values = new Map(items.map((item) => [item.pathname, { ...item }]));
  const writes: { body: string; options: Options }[] = []; let index = 0;
  const storage = {
    async list(options: { prefix: string }) { return pages?.[index++] ?? { blobs: [...values.values()].filter((x) => x.pathname.startsWith(options.prefix)), hasMore: false }; },
    async get(pathname: string) { const x = values.get(pathname); return x ? { etag: x.etag, async json() { return x.value; } } : null; },
    async put(pathname: string, body: string, options: Options) { writes.push({ body, options }); const x = values.get(pathname); if (!x || x.etag.replace(/^W\//, "") !== options.ifMatch) { const error = new Error("cas"); error.name = "BlobPreconditionFailedError"; throw error; } const etag = "\"new\""; values.set(pathname, { pathname, etag, value: JSON.parse(body) as unknown }); return { etag }; }
  };
  return { storage, writes };
}
describe("sensitive blob migration", () => {
  it("defaults to a dry run", async () => {
    const h = make([{ pathname: "try-me/sessions/s1.json", etag: "\"1\"", value: { old: true } }]);
    const r = await migrateSensitiveBlobs({ ...h, protectJson: protect, unprotectJson: unprotect });
    expect(r).toMatchObject({ mode: "dry-run", encrypted: 1 }); expect(h.writes).toHaveLength(0);
  });
  it("writes current ETag and performs verified private readback", async () => {
    const h = make([{ pathname: "try-me/sessions/s1.json", etag: "W/\"1\"", value: { old: true } }]);
    const r = await migrateSensitiveBlobs({ ...h, protectJson: protect, unprotectJson: unprotect, apply: true });
    expect(r).toMatchObject({ encrypted: 1, failed: 0, conflicts: 0 }); expect(h.writes[0]?.options).toMatchObject({ ifMatch: "\"1\"", access: "private", addRandomSuffix: false });
  });
  it("authenticates an encrypted blob before skipping and rejects tampering", async () => {
    const good = make([{ pathname: "try-me/leads/l1.json", etag: "\"1\"", value: box({ safe: true }) }]);
    expect(await migrateSensitiveBlobs({ ...good, protectJson: protect, unprotectJson: unprotect })).toMatchObject({ skipped: 1 });
    const bad = make([{ pathname: "try-me/leads/l1.json", etag: "\"1\"", value: box({ safe: true }) }]);
    const r = await migrateSensitiveBlobs({ ...bad, protectJson: protect, unprotectJson: () => { throw new Error("bad"); }, apply: true });
    expect(r.failed).toBe(1); expect(bad.writes).toHaveLength(0);
  });
  it("treats CAS failure, missing ETag, and disabled encryption as safe failures", async () => {
    const cas = make([{ pathname: "try-me/sessions/s1.json", etag: "\"1\"", value: { old: true } }]);
    const storage = { ...cas.storage, async put() { const error = new Error("cas"); error.name = "BlobPreconditionFailedError"; throw error; } };
    expect(await migrateSensitiveBlobs({ storage, protectJson: protect, unprotectJson: unprotect, apply: true })).toMatchObject({ conflicts: 1 });
    const noTag = make([{ pathname: "try-me/sessions/s1.json", etag: "", value: { old: true } }]);
    expect(await migrateSensitiveBlobs({ ...noTag, protectJson: protect, unprotectJson: unprotect })).toMatchObject({ failed: 1 });
    const plain = make([{ pathname: "try-me/sessions/s1.json", etag: "\"1\"", value: { old: true } }]);
    expect(await migrateSensitiveBlobs({ ...plain, protectJson: (x: unknown) => x, unprotectJson: unprotect })).toMatchObject({ failed: 1 });
  });
  it("uses the read ETag rather than any list metadata", async () => {
    const h = make([{ pathname: "try-me/sessions/s1.json", etag: "\"current\"", value: { old: true } }], [{ blobs: [{ pathname: "try-me/sessions/s1.json" }], hasMore: false }]);
    await migrateSensitiveBlobs({ ...h, protectJson: protect, unprotectJson: unprotect, apply: true });
    expect(h.writes[0]?.options.ifMatch).toBe("\"current\"");
  });
  it("processes page two and fails absent or repeated cursors", async () => {
    const h = make([], [{ blobs: [{ pathname: "try-me/sessions/s1.json" }], hasMore: true, cursor: "two" }, { blobs: [{ pathname: "try-me/sessions/s2.json" }], hasMore: false }, { blobs: [], hasMore: false }]);
    const storage = { ...h.storage, async get(pathname: string) { return { etag: "\"1\"", async json() { return { pathname }; } }; } };
    expect(await migrateSensitiveBlobs({ storage, protectJson: protect, unprotectJson: unprotect })).toMatchObject({ scanned: 2, encrypted: 2 });
    const missing = make([], [{ blobs: [], hasMore: true }]);
    expect(await migrateSensitiveBlobs({ ...missing, protectJson: protect, unprotectJson: unprotect })).toMatchObject({ incomplete: true, failed: 1 });
    const repeat = make([], [{ blobs: [], hasMore: true, cursor: "again" }, { blobs: [], hasMore: true, cursor: "again" }]);
    expect(await migrateSensitiveBlobs({ ...repeat, protectJson: protect, unprotectJson: unprotect })).toMatchObject({ incomplete: true, failed: 1 });
  });
  it("reports post-write mismatch as a conflict and rejects unknown paths", async () => {
    const h = make([{ pathname: "try-me/sessions/s1.json", etag: "\"1\"", value: { old: true } }]); let reads = 0;
    const storage = { ...h.storage, async get(pathname: string) { reads += 1; return reads === 2 ? { etag: "\"other\"", async json() { return box({ other: true }); } } : h.storage.get(pathname); } };
    expect(await migrateSensitiveBlobs({ storage, protectJson: protect, unprotectJson: unprotect, apply: true })).toMatchObject({ conflicts: 1 });
    expect(migrationContext("try-me/sessions/nested/s1.json")).toBeNull(); expect(migrationContext("try-me/nope/s1.json")).toBeNull();
  });
});
