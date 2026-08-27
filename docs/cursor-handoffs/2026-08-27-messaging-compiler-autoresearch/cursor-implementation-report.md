# Messaging compiler implementation report

Covers the bounded vertical slice (WO1–WO6) and the correction pass that closed
three independently verified release gaps. Nothing was committed, pushed, or
deployed. The three PNGs under `output/product-owner-remediation/` were already
modified when this work started and were not touched in the correction pass.

## What the correction pass changed

### 1. Production integration cover for the compiler

`src/lib/generation/messaging-compiler-production.test.ts` (new, 8 tests) runs
everything through `compileSessionProductionPage` and reads the rendered HTML.
It asserts the compiler artifact passes its own validation, that the selected
strategy is `strategy-upside` out of four evaluated candidates, that every
rendered section appears in the page plan holding exactly one job no other
section holds, and that the tension the selected strategy took from researched
evidence reaches both the section body and the rendered page.

The material-control proof is differential. The same session compiled with and
without one researched fact (`ev-approval-queue`) keeps the same route, the same
section, and the same headline, and changes only the compiled tension sentence:
with the evidence the page says "Acme published that operations teams wait three
days for a workflow approval decision"; without it, it falls back to the route's
own status quo. Nothing about that difference comes from a CTA phrase.

The fail-soft case uses an offer that names nothing ("our platform"), so every
candidate fails `offer_identity_missing`, no artifact is produced, and the test
asserts the receipt is absent, the trace carries no messaging decision, the
outcome is still `production-page`, the section roles are identical to the
compiled run, and every section still has a body.

To make that assertable, `GenericProductionResultBase` now carries an optional
private `messagingCompiler` receipt beside `buildTrace`. It is a sibling of the
trace, not part of `artifact.value`; one test asserts ledger claim text never
reaches the page or the trace.

### 2. Evidence binding audit in `productionArgumentFromStrategy`

The defect: tension took the union of the baseline **promise and mechanism**
refs, and why-now took the baseline **promise** refs. Those slots were citing
evidence that had nothing to do with what they assert.

Now the mapping splits by who wrote the slot:

- **Tension and why-now** are angle-authored, so they bind only to evidence the
  selected strategy actually referenced, that the ledger permits for an urgency
  claim (`allowedUses` includes `urgency` and the item may carry a declarative
  claim), and that shares at least two subject terms with the directive. A
  rewritten optional slot that earns nothing is dropped, which lets the section
  that would have argued it omit or fall back. A slot whose wording the strategy
  left at the route's own keeps the baseline refs, because it is still the claim
  the reconciler supported.
- **Proof and objection** keep the refs the reconciler resolved for those exact
  slots. They were never cross-wired, and those refs live in the live-brief ref
  space rather than the ledger's. Re-deriving them from ledger ids would judge
  one system's citations by another's rules and put ids into the spine the
  section evidence set cannot resolve. I tried the stricter version and it
  dropped `mechanism`, `use-cases`, and `proof` out of the locked launch plan,
  which is a regression, not a tightening. What the proof slot does now carry is
  the strategy's own proof unknown, so a writer treats proof as a question to
  raise even where the reconciler resolved refs.
- **Audience, promise, mechanism, next action** keep their own same-slot refs;
  the strategy restates the subject the reconciler already supported there.

Citation matching uses a dedicated term set (length > 4, plurals folded) with a
two-term threshold, matching the copy reviewer's existing rule. The single-term
`sharesTerm` helper was letting a word like "every" bridge a slot to unrelated
evidence.

Regression tests in `message-strategy-compiler.test.ts` cover: base refs kept
for unchanged wording, a rewritten tension bound only to evidence about that
tension, no slot receiving promise or mechanism refs it did not earn, a tension
dropped when its referenced evidence is about something else, a why-now dropped
when its only support may not carry an urgency claim, the proof unknown, and a
dangling referenced id ignored.

### 3. Autoresearch runner: release gate, median, and MAD

