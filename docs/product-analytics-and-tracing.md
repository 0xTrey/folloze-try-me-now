# Product analytics, visitor sessions, and tracing

Status: implemented in source. Migration 009, deployment configuration, and live
readback are separate release checkpoints.

## Decision

Try Me Now uses a layered model instead of treating one vendor as the only
source of truth.

| Layer | System | What it owns |
| --- | --- | --- |
| First-party product ledger | Neon Postgres | Visitor IDs, browser sessions, experience sessions, submitted-input snapshots, builder interactions, API outcomes, and browser errors. |
| Product analysis UI | PostHog, optional | Funnels, paths, cohorts, heatmaps, errors, and consented/masked replay. It receives the same stable custom event vocabulary as the first-party ledger. |
| Generated and published experience engagement | Folloze analytics plus `try_me_events` | Content sections, decision paths, CTAs, dwell, and other engagement inside the experience. Folloze remains authoritative after a board is published. |
| Operational diagnosis | `try_me_traces` plus structured logs | Request, background-stage, fallback, provider, quality, publish, and claim outcomes correlated by trace ID and support reference. |

PostHog is the recommended product analytics surface. It supports Next.js,
anonymous-to-identified journeys, custom events, errors, and session replay. It
does not replace the private database or Folloze engagement analytics. Mobbin
and Magic Patterns are design/prototyping tools; Linear is work management;
Railway is hosting; Warp is a terminal. None is a product telemetry system.

## Identity model

The browser creates two opaque identifiers:

- `tmv_*` persists in first-party local storage and represents one browser visitor;
- `tmb_*` persists only in session storage and represents one browser tab session.

The server creates the existing opaque experience session ID after a company
domain is submitted. Migration 009 joins all three IDs. A business email entered
during claim upgrades the visitor record to an identified lead and links to the
existing lead ledger. Until then, the visitor is pseudonymous.

This implementation does not use fingerprinting, reverse-IP person identity,
or guessed contact enrichment. A new device cannot be claimed as the same human
until the person identifies themselves.

## Data captured

### Every prospect interaction

The builder captures:

- page and browser-session start;
- every click on an actionable element (`a`, `button`, inputs, selects,
  textareas, labels, and ARIA button/tab/option roles);
- committed form interactions on `change` with field name, field type,
  presence, and a length bucket, never the typed value;
- semantic milestones such as use-case, campaign-type, domain, research,
  reveal, analytics, upload, and claim events;
- each API result with route template, method, status, duration, and coarse
  error code;
- browser errors and unhandled promise rejections with bounded, scrubbed name
  and message.

### Exact inputs

Exact submitted values are written server-side to
`try_me_product_sessions.input_snapshot` after the real session mutation
commits. This includes company and target domains, audience, objective,
campaign type, source and offer URLs, event context, promoted offer, message
direction, CTA treatment, style, tone, layout, and selected assets.

Provider IDs, editor tokens, OpenAI file IDs, Blob upload IDs, source document
bodies, generated HTML, and model prompts/responses are excluded. PDF uploads
record the source type and the extracted document title through the normal
session record; analytics does not copy the original file bytes.

Business email is stored in the private product-session and lead ledgers only
after a claim. It is sent to PostHog only as a person property after that same
explicit claim; it is never included in generic click/error event properties.

## Event contracts

`POST /api/analytics/events` accepts batches of at most 20 first-party builder
events. It enforces:

- same-origin browser requests;
- per-client and per-browser-session rate limits;
- opaque ID formats;
- a finite event-name and category allowlist;
- a flat maximum of 24 bounded scalar properties;
- no arbitrary objects, HTML, source bodies, contact strings, or secret fields;
- an occurrence time no more than 24 hours from receipt.

Telemetry is best effort and returns `202`. It must never prevent session
creation, research, generation, claim, or preview rendering.

