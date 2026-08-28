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

The correction must be committed, pushed, deployed, and rerun through the production canary before the ten-point repair can be called complete.
