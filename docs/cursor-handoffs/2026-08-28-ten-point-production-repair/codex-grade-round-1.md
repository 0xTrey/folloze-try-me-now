# Codex grade, round 1

Date: 2026-08-28

Base: `b9374fbc5789d6fa08f027f15dc6dda04f2666d1`

Candidate state: uncommitted Cursor implementation on `codex/messaging-compiler-v1`

## Verdict

Reject. Score: 30 of 100. R3 and R4 are hard blockers because final-only V2 still explicitly hides the two requested actions. Green unit and browser tests do not exercise these production conditions.

Independent verification completed before this grade:

- TypeScript typecheck: pass.
- Five focused unit files: 109 tests passed.
- Independent lifecycle review: 186 focused unit tests and 29 focused desktop browser tests passed, but neither P0 final-only failure is covered.
- Production baseline deployment: `dpl_7VwzipcGSM3JZpnKk9JpPsfhZppn`.
- Production Aprio offer/audience support reference: `TMN-BCCBAC393E99`.
- Production build-progress support reference: `TMN-B5BC4050172B`.

## Score

| Requirement | Score | Weight | Verdict |
|---|---:|---:|---|
| R1 Preview wheel | 2 | 8 | Fail |
| R2 Start over | 7 | 10 | Partial |
| R3 Analytics | 0 | 9 | Hard blocker |
| R4 Email claim | 0 | 9 | Hard blocker |
| R5 Offer recommendations | 4 | 12 | Fail |
| R6 Audience | 3 | 12 | Fail |
| R7 Objective diversity and propagation | 3 | 8 | Fail |
| R8 Imagery uniqueness | 4 | 9 | Fail |
| R9 Section integrity | 2 | 11 | Fail |
| R10 Build progress | 5 | 12 | Fail |

## Required corrections

### R1

Severity: high

Observed: Production interior wheel scrolling works in one desktop run, but the cited test is a synthetic `setContent` host. It does not exercise the real Try Me Now shell, keyboard scrolling, or the transient cross-origin fail-safe. The generated document still installs the boundary wheel handler in `src/lib/generation/experience-template.ts`.

Reproduction: Open a final experience in the actual app shell. Focus the iframe, scroll inside it, press PageDown and ArrowDown, then test top and bottom boundary behavior.

Evidence: `tests/e2e/generated-experience.spec.ts` uses a synthetic host. The production baseline proved only interior wheel movement.

Expected: Native child scrolling while the child can move, stable parent during child movement, bounded parent handoff only at an edge, keyboard parity, and safe behavior while the child cannot be inspected.

Allowed files: `src/lib/generation/experience-template.ts`, `src/components/try-me-now-app.tsx`, app-shell E2E fixtures and tests.

Required test: A real app-shell final-session E2E that measures child and parent scroll positions for wheel, PageDown, ArrowDown, top, bottom, and transient cross-origin load.

Stop: The real app-shell test passes without relying on `page.setContent` as the host.

### R2

Severity: medium

Observed: Reset generation fencing is broad, but only one late polling response is tested. The contract covers session creation, source confirmation, answer updates, workspace updates, upload, claim, retry, delayed reveal, and open dialogs.

Reproduction: Defer each state-mutating response, click Start over, release the old response, and inspect the first door after the response settles.

Evidence: `tests/e2e/guided-entry.spec.ts` covers a late GET poll only. The unit helper proves integer equality, not component behavior.

Expected: No stale response can restore the old session, dialog, build shell, recommendation, error, or preview.

Allowed files: `src/components/try-me-now-app.tsx`, its component tests, and focused E2E.

Required test: Deferred response coverage for start, patch, upload status or completion, claim, and delayed reveal, plus reset from intake, build, reveal, and an open dialog.

Stop: Every released pre-reset response is ignored and the first door remains stable.

### R3

Severity: blocker

Observed: Final-only V2 still hides `See live engagement`, and the panel `open` prop rejects final-only V2.

Reproduction: Complete a final-only V2 build and inspect the reveal actions.

