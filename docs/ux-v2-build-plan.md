# Try Me Now UX V2 Build Plan

## Outcome

Turn the current polished MVP into a prospect-controlled product experience that visibly recognizes the visitor's company, shows the evidence behind its recommendations, builds the page progressively, lets the prospect refine the result without restarting, proves engagement analytics, and converts an email claim into a durable experience workspace.

Production promotion is outside this plan. Completion means the exact pushed commit is verified on a protected Vercel preview with production unchanged.

## Product principles

1. Fewer questions before value; more control after the first preview.
2. Every visible progress state represents work that actually completed.
3. Brand and account intelligence must be explainable and removable.
4. Regeneration preserves prospect decisions and locked content.
5. The full experience remains usable without an email; email is required only to persist, share, and resume it.
6. Generated claims stay source-grounded and pass hard factual-integrity checks before reveal.

## Build order

### Phase 0: Baseline and architecture

- Preserve the current 187-test and 16-browser-test baseline.
- Map the session object, editor-cookie boundary, orchestration fingerprint, generated HTML template, iframe message contract, claim flow, Blob storage, Neon lead ledger, and email payload.
- Keep all new session fields backward-compatible with stored v1 sessions.

### Phase 1: Session and API foundation

Add one coherent editor contract for:

- example mode and seeded examples;
- explainable audience recommendations;
- evidence items with public source, pin, and exclude state;
- source inspection and confirmation;
- belief, action, CTA type, and CTA destination;
- tone, story, and layout variants;
- asset selection;
- block overrides and locks;
- interaction events and quality receipt;
- saved experience versions, duplication, and cockpit metadata.

Editor mutations must require the existing editor token, retain optimistic revisions, and restart only the affected generation layer.

### Phase 2: Instant recognition and confident path selection

1. **Instant brand-lock moment**
   - Show the detected logo, company name, palette, and positioning signal within seconds of domain acceptance.
   - Keep the next question usable while harvesting continues.

2. **Entry-path micro-demos**
   - Each use-case card demonstrates its distinct output on hover, focus, and tap.
   - Motion has an equivalent reduced-motion state.

3. **Try with an example**
   - Seed a real ABM, campaign, or Content Magic flow without requiring visitor inputs.
   - Example data can be replaced without starting over.

### Phase 3: Explainable intelligence and source trust

4. **Explainable audience recommendations**
   - Every recommendation includes a concise company-specific rationale.

5. **Evidence tray**
   - Show public account or source signals with source links.
   - Allow pinning and exclusion before or after generation.

6. **Content source confirmation**
   - Show title, host or page count, thumbnail when available, and extracted factual anchors.
   - Require an explicit confirmation or replacement before final generation.

7. **Belief and action control**
   - Offer one optional sentence defining what the buyer should believe and do.

8. **CTA and destination builder**
   - Support meeting, trial, registration, product, original source, and custom destinations.
   - Validate custom URLs and align all generated CTA copy with the selected action.

### Phase 4: Visible generation and prospect control

9. **Progressive real artifacts**
   - Render brand shell, evidence, buyer lens, hero, sections, and CTA as each becomes available.

10. **Truthful build receipts**
    - Replace abstract percentages with completed artifacts and current work.

11. **Input-to-reveal continuity**
    - Carry actual brand, target, audience, objective, evidence, and CTA tokens into the reveal.

12. **Edit brief without restart**
    - Open the current brief in a drawer from build and reveal screens.
    - Keep the existing preview visible while a replacement revision is generated.

13. **Block edit, options, and lock**
    - Every major generated copy block supports direct editing, three alternatives, and lock state.
    - Locked blocks survive subsequent regenerations.

14. **One-click strategic rewrites**
    - More executive, more technical, more provocative, shorter, and business-value modes.

15. **Story and layout variants**
    - Executive Brief, Proof-Led Story, and Interactive Assessment variants.
    - Switch variants without re-entering the brief.

16. **Visual evidence selection**
    - Choose from harvested company and source assets with safe fallbacks.

### Phase 5: Exploration and analytics proof

17. **Exploration controls**
    - Desktop/mobile viewport toggle, in-app full screen, sticky journey navigation, and scroll-position preservation.

18. **Immediate analytics proof**
    - The first meaningful preview interaction produces a specific signal receipt.
    - The analytics panel explains the role, content, action, and engagement context Folloze captured.

19. **Personalization quality receipt**
    - Show passed checks for account specificity, source grounding, brand fidelity, CTA alignment, accessibility, and unsupported-claim protection.

### Phase 6: Persistence and saved cockpit

20. **Email-claimed experience cockpit**
    - Clearly show the unclaimed expiry countdown and what email unlocks.
    - After claim: resume, edit, share, copy, duplicate, view revision history, inspect engagement, and receive a contextual follow-up email.
    - Store account, audience, objective, CTA, source, and artifact revision with the lead.

## Parallel ownership

- **ABM evidence engine:** session schema, validation, orchestration, secure editor API, revisions, duplication, evidence, and cockpit persistence.
- **Content intelligence engine:** generated-page navigation, editable block markers, iframe analytics events, first-interaction proof, accessibility, and variant-aware rendering.
- **Visual UX engine:** reusable React components for all new prospect-facing controls and states.
- **Primary integration:** main wizard state, API wiring, progressive flow, reveal, cockpit, CSS integration, error recovery, and final acceptance.

## Verification matrix

### Automated

- Unit tests for every new validation and orchestration contract.
- Stored v1 session backward compatibility.
- Editor-token authorization and public-session redaction.
- Block locks preserved through regeneration.
- Evidence pin/exclude effects reflected in generation fingerprints.
- Duplicate and revision integrity.
- CTA URL safety and unsupported-claim rejection.
- Keyboard, focus, reduced-motion, 320px, 390px, 768px, and 1440px browser coverage.
- No horizontal overflow, missing focus state, broken asset, or inaccessible dialog.

### Live preview

- Complete ABM, campaign, and Content Magic runs using OpenAI.
- Confirm company-specific audiences and evidence.
- Exercise edits, locks, variants, asset choice, device preview, analytics receipt, and quality receipt.
- Claim one QA experience and verify the saved cockpit plus Neon readback.
- Confirm the API key is absent from source, generated HTML, browser bundles, and logs.
- Confirm the final Vercel deployment is `target: null` and production remains unchanged.

## Delivery checkpoints

Report these separately:

1. local source complete;
2. automated QA complete;
3. browser and visual QA complete;
4. git commit complete;
5. GitHub push complete;
6. protected Vercel preview ready;
7. exact-commit live verification complete;
8. production promotion not performed.
