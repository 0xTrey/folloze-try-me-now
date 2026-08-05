# QA Report: Incremental Feature Pass

**Target:** local release candidate on `codex/visual-v1`

**Date:** 2026-08-04

**Status:** PASS — ready for exact-commit deployment and live verification

## Scope

This was an incremental product pass, not a rebuild. It preserves the existing three-path Try Me Now flow and shared experience renderer while improving:

- offer-first campaign intake and contextual buyer recommendations;
- cited URL and PDF source intelligence;
- company and target logos, palettes, and evidence labels;
- the large progressive build state;
- one canonical desktop wireframe across ABM, campaign, and content;
- preview-only CTA behavior, scroll handoff, and live-engagement analytics.

## Automated verification

- ESLint: pass.
- TypeScript: pass.
- Vitest: 53 files / 460 tests pass.
- Next.js Turbopack production build: pass.
- Next.js webpack production build: pass.
- Playwright: 27 pass / 5 intentionally skipped desktop-only or mobile-only cases.
- `git diff --check`: pass.

## Browser journeys

| Journey | Inputs | Verified result |
|---|---|---|
| Campaign | Jitterbit + Harmony | Real logo and palette, named offer capture, Jitterbit-specific audiences, generated branded preview |
| Content | Jitterbit public site | Source title and premise extracted before audience choice, 16 cited blocks, grounded summary, generated content experience |
| 1:1 ABM | Folloze for NVIDIA | Both real logos, target identity match, NVIDIA-specific buyer hypotheses and evidence |

Additional interaction checks passed:

- the live-engagement panel opens as one large host-level surface;
- embedded CTA previews record engagement without navigating away;
- navigation and resource interactions produce one semantic activity stream;
- the embedded preview hands wheel scrolling back to its host at its boundaries;
- the browser console is clean after completing the three journeys.

Local screenshots are retained under `.gstack/qa-reports/screenshots/` and intentionally excluded from git.

## Defects caught during QA

1. The campaign form sent `promotedOfferConfirmed`, but the strict answer schema rejected it. The field is now accepted and covered by a campaign contract regression test.
2. Campaign and content renderers had legacy section-order forks. All three journeys now use the same thesis → decision path → supporting resources wireframe and three-card resource grid.
3. Guided-entry Playwright assertions still referenced the retired “Personalize for an account” label. They now assert the shipped “Build an ABM campaign” label.

## Release boundary

This report covers local implementation and QA. GitHub push, Vercel deployment, `/api/health`, and an anonymous live-browser canary remain separate release checkpoints.
