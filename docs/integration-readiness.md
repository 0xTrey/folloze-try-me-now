# Folloze Try Me Now integration readiness

This inventory separates what the current visual MVP demonstrates from what must exist before public production traffic. “Configured” means credentials are present; it does not mean an end-to-end path has passed its launch gate.

## Verified deployment checkpoint

| Checkpoint | Evidence | Current state |
| --- | --- | --- |
| Canonical Vercel alias | <https://folloze-try-me-now.vercel.app> | Deployed visual MVP. |
| Session persistence | Private Vercel Blob | Deployed store; session reads bypass cache, TTL is stored in the JSON wrapper, and ETag `ifMatch` protects updates with up to five retries. |
| Generation | `GENERATION_MODE=fixture` | OpenAI generation is not active. |
| Brand | `BRAND_MODE=fast` | Safe fast extractor active; remote Brand Harvester disabled. |
| Folloze integration | `FOLLOZE_MODE=disabled` | Remote Folloze MCP disabled. |
| Transactional email | `EMAIL_MODE=console` | Resend disabled; current send path is skipped. |
| Folloze draft-save proof | Board `249022`, theme `4`, [designer URL](https://app.folloze.com/app/board/249022/designer) | Draft saved separately through the local MCP. It is unpublished and no anonymous public URL is confirmed. |

The public Vercel alias, the private Blob session store, and the Folloze draft board are separate checkpoints. None of them proves the remote publish-and-email claim path.

## Current versus needed

| Area | Current visual MVP | Production target | Readiness gap / proof required |
| --- | --- | --- | --- |
| Web runtime | Next.js application with a temporary experience route and polling UI, deployed at the canonical Vercel alias. | Hardened Vercel runtime with production service bindings, deployment protections, and strict readiness. | Run production-equivalent browser and failure QA; deployment alone is not a launch gate. |
| Background execution | Brand and story work start through Next.js `after()`. Claim work runs synchronously in the request. | Vercel Workflow for brand, generation, cleanup, publish, and email with retry and dead-letter visibility. | Implement durable workflows, stage leases, idempotency, cancellation, and retry tests. |
| Active session state | Private Vercel Blob is deployed. It stores `{ value, expiresAt }`, reads uncached, lazily deletes expired entries, and uses ETag `ifMatch` with five optimistic retries. Redis is supported but not deployed; process memory is the local fallback. | Shared Redis for active projections, stage leases, TTLs, and locks; Blob remains artifact storage. | Add Redis, preserve revision/CAS semantics, exercise multi-instance conflicts, and implement scheduled rather than read-triggered cleanup. |
| Claimed system of record | A claimed session is persisted as a non-expiring private Blob wrapper. | Postgres claim, publication, and email ledger; Redis becomes an expiring projection. | Add schema/migrations, unique `session_id`, audit fields, backup and retention policy. |
| Generated artifacts | Generated HTML is embedded inside the private Blob session JSON rather than stored as a separately versioned artifact. | Versioned private Blob artifacts addressed by session, revision, and digest. | Split session projection from artifacts, add authorization, scheduled cleanup, integrity checks, and retention jobs. |
| Company brand | Explicit `BRAND_MODE=remote` plus a URL activates the authenticated service. The deployed `fast` mode uses a bounded server-side HTML extractor with static fallback on failure. | Controlled-egress Brand Harvester service, with the safe extractor only as an explicitly reported degraded mode. | Deploy the service, harden DNS/redirect handling, authenticate it, define normalized response schema, and load-test latency. |
| Target-account brand | Harvested during generation for ABM; falls back safely on failure. | Durable parallel brand stage started as soon as the target domain is accepted. | Split target harvest into its own idempotent workflow and expose stage status. |
| OpenAI copy | Explicit `GENERATION_MODE=openai` plus a key activates Responses API with structured Zod output and `store:false`. The deployed mode is `fixture`, so deterministic copy is active and ambient keys cannot turn it on. | Project-scoped production API key, pinned supported model, token/time budgets, retries, and no deterministic success fallback. | Add the fresh project key, set the explicit mode, add budget/latency telemetry, failure UX, and evals. |
| Content URL | Safe HTTPS fetch plus bounded HTML extraction in the app process. | Controlled-egress extraction service with revisioned source artifact and injection isolation. | Move fetch off the app runtime and test SSRF, redirects, timeouts, size, and hostile content. |
| PDF content | Accepts a maximum 10 MB PDF and checks MIME/extension/header. It uploads to OpenAI only in explicit OpenAI generation mode with a key; the deployed fixture mode retains metadata only. | Private Blob upload, malware scan/sandboxed parse, retention deletion, and OpenAI file cleanup. | Add scanning, artifact lifecycle, delete-on-expiry, and fail closed when parsing is unavailable. |
| Folloze MCP transport | App code requires explicit `FOLLOZE_MODE=draft` or `FOLLOZE_MODE=publish` plus a remote URL. The deployed mode is `disabled`; the configured local MCP is stdio and user-profile authenticated. | Authenticated HTTPS MCP gateway exposing only `create_try_me_experience`. | Build/deploy gateway, provision non-personal service auth, restrict schema/tool list, rotate secret, and test replay controls. |
| Folloze draft save | Local MCP produced Board `249022` with theme `4` and a designer URL. | Gateway may reuse save behavior as one internal step. | Preserve this as draft-only evidence; confirm tenant/theme, payload limits, and artifact fidelity. |
| Folloze public publish | Board `249022` is unpublished and has no confirmed anonymous URL. With the deployed Folloze mode disabled, the app's claim path is `preview-only`. | Gateway performs create/public-config/save/publish/readback and verifies an anonymous public URL. | Implement the complete sequence and anonymous-browser verification. Preview-only must fail the production claim gate. |
| Email | Explicit `EMAIL_MODE=resend` plus a key activates Resend. The deployed mode is `console`, so delivery is skipped. | Verified Folloze sending domain, monitored reply-to, durable retry state, bounce/complaint handling, and one send after stable URL. | Verify DNS/sender, set the explicit mode, add webhook handling, and test retry/duplicate behavior. |
| Expiry | Initial session TTL is one hour; generated unclaimed TTL defaults to 30 minutes. Blob stores expiry in the JSON wrapper, reads bypass cache, and an expired object is deleted when read. | 30 minutes from preview readiness, durable scheduled cleanup, private artifact deletion, and claimed retention. | Add workflow cleanup so abandoned objects expire without a later read; ensure claim atomically cancels deletion. |
| Editor authorization | High-entropy token is hashed in state and compared in constant time; raw token lives in an HTTP-only same-site cookie. | Same design plus origin/CSRF enforcement, rotation policy, and distributed session controls. | Add explicit origin checks and security tests. |
| Rate limits | Redis counters when configured; otherwise per-process memory buckets. The deployed Blob session store does not make rate limits distributed. | Distributed Redis limits plus optional Turnstile and cost ceilings by client, domain, session, and action. | Add Redis, define thresholds, trusted-proxy handling, challenge policy, alerts, and abuse tests. |
| Analytics | Structured server logs and client-only custom events/iframe messages. | Durable allowlisted event ingestion tied to session/revision and connected to the demo CTA funnel. | Select sink/schema, add ingestion route or SDK, consent policy, dashboards, and end-to-end event verification. |
| Health/readiness | `/api/health` treats Redis or Blob as durable and requires active OpenAI, remote Folloze, and Resend connections for its `production-capable` label. It still does not prove Workflow, Postgres, public Folloze readback, or operational readiness. | Separate liveness and strict readiness; readiness checks every required dependency and configuration invariant. | Expand readiness and connect it to deployment checks. |
| Integration activation | `GENERATION_MODE`, `BRAND_MODE`, `FOLLOZE_MODE`, and `EMAIL_MODE` explicitly select providers, so ambient credentials alone do not activate them. | Keep explicit modes and fail readiness when a selected production mode lacks credentials or connectivity. | Test all mode/credential combinations and reject contradictory configuration. |
| Demo-mode value | `TRY_ME_DEMO_MODE` is parsed but is not the integration gate. | Keep it limited to explicit product/demo behavior or remove it. | Do not use it as evidence that providers are enabled or production is ready. |
| Secrets | `.env.example` documents expected values; no production secret set is established here. | Separate preview/production Vercel secrets, least privilege, rotation, audit, and no local OAuth state. | Create credentials in each provider and record owners/rotation dates outside the repo. |

## Folloze: save is not publish

This distinction is a launch blocker, not wording polish:

- The local Folloze MCP is a profile-isolated stdio process. It uses local user OAuth state and exposes guide/theme/save/auth/version capabilities.
- Its HTML/file save tools create or update an unpublished board configuration and return a **designer URL**.
- A designer URL proves that an authenticated editor can open the board. It does not prove that an anonymous prospect can open it.
- The campaign-factory reference implementation uses additional Folloze APIs to create the board, make its Prism configuration public, save configuration, publish, and then read the public URL.
- The production gateway must encapsulate that full operation and verify the returned public URL anonymously. Only then may the app set `publishStatus: "published"`.

The remote tool accepts only `session_id`, `artifact_revision`, and `idempotency_key`. It resolves the approved artifact itself. Accepting raw HTML or arbitrary URLs would let an untrusted client or model bypass storage authorization, revision checks, content controls, and auditability.

## Existing environment variables

These names already exist in `.env.example`. The “current behavior if missing” column is descriptive, not approval for production fallback.

| Variable | Current consumer | Current behavior if missing | Production decision |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Session URL minting | Infers the Vercel production/deployment host when available, otherwise uses `http://localhost:3000`. | Pin to <https://folloze-try-me-now.vercel.app> in production and validate origin. |
| `GENERATION_MODE` | Copy and PDF integration selection | Defaults to `fixture`; an ambient OpenAI key alone does not activate generation. | Set `openai` only with the dedicated project key. |
| `BRAND_MODE` | Brand integration selection | Defaults to `fast`; an ambient remote URL alone does not activate the service. | Set `remote` for full fidelity or approve `fast` as degraded production behavior. |
| `FOLLOZE_MODE` | Folloze integration selection | Defaults to `disabled`; an ambient gateway URL/key alone does not activate it. | Set `publish` for production; `draft` is not anonymous publication. |
| `EMAIL_MODE` | Email integration selection | Defaults to `console`; an ambient Resend key alone does not activate delivery. | Set `resend` with a verified sender. |
| `OPENAI_API_KEY` | Copy generation, PDF upload, MCP invocation | The selected integration is not connected; fixture generation remains deterministic. | Required server secret for OpenAI generation and remote MCP invocation. |
| `OPENAI_MODEL` | OpenAI generation and MCP invocation | Uses configured default. | Pin and verify a supported model in every environment. |
| `BLOB_READ_WRITE_TOKEN` | Deployed session store | Falls through to local process memory when Redis is also absent. | Already connected for the MVP; retain for private versioned artifacts. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Session store and rate limiting | Blob remains the session store when connected; rate limits fall back to process memory. | Both required for the production active-state/rate-limit target; partial configuration must fail readiness. |
| `BRAND_HARVESTER_URL` | Company/target brand | Remote mode is not connected. Fast mode does not require it. | Required for `BRAND_MODE=remote`. |
| `BRAND_HARVESTER_TOKEN` | Remote Brand Harvester authorization | Sends no authorization header. | Required whenever remote service is configured. |
| `FOLLOZE_MCP_SERVER_URL` | Remote MCP tool | Remote mode is not connected; disabled mode remains preview-only. | Required and HTTPS for `FOLLOZE_MODE=draft` or `FOLLOZE_MODE=publish`. |
| `FOLLOZE_MCP_AUTH_TOKEN` | Remote MCP authorization | Sends no gateway authorization header. | Required until replaced with short-lived workload identity. |
| `FOLLOZE_MCP_TOOL_NAME` | Remote MCP allowlist | Defaults to `create_try_me_experience`. | Pin to the gateway's only public tool. |
| `FOLLOZE_THEME_ID` | Not currently consumed by app code | No effect. | Gateway must consume it or remove it from the contract. |
| `FOLLOZE_THEME_URL` | Generated experience template | Uses template defaults. | Use only trusted/allowlisted assets; keep it consistent with theme ID. |
| `RESEND_API_KEY` | Claim email | Resend mode is not connected; console mode is skipped. | Required for `EMAIL_MODE=resend`. |
| `EMAIL_FROM` | Claim email sender | Uses Resend onboarding default. | Required verified Folloze identity. |
| `EMAIL_REPLY_TO` | Claim email reply routing | No reply-to. | Recommended monitored inbox. |
| `TRY_ME_SESSION_TTL_SECONDS` | Generated unclaimed session | Defaults to 1800 seconds and is clamped to 300–86400. | Set to 1800 and test from ready time. |
| `TRY_ME_MAX_PDF_BYTES` | Upload validation | Defaults to 10 MB and is clamped to 1 KB–25 MB. | Set to 10 MB for V1 and mirror at edge/storage. |
| `TRY_ME_DEMO_MODE` | Product/demo configuration only | Defaults true and does not activate or disable integrations. | Do not use as a readiness signal; define a separate product behavior or remove it. |
| `NEXT_PUBLIC_DEMO_CTA_URL` | Builder and generated experience CTA | Uses Folloze book-a-meeting URL. | Required approved destination with analytics attribution. |

## Environment variables still needed

| Variable | Purpose | Handling |
| --- | --- | --- |
| `DATABASE_URL` | Durable claim/publication/email ledger. | Server/workflow only; use pooled runtime connections and migration credentials separately. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Browser challenge. | Public by design. |
| `TURNSTILE_SECRET_KEY` | Server-side challenge verification. | Server only. |
| Analytics sink variables | Event ingestion destination and server credential. | Name after provider selection; browser receives only a deliberately public key if required. |

Vercel Workflow may add platform-managed variables during integration. Use the generated canonical names rather than inventing aliases. Never upload local Folloze profiles, browser cookies, refresh-token files, or the local MCP environment to Vercel.

## Required external setup

### OpenAI

- Create a project dedicated to Try Me Now rather than using a personal general-purpose key.
- Set hard/soft budgets, usage alerts, and least-privilege project access.
- Confirm structured output support for the pinned model and confirm remote MCP support in the production project.
- Establish deletion of uploaded OpenAI files at session cleanup.

### Vercel, Redis, Blob, and Postgres

- Preserve the connected private Blob store for the visual MVP while separating session projections from versioned artifacts.
- Use separate preview and production resources or namespaces.
- Install/configure Vercel Workflow and verify a workflow survives redeploy and function termination.
- Preserve the current Blob ETag compare-and-set behavior during migration; add atomic Redis revision writes, locks, and idempotency records.
- Add scheduled private Blob lifecycle cleanup; the current wrapper TTL is enforced lazily on read.
- Apply Postgres migrations through a controlled deployment step and test restoration.

### Brand Harvester

- Package the existing harvester behind an authenticated service boundary; do not execute a local Chrome profile from Vercel functions.
- Prefer controlled browser rendering for script-heavy sites and retain the fast extractor for latency/degraded operation.
- Return a versioned normalized response with provenance, final URL, company name, logo asset, colors, typography signals, and warnings.
- Enforce egress and response limits independent of caller validation.

### Folloze

- Obtain a fresh non-personal credential or service-account pattern with a documented renewal path.
- Confirm tenant, approved theme, board ownership, publish permissions, rate limits, and API support with Folloze engineering.
- Deploy the narrow remote gateway outside the browser and expose only the publication tool.
- Validate new publish, idempotent replay, partial failure, retry, theme failure, and anonymous URL readback.

### Resend

- Verify the Folloze sending domain and `EMAIL_FROM` address.
- Configure SPF, DKIM, DMARC alignment, reply-to, bounce/complaint webhooks, and suppression behavior.
- Verify one email under claim retries and one safe operator path for a permanent delivery failure.

### Analytics and abuse controls

- Select the event sink and owner before implementation; do not assume browser custom events are collected.
- Define an allowlist: use-case selected, domain accepted, stage completed/failed, preview viewed, section/topic interaction, CTA clicked, claim submitted, published, and email delivered/failed.
- Keep raw domains and emails out of general analytics unless privacy review explicitly approves them; use session/account hashes where sufficient.
- Set rate, spend, and error alerts before enabling public traffic. Add Turnstile when thresholds are exceeded or before launch if the page is broadly promoted.

## Recommended delivery sequence

1. **Durability foundation:** Vercel deployment, Redis-only production mode, private Blob, Postgres, Workflow, atomic revision contract, and cleanup.
2. **Generation path:** remote Brand Harvester, OpenAI project, PDF lifecycle, stale-revision protection, and evals.
3. **Claim path:** narrow Folloze gateway, full public publish/readback, persistent claim ledger, and Resend delivery.
4. **Public safety:** strict readiness, SSRF and upload tests, Turnstile/rate controls, privacy retention, analytics sink, alerts, and runbook.
5. **Launch proof:** run all three use cases end to end from an anonymous browser and preserve evidence separately for temporary preview, Folloze draft save, Folloze public publish, email delivery, analytics, and expiry.

## Launch decision checklist

- [ ] Production uses explicit `GENERATION_MODE=openai`, an approved `BRAND_MODE`, `FOLLOZE_MODE=publish`, and `EMAIL_MODE=resend`; contradictory or missing credentials fail readiness.
- [ ] Brand and story work survive function termination and deployment.
- [ ] A stale generation cannot overwrite the active revision.
- [ ] PDF and OpenAI files are removed on expiry according to policy.
- [ ] A claim persists outside Redis and cancels unclaimed cleanup atomically.
- [ ] The remote MCP gateway exposes only the narrow publication tool.
- [ ] A saved draft and a published board are reported as separate states.
- [ ] The final URL passes anonymous browser verification.
- [ ] Claim and email are idempotent under replay and retry.
- [ ] The 30-minute expiry starts at preview readiness, not initial domain entry.
- [ ] Demo CTA and experience engagement events reach the selected analytics sink.
- [ ] Security, privacy, abuse, cost, alerting, and operator-retry tests pass.
