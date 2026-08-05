# Codex handoff: design uplift for Try Me Now

Status: approved direction from Trey, 2026-08-05. Design strategy from Claude (full-flow visual review); Codex owns implementation.

This doc is the execution contract for a visual and product-UX uplift. It changes presentation, hierarchy, and copy only. It must not change generation logic, session lifecycle, integrations, analytics semantics, or any API route behavior. It is additive to `docs/ux-v2-build-plan.md` and `docs/codex-handoff-analytics-and-polish.md`; do not duplicate work from those plans.

How to use this doc: each numbered workstream below is scoped for one sub-agent. Give the agent this entire file plus one workstream number. Workstreams run in wave order (see Execution order) because they share two large files.

---

## Review evidence

The direction below comes from a full walkthrough of the local app (fixture mode, desktop 1440x1000 and mobile 390x844): entry, ABM domain step, target account, audience, outcome, build, reveal, tune cockpit, claim dialog, engagement panel, and the generated `/e/{id}` page. What is already strong and must be preserved:

- The token system in `src/app/globals.css` `:root`, the Instrument Sans display / Inter body pairing, and the `#5b5bff` accent.
- The three-tone entry cards (paper / cobalt / ink) as distinct path identities.
- The flow architecture: one question at a time, identity confirmed before composing, preview before email.
- The generated experience template itself (serif editorial headline, section rhythm). Do not restyle the generated page template in this effort.

The problems are hierarchy, density, and consistency, not taste.

## Owner intent, in priority order

1. The reveal screen must sell the claim. "Save this preview" is the conversion moment and must be the visually primary action, with the 30-minute expiry made visible and the tune controls discoverable.
2. One progress narrative during the guided flow instead of three competing progress systems.
3. A legibility floor: no interface text below 11px, muted text passes contrast at its rendered size, fewer uppercase micro-labels.
4. The entry page shows the actual product (real generated-experience imagery), not abstract wireframe diagrams.
5. Consistent selection affordances and a single button system.
6. The domain step feels composed and pays off immediately when a domain is entered.
7. Claim dialog and engagement panel frame value instead of loss and feature lists.

## Explicitly deferred

Do not build these now: dark mode, redesign of the generated experience template, new fonts, animation overhauls beyond what a workstream names, mobile-first restructuring beyond keeping current mobile behavior intact, any new dependency, any change to `src/lib/**` behavior (a lib change is allowed only where a workstream explicitly names one and it is copy/presentation data, not logic).

---

## Ground rules for every sub-agent

- Repo: `/Users/treyharnden/Projects/folloze-try-me-now`. Node 22. Dev server: `npm run dev` (fixture mode by default) at `http://localhost:3000`.
- Quality gate: `npm run qa` (lint, typecheck, unit tests, both builds) must be green before you finish. Run `npm run test:e2e` when you touched flow copy or layout; the desktop Playwright project must pass.
- Unit and e2e tests assert exact UI copy (for example `tests/e2e/guided-entry.spec.ts` asserts "No blank canvas" and button names; `tests/e2e/generated-experience.spec.ts` carries a forbidden-copy list). When a workstream changes copy, update the asserting test in the same commit. Never weaken the forbidden-copy gates.
- The UI lives almost entirely in four files: `src/components/try-me-now-app.tsx` (~3300 lines), `src/components/try-me-now-enhancements.tsx` (~1070 lines), `src/components/try-me-now-enhancements.module.css`, and `src/app/globals.css` (~1130 lines). Styles for the main app are plain classes in `globals.css`; enhancements use the CSS module. Follow that split; do not introduce new styling systems.
- Match existing code style: dense single-file components, design tokens from `:root`, `var(--ease)` for transitions, `clamp()` scales, no comments that narrate changes.
- One commit per workstream, conventional format (`feat:`/`fix:`), ending with the repo's standard co-author line.
- Evidence: before starting, capture full-page before screenshots of every state you will touch; after finishing, capture matching after screenshots. Save to `output/design-uplift/{workstream}/`. Use the walkthrough recipe in the appendix.
- Reduced motion: any new animation must respect the existing `prefers-reduced-motion` handling patterns already present in the codebase.
- Keyboard and screen reader behavior must not regress: focus-visible outlines, dialog focus traps, aria labels. The a11y tree was reviewed; fixes to it are named in workstream 6.

