# Folloze Try Me Now

A repo-backed visual MVP for a top-of-funnel, product-led Folloze experience. A visitor chooses one of three paths, supplies a few signals, watches Folloze build in the background, and receives a tailored buyer experience in about 60 seconds.

[Open the deployed MVP](https://folloze-try-me-now.vercel.app)

![Try Me Now entry experience](output/playwright/entry-desktop.png)

## V1 paths

1. **1:1 ABM** — combine a seller domain, target account, audience, and objective into an account-specific microsite.
2. **Campaign** — build a generalized product, demand, or event landing page.
3. **Content** — turn a public URL or PDF into a guided, measurable content experience.

Every path uses the same live story:

- Finding your brand
- Understanding the audience
- Creating the story

Work begins progressively. Brand extraction starts as soon as the company domain is accepted; the app does not wait for the full brief. A temporary URL appears immediately, and an unclaimed ready preview expires after 30 minutes. A business email claims the experience.

## Current checkpoint

| Surface | State |
| --- | --- |
| Local source and visual QA | Complete; desktop, mobile, 320px, reduced motion, error, claim, and signal states exercised. |
| Automated QA | `npm run qa` passes lint, type checking, 19 unit tests, and the production build. |
| Public Vercel app | Deployed at <https://folloze-try-me-now.vercel.app>. |
| Session durability | Connected private Vercel Blob store with uncached reads, wrapper TTL, and optimistic ETag updates. |
| Brand | Safe fast extractor enabled; full remote Brand Harvester is not yet connected. |
| Generation | Deterministic fixture enabled; a fresh project OpenAI key is still needed. |
| Folloze | Local integration test saved unpublished Board `249022`; remote publish is disabled. |
| Email | Claim persistence works; Resend delivery is disabled, so fixture claims do not send mail. |

The Folloze designer URL is <https://app.folloze.com/app/board/249022/designer>. It proves a draft save only. The board is not published and has no verified anonymous URL.

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Integrations activate only through explicit modes, so ambient machine credentials cannot silently change behavior:

```text
GENERATION_MODE=fixture|openai
BRAND_MODE=fast|remote
FOLLOZE_MODE=disabled|draft|publish
EMAIL_MODE=console|resend
```

Run the complete local verification suite with:

```bash
npm run qa
```

## Product and engineering references

- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Integration readiness](docs/integration-readiness.md)
- [Launch plan](docs/launch-plan.md)
- [Decision log](docs/decision-log.md)
- [June 1 source recovery](docs/research/2026-06-01-source-recovery.md)
- [Folloze brand harvest](research/brand-harvest/folloze-home/brand.json)

The visual MVP deliberately separates demo proof from launch readiness. Public production still needs the dedicated OpenAI project, authenticated remote Brand Harvester, narrow Folloze MCP publish gateway with anonymous readback, Resend sender, distributed abuse controls, durable workflow execution, and a claimed-experience system of record.
