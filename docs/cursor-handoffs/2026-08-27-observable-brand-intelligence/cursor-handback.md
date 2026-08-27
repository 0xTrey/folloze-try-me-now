# Cursor Handback

Status: correction pass 3 complete, ready for independent Codex review

Branch: `codex/unified-microsite-builder`, seventeen commits ahead of
`origin/production`, of which two are the Codex correction briefs.
Nothing was pushed, deployed, or published.

## Correction pass 3 (`codex-correction-pass-3.md`)

Commit: branch tip, "Allow the two synthetic redaction fixtures in the history scan".

The release gate left open by correction pass 2 is closed. A repository-root
`.gitleaks.toml` extends the complete default rule set and adds two allowlist
entries, each requiring an `AND` match on the exact commit
`c70353b8a00c85431afa347f9d7c6ec5f8e4e8f0`, the exact test path, and the exact
detector rule:

- `stripe-access-token` and `generic-api-key` in `src/lib/build-trace.test.ts`
- `generic-api-key` in `src/lib/posthog-boundary.test.ts`

No default rule was weakened, disabled, or replaced, and nothing is allowed in
any other path, commit, or in current file content. Both entries cover the same
single unpushed commit, whose fixtures are synthetic secret-shaped strings that
exist to prove redaction works; neither is a credential and neither is read by
any code path.

Narrowness was checked rather than assumed: scanning a scratch directory with
this configuration and the same fake key, once at
`src/lib/build-trace.test.ts` and once at an unrelated path, still reports both,
because neither carries the allowlisted commit.

### Correction pass 3 acceptance results

| Command | Result | Counts or notes |
| --- | --- | --- |
| `gitleaks git . --log-opts='--all' --redact=100 --no-banner` | Pass, exit 0 | 249 commits, ~13.12 MB, no leaks found |
| `npm run lint` | Pass | 0 errors, 3 warnings, all pre-existing in `src/lib/cloudflare-upload-contract.test.ts` |
| `npm run typecheck` | Pass | Clean |
| `npm test` | Pass | 126 files, 1,404 tests, 0 failures |
| `git status --short` | Expected | Only the three unstaged `output/product-owner-remediation/` PNGs, unchanged by this pass |

This pass changed no product code and no test. Nothing was pushed, deployed, or
published, and no Git history was rewritten.

## Correction pass 2 (`codex-correction-pass-2.md`)

Commit: branch tip, "Make asset placement, identification, and section provenance exact".
One logical pass, committed once.

### Corrections

