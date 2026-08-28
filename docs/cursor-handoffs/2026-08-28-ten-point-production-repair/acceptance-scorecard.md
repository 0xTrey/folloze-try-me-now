# Codex acceptance and grading

Codex owns independent review after Cursor returns. Test from a clean worktree created from the candidate commit or candidate diff. The three user-owned modified PNGs in the main worktree are never staged, stashed, reverted, or copied into the candidate.

## Weighted score

| Requirement | Weight | Full-credit evidence |
|---|---:|---|
| R1 Preview wheel | 8 | Actual app-shell desktop E2E measures iframe scrollTop change, parent stability, top/bottom behavior, keyboard scrolling, and fail-safe behavior during a transient cross-origin load. |
| R2 Start over | 10 | E2E resets from intake, build, reveal, and open dialog; late poll response cannot restore state. |
| R3 Analytics | 9 | Final-only reveal action opens real current-session signals with correct titles, no duration before 15 foreground seconds, no early auto-open, and an opt-in structurally separate illustrative example. |
| R4 Email claim | 9 | Action is discoverable, unlock gate is truthful, dialog is accessible, and success/failure use the existing endpoint. |
| R5 Offer recommendations | 12 | Aprio and two non-Aprio fixtures return distinct evidence-backed offers or honest free form. |
| R6 Audience | 12 | Selected-offer-specific buyer roles and jobs; Aprio regression excludes unsupported AI/platform defaults. |
| R7 Objective diversity | 8 | Three distinct action families flow through to final CTA behavior. |
| R8 Imagery uniqueness | 9 | Allocation plan and rendered DOM prove non-reusable asset uniqueness across semantic roles. |
| R9 Section integrity | 11 | 1280, 1440, and mobile screenshots plus DOM overflow/crop assertions across every active family. |
| R10 Build progress | 12 | Slow controlled run advances all six receipt-backed rows without timers or false progress. |

Total: 100.

## Grade bands

- 95 to 100: ship candidate, if no hard blocker exists.
- 90 to 94: send precise corrections to Cursor, then regrade.
- 80 to 89: material rework, do not deploy.
- Below 80: reject candidate and revisit architecture or evidence flow.

Any hard blocker in `execution-contract.md` overrides the numeric score.

## Review sequence

1. Secret and scope audit.
2. Diff review against the accepted base SHA.
3. Focused unit tests for each work order.
4. Aprio, ADP, Jabra, and sparse-evidence fixture tests.
5. Browser E2E at desktop and mobile. R1 remains desktop-specific, but reveal actions, reset, progress, recommendations, and final section integrity are mandatory on both.
6. Visual review at 1280x720 and 1440x900.
7. Full unit, lint, type, benchmark, build, and E2E suite.
8. Sanitized trace and analytics privacy audit.
9. Score R1 through R10 with direct evidence.
10. Send failed items back to the same Cursor session with exact repro, file boundary, and acceptance delta.
11. Repeat until score is at least 95 and no blocker remains.
12. Commit intended files only, push GitHub, deploy Vercel, then repeat the critical live canary.

## Live canary

Run at least these checks against the production alias:

1. Start an Aprio campaign from `aprio.com`.
2. Confirm at least two current, distinct offerings or honest free form plus URL.
3. Select an accounting/advisory offering.
4. Confirm finance/business buyer recommendations, not generic AI/platform leaders.
5. Confirm three distinct objective action families.
6. Start the build and observe all real stage transitions.
7. Verify final-only reveal.
8. Scroll inside the preview with wheel/trackpad and keyboard.
9. Open live engagement and confirm real section titles.
10. Confirm email-save discoverability, unlock it with a meaningful interaction, and open the dialog without submitting a real address during anonymous canary.
11. Use Start over and confirm the old session never returns.
12. Inspect console and network for unhandled errors, secret leakage, or failed critical requests.

## Cursor correction format

For every failed item, Codex sends:

```text
Requirement: R#
Severity: blocker | high | medium
Observed: exact user-visible failure
Reproduction: exact steps and fixture
Evidence: test, screenshot, trace, or line reference
Expected: acceptance-contract behavior
Allowed files: bounded repair surface
Required test: regression that must fail before and pass after
Stop: precise completion condition
```
