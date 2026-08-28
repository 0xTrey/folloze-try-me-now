# Cursor work orders

Cursor may use internal parallel agents for bounded analysis and test authoring. One coordinator owns integration. Do not commit.

## Work order 0: baseline and invariant tests

Objective: freeze the current behavior and add failing tests for the approved deltas before changing production.

Required coverage:

- public session payload never exposes provisional HTML;
- only a persisted final artifact is revealed;
- a product or solution fixture executes evidence into thesis and copy;
- the production section-model client is used when configured;
- production-approved section copy is not overwritten by an earlier draft;
- private diagnostics remain outside public and PostHog payloads;
- current revision and fingerprint fencing remain intact.

Stop when the new tests fail for the intended reasons and the existing focused suite still passes.

## Work order 1: final-only lifecycle and shared deadline

Objective: remove customer-facing provisional artifacts and enforce one 60-second budget.

Primary files:

- `src/lib/orchestrator.ts`;
- `src/lib/preview-lifecycle.ts`;
- `src/lib/preview-benchmark.ts`;
- `src/lib/config.ts`;
- session/public serialization and focused tests.

Requirements:

- keep drafts internal;
- reveal only `readiness: "final"` after persistence readback;
- replace provisional events and copy with honest build-stage events;
- reserve at least five seconds for render, write, and readback;
- pass remaining time or an abort signal to source extraction, model generation, repair, and rendering;
- never extend the customer deadline with a worker-specific timeout;
- preserve stale revision and attempt fencing;
- return a recoverable failure when no final artifact passes.

Stop when lifecycle, deadline, and stale-write tests pass.

## Work order 2: Evidence Graph executor

Objective: turn the existing research plan and reconciler into one executed, typed Evidence Graph.

Primary files:

- `src/lib/orchestration/research-query-plan-v2.ts`;
- new or existing research execution files under `src/lib/research/`;
- `src/lib/research/evidence-reconciler.ts`;
- private schemas and tests.

Requirements:

- use approved current providers and safe-fetch rules only;
- run bounded research lanes in parallel;
- reconcile duplicates and conflicts;
- preserve authority, confidence, permissions, allowed uses, and prohibited uses;
- record source-free trace receipts and timing;
- treat missing evidence as unknown;
- prove that adding or removing a material fact changes downstream thesis fields.

Stop when deterministic fixtures show execution, reconciliation, timeout behavior, and no leakage.

## Work order 3: Campaign Thesis and recipe contracts

Objective: compile one validated Campaign Thesis and define six recipe contracts.

Primary files:

- new thesis and recipe files under `src/lib/generation/`;
- additive adapters in the existing messaging compiler;
- focused schema and routing tests.

Requirements:

- every thesis field carries evidence refs, confidence, status, and buyer-facing permission;
- missing optional fields are omitted honestly;
- define Product/Solution, Problem/Category, Use Case/Workflow, Content/Resource, Event/Webinar, and Customer Proof recipes;
- activate only Product/Solution in production;
- keep Launch, Guide, and Align as strategic or composition metadata;
- persist selection and rejected alternatives privately;
- keep selection deterministic for identical inputs.

Stop when all recipe contracts validate and Product/Solution routes deterministically from representative fixtures.

## Work order 4: production section authority

Objective: make the current role-specific model writer the production authority and prevent later overwrite.

Primary files:

- `src/lib/orchestrator.ts` assembly boundary;
- `src/lib/generation/session-production-engine.ts`;
- `src/lib/generation/generic-production-engine.ts`;
- `src/lib/integrations/openai.ts` only for the bounded section client and shared deadline;
- focused integration tests.

Requirements:

- pass `sectionModelClient` when configured;
- preserve deterministic fallback for missing or rejected model output;
- remove any hero or global-draft overwrite of reviewed production copy;
- ensure evidence differences materially change rendered copy;
- record model, repaired-model, fallback, and omitted outcomes per section;
- do not persist raw prompts or copy in trace;
- do not create a second page schema or renderer.

Stop when the final rendered HTML proves production-authoritative section output and fail-soft behavior.

## Work order 5: Section Brief and persuasion review

Objective: give every section one buyer movement and select the strongest valid candidate.

Primary files:

- `src/lib/generation/section-copy-types.ts`;
- `src/lib/generation/section-writing-contract.ts`;
- `src/lib/generation/section-model-writer.ts`;
- `src/lib/generation/section-candidate-review.ts`;
- cross-section review and focused tests.

