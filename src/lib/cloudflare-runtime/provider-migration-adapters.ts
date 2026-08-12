import { createHash } from "node:crypto";
import type { D1Database, R2Bucket } from "@/lib/cloudflare-runtime/types";
import type { BlobObject, OwnershipReceipt, ReadOnlyBlobSource, WriteOnceDestination } from "@/lib/cloudflare-runtime/vercel-blob-migration";

type VercelBlob = { pathname: string; size: number; url: string; contentType?: string; etag?: string };
export interface VercelBlobClient { list(input: { prefix: string; cursor?: string; token?: string }): Promise<{ blobs: VercelBlob[]; cursor?: string; hasMore?: boolean }>; get(pathname: string, input: { access: "private"; token?: string; useCache: false }): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> } | null>; }
const safe = (error: unknown) => error instanceof Error && /^(?:source_auth_failed|source_read_failed|source_list_failed|source_size_mismatch)$/.test(error.message) ? error.message : "source_read_failed";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const bytes = async (stream: ReadableStream<Uint8Array>) => { const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0; for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; chunks.push(next.value); } const out = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; } return out; };

/** Concrete private Vercel Blob adapter. Token is supplied by the manual CLI only. */
export class VercelBlobReadAdapter implements ReadOnlyBlobSource {
  constructor(private readonly client: VercelBlobClient, private readonly token?: string, private readonly prefix = "try-me/") {}
  async snapshot() { return { id: sha(`vercel-blob:${this.prefix}`), digest: sha(`vercel-blob-manual-snapshot:${this.prefix}`) }; }
  async list(cursor?: string) { try { const page = await this.client.list({ prefix: this.prefix, cursor, token: this.token }); return { objects: page.blobs.map((blob) => ({ key: blob.pathname, size: blob.size, etag: blob.etag, contentType: blob.contentType, cursor: sha(cursor ?? "first") })), nextCursor: page.hasMore ? page.cursor : undefined }; } catch (error) { throw new Error(String(error).includes("401") || String(error).includes("403") ? "source_auth_failed" : "source_list_failed"); } }
  async read(object: BlobObject) { try { const result = await this.client.get(object.key, { access: "private", token: this.token, useCache: false }); if (!result || result.statusCode !== 200) throw new Error("source_read_failed"); const body = await bytes(result.stream); if (body.byteLength !== object.size) throw new Error("source_size_mismatch"); return (async function* () { yield body; })(); } catch (error) { throw new Error(safe(error)); } }
}