Evidence: `src/components/try-me-now-app.tsx:4447` hides the toolbar actions behind `!isFinalOnlyV2`. `src/components/try-me-now-app.tsx:4523` prevents the panel from opening. `tests/e2e/final-only-shell.spec.ts:281` explicitly expects the action to be absent.

Expected: A visible final-only V2 action opens real current-session activity. Illustrative examples remain separate and opt-in. Duration remains hidden before 15 foreground seconds.

Allowed files: `src/components/try-me-now-app.tsx`, `src/components/try-me-now-enhancements.tsx`, focused CSS and analytics/final-only E2E.

Required test: A final-only V2 reveal test that clicks the action, verifies titled real section activity, verifies no early duration, and separately opens labeled illustrative examples.

Stop: Production-shaped final-only fixture exposes and opens analytics without restoring excluded legacy controls.

### R4

Severity: blocker

Observed: Final-only V2 still hides the email-save action and forcibly closes the save dialog.

Reproduction: Complete a final-only V2 build, inspect reveal actions, interact meaningfully with the final page, and attempt to open the claim dialog.

Evidence: `src/components/try-me-now-app.tsx:4180` sets `saveDialogOpen` to false for final-only V2. Lines 4422 through 4432 hide every save state.

Expected: A visible `Save by email` action appears at reveal. Before meaningful engagement it explains the unlock condition. After engagement it opens the existing accessible claim dialog and endpoint.

Allowed files: `src/components/try-me-now-app.tsx`, focused CSS, claim API validation tests, and final-only E2E.

Required test: Locked state at reveal, unlock after a real explore event, dialog accessibility, invalid email rejection, success, nonblocking failure, Escape, focus return, and Start over while open.

Stop: Final-only V2 exposes the action and the existing claim flow without exposing temporary URL or personalization controls.

### R5

Severity: high

Observed: `extractOfferEvidence` projects labels from evidence already in memory. Its own comment says it does not fetch or parse raw HTML. The Aprio-like test injects exact service labels, so it does not prove runtime acquisition from the seller site.

Reproduction: Start from `aprio.com` without a supplied product URL. Current production returns tagline and navigation fragments rather than current services.

Evidence: `src/lib/research/offer-evidence.ts:210-213`. Production returned `Account for Anything` duplicates and `The Latest from Aprio`.

Expected: Bounded, SSRF-safe, same-origin discovery inspects official offer indexes, structured metadata, and a small number of relevant detail pages before ranking. Fewer than two credible labels produces free form plus URL.

Allowed files: current research/content acquisition services, `offer-evidence.ts`, orchestrator integration, sanitized acquisition fixtures, and tests.

Required test: Feed a sanitized Aprio homepage/index/detail-page graph into the real acquisition path. Assert at least two distinct advisory/accounting service labels. Remove detail pages and assert no chips.

Stop: The test begins with pages and links, not pre-injected final service labels, and production integration consumes the resulting evidence.

### R6

Severity: high

Observed: Unsupported generic audience text still leaks through `session.audienceSuggestions[0]` when evidence-backed candidates are absent.

Reproduction: Start the Aprio campaign flow and continue to the audience question without a selected offer URL.

Evidence: `src/components/try-me-now-app.tsx:3977`. Production showed data, analytics, architecture, and enterprise AI roles.

Expected: Visible suggestions come only from selected-offer evidence. If fewer than two credible roles exist, show a neutral free-form prompt with no generic recommendation.

Allowed files: audience recommender, public recommendation projection, streaming question construction, tests.

Required test: Aprio accounting/advisory evidence produces finance, controller, CFO, owner, or accounting buyers and excludes AI/platform roles. Sparse evidence produces no chips and no unsupported placeholder.

Stop: No public UI fallback can source `session.audienceSuggestions[0]` unless it has passed the evidence-backed gate.

### R7

Severity: high

Observed: The catalog now has three action families, but choosing one stores only `objective`. Final rendering selects `ctaType` and label from the separately recommended candidate.

Reproduction: Choose each of the three objective chips, build, and inspect the final CTA type and label.

