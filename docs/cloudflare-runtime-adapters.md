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