Generated experience events continue through `POST /api/events`. The
Folloze-hosted HTML uses the required `flzAnalytic` pattern with stable actions
such as `cta_click`, `anchor_click`, and selection events. The operator inspector
joins these rows to the first-party and operational streams.

## PostHog configuration

Set these Vercel variables only after a PostHog project exists:

```text
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_...
NEXT_PUBLIC_POSTHOG_HOST=/signal-dock
NEXT_PUBLIC_POSTHOG_SESSION_REPLAY=false
```

The `phc_` project token is designed for browser initialization. A `phx_`
personal API key can read private data and must never be placed in a
`NEXT_PUBLIC_*` variable or committed.

The integration deliberately disables PostHog autocapture and pageview capture
because the first-party client already emits consistent custom events. This
prevents duplicate and unstable DOM-derived events. PostHog person profiles are
`identified_only`; the person is identified with the stable `tmv_*` ID after
business-email claim, not with a shared literal or a raw email distinct ID.

PostHog traffic is routed through the same-origin `/signal-dock` Next.js rewrite
so common domain-level blockers do not silently erase prospect journeys. The
project uses custom `try_me_*` event names, the same `$insert_id` as the
first-party event ledger, and release/environment properties on every PostHog
event. Do Not Track is honored. Generic click events use only explicit analytics
labels, accessible labels, stable names/IDs, or the element type; rendered buyer
copy is never used as a fallback label.

Session replay is off by default. If privacy/legal review authorizes it, set the
replay flag to `true`; all inputs and rendered text remain masked, and query
strings are removed in the browser before network metadata is sent. Do not
enable network bodies or unmask fields.

Native exception capture stays enabled for PostHog's error-grouping UI, but a
`before_send` scrubber removes contact data, credentials, and URL query strings.
The bounded `try_me_browser_error` and `try_me_unhandled_rejection` events remain
the stable cross-sink reliability vocabulary.

Recommended initial PostHog views:

1. Funnel: page viewed -> use case -> domain -> session created -> preview -> claim.
2. Path report: `try_me_ui_click` grouped by `area`, `element_id`, and `label`.
3. Reliability: API failures and browser errors by route, code, and release.
4. Time to value: `api_request_completed.duration_ms` and domain-to-preview time.
5. Cohorts: use case, claimed versus anonymous, and company domain from the
   identified server-side session export.

## Operator workflow

Apply migrations through the repository runner:

```bash
npm run db:migrate:leads
```

Inspect a unified timeline using exactly one private locator:

```bash
npm run analytics:inspect -- --session-id <experience-session-id>
npm run analytics:inspect -- --visitor-id tmv_<id>
npm run analytics:inspect -- --email buyer@company.com
```

The result includes:

- the private product-session snapshot and submitted inputs;
- product events from the builder;
- engagement events from the generated experience;
- operational trace events and support references.

For an isolated request or background workflow, continue to use:

```bash
npm run trace:inspect -- --support-ref TMN-XXXXXXXXXXXX
```

## Retention and privacy

- product events and first-party visitor/session records default to 365 days;
- browser-session records default to 180 days;
- operational traces remain 30 days;
- generated engagement events retain their existing database policy;
- the existing daily trace-cleanup job also deletes expired product analytics
  in foreign-key-safe order.

Before broad public traffic, Folloze must confirm the privacy notice, lawful
basis/consent behavior, DPA/region, user-access process, deletion process, and
retention periods. Session replay remains disabled until that approval. This is
a product/security implementation boundary, not legal advice.

## Release verification

Report these separately:

1. Source and tests exist locally.
2. Migration 009 is applied and read back from the target database.
3. The branch is committed and pushed.
4. Vercel has the first-party environment and optional PostHog variables.
5. A fresh anonymous browser produces visitor, browser-session, experience,
   click, API, and input-snapshot rows.
6. A test business-email claim links the visitor, product session, and lead.
7. The operator command returns the product, experience, and operations streams.
8. The production alias serves the verified deployment.
