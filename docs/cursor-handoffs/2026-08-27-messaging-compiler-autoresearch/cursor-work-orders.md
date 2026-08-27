# Cursor work orders

Cursor owns implementation. Use parallel internal agents for independent analysis and test authoring when available, but merge through one coordinator and keep the worktree coherent. Do not commit.

## Work order 1: canonical compiler contracts

Objective: add versioned evidence, strategy, evaluation, page-plan, and compiler-artifact contracts that reuse existing enums and schemas.

Allowed files:

- new files under `src/lib/generation/`;
- `src/lib/types.ts` only when a public or persisted type truly belongs there;
- focused tests beside the new contracts.

Requirements:

- adapters preserve source authority, confidence, allowed uses, and prohibited uses;
- artifact schemas reject duplicate IDs, dangling evidence refs, invalid selected IDs, and non-finite scores;
- public session payloads do not expose private compiler artifacts;
- versions are explicit and stable.

Stop when contract tests pass and no production path is changed.

## Work order 2: strategy candidate compiler and evaluator

Objective: produce three or four competing evidence-bounded strategies and select one deterministically before copy generation.

Allowed files:

- new compiler/evaluator files under `src/lib/generation/`;
- `message-spine.ts` and `production-message-spine.ts` for additive adapters;
- focused unit tests.

Requirements:

- candidates cover materially different supported angles, not headline variations;
- the score considers audience relevance, offer specificity, differentiation, evidence strength, narrative coherence, and CTA alignment;
- hard failures remove a candidate from selection;
- ties use a stable deterministic order;
- missing proof or urgency is omitted honestly;
- competitor-swappable language is penalized;
- the selected strategy can be mapped into the existing production argument slots.

Stop when deterministic fixtures prove candidate diversity, stable selection, and hard-failure behavior.

## Work order 3: production integration and trace

Objective: integrate the selected strategy into the existing production path and persist the full private decision receipt.

Allowed files:

- `session-production-engine.ts`;
- `generic-production-engine.ts` only where the artifact must flow through;
- `production-build-trace.ts`, `build-trace.ts`, and private trace tests;
- additive private persistence adapters if required.

Requirements:

- selected strategy, alternative scores, reason codes, compiler version, prompt versions, evidence refs, output digests, and timing reach BuildTrace;
- public payload shape remains compatible;
- trace failures remain fail-soft and nonblocking;
- raw evidence text and generated copy are not persisted in trace;
- stale revision and input fingerprint fencing remain intact.

Stop when trace round-trip tests show all candidates by digest and selected strategy by ID without leaking content.

## Work order 4: page plan and section quality

Objective: bind each selected section role to a distinct job in the chosen strategy and reject generic or repetitive candidates.

Allowed files:

- `section-writing-contract.ts`;
- `section-model-writer.ts`;
- `section-candidate-review.ts`;
- `section-claim-coverage.ts`;
- production engine integration and focused tests.

Requirements:

- each section contract receives only the strategy slots and evidence permitted for that role;
- candidate review detects duplicated claims, internal jargon, placeholder language, audience-free claims, offer-free claims, and unsupported superlatives;
- no section may be filled only to satisfy section count;
- safe omission remains valid;
- one bounded repair is allowed before deterministic fallback.

Stop when section fixtures reject generic copy and retain evidence-specific alternatives.

## Work order 5: controlled personalization patches

Objective: expose personalization as evidence-backed patches with a concise explanation of why each field changed.

Allowed files:

- `personalization-preview.ts` and tests;
- types required for private patch receipts;
- existing preview UI only if the explanation already has a clear home.

Requirements:

- the generic experience remains canonical;
- variants carry only changed fields, source refs, classification, and reason;
- no independent full-page regeneration;
- unsupported changes are omitted;
- changing only an account name is never enough to qualify as personalization;
- a visible explanation uses buyer-safe language and never exposes internal framework terms.

Stop when tests prove patch minimality, evidence binding, and no name-swap personalization.

## Work order 6: compiler benchmark and autoresearch runner

Objective: add a compiler-quality benchmark that measures message quality rather than only contract validity.

Allowed files:

- new scripts under `scripts/autoresearch/messaging-compiler/`;
- new fixture manifests under `tests/fixtures/messaging-compiler/`;
- new tests under `src/lib/generation/`;
- scoped experiment files under this handoff directory.

Requirements:

- start with at least seven deterministic fixtures: ADP launch, Apple guide, ServiceTitan align, product, event, sparse-brand, and no-evidence;
- structure supports expansion to 20 or more reviewed fixtures;
- fixture data stores facts, permitted inferences, prohibited claims, expected audience jobs, expected CTA logic, and acceptable strategy angles;
- no raw customer source body or secrets enter benchmark artifacts;
- runner records fixture IDs, aggregate scores, blockers, timing, digests, and concise notes;
- mutations exercise audience specificity, offer mechanism, strategy selection, claim deduplication, evidence tightening, CTA alignment, brand role reconciliation, image allocation, and timing;
- existing `autoresearch.md` and `autoresearch.jsonl` remain unchanged.

Stop when the baseline command is reproducible and at least one deliberately degraded candidate is rejected.

## Integration order

1. Work order 1.
2. Work orders 2 and 6 may proceed in parallel after contracts stabilize.
3. Work order 3 after strategy selection is stable.
4. Work orders 4 and 5 may proceed in parallel after integration.
5. Run focused tests, then full quality gates.

When done, write `cursor-implementation-report.md` in this directory with changed files, decisions, tests, known limitations, and exact follow-up recommendations. Do not claim completion from test names alone. Include command exit codes.

