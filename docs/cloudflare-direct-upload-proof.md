# Cloudflare direct-upload proof

This is an inactive, mock-backed adapter proof; it is not wired to runtime
selection. Vercel Blob remains the default. Real R2, Durable Object, Queue,
D1 bindings and a runtime selector remain deliberately deferred.

| Existing route/state | Cloudflare target | Invariant |
| --- | --- | --- |
| upload token request | Worker signs R2 PUT URL | editor + same-origin + exact session/upload object key |
| Blob upload callback/status ETag | Durable Object owns status and session CAS; D1 records durable lead outcome | terminal callback is replay; competing callback is conflict/in-progress |
| Blob cleanup cron | Worker `scheduled()` plus Queue for bounded deletion/reconciliation | retain current 15m upload, 5m lead, daily trace schedules |
| 300s Vercel route budget | Worker callback enqueues long work and returns after durable claim | no PDF/OpenAI work on the request critical path |

The mock models opaque, exact-object, PDF-only, write-once 10-minute
capabilities; R2 head validation; per-session CAS with bounded retry; owner
leases and stale reclaim; Queue/DLQ idempotency; and D1 outcomes after an
owned terminal transition. No binding, secret, runtime selector, deployment
configuration, or production route import is included here.
