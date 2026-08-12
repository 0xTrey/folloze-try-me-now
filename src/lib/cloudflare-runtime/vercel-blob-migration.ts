import { createHash } from "node:crypto";

/**
 * Provider-neutral, opt-in migration engine.  This module deliberately has no
 * Vercel Blob, R2, D1, environment, or Worker imports.  Production adapters
 * may only be introduced in a separately reviewed, authenticated cutover.
 */
export type BlobObject = Readonly<{
  key: string;
  size: number;
  etag?: string;
  contentType?: string;
  cacheControl?: string;
  cursor: string;
}>;

export interface ReadOnlyBlobSource {
  /** Must be an immutable snapshot; the engine never mutates its source. */
  list(cursor?: string): Promise<{ objects: readonly BlobObject[]; nextCursor?: string }>;
  read(object: BlobObject): Promise<AsyncIterable<Uint8Array>>;
}

export type DestinationHead = Readonly<{ size: number; sha256?: string }>;
export interface WriteOnceDestination {
  head(key: string): Promise<DestinationHead | null>;
  /** Must fail if the target key already exists. It must never overwrite. */
  putIfAbsent(input: Readonly<{
    key: string;
    body: Uint8Array;
    sha256: string;
    contentType: string;
    cacheControl: string;
    access: "private";
  }>): Promise<void>;
  /** INSERT-only mapping: source identity is unique and may never be reassigned. */
  putMappingIfAbsent(input: Readonly<{
    sourceIdentity: string;
    sourceIdentityHash: string;
    kind: MigrationKind;
    sessionId?: string;
    uploadId?: string;
    destinationKey: string;
    sha256: string;
    bytes: number;
  }>): Promise<void>;
}

export type MigrationKind = "session" | "lead" | "upload" | "upload-status";
export type CheckpointItem = Readonly<{
  sourceIdentityHash: string;
  destinationKey: string;
  kind: MigrationKind;
  bytes: number;
  sha256: string;
  state: "copied" | "mapped" | "failed";
  errorCode?: string;
}>;
export interface MigrationCheckpointStore {
  load(): Promise<Readonly<{ cursor?: string; items: readonly CheckpointItem[] }> | null>;
  save(checkpoint: Readonly<{ cursor?: string; items: readonly CheckpointItem[] }>): Promise<void>;
}

export type MigrationOptions = Readonly<{
  dryRun?: boolean;
  checkpoint?: MigrationCheckpointStore;
  pageSize?: number;
}>;
export type MigrationReport = Readonly<{
  dryRun: boolean;
  source: { objects: number; bytes: number };
  destination: { objects: number; bytes: number };
  copied: number;
  resumed: number;
  collisions: number;
  failures: readonly { sourceIdentityHash: string; code: string }[];
  rollback: readonly { sourceIdentityHash: string; destinationKey: string; sha256: string; bytes: number }[];
}>;

type PlannedObject = Readonly<{
  object: BlobObject;
  kind: MigrationKind;
  sessionId?: string;
  uploadId?: string;
  sourceIdentity: string;
  sourceIdentityHash: string;
  destinationKey: string;
}>;

const SHA256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const safeContentType = (value?: string) => value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : "application/octet-stream";

/** Only known private Try Me records are eligible. Unknown prefixes fail closed. */
export function planBlobObject(object: BlobObject): PlannedObject {
  const session = /^try-me\/sessions\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key);
  const lead = /^try-me\/leads\/([A-Za-z0-9_-]{20,64})\.json$/.exec(object.key);
  const upload = /^try-me\/uploads\/([A-Za-z0-9_-]{20,64})\/([0-9a-f-]{36})\.pdf$/i.exec(object.key);
  const status = /^try-me\/upload-status\/([A-Za-z0-9_-]{20,64})\/([0-9a-f-]{36})\.json$/i.exec(object.key);
  const match = session ?? lead ?? upload ?? status;
  if (!match || object.size < 0 || !Number.isSafeInteger(object.size)) throw new Error("unsupported_source_object");
  const kind: MigrationKind = session ? "session" : lead ? "lead" : upload ? "upload" : "upload-status";
  // Preserve the established opaque object layout. It is private-only at R2.
  const sourceIdentity = object.key;
  return {
    object,
    kind,
    sessionId: match[1],
    uploadId: upload?.[2] ?? status?.[2],
    sourceIdentity,
    sourceIdentityHash: SHA256(sourceIdentity),
    destinationKey: sourceIdentity
  };
}

