# Codex acceptance report

## Decision

The V2 final-only Product/Solution base experience is accepted for a local release candidate.

The implementation now compiles public evidence into one governed campaign argument, writes each section against an explicit buyer job, keeps production model copy when it passes the gates, falls back safely when it does not, and reveals only the persisted final HTML. The visitor never receives a provisional page.

This decision does not authorize a GitHub push or Vercel deployment. Those remain separate release actions.

## Release boundary

| Item | Value |
| --- | --- |
| Repository | `folloze-try-me-now-unified-builder` |
| Branch | `codex/messaging-compiler-v1` |
| Starting source | `3c556052bbbb27c29ef610652d76c4018e4fccb2` |
| Planning contract | `3fc11f6` |
| Accepted implementation | `14034be1890a030ca74bcb395363e0d4f1515fc1` |
| Active recipe | Product/Solution |
| Public artifact | App-hosted final HTML only |
| Personalized variants | Deferred |
| Folloze publishing | Out of scope |
| Analytics demonstration | Deferred |
| Save and email flow | Deferred from the V2 final-only path |

## What was implemented

### Evidence and research

- Typed Evidence Graph with public-source permissions, confidence, fact or inference status, revision ownership, and deterministic reconciliation.
- Parallel research lanes for identity, brand, offer, audience, market, proof, and visual evidence.
- Evidence seeds and query planning that begin from recognized company and offer signals.
- Safe weak-brand, missing-logo, provider-slow, and stale-revision outcomes.

Primary files:

- `src/lib/research/evidence-graph.ts`
- `src/lib/research/evidence-graph-executor.ts`
- `src/lib/research/evidence-lane-runners.ts`
- `src/lib/research/evidence-reconciler.ts`
- `src/lib/research/evidence-seeds.ts`
- `src/lib/orchestration/research-query-plan-v2.ts`

### Messaging compiler

- Evidence-bound Campaign Thesis for buyer job, tension, desired outcome, mechanism, proof, objection, action, and optional why-now.
- Three competing strategy candidates before section writing.
- Six semantic page recipes, with Product/Solution as the only active release recipe.
- Section briefs with one semantic job, one buyer movement, evidence scope, continuity, prohibitions, and capacity.
- Production-authoritative OpenAI section writing with deadline ownership and deterministic fallback.
- Hard truth, schema, evidence, duplication, terminology, and word-budget gates before persuasion ranking.
- Deterministic rejection of unsupported or generic candidates.

Primary files:

- `src/lib/generation/campaign-thesis.ts`
- `src/lib/generation/page-recipes.ts`
- `src/lib/generation/thesis-strategy-bridge.ts`
- `src/lib/generation/message-strategy-compiler.ts`
- `src/lib/generation/section-writing-contract.ts`
- `src/lib/generation/section-candidate-review.ts`
- `src/lib/integrations/openai-section-writer.ts`
- `src/lib/generation/generic-production-engine.ts`
- `src/lib/generation/session-production-engine.ts`

### Lifecycle, trace, and privacy

- Final-only lifecycle: queued, researching, planning, writing, checking, finalizing, ready.
- Five-second finalization reserve inside the shared generation budget.
- Final artifact persistence and readback before reveal.
- Stale revision rejection and one-artifact ownership.
- Private BuildTrace with recipe, strategy, section job, prompt and template versions, evidence references, candidate counts, rejection codes, output digests, writer source, fallback codes, and timings.
- Behavior-only PostHog projection remains separate from private diagnostic traces.
- Raw prompts, source bodies, generated copy, domains, URLs, emails, support references, and credentials are excluded from public analytics payloads.

Primary files:

- `src/lib/preview-lifecycle.ts`
- `src/lib/build-trace.ts`
- `src/lib/build-trace-schema.ts`
- `src/lib/generation/production-build-trace.ts`
- `src/lib/session-store.ts`
- `src/lib/orchestrator.ts`

### Customer-facing experience

- One centered entry with one dominant build action.
- One stable build canvas with six honest, receipt-backed stages.
- No fake percentage or fake elapsed-time claim.
- Explicit slow and failed states that preserve the brief and provide one recovery action.
- No customer-facing iframe or HTML before final readiness.
- Full-frame final reveal after the final artifact settles.
- No small-label, headline, and supporting-copy stack in the touched entry, build, reveal, or active generated HTML path.

Primary files:

- `src/components/final-build-shell.tsx`
- `src/components/final-build-shell.module.css`
- `src/components/try-me-now-app.tsx`
- `src/components/streaming-brief-composer.tsx`
- `src/app/globals.css`
- `src/lib/generation/experience-template.ts`

## Fixture results

All nine fixtures used the Product/Solution recipe. Six quality fixtures received the complete 100-point evaluation. The remaining three verified safe instruction or stale-revision outcomes and were not scored as rendered pages.

| Fixture | Expected result | Strategy | Writer path | Sections | Evidence-linked | Result |
| --- | --- | --- | --- | ---: | ---: | --- |
| seller-product-a | Production page | Mechanism | Mixed | 6 | 5 | 100, no blockers |
| seller-product-b | Production page | Proof | Mixed | 6 | 5 | 100, no blockers |
| seller-solution-c | Production page | Mechanism | Mixed | 6 | 5 | 100, no blockers |
| weak-proof | Production page | Mechanism | Deterministic | 6 | 5 | 100, honest validation path |
| weak-brand | Safe deterministic instruction | Upside | None | 0 | 0 | Brand help, as expected |
| no-logo | Safe deterministic instruction | Upside | None | 0 | 0 | Brand help, as expected |
| model-invalid | Production page | Proof | Deterministic | 5 | 4 | 100, invalid candidate rejected |
| provider-slow | Production page | Mechanism | Deterministic | 6 | 5 | 100, deadline fallback |
| stale-revision | Safe deterministic instruction | Mechanism | None | 0 | 0 | Late artifact discarded |

