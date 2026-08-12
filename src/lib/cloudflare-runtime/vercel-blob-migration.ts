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
export type OwnershipReceipt = Readonly<{ receiptRef: string; ownership: "created" | "preexisting" }>;
export interface WriteOnceDestination {
  /** Atomic write plus durable ownership receipt, keyed by the opaque token/ref. */
  putIfAbsent(input: Readonly<{ key: string; body: Uint8Array; sha256: string; contentType: string; cacheControl: string; access: "private"; ownershipToken: string; receiptRef: string }>): Promise<OwnershipReceipt | "conflict">;
  lookupObjectReceipt(input: Readonly<{ ownershipToken: string; receiptRef: string }>): Promise<OwnershipReceipt | null>;
  /** Mapping insert and its receipt must commit atomically in the destination ledger. */
  putMappingIfAbsent(input: Readonly<{ sourceIdentity: string; sourceIdentityHash: string; kind: MigrationKind; sessionId?: string; uploadId?: string; destinationKey: string; sha256: string; bytes: number; ownershipToken: string; receiptRef: string }>): Promise<OwnershipReceipt | "conflict">;
  lookupMappingReceipt(input: Readonly<{ ownershipToken: string; receiptRef: string }>): Promise<OwnershipReceipt | null>;
}
export type MigrationKind = "session" | "lead" | "upload" | "upload-status";
type ExpectedItem = Readonly<{ sourceIdentityHash: string; destinationRef: string; bytes: number; kind: MigrationKind }>;
export type CheckpointItem = Readonly<{ sourceIdentityHash: string; destinationRef: string; kind: MigrationKind; bytes: number; sha256: string; state: "copied" | "mapped" | "failed"; objectReceiptRef?: string; mappingReceiptRef?: string; errorCode?: SafeErrorCode }>;
export type MigrationCheckpoint = Readonly<{ snapshotRef: string; snapshotDigest: string; ownershipRunToken: string; expected: Readonly<{ objects: number; bytes: number; identities: readonly ExpectedItem[] }>; cursorRef?: string; items: readonly CheckpointItem[] }>;
export interface MigrationCheckpointStore { load(): Promise<MigrationCheckpoint | null>; save(checkpoint: MigrationCheckpoint): Promise<void>; }
export type MigrationOptions = Readonly<{ dryRun?: boolean; checkpoint?: MigrationCheckpointStore; cursorResolver?: CursorResolver; pageSize?: number }>;
type Totals = { objects: number; bytes: number };
export type MigrationReport = Readonly<{ mode: "dry-run" | "apply"; reconciled: boolean; snapshot: { source: Totals; observedDestination?: Totals; projectedDestination?: Totals }; runDelta: { copied: number; resumed: number; collisions: number; failures: readonly { sourceIdentityHash: string; code: SafeErrorCode }[] }; rollback: readonly { sourceIdentityHash: string; destinationRef: string; objectCreated: boolean; mappingCreated: boolean }[] }>;
type PlannedObject = Readonly<{ object: BlobObject; kind: MigrationKind; sessionId?: string; uploadId?: string; sourceIdentity: string; sourceIdentityHash: string; destinationKey: string; destinationRef: string; cursorRef: string }>;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const refFor = (prefix: string, identityHash: string) => hash(`${prefix}:${identityHash}`);
const objectReceiptFor = (runToken: string, sourceIdentityHash: string) => refFor("object-receipt", hash(`${runToken}:${sourceIdentityHash}`));
const mappingReceiptFor = (runToken: string, sourceIdentityHash: string) => refFor("mapping-receipt", hash(`${runToken}:${sourceIdentityHash}`));
const isHex = (value: string) => /^[a-f0-9]{64}$/.test(value);
const isKind = (value: string): value is MigrationKind => ["session", "lead", "upload", "upload-status"].includes(value);
const isState = (value: unknown): value is CheckpointItem["state"] => value === "copied" || value === "mapped" || value === "failed";
const isReceipt = (value: unknown, expected: string): value is OwnershipReceipt => Boolean(value && typeof value === "object" && (value as OwnershipReceipt).receiptRef === expected && isHex((value as OwnershipReceipt).receiptRef) && ((value as OwnershipReceipt).ownership === "created" || (value as OwnershipReceipt).ownership === "preexisting"));
const safeContentType = (value?: string) => value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : "application/octet-stream";
const safeCodes = ["unsupported_source_object", "source_size_mismatch", "destination_collision", "mapping_conflict", "source_page_exceeds_limit", "source_transient", "source_missing", "mapping_unavailable", "migration_failed"] as const;
export type SafeErrorCode = (typeof safeCodes)[number];
const safeCode = (error: unknown): SafeErrorCode => { const candidate = error instanceof Error ? error.message : ""; return safeCodes.includes(candidate as SafeErrorCode) ? candidate as SafeErrorCode : "migration_failed"; };
const add = (totals: Totals, bytes: number) => { if (!Number.isSafeInteger(bytes) || bytes < 0 || totals.bytes > Number.MAX_SAFE_INTEGER - bytes || totals.objects === Number.MAX_SAFE_INTEGER) throw new Error("byte_sum_overflow"); totals.objects++; totals.bytes += bytes; };

