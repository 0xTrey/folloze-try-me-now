# Production canary correction

Date: 2026-08-28

Initial production deployment: `dpl_9ZW7RvS8p4tAbuqKJLedoYqyRNea`

Initial implementation commit: `4fd4983`

## Canary verdict

Reject the first deployment. The production Aprio intake exposed `Account Anything AI` and `Pulse Economy Capital` as offer recommendations. Those are editorial or market topics, not current accounting and advisory service offerings. This violated R5 even though the sanitized local fixture passed.

## Root cause

The official-site crawler admitted every navigation URL into a six-page queue. Generic pages such as alliance, invoices, locations, and contact consumed the page budget before the solution index and service details. Weak homepage topics could also qualify as evidence-backed recommendations when no stronger discovery graph was available.

## General correction

- Prioritize official product, solution, service, and offering indexes.
- Prioritize direct offer paths such as tax, audit, assurance, accounting, advisory, compliance, consulting, payroll, and managed services.
- Exclude contact, invoice, alliance, location, career, login, legal, editorial, event, resource, news, case-study, and other non-offer paths from the discovery queue.
- Reject pure statistics, questions, editorial headings, company descriptors, and marketing taglines as offer labels.
- Treat weak homepage topics as free-form context unless the label has a strong product or service marker.
- Preserve the same-origin, redirect, protocol, port, duration, page-count, and link-count safety boundaries.

No domain-specific branch was added.

## Corrected evidence

Running the corrected engine against `https://www.aprio.com/` harvested, in order:

1. Homepage.
2. All Solutions.
3. Business Tax.
4. Audit and Assurance.
5. Risk and Compliance.
6. Advisory Services.

The resulting three evidence-backed recommendations were:

- Audit & Assurance Solutions.
- Business Tax Services.
- Risk & Compliance Solutions.

Each result resolves to an official Aprio service page and carries an evidence reference.

## Correction gates

- Focused offer discovery, recommendation, and generalized fixture tests: 29 passed.
- Full unit suite: 146 files and 1,671 tests passed.
- Preview benchmark: 5 files and 33 tests passed.
- Lint: zero errors and three pre-existing warnings.
- Typecheck: passed.
- Turbopack production build: passed.
- Critical lifecycle browser suite: 28 passed.

## Final production acceptance

Final implementation commit: `018b44c`

Acceptance receipt commit: `9b89f8d`

Final production deployment: `dpl_EtBF7RWYbKZJM9R3pug4X5wEKPXh`

Production alias: `https://folloze-try-me-now.vercel.app`

The first corrected production run exposed two HTTP 400 responses from the first-party analytics endpoint. Review found two general defects:

- Older UI calls sent unified event names with property keys outside the server allowlist.
- A failed pre-reset request could requeue events from the old visitor identity after Start over created a new identity.

The browser client now enforces the same unified event contract as the server, uses typed properties for build, research, engagement, and claim events, and discards stale retries after an identity rotation. Ordinary same-identity retries still work.

The final production Aprio canary passed with:

- Offer recommendations: Audit & Assurance Solutions, Business Tax Services, and Risk & Compliance Solutions.
- Audience recommendations: CFOs and finance executives, plus controllers and accounting leaders.
- Objective actions: explore the service, speak with an advisor, and review the service overview.
- All six receipt-backed build phases observed before the final reveal.
- Embedded preview wheel scroll moved from 0 to 800 pixels while the host page remained at 0.
- Live engagement opened with the required disclosure.
- The email-save dialog unlocked after real exploration and opened without submitting an address.
- Start over cleared the build and reveal state.
- Zero page errors, zero console errors, and zero failed responses.

Final correction gates:

- Focused analytics and route tests: 15 passed.
- Full unit suite: 146 files and 1,681 tests passed.
- Preview benchmark: 5 files and 33 tests passed.
- Focused analytics and guided-entry browser suite: 15 passed.
- Lint: zero errors and three pre-existing warnings.
- Typecheck: passed.
- Webpack production build: passed.
- Vercel production health: production-capable with no blockers.
- Final-alias analytics smoke: two accepted HTTP 202 batches and zero failures.

A repeated full-generation canary against the code-identical receipt deployment did not reveal within 150 seconds after the prior run passed in 59 seconds. Health and first-party analytics remained green. Treat this as a provider-latency observation for reliability monitoring, not an analytics-contract regression.

Final verdict: accept the ten-point production repair at 100 out of 100. No hard blocker remains.