async function bufferedAndHashed(stream: AsyncIterable<Uint8Array>): Promise<{ body: Uint8Array; sha256: string }> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const hash = createHash("sha256");
  for await (const chunk of stream) {
    const value = new Uint8Array(chunk);
    chunks.push(value); length += value.byteLength; hash.update(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { body, sha256: hash.digest("hex") };
}

function safeErrorCode(error: unknown): string {
  return error instanceof Error && /^[a-z0-9_]{1,64}$/i.test(error.message) ? error.message : "migration_failed";
}

/**
 * Runs against only abstract adapters. `dryRun` defaults true and reads source
 * bytes solely to validate byte counts and hashes; it performs zero writes.
 * Provider ETags are treated as opaque change hints, never content proof.
 */
export async function migrateBlobSnapshot(
  source: ReadOnlyBlobSource,
  destination: WriteOnceDestination,
  options: MigrationOptions = {}
): Promise<MigrationReport> {
  const dryRun = options.dryRun ?? true;
  const prior = await options.checkpoint?.load();
  const items = new Map((prior?.items ?? []).map((item) => [item.sourceIdentityHash, item]));
  let cursor = prior?.cursor;
  let sourceObjects = 0, sourceBytes = 0, destinationObjects = 0, destinationBytes = 0, copied = 0, resumed = 0, collisions = 0;
  const failures: { sourceIdentityHash: string; code: string }[] = [];

  do {
    const page = await source.list(cursor);
    if (page.objects.length > (options.pageSize ?? 1000)) throw new Error("source_page_exceeds_limit");
    for (const object of page.objects) {
      const planned = planBlobObject(object);
      sourceObjects += 1; sourceBytes += object.size;
      const previous = items.get(planned.sourceIdentityHash);
      if (previous?.state === "mapped") { resumed += 1; destinationObjects += 1; destinationBytes += previous.bytes; continue; }
      try {
        const { body, sha256 } = await bufferedAndHashed(await source.read(object));
        if (body.byteLength !== object.size) throw new Error("source_size_mismatch");
        const checkpoint: CheckpointItem = { sourceIdentityHash: planned.sourceIdentityHash, destinationKey: planned.destinationKey, kind: planned.kind, bytes: body.byteLength, sha256, state: "copied" };
        if (!dryRun) {
          const existing = await destination.head(planned.destinationKey);
          if (existing && (existing.size !== body.byteLength || !existing.sha256 || existing.sha256 !== sha256)) { collisions += 1; throw new Error("destination_collision"); }
          if (!existing) await destination.putIfAbsent({ key: planned.destinationKey, body, sha256, contentType: safeContentType(object.contentType), cacheControl: "private, no-store", access: "private" });
          items.set(planned.sourceIdentityHash, checkpoint);
          await options.checkpoint?.save({ cursor, items: [...items.values()] });
          await destination.putMappingIfAbsent({ sourceIdentity: planned.sourceIdentity, sourceIdentityHash: planned.sourceIdentityHash, kind: planned.kind, sessionId: planned.sessionId, uploadId: planned.uploadId, destinationKey: planned.destinationKey, sha256, bytes: body.byteLength });
          items.set(planned.sourceIdentityHash, { ...checkpoint, state: "mapped" });
          await options.checkpoint?.save({ cursor, items: [...items.values()] });
          copied += existing ? 0 : 1;
        }
        destinationObjects += 1; destinationBytes += body.byteLength;
      } catch (error) {
        const code = safeErrorCode(error);
        failures.push({ sourceIdentityHash: planned.sourceIdentityHash, code });
        items.set(planned.sourceIdentityHash, { sourceIdentityHash: planned.sourceIdentityHash, destinationKey: planned.destinationKey, kind: planned.kind, bytes: previous?.bytes ?? 0, sha256: previous?.sha256 ?? "", state: "failed", errorCode: code });
        if (!dryRun) await options.checkpoint?.save({ cursor, items: [...items.values()] });
      }
    }
    cursor = page.nextCursor;
    if (!dryRun) await options.checkpoint?.save({ cursor, items: [...items.values()] });
  } while (cursor);

  return { dryRun, source: { objects: sourceObjects, bytes: sourceBytes }, destination: { objects: destinationObjects, bytes: destinationBytes }, copied, resumed, collisions, failures, rollback: [...items.values()].filter((item) => item.state === "mapped").map(({ sourceIdentityHash, destinationKey, sha256, bytes }) => ({ sourceIdentityHash, destinationKey, sha256, bytes })) };
}
