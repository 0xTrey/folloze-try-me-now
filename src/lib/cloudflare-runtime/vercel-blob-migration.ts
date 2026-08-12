import { createHash } from "node:crypto";

/** Provider-neutral, opt-in migration engine. It has no provider/env imports. */
export type BlobObject = Readonly<{ key: string; size: number; etag?: string; contentType?: string; cacheControl?: string; cursor: string }>;
export interface ReadOnlyBlobSource {
  /** Immutable snapshot only; the engine has no mutation method. */
  list(cursor?: string): Promise<{ objects: readonly BlobObject[]; nextCursor?: string }>;
  read(object: BlobObject): Promise<AsyncIterable<Uint8Array>>;
}
export type DestinationHead = Readonly<{ size: number; sha256?: string }>;
export interface WriteOnceDestination {
  head(key: string): Promise<DestinationHead | null>;
  /** Must reject an existing target. This is never an overwrite operation. */
  putIfAbsent(input: Readonly<{ key: string; body: Uint8Array; sha256: string; contentType: string; cacheControl: string; access: "private" }>): Promise<void>;
  /** Raw identities exist only during this protected adapter call, never in output. */
  putMappingIfAbsent(input: Readonly<{ sourceIdentity: string; sourceIdentityHash: string; kind: MigrationKind; sessionId?: string; uploadId?: string; destinationKey: string; sha256: string; bytes: number }>): Promise<void>;
}
export type MigrationKind = "session" | "lead" | "upload" | "upload-status";
export type CheckpointItem = Readonly<{ sourceIdentityHash: string; destinationRef: string; kind: MigrationKind; bytes: number; sha256: string; state: "copied" | "mapped" | "failed"; errorCode?: string }>;
export interface MigrationCheckpointStore { load(): Promise<Readonly<{ cursor?: string; items: readonly CheckpointItem[] }> | null>; save(checkpoint: Readonly<{ cursor?: string; items: readonly CheckpointItem[] }>): Promise<void>; }
export type MigrationOptions = Readonly<{ dryRun?: boolean; checkpoint?: MigrationCheckpointStore; pageSize?: number }>;
type Totals = { objects: number; bytes: number };
export type MigrationReport = Readonly<{
  mode: "dry-run" | "apply";
  /** True only when an apply run observed every eligible source object at destination and had no failures. */
  reconciled: boolean;
  snapshot: { source: Totals; observedDestination?: Totals; projectedDestination?: Totals };
  runDelta: { copied: number; resumed: number; collisions: number; failures: readonly { sourceIdentityHash: string; code: string }[] };
  rollback: readonly { sourceIdentityHash: string; destinationRef: string; sha256: string; bytes: number }[];
}>;
type PlannedObject = Readonly<{ object: BlobObject; kind: MigrationKind; sessionId?: string; uploadId?: string; sourceIdentity: string; sourceIdentityHash: string; destinationKey: string; destinationRef: string }>;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const refFor = (identityHash: string) => hash(`try-me-destination:${identityHash}`);
const isHex = (value: string) => /^[a-f0-9]{64}$/.test(value);
const isKind = (value: string): value is MigrationKind => ["session", "lead", "upload", "upload-status"].includes(value);
const safeContentType = (value?: string) => value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : "application/octet-stream";
const safeCodes = new Set(["unsupported_source_object", "source_size_mismatch", "destination_collision", "source_page_exceeds_limit", "source_transient", "source_missing", "mapping_unavailable", "migration_failed"]);

/** Only recognized private Try Me object layouts can be planned. */
export function planBlobObject(object: BlobObject): PlannedObject {
  const session = /^try-me\/sessions\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key);
  const lead = /^try-me\/leads\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key);
  const upload = /^try-me\/uploads\/([A-Za-z0-9_-]{20,64})\/([0-9a-f-]{36})\.pdf$/i.exec(object.key);
  const status = /^try-me\/upload-status\/([A-Za-z0-9_-]{20,64})\/([0-9a-f-]{36})\.json$/i.exec(object.key);
  const match = session ?? lead ?? upload ?? status;
  if (!match || object.size < 0 || !Number.isSafeInteger(object.size)) throw new Error("unsupported_source_object");
  const sourceIdentity = object.key, sourceIdentityHash = hash(sourceIdentity);
  return { object, kind: session ? "session" : lead ? "lead" : upload ? "upload" : "upload-status", sessionId: match[1], uploadId: upload?.[2] ?? status?.[2], sourceIdentity, sourceIdentityHash, destinationKey: sourceIdentity, destinationRef: refFor(sourceIdentityHash) };
}
function assertCheckpoint(checkpoint: Readonly<{ cursor?: string; items: readonly CheckpointItem[] }> | null): Map<string, CheckpointItem> {
  const items = new Map<string, CheckpointItem>();
  for (const item of checkpoint?.items ?? []) {
    if (!isHex(item.sourceIdentityHash) || item.destinationRef !== refFor(item.sourceIdentityHash) || !isKind(item.kind) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !isHex(item.sha256) || !["copied", "mapped", "failed"].includes(item.state) || (item.state === "failed" && !safeCodes.has(item.errorCode ?? ""))) throw new Error("malformed_checkpoint");
    if (items.has(item.sourceIdentityHash)) throw new Error("checkpoint_duplicate_identity");
    items.set(item.sourceIdentityHash, item);
  }
  return items;
}
function plus(totals: Totals, bytes: number): void { if (!Number.isSafeInteger(bytes) || bytes < 0 || totals.bytes > Number.MAX_SAFE_INTEGER - bytes || totals.objects === Number.MAX_SAFE_INTEGER) throw new Error("byte_sum_overflow"); totals.objects += 1; totals.bytes += bytes; }
async function bufferedAndHashed(stream: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = []; let length = 0; const digest = createHash("sha256");
  for await (const chunk of stream) { const value = new Uint8Array(chunk); if (length > Number.MAX_SAFE_INTEGER - value.byteLength) throw new Error("byte_sum_overflow"); chunks.push(value); length += value.byteLength; digest.update(value); }
  const body = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { body, sha256: digest.digest("hex") };
}
function safeErrorCode(error: unknown): string { const code = error instanceof Error ? error.message : ""; return safeCodes.has(code) ? code : "migration_failed"; }
async function save(checkpoint: MigrationCheckpointStore | undefined, cursor: string | undefined, items: Map<string, CheckpointItem>) { await checkpoint?.save({ cursor, items: [...items.values()] }); }

