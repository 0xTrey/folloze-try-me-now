# Try Me Now ten-point production repair

## Outcome

Ship one production release that fixes the ten failures Trey observed in the Aprio flow. The release must preserve the final-only V2 contract: research and draft work may happen privately, but the visitor sees only one persisted, read-back final experience.

This is a pipeline repair, not an Aprio-specific patch. Aprio is a regression fixture because it exposes the current generic AI fallback. ADP and Jabra are secondary regression fixtures for buyer relevance and visual variation.

## User-visible acceptance contract

| ID | Failure | Required behavior | Hard rejection |
|---|---|---|---|
| R1 | Preview wheel feels trapped or broken | Wheel and trackpad input over a scrollable embedded preview move the preview natively. The parent page does not steal input while the embedded document can move in the requested direction. Boundary behavior is bounded and never traps the visitor. | A generated wheel handler calls `preventDefault()` while the embedded document can still scroll in that direction. |
| R2 | Start over does not work | One click cancels or fences the active client flow, closes overlays, clears session-specific UI and analytics state, returns to the first door, and prevents stale polling from restoring the old session. | Old session, build shell, dialog, recommendation, or final preview reappears after reset. |
| R3 | Analytics cannot be found | A visible `See live engagement` action appears with the final reveal. It opens this visit's real event stream and uses section titles, selected value props, and honest timing. Any illustrative campaign example is opt-in and structurally separate from this visit. | Fake account activity, fabricated duration, hidden action, illustrative activity presented as live, or analytics that opens before a final reveal. |
| R4 | No CTA to enter email | A visible email-save action appears with the final reveal. Before meaningful exploration it explains how to unlock saving. After a real explore action it opens the existing claim dialog and persists through the existing claim endpoint. | Email collected without explicit consent, publication implied, or CTA absent from V2. |
| R5 | Offer recommendations are generic or repetitive | Recommendations name distinct products, services, solutions, events, or supported campaign offers found in current seller evidence. If fewer than two credible choices exist, show free form plus URL instead of invented chips. | Tagline fragments, `The latest from...`, duplicate labels, or category-only fallbacks shown as recommendations. |
| R6 | Audience profile is wrong | Recommendations name actual external buyer roles for the selected offer and explain the buying job. Seller employee roles and generic AI or IT personas are rejected unless evidence supports them. | Aprio defaults to data, AI, or platform leaders without offer evidence. |
| R7 | Objective choices are three versions of the same action | Show three materially different outcome paths: learn/evaluate, engage sales, and take a third offer-appropriate action such as download, assess, register, compare, calculate, or review. | Three meeting or sales-contact synonyms, or objective text that does not change the generated CTA logic. |
| R8 | Imagery repeats across sections | Allocate a source image to at most one semantic section role unless the asset is explicitly marked reusable. Tabs and toggles use distinct compatible visuals or a designed non-image fallback. | Same image URL, digest, or near-duplicate crop used in multiple semantic roles. |
| R9 | Some sections look broken or incorrect | Every rendered section passes overflow, contrast, spacing, crop, text-fit, and semantic-role checks at 1280 and 1440 desktop widths. A failed image or insufficient asset count produces a designed fallback, not an empty or clipped panel. | Clipped headlines, detached text fragments, off-canvas controls, unreadable contrast, or a blank media region. |
| R10 | Build progress stalls on story selection | The six visible rows advance from real receipts: preparing, research, planning, writing, checking, and finalizing. Writing may report completed section count. No timer fakes work. | Planning remains active while later server work is running, or later stages jump from queued to final without receipts. |

## Product decisions

1. Keep final-only V2. Do not restore provisional customer-facing HTML.
2. Keep one guided intake. Research begins as soon as the seller domain is stable and refreshes when the visitor supplies offer, audience, or objective context.
3. Use seller evidence as the authority for brand, products, services, and buyers.
4. Treat unsupported recommendations as a missing-data state. The safe fallback is free form plus a source URL, not generic chips.
5. Expose analytics after the final reveal. Do not auto-open it before the visitor reaches the final section.
6. Make the email action discoverable at reveal. Keep the existing meaningful-engagement gate for opening the claim dialog.
7. Keep simulated buying-group examples separate and labeled `Illustrative` and `Not captured leads`.
8. Preserve privacy boundaries. Do not expose raw source bodies, prompts, internal trace data, email addresses, or secret-bearing URLs in public session payloads or PostHog.
9. Keep current-visit analytics visually dominant. Put illustrative buying-group examples behind a separate labeled control, never in the primary live event stream.
10. Do not show an engaged-time value before 15 foreground seconds. When shown, it must come only from the foreground-time hook.

## Evidence and recommendation rules

### Offer choices

Eligible choices must satisfy all of these:

- current revision;
- official seller source, visitor-supplied official URL, or reliable third-party source already accepted by the evidence contract;
- confidence at or above the current support threshold;
- company-specific label with a product, solution, service, event, report, or initiative noun;
- distinct normalized label and distinct source meaning;
- evidence reference retained through the public recommendation projection.

Reject or hide:

- taglines and slogans;
- navigation labels such as `Latest`, `Resources`, or `Learn more`;
- company-name-only variants;
- category fallbacks presented as fact;
- near duplicates after trademark, punctuation, and company-name normalization.

Ranking cannot recover evidence that was never collected. The seller research pass must inspect a bounded set of current official paths that commonly contain offers: homepage navigation, product/service/solution indexes, the supplied official URL, relevant structured metadata, and a bounded same-origin set of linked detail pages. Keep the fetch and time budgets explicit, preserve source authority, and stop before an unbounded crawl.

Aprio fixture evidence must support multiple distinct options such as Advisory Services, Client Accounting and Advisory Services, CFO Advisory Services, or another current official offering. Production code must never contain Aprio-specific labels.

