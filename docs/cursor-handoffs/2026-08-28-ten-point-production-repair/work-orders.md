# Cursor work orders

One Cursor coordinator owns integration. Use bounded parallel subagents where Cursor supports them. Each subagent returns a diff or evidence to the coordinator. Do not let multiple agents edit the same file at the same time.

## Work order 0: baseline and trace

Objective: reproduce all ten failures and map each to current code before editing.

Actions:

- capture current branch SHA and `git status`;
- preserve the three modified files under `output/product-owner-remediation/`;
- inspect the production Aprio session behavior and existing tests;
- record current recommendation artifacts, build progress receipts, asset allocations, and final reveal controls using sanitized fixtures;
- identify every file to change and assign one integration owner.

Output: baseline table in `cursor-implementation-report.md` with R1 through R10, evidence, root cause, and planned file boundary.

Stop: no implementation until all ten have a named code path and test target.

## Work order 1: preview input and reset

Objective: fix R1 and R2.

Primary files:

- `src/lib/generation/experience-template.ts`;
- `src/components/try-me-now-app.tsx`;
- `src/app/globals.css`;
- focused component and E2E tests.

Requirements:

- remove custom wheel interception from normal preview exploration;
- prefer native iframe scrolling;
- do not scroll the host while the embedded document can move in the requested direction;
- Start over must invalidate pending client requests and ignore late responses from the prior session;
- apply one reset epoch or abort boundary to every session-mutating async path, including preflight, start, poll, patch, upload, claim, retry, and delayed callbacks;
- reset every session-scoped ref, modal, event ledger, personalization selection, build state, and URL state;
- add repeat-click and reset-during-poll tests.

Stop: wheel, keyboard, touch/trackpad-equivalent, and reset regression tests pass.

## Work order 2: final reveal analytics and email claim

Objective: fix R3 and R4 without restoring the legacy V1 shell.

Primary files:

- `src/components/try-me-now-app.tsx`;
- `src/components/try-me-now-enhancements.tsx`;
- `src/lib/preview-lifecycle.ts`;
- related CSS and focused tests.

Requirements:

- add a V2 action row with `See live engagement` and an email-save action;
- analytics is available after final reveal and consumes only current-session events;
- real current-visit signals are the primary view; illustrative buying-group examples are opt-in and live under a separate labeled region;
- no duration is shown before 15 foreground seconds, and later duration comes only from `usePreviewForegroundSeconds`;
- a valid `journey_complete` may auto-open analytics only after final artifact reveal and only when it contains final-section title, ID, position, and completion key;
- email-save is visible at reveal, explains its locked state, and uses `canOfferClaimModal` before opening;
- after meaningful exploration, reuse the existing claim dialog and endpoint;
- validate blank and malformed email at the server boundary as well as through the browser form;
- preserve focus trap, Escape close, focus return, and inert background behavior;
- keep simulated account examples labeled and separate;
- do not expose temporary URL/countdown/personalization controls that remain outside V2.

Stop: E2E proves reveal, analytics open, locked save, unlock, claim dialog, claim success/failure, and privacy labeling.

## Work order 3: company-specific recommendation compiler

Objective: fix R5, R6, and R7 at the evidence and ranking layer.

Primary files:

- `src/lib/research/offer-recommendations.ts`;
- `src/lib/generation/audience-recommendations.ts`;
- `src/lib/generation/objective-cta-recommendations.ts`;
- `src/lib/research/evidence-reconciler.ts`;
- `src/lib/orchestrator.ts` only for artifact integration;
- focused unit and integration tests.

Requirements:

- use current official seller evidence and selected offer context;
- expand bounded offer discovery across homepage navigation, offer indexes, the supplied official URL, structured metadata, and a limited set of same-origin detail pages before ranking;
- remove generic fallback chips from visible presentation;
- improve label extraction and deduplication for services, products, solutions, events, and offers;
- bind audiences to the selected offer, buyer job, and seller evidence;
- reject generic AI/platform personas when unsupported;
- build objective diversity by action family, not wording distance;
- preserve explicit visitor choices during background refresh;
- remove generic audience placeholder text from the UI or derive it from current supported candidates;
- propagate an objective selection through the stored answer, Campaign Thesis, section writer input, rendered final CTA, and engagement labels;
- preserve revision fencing and public/private artifact boundaries.

