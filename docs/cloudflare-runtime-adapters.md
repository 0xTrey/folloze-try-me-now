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
Neither this PR workflow nor the root operator's verification applied a
migration or performed a D1, R2, or Queue write.

The root operator verified the resource metadata through a fixed-allowlist,
read-only Cloudflare API check at `2026-08-12T15:32:00Z`. D1 existed with the
configured name/ID and `num_tables=0`; its reported 12,288-byte file size is
platform metadata, not a claim that the database is zero bytes. R2 existed in
`WNAM` with the `Standard` storage class, and verification performed no write;
its object count was not queried, so this receipt makes no bucket-emptiness
claim. The main Queue (`09ced95b4e8f4966909e5a56ae06f6f6`) and DLQ
(`5f23c07419764acab5963ad02145d491`) each reported zero producers and zero
consumers. Those binding counts are not a Queue message-count claim.

### Rollback and deletion order

For this config-only change, rollback is simply reverting the preview config;
there is no deployed external state to unwind. If a later authorized rollout
creates bindings or traffic, keep the selector disabled, remove any routes,
cron triggers, and consumer first, then remove the producer binding. After
confirming both Queues are empty, delete the main Queue and then its DLQ. Verify
and empty R2 before deleting the bucket. Export/verify D1 last, then delete the
database; D1 is retained until the end because it is the authoritative status
and outcome ledger.

## Manual disabled-Worker deployment

`.github/workflows/cloudflare-preview-adapter.yml` is the only deployment path
for this inactive slice. It has only a `workflow_dispatch` trigger, accepts the
exact `deploy-disabled-preview` confirmation, and refuses to proceed outside
the default `codex/visual-v1` branch. The deploy job is gated by the
`cloudflare-preview` GitHub environment and reads only the environment secret
`CLOUDFLARE_API_TOKEN` and environment variable `CLOUDFLARE_ACCOUNT_ID`.
Node is pinned to `22.18.0`; repository dependencies use `npm ci` with the
committed npm lockfile (this repository does not use pnpm); Wrangler is invoked
as the exact `wrangler@4.122.0` package.

Before its sole upload step, the workflow runs both config validators, focused
and full tests, typecheck, a production build, and a Wrangler dry-run. The
deploy preflight uses the TypeScript AST to require a single `fetch` handler
and rejects `scheduled`, `queue`, named, computed, or spread handlers. It also
requires `ADAPTER_ENABLED=disabled`, `workers_dev=false`,
`preview_urls=false`, only the three preview resource bindings, the dedicated
D1 migration journal, and no routes, triggers, or Queue consumer. The workflow
contains no migration, D1 data, R2 object, or Queue message command.

### No-public-route and metadata-only verification contract

Deployment creates an account-only Worker version. It does not add a Worker
route, custom domain, workers.dev URL, version preview URL, cron, or Queue
consumer. After upload, Wrangler selects the one version tagged with the exact
Git commit, workflow run, and attempt and reads that version's handler and
binding metadata. Four allowlisted direct Cloudflare metadata GETs then verify
the script has no zone routes, the subdomain and preview URL switches are off,
there are no custom domains, and there are no cron triggers. Only after those
checks pass, pinned Wrangler reads the current deployment status and requires
the verified version to be the sole active version at exactly 100% traffic.
The workflow does not treat the existence of a safe tagged version as proof
that it is active; a concurrent deployment observed by this final check fails
the run. The temporary metadata is neither printed nor uploaded. No D1, R2,
Queue, application-data, or Worker-content endpoint is called.

For a subsequent deployment, roll back only to a previously verified disabled
version:

```sh
npx --yes wrangler@4.122.0 rollback <PREVIOUS_DISABLED_VERSION_ID> --name try-me-now-upload-adapter-preview --config cloudflare-runtime/wrangler.preview.jsonc --message "Rollback disabled preview Worker" --yes
```

A first deployment has no prior version to roll back to. Because it has no
public route, leave it disabled and correct/redeploy a reviewed commit rather
than deleting resources or attaching traffic from this workflow.

### Authoring audit note

On 2026-08-12, while checking the documented `wrangler versions view --json`
command shape locally, a deliberately nonexistent version ID was passed to
Wrangler and an existing local session issued one read-only Worker-version GET.
Cloudflare returned code `10007` (`Worker does not exist`) for
`try-me-now-upload-adapter-preview`. No script or resource content was returned,
no D1/R2/Queue endpoint was called, no credential value was exposed, and no
external state changed. No further Cloudflare calls were used to author or
validate this workflow; all subsequent checks used local dry-runs and fixtures.