## Execution order

Shared-file conflicts are real: nearly every workstream touches `try-me-now-app.tsx` and `globals.css`. Run workstreams sequentially in this order, one commit each, unless you put agents in separate git worktrees and merge deliberately.

- Wave 1 (foundation): Workstream 1.
- Wave 2 (highest value): Workstreams 2, then 3.
- Wave 3 (in any order): Workstreams 4, 5, 6, 7.

---

## Workstream 1: legibility floor and one button system

Goal: raise the smallest text to legible, accessible sizes and collapse the button treatments into one system, so every later workstream builds on a consistent base.

Current state, with anchors:

- `globals.css:180` `.checkPhase` is 7px with `!important`. Ledger and artifact sublabels (`.assemblyIdentity small`, `.moduleSkeleton span`, `.compositionLabel small`, `.workingNow`, `.ceremonyReceipts i`) run 7-9px. `globals.css:80` `.portalVisual::after` ("4 sec preview") is 8px.
- Muted colors fail contrast at small sizes: `--fz-muted: #6b7e9d` is ~3.9:1 on white; `.checkPhase` hardcodes `#8a96aa` (~2.9:1). Body text at 10-11px appears throughout (`.buildTop p`, `.claimCopy span`, `.claimPrivacy`, `.revealIntroCopy>p`).
- Buttons: `.buttonPrimary` / `.buttonSecondary` exist (`globals.css:131-135`), but the flow also uses one-off dark pills, white pills, gray filled pills for disabled-and-waiting states, text-with-underline buttons (`.ceremonySkip`, `.signalTeaser button`), and a dark block button in the save dialog. Disabled primary is `opacity: .45` on a dark fill, which reads as broken rather than waiting.

Changes:

1. Establish a type floor. In `globals.css`, sweep every `font-size` below 11px up to at least 11px; uppercase micro-kickers may stay at 11px with letter-spacing but nothing below. Where an 8px label was doing structural work inside a tight component (ledger rows, assembly artifacts, ceremony receipts), prefer removing the label over shrinking it back; keep at most one kicker per card.
2. Fix contrast. Add a token `--fz-muted-strong` (a darker step, around `#5a6b88`, tuned to pass 4.5:1 on `#fafafb`) and use it for all muted text rendered under 14px. Replace the hardcoded `#8a96aa` with the token. `--fz-muted` may remain for 14px+ secondary text and decorative kickers.
3. Consolidate buttons. Define exactly three treatments in `globals.css`: `buttonPrimary` (solid `--fz-action`, hover accent, as today), `buttonSecondary` (bordered white, as today), and a new `buttonTertiary` (borderless text button with underline affordance, replacing the ad-hoc text buttons). Migrate one-off button styles in the flow (not inside the generated experience template) onto these three. Keep the entry portal CTAs as they are; workstream 4 owns them.
4. Design a real waiting state. Disabled primary buttons ("Confirm this company", "Use this account", "Continue") get a distinct ghosted treatment: primary shape, `--fz-accent-tint` fill, accent-toned label at reduced emphasis, `cursor: not-allowed`. Enabled state must be unmistakably the solid primary. No layout shift between states.
5. Reduce kicker noise. Count the uppercase kickers per screen after the sweep; where two kickers sit within one card (for example `portalTopline` plus `portalKicker`), keep one.

Acceptance:

- No `font-size` below 11px anywhere in `globals.css` or the enhancements module (grep proves it).
- All text under 14px uses ink, body, accent, or `--fz-muted-strong`; nothing under 14px uses `--fz-muted` or hardcoded grays lighter than it.
- Every `<button>`/link-button in the flow resolves to one of the three treatments or the entry portal CTA. The disabled/waiting treatment is visually distinct from both enabled primary and plain secondary.
- `npm run qa` and `npm run test:e2e` green; before/after screenshots of the guided brief, build ledger, and reveal rail in `output/design-uplift/w1/`.

## Workstream 2: reveal screen conversion hierarchy

Goal: the reveal screen's primary action is saving the preview; urgency is visible; the tune controls are discoverable. This is the money screen.

Current state, with anchors:

- `try-me-now-app.tsx:3198-3200`: "Save this preview" renders as `buttonSecondary` while "Open full screen" is `buttonPrimary`. Business goal is inverted.
- `try-me-now-app.tsx:3298`: the only expiry signal is footer text "Expires 30 minutes after generation" in ~10px at the far bottom corners, alongside the temporary URL in `<code>`.
- `try-me-now-app.tsx:3241`: the tune cockpit ("Tune this experience": Shorter / More business value / More technical / Bolder; Brand-led / Editorial / Technical / Minimal; CTA treatments; free-text direction; "Apply creative direction") is a collapsed `<details>` bar below a ~770px preview. `try-me-now-app.tsx:3224`: "See live engagement" pill with a count badge sits at the preview's top edge; a signal toast also pops over the bottom-right, stacking three competing affordances near the tune bar.

Changes:

1. Swap emphasis: "Save this preview" becomes `buttonPrimary`; "Open full screen" becomes `buttonSecondary`. Keep both in `revealActions`; keep the mobile `order: -1` behavior pointing at the save action (`globals.css:288`).
2. Add a live expiry countdown pill adjacent to the reveal actions: "Private preview · expires in MM:SS", computed from existing session timing data (find the ready/expiry timestamp already used to enforce the 30-minute window; do not invent a new lifecycle). It ticks per second, switches to a warning tone (existing `--fz-warning`) under 5 minutes, and disappears for claimed sessions, replaced by a quiet "Saved" chip. Timer must pause cleanly on unmount and respect reduced motion (no pulsing).
3. Keep the footer URL row, but it no longer carries the urgency job alone; raise its text to the workstream-1 floor.
4. Make tuning discoverable: render the tune cockpit open by default on desktop the first time an experience becomes ready (persist collapsed/open choice per session in existing client state; do not add storage systems). The collapsed summary line must show the first row of tone chips inline instead of only the generic caption, so a closed cockpit still shows what tuning offers.
5. De-conflict the overlays: the signal toast must not cover the tune cockpit; anchor it above the cockpit bar or top-right of the preview. One overlay at a time.

Acceptance:

- On a fresh reveal: Save is unmistakably primary, countdown is visible without scrolling at 1440x1000, and the tune chips are visible without a click.
- Claimed sessions show no countdown and a saved indicator; no timer leaks (React strict/dev console clean).
- `npm run qa` and `npm run test:e2e` green (update copy assertions if any). Before/after full-page reveal screenshots, desktop and 390px, in `output/design-uplift/w2/`.

## Workstream 3: one progress narrative

Goal: a single canonical progress surface during the guided flow. Today three systems report the same state and the page feels far heavier than three questions.

Current state, with anchors:

- System A: stepper chips inside the guide card (Target account / Buyer persona / Outcome) plus dark "You chose ..." bubbles.
- System B: the right rail "Campaign Overview" (`try-me-now-app.tsx:1292`) with per-signal cards mixing checkmarks, number chips ("02", "04", "05"), and a "+", plus a "What Folloze is doing" (`:1319`) narration card and an "N/4" bubble.
- System C: a full-width below-the-fold band, headline "Building {brand} into a buyer-ready experience" (`try-me-now-app.tsx:3160`, rendered by the enhancements artifact stream at `try-me-now-enhancements.tsx:588`), carrying "STAGE 2 OF 4", "1 OF 4 STAGES LOCKED", "WORKING NOW", "1 COMPLETED / 3 REMAINING", and a stage checklist that duplicates the rail. `try-me-now-app.tsx:1181` and `:2352` say "intelligence layers locked".