### Audience choices

Audience ranking must bind to the selected offer. A candidate needs:

- a specific buyer role or function;
- a buyer job connected to the offer;
- seller evidence or accepted offer evidence that makes the role plausible;
- a confidence band above hypothesis before it is shown as a chip.

For an Aprio accounting or advisory offer, supported examples include CFOs, controllers, finance leaders, business owners, and other evidence-backed decision makers. `Data and AI platform leaders` is a failing fixture unless the selected Aprio offer is explicitly technology advisory and the source supports that audience.

The intake textarea placeholder is presentation, not evidence. It must be neutral or derived from the current supported recommendation set. A hardcoded generic persona must never appear as if it were the seller's recommendation.

### Objective choices

The three choices must occupy different action families:

1. Evaluate or learn: explore a service, review a use case, compare options, or assess readiness.
2. Engage: book a meeting, request a consultation, or contact an advisor.
3. Offer-specific next step: download, register, calculate, check, watch, review, or another evidence-supported action.

The objective label, CTA type, CTA label, and final-section action must stay aligned through generation.

Selection propagation is part of the gate. Changing the selected objective must update the stored answer, Campaign Thesis action, section-writing contract, rendered final CTA, and analytics label for the same active revision.

## Asset and section rules

1. Keep the existing semantic asset allocator as the single source of truth.
2. Allocate by section ID and semantic role, not by array position.
3. Enforce one-use-per-asset by canonical URL plus the strongest available duplicate fingerprint. Use the existing `duplicateKey` contract for upstream content hashes, perceptual hashes, or responsive-crop identity. Do not require fetching binary image bodies inside the allocator.
4. Allow reuse only for assets marked reusable, such as a logo or background texture, never a hero/product/editorial image by default.
5. When assets are insufficient, choose a designed proof card, diagram, data block, quote, or geometric brand treatment.
6. Renderers consume the allocation plan without re-ranking it.
7. Tabs and toggles must not point every state to the same image.
8. Each section must run a text-fit and visual-integrity check before the final artifact passes.

## Real build progress

The public `BuildProgressState` remains receipt-backed. Add or correct milestone writes at real pipeline boundaries:

1. `queued`: session accepted and input fingerprint fixed for this revision.
2. `researching`: brand, offer, account, and source research started; complete after current-revision evidence reconciles.
3. `planning`: strategy candidates and page plan evaluated; complete when the selected thesis and section plan are fixed.
4. `writing`: section writers started; update detail from real completed count, for example `Writing section 4 of 7`; complete when all retained sections have candidate output.
5. `checking`: claim coverage, repetition, factuality, layout, brand, and asset checks running; complete only when gates resolve.
6. `finalizing`: final HTML rendered, saved, read back, and verified; complete immediately before `ready`.

Parallel work remains parallel. The UI may show one active public phase while internal workers run concurrently, but the active phase must match the furthest real pipeline boundary and must never remain stuck on planning during writing or checking.

## Architecture boundary

Extend the existing stack only:

```text
domain and offer input
  -> public evidence harvest
  -> evidence reconciler
  -> offer, audience, and objective recommendation artifacts
  -> Campaign Thesis and page plan
  -> section writers in bounded parallel
  -> claim, repetition, brand, asset, and layout gates
  -> semantic asset allocation
  -> final renderer
  -> persistence and readback
  -> final reveal
  -> first-party engagement ledger and optional PostHog sink
  -> explicit email claim
```

Do not add a second recommendation engine, renderer, analytics store, or claim path.

## Failure behavior

- Research failure: keep free form and URL input, explain that recommendations need a clearer source.
- Sparse brand: use neutral styling and ask for a clearer official page. Do not invent brand colors.
- Sparse imagery: use designed non-image components.
- Slow build: keep current stage and state that the brief is safe. Do not invent elapsed progress.
- Stage failure: show support reference and retry only the failed safe boundary.
- Reset during work: fence all later responses by session ID, revision, and reset generation token.
- Reset fencing covers preflight, session start, polling, patch, upload, claim, retry, and any queued timeout or callback that can set session-scoped state.
- Analytics sink failure: keep the first-party ledger and UI responsive.
- Claim failure: keep the preview and email locally in the dialog, show a support reference, and allow retry.
- Invalid or blank email: reject on the server as well as in the browser. Preserve the dialog statement that saving is not newsletter signup.

## Out of scope

- personalized account variants;
- Folloze publish flows;
- campaign activation;
- CRM routing;
- replacing PostHog;
- a new wireframe family;
- Aprio-only content or CSS;
- provisional public HTML.

## Required fixtures

| Fixture | Purpose | Required assertion |
|---|---|---|
| Aprio accounting/advisory | Current regression | Offer chips use actual services; audience uses finance/business buyers; no generic AI defaults; section imagery is unique. |
| ADP workforce/payroll | Existing broad suite | Offer and audience remain HR/payroll-specific; reset and progress work. |
| Jabra product | Visual and product suite | Product buyers and visual assets remain product-specific; unique images and rounded geometry survive. |
| Sparse evidence | Honest fallback | No recommendation chips; free form plus URL; no invented persona or palette. |

## Release blockers

Any of the following blocks commit and deploy:

- one of R1 through R10 fails;
- public provisional HTML appears;
- a stale request restores state after Start over;
- generic recommendation is presented as evidence-backed;
- Aprio fixture contains unsupported AI or platform audience defaults;
- duplicate image allocation across non-reusable semantic roles;
- build progress is timer-driven or claims work that has not happened;
- analytics includes fabricated leads or time;
- email claim bypasses explicit consent;
- public payload, logs, PostHog, or trace leaks raw source content or secrets;
- unexpected unit, E2E, type, lint, or build failure.