const receipt = (ref: string, ownership: "created" | "preexisting"): OwnershipReceipt => ({ receiptRef: ref, ownership });
const normalizeContentType = (value?: string) => (value || "application/octet-stream").trim().toLowerCase();
type ObjectReceiptRow = { ownership: unknown; sha256: unknown; content_type: unknown };
const validOwnership = (value: unknown): value is "created" | "preexisting" => value === "created" || value === "preexisting";
/** R2 object writes plus D1-owned mapping receipts. Inert until separately instantiated by the CLI. */
export class CloudflareR2D1MigrationDestination implements WriteOnceDestination {
  constructor(private readonly r2: R2Bucket, private readonly db: D1Database) {}
  async lookupObjectReceipt({ ownershipToken, receiptRef }: { ownershipToken: string; receiptRef: string }) { const row = await this.objectReceiptRow(ownershipToken, receiptRef); return row ? receipt(receiptRef, row.ownership) : null; }
  async lookupMappingReceipt({ ownershipToken, receiptRef }: { ownershipToken: string; receiptRef: string }) { const row = await this.db.prepare("SELECT ownership FROM cf_migration_mapping_receipts WHERE run_token = ? AND receipt_ref = ?").bind(ownershipToken, receiptRef).first<{ ownership: "created" | "preexisting" }>(); return row && (row.ownership === "created" || row.ownership === "preexisting") ? receipt(receiptRef, row.ownership) : null; }
  async putIfAbsent(input: Parameters<WriteOnceDestination["putIfAbsent"]>[0]) {
    if (!this.r2.put) throw new Error("migration_failed");
    const metadata = { sha256: input.sha256, ownershipRunToken: input.ownershipToken, objectReceiptRef: input.receiptRef };
    let put: Awaited<ReturnType<NonNullable<R2Bucket["put"]>>>;
    let object: Awaited<ReturnType<R2Bucket["head"]>>;
    try { put = await this.r2.put(input.key, input.body, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: input.contentType }, customMetadata: metadata, sha256: input.sha256 }); object = put ?? await this.r2.head(input.key); } catch { throw new Error("migration_failed"); }
    if (!object) throw new Error("migration_failed");
    const exact = object.size === input.body.byteLength && normalizeContentType(object.httpMetadata?.contentType) === normalizeContentType(input.contentType) && object.customMetadata?.sha256 === input.sha256;
    if (!exact) return "conflict";
    const ownerToken = object.customMetadata?.ownershipRunToken;
    const ownerRef = object.customMetadata?.objectReceiptRef;
    // A receipt is all-or-nothing. A different or malformed receipt is never a
    // safe basis for preexisting ownership, even when payload bytes match.
    if ((ownerToken === undefined) !== (ownerRef === undefined)) throw new Error("migration_failed");
    if (ownerToken !== undefined && (ownerToken !== input.ownershipToken || ownerRef !== input.receiptRef)) return "conflict";
    const ownership = ownerToken === input.ownershipToken ? "created" : "preexisting";
    await this.ensureObjectReceipt(input.ownershipToken, input.receiptRef, ownership, input.sha256, normalizeContentType(input.contentType));
    return receipt(input.receiptRef, ownership);
  }
  private async objectReceiptRow(runToken: string, receiptRef: string): Promise<{ ownership: "created" | "preexisting"; sha256: string; contentType: string } | null> {
    const row = await this.db.prepare("SELECT ownership, sha256, content_type FROM cf_migration_object_receipts WHERE run_token = ? AND receipt_ref = ?").bind(runToken, receiptRef).first<ObjectReceiptRow>();
    if (!row) return null;
    if (!validOwnership(row.ownership) || typeof row.sha256 !== "string" || typeof row.content_type !== "string") throw new Error("migration_failed");
    return { ownership: row.ownership, sha256: row.sha256, contentType: row.content_type };
  }
  private async ensureObjectReceipt(runToken: string, receiptRef: string, ownership: "created" | "preexisting", sha256: string, contentType: string) {
    const matches = (row: { ownership: "created" | "preexisting"; sha256: string; contentType: string } | null) => row && row.ownership === ownership && row.sha256 === sha256 && row.contentType === contentType;
    const prior = await this.objectReceiptRow(runToken, receiptRef);
    if (prior) { if (!matches(prior)) throw new Error("migration_failed"); return; }
    const written = await this.db.prepare("INSERT OR IGNORE INTO cf_migration_object_receipts (run_token, receipt_ref, ownership, sha256, content_type) VALUES (?, ?, ?, ?, ?)").bind(runToken, receiptRef, ownership, sha256, contentType).run();
    if (written.meta?.changes !== 1 && !matches(await this.objectReceiptRow(runToken, receiptRef))) throw new Error("migration_failed");
  }
  async putMappingIfAbsent(input: Parameters<WriteOnceDestination["putMappingIfAbsent"]>[0]) {
    const prior = await this.lookupMappingReceipt(input); if (prior) return prior;
    if (!this.db.batch) throw new Error("migration_failed");
    const destinationRef = sha(`destination:${input.sourceIdentityHash}`);
    // D1 batch is atomic. Receipt SELECT is gated by exact mapping equality; it
    // cannot be created for a source/destination uniqueness collision.
    const mapping = this.db.prepare("INSERT OR IGNORE INTO cf_migration_mappings (source_identity_hash, destination_ref, sha256, bytes, kind, created_run_token) VALUES (?, ?, ?, ?, ?, ?)").bind(input.sourceIdentityHash, destinationRef, input.sha256, input.bytes, input.kind, input.ownershipToken);
    const receiptInsert = this.db.prepare("INSERT OR IGNORE INTO cf_migration_mapping_receipts (run_token, receipt_ref, ownership) SELECT ?, ?, CASE WHEN created_run_token = ? THEN 'created' ELSE 'preexisting' END FROM cf_migration_mappings WHERE source_identity_hash = ? AND destination_ref = ? AND sha256 = ? AND bytes = ? AND kind = ?").bind(input.ownershipToken, input.receiptRef, input.ownershipToken, input.sourceIdentityHash, destinationRef, input.sha256, input.bytes, input.kind);
    const result = await this.db.batch([mapping, receiptInsert]);
    // Inspect both results for malformed driver output, but derive ownership only
    // from the durable receipt query: counts alone are race/crash ambiguous.
    if (result.length !== 2 || result.some((entry) => !entry || !entry.success || typeof entry.meta?.changes !== "number")) throw new Error("migration_failed");
    const durable = await this.lookupMappingReceipt(input);
    return durable ?? "conflict";
  }
}
