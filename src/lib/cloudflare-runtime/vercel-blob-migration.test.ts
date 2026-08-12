import { describe, expect, it } from "vitest";
import { migrateBlobSnapshot, planBlobObject, type BlobObject, type CheckpointItem, type ReadOnlyBlobSource, type WriteOnceDestination } from "./vercel-blob-migration";

const bytes = (value: string) => new TextEncoder().encode(value);
const obj = (key: string, value: string, cursor = "p1"): BlobObject => ({ key, size: bytes(value).byteLength, contentType: key.endsWith(".pdf") ? "application/pdf" : "application/json", cursor });
function source(records: readonly [BlobObject, string][]): ReadOnlyBlobSource {
  return { async list(cursor) { return cursor ? { objects: [] } : { objects: records.map(([object]) => object), nextCursor: undefined }; }, async read(object) { const value = records.find(([candidate]) => candidate.key === object.key)?.[1]; if (value === undefined) throw new Error("source_missing"); return (async function* () { yield bytes(value); })(); } };
}
function destination() {
  const objects = new Map<string, { body: Uint8Array; sha256: string }>(); const mappings: string[] = [];
  const adapter: WriteOnceDestination = { async head(key) { const value = objects.get(key); return value ? { size: value.body.byteLength, sha256: value.sha256 } : null; }, async putIfAbsent(input) { if (objects.has(input.key)) throw new Error("destination_collision"); objects.set(input.key, { body: input.body, sha256: input.sha256 }); }, async putMappingIfAbsent(input) { if (mappings.includes(input.sourceIdentityHash)) return; mappings.push(input.sourceIdentityHash); } };
  return { adapter, objects, mappings };
}
describe("Vercel Blob migration contract", () => {
  it("defaults to dry-run and never writes object or D1 mapping", async () => {
    const first = obj("try-me/sessions/abcdefghijklmnopqrst.json", "{}"), dest = destination();
    const report = await migrateBlobSnapshot(source([[first, "{}"]]), dest.adapter);
    expect(report).toMatchObject({ dryRun: true, source: { objects: 1, bytes: 2 }, destination: { objects: 1, bytes: 2 }, copied: 0 }); expect(dest.objects.size).toBe(0); expect(dest.mappings).toEqual([]);
  });
  it("preserves CAS/session and upload identities without exposing them in report", () => {
    const session = planBlobObject(obj("try-me/sessions/abcdefghijklmnopqrst.json", "{}"));
    const upload = planBlobObject(obj("try-me/uploads/abcdefghijklmnopqrst/123e4567-e89b-12d3-a456-426614174000.pdf", "pdf"));
    expect(session).toMatchObject({ kind: "session", sessionId: "abcdefghijklmnopqrst" }); expect(upload).toMatchObject({ kind: "upload", uploadId: "123e4567-e89b-12d3-a456-426614174000" }); expect(session.sourceIdentityHash).not.toContain(session.sessionId!);
  });
  it("resumes after a copied-but-unmapped failure without overwriting", async () => {
    const first = obj("try-me/leads/abcdefghijklmnopqrst.json", "lead"), dest = destination(); let fail = true;
    const flaky: WriteOnceDestination = { ...dest.adapter, async putMappingIfAbsent(input) { if (fail) { fail = false; throw new Error("mapping_unavailable"); } return dest.adapter.putMappingIfAbsent(input); } };
    const checkpoint = {
      value: null as { cursor?: string; items: readonly CheckpointItem[] } | null,
      async load() { return this.value; },
      async save(value: { cursor?: string; items: readonly CheckpointItem[] }) { this.value = structuredClone(value); }
    };
    expect((await migrateBlobSnapshot(source([[first, "lead"]]), flaky, { dryRun: false, checkpoint })).failures[0]?.code).toBe("mapping_unavailable");
    const report = await migrateBlobSnapshot(source([[first, "lead"]]), flaky, { dryRun: false, checkpoint }); expect(report.failures).toEqual([]); expect(dest.objects.size).toBe(1); expect(dest.mappings).toHaveLength(1);
  });
  it("paginates and resumes a failed source copy from a checkpoint", async () => {
    const first = obj("try-me/sessions/abcdefghijklmnopqrst.json", "one", "first");
    const second = obj("try-me/upload-status/abcdefghijklmnopqrst/123e4567-e89b-12d3-a456-426614174000.json", "two", "second");
    let failSecond = true;
    const paged: ReadOnlyBlobSource = {
      async list(cursor) { return cursor === "next" ? { objects: [second] } : { objects: [first], nextCursor: "next" }; },
      async read(object) { if (object.key === second.key && failSecond) { failSecond = false; throw new Error("source_transient"); } return (async function* () { yield bytes(object.key === first.key ? "one" : "two"); })(); }
    };
    const checkpoint = { value: null as { cursor?: string; items: readonly CheckpointItem[] } | null, async load() { return this.value; }, async save(value: { cursor?: string; items: readonly CheckpointItem[] }) { this.value = structuredClone(value); } };
    const dest = destination();
    expect((await migrateBlobSnapshot(paged, dest.adapter, { dryRun: false, checkpoint })).failures[0]?.code).toBe("source_transient");
    const report = await migrateBlobSnapshot(paged, dest.adapter, { dryRun: false, checkpoint });
    expect(report).toMatchObject({ source: { objects: 2, bytes: 6 }, destination: { objects: 2, bytes: 6 }, resumed: 1 }); expect(dest.objects.size).toBe(2);
  });
  it("fails closed on unknown keys and collision content", async () => {
    expect(() => planBlobObject(obj("unknown/private.json", "x"))).toThrow("unsupported_source_object");
    const first = obj("try-me/sessions/abcdefghijklmnopqrst.json", "{}"), dest = destination(); await dest.adapter.putIfAbsent({ key: first.key, body: bytes("other"), sha256: "not-the-source", contentType: "application/json", cacheControl: "private, no-store", access: "private" });
    const report = await migrateBlobSnapshot(source([[first, "{}"]]), dest.adapter, { dryRun: false }); expect(report.collisions).toBe(1); expect(report.failures[0]?.code).toBe("destination_collision");
  });
});