Writer distribution across all fixtures:

- mixed model and deterministic: 3;
- deterministic: 3;
- no section writer because the result was an instruction or stale discard: 3;
- reported fallback rate: 0.333;
- strategy distribution: mechanism 5, proof 2, upside 2.

## Private source-free receipt examples

These examples come from the synthetic release fixture and contain no prompt, source body, URL, domain, or generated copy.

| Section | Semantic role | Writer | Evidence refs | Status |
| --- | --- | --- | ---: | --- |
| `recognize-buyer-outcome` | Buyer outcome | Model | 5 | Completed |
| `name-constraint` | Current friction | Deterministic | 4 | Completed |
| `distinct-mechanism` | Mechanism | Deterministic | 5 | Completed |
| `proof-or-validation` | Proof | Deterministic | 3 | Completed |

The private BuildTrace also records candidate count, rejection reasons, prompt version, template version, output hash, revision, attempt, fallback codes, and bounded stage timings. It does not store raw prompt or copy text.

## Autoresearch result

| Evaluation | Score | Blockers | Decision |
| --- | ---: | --- | --- |
| Messaging compiler run 1 | 99.43 | None | Pass |
| Messaging compiler run 2 | 99.43 | None | Pass |
| V2 base run 1 | 100 | None | Pass |
| V2 base run 2 | 100 | None | Pass |
| Deliberate generic degradation | 100 before blocker override | `generic_candidate_rejected` | Expected rejection, exit 1 |

The scoped V2 runner reports an offline compiler p50 of 4 ms and p95 of 9 to 11 ms. This is not the production research, provider, persistence, and browser reveal duration. The customer-facing 60-second target still requires an environment-backed canary before it can be claimed as verified.

## Command evidence

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm run qa` | 0 | 142 files and 1,634 unit tests passed; Turbopack and webpack builds passed |
| `npm run test:e2e -- --project=desktop --workers=2 --reporter=line` | 0 | 76 passed |
| `npm run test:e2e -- --project=mobile --workers=2 --reporter=line` | 0 | 52 passed; 24 intended desktop-only skips |
| `npm run qa:visual:folloze` | 0 | 3 passed |
| `npm run benchmark:preview` | 0 | 5 files and 33 tests passed |
| `npm run autoresearch:messaging-compiler` | 0 | 99.43 twice, no blockers |
| `npm run autoresearch:v2-base-experience` | 0 | 100, no blockers |
| `npm run autoresearch:v2-base-experience -- --include-degraded` | 1, expected | Generic degradation detected and rejected |
| `CAPTURE_V2_RELEASE_EVIDENCE=1 npx playwright test tests/e2e/final-only-shell.spec.ts --project=desktop --workers=1 --reporter=line` | 0 | 6 passed and five screenshots captured |
| `git diff --check` | 0 | No whitespace errors |

Lint reported three existing unused-variable warnings in `src/lib/cloudflare-upload-contract.test.ts`. It reported zero errors.

## Visual evidence

- `screenshots/intake.png`
- `screenshots/active-build.png`
- `screenshots/slow-build.png`
- `screenshots/failed-build.png`
- `screenshots/final-reveal.png`

The protected user-owned product-owner screenshots retained their original hashes and were excluded from staging.

## Independent review

### Visual and brand review

Verdict: `pass` for the active V2 final-only path.

The active V2 shell uses stable geometry, clear status language, restrained motion, and a final reveal that occupies the main plane. The generated production path suppresses decorative eyebrow labels when a headline and supporting body already carry the message. Legacy renderer paths remain outside this release boundary and retain their existing tests.

### Evidence and citation review

Verdict: `weak_support` for external claims, strong internal enforcement.

The compiler enforces evidence references, fact versus inference handling, proof omission, unsafe-claim rejection, and private diagnostics. The current release artifacts record evidence IDs and counts, but they do not yet persist a complete claim-text-to-source-authority matrix. Synthetic fixtures also do not prove live brand harvesting or the 60-second end-to-end production target.

Before marketing the system as fully source-grounded and verified within 60 seconds:

1. add a private, sanitized claim-source matrix with section, claim digest, evidence ID, evidence kind, authority, and validation result;
2. run a live read-only brand canary across logo, palette, typography, geometry, imagery, and first-party provenance;
3. run an environment-backed timing canary covering research, provider calls, persistence, readback, render, and reveal;
4. verify that the browser artifact contains the same supported claims reviewed by the compiler.

These are release-proof improvements. They do not invalidate the final-only base architecture implemented here.

## Known limits

- Only Product/Solution is active. Event, content or guide, customer proof, problem or category, and named-account alignment recipes remain defined but inactive.
- Personalized account, industry, and persona variants are deferred.
- No live provider or Brandfetch canary ran in this acceptance pass.
- The 60-second target is a product requirement, not yet a verified production measurement.
- The synthetic benchmark proves deterministic behavior and safe failure handling, not customer-grade live copy by itself.
- Content Magic remains an existing separate secondary route. It is not expanded by this release.
- No GitHub push, Vercel deployment, Folloze publication, email claim flow, or analytics demonstration was performed.

## Acceptance outcome

Accept the branch as the V2 final-only Product/Solution base release candidate. The next bounded increment should add the private claim-source matrix and a live canary before activating the remaining semantic recipes or any personalized variants.
