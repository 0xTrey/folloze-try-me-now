# Folloze Try Me Now

A repo-backed visual MVP for a top-of-funnel, product-led Folloze experience. A visitor chooses one of three paths, supplies a few signals, watches Folloze build in the background, and receives a tailored buyer experience within a 30–60 second quality window. The first useful build signal or provisional artifact should appear within 10 seconds.

[Open the deployed MVP](https://folloze-try-me-now.vercel.app)

For the current entry, editing, result, and account-selection behavior, see [Usability flow](docs/usability-flow.md). Source changes and production deployment remain separate checkpoints.

![Try Me Now entry experience](output/playwright/entry-desktop.png)

## V1 paths

1. **1:1 ABM** — combine a seller domain, target account, audience, and objective into an account-specific microsite.
2. **Campaign** — build a generalized product, demand, or event landing page.
3. **Content** — turn a public URL or PDF into a guided, measurable content experience.

Every path exposes the same four intelligence layers while the visitor keeps moving:

- Brand system
- Buyer fit
- Message strategy
- Experience composition

Work begins progressively. Brand extraction starts as soon as the company domain is accepted; the app does not wait for the full brief. A temporary URL appears immediately, and an unclaimed ready preview expires after 30 minutes. Unclaimed previews stay cache-only and never trigger Folloze publication. A business email claims the experience, records the lead, and becomes the only publication boundary.

## Current checkpoint

| Surface | State |
| --- | --- |
| Local source and visual QA | Complete; desktop, mobile, 320px, reduced motion, error, claim, and signal states exercised. |
| Automated QA | September 5 release: 1,909 tests passed, one skipped, 101 desktop browser tests passed, both production builds passed, and dependency and Git-history secret scans passed. |
| Public Vercel app | Deployed at <https://folloze-try-me-now.vercel.app>. |
| Release control | Vercel tracks the intentional `production` release branch, now at tested runtime commit `6b7cfe2`. GitHub's default branch is `codex/unified-microsite-builder`. Current deployment, security, and recovery evidence is recorded in [Release status](docs/buyer-journey-security-status.md). |
| Session durability | Private Blob storage uses authenticated AES-256-GCM envelopes, strict encrypted reads, wrapper TTL, uncached reads, and optimistic ETag updates. All 278 records passed the migration audit. Current preview/development values use a separate private store; historical credential revocation remains separate work. |
| Brand | Brand-aware fast extractor now rejects unrelated logos and badges, ranks semantic palette roles, discovers live font faces, and selects multiple contextual visual assets; the full remote Brand Harvester is still a later option. |
| Generation | OpenAI generation is active. The September 5 campaign smoke test and rebuild reached final persisted artifacts. Thin-evidence samples used the documented legacy fallback; live section-writer acceptance and conversion quality still need measurement. The project key remains server-only. |
| Folloze | Local integration test saved unpublished Board `249022`; remote publish is disabled. |
| Email | Agentmail is configured. No claim or email was sent during the September 5 rollout; provider configuration is not a delivery receipt. |
| Lead ledger | Production Neon access uses a restricted application login and separate maintenance login. Forced RLS is active on nine app tables; session-scoped lead isolation passed actual allowed and denied operations. SQL email field encryption is not implemented. |

The Folloze designer URL is <https://app.folloze.com/app/board/249022/designer>. It proves a draft save only. The board is not published and has no verified anonymous URL.

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Integrations activate only through explicit modes, so ambient machine credentials cannot silently change behavior:

For fresh AI generation without saving project credentials in `.env.local`, keep
the OpenAI key under `com.0xtrey.folloze-try-me-now.openai`, the optional Brand
API key under `com.0xtrey.folloze-try-me-now.brandfetch`, and the Logo API client
ID under `com.0xtrey.folloze-try-me-now.brandfetch-client` in macOS Keychain, then run:

```bash
npm run dev:openai
```

That launcher reads credentials directly into the server process, forces
`GENERATION_MODE=openai`, defaults Brandfetch to logo-only mode when a client ID
exists, and never prints or persists credential values. Set
`BRANDFETCH_MODE=enrich` only after Brand API quota is active. Regular
`npm run dev` retains the explicit modes configured in your environment.

```text
GENERATION_MODE=fixture|openai
BRAND_MODE=fast|remote
FOLLOZE_MODE=disabled|draft|publish
EMAIL_MODE=console|resend
```

Claimed lead records use a pooled Neon `DATABASE_URL`. Create or verify the additive schema with:

```bash
npm run db:migrate:leads
```

Export the newest operator-facing tracking list as CSV on standard output with:

```bash
npm run db:export:leads -- --limit=500
```

The ledger stores business email, company/target domains, use case, audience, objective, source type, experience URL, and publication/email outcomes. It never stores generated HTML or source content. The export is an operator-only view of personal data and must not be committed to the repo. The email is transactional only; it does not silently subscribe the visitor to marketing.

An isolated local claim can verify the complete browser-to-Neon boundary without publishing to Folloze or sending email. Run a local server on port `3011` with fixture/disabled integrations, then run `npm run qa:claim-ledger`. The verifier refuses non-local targets and deletes its exact synthetic database and Blob records when it finishes.

Run the complete local verification suite with:

```bash
npm run qa
```

## Product and engineering references

- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Integration readiness](docs/integration-readiness.md)
- [Observability and QA runbook](docs/observability-and-qa.md)
- [Launch plan](docs/launch-plan.md)
- [Decision log](docs/decision-log.md)
- [June 1 source recovery](docs/research/2026-06-01-source-recovery.md)
- [Folloze brand harvest](research/brand-harvest/folloze-home/brand.json)

The visual MVP deliberately separates demo proof from launch readiness. Public production still needs explicit promotion of the server-side OpenAI configuration, the narrow Folloze MCP publish gateway with anonymous readback, Resend sender, distributed abuse controls, durable workflow execution, production database binding, and operational lead-routing/retention ownership.
