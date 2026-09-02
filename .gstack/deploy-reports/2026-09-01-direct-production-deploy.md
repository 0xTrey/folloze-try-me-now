# Try Me Now production deployment report

Date: September 1, 2026

Release verdict: **DEPLOYED WITH CONCERNS**

The September 1 repair is live at [folloze-try-me-now.vercel.app](https://folloze-try-me-now.vercel.app/). Vercel accepted the build, the production alias resolves to the new deployment, and the primary visitor flow works. The live ADP canary also exposed one material generation-quality defect and one telemetry contract defect. Those issues are documented below and should be fixed before this release is treated as fully accepted.

## Release identity

| Surface | Verified state |
|---|---|
| GitHub repository | `0xTrey/folloze-try-me-now`, public |
| GitHub branch | `codex/sep1-feedback-repair` |
| Deployed source commit | `89660058678c227ae9d45406ac7c5261ee58c671` |
| Vercel project | `folloze-try-me-now` |
| Deployment ID | `dpl_HFagJmSfRRkqDEFDzFfxghJeYeNP` |
| Deployment URL | `https://folloze-try-me-38d4m519x-trey-harndens-projects.vercel.app` |
| Production alias | `https://folloze-try-me-now.vercel.app` |
| Vercel state | `Ready`, target `production` |

There was no pull request for this branch. The authorized release used a direct production deployment from the exact validated commit. GitHub publication, deployment completion, alias verification, and browser canary verification were checked separately.

## Production health

- `/` returned HTTP 200 in 72 ms during the final check.
- `/api/health` returned HTTP 200 in 103 ms.
- The health endpoint reports `production-capable` with no required-service blockers.
- Durable sessions use Vercel Blob.
- Leads and first-party product analytics use Neon Postgres.
- OpenAI generation is connected.
- PostHog is configured and session replay is disabled.
- Distributed rate limiting is connected.
- Transactional email is optional and currently disconnected in `console` mode.
- Folloze MCP publication is disabled. The public runtime remains app-hosted HTML only.

## Browser canary

The production canary used `adp.com` and selected:

- Offer: `ADP SmartCompliance® Employment Tax`
- Audience: `CFOs and finance executives`
- Objective: `Speak with an advisor`

Verified behaviors:

- Brand research returned ADP-specific offer recommendations.
- Audience and objective recommendations reflected the confirmed offer.
- Build phases advanced through research, planning, writing, checking, and finalizing.
- The final preview loaded with ADP identity, logo, and palette.
- Mouse-wheel scrolling worked inside the preview.
- Reaching the final section opened analytics after the intended delay.
- Analytics opened manually and displayed current-session engagement.
- Selecting a decision path unlocked `Save by email`.
- The embedded closing CTA opened the save dialog without navigating away.
- The save dialog collected a business email and did not expose the raw preview URL.
- `Start over` returned the visitor to the entry experience.
- No email address was submitted during QA.

Canary session: `i-dGKPpokBrfz1u0JBtXaMEuaz0_Rh85`

Support reference: `TMN-8FDBEC9E5023`

## Material concern: confirmed brief lost in fallback generation

The session persisted the correct ADP offer, audience, objective, and `book-meeting` CTA. The OpenAI draft then failed the quality gate, and the session used `deterministic-fallback`. That fallback produced generic Data and AI language instead of the confirmed SmartCompliance Employment Tax brief.

Examples from the live output included:

- Experience title: `ADP | Data and AI`
- Decision paths: `Data foundation`, `AI governance`, and `Activation`
- Closing action: `Explore the Experience better HR and payroll path`

This is not a data-capture failure. It is a generation fallback-specificity failure. The quality receipt still passed, which means the current gate can certify structurally valid copy that is materially misaligned with the confirmed brief. Treat this as a P1 content-quality defect.

Required regression:

1. Force the section-writing quality gate to reject the primary draft.
2. Confirm the deterministic fallback preserves the selected offer, audience, objective, CTA type, and offer-specific vocabulary.
3. Reject fallback copy when a generic topic replaces a confirmed offer.
4. Prevent a `passed` quality receipt when the artifact loses those locked brief fields.

## Telemetry concern: journey completion rejected twice

The browser recorded two POST requests to `/api/events` with HTTP 400. The source contract identifies the cause:

- The generated runtime marks `journey_complete` as a durable event and posts it to `/api/events`.
- The server-side engagement-event enum does not include `journey_complete`.
- The client retries a failed durable event once.

One journey-completion action therefore creates the exact pair of 400 responses seen in the canary. Other engagement requests returned 202, and `/api/analytics/events` continued returning 202. This does not block the visitor experience, but it drops the durable completion event and adds avoidable console noise.

Required regression:

1. Add `journey_complete` to the server contract and persistence tests, or stop sending it to the durable endpoint.
2. Assert every name in the generated runtime's durable-event allowlist is accepted by the server schema.
3. Assert one journey completion creates one accepted durable request without a retry.

## Evidence

- [Production entry screenshot](./2026-09-01-sep1-production-home.png)
- [ADP finished preview screenshot](./2026-09-01-sep1-production-adp-ready.png)
- [Save dialog screenshot](./2026-09-01-sep1-production-save-dialog.png)

## Final status

The requested version is published to GitHub and deployed to the Vercel production alias. Infrastructure, routing, and the core interaction flow passed. The release is usable for testing now, but it is not fully accepted because a confirmed brief can still collapse into generic fallback messaging and the durable journey-completion event is rejected.
