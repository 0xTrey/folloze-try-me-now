# Try Me Now: Vercel Blob to Cloudflare migration contract

This is a **test-only migration design**, not a deployed migration. It imports no
provider SDK, reads no environment variables, and defaults to dry-run. The local
planning CLI accepts only an operator-supplied local snapshot manifest and never
opens a network connection.

## Scope and safety contract

Eligible source keys are the existing private Try Me session, lead, upload, and
upload-status layouts. The source adapter is read-only and must expose an
immutable listing snapshot. Unknown or duplicate keys fail closed. Raw source
keys, destination keys, session IDs, and upload IDs exist only in process while
calling a separately protected destination adapter. They are never persisted by
this engine. Reports, checkpoints, and rollback manifests contain only the
source SHA-256 identity hash and a deterministic opaque destination reference.
The destination adapter is responsible for keeping its own protected raw-key
resolver and D1 INSERT-only mapping.

`etag` is only a provider change hint: it is not content proof and is never used
for idempotency. The tool streams source bytes, verifies listed byte count, and
uses SHA-256 for source/destination equality. Destination writes are strictly
write-once (`putIfAbsent`); an existing key must have exactly matching bytes and
SHA-256 or the run stops that object with `destination_collision`.

The report intentionally separates a complete **snapshot** from a **run delta**.
The engine always scans the snapshot from page one, even after a checkpoint, so
source totals are global rather than cursor-relative. Dry runs report only
`projectedDestination`; they never claim a destination was observed. Apply runs
report `observedDestination` and set `reconciled: true` only when every eligible
source object was observed with matching hash/bytes and there were no failures.
Any failure makes the run unreconciled.

## Run phases

1. Produce a source snapshot/export with the Vercel access owner, freeze writes
   or record a bounded cutover window, and locally validate it:
   `node scripts/try-me-blob-migration.mjs --dry-run --manifest snapshot.json`.
2. Use separately reviewed, least-privilege source/R2/D1 adapters only after a
   blank Cloudflare preview environment, D1 schema, private R2 policy, and
   checkpoint encryption/location are approved. Start `dryRun: true`.
3. Apply a single snapshot with a durable, encrypted checkpoint. After each
   object copy, persist only its opaque hash/reference as `copied`; after the
   protected adapter completes its INSERT-only D1 mapping, persist `mapped`. A
   retry resumes copied-but-unmapped objects and never overwrites a target.
4. Reconcile source and destination object counts and bytes, then hash every
   migrated object. Validate session IDs/revisions and upload status mappings
   against the inactive adapter before any runtime selector changes.
5. Keep Vercel Blob read-only through the observation period. Rollback first
   disables the Cloudflare runtime selector, then restores routing, then uses the
   redacted export manifest to delete only confirmed migration-created R2/D1
   records. Never delete a source object before approval and successful restore.

## Prerequisites and limitations

- No production data transfer has occurred. A production adapter must separately
  handle source snapshot consistency, encrypted checkpoint storage, D1 atomic
  `INSERT OR IGNORE` semantics with collision verification, raw-key resolver
  protection, and R2 hashes.
- R2 ETags are not portable SHA-256 values; preserve content hashes explicitly.
- The current engine buffers each object for deterministic hashing; the real
  adapter must impose the existing PDF size cap and stream/multipart large files.
- Access stays `private`, cache policy is `private, no-store`, and metadata is
  normalized rather than copied blindly. No public URLs are migrated.
- The engine rejects malformed/duplicate checkpoint identities, reference/hash
  inconsistency, cursor cycles, duplicate source keys, and unsafe byte sums.
