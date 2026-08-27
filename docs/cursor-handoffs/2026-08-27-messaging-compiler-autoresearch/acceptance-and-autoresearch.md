# Acceptance and autoresearch contract

## Score

Score every retained candidate from 0 to 100. Each dimension is worth 25 points.

### Buyer specificity and evidence

- names the actual buyer role and owned job;
- names the promoted offer or supported category;
- factual claims resolve to allowed evidence;
- copy is not competitor-swappable;
- unsupported facts are omitted.

### Narrative coherence

- one strategy governs the page;
- tension, promise, mechanism, proof, objections, and CTA connect;
- every section performs a distinct job;
- claims are not duplicated across sections;
- the CTA resolves the decision framed by the page.

### Brand and composition fidelity

- verified identity and logo are preserved;
- semantic color roles, typography, geometry, and buttons remain evidence-backed;
- first-party imagery is purposeful and allocated once per semantic role;
- wireframe selection remains deterministic;
- the renderer receives semantic content, not arbitrary HTML or CSS.

### Reliability and honesty

- no placeholders, invented metrics, identity swaps, or leaked internal labels;
- no dangling evidence references;
- private compiler data stays private;
- stale revisions cannot overwrite newer work;
- shell, provisional, and final timing remain inside the existing contract.

## Hard blockers

Any blocker forces a revert regardless of score:

- wrong company identity;
- invented claim, customer proof, metric, deadline, or persona;
- unresolved evidence reference;
- generic recommendation presented as researched truth;
- broken, duplicate, unsafe, or cross-origin image outside existing policy;
- raw email, URL, domain, evidence text, copy, token, trace ID, or support reference sent to PostHog;
- public exposure of private compiler artifacts;
- stale revision overwrite;
- provider work continuing past the generation deadline;
- required test, typecheck, build, privacy, or secret-scan failure.

## Experiment loop

1. Capture a clean baseline from the current branch.
2. Run one bounded mutation at a time.
3. Score all fixtures and record blockers.
4. Before three completed experiments, retain only a strict score improvement.
5. After three completed experiments, retain only when the score is greater than `median + 1.4826 * MAD`.
6. Revert a non-improving mutation without weakening tests.
7. Stop after five consecutive reverts.
8. Declare acceptance only after two consecutive blocker-free runs scoring at least 90.

The scoped experiment log belongs at:

`docs/cursor-handoffs/2026-08-27-messaging-compiler-autoresearch/autoresearch/compiler-autoresearch.jsonl`

Each record contains only:

- experiment ID and timestamp;
- source SHA and candidate digest;
- mutation name;
- fixture IDs;
- four dimension scores and total;
- blocker codes;
- p50 and p95 timing;
- keep or revert decision;
- concise rationale.

## Required commands

Cursor runs focused tests during implementation. Codex independently runs the final gates:

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:preview
npm run autoresearch:three-family
npm run build
npm run build:webpack
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=mobile
npm run qa:visual:folloze
```

Codex also runs the new compiler benchmark and full-history secret scanning. Any intentional skip must be explained in the acceptance report.

## Acceptance evidence

The final report must include:

- accepted SHA;
- clean-path status excluding the three unrelated PNG modifications;
- fixture-by-dimension score table;
- hard-blocker result;
- selected strategy receipt for at least three fixtures;
- one example of a rejected degraded candidate;
- personalization patch receipt;
- p50 and p95 shell, provisional, compiler, and final timings;
- focused and full QA command receipts;
- secret-scan result;
- known limitations and deferred infrastructure work.

