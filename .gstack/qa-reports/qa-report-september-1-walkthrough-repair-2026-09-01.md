# QA Report: September 1 Try Me Now Walkthrough Repair

**Target:** local worktree `/Users/treyharnden/Projects/folloze-try-me-now-sep1`

**Branch:** `codex/sep1-feedback-repair`

**Base commit:** `2649648b2be0bdc55a8ee1dbfb2184ba9bf15cc1`

**Date:** 2026-09-01

**Status:** PASS for the local repair scope. GitHub and Vercel are not updated by this report.

## Scope

The September 1 walkthrough was converted into an acceptance checklist covering:

- Clear personalized-campaign positioning at entry.
- Removal of unverified Northpeak examples and raw preview URL controls.
- Monotonic, truthful progress through all six build stages.
- Content Magic generation that cannot be aborted by a progress callback.
- Cleaner generated HTML without decorative eyebrow labels, giant ordinal markers, clipped layouts, repeated substantive imagery, or contributor headshots.
- Analytics that pauses engaged-time measurement while a modal is open.
- A single business-email save flow from analytics and the generated closing CTA.
- A closing CTA that stays in the embedded experience instead of opening a new tab.

## Verified repairs

| Area | Result | Evidence |
|---|---|---|
| Entry positioning | Pass | Primary entry is `Build a personalized campaign.` and the former minute-based promise is removed. |
| Worked examples | Pass | Northpeak examples are no longer rendered. |
| Build progress | Pass | The six phases advance in order and stale callbacks cannot regress the visible phase. |
| Content Magic | Pass | Section progress observers are fail-soft. Provider failures still propagate. |
| Visual composition | Pass | Decorative labels and ordinals are suppressed, tablet and mobile columns no longer reserve hidden marker space, and visible sections have no horizontal overflow. |
| Imagery | Pass | Substantive sources are allocated once across the page. Contributor, author, profile, and headshot assets are rejected. |
| Analytics | Pass | Journey completion opens once, signals remain clearly simulated, and engaged time pauses while analytics or save is open. |
| Business-email capture | Pass | Analytics `Save by email` and the generated closing CTA both open one save dialog. The closing CTA does not open a new tab inside the preview. |
| Start over | Pass | Deferred polling, session creation, answer patches, upload status, and claim responses cannot restore stale state after reset. |
| Preview scrolling | Pass | Wheel, PageDown, ArrowDown, and iframe boundary handoff work in the app shell. |

## Automated verification

- `git diff --check`: pass.
- ESLint: pass with 3 pre-existing warnings and 0 errors.
- TypeScript: pass.
- Vitest: 147 files and 1,687 tests pass.
- Focused browser acceptance: 22 of 22 pass with one desktop worker.
- Closing CTA and analytics contract: 3 of 3 pass.
- Next.js webpack production build: pass.
- Independent changed-file review: no P0 or P1 blocker found.

The 22 browser checks cover analytics completion, business-email capture, closing CTA behavior, six-stage progress, progress non-regression, preview scrolling, cross-origin recovery, guided entry, grounded recommendations, Content Magic direct build, Start over, stale-response fences, brand help, and keyboard focus.

## Exact Content Magic canary

**Source:** `https://www.adp.com/spark/articles/2026/08/illinois-aim-credit-a-guide-for-manufacturers.aspx`

**Session:** `TOTmbhvpAs0_srdQYJEgbrusRm2mR_vX`

**Result:** final experience revealed in approximately 50 seconds.

This was a local canary using real public source extraction and the deterministic generation fallback. It is not evidence of production OpenAI execution.

Visual evidence:

- [Full ADP Content Magic page](screenshots/2026-09-01-adp-content-magic-full.png)
- [ADP decision-lens section](screenshots/2026-09-01-adp-content-magic-lens.png)

## Known boundaries

- This repair is local only. It has not been pushed to GitHub or deployed to Vercel.
- Business-email capture and session save are implemented. Actual email delivery still requires a production `RESEND_API_KEY`; the current production inventory does not include one.
- The normal Turbopack build is not a reliable signal in this isolated worktree because `node_modules` is symlinked outside the worktree root. The webpack production build passes.
- Unused Northpeak metadata and dormant CSS remain in source. They are not rendered, but should be removed in a later cleanup pass.
- A production canary is still required after an exact-commit deployment.

## Release boundary

The local implementation and QA gate are complete. Publishing remains a separate action: commit, push to GitHub, deploy the exact commit to Vercel, verify `/api/health`, run the ADP canary against production, and confirm email delivery only after the Resend credential is configured.
