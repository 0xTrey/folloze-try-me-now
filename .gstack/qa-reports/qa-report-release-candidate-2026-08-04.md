# QA Report: Try Me Now Release Candidate

**Target:** local release candidate on `codex/visual-v1`

**Date:** 2026-08-04

**Status:** PASS — ready for controlled production deployment

## Scope

- Shared guided desktop builder for ABM, campaign, and content journeys.
- Schema-safe company-specific audience generation.
- Server-delivered seller and target logos, including portable inline SVG assets.
- Public URL and private PDF context for every journey.
- Privacy-bounded request tracing and support references.
- Real OpenAI generation using the production candidate model and a server-only key.

## Automated verification

- ESLint: pass.
- TypeScript: pass.
- Vitest: 49 files / 413 tests pass.
- Next.js Turbopack production build: pass.
- Next.js webpack production build: pass.
- Desktop Playwright suite: 16/16 pass.
- Deterministic Folloze visual contract: 2/2 pass.
- `git diff --check`: pass.

## Real generation canary

All canaries ran through the browser UI against isolated local session storage, real public brand extraction, and OpenAI generation. No console or page errors were observed.

| Journey | Seller / target or source | Result | Support reference |
|---|---|---|---|
| 1:1 ABM | Folloze for Cisco | OpenAI preview ready; seller and target logos delivered | `TMN-27E99DAF3D86` |
| Campaign | Jitterbit product campaign plus public context URL | OpenAI preview ready; source extraction and seller logo delivered | `TMN-B31CF57D48DD` |
| Content | Folloze platform public page | OpenAI preview ready; source extraction and seller logo delivered | `TMN-78F0D24933E8` |

The three generations completed in the intended quality window, passed the structured quality gate, returned non-generic buyer personas, and rendered generated pages with five or more image assets each.

## Regression evidence

- The exact overlong audience incident is normalized before it reaches the bounded experience schema; its full rationale remains in the canonical brief.
- Cisco's inline SVG wordmark is validated, copied into the private session, hash-checked, and served through a first-party session image route.
- Generated preview HTML retains portable seller and target logos.
- Unreadable public sources fail before model invocation.
- Brand recovery cannot retry a terminal source-generation failure.
- Public session JSON exposes first-party delivery URLs, not portable logo bytes or API credentials.

## Release boundary

This report covers the local release candidate. Production acceptance still requires migration `008_create_try_me_traces.sql`, production environment activation, an exact-commit Vercel deploy, `/api/health`, and a live browser canary.
