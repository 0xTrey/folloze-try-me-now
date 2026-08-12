import { createHash } from "node:crypto";

/** Source-only contract: no provider, environment, or runtime imports. */
export type BlobObject = Readonly<{ key: string; size: number; etag?: string; contentType?: string; cursor: string }>;
export interface ReadOnlyBlobSource {
  snapshot(): Promise<Readonly<{ id: string; digest: string }>>;
  list(cursor?: string): Promise<Readonly<{ objects: readonly BlobObject[]; nextCursor?: string }>>;
  read(object: BlobObject): Promise<AsyncIterable<Uint8Array>>;
}
/** Stores raw cursors outside serialized checkpoints; never returns them in reports. */
export interface CursorResolver { remember(cursorRef: string, cursor: string): Promise<void>; resolve(cursorRef: string): Promise<string | undefined>; }
export type WriteOutcome = "inserted" | "exact-existing" | "conflict";
export interface WriteOnceDestination {
  /** Adapter verifies content hash/bytes before returning exact-existing. */
  putIfAbsent(input: Readonly<{ key: string; body: Uint8Array; sha256: string; contentType: string; cacheControl: string; access: "private" }>): Promise<WriteOutcome>;
  /** Adapter verifies all identity/hash/bytes fields before returning exact-existing. */
  putMappingIfAbsent(input: Readonly<{ sourceIdentity: string; sourceIdentityHash: string; kind: MigrationKind; sessionId?: string; uploadId?: string; destinationKey: string; sha256: string; bytes: number }>): Promise<WriteOutcome>;
}
export type MigrationKind = "session" | "lead" | "upload" | "upload-status";
type ExpectedItem = Readonly<{ sourceIdentityHash: string; destinationRef: string; bytes: number; kind: MigrationKind }>;
export type CheckpointItem = Readonly<{ sourceIdentityHash: string; destinationRef: string; kind: MigrationKind; bytes: number; sha256: string; state: "copied" | "mapped" | "failed"; objectOutcome?: Exclude<WriteOutcome, "conflict">; mappingOutcome?: Exclude<WriteOutcome, "conflict">; errorCode?: SafeErrorCode }>;
export type MigrationCheckpoint = Readonly<{ snapshotRef: string; snapshotDigest: string; expected: Readonly<{ objects: number; bytes: number; identities: readonly ExpectedItem[] }>; cursorRef?: string; items: readonly CheckpointItem[] }>;
export interface MigrationCheckpointStore { load(): Promise<MigrationCheckpoint | null>; save(checkpoint: MigrationCheckpoint): Promise<void>; }
export type MigrationOptions = Readonly<{ dryRun?: boolean; checkpoint?: MigrationCheckpointStore; cursorResolver?: CursorResolver; pageSize?: number }>;
type Totals = { objects: number; bytes: number };
export type MigrationReport = Readonly<{ mode: "dry-run" | "apply"; reconciled: boolean; snapshot: { source: Totals; observedDestination?: Totals; projectedDestination?: Totals }; runDelta: { copied: number; resumed: number; collisions: number; failures: readonly { sourceIdentityHash: string; code: SafeErrorCode }[] }; rollback: readonly { sourceIdentityHash: string; destinationRef: string; objectCreated: boolean; mappingCreated: boolean }[] }>;
type PlannedObject = Readonly<{ object: BlobObject; kind: MigrationKind; sessionId?: string; uploadId?: string; sourceIdentity: string; sourceIdentityHash: string; destinationKey: string; destinationRef: string; cursorRef: string }>;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const refFor = (prefix: string, identityHash: string) => hash(`${prefix}:${identityHash}`);
const isHex = (value: string) => /^[a-f0-9]{64}$/.test(value);
const isKind = (value: string): value is MigrationKind => ["session", "lead", "upload", "upload-status"].includes(value);
const safeContentType = (value?: string) => value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : "application/octet-stream";
const safeCodes = ["unsupported_source_object", "source_size_mismatch", "destination_collision", "mapping_conflict", "source_page_exceeds_limit", "source_transient", "source_missing", "mapping_unavailable", "migration_failed"] as const;
export type SafeErrorCode = (typeof safeCodes)[number];
const safeCode = (error: unknown): SafeErrorCode => { const candidate = error instanceof Error ? error.message : ""; return safeCodes.includes(candidate as SafeErrorCode) ? candidate as SafeErrorCode : "migration_failed"; };
const add = (totals: Totals, bytes: number) => { if (!Number.isSafeInteger(bytes) || bytes < 0 || totals.bytes > Number.MAX_SAFE_INTEGER - bytes || totals.objects === Number.MAX_SAFE_INTEGER) throw new Error("byte_sum_overflow"); totals.objects++; totals.bytes += bytes; };