Changes:

1. Keep the right rail as the one canonical progress surface. It owns: what is captured, what is in flight ("What Folloze is doing"), and what remains. Normalize its item states to exactly three visuals: done (check), active (live indicator), waiting (hollow) — no mixed number chips, no "+".
2. Remove the below-the-fold progressive-build band from the guided flow screens (System C). The enhancements artifact-stream component may survive only if another surface still needs it (check the mobile process drawer at `try-me-now-app.tsx:2477` and reveal rail usage before deleting the component itself); remove dead code and dead CSS with it.
3. Simplify the guide card: keep the three-step chips as a compact position indicator, keep identity/account confirmation rows, but stop echoing every choice as a chat bubble once the rail records it. One "You chose" echo for the most recent decision is enough; prior echoes collapse into the rail's done states.
4. Language: replace every "locked" progress phrase ("intelligence layers locked", "STAGES LOCKED") with capture language ("captured", "ready", "in progress"). "Locked" reads as unavailable, the opposite of what it means here. Sweep both components plus any test fixtures asserting the copy.
5. The build moment between "Build my experience" and the reveal (the ceremony overlay plus the openai-mode assembly view) is out of scope except for the "locked" language sweep; it is the emotional peak and already works.

Acceptance:

- During the guided flow at 1440x1000 there is exactly one live progress surface (the rail); scrolling reveals no duplicate stage ledger.
- No user-visible "locked" progress copy anywhere in the flow (grep proves it).
- Guide card shows at most one "You chose" echo at a time.
- No orphaned CSS for removed structures. `npm run qa` and `npm run test:e2e` green; before/after full-page captures of the target-account and outcome steps in `output/design-uplift/w3/`.

## Workstream 4: the entry page shows the product

Goal: the first screen proves the outcome with real generated-experience imagery instead of abstract mini-diagrams, and the three cards agree on CTA hierarchy.

Current state, with anchors:

- The three portal cards (`entryPathOptions`, `try-me-now-app.tsx:268-308`; styles `globals.css` `.portal*` block) each contain a schematic `portalVisual` (chips, skeleton lines, plus a hover-only 8px "4 sec preview" tag). The only outcome proof is three small external "Watch the ..." links (`exampleLabel` at `:276/:289/:302`).
- CTA treatments differ per card: dark pill on paper, white pill on cobalt, white pill on ink — no consistent primary read.
- Footer microcopy sits split across the two bottom corners at low contrast.

Changes:

1. Produce real preview imagery: run the fixture flow once per path (ABM folloze.com→nvidia.com; campaign; content), open each generated `/e/{id}` page at 1440 width, and capture the hero/top viewport. Export three optimized images (AVIF or WebP with PNG fallback if needed, each under ~120KB) to `public/entry/`, named per path. Static images, not live iframes.
2. Replace each card's schematic `portalVisual` with its real preview image inside the existing card frame: subtle browser-chrome top edge (reuse the existing browser-bar visual language from the reveal preview), image cropped to the current visual's aspect, per-card tone preserved via the card background around it. Delete the schematic markup and its CSS (`.abmVisual`, `.campaignVisual`, `.contentVisual`, `.miniLogo`, `.campaignDot`, `.campaignLines`, `.documentPage`, `.contentPaths`, the `::after` hover tag) once unused.
3. On hover, keep the existing card lift; add a gentle scale on the image only (respect reduced motion). The mobile breakpoint currently hides `portalVisual` entirely (`globals.css:214`); keep hiding it on mobile.
4. Unify CTA hierarchy: all three card CTAs use one shape and weight system — same pill geometry, tone-adapted colors are fine, but one card may not look "more primary" than the others by accident. Keep `actionLabel` copy as is (tests assert the names).
5. Give the example links one consistent, slightly more visible treatment (workstream-1 tertiary button style, 12px+), and merge the two split footer lines into one centered line at floor size.

