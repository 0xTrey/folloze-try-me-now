# Cursor Agent Contracts

Cursor may use up to 20 bounded agents. The manager owns shared types, integration, conflict resolution, tests, commits, and the final handback. Workers do not recursively delegate.

## Standard work order

Every task must include:

- one objective;
- allowed directories/files;
- allowed actions;
- required typed output or code diff;
- exact tests and evidence;
- stop condition;
- no push, deploy, secret reads, infrastructure changes, or scope expansion.

## Wave 1: evidence

| # | Agent | Objective | Boundary | Required evidence | Stop |
| ---: | --- | --- | --- | --- | --- |
| 1 | Identity normalizer | Canonicalize company name/domain/aliases and revision fingerprint. | identity/domain modules + tests | subdomain, alias, typo, redirect fixtures | Typed identity passes all fixtures. |
| 2 | Brandfetch retriever | Return verified logo and metadata for canonical or alias domain. | Brandfetch/portable logo modules + tests | hit, alias, missing, timeout, malformed asset | Provider result is typed and safe. |
| 3 | DOM/CSS harvester | Extract semantic colors, fonts, geometry, nav, hero, assets. | existing brand harvester service + tests | Apple/ADP/6sense/blocked fixtures | No invented values; confidence recorded. |
| 4 | Screenshot analyst | Convert desktop screenshot cues into bounded visual evidence. | brand intelligence/visual grammar + tests | observed ratios, radii, density, hero style | Typed evidence only; no CSS output. |
| 5 | Company researcher | Build source-backed positioning/category/company brief. | research/orchestration modules + tests | official-source provenance and timeout | Evidence artifact validates. |
| 6 | Offer researcher | Find/rank product, solution, industry, or event offers. | research/orchestration + tests | homepage discovery, supplied URL override | Three recommendation candidates validate. |
| 7 | Audience strategist | Recommend buyer audiences or ABM account context. | audience/message strategy + tests | job/role rationale and source refs | Three distinct candidates validate. |
| 8 | Objective/CTA strategist | Recommend objective and aligned CTA. | CTA/message strategy + tests | book meeting default, ABM/event exceptions | Three candidates and reason codes validate. |

## Wave 2: reconcile and select

| # | Agent | Objective | Boundary | Required evidence | Stop |
| ---: | --- | --- | --- | --- | --- |
| 9 | Evidence reconciler | Resolve conflicts and compile material Live Brief evidence. | evidence/brief compiler + tests | authority, freshness, confidence conflicts | One revisioned brief validates. |
| 10 | Framework ranker | Rank reviewed messaging frameworks. | message-spine/framework library + tests | deterministic matrix and reason codes | One selection + alternatives returns. |
| 11 | Wireframe ranker | Rank archetype/composition from content and brand evidence. | wireframe library/visual grammar + tests | dynamic 4-8 section cases | One reviewed composition returns. |
| 12 | Brand compiler | Compile `BrandSystemV2` semantic roles and fallbacks. | brand intelligence/schema + tests | Apple, ADP, ServiceTitan, no-logo | No generic palette; artifact validates. |

## Wave 3: production

| # | Agent | Objective | Boundary | Required evidence | Stop |
| ---: | --- | --- | --- | --- | --- |
| 13 | Message-spine architect | Resolve the evidence-bounded argument and section roles. | message-spine + tests/evals | audience, promise, mechanism, proof, action | Valid spine; unknowns explicit. |
| 14 | Opening writer | Write hero and opening credibility slots only. | copy generator/evals | source IDs, word budgets, banned-phrase check | Typed section candidates returned. |
| 15 | Problem/urgency writer | Write supported tension/why-now slots or omit them. | copy generator/evals | no invented urgency | Typed candidates or omission returned. |
| 16 | Exploration writer | Write choices, paths, use cases, or decision help. | copy generator/evals | three useful distinct choices | Typed candidates returned. |
| 17 | Mechanism/proof writer | Explain mechanism, evidence, and proof modules. | copy generator/evals | claims mapped to evidence | Typed candidates returned. |
| 18 | Team/CTA writer | Write role value and concrete next action. | copy generator/evals | CTA aligns with objective/motion | Typed candidates returned. |
| 19 | Copy/factuality editor | Remove filler, jargon, duplication, unsupported claims, and mismatch. | editor/validators/evals | before/after issues and evidence map | Copy passes all blocking validators. |

## Wave 4: integration and QA

| # | Agent | Objective | Boundary | Required evidence | Stop |
| ---: | --- | --- | --- | --- | --- |
| 20 | Spec/compiler/QA coordinator | Compile current revision, render, run fail-soft repair and full QA. | orchestrator, ExperienceSpec, renderer, tests/E2E | benchmark, QA, desktop captures, trace receipt | Handback is review-ready. |

## Manager-only seams

Only the Cursor manager may make cross-lane changes to:

- canonical worker/result types;
- `ExperienceSpecV2` schema;
- primary orchestrator/coordinator;
- `try-me-now-app.tsx` and shared workbench state;
- integration test fixtures;
- package scripts;
- final run status and handback;
- local commits.

## Agent output format

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
OBJECTIVE: <one line>
FILES: <changed files>
TESTS: <exact commands and outcomes>
EVIDENCE: <fixture/screenshot/trace paths>
CONTRACT: <typed artifact or interface affected>
CONCERNS: <bounded list>
STOP: <why the assigned work is complete or blocked>
```