| Item | Change | Regression evidence |
| --- | --- | --- |
| 1 exact asset placement | `createPlanAssetAllocator` in `src/lib/generation/experience-template.ts` is now a lookup, not a queue: a media location claims one compiled `sectionId` plus semantic role, and a location without its own placement renders the designed treatment instead of a spare. Every rendered figure carries `data-asset-section`, so the DOM states which compiled section it is showing. The flow branches and region markup are built lazily, because eagerly building the branch that is thrown away used to consume placements the rendered branch then had to do without | `src/lib/generation/experience-template.test.ts` (placements supplied in reverse renderer order still land section-for-section; a section without a placement takes no other section's image; every substantive image appears once), `src/lib/session-store.test.ts` (public projection still excludes `buildTrace`, `assetPlan`, `placements`, `semanticRole`, `treatments`) |
| 2 email-free identification | `sanitizePostHogCapture` in `src/lib/posthog-config.ts` no longer preserves `$set.email`. Emails, links, hosts, and support references are redacted in every payload including `$identify`, and `$set`/`$set_once` are reduced to the single allowed `identity_source` property | `src/lib/posthog-config.test.ts` (hostile identify payload; hosts, links, and support references), `src/lib/posthog-boundary.test.ts` (the real claim identify call carries an opaque `tmv_` id and `identity_source` only, and survives `before_send` unchanged; a failed and retried claim produces no identify until success) |
| 3 truthful section provenance | The build trace records `model` for a section a provider actually wrote and kept, with `model_candidates_thinned` in the selection reasons when part of its field was discarded; a run where nothing survived normalization is a `malformed_response` and stays deterministic. `normalizeModelCandidate` rejects a candidate citing any evidence reference outside its contract instead of filtering it, including references on choices, and validates `omissionReason` against its declared values | `src/lib/generation/section-model-writer.test.ts` (in-contract accept, out-of-contract reject at both levels, unknown omission reason reject), `src/lib/generation/session-production-engine.test.ts` (writer mode per section, thinned-field receipt, out-of-contract candidate leaves the section deterministic with the reference absent from page and trace, unknown omission reason absent from page and trace) |
| 4 two-width DOM matrix | `tests/e2e/brand-archetype-fidelity.spec.ts` runs every archetype and family at 1280 and 1440 pixels, keeps the computed geometry, typography, colour, imagery, and warning checks, adds a horizontal-overflow assertion, and asserts each rendered image sits in the compiled section it is labelled with | `tests/e2e/brand-archetype-fidelity.spec.ts` — 36 desktop tests (6 archetypes × 3 families × 2 widths) |

### Behaviour note on starting-point panels

Under exact claiming, a panel showing an empty slot while a later panel holds
the only illustrated one would hide the page's imagery behind a closed tab. The
renderer therefore orders its starting-point panels so slots the plan filled are
shown first, in compiled slot order. Which asset a slot holds is never
reconsidered: the binding of asset to section stays exactly as compiled and is
stated in the DOM.

### Correction pass 2 acceptance results

| Command | Result | Counts or notes |
| --- | --- | --- |
| `npm run lint` | Pass | 0 errors, 3 warnings, all pre-existing in `src/lib/cloudflare-upload-contract.test.ts` |
| `npm run typecheck` | Pass | Clean |
| `npm test` | Pass | 126 files, 1,404 tests, 0 failures |
| `npm run benchmark:preview` | Pass | 5 files, 33 tests |
| `npm run qa` | Pass | Lint, types, tests, Turbopack build, webpack build |
| `npm run qa:visual:folloze` | Pass | 3 desktop specs |
| `npm run test:e2e -- --project=desktop` | Pass | 70 tests (was 52; the archetype matrix doubled to 36) |
| `npm run test:e2e -- --project=mobile` | Pass | 52 passed, 18 skipped (desktop-only specs) |
| `gitleaks git . --log-opts='--all' --redact=100 --no-banner` | 2 findings, both synthetic | Closed by correction pass 3; see below |

Logs: `output/observable-brand-intelligence/pass2-*.log` (untracked; `*.log` is
gitignored).

The two gitleaks findings are the hostile-input fixtures committed in `c70353b`
that prove redaction works: a fake Stripe-shaped key in
`src/lib/build-trace.test.ts` and a fake correlation key in
`src/lib/posthog-boundary.test.ts`. Neither is a credential and neither is read
by any code path. Both lines now carry `gitleaks:allow`, which keeps future
scans of those lines clean; the historical blobs in `c70353b` still match, and
clearing them would need a history rewrite, which this pass is not permitted to
do. Correction pass 3 closed this with a commit-scoped allowlist instead of a
rewrite, so the exact release command now exits 0.

### Residual risks from correction pass 2

1. **A section reported as `model` can still have been reshaped downstream.** The receipt compares the delivered copy against the provider candidate, so a section the factuality editor rewrote reports as deterministic; a section it accepted unchanged reports as model. A partial rewrite is not distinguishable in the receipt.
2. **Panel ordering depends on the plan, not on the copy.** Two plans that fill different slots put the same starting-point copy in a different panel position. The copy itself is unchanged and the section binding is exact, but a screenshot diff across two brands will show panels in different orders.
3. **The overflow assertion ignores anything inside a scrollable ancestor.** A tab strip is allowed to scroll sideways, so a genuine layout break confined to a scrolling container would not fail the matrix.

## Correction pass 1 (`codex-correction-pass-1.md`)

Commit: `c70353b` — "Close the Codex correction pass on observable brand intelligence".
48 files changed, +4,445 / −698. One logical pass, committed once.

### P1 corrections

| Item | Change | Regression evidence |
| --- | --- | --- |
| P1-1 recursive trace schema | `src/lib/build-trace-schema.ts` holds one recursive schema for every nested shape; `src/lib/build-trace.ts` decodes and privacy-scans through it, so an unknown key at any depth is rejected rather than carried | `src/lib/build-trace.test.ts` (unknown key at `sections.0.quality.note`, nested unknown keys, fragment validation) |
| P1-2 authoritative asset plan | Allocation happens once in `src/lib/asset-allocation.ts`; the full plan stays private behind `privateAssetAllocationFor` in `src/lib/brand-system.ts`, and the renderer consumes only the public `AssetRenderPlan` threaded from the engine through `src/lib/orchestrator.ts`. Required placements (hero) can no longer be consumed by a spare claim, and URL safety now covers reserved IPv4/IPv6 forms | `src/lib/asset-allocation.test.ts`, `src/lib/generation/experience-template.test.ts`, `src/lib/image-delivery.test.ts`, `tests/e2e/brand-archetype-fidelity.spec.ts` |
| P1-3 section writers in production | `applyDedicatedSectionWriters` runs inside `generic-production-engine.ts` as a `section-writers` stage; model copy passes hard character/candidate bounds, markup rejection, a CTA allowlist, and a wall-clock deadline that a provider ignoring its abort signal cannot outlast. Claim detection widened from numbers to a full taxonomy in `src/lib/generation/section-claim-coverage.ts` | `src/lib/generation/section-model-writer.test.ts` (20 tests), `src/lib/generation/section-claim-coverage.test.ts`, `src/lib/generation/session-production-engine.test.ts` (model copy proven in rendered HTML and in the private receipt) |
| P1-4 commit-fenced persistence | `saveBuildTrace` left the in-flight assembly path; `src/lib/build-trace-retention.ts` persists only after the session commit wins its compare-and-set for that revision and attempt. Expired traces are purged by the existing maintenance route. `build-trace:inspect --json` now emits an allowlisted projection instead of the stored object | `src/lib/build-trace-retention.test.ts`, `src/app/api/maintenance/trace-cleanup/route.test.ts`, `src/lib/build-trace-store.test.ts` (projection drops source text, markup, hostnames, credentials) |
| P1-5 behavior-only PostHog | Value-proposition labels and section titles left the projections and contracts; `src/lib/posthog-payload.ts` filters every capture to allowlisted keys and token-shaped values; native exception capture is off | `src/lib/posthog-boundary.test.ts` (13 tests), `src/lib/product-analytics-projection.test.ts`, `src/lib/product-analytics.unified.test.ts`, `src/lib/posthog-config.test.ts` |
| P1-6 archetype-by-family DOM fidelity | `archetypeRuntimeFixture` in `tests/e2e/three-family-runtime-fixture.ts` compiles each brand archetype into a real session and profile; the new spec measures computed DOM styles rather than scoring intent | `tests/e2e/brand-archetype-fidelity.spec.ts` — 18 desktop tests (6 archetypes × 3 families) asserting button and card radius, border width, shadow, font families, heading weight, action and ink colour, unique substantive imagery, and designed treatments for unfilled slots |

### P2 hardening

All five code items are complete; the sixth is a test-run item and both Playwright projects were run.

- **Receipt outcomes and collection bounds.** `model_partial` was declared but never emitted, so a thinned candidate field read as a clean model win. The writer now distinguishes the two, the engine accepts both, and tests assert the whole vocabulary plus one receipt per contract regardless of provider behaviour.
- **Multi-brand deterministic hashes.** Four brand variants (baseline, recoloured, regeometried, retyped) each compile twice: identical digests within a brand, distinct role digests across brands.
- **Exact section timing.** Section receipts previously copied the whole-session window, which made every section look as slow as the entire build. `sectionWindows` now uses the writer's own per-section duration, falling back to the producing worker's window. The test proves the slow section's span exceeds the deliberate delay while the others stay under it.
- **Trace ID and support reference resolve together.** The build trace was filed under an id derived from the session id, while the support reference quoted to a visitor derives from `traceIdForSession`. The session's operational trace id is now threaded into the compile, and the test saves a compiled trace then resolves it by both keys.
- **Claim-state identification boundary.** A test walks preview → attempt → failure → retry → success and asserts no identification before the claim completes, no email or domain in any capture or identify argument, and only `identity_source` on the identify call.

### Correction-pass acceptance results

| Command | Result | Counts or notes |
| --- | --- | --- |
| `npm run lint` | Pass | 0 errors, 3 warnings, all pre-existing in `src/lib/cloudflare-upload-contract.test.ts` |
| `npm run typecheck` | Pass | Clean |
| `npm test` | Pass | 126 files, 1,394 tests, 0 failures |
| `npm run benchmark:preview` | Pass | 5 files, 33 tests |
| `npm run qa` | Pass | Lint, types, tests, Turbopack build, webpack build |
| `npm run qa:visual:folloze` | Pass | 3 desktop specs |
| `npm run test:e2e -- --project=desktop` | Pass | 52 tests (was 34; the 18 new archetype tests) |
| `npm run test:e2e -- --project=mobile` | Pass | 34 passed, 18 skipped (desktop-only specs) |
| `gitleaks git . --log-opts='--all' --redact=100 --no-banner` | Pass | 244 commits, ~12.91 MB, no leaks found |

Playwright ran against a local production build (`npx next start` on `127.0.0.1:3000`), reused by the config, because an operator dev server holds Next's single-instance lock on 3001.

### Public-contract changes in this pass

- `BrandSystemV2` no longer exposes the asset allocation plan. Callers that need it use `privateAssetAllocationFor(brand)`; the renderer takes an `AssetRenderPlan`.
- `recommendation_viewed` and `recommendation_selected` no longer carry `value_prop_label`; `section_viewed`, `asset_interaction`, and `analytics_panel_opened` no longer carry `section_title`. Any dashboard reading those properties must move to the semantic tokens.
- `compileSessionProductionPage` accepts optional `traceId`, `attemptId`, `sectionModelClient`, and `sectionWriterDeadlineMs`. All are optional and the deterministic path is unchanged without them.
- `build-trace:inspect --json` emits a projection, not the stored trace.

### Residual risks from this pass

1. **`model_partial` depends on schema-level rejection, not quality review.** A candidate dropped by the factuality or duplication reviewer still reports as `model`, because selection runs after the attempt outcome is fixed. The selection reasons carry that detail instead.
2. **The archetype spec measures the compiled fixture, not a live session.** It renders a real compiled page in a real browser, but the session and brand profile are constructed in-process, so upstream extraction behaviour is still only covered by unit tests.
3. **Section timing resolution is millisecond ISO strings.** Sub-millisecond deterministic sections collapse to a zero-length window, which reads correctly as "no measurable work" but cannot rank fast sections against each other.
4. **The trace-id threading is only wired through the orchestrator's compile path.** A caller that invokes `compileSessionProductionPage` directly without `traceId` still gets a session-derived id, which will not match a quoted support reference.

### Boundaries observed in this pass

No push, deploy, publish, external-system mutation, production-data access, or secret inspection occurred. The three modified PNGs under `output/product-owner-remediation/` were never staged, reverted, or regenerated by this pass and remain unstaged.

---

## Original build (work orders 1–6)

## Commits

| Work order | Commit | Summary |
| --- | --- | --- |
| 1 | `7a43194` | Private BuildTrace contract, deterministic digests, privacy guard, and population from the production path |
| 2 | `bab842b` | Semantic brand roles, representative geometry, and global one-use asset allocation |
| 3 | `548a27e` | Dedicated per-section writing contracts, prompt registry, bounded parallel writers, and candidate review |
| 4 | `f4a88c8` | Private trace persistence with retention and revision fencing, plus support-reference CLI inspection |
| 5 | `c84c675` | Behavior-only PostHog funnel coverage joined by a one-way correlation digest |
| 6 | `9fde596` | Generalized fail-soft brand-fidelity evaluator and archetype fixtures |
| 6 | `2f2e376` | Server-only correlation module (webpack build fix), e2e assertion updates, and the evidence package |

`2d87eaf` and `2529bd8` were already on the branch when this work started.

## Files changed

53 files, +11,311 / −100 against `origin/production`.

New production modules:

- `src/lib/build-trace.ts`, `src/lib/build-trace-store.ts`
- `src/lib/brand-semantics.ts`, `src/lib/asset-allocation.ts`
- `src/lib/brand-fidelity-evaluator.ts`
- `src/lib/analytics-correlation.ts`
- `src/lib/generation/production-build-trace.ts`
- `src/lib/generation/section-writing-contract.ts`
- `src/lib/generation/section-candidate-review.ts`
- `src/lib/generation/section-model-writer.ts`
- `db/migrations/010_create_try_me_build_traces.sql`
- `scripts/inspect-build-trace.mjs`, `scripts/lib/build-trace-timeline.mjs`

Modified production modules: `src/lib/brand-system.ts`,
`src/lib/generation/generic-production-engine.ts`,
`src/lib/generation/experience-template.ts`, `src/lib/orchestrator.ts`,
`src/lib/product-analytics-contracts.ts`,
`src/lib/product-analytics-projection.ts`, `package.json`.

New or updated tests: eleven unit suites, three desktop e2e specs, and
`tests/fixtures/brand-fidelity/archetypes.ts`.

Documentation: `docs/product-analytics-and-tracing.md` gained a behavior-only
boundary section, the correlation-key explanation, and the BuildTrace inspection
command.

## Acceptance results

| Command | Result | Counts or notes |
| --- | --- | --- |
| `npm run lint` | Pass | 0 errors, 3 warnings, all pre-existing in `src/lib/cloudflare-upload-contract.test.ts` |
| `npm run typecheck` | Pass | Clean |
| `npm test` | Pass | 123 files, 1,239 tests, 0 failures |
| `npm run benchmark:preview` | Pass | 5 files, 33 tests |
| `npm run qa` | Pass | Lint, types, tests, Turbopack build, and webpack build |
| `npm run qa:visual:folloze` | Pass | 3 desktop specs |
| `npm run test:e2e -- --project=desktop` | Pass | 34 tests |
| `gitleaks git . --log-opts='--all' --redact=100 --no-banner` | Pass | 241 commits, ~12.84 MB, no leaks found |

Logs are in `output/observable-brand-intelligence/`: `qa.log`, `unit-tests.log`,
`benchmark.log`, `visual.log`, `e2e-desktop.log`, `gitleaks.log`.

### Environment note on the e2e runs

A Next dev server the operator started earlier held Next's single-instance lock
on port 3001, so Playwright's `webServer` could not start its own. Rather than
kill the operator's process, the desktop runs were served from the production
build with `npx next start --hostname 127.0.0.1 --port 3000`, which Playwright
reused. Every desktop test passed against that server. A clean checkout with no
dev server running needs no such step.

## Evidence

All artifacts are produced by the production path, not written by hand.
Regenerate with `EMIT_BUILD_TRACE_EVIDENCE=1 npx vitest run scripts/emit-build-trace-evidence.test.ts`.
Without the environment variable the same test runs its assertions without
writing, so a normal `npm test` keeps the emitter honest.

- Serialized BuildTrace: `output/observable-brand-intelligence/build-trace.json`
- Support-CLI rendering: `output/observable-brand-intelligence/build-trace-timeline.txt`
- Support reference: `TMN-6D58DEA9181B`
- Brand decision and asset allocation manifest, with fidelity scores:
  `output/observable-brand-intelligence/brand-and-asset-manifest.json`
- Latency receipt: `output/observable-brand-intelligence/latency.json`
  (20 samples, p50 2.4 ms, p95 4.4 ms, max 4.6 ms for a fixture compile
  including trace assembly; the emitter asserts p95 under the 500 ms budget)
- PostHog projection fixtures: `src/lib/product-analytics-projection.test.ts`
  and the full-vocabulary batch in `src/lib/product-analytics.unified.test.ts`
- Privacy-negative results: `src/lib/build-trace.test.ts`,
  `src/lib/build-trace-store.test.ts`, and the privacy-boundary case in
  `src/lib/generation/production-build-trace.test.ts`
- Visual evidence: desktop screenshots regenerated by
  `tests/e2e/product-owner-remediation-visuals.spec.ts` under
  `output/product-owner-remediation/`
- Archetype matrix: `output/observable-brand-intelligence/README.md`

The emitted trace carries 6 sections, 9 fidelity dimensions, and 2 fallbacks.
Grepping it for company names, URLs, or `@` returns nothing.

## Privacy declaration

- No credential was read or written. No `.env`, keychain entry, or token was
  accessed. The trace store and CLI read `DATABASE_URL` from the environment
  and were never run against a live database.
- No raw private material can reach PostHog. Each unified event declares an
  allowlist of properties, and an unlisted or identifying property throws rather
  than being silently dropped. Section titles and value-proposition labels were
  removed entirely in the correction pass; `src/lib/posthog-payload.ts` now
  filters every capture down to allowlisted, token-shaped values.
- The funnel-to-trace join is one-way. `correlation_key` is a salted SHA-256
  digest of the server trace ID, so an analytics reader cannot recover the trace
  ID, session ID, or support reference from it.
- No trace endpoint was added. The BuildTrace has no route, no public payload
  field, and no client import; `src/lib/analytics-correlation.ts` was split out
  precisely so the browser bundle never pulls trace machinery in.
- `findBuildTracePrivacyViolations` runs before every persistence write and
  before the evidence emitter writes a file. A violation is a normal rejection
  return, never an exception that could interrupt a build.

## Unrelated work preserved

Correction pass 2 did not stage, revert, or overwrite any of the three PNGs
under `output/product-owner-remediation/`. They remain modified and unstaged,
exactly as found.

The two pre-existing modified PNGs were not staged, reverted, or overwritten:

- `output/product-owner-remediation/evidence-backed-recommendations.png`
- `output/product-owner-remediation/no-evidence-free-form.png`

A third file in that directory,
`output/product-owner-remediation/partial-unavailable-brand-fallback.png`, is
now also modified. It is regenerated by
`tests/e2e/product-owner-remediation-visuals.spec.ts`, which the required
`npm run test:e2e -- --project=desktop` command runs. All three remain unstaged
and uncommitted, exactly as they were found.

## Known risks and skipped checks

1. ~~**Stage timings are coarse.**~~ Closed by the correction pass for section
   receipts, which now carry each section's own window. Stage-level timings
   still report the compile window they were measured over.
2. **The persistence path is untested against a real database.** The store runs
   in memory under test and Neon Postgres in production. Migration 010 has not
   been applied anywhere. Someone must run `npm run db:migrate:leads` against
   the target database and confirm the table before traces will persist.
3. **The model-backed section writer has no configured provider.** The bounded
   parallel writer, evaluator, and duplication review are exercised against a
   fake client. The deterministic fallback path is what production uses today,
   so provider-specific failure modes are unproven in a live run.
4. **Fidelity dimensions are unweighted.** The report averages nine dimensions
   equally, so a serious accessibility failure and a minor typography gap move
   the headline score the same amount. The per-dimension scores and
   `repairDimensions` are the reliable signal; the aggregate is indicative.
5. **The latency receipt is a fixture measurement.** It reflects deterministic
   compilation with no provider calls or network, so it validates the trace
   assembly budget and nothing about real end-to-end generation time.
6. **The 15-second provisional and 55-second final targets (P3-06) were not
   measured.** Both require a live provider run, which is outside the no-external-
   systems boundary. `npm run benchmark:preview` passes, but it does not produce
   those two figures.
7. ~~**Mobile Playwright was not run.**~~ Run in the correction pass: 34 passed,
   18 skipped (desktop-only specs).
8. **Three e2e assertions were updated, not weakened.** They previously asserted
   a fixed count of rendered images, which the fixtures could only satisfy by
   repeating one image across slots. They now assert the stronger invariant:
   each substantive image appears at most once per document, and slots the
   allocator cannot fill honestly carry a designed non-image treatment. Both the
   old and new forms fail if imagery breaks; only the new one fails if imagery
   repeats.

## External actions

No push, deploy, publish, GitHub mutation, Vercel mutation, PostHog mutation, or
production-data mutation occurred. No external system was contacted. The only
process started was a local `next start` on `127.0.0.1:3000` to serve the e2e
suite; it can be stopped freely.