Acceptance:

- Entry page at 1440 shows three real product previews; no schematic placeholder markup or CSS remains.
- Lighthouse-visible weight stays sane: the three images total under ~400KB and are lazy-loaded below the fold on mobile.
- `tests/e2e/guided-entry.spec.ts` still passes unchanged (button names, example hrefs, trust chips). Before/after entry captures, desktop and 390px, in `output/design-uplift/w4/`.

## Workstream 5: domain step composition and instant payoff

Goal: the domain question feels like one composed screen, and typing a valid domain starts paying off immediately.

Current state, with anchors:

- `globals.css:104-118`: `.domainStage` splits into a huge left headline (46-82px) and a small floating right card over a grid-paper background, with a wide `clamp(50px,9vw,140px)` gutter; vertical centering strands whitespace. The "FOLLOZE GUIDE · FIRST SIGNAL" chip is a dark pill style unique to this screen.
- The confirm CTA's disabled state is the gray fill workstream 1 replaces (verify it landed here).
- Nothing on screen changes while a valid domain sits in the field until the user clicks confirm, even though enrichment legitimately starts at confirmation and the flow's whole promise is speed.

Changes:

1. Rebalance the grid: tighten the column gap, cap the headline measure, and align the form card's top with the headline baseline group so question and input read as one composition. Reduce or remove the grid-paper texture if it fights the tightened layout.
2. Replace the one-off dark chip with the standard `sectionKicker` treatment.
3. Add an anticipatory scan strip to the right card: when the field contains a plausible domain (the existing `likelyDomain` regex at `try-me-now-app.tsx:348`), show a quiet inline preview row — favicon-style dot, the normalized domain, and "Ready to scan {domain}" — that upgrades the confirm CTA context. On confirm, this same strip becomes the live "scanning" state (reuse the existing brand-stage status data; do not start network work before confirm — the privacy contract says enrichment starts at confirmation, and `guided-entry.spec.ts` asserts the confirm gate).
4. Keep "Choose another path" as the workstream-1 tertiary button.

Acceptance:

- At 1440x1000 the screen reads as one composition (no stranded half-screen whitespace); at 768 and 390 the stacked layout still works.
- Typing `folloze.com` produces the inline ready-to-scan row without any network request (network tab proves nothing fires before confirm).
- `guided-entry.spec.ts` passes: confirm stays disabled until a valid domain, no email input exists, back navigation works. Before/after captures in `output/design-uplift/w5/`.

## Workstream 6: selection affordances, a11y strings, and copy mechanics

Goal: selection controls look like selections, expanders look like expanders, and small copy defects stop undermining polish.

Current state, with anchors:

- `try-me-now-app.tsx:1513`: outcome options render `<Check>` when selected but `<ArrowRight>` when not — arrows read as navigation on what is actually a single-select list.
- Audience cards (`try-me-now-enhancements.tsx` around `:379`) combine a radio dot, a chevron, and a details expander whose summary reads "{n} supporting signals" — grammatically wrong at n=1 ("1 supporting signals").
- `try-me-now-app.tsx:3224`: the engagement pill renders label and count as adjacent text nodes; the accessible name computes to "See live engagement1".
- Objective/outcome rows and audience cards are large click targets, which is good; keep target sizes.

Changes:

1. Outcome list: one affordance system. Unselected rows get a hollow radio indicator; the selected row gets the filled/check state; remove `ArrowRight` from selection rows entirely. The "· Recommended" suffix stays, restyled as a small accent chip rather than concatenated text so screen readers get "Accelerate an opportunity, recommended" (use aria-label or visually separated span).
2. Audience cards: radio for selection on the left; exactly one expander affordance for evidence ("Why this fits" pattern); remove the redundant chevron. Pluralize correctly: "1 supporting signal" / "n supporting signals" (fix everywhere the pattern appears; add a unit test for the pluralization helper if one is created).
3. Engagement pill: give the count a separated, aria-labeled badge ("See live engagement, 3 signals"); visually keep the pill.
4. Sweep the flow for sibling defects: concatenated accessible names (button text + count/state in one text node), title-less icon buttons, and text-node-adjacent chips. Fix what a screen-reader pass of the five main screens surfaces; note each fix in the commit body.

