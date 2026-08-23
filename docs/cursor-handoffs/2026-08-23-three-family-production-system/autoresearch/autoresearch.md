# Autoresearch: custom

Started: 2026-08-23
Runs: 1 | Best score: None/100 | Status: baseline

## Current best
Baseline: 43/100 from the committed ADP and ServiceTitan deterministic evidence captures.

The current result renders reliably, but it remains generic, leaks internal decision-path language, shows placeholder-like logo/media fallbacks, and lacks seller-specific imagery and proof. Cursor must beat this baseline without weakening any blocker or test.

## Custom rubric

Asset: one deterministic generated desktop experience plus its evidence, brand, family-selection, timing, and QA receipts.

Dimensions, 0–25 each:

1. **Buyer specificity and evidence** — actual offer, personas, jobs, claims, proof, and CTA.
2. **Brand fidelity and truthfulness** — logo, semantic color use, typography, buttons, geometry, imagery, and honest provenance.
3. **Composition and utility** — family-specific argument, earned sections, useful interaction, strong visual rhythm, and clear CTA.
4. **Reliability, timing, and honesty** — revision safety, 60-second bound, recoverable states, privacy, and complete receipts.

Hard blockers force revert: wrong identity, invented claim, broken/placeholder media, stale overwrite, prospect template selector, work after cutoff, sensitive trace data, false brand claim, generic recommendation chips, or any required QA failure.

Keep threshold: strict improvement before three experiments; afterward `score > median + 1.4826 × MAD`. Final target: at least 90/100 in two consecutive blocker-free runs. Stop after five consecutive reverts.

Mutation strategies:

- family-selector-specificity;
- section-plan-subtraction;
- offer-recommendation-evidence-threshold;
- audience-role-specificity;
- brand-color-role-reconciliation;
- brand-geometry-translation;
- first-party-asset-purpose-ranking;
- brand-help-recovery;
- headline-specificity-edit;
- section-novelty-edit;
- proof-plan-reconciliation;
- CTA-outcome-alignment;
- revision-race-hardening;
- critical-path-parallelization.

## History

| Run | Score | Status | Strategy |
|-----|-------|--------|----------|
| 1   | 43    | baseline   | current-three-family-prebaseline |
