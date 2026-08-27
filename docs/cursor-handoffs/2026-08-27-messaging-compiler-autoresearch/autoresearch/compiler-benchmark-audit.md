# Messaging compiler benchmark audit

## Recommendation

**PASS for the benchmark and release gate.** The corrected runner now enforces two consecutive blocker-free current-tree evaluations at or above 90, persists the median and median absolute deviation used for retention decisions, and exits nonzero when the release gate fails.

## Independent evidence

- The benchmark and contract suites passed: 2 files and 31 tests.
- Two consecutive release evaluations scored `99.43`, with no blockers.
- The release summary reports `passed: true`.
- Every JSONL decision record includes `medianTotal`, `madTotal`, `retentionThreshold`, `evaluationKind`, and `decisionScope`.
- Mutation decisions are explicitly identified as fixture simulations. A simulated revert never changes the source tree.
- Seven fixtures cover launch, guide, align, product, event, sparse-brand, and no-evidence conditions.
- Determinism, privacy-safe serialization, mutation purity, deliberate degradation, and blocker rejection are covered by tests.
- The current benchmark reported p50 `0.12 ms`, p95 `0.23 ms`, and max `0.27 ms`, below the 250 ms budget.

## Release-gate behavior

`scripts/autoresearch/messaging-compiler/run-compiler-loop.mjs` emits the benchmark twice before evaluating fixture mutations. Both current-tree evaluations must have no blockers and score at least 90. A deliberately raised test threshold of 100 produced exit code 1 and `passed: false`; the threshold was then restored to 90 and the temporary failure records were removed.

## Residual limitations

1. `compiler-benchmark-runs.json` is a latest-run snapshot rather than an immutable history. The JSONL log is the append-only decision record.
2. `sourceSha` is the short Git HEAD. The final release evidence was regenerated after the implementation commit and now records `07a61dd`. Earlier JSONL rows retain their historical SHA by design.
3. This is a deterministic fixture benchmark. It is not a substitute for buyer review or production behavior monitoring.

## Final verdict

Approve the harness and current gate, subject to the normal full-suite, build, browser, privacy, and secret-scan release checks.
