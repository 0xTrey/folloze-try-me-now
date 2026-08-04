# Codex handoff: engagement proof, public promotion, and polish

Status: approved direction from Trey, 2026-07-31. Strategy doc; Codex owns implementation.

Owner intent, in priority order:

1. Show engagement depth on the generated experience. Real visitor signals plus a clearly labeled simulated buying-group feed with placeholder names and time on asset.
2. Promote the current v2 build to the public production URL so the public link runs the real brand harvester and live generation.
3. Fix target company name casing (Servicenow -> ServiceNow).
4. Fix the editor cookie so two open sessions in one browser do not break each other.
5. Add CI so the qa suite runs automatically on every push.

Explicitly deferred by owner decision: Turnstile / bot protection, spend caps, durable workflow migration, Folloze publish mode, Resend email mode. Do not build these now. Production OpenAI spend is accepted risk.

This plan is additive to `docs/ux-v2-build-plan.md`. Items 18-19 of that plan (immediate analytics proof, quality receipt) are the foundation; this doc extends them with a durable event sink, a simulated engagement feed, and time-on-asset capture. Do not duplicate work already landing from that plan; integrate with it.

---

## 1. Engagement proof on the generated experience

Goal: a visitor who interacts with their generated page immediately sees the analytics story Folloze would give them. Two layers, clearly separated: real signals from this visitor, and simulated buying-group data labeled as an example.

### 1a. Durable event sink (real signals)

- New route `POST /api/events`. Accepts only allowlisted event names: `anchor_click`, `topic_select`, `cta_click`, `signature_select`, `question_select`, `section_dwell`, `page_heartbeat`, `experience_view`.
- Payload: session id, event name, minimal context (section id, label text, dwell seconds). No raw email, no HTML, no free-form strings beyond the label the template itself rendered.
- Persist to Neon in a new additive table (for example `try_me_events`: id, session_id, event_name, context jsonb, created_at). Follow the existing migration pattern in `db/migrations/`. Blob fallback is not needed; if the database is unavailable, drop the event and continue. Events must never block or slow the experience.
- Wire the existing `postMessage` bridge: the generated page already emits `flzAnalytic` events to the parent. The builder app should relay them to `/api/events`. When the page is opened directly (not in the builder iframe), the page posts to `/api/events` itself.
- Rate limit per session and per client using the existing `enforceRateLimit` helper.

### 1b. Time on asset

- In the generated page script: a visibility-aware timer (pause on `visibilitychange` hidden, resume on visible).
- Emit `page_heartbeat` every 15 seconds while visible, and `section_dwell` with seconds when a section leaves the viewport after at least 3 seconds in view (IntersectionObserver).
- Respect reduced motion and never let the timer code throw; wrap in try/catch like the existing analytics hook.

### 1c. Simulated buying-group feed (the wow moment)

- On the reveal screen and/or as a panel the visitor can open from the generated page: a live engagement feed that mixes the visitor's real events with simulated teammates.
- Simulated personas use obvious placeholder names and role titles relevant to the selected audience. Examples: John Smith, VP Marketing; Sarah Chen, Director of Demand Gen; Michael Torres, RevOps Lead. Derive role titles from the selected audience so the feed feels account-relevant.
- Feed rows show the signal type and depth: "John Smith spent 2:41 on this asset", "Sarah Chen explored all three decision lenses", "Michael Torres clicked the meeting CTA". The visitor's own real actions appear in the same feed in real time: "You spent 0:47 in Decision lenses just now".
- A toast or popup fires on the visitor's first meaningful interaction (anchor click, topic select, or CTA click) showing the captured signal. The in-flight ux-v2 plan already has a signal-toast component; reuse it rather than adding a second one.
- Labeling requirement from the launch plan: simulated data must be clearly marked as an example. A persistent "Example analytics. Placeholder people." caption on the feed satisfies this. Never present placeholder personas as real captured leads.
- Simulated activity should be deterministic per session (seeded by session id) so the demo is stable on reload, and paced so the feed feels alive during the first two minutes without being noisy.

Acceptance:

- Interacting with a generated page writes real rows to Neon and the visitor sees the toast within one second of the first interaction.
- The feed shows real visitor events and labeled simulated persona events together.
- Time on asset accumulates correctly across tab switches.
- No event payload contains email, source content, or generated HTML.
- All existing tests still pass; new logic has unit coverage for the event allowlist, payload redaction, and dwell timing.

