import { describe, expect, it } from "vitest";
import { migrateBlobSnapshot, planBlobObject, type BlobObject, type CheckpointItem, type ReadOnlyBlobSource, type WriteOnceDestination } from "./vercel-blob-migration";

const encoder = new TextEncoder(); const bytes = (value: string) => encoder.encode(value);
const id = "abcdefghijklmnopqrst", uploadId = "123e4567-e89b-12d3-a456-426614174000";
const obj = (key: string, value: string): BlobObject => ({ key, size: bytes(value).byteLength, contentType: key.endsWith(".pdf") ? "application/pdf" : "application/json", cursor: "opaque" });
function source(pages: readonly (readonly [BlobObject, string][])[], fail?: () => boolean): ReadOnlyBlobSource {
  return { async list(cursor) { const index = cursor ? Number(cursor) : 0; return { objects: pages[index]?.map(([o]) => o) ?? [], nextCursor: index + 1 < pages.length ? String(index + 1) : undefined }; }, async read(object) { if (fail?.()) throw new Error("source_transient"); const entry = pages.flat().find(([o]) => o.key === object.key); if (!entry) throw new Error("source_missing"); return (async function* () { yield bytes(entry[1]); })(); } };
}
function destination() {
  const objects = new Map<string, { body: Uint8Array; sha256: string }>(); const mappings: string[] = [];
  const adapter: WriteOnceDestination = { async head(key) { const found = objects.get(key); return found ? { size: found.body.byteLength, sha256: found.sha256 } : null; }, async putIfAbsent(input) { if (objects.has(input.key)) throw new Error("destination_collision"); objects.set(input.key, { body: input.body, sha256: input.sha256 }); }, async putMappingIfAbsent(input) { if (!mappings.includes(input.sourceIdentityHash)) mappings.push(input.sourceIdentityHash); } };
  return { adapter, objects, mappings };
}
const checkpoint = () => ({ value: null as { cursor?: string; items: readonly CheckpointItem[] } | null, async load() { return this.value; }, async save(value: { cursor?: string; items: readonly CheckpointItem[] }) { this.value = structuredClone(value); } });
describe("Vercel Blob migration contract", () => {
  it("labels dry-run destination totals as projected and persists neither identifiers nor state", async () => {
    const raw = `try-me/sessions/${id}.json`, store = checkpoint(), dest = destination();
    const report = await migrateBlobSnapshot(source([[[obj(raw, "{}"), "{}"]]]), dest.adapter, { checkpoint: store });
    expect(report).toMatchObject({ mode: "dry-run", reconciled: false, snapshot: { source: { objects: 1, bytes: 2 }, projectedDestination: { objects: 1, bytes: 2 } } }); expect("observedDestination" in report.snapshot).toBe(false); expect(dest.objects.size).toBe(0); expect(store.value).toBeNull(); expect(JSON.stringify(report)).not.toContain(raw); expect(JSON.stringify(report)).not.toContain(id);
  });
  it("keeps raw session/upload identifiers ephemeral and output uses opaque references", async () => {
    const raw = `try-me/uploads/${id}/${uploadId}.pdf`, planned = planBlobObject(obj(raw, "pdf")), dest = destination(), store = checkpoint();
    const report = await migrateBlobSnapshot(source([[[obj(raw, "pdf"), "pdf"]]]), dest.adapter, { dryRun: false, checkpoint: store });
    expect(planned).toMatchObject({ sessionId: id, uploadId }); expect(report.reconciled).toBe(true); expect(JSON.stringify(report)).not.toContain(raw); expect(JSON.stringify(report)).not.toContain(id); expect(JSON.stringify(store.value)).not.toContain(raw); expect(JSON.stringify(store.value)).not.toContain(id); expect(JSON.stringify(store.value)).not.toContain(uploadId);
  });
  it("uses global snapshot totals after a mid-page checkpoint instead of cursor-only totals", async () => {
    const first = obj(`try-me/sessions/${id}.json`, "one"), second = obj(`try-me/leads/${id}.json`, "two"), dest = destination(), store = checkpoint();
    const firstReport = await migrateBlobSnapshot(source([[[first, "one"]], [[second, "two"]]]), dest.adapter, { dryRun: false, checkpoint: store });
    const resumed = await migrateBlobSnapshot(source([[[first, "one"]], [[second, "two"]]]), dest.adapter, { dryRun: false, checkpoint: store });
    expect(firstReport.snapshot.source).toEqual({ objects: 2, bytes: 6 }); expect(resumed.snapshot).toEqual({ source: { objects: 2, bytes: 6 }, observedDestination: { objects: 2, bytes: 6 } }); expect(resumed.runDelta.resumed).toBe(2);
  });
  it("recovers a copied-but-unmapped object without overwrite", async () => {
    const raw = obj(`try-me/leads/${id}.json`, "lead"), dest = destination(), store = checkpoint(); let fail = true;
    const flaky: WriteOnceDestination = { ...dest.adapter, async putMappingIfAbsent(input) { if (fail) { fail = false; throw new Error("mapping_unavailable"); } return dest.adapter.putMappingIfAbsent(input); } };
    expect((await migrateBlobSnapshot(source([[[raw, "lead"]]]), flaky, { dryRun: false, checkpoint: store })).reconciled).toBe(false);
    expect((await migrateBlobSnapshot(source([[[raw, "lead"]]]), flaky, { dryRun: false, checkpoint: store })).reconciled).toBe(true); expect(dest.objects.size).toBe(1); expect(dest.mappings).toHaveLength(1);
  });
  it("records failed source copy safely and retry succeeds", async () => {
    const raw = obj(`try-me/sessions/${id}.json`, "one"), dest = destination(), store = checkpoint(); let fail = true;
    const failed = await migrateBlobSnapshot(source([[[raw, "one"]]], () => fail), dest.adapter, { dryRun: false, checkpoint: store }); fail = false;
    expect(failed.reconciled).toBe(false); expect(failed.runDelta.failures[0]?.code).toBe("source_transient"); expect(JSON.stringify(store.value)).not.toContain(id); expect((await migrateBlobSnapshot(source([[[raw, "one"]]]), dest.adapter, { dryRun: false, checkpoint: store })).reconciled).toBe(true);
  });
  it("fails closed for duplicate identities, target collision, cursor cycle, and malformed checkpoints", async () => {
    const raw = obj(`try-me/sessions/${id}.json`, "{}"), duplicateDest = destination();
    await expect(migrateBlobSnapshot(source([[[raw, "{}"]], [[raw, "{}"]]]), duplicateDest.adapter, { dryRun: false })).rejects.toThrow("duplicate_source_identity");
    const collisionDest = destination(); await collisionDest.adapter.putIfAbsent({ key: raw.key, body: bytes("other"), sha256: "f".repeat(64), contentType: "application/json", cacheControl: "private, no-store", access: "private" });
    const collision = await migrateBlobSnapshot(source([[[raw, "{}"]]]), collisionDest.adapter, { dryRun: false }); expect(collision.reconciled).toBe(false); expect(collision.runDelta.collisions).toBe(1);
    const cycle: ReadOnlyBlobSource = { async list() { return { objects: [], nextCursor: "same" }; }, async read() { return (async function* () {})(); } }; await expect(migrateBlobSnapshot(cycle, destination().adapter)).rejects.toThrow("cursor_cycle");
    const invalid = { async load() { return { items: [{ sourceIdentityHash: "a".repeat(64), destinationRef: "wrong", kind: "session" as const, bytes: 0, sha256: "b".repeat(64), state: "mapped" as const }] }; }, async save() {} }; await expect(migrateBlobSnapshot(source([[]]), destination().adapter, { checkpoint: invalid })).rejects.toThrow("malformed_checkpoint");
    const malformedState = { async load() { return { items: [{ sourceIdentityHash: "a".repeat(64), destinationRef: "b".repeat(64), kind: "session", bytes: -1, sha256: "invalid", state: "unknown" }] }; }, async save() {} }; await expect(migrateBlobSnapshot(source([[]]), destination().adapter, { checkpoint: malformedState as unknown as { load(): Promise<{ items: readonly CheckpointItem[] }>; save(): Promise<void> } })).rejects.toThrow("malformed_checkpoint");
  });
  it("rejects unsafe snapshot byte sums before attempting a read", async () => {
    const enormous = { key: `try-me/sessions/${id}.json`, size: Number.MAX_SAFE_INTEGER, cursor: "one" };
    const next = { key: `try-me/leads/${id}.json`, size: 1, cursor: "two" };
    await expect(migrateBlobSnapshot(source([[[enormous, ""]], [[next, ""]]]), destination().adapter)).rejects.toThrow("byte_sum_overflow");
  });
});
