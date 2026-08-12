# Try Me provider migration layer (inactive)

This layer is a manual integration harness only. It is not imported by app code,
Worker routes, or deployed configuration. `scripts/try-me-provider-migration.mjs`
defaults to dry-run and performs zero provider access or writes; `--apply` remains
intentionally unbound and exits safely until a separately reviewed operator
harness supplies explicit preview-only bindings.

Secret names for that future harness only: `BLOB_READ_WRITE_TOKEN`,
`CLOUDFLARE_API_TOKEN`, and a checkpoint encryption key. Never put values in Git.

The Vercel adapter lists only `try-me/` using private reads and validates exact
byte counts/SHA-256 through the core engine. The destination uses private R2 and
unapplied D1 migration `0002`; object and mapping ownership receipts are opaque,
deterministic, queryable, and required for rollback. Mapping plus its receipt are
one D1 batch: the receipt is conditionally inserted only after an exact field
match, and ownership comes from the mapping's durable `created_run_token`, never
from D1 batch row counts. There is no deletion command, no runtime selector, no binding, and
no D1 migration application in this change.

Activation prerequisites: create a blank preview R2/D1 pair; independently apply
and checksum the D1 journal; provide least-privilege test-only credentials outside
Git; use encrypted checkpoints; execute dry-run, then a supervised apply with
bounded concurrency/byte limits/retry policy; verify count/bytes/hashes, receipts,
and rollback manifest before any route/DNS/runtime change. Resend, email, queues,
and production data are out of scope.
