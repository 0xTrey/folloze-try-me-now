# Inactive Cloudflare upload adapters

This is an isolated, fail-closed implementation slice. It is not imported by
Next/Vercel routes and its Worker config defaults to `ADAPTER_ENABLED=disabled`.
It creates no resources and is not deployable as part of the Vercel build.

The adapter uses opaque D1 capability rows (the browser never receives database
authority), R2 `head()` validation, conditional D1 status/session updates,
idempotent Queue message IDs, and a D1 outcome only after an owned completion.
The schedule registry mirrors Vercel's existing 15-minute upload cleanup,
5-minute lead reconciliation, and daily trace cleanup. A future migration must
provision bindings, set the D1 binding's `migrations_dir` to
`cloudflare-runtime/d1/migrations`, apply that directory's independently
journaled `0001_create_cf_upload_adapter.sql`, wire a separate authenticated route,
and verify rollback by setting the selector back to disabled. None is included
in this PR. The Neon lead runner only reads `db/migrations`, which intentionally
contains no Cloudflare D1 migration.

## Preview resource bindings

`cloudflare-runtime/wrangler.preview.jsonc` is the only configuration that
names the already-created preview resources. It keeps
`ADAPTER_ENABLED=disabled`, disables automatic Worker and version preview URLs,
and declares no routes, custom domains, cron triggers, or Queue consumer. The
Worker exports only `fetch`; while disabled it returns `404 Not found` without
reading or writing D1, R2, or Queue. D1 uses the dedicated `d1/migrations`
directory and `cf_upload_adapter_migrations` journal table.

The main Queue is bound only as a producer so the adapter type can be reviewed
against the real preview resource. The DLQ is recorded in
`preview-resources.json` but deliberately unbound: this Worker has no Queue
handler, and attaching a consumer would create a live message-delivery path.
No migration was applied and no object, row, or message was written.

### Rollback and deletion order

For this config-only change, rollback is simply reverting the preview config;
there is no deployed external state to unwind. If a later authorized rollout
creates bindings or traffic, keep the selector disabled, remove any routes,
cron triggers, and consumer first, then remove the producer binding. After
confirming both Queues are empty, delete the main Queue and then its DLQ. Verify
and empty R2 before deleting the bucket. Export/verify D1 last, then delete the
database; D1 is retained until the end because it is the authoritative status
and outcome ledger.
