# Messaging compiler autoresearch handoff

This package upgrades the current production engine without replacing the product that already works.

The repository already has evidence reconciliation, a canonical message spine, deterministic Launch/Guide/Align selection, per-section writing contracts, bounded candidate review, brand compilation, controlled personalization, BuildTrace, and deterministic rendering. The next release must connect those pieces through an explicit strategy layer and judge message quality with the same rigor already applied to schemas and assets.

## Outcome

A sparse campaign brief compiles into:

1. one canonical evidence ledger;
2. three or four evidence-bounded message strategies;
3. one deterministically selected strategy with a scored decision receipt;
4. one semantic page plan;
5. section copy generated from the selected strategy and existing role contracts;
6. one base experience plus evidence-backed personalization patches;
7. one private trace that explains every material choice;
8. one benchmark result that can reject generic, repetitive, or unsupported copy.

The visitor still supplies only the minimum useful signals. The system still renders within the existing preview contract. The renderer remains deterministic. Folloze publishing remains disabled.

## Product constraints

- Preserve the current 17 archetypes and the Launch/Guide/Align family contract.
- Preserve the current fail-soft preview behavior. Quality warnings may trigger one bounded repair, but must not suppress a safe preview.
- Do not generate JSX, CSS, or arbitrary layout code with a model.
- Do not send private evidence, domains, URLs, copy, trace IDs, or support references to PostHog.
- Do not weaken safe-fetch, evidence, privacy, timing, brand, or schema gates.
- Do not change Vercel production, GitHub visibility, or the accepted public branch.
- Do not touch unrelated modified files under `output/product-owner-remediation/`.
- Do not overwrite the existing root `autoresearch.md` or `autoresearch.jsonl`. They belong to the analytics cockpit experiment.

## Release sequence

Cursor implements the bounded work orders in this package. Codex then runs the compiler benchmark, scores the candidate, inspects the private trace, runs focused and full QA, and either keeps the candidate or sends one precise correction pass. Only a blocker-free retained version may be committed and pushed. Vercel is not deployed in this release.

