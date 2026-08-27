# Cursor Work Orders

Execute in order. Commit each passing work order separately. Stop on a named blocker instead of broadening scope.

## Work order 1: BuildTrace and section provenance

Objective: make every production decision reconstructable from a private trace.

Primary files:

- `src/lib/types.ts`
- `src/lib/generation/experience-schema.ts`
- `src/lib/generation/generic-production-engine.ts`
- `src/lib/generation/session-production-engine.ts`
- `src/lib/telemetry-receipt-projection.ts`
- `src/lib/trace-store.ts`
- related tests

Required implementation:

- Add versioned BuildTrace, section trace, decision trace, quality trace, and timing types.
- Record framework ranking, wireframe ranking, message-spine version, section contract version, evidence refs, writer mode, prompt version, model, candidate/output digests, scores, reasons, fallbacks, and timings.
- Preserve operational receipt version 1 and public response shapes.
- Add deterministic digest helpers and privacy tests.

Pass evidence:

- schema round-trip and legacy decode tests
- deterministic hash tests
- stale-revision and retry idempotency tests
- negative tests for raw email, domains, URLs, copy, prompts, HTML, tokens, and credentials

Stop when the trace is typed, populated by current generation paths, private, and read back in tests.

## Work order 2: Semantic brand compiler, representative geometry, and global assets

Objective: convert source evidence into accurate semantic design behavior and unique imagery.

Primary files:

- `src/lib/brand-system.ts`
- `src/lib/brand-visual-evidence.ts`
- `src/lib/brand-intelligence.ts`
- `src/lib/integrations/brand-harvester.ts`
- `src/lib/generation/experience-template.ts`
- related fixtures and tests

Required implementation:

- Add evidence-backed semantic roles and selection reasons.
- Exclude temporary promotional and utility surfaces from dominant brand classification.
- Use representative distributions for radii, borders, shadows, typography, and density.
- Allocate substantive images globally with consume-once semantics.
- Preserve logo reuse and allow explicit decorative reuse.
- Remove independent renderer image re-ranking that can return the same asset repeatedly.
- Trace every applied brand role and asset allocation.

Pass evidence:

- multi-brand semantic palette tests
- representative radius tests with mixed `0`, moderate, and pill values
- promotional-overlay exclusion test
- no duplicate substantive asset test
- safe URL, delivery, crop, and broken-image tests
- partial-evidence provisional-render test

Stop when the renderer consumes one canonical brand system and allocation plan without company-specific code.

## Work order 3: Dedicated per-section writing engine

Objective: replace shared generic filler with evidence-bounded, section-specific writing.

Primary files:

- `src/lib/generation/message-spine.ts`
- `src/lib/generation/generic-production-engine.ts`
- current section writers
- `src/lib/integrations/openai.ts`
- `src/lib/orchestrator.ts`
- `src/lib/generation/production-draft-adapter.ts`
- related tests

Required implementation:

- Add versioned `SectionWritingContract` and prompt registry.
- Build one contract per selected section after wireframe lock.
- Run bounded parallel model generation, two candidates per section in one structured response.
- Add deterministic candidate evaluation and cross-section duplication/factuality review.
- Keep provider-free section-specific fallbacks for deadline and provider failure.
- Record the complete private provenance without logging raw provider content.
- Preserve the 60-second attempt cutoff and stale-revision fences.

Pass evidence:

- family and section-role coverage
- buyer, offer, and objective specificity fixtures
- evidence-ref resolution and unsupported-claim rejection
- duplicate/near-duplicate copy rejection
- banned internal phrase rejection
- model timeout, malformed response, quality rejection, and deterministic fallback tests
- latency tests proving bounded parallel behavior

Stop when every rendered section maps to one versioned contract and trace receipt.

## Work order 4: First-party private persistence and inspection

Objective: retain enough private evidence to diagnose a build by support reference.

Primary files:

- `src/lib/trace-store.ts`
- `src/lib/observability.ts`
- `src/lib/session-store.ts`
- database migrations
- existing trace inspection scripts
- server-only support inspection path
- related tests

Required implementation:

- Add additive versioned BuildTrace storage.
- Enforce retention, payload, event-count, latency, and idempotency bounds.
- Persist only after the corresponding session revision commits.
- Add a server-only CLI inspection command by support reference or trace ID.
- Render a concise timeline, decisions, evidence refs, brand-role selections, asset allocations, section provenance, fallbacks, and quality results.
- Keep failures nonblocking and privacy-safe.

Pass evidence:

- save/readback, duplicate event, failed compare-and-set, and stale revision tests
- retention and bounded-size tests
- safe failure when the private store is unavailable
- sanitized CLI fixture output

Stop when one test support reference reconstructs the complete private build timeline.

## Work order 5: PostHog behavior analytics linkage

Objective: make the product funnel and interaction path measurable without turning PostHog into a construction log.

Primary files:

- `src/lib/product-analytics-contracts.ts`
- `src/lib/product-analytics-client.ts`
- `src/lib/product-analytics-projection.ts`
- `src/lib/product-analytics.ts`
- `src/lib/posthog-config.ts`
- analytics and browser tests

Required implementation:

- Add or normalize events for domain stabilization, research start, recommendation viewed/selected, build start, provisional reveal, final reveal, section viewed, asset interaction, CTA interaction, analytics panel opened, claim started/completed, and recoverable failure.
- Include bounded section titles and selected value-prop labels instead of `Decision Lens N`.
- Open engagement analytics only after the visitor reaches the final section or explicitly opens it.
- Use a one-way correlation key for private trace joining.
- Keep session replay off by default unless the existing environment flag enables it. Preserve full text and input masking.
- Correct analytics documentation to match actual redaction and persistence behavior.

Pass evidence:

- PostHog projection and privacy-negative tests
- event idempotency and ordering tests
- final-section completion timing test
- no early analytics panel test
- accurate elapsed-time and sparse-state tests
- DNT, masking, replay-default, and nonblocking sink tests

Stop when behavior events answer how the product was used while private traces answer how the artifact was built.

## Work order 6: Generalized evaluator, integration, and evidence

Objective: prove the repaired engine across brand archetypes, families, failures, and timing budgets.

Primary files:

- brand-fidelity and visual evidence tests
- `tests/fixtures/brand-fidelity/`
- `tests/e2e/three-family-runtime-fixture.ts`
- Playwright visual and analytics specs
- package scripts and docs

Required implementation:

- Add generalized fixtures without company-specific conditionals.
- Score semantic color roles, geometry, typography, density, imagery uniqueness, copy specificity, evidence linkage, accessibility, and overflow.
- Return warnings and repair dimensions, never a hard visual render gate.
- Add deterministic visual manifests and BuildTrace fixtures.
- Capture desktop evidence for Launch, Guide, Align, partial evidence, and recoverable brand failure.
- Complete `cursor-handback.md` with commands, results, commits, evidence, known risks, and untouched unrelated files.

Pass evidence:

- all acceptance-matrix commands and hard blockers
- reproducible clean-checkout commands
- current commit and diff inventory
- serialized sanitized BuildTrace
- visual manifest and screenshots
- latency p50/p95 receipt

Stop when every acceptance item is met or explicitly reported as blocked with evidence.