/**
 * Always rescans from the first page: a stored cursor only records progress and
 * never narrows snapshot totals. ETags are opaque hints, not content proof.
 */
export async function migrateBlobSnapshot(source: ReadOnlyBlobSource, destination: WriteOnceDestination, options: MigrationOptions = {}): Promise<MigrationReport> {
  const dryRun = options.dryRun ?? true, items = assertCheckpoint((await options.checkpoint?.load()) ?? null);
  const sourceTotals: Totals = { objects: 0, bytes: 0 }, destinationTotals: Totals = { objects: 0, bytes: 0 };
  const failures: { sourceIdentityHash: string; code: string }[] = [], seenKeys = new Set<string>(), seenCursors = new Set<string>();
  let cursor: string | undefined, copied = 0, resumed = 0, collisions = 0;
  do {
    if (cursor !== undefined) { if (seenCursors.has(cursor)) throw new Error("cursor_cycle"); seenCursors.add(cursor); }
    const page = await source.list(cursor);
    if (page.objects.length > (options.pageSize ?? 1000)) throw new Error("source_page_exceeds_limit");
    for (const object of page.objects) {
      if (seenKeys.has(object.key)) throw new Error("duplicate_source_identity"); seenKeys.add(object.key);
      const planned = planBlobObject(object); plus(sourceTotals, object.size);
      const prior = items.get(planned.sourceIdentityHash);
      try {
        const { body, sha256 } = await bufferedAndHashed(await source.read(object));
        if (body.byteLength !== object.size) throw new Error("source_size_mismatch");
        const checkpoint: CheckpointItem = { sourceIdentityHash: planned.sourceIdentityHash, destinationRef: planned.destinationRef, kind: planned.kind, bytes: body.byteLength, sha256, state: "copied" };
        if (dryRun) { plus(destinationTotals, body.byteLength); continue; }
        const existing = await destination.head(planned.destinationKey);
        if (existing && (existing.size !== body.byteLength || existing.sha256 !== sha256)) { collisions += 1; throw new Error("destination_collision"); }
        if (!existing) { await destination.putIfAbsent({ key: planned.destinationKey, body, sha256, contentType: safeContentType(object.contentType), cacheControl: "private, no-store", access: "private" }); copied += 1; }
        else resumed += prior?.state === "mapped" ? 1 : 0;
        items.set(planned.sourceIdentityHash, checkpoint); await save(options.checkpoint, cursor, items);
        await destination.putMappingIfAbsent({ sourceIdentity: planned.sourceIdentity, sourceIdentityHash: planned.sourceIdentityHash, kind: planned.kind, sessionId: planned.sessionId, uploadId: planned.uploadId, destinationKey: planned.destinationKey, sha256, bytes: body.byteLength });
        items.set(planned.sourceIdentityHash, { ...checkpoint, state: "mapped" }); await save(options.checkpoint, cursor, items); plus(destinationTotals, body.byteLength);
      } catch (error) {
        const code = safeErrorCode(error); failures.push({ sourceIdentityHash: planned.sourceIdentityHash, code });
        if (!dryRun) { items.set(planned.sourceIdentityHash, { sourceIdentityHash: planned.sourceIdentityHash, destinationRef: planned.destinationRef, kind: planned.kind, bytes: prior?.bytes ?? 0, sha256: prior?.sha256 ?? hash("failed"), state: "failed", errorCode: code }); await save(options.checkpoint, cursor, items); }
      }
    }
    cursor = page.nextCursor; await save(dryRun ? undefined : options.checkpoint, cursor, items);
  } while (cursor !== undefined);
  const reconciled = !dryRun && failures.length === 0 && sourceTotals.objects === destinationTotals.objects && sourceTotals.bytes === destinationTotals.bytes;
  const rollback = [...items.values()].filter((item) => item.state === "mapped").map(({ sourceIdentityHash, destinationRef, sha256, bytes }) => ({ sourceIdentityHash, destinationRef, sha256, bytes }));
  return dryRun ? { mode: "dry-run", reconciled: false, snapshot: { source: sourceTotals, projectedDestination: destinationTotals }, runDelta: { copied: 0, resumed: 0, collisions: 0, failures }, rollback: [] } : { mode: "apply", reconciled, snapshot: { source: sourceTotals, observedDestination: destinationTotals }, runDelta: { copied, resumed, collisions, failures }, rollback };
}
