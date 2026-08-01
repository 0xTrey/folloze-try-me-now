# Observability and QA runbook

Status: local implementation contract. This document does not claim that the
database migration, Vercel deployment, or live Folloze experience has been
updated.

## What this system provides

The observability layer has two complementary outputs:

1. **Structured runtime logs** for HTTP operations, committed workflow events,
   and failures. Each log entry is one JSON line with type `try_me_request`,
   `try_me_trace`, or `try_me_error`.
2. **A private 30-day trace timeline** in `try_me_traces` when `DATABASE_URL` is
   configured and migration `008_create_try_me_traces.sql` has been applied.
   This timeline contains only allowlisted operational metadata.

The trace table is an operations aid, not an analytics event store and not a
source of visitor or lead data. `try_me_events` must not be treated as the
authoritative execution trace.

## Correlation model

| Identifier | Scope | Visibility | Purpose |
| --- | --- | --- | --- |
| Request ID | One HTTP operation | Returned in `X-Request-Id`; error JSON also includes `requestId` | Find the start, completion, rejection, or failure of one API request. |
| Support reference | One experience trace | Safe public projection and `X-Support-Ref` when a session is known | A short, non-authorizing lookup value such as `TMN-XXXXXXXXXXXX` that a prospect can give support. |
| Trace ID | One experience across requests and background stages | Server-only | Join the complete private session timeline. It is never included in the public session projection. |
| Span ID | One stage attempt | Private trace metadata | Distinguish a retry or a new brand/story attempt within the trace. |
| Event ID | One committed session event | Private trace metadata | Deduplicate durable trace writes. |

A support reference is a truncated SHA-256 digest of the complete internal
trace ID, but it is not a credential and cannot read a session or trace through
a public endpoint. Legacy sessions receive a deterministic hashed trace ID;
their raw session ID is not logged. Hashing happens before truncation so the
shared `legacy_` prefix cannot collapse support references into a small keyspace.

### Request lifecycle

`startServerOperation()` writes `request_started` and returns one request ID for
the operation. A successful handler calls `complete()`, which writes
`request_completed` with status and duration and returns the correlation
headers. Expected 4xx responses write `request_rejected`; unexpected 5xx
responses write `request_failed`.

When troubleshooting a visitor report, collect both values if available:

- `X-Request-Id` isolates the request that failed.
- `X-Support-Ref` joins the broader experience timeline.

## Privacy and security boundary

Operational logs and traces must never contain:

- business email, raw company or target domain, hostname, or public session ID;
- editor cookies or tokens, authorization headers, API keys, passwords,
  credentials, bearer tokens, JWTs, or provider secrets;
- prompts, model response bodies, generated copy or HTML, uploaded or crawled
  content, source bodies, or source URLs;
- filenames, file paths, OpenAI file IDs, upload IDs, or private Blob URLs;
- provider response objects, stack traces, or arbitrary nested metadata.

`src/lib/observability.ts` redacts known secret patterns and removes fields with
private names before serialization. `src/lib/trace-store.ts` then applies a
second, strict metadata allowlist before a committed event can enter the trace
table. Add new trace metadata only when it is operationally necessary and
non-identifying.

Safe examples include stage outcome, attempt ID, duration, use-case enum,
generation model name, artifact revision, quality-gate result, logo strategy,
logo candidate counts, stylesheet counts, and palette color count.

Do not add a browser trace viewer or an editor-cookie trace endpoint. Trace
inspection is operator-only and requires direct database credentials.

## Committed-event semantics

Session events are mutation data until the session write succeeds. The store
emits and persists new events only after a successful memory, Redis, or Blob
write. For Blob compare-and-set updates, a failed or retried CAS attempt cannot
create a trace event.

Each event receives a UUID before the session write. `event_id` is the trace
table primary key and inserts use `ON CONFLICT DO NOTHING`, so replaying the
same committed event is idempotent. This prevents duplicate or "ghost" stage
events from making the UI or operator timeline look healthier than the saved
session state.

The durable timeline records stage, outcome, request ID when available, span ID,
bounded duration, and allowlisted metadata. PDF token issuance, callback replay,
completion, and processing failure use this same committed timeline. It does not
copy the session, lead, source material, uploaded filename, upload identifier, or
rendered experience.

Trace rows are inserted in one batch after the session write and have a 500 ms
latency budget. A slow or unavailable trace database therefore cannot leave the
buyer waiting indefinitely after their real session mutation has already
committed. The structured `trace_persist_failed` record retains the support
reference so console-only evidence can still be located.

## Database migration and retention

The additive migration is
[`db/migrations/008_create_try_me_traces.sql`](../db/migrations/008_create_try_me_traces.sql).
The existing migration runner applies every unapplied numbered migration in
order and verifies checksums:

```bash
npm run db:migrate:leads
```

`DATABASE_URL` must already be supplied to the process through the approved
secret manager or local environment. Never paste a production database URL into
documentation, terminal output, test artifacts, or a commit.

Do not run this command against Production as part of ordinary local QA. Apply
it as a controlled deployment step with the intended environment selected and
record migration state separately from application deployment state.

Trace rows default to expiry 30 days after their event timestamp. The private
cron-authenticated route `/api/maintenance/trace-cleanup` deletes expired rows.
`vercel.json` schedules it daily with `17 3 * * *`. It requires `CRON_SECRET`
through the existing cron authorization contract and returns 503 when durable
trace storage is unavailable.

If `DATABASE_URL` is absent outside tests, trace mode is `console-only`:
structured logs remain available, but no durable timeline can be inspected. If
the database is configured before migration 008 is applied, trace persistence
fails safely and emits `trace_persist_failed`; it does not silently invent a
durable trace.