Evidence: `src/components/try-me-now-app.tsx:4054-4056` patches only objective text. `src/lib/generation/session-production-engine.ts:158-164` reads the recommended candidate instead of the selected objective.

Expected: The selected candidate ID or objective resolves to its CTA type and label through answers, Campaign Thesis, section writer input, final HTML, and engagement labels. A third action is used only when its destination or behavior is truthful.

Allowed files: objective recommendation contract, streaming answer patch, session answers or resolver, production engines, CTA renderer, tests.

Required test: For campaign and product motions, select each action family and assert the stored answer, thesis, final CTA type/label, and analytics label all match.

Stop: No selected objective can render the recommended candidate's different CTA.

### R8

Severity: high

Observed: `sourceIdentityKey` is still URL-derived in production. `duplicateKey` is populated only in tests. There is no production content or perceptual fingerprint, and no end-to-end rendered uniqueness test across all semantic roles.

Reproduction: Supply two transformed URLs for the same source image and render hero plus toggle panels.

Evidence: `src/lib/brand-system.ts:396-406`; repository search shows no production assignment of `AssetCandidate.duplicateKey` outside the compiler fallback.

Expected: Carry the strongest upstream identity available into `duplicateKey`, including a safe content/perceptual digest when already available. Normalize transformed variants. Renderer consumes one allocation plan and never re-ranks assets.

Allowed files: brand evidence adapter, brand system, asset allocator, render plan consumer, tests.

Required test: Production-shaped brand evidence with exact duplicates and transformed crops renders no repeated substantive source identity across hero, sections, and tabs. Sparse inventory renders designed non-image fallbacks.

Stop: A deliberate duplicate mutation fails at both allocation and rendered DOM levels.

### R9

Severity: high

Observed: The new visual helper gathers `brokenImages` but its pass function ignores that value. It checks horizontal bounds and focus targets only. E2E uses one default composition, not every active family or the Aprio, ADP, Jabra, and sparse fixtures.

Reproduction: Run the integrity helper with a broken image or a clipped non-focus headline. It can still pass.

Evidence: `src/lib/generation/section-visual-integrity.ts:96-104`. The E2E calls one `generatedExperienceHtml` family at three viewports.

Expected: All active composition families pass overflow, broken media, text fit, contrast, crop, spacing, tab state, and keyboard checks at required desktop and mobile widths.

Allowed files: visual integrity helper, active renderer/CSS primitives, representative fixture compiler, visual E2E.

Required test: Matrix of all active families crossed with Aprio, ADP, Jabra, and sparse evidence. Assert zero broken images, no clipped visible text, valid media fallback, contrast thresholds, and no viewport overflow.

Stop: The helper fails every deliberate overflow, broken image, clipped text, low contrast, empty media, and duplicate-asset mutation.

### R10

Severity: high

Observed: Writing receipts are now persisted. Checking is marked active only after `assembleExperienceArtifact` returns, then finalizing is written immediately. The cited tests do not prove a visitor polling normally can observe all six stages.

Reproduction: Run a controlled build with deferred section writing, deferred factuality checking, and deferred final persistence. Poll through the public API.

Evidence: `src/lib/orchestrator.ts:3334-3389`. Checking and finalizing are adjacent post-compile writes rather than boundaries around the real checking work.

Expected: Start checking before factuality and quality work, then start finalizing before render, persistence, and readback. Receipts remain monotonic and fenced. No timers simulate progress.

Allowed files: production engine progress callbacks, section writer, orchestrator, session projection, final shell tests.

Required test: Deferred deterministic providers let E2E observe preparing, research, planning, writing with counts, checking, and finalizing in order through ordinary polling. A parallel completion fixture cannot regress counts or phases.

Stop: Every stage is tied to real work and is observable in the controlled browser test.

## Release gate

Cursor must update its implementation report with exact commands and must not claim a requirement passed from an isolated unit test when the production-shaped E2E still contradicts it. Codex will regrade all ten. Ship requires at least 95 of 100 and no hard blocker.