Requirements:

- extend the existing brief with section job, buyer movement, previous conclusion, next setup, thesis fields, required and optional evidence, prohibited claims and ideas, allowed CTA, and visual role;
- keep evidence scope least-privileged by role;
- run hard gates before persuasion ranking;
- rank valid candidates pairwise or with an explainable fixed rubric;
- penalize competitor-swappable and internally narrated copy;
- reject duplicate and near-duplicate claims across the page;
- allow one bounded repair, then use a prevalidated final fallback or omit an optional section.

Stop when a deliberately generic candidate loses to a specific one and a persuasive but unsupported candidate is blocked.

## Work order 6: Product/Solution recipe activation

Objective: make one complete recipe consistently strong before activating the other five.

Primary files:

- recipe and page-plan files under `src/lib/generation/`;
- existing production adapters and renderer inputs;
- product/solution fixtures and tests.

Requirements:

- select four to seven sections based on the argument;
- use one distinct job and buyer movement per section;
- connect buyer tension, seller mechanism, use cases, proof or validation, objection, and CTA;
- require actual buyer and offer specificity;
- maintain one coherent argument across the whole page;
- preserve evidence-based brand and asset decisions;
- do not change geometry through model output.

Stop when three materially different sellers produce differentiated Product/Solution base experiences that pass the logo-swap and duplication tests.

## Work order 7: final-only visible shell

Objective: blend the compatible storyboard patterns into intake, build, failure, and reveal.

Primary files:

- `src/components/try-me-now-app.tsx`;
- `src/components/try-me-now-enhancements.tsx`;
- related CSS modules and `src/app/globals.css`;
- focused component and Playwright tests;
- `DESIGN.md` and `docs/decision-log.md`.

Requirements:

- use one centered conversational intake surface;
- collapse completed inputs into editable receipts;
- retain company-specific suggestions and honest provenance;
- use one stable build shell with active verbs and evidence receipts;
- implement working, slow, failed, and complete states;
- remove all preview-ready, provisional-page, or partial-page presentation;
- make final HTML the full-frame reveal;
- do not add analytics, personalization, save, publish, or Content Magic surfaces;
- remove eyebrow-headline-dek stacks in touched states;
- pass desktop checks at 1280 and 1440 widths and reduced motion.

Stop when the interaction remains stable from intake through final reveal and no partial HTML is visible.

## Work order 8: diagnostics and autoresearch benchmark

Objective: make quality and fallback behavior inspectable and measurable.

Primary files:

- `src/lib/generation/production-build-trace.ts`;
- `src/lib/build-trace.ts` and private schemas;
- new scoped runner under `scripts/autoresearch/v2-base-experience/`;
- new fixtures under `tests/fixtures/v2-base-experience/`;
- this package's autoresearch files.

Requirements:

- add the diagnostics listed in `architecture.md` without public or analytics leakage;
- retain existing event IDs and trace limits where consumers depend on them;
- create at least nine fixtures, including three Product/Solution sellers, weak evidence, no logo, slow provider, invalid model output, stale revision, and deliberately generic copy;
- report four 25-point dimensions, blockers, p50 and p95 total timing, writer-source distribution, fallback rate, and selected recipe/strategy digests;
- run two blocker-free release evaluations;
- keep or revert experiments using the scoped autoresearch policy;
- do not overwrite existing root or prior compiler autoresearch logs.

Stop when the runner has a reproducible baseline, rejects a known degradation, and exits nonzero on release failure.

## Integration order

```text
WO0
 -> WO1
 -> WO2
 -> WO3
 -> WO4
 -> WO5
 -> WO6
 -> WO7
 -> WO8
```

WO7 test scaffolding may begin after WO1. Production UI integration waits until the final-only session contract is stable.

## Forbidden scope

- Do not touch the three modified PNGs under `output/product-owner-remediation/`.
- Do not commit, push, deploy, change GitHub visibility, or alter Vercel.
- Do not read or print secrets.
- Do not install a new provider or add credentials.
- Do not build personalized variants.
- Do not add customer-facing analytics, save, publish, or Content Magic flows.
- Do not expose internal recipe, strategy, evidence, or trace labels to visitors.
- Do not replace `ExperienceSpecV2` or the deterministic renderer.