export function planBlobObject(object: BlobObject): PlannedObject {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const session = /^try-me\/sessions\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key), lead = /^try-me\/leads\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key), upload = new RegExp(`^try-me/uploads/([A-Za-z0-9_-]{20,64})/(${uuid})\\.pdf$`, "i").exec(object.key), status = new RegExp(`^try-me/upload-status/([A-Za-z0-9_-]{20,64})/(${uuid})\\.json$`, "i").exec(object.key), match = session ?? lead ?? upload ?? status;
  if (!match || !Number.isSafeInteger(object.size) || object.size < 0) throw new Error("unsupported_source_object");
  const sourceIdentity = object.key, sourceIdentityHash = hash(sourceIdentity);
  return { object, kind: session ? "session" : lead ? "lead" : upload ? "upload" : "upload-status", sessionId: match[1], uploadId: upload?.[2] ?? status?.[2], sourceIdentity, sourceIdentityHash, destinationKey: sourceIdentity, destinationRef: refFor("destination", sourceIdentityHash), cursorRef: refFor("cursor", hash(object.cursor)) };
}
async function bytesAndHash(stream: AsyncIterable<Uint8Array>) { const chunks: Uint8Array[] = []; let length = 0; const digest = createHash("sha256"); for await (const chunk of stream) { const value = new Uint8Array(chunk); if (length > Number.MAX_SAFE_INTEGER - value.byteLength) throw new Error("byte_sum_overflow"); chunks.push(value); length += value.byteLength; digest.update(value); } const body = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; } return { body, sha256: digest.digest("hex") }; }
function validateCheckpoint(checkpoint: MigrationCheckpoint | null) {
  if (!checkpoint) return new Map<string, CheckpointItem>();
  if (!isHex(checkpoint.snapshotRef) || !isHex(checkpoint.snapshotDigest) || !isHex(checkpoint.ownershipRunToken) || !Number.isSafeInteger(checkpoint.expected.objects) || !Number.isSafeInteger(checkpoint.expected.bytes) || checkpoint.expected.objects <= 0 || checkpoint.expected.bytes < 0 || (checkpoint.cursorRef !== undefined && !isHex(checkpoint.cursorRef))) throw new Error("malformed_checkpoint");
  const expected = new Set<string>(), items = new Map<string, CheckpointItem>(), totals: Totals = { objects: 0, bytes: 0 };
  for (const expectedItem of checkpoint.expected.identities) { if (!isHex(expectedItem.sourceIdentityHash) || expectedItem.destinationRef !== refFor("destination", expectedItem.sourceIdentityHash) || !isKind(expectedItem.kind) || expected.has(expectedItem.sourceIdentityHash)) throw new Error("malformed_checkpoint"); expected.add(expectedItem.sourceIdentityHash); add(totals, expectedItem.bytes); }
  if (totals.objects !== checkpoint.expected.objects || totals.bytes !== checkpoint.expected.bytes) throw new Error("malformed_checkpoint");
  for (const item of checkpoint.items) { const objectRef = objectReceiptFor(checkpoint.ownershipRunToken, item.sourceIdentityHash), mappingRef = mappingReceiptFor(checkpoint.ownershipRunToken, item.sourceIdentityHash); const validRefs = (item.objectReceiptRef === undefined || item.objectReceiptRef === objectRef) && (item.mappingReceiptRef === undefined || item.mappingReceiptRef === mappingRef); const validStateRefs = item.state === "mapped" ? item.objectReceiptRef === objectRef && item.mappingReceiptRef === mappingRef : item.state === "copied" ? item.objectReceiptRef === objectRef && item.mappingReceiptRef === undefined : item.mappingReceiptRef === undefined || item.objectReceiptRef === objectRef; if (!expected.has(item.sourceIdentityHash) || items.has(item.sourceIdentityHash) || item.destinationRef !== refFor("destination", item.sourceIdentityHash) || !isKind(item.kind) || !isState(item.state) || !validRefs || !validStateRefs || !isHex(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || (item.errorCode !== undefined && !safeCodes.includes(item.errorCode)) || (item.state !== "failed" && item.errorCode !== undefined) || (item.state === "failed" && !item.errorCode)) throw new Error("malformed_checkpoint"); items.set(item.sourceIdentityHash, item); }
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
async function reconstructRollbackReceipts(items: Map<string, CheckpointItem>, token: string, destination: WriteOnceDestination) {
  const reconstructed = new Map<string, { object?: OwnershipReceipt; mapping?: OwnershipReceipt }>(); let valid = true;
  for (const item of items.values()) {
    const expectedObject = objectReceiptFor(token, item.sourceIdentityHash), expectedMapping = mappingReceiptFor(token, item.sourceIdentityHash);
    try {
      const object = item.objectReceiptRef ? await destination.lookupObjectReceipt({ ownershipToken: token, receiptRef: expectedObject }) : undefined;
      const mapping = item.mappingReceiptRef ? await destination.lookupMappingReceipt({ ownershipToken: token, receiptRef: expectedMapping }) : undefined;
      if ((item.objectReceiptRef && !isReceipt(object, expectedObject)) || (item.mappingReceiptRef && !isReceipt(mapping, expectedMapping))) { valid = false; continue; }
      reconstructed.set(item.sourceIdentityHash, { object: object ?? undefined, mapping: mapping ?? undefined });
    } catch { valid = false; }
  }
  return { valid, receipts: reconstructed };
}

/** Full-snapshot scan; checkpoint cursors are progress hints only and never scope totals. */
export async function migrateBlobSnapshot(source: ReadOnlyBlobSource, destination: WriteOnceDestination, options: MigrationOptions = {}): Promise<MigrationReport> {
  const mode = options.dryRun ?? true ? "dry-run" : "apply", snapshot = await source.snapshot(), snapshotRef = refFor("snapshot", hash(snapshot.id)); if (!isHex(snapshot.digest)) throw new Error("invalid_snapshot");
  const { all, totals: sourceTotals } = await enumerate(source, options.pageSize ?? 1000), expected = expectedFor(all, sourceTotals), prior = await options.checkpoint?.load() ?? null, items = validateCheckpoint(prior);
  if (prior && (prior.snapshotRef !== snapshotRef || prior.snapshotDigest !== snapshot.digest || !sameExpected(prior.expected, expected))) throw new Error("stale_checkpoint");
  const ownershipRunToken = refFor("ownership-run", hash(`${snapshotRef}:${snapshot.digest}`));
  if (prior && prior.ownershipRunToken !== ownershipRunToken) throw new Error("stale_checkpoint");
  let checkpoint: MigrationCheckpoint = prior ?? { snapshotRef, snapshotDigest: snapshot.digest, ownershipRunToken, expected, items: [] }, copied = 0, resumed = 0, collisions = 0, receiptAuthorityValid = true; const observed: Totals = { objects: 0, bytes: 0 }, failures: { sourceIdentityHash: string; code: SafeErrorCode }[] = [], receipts = new Map<string, { object?: OwnershipReceipt; mapping?: OwnershipReceipt }>();
  for (const planned of all) {
    try {
      const { body, sha256 } = await bytesAndHash(await source.read(planned.object)); if (body.byteLength !== planned.object.size) throw new Error("source_size_mismatch");
      if (mode === "dry-run") { add(observed, body.byteLength); continue; }
      await options.cursorResolver?.remember(planned.cursorRef, planned.object.cursor);
      const previous = items.get(planned.sourceIdentityHash), objectReceiptRef = objectReceiptFor(ownershipRunToken, planned.sourceIdentityHash), mappingReceiptRef = mappingReceiptFor(ownershipRunToken, planned.sourceIdentityHash);
      let objectReceipt: OwnershipReceipt | "conflict" | null; try { objectReceipt = await destination.lookupObjectReceipt({ ownershipToken: ownershipRunToken, receiptRef: objectReceiptRef }); } catch { receiptAuthorityValid = false; throw new Error("migration_failed"); }
      if (objectReceipt === null) objectReceipt = await destination.putIfAbsent({ key: planned.destinationKey, body, sha256, contentType: safeContentType(planned.object.contentType), cacheControl: "private, no-store", access: "private", ownershipToken: ownershipRunToken, receiptRef: objectReceiptRef });
      if (objectReceipt === "conflict") { collisions++; throw new Error("destination_collision"); }
      if (!isReceipt(objectReceipt, objectReceiptRef)) { receiptAuthorityValid = false; throw new Error("migration_failed"); } receipts.set(planned.sourceIdentityHash, { object: objectReceipt }); if (objectReceipt.ownership === "created") copied++; else if (previous?.state === "mapped") resumed++;
      const copiedItem: CheckpointItem = { sourceIdentityHash: planned.sourceIdentityHash, destinationRef: planned.destinationRef, kind: planned.kind, bytes: body.byteLength, sha256, state: "copied", objectReceiptRef };
      items.set(planned.sourceIdentityHash, copiedItem); checkpoint = { ...checkpoint, cursorRef: planned.cursorRef, items: [...items.values()] }; await save(options.checkpoint, checkpoint);
      let mappingReceipt: OwnershipReceipt | "conflict" | null; try { mappingReceipt = await destination.lookupMappingReceipt({ ownershipToken: ownershipRunToken, receiptRef: mappingReceiptRef }); } catch { receiptAuthorityValid = false; throw new Error("migration_failed"); }
      if (mappingReceipt === null) mappingReceipt = await destination.putMappingIfAbsent({ sourceIdentity: planned.sourceIdentity, sourceIdentityHash: planned.sourceIdentityHash, kind: planned.kind, sessionId: planned.sessionId, uploadId: planned.uploadId, destinationKey: planned.destinationKey, sha256, bytes: body.byteLength, ownershipToken: ownershipRunToken, receiptRef: mappingReceiptRef });
      if (mappingReceipt === "conflict") throw new Error("mapping_conflict");
      if (!isReceipt(mappingReceipt, mappingReceiptRef)) { receiptAuthorityValid = false; throw new Error("migration_failed"); } receipts.set(planned.sourceIdentityHash, { object: objectReceipt, mapping: mappingReceipt });
      items.set(planned.sourceIdentityHash, { ...copiedItem, state: "mapped", mappingReceiptRef }); checkpoint = { ...checkpoint, items: [...items.values()] }; await save(options.checkpoint, checkpoint); add(observed, body.byteLength);
    } catch (error) { const code = safeCode(error); failures.push({ sourceIdentityHash: planned.sourceIdentityHash, code }); if (mode === "apply") { const previous = items.get(planned.sourceIdentityHash); items.set(planned.sourceIdentityHash, { sourceIdentityHash: planned.sourceIdentityHash, destinationRef: planned.destinationRef, kind: planned.kind, bytes: previous?.bytes ?? 0, sha256: previous?.sha256 ?? hash("failed"), state: "failed", errorCode: code, objectReceiptRef: previous?.objectReceiptRef, mappingReceiptRef: previous?.mappingReceiptRef }); checkpoint = { ...checkpoint, items: [...items.values()] }; await save(options.checkpoint, checkpoint); } }
  }
  const reconstructed = mode === "apply" ? await reconstructRollbackReceipts(items, ownershipRunToken, destination) : { valid: true, receipts };
  reconstructed.valid &&= receiptAuthorityValid;
  if (!reconstructed.valid) failures.push({ sourceIdentityHash: hash("receipt_reconstruction"), code: "migration_failed" });
  const reconciled = mode === "apply" && reconstructed.valid && failures.length === 0 && observed.objects === sourceTotals.objects && observed.bytes === sourceTotals.bytes;
  const rollback = !reconstructed.valid ? [] : [...items.values()].map((item) => { const receipt = reconstructed.receipts.get(item.sourceIdentityHash); return { sourceIdentityHash: item.sourceIdentityHash, destinationRef: item.destinationRef, objectCreated: receipt?.object?.ownership === "created", mappingCreated: receipt?.mapping?.ownership === "created" }; }).filter((item) => item.objectCreated || item.mappingCreated);
  return mode === "dry-run" ? { mode, reconciled: false, snapshot: { source: sourceTotals, projectedDestination: observed }, runDelta: { copied: 0, resumed: 0, collisions: 0, failures }, rollback: [] } : { mode, reconciled, snapshot: { source: sourceTotals, observedDestination: observed }, runDelta: { copied, resumed, collisions, failures }, rollback };
}
