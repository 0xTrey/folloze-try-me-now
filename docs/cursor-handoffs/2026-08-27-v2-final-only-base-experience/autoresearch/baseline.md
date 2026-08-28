# Baseline

Source SHA: `3c55605`

Measured on 2026-08-28 UTC before the final-only implementation.

## Command evidence

| Command | Result |
| --- | --- |
| `npm run lint` | Exit 0, three pre-existing warnings |
| `npm run typecheck` | Exit 0 |
| `npm test` | 130 files, 1,494 tests passed |
| `npm run benchmark:preview` | Five files, 33 tests passed |
| `npm run autoresearch:messaging-compiler` | Two 99.43 compiler evaluations, no compiler blocker |

## V2 release baseline

The accepted compiler slice scores strongly in its original scope, but the V2 release candidate is rejected because the production lifecycle still commits and reveals customer-facing provisional HTML.

| Dimension | Score | Basis |
| --- | ---: | --- |
| Buyer and offer specificity | 24 / 25 | Existing compiler fixtures and accepted production integration |
| Evidence and trust | 24 / 25 | Existing evidence-scoped compiler and privacy tests |
| Argument and page quality | 23 / 25 | Existing candidate strategy and section-job coverage, before Campaign Thesis and recipe activation |
| Brand, visual flow, and reliability | 13 / 25 | Brand and composition contracts exist, but public provisional HTML violates the final-only lifecycle |
| Total | 84 / 100 | Rejected by blocker |

Hard blocker: `customer_visible_provisional_html`.

Timing fields are intentionally null until the new final-only browser benchmark measures full research-to-readback completion. The current preview benchmark measures a different shell, provisional, and terminal contract and cannot be relabeled as final-only evidence.