## 2. Promote v2 to the public production URL

The production alias `folloze-try-me-now.vercel.app` still serves the v1 build with fixture copy that v2's own quality gates ban. Owner decision: the public URL must run v2 with the real brand harvester pulling live brand information, and live OpenAI generation on. Spend is accepted; Turnstile is deferred.

- Promote the verified v2 commit to the production alias.
- Production environment: `GENERATION_MODE=openai`, `BRAND_MODE=fast`, `FOLLOZE_MODE=disabled`, `EMAIL_MODE` unchanged from current decision, Blob and `DATABASE_URL` attached, `CRON_SECRET` set so the maintenance crons keep working.
- Keep the existing generation timeout caps as the only spend guard for now.
- After promotion, run one anonymous end-to-end check per use case from a fresh browser and record the evidence in the README checkpoint table, which must be updated to say the production alias now serves v2.
- Add a short promotion checklist to the README or a new `docs/promotion.md`: qa green, preview verified at the exact commit, env modes confirmed, alias switched, anonymous smoke test done. This makes future promotions a decision instead of a default.

## 3. Company name casing

Problem: the ABM hero rendered "Servicenow, make the next move easier to believe." Wrong casing of the target account's name undercuts the product's core promise of brand recognition. The fallback name is produced by title-casing the domain in the brand harvester.

Suggested fix, in order of preference at harvest time:

1. Use `og:site_name` from the harvested page when present and plausibly matching the domain.
2. Use schema.org Organization `name` (JSON-LD) when present.
3. Use the page `<title>` token that matches the domain root, preserving its casing.
4. Only then fall back to title-casing the domain, corrected by a small dictionary of known mixed-case brands (ServiceNow, LinkedIn, HubSpot, DocuSign, GitHub, PayPal, YouTube, SalesLoft, NetSuite, MongoDB, DataDog, ZoomInfo, and similar). Keep the dictionary in one module with a unit test so it is easy to extend.
5. In openai generation mode, add one instruction line: render company names with their correct public casing. Add a quality-gate check that the target name in the draft matches the harvested casing so the deterministic fallback and the AI path stay consistent.

Acceptance: servicenow.com produces ServiceNow in hero, thesis, and close on both the AI path and the deterministic fallback.

## 4. Editor cookie scoped per session

Problem: `tmn_editor` is one fixed-name cookie. Starting a second session in another tab overwrites it, silently breaking edit and claim on the first session. Comparing two accounts side by side is a natural demo behavior, so this will be hit.

Suggested fix:

- Name the cookie per session: `tmn_editor_{sessionId}`, same `HttpOnly`, `Secure`, `SameSite=Lax`, path `/api/sessions`. Each route already knows its session id from the URL and reads exactly its own cookie. The existing hash comparison in `canEditSession` is unchanged.
- Raise `maxAge` from 3600 to 86400 so the cookie outlives the full claim window (claim_pending sessions live up to 24 hours; today the cookie can expire first and strand a claim).
- Cap growth: when setting a new session cookie, expire any `tmn_editor_*` cookies beyond the newest handful to keep header size bounded.
- Keep reading the legacy `tmn_editor` cookie for a transition window so live sessions created before the deploy can still claim.

Acceptance: two sessions open in two tabs can each edit and claim independently; a session created before the change can still claim after it.

## 5. CI on GitHub Actions

Purpose, for the record: the repo has `npm run qa` (lint, typecheck, 187 unit tests, both builds) but nothing runs it automatically. CI is a GitHub robot that runs that exact command on every push and marks the commit red if anything fails. With an agent committing rapidly to this repo, this is the tripwire that catches a broken state before it reaches a demo. During the 2026-07-31 audit the working tree was observed mid-edit with 3 failing tests; CI makes that visible immediately instead of accidentally.

- Add `.github/workflows/qa.yml`: on push and pull request, Node 22, `npm ci`, `npm run qa`.
- Unit tests and builds only. Playwright browser tests can be a separate optional job later; do not block on them now.
- No secrets are needed; the qa suite runs with fixture modes.

Acceptance: pushing a commit with a failing test shows a red check on GitHub within a few minutes.

---

## Sequencing note

Item 1 depends on template and iframe work also being touched by the ux-v2 build plan; land it inside or immediately after that work to avoid conflicts. Items 3, 4, and 5 are small and independent; they can land any time. Item 2 (promotion) should happen after items 1 and 3 are in, so the first public v2 impression includes correct casing and the engagement story.