export function planBlobObject(object: BlobObject): PlannedObject {
  const session = /^try-me\/sessions\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key), lead = /^try-me\/leads\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key), upload = /^try-me\/uploads\/([A-Za-z0-9_-]{20,64})\/([0-9a-f-]{36})\.pdf$/i.exec(object.key), status = /^try-me\/upload-status\/([A-Za-z0-9_-]{20,64})\/([0-9a-f-]{36})\.json$/i.exec(object.key), match = session ?? lead ?? upload ?? status;
  if (!match || !Number.isSafeInteger(object.size) || object.size < 0) throw new Error("unsupported_source_object");
  const sourceIdentity = object.key, sourceIdentityHash = hash(sourceIdentity);
  return { object, kind: session ? "session" : lead ? "lead" : upload ? "upload" : "upload-status", sessionId: match[1], uploadId: upload?.[2] ?? status?.[2], sourceIdentity, sourceIdentityHash, destinationKey: sourceIdentity, destinationRef: refFor("destination", sourceIdentityHash), cursorRef: refFor("cursor", hash(object.cursor)) };
}
async function bytesAndHash(stream: AsyncIterable<Uint8Array>) { const chunks: Uint8Array[] = []; let length = 0; const digest = createHash("sha256"); for await (const chunk of stream) { const value = new Uint8Array(chunk); if (length > Number.MAX_SAFE_INTEGER - value.byteLength) throw new Error("byte_sum_overflow"); chunks.push(value); length += value.byteLength; digest.update(value); } const body = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; } return { body, sha256: digest.digest("hex") }; }
function validateCheckpoint(checkpoint: MigrationCheckpoint | null) {
  if (!checkpoint) return new Map<string, CheckpointItem>();
  if (!isHex(checkpoint.snapshotRef) || !isHex(checkpoint.snapshotDigest) || !Number.isSafeInteger(checkpoint.expected.objects) || !Number.isSafeInteger(checkpoint.expected.bytes) || checkpoint.expected.objects <= 0 || checkpoint.expected.bytes < 0 || (checkpoint.cursorRef !== undefined && !isHex(checkpoint.cursorRef))) throw new Error("malformed_checkpoint");
  const expected = new Set<string>(), items = new Map<string, CheckpointItem>(), totals: Totals = { objects: 0, bytes: 0 };
  for (const expectedItem of checkpoint.expected.identities) { if (!isHex(expectedItem.sourceIdentityHash) || expectedItem.destinationRef !== refFor("destination", expectedItem.sourceIdentityHash) || !isKind(expectedItem.kind) || expected.has(expectedItem.sourceIdentityHash)) throw new Error("malformed_checkpoint"); expected.add(expectedItem.sourceIdentityHash); add(totals, expectedItem.bytes); }
  if (totals.objects !== checkpoint.expected.objects || totals.bytes !== checkpoint.expected.bytes) throw new Error("malformed_checkpoint");
  for (const item of checkpoint.items) { if (!expected.has(item.sourceIdentityHash) || items.has(item.sourceIdentityHash) || item.destinationRef !== refFor("destination", item.sourceIdentityHash) || !isKind(item.kind) || !isHex(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || (item.errorCode !== undefined && !safeCodes.includes(item.errorCode)) || (item.state !== "failed" && item.errorCode !== undefined) || (item.state === "failed" && !item.errorCode)) throw new Error("malformed_checkpoint"); items.set(item.sourceIdentityHash, item); }
  return items;
}
async function enumerate(source: ReadOnlyBlobSource, pageSize: number) {
  const all: PlannedObject[] = [], identities = new Set<string>(), cursors = new Set<string>(), totals: Totals = { objects: 0, bytes: 0 }; let cursor: string | undefined;
  do { if (cursor !== undefined) { if (cursors.has(cursor)) throw new Error("cursor_cycle"); cursors.add(cursor); } const page = await source.list(cursor); if (page.objects.length > pageSize) throw new Error("source_page_exceeds_limit"); for (const object of page.objects) { if (identities.has(object.key)) throw new Error("duplicate_source_identity"); identities.add(object.key); const planned = planBlobObject(object); add(totals, object.size); all.push(planned); } cursor = page.nextCursor; } while (cursor !== undefined);
  if (!all.length) throw new Error("empty_source_snapshot"); return { all, totals };
}
function expectedFor(all: readonly PlannedObject[], totals: Totals) { return { objects: totals.objects, bytes: totals.bytes, identities: all.map(({ sourceIdentityHash, destinationRef, object, kind }) => ({ sourceIdentityHash, destinationRef, bytes: object.size, kind })) }; }
function sameExpected(a: MigrationCheckpoint["expected"], b: ReturnType<typeof expectedFor>) { return a.objects === b.objects && a.bytes === b.bytes && a.identities.length === b.identities.length && a.identities.every((item, i) => item.sourceIdentityHash === b.identities[i]?.sourceIdentityHash && item.destinationRef === b.identities[i]?.destinationRef && item.bytes === b.identities[i]?.bytes && item.kind === b.identities[i]?.kind); }
async function save(store: MigrationCheckpointStore | undefined, checkpoint: MigrationCheckpoint) { await store?.save(checkpoint); }

/** Full-snapshot scan; checkpoint cursors are progress hints only and never scope totals. */
export async function migrateBlobSnapshot(source: ReadOnlyBlobSource, destination: WriteOnceDestination, options: MigrationOptions = {}): Promise<MigrationReport> {
  const mode = options.dryRun ?? true ? "dry-run" : "apply", snapshot = await source.snapshot(), snapshotRef = refFor("snapshot", hash(snapshot.id)); if (!isHex(snapshot.digest)) throw new Error("invalid_snapshot");
  const { all, totals: sourceTotals } = await enumerate(source, options.pageSize ?? 1000), expected = expectedFor(all, sourceTotals), prior = await options.checkpoint?.load() ?? null, items = validateCheckpoint(prior);
  if (prior && (prior.snapshotRef !== snapshotRef || prior.snapshotDigest !== snapshot.digest || !sameExpected(prior.expected, expected))) throw new Error("stale_checkpoint");
  let checkpoint: MigrationCheckpoint = prior ?? { snapshotRef, snapshotDigest: snapshot.digest, expected, items: [] }, copied = 0, resumed = 0, collisions = 0; const observed: Totals = { objects: 0, bytes: 0 }, failures: { sourceIdentityHash: string; code: SafeErrorCode }[] = [];
  for (const planned of all) {
    try {
      const { body, sha256 } = await bytesAndHash(await source.read(planned.object)); if (body.byteLength !== planned.object.size) throw new Error("source_size_mismatch");
      if (mode === "dry-run") { add(observed, body.byteLength); continue; }
      await options.cursorResolver?.remember(planned.cursorRef, planned.object.cursor);
      const objectOutcome = await destination.putIfAbsent({ key: planned.destinationKey, body, sha256, contentType: safeContentType(planned.object.contentType), cacheControl: "private, no-store", access: "private" });
      if (objectOutcome === "conflict") { collisions++; throw new Error("destination_collision"); }
      const previous = items.get(planned.sourceIdentityHash); if (objectOutcome === "inserted") copied++; else if (previous?.state === "mapped") resumed++;
      // Preserve creation provenance when retrying a copied-but-unmapped item.
      const effectiveObjectOutcome = previous?.objectOutcome === "inserted" ? "inserted" : objectOutcome;
      const copiedItem: CheckpointItem = { sourceIdentityHash: planned.sourceIdentityHash, destinationRef: planned.destinationRef, kind: planned.kind, bytes: body.byteLength, sha256, state: "copied", objectOutcome: effectiveObjectOutcome };
      items.set(planned.sourceIdentityHash, copiedItem); checkpoint = { ...checkpoint, cursorRef: planned.cursorRef, items: [...items.values()] }; await save(options.checkpoint, checkpoint);
      const mappingOutcome = await destination.putMappingIfAbsent({ sourceIdentity: planned.sourceIdentity, sourceIdentityHash: planned.sourceIdentityHash, kind: planned.kind, sessionId: planned.sessionId, uploadId: planned.uploadId, destinationKey: planned.destinationKey, sha256, bytes: body.byteLength });
      if (mappingOutcome === "conflict") throw new Error("mapping_conflict");
      items.set(planned.sourceIdentityHash, { ...copiedItem, state: "mapped", mappingOutcome }); checkpoint = { ...checkpoint, items: [...items.values()] }; await save(options.checkpoint, checkpoint); add(observed, body.byteLength);
    } catch (error) { const code = safeCode(error); failures.push({ sourceIdentityHash: planned.sourceIdentityHash, code }); if (mode === "apply") { const previous = items.get(planned.sourceIdentityHash); items.set(planned.sourceIdentityHash, { sourceIdentityHash: planned.sourceIdentityHash, destinationRef: planned.destinationRef, kind: planned.kind, bytes: previous?.bytes ?? 0, sha256: previous?.sha256 ?? hash("failed"), state: "failed", errorCode: code, objectOutcome: previous?.objectOutcome, mappingOutcome: previous?.mappingOutcome }); checkpoint = { ...checkpoint, items: [...items.values()] }; await save(options.checkpoint, checkpoint); } }
  }
  const reconciled = mode === "apply" && failures.length === 0 && observed.objects === sourceTotals.objects && observed.bytes === sourceTotals.bytes;
  const rollback = [...items.values()].filter((item) => item.state === "mapped" && (item.objectOutcome === "inserted" || item.mappingOutcome === "inserted")).map((item) => ({ sourceIdentityHash: item.sourceIdentityHash, destinationRef: item.destinationRef, objectCreated: item.objectOutcome === "inserted", mappingCreated: item.mappingOutcome === "inserted" }));
  return mode === "dry-run" ? { mode, reconciled: false, snapshot: { source: sourceTotals, projectedDestination: observed }, runDelta: { copied: 0, resumed: 0, collisions: 0, failures }, rollback: [] } : { mode, reconciled, snapshot: { source: sourceTotals, observedDestination: observed }, runDelta: { copied, resumed, collisions, failures }, rollback };
}