`scripts/autoresearch/messaging-compiler/run-compiler-loop.mjs` now runs in two
phases. First the release gate: the current source tree is scored twice from two
independent benchmark emissions, and both must be blocker-free at or above 90.
The command exits non-zero when they are not, and both evaluations are written
to the log as `evaluationKind: "release-evaluation"`. Then the bounded mutation
experiments, each recorded with `evaluationKind: "benchmark-simulation"` and a
`decisionScope` that states in the record itself that a revert discards the
simulated candidate and changes nothing in the source tree. Every record now
persists `medianTotal`, `madTotal`, and the `retentionThreshold` those two
imply, so a decision can be re-derived from the log.

The runner opens only `compiler-autoresearch.jsonl` under this handoff's
`autoresearch/` directory. The legacy three-family log lives under
`docs/cursor-handoffs/2026-08-23-three-family-production-system/evidence/` and
has its own runner; it was not read or written.

Gate failure was verified by temporarily raising the bar to 100: the command
exited 1 with `"passed": false` and the stderr line. The bar was restored to 90
and the records from that verification run were removed from the log.

## Changed files

Modified:

- `src/lib/generation/message-strategy-compiler.ts`: per-slot evidence binding,
  citation term matching, proof unknown propagation
- `src/lib/generation/message-strategy-compiler.test.ts`: evidence-binding
  regressions
- `src/lib/generation/generic-production-engine.ts`: private
  `messagingCompiler` receipt on both result paths
- `src/lib/generation/session-production-engine.ts`: passes the ledger into the
  argument mapping
- `scripts/autoresearch/messaging-compiler/run-compiler-loop.mjs`: release gate,
  median/MAD persistence, simulation semantics

New:

- `src/lib/generation/messaging-compiler-production.test.ts`

Carried in from the vertical slice (WO1–WO6): `messaging-compiler-contracts.ts`,
`message-strategy-compiler.ts`, `messaging-compiler-benchmark.ts` and their
tests, `tests/fixtures/messaging-compiler/`, plus edits to `build-trace.ts`,
`build-trace-schema.ts`, `production-build-trace.ts`, `section-writing-contract.ts`,
`section-candidate-review.ts`, `section-claim-coverage.ts`,
`personalization-preview.ts`, and `package.json`.

## Commands and results

```
npx vitest run src/lib/generation/messaging-compiler-production.test.ts \
  src/lib/generation/message-strategy-compiler.test.ts \
  src/lib/generation/messaging-compiler-contracts.test.ts \
  src/lib/generation/messaging-compiler-benchmark.test.ts \
  src/lib/generation/session-production-engine.test.ts \
  src/lib/generation/production-build-trace.test.ts \
  src/lib/build-trace.test.ts
→ 7 files passed, 183 tests passed

npx tsc --noEmit
→ clean, exit 0

npx eslint .
→ 0 errors, 3 warnings (all pre-existing, in src/lib/cloudflare-upload-contract.test.ts)

npx vitest run
→ 130 files passed, 1494 tests passed (baseline before this work: 129 files, 1486 tests)

npm run benchmark:preview
→ 5 files passed, 33 tests passed

npm run autoresearch:messaging-compiler
→ exit 0; release totals [99.43, 99.43], medianTotal 99.43, madTotal 0, passed: true
→ 7 experiments; stopReason "stopped after 5 consecutive reverts"

npm run build
→ Next.js production build completed
```

Release gate failure path, verified then reverted:

```
# RELEASE_SCORE temporarily 100
node scripts/autoresearch/messaging-compiler/run-compiler-loop.mjs
→ exit 1; "passed": false
→ stderr: Release gate failed: 2 consecutive blocker-free evaluations at or
  above 100 are required, observed [99.43,99.43].
```

## Known limitations

- `npm run autoresearch:three-family` passes the current manifest at 100. Its
  deliberate `sparse-asset` mutation reports `broken_asset`, which confirms the
  legacy harness still rejects that degradation.
- The E2E specs were not re-run in this correction pass, because
  `product-owner-remediation-visuals` regenerates the three PNGs that were to be
  left alone. They passed in the earlier pass (70 desktop, mobile, visual QA).
- `familyArgument` in `session-production-engine.ts` still gives its own tension
  and why-now the baseline promise and mechanism refs. That is the deterministic
  path that predates the compiler and defines the locked-family expectations;
  changing it is a separate piece of work with its own regression surface.