Acceptance:

- No arrow icons on single-select rows anywhere in the guided flow.
- "1 supporting signal" renders correctly (unit test or fixture assertion).
- Accessible names for the engagement pill and outcome options read correctly in the a11y tree (verify with a Playwright accessibility snapshot).
- `npm run qa` and `npm run test:e2e` green; captures in `output/design-uplift/w6/`.

## Workstream 7: claim dialog and engagement panel value framing

Goal: the claim dialog shows what the visitor keeps, and the engagement panel leads with their own live signals instead of stat tiles and feature cards.

Current state, with anchors:

- Save dialog (`try-me-now-app.tsx:2454` and enhancements `savePanel` at `try-me-now-enhancements.tsx:1018-1020`): loss-framed title "Save the URL before the preview disappears.", a heavy dark expiry block on top, and no representation of the thing being saved — neither the URL nor any visual of the experience.
- Engagement panel: three stat tiles that read "1 / 1 / 1s" with near-zero session data (the "1s engaged" tile is cryptic), then six capability marketing tiles, then real activity beside the simulated buying-group feed. The simulated feed's labeling ("Illustrative examples · not captured leads") is correct per the analytics handoff and must survive.

Changes:

1. Claim dialog: keep the single email field and single CTA. Add the concrete keep-value: the live URL rendered in a copyable row and a small static thumbnail of this session's generated hero (a client-side capture is overkill; reuse the seller/target brand lockup plus experience headline as a compact "card" rendering). Reframe the title to gain language, for example "Keep this experience live." with the expiry as supporting line, not the headline. Countdown chip from workstream 2 appears here in place of the dark block.
2. Engagement panel: reorder to (a) the visitor's own live feed first with a plain-language intro line, (b) the simulated buying-group view second, behind its existing clear labeling, (c) collapse the six capability tiles into one compact row of labeled chips or a single "What Folloze reports in a live campaign" line list. Replace the "1s" stat tile treatment: while data is sparse, show a sentence ("You've spent 12 seconds here — that's already a signal.") instead of three near-empty counters; show the counters once at least two are non-trivial.
3. Do not change event capture, event names, persistence, or the simulated-feed determinism from the analytics handoff. Presentation only.

Acceptance:

- Claim dialog shows the URL being kept and a visual token of the experience; title is gain-framed; email flow and cookie behavior unchanged.
- Engagement panel with a fresh session shows no cryptic near-zero stat tiles; real activity is visually first; simulated data labeling is unchanged or clearer.
- `npm run qa` green; dialog and panel before/after captures in `output/design-uplift/w7/`.

---

## Appendix: walkthrough recipe for evidence capture

Fixture-mode flow that reaches every reviewed state (Playwright, desktop project, `@playwright/test` is already a devDependency):

1. `goto /` (domcontentloaded; the page never reaches networkidle because of analytics polling — do not wait for it).
2. Click button "Build an ABM campaign" → domain step.
3. Fill label "Company domain" with `folloze.com`; click "Confirm this company".
4. Fill placeholder `targetaccount.com` with `nvidia.com`; wait for "Use this account" to enable; click it.
5. Audience step: click "Continue" (recommended hypothesis preselected).
6. Outcome step: click "Build my experience".
7. Reveal: capture; open the tune cockpit; click "See live engagement" (capture panel); click "Save this preview" (capture dialog, close with Escape).
8. Extract the `/e/{id}` URL from the footer; visit it directly at 1440 and 390 for generated-page captures.

Full-page screenshots via `page.screenshot({ fullPage: true })`. Store under `output/design-uplift/{workstream}/` with `before-`/`after-` prefixes. Keep `npm run qa:visual:folloze` green where it applies.