Stop: Aprio, ADP, Jabra, and sparse-evidence fixture tests pass and no production logic contains fixture-specific labels.

## Work order 4: real build-stage receipts

Objective: fix R10 with real milestone writes.

Primary files:

- production session and generic engines;
- orchestrator milestone integration;
- public build-progress projection;
- `src/lib/preview-lifecycle.ts` only for projection/copy;
- `src/components/final-build-shell.tsx` only for rendering;
- focused unit and E2E tests.

Requirements:

- emit complete/active receipts at the six boundaries in the execution contract;
- add a fenced progress callback or equivalent receipt write at the section-writer boundary instead of inferring writing progress after compilation returns;
- writing detail may include current retained section count from actual completions;
- no timers, percentages, or simulated stage movement;
- polling returns monotonic current-revision progress;
- stale retries cannot regress a phase;
- finalizing includes persistence and readback, not merely HTML render.

Stop: a controlled slow fixture visibly advances through all six rows in order, and a parallel fixture remains truthful.

## Work order 5: semantic image allocation

Objective: fix R8 without adding renderer-local selection.

Primary files:

- `src/lib/asset-allocation.ts`;
- `src/lib/brand-system.ts`;
- production trace projection for allocation receipts;
- focused tests and benchmark mutation.

Requirements:

- canonical URL and the strongest available upstream duplicate fingerprint prevent accidental reuse;
- if upstream research can calculate a content or perceptual digest without widening fetch risk, carry it through the existing optional `duplicateKey`; otherwise preserve responsive-crop identity through normalized source data;
- allocation key includes section ID and semantic role;
- each non-reusable visual asset appears in at most one semantic role;
- tabs/toggles receive distinct assets where available;
- sparse inventory produces explicit designed fallback allocations;
- allocation trace records hashes and evidence refs, never raw asset URLs in private traces that prohibit them;
- renderer consumes the plan without re-ranking.

Stop: the Aprio and Jabra fixtures prove unique visual allocation and the deliberate duplicate mutation fails.

## Work order 6: section visual integrity

Objective: fix R9 across all active composition families.

Primary files:

- `src/lib/generation/experience-template.ts`;
- active renderer/CSS primitives;
- visual grammar and section-quality checks where necessary;
- visual E2E fixtures.

Requirements:

- no clipped or off-canvas content at 1280x720, 1440x900, and the existing mobile fixture widths;
- headings fit the intended column and do not collide with media;
- failed images collapse into designed fallback blocks;
- brand geometry remains consistent;
- interactive tabs preserve an obvious selected state and usable keyboard path;
- every active composition family has an explicit fixture and passes the same integrity checks;
- do not add an Aprio-specific CSS selector.

Stop: screenshots and DOM assertions pass for Aprio, ADP, Jabra, and sparse evidence. DOM checks include document `scrollWidth <= clientWidth`, section bounding boxes inside the viewport, no clipped focus target, and no media container left empty after image failure.

## Work order 7: integration and private trace

Objective: prove all ten fixes are connected end to end.

Actions:

- keep public session compatibility;
- add reason codes for recommendation suppression, objective-family selection, asset fallback, stage progression, and reset fencing where private trace supports them;
- verify source refs resolve;
- ensure analytics and claim failures remain nonblocking to the rendered experience;
- run the full focused matrix before broad QA.

Stop: all R1 through R10 have automated evidence and sanitized trace receipts.

## Work order 8: Cursor self-review

Objective: find failures before Codex grading.

Required commands:

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:preview
npm run build
npm run test:e2e -- --project=desktop
```

Also run the existing visual Folloze suite and the new Aprio-specific fixture command if introduced.

Write `cursor-implementation-report.md` in this directory with:

- SHA and dirty-state proof;
- R1 through R10 status;
- files changed per work order;
- exact test commands, exit codes, pass/fail counts, and unexpected skips;
- fixture outputs and benchmark blockers;
- screenshots and traces;
- remaining risks;
- items Cursor believes Codex should challenge.

Stop after code, tests, evidence, and report. Do not commit, push, deploy, or touch unrelated output files.
