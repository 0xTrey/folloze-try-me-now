# Acceptance and autoresearch contract

## Release score

Score each retained candidate from 0 to 100. Each dimension is worth 25 points.

### 1. Buyer and offer specificity

- names the actual buyer role and owned job;
- names the real product, solution, or supported category;
- reflects the objective and intended next action;
- passes the logo-swap test;
- avoids generic placeholders and competitor-swappable claims.

### 2. Evidence and trust

- every factual claim resolves to permitted evidence;
- fact, inference, and unknown remain distinct;
- missing proof becomes an honest validation path;
- no invented metrics, proof, urgency, personas, or customer claims;
- private evidence and compiler artifacts stay private.

### 3. Argument and page quality

- one Campaign Thesis governs the page;
- the selected strategy is materially different from rejected alternatives;
- every section has one job and one buyer movement;
- sections form a coherent progression without repetition;
- mechanism, proof, objection, and CTA support the promise;
- final copy uses buyer language and contains no internal narration.

### 4. Brand, visual flow, and reliability

- identity, logo, semantic colors, typography, geometry, buttons, and assets remain evidence-backed;
- imagery is purposeful and allocated once per semantic role;
- the intake and build shell remain stable, legible, and honest;
- no provisional HTML is customer-visible;
- final HTML is persisted, read back, and revealed within 60 seconds;
- slow, invalid-model, missing-evidence, failure, and retry paths are recoverable.

## Hard blockers

Any blocker rejects the candidate regardless of score:

- wrong company, offer, or audience identity;
- unsupported claim or dangling evidence reference;
- invented metric, proof, urgency, deadline, persona, or customer result;
- customer-visible provisional or unpersisted HTML;
- final artifact without a passing structural and truth receipt;
- production section copy overwritten by an earlier draft;
- stale revision overwrite;
- public or PostHog leakage of domains, URLs, email, source text, prompts, copy, evidence, trace IDs, support references, or credentials;
- broken, repeated, unsafe, or policy-violating imagery;
- provider work continuing past the shared generation deadline;
- required test, typecheck, build, privacy, or secret-scan failure.

## Fixture matrix

Minimum fixtures:

| Fixture | Purpose |
| --- | --- |
| seller-product-a | full evidence, model section path |
| seller-product-b | materially different buyer and mechanism |
| seller-solution-c | solution motion and different composition |
| weak-proof | honest proof omission or validation path |
| weak-brand | verified identity with incomplete optional visual evidence |
| no-logo | recoverable brand-help or intentional no-logo treatment |
| model-invalid | deterministic final fallback |
| provider-slow | shared deadline and finalization reserve |
| stale-revision | late artifact discard |
| generic-degradation | candidate must lose or fail |

Fixtures store only public-safe facts, permitted inferences, prohibited claims, expected buyer jobs, acceptable strategies, recipe, CTA logic, brand tokens, and expected failure codes.

## Runtime assertions

- zero public HTML before `ready(final)`;
- one final artifact per active revision;
- provider abort before the finalization reserve;
- render, save, readback, and reveal complete by 60 seconds;
- p50 and p95 reported for research, thesis, strategy, writing, review, render, persistence, readback, and total;
- no fake percentages or fake elapsed time;
- slow state names current work and preserves inputs;
- failure state includes a support reference and one recovery action;
- reduced motion preserves all state meaning.

## Compiler assertions

- Evidence Graph changes materially affect the Campaign Thesis;
- thesis changes materially affect strategy or section copy;
- strategy selection changes final rendered copy;
- Product/Solution recipe selection is deterministic;
- every rendered section maps to one Section Brief and job;
- every factual section claim maps to current-revision evidence;
- valid model candidates beat deterministic fallback when stronger;
- unsupported or generic candidates are rejected;
- writer source, candidate count, rejections, repair, evidence refs, and duration are recorded privately;
- raw prompt and generated copy are absent from trace.

## Visual assertions

- one central intake surface at desktop widths;
- stable geometry between researching, planning, writing, checking, and finalizing;
- active, complete, and queued states are visually distinct without color alone;
- no eyebrow-headline-dek stack in touched screens;
- final experience occupies the primary full-frame plane;
- no analytics, personalization, save, publish, or Content Magic modules appear;
- no horizontal overflow at 1280 or 1440 pixels;
- no page errors, unhandled rejections, or unexpected console errors.

## Required commands

Cursor runs focused commands during implementation. Codex independently runs the retained release gates:

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:preview
npm run autoresearch:messaging-compiler
npm run autoresearch:v2-base-experience
npm run build
npm run build:webpack
npm run test:e2e -- --project=desktop
npm run qa:visual:folloze
git diff --check
```

Mobile is not a product design target for this release, but existing mobile behavior must not regress catastrophically. Run the existing mobile suite when it is not coupled to user-owned visual fixtures.

## Autoresearch loop

1. Measure the current branch before mutation.
2. Apply one bounded mutation.
3. Run the fixed fixture corpus and hard blockers.
4. Record total, four dimensions, timings, fallback rate, and concise reason codes.
5. Before three retained experiments, keep only a strict score improvement.
6. After three retained experiments, keep only a score greater than `median + 1.4826 * MAD`.
7. Revert a non-improving mutation without weakening tests.
8. Stop after five consecutive reverts.
9. Accept release only after two consecutive blocker-free runs at 90 or higher.

Suggested mutation order:

1. final-only lifecycle;
2. production authority;
3. Evidence Graph execution;
4. Campaign Thesis;
5. Product/Solution recipe;
6. Section Brief continuity;
7. persuasion ranking;
8. fallback copy hardening;
9. stable build shell;
10. final reveal polish.

## Evidence package

The final Cursor handback and Codex acceptance report must include:

- source SHA and candidate digest;
- changed-file inventory;
- fixture by dimension table;
- hard-blocker result;
- at least three private, source-free compiler receipt examples;
- one deliberately rejected generic candidate;
- writer-source and fallback distribution;
- p50 and p95 stage and total timing;
- public-payload and PostHog privacy result;
- desktop screenshots for intake, active build, slow, failed, and final reveal;
- exact command exit codes;
- known limitations and deferred recipe activations.