## Operator trace inspection

Use an exact support reference supplied by the UI or response header:

```bash
npm run trace:inspect -- --support-ref TMN-XXXXXXXXXXXX
```

Or use an internal trace ID found in trusted server logs:

```bash
npm run trace:inspect -- --trace-id <server-trace-id>
```

The command requires `DATABASE_URL`, accepts exactly one locator, returns the
newest 200 non-expired events reordered chronologically, and prints JSON to
standard output. It does not call a public application route.

Recommended investigation order:

1. Search structured server logs for the request ID.
2. Use the support reference to inspect the experience timeline.
3. Find the first `error` or `fallback` outcome and its preceding `started`
   event.
4. Compare span IDs, durations, and safe diagnostics such as `logoStrategy`,
   candidate counts, stylesheet counts, and `qualityGate`.
5. Confirm the saved session or rendered artifact separately. A trace proves an
   event was committed; it does not prove that Vercel or Folloze is currently
   serving the expected visual.

An empty timeline can mean the support reference is incorrect, the row has
expired, the trace table was not deployed, or the environment was operating in
console-only mode.

## Local quality gates

Install from the lockfile, then run the repository gate:

```bash
npm ci
npm run qa
```

`npm run qa` runs lint, TypeScript, Vitest, the standard production build, and
the webpack production build. It does not run Playwright.

Run the desktop browser suite separately:

```bash
npx playwright test --project=desktop
```

Run the Folloze-specific desktop contract:

```bash
npm run qa:visual:folloze
```

This command covers two deterministic regressions:

- the NVIDIA local artifact must keep its geometry and styles when the frozen
  Folloze wrapper CSS is applied;
- verified company logo lockups must render as real assets rather than text-only
  substitutes.

### Frozen wrapper QA

[`tests/e2e/folloze-wrapper-desktop.spec.ts`](../tests/e2e/folloze-wrapper-desktop.spec.ts)
uses checked-in CSS fixtures under `tests/fixtures/folloze-wrapper/`. It compares
the standalone NVIDIA page with the same page under a frozen Folloze runtime
contract at 1440 x 1000. It asserts section order, document height, horizontal
overflow, key component geometry and typography, modal behavior, path-tab
interaction, console errors, and page errors.

The frozen fixture is deterministic and suitable for the normal QA gate. When a
real Folloze runtime change is intentionally accepted, update the fixture and
the local wrapper-resistant CSS in one reviewed change, with visual evidence.

Set `CAPTURE_QA_ARTIFACT=1` only when an evidence screenshot is needed:

```bash
CAPTURE_QA_ARTIFACT=1 npm run qa:visual:folloze
```

This writes `output/playwright/folloze-wrapper-nvidia-desktop.png`.

### Opt-in live drift probe

The live comparison uses the network and the current public Folloze page, so it
is deliberately diagnostic rather than a deterministic CI gate:

```bash
npm run qa:visual:folloze:live
```

Defaults:

- local source: `public/examples/folloze-for-nvidia-1to1.html`;
- live source: `https://experience.folloze.com/folloze-for-nvidia`;
- viewport: 1440 x 1000;
- output: `output/playwright/folloze-live-drift/`.

Optional overrides are `QA_LOCAL_FILE`, `QA_FOLLOZE_URL`, and `QA_OUTPUT_DIR`.
The probe writes `local.png`, `live.png`, and `report.json`, and exits non-zero
when it detects contract drift, horizontal overflow, console errors, or page
errors. A non-zero result is an investigation signal; it is not proof that the
local artifact is wrong. Public Folloze may contain an older saved version or a
new runtime wrapper.

Normal Playwright failure diagnostics live in `playwright-report/` and
`test-results/`; both are ignored by Git. CI uploads those directories for seven
days when the desktop browser job fails. The opt-in evidence files under
`output/playwright/` are not automatically ignored; do not commit them unless
they are intentionally part of a reviewed evidence handoff.

## State reporting

Always report these checkpoints separately:

| Checkpoint | What it proves | What it does not prove |
| --- | --- | --- |
| Local implementation | Source and tests exist in a working tree. | The change is saved in Git or available to another operator. |
| Committed code | The implementation is durable on a Git branch. | The branch has been pushed, deployed, or promoted. |
| Deployed Vercel app | One Vercel deployment contains the code and required migration/configuration. | The production alias points to it or a Folloze board changed. |
| Live Folloze experience | A particular Folloze board was saved and published. | Its anonymous URL matches local output until visually checked. |
| Anonymous verification | A fresh unauthenticated browser rendered the expected live experience. | Future wrapper or board changes cannot introduce drift. |

In particular, editing
`public/examples/folloze-for-nvidia-1to1.html` does not update
`https://experience.folloze.com/folloze-for-nvidia`. Folloze save, publish, and
anonymous visual verification remain separate actions and evidence.

## Implementation references

- Structured logger and redaction: [`src/lib/observability.ts`](../src/lib/observability.ts)
- HTTP correlation: [`src/lib/http.ts`](../src/lib/http.ts)
- Committed event persistence: [`src/lib/session-store.ts`](../src/lib/session-store.ts)
- Private trace store: [`src/lib/trace-store.ts`](../src/lib/trace-store.ts)
- Trace cleanup route: [`src/app/api/maintenance/trace-cleanup/route.ts`](../src/app/api/maintenance/trace-cleanup/route.ts)
- Operator CLI: [`scripts/inspect-trace.mjs`](../scripts/inspect-trace.mjs)
- Live drift probe: [`scripts/compare-folloze-render.mjs`](../scripts/compare-folloze-render.mjs)
