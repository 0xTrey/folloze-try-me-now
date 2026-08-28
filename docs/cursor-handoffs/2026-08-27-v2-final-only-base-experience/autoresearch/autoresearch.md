# V2 base-experience autoresearch

## Objective

Optimize one final-only Product/Solution base experience for buyer specificity, evidence trust, argument quality, brand fidelity, and reliable completion within 60 seconds.

## Fixed corpus

Use the fixture matrix in `../acceptance.md`. Fixture facts, prohibitions, expected buyer jobs, and brand evidence remain fixed during a run.

## Score

- Buyer and offer specificity: 25
- Evidence and trust: 25
- Argument and page quality: 25
- Brand, visual flow, and reliability: 25

Hard blockers override the score.

## Experiment record

Every JSONL record contains:

- experiment ID and timestamp;
- source SHA and candidate digest;
- mutation name;
- fixed fixture IDs;
- four dimension scores and total;
- blocker codes;
- research, thesis, strategy, writing, review, render, persistence, readback, and total p50 and p95;
- model, repair, fallback, and omission distribution;
- keep or revert decision;
- median, MAD, and retention threshold when available;
- concise rationale.

Do not record source bodies, domains, URLs, email, prompts, copy, evidence text, trace IDs, support references, tokens, or credentials.

## Keep and stop rules

- Before three retained experiments, require a strict total improvement and no blocker.
- After three retained experiments, require a total above `median + 1.4826 * MAD` and no blocker.
- Revert non-improving mutations without weakening tests.
- Stop after five consecutive reverts.
- Release requires two consecutive blocker-free scores of at least 90.

## Mutation queue

1. final-only lifecycle
2. production authority
3. Evidence Graph execution
4. Campaign Thesis
5. Product/Solution recipe
6. Section Brief continuity
7. persuasion ranking
8. fallback hardening
9. stable build shell
10. final reveal polish

Only one mutation may be evaluated at a time.
