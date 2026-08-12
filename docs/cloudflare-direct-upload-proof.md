# Cloudflare direct-upload proof

This proof is not wired to runtime selection. Vercel Blob remains the default.

| Existing route/state | Cloudflare target | Invariant |
| --- | --- | --- |
| upload token request | Worker signs R2 PUT URL | editor + same-origin + exact session/upload object key |
| Blob upload callback/status ETag | Durable Object owns status and session CAS; D1 records durable lead outcome | terminal callback is replay; competing callback is conflict/in-progress |
| Blob cleanup cron | Worker `scheduled()` plus Queue for bounded deletion/reconciliation | retain current 15m upload, 5m lead, daily trace schedules |
| 300s Vercel route budget | Worker callback enqueues long work and returns after durable claim | no PDF/OpenAI work on the request critical path |

The interface maps `authorize` to an R2 presigned URL and `compareAndSet` to a single Durable Object transaction. D1 remains the lead ledger and Queue handles post-claim extraction/reconciliation. No binding, secret, runtime selector, or deployment configuration is included here.
