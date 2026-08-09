# Try Me Now design uplift: 25 implemented outcomes

Status: implemented and verified
Date: 2026-08-08  
Design authority: [`../DESIGN.md`](../DESIGN.md)  
Canonical product decisions: [`decision-log.md`](./decision-log.md)

## North star

The prospect supplies a few useful signals and Folloze produces a branded,
buyer-ready experience. The flow should feel robust underneath and effortless on
the surface.

## Baseline assessment

- **First impression:** polished and credible, but the cobalt/ink entry cards and
  violet interaction system make the shell feel more like a generic AI product
  than Folloze.
- **First three focal points:** oversized headline, cobalt campaign card, black
  content card. The Folloze product promise and the prospect's chosen outcome are
  secondary.
- **Classifier:** hybrid. Entry and reveal are brand-led marketing moments; the
  guided brief is an app workspace.
- **Baseline design score:** B-
- **Baseline AI-slop score:** C+
- **Goodwill baseline:** 57/100. Strong guided architecture and preview-before-email
  add goodwill; competing progress systems, dense evidence chrome, and a premature
  editing/analytics workbench drain it.

## The 25 outcomes

### Entry and Folloze brand

1. **Outcome-led first viewport.** Replace the setup question with a concise product
   promise and fit all three paths comfortably in the standard desktop viewport.
2. **Real results as proof.** Let verified experience imagery do the visual work;
   remove faux browser chrome and decorative product-theater effects.
3. **Concrete input-to-output story.** Each path states what the prospect provides
   and the buyer-facing experience Folloze produces.
4. **One card system.** Normalize card structure and luminance so the campaign card
   does not win merely because it is cobalt.
5. **Consistent example actions.** Treat example links as clearly external,
   secondary proof with consistent placement and language.
6. **Verified Folloze shell tokens.** Move primary actions, selections, focus, and
   progress from violet to Folloze blue/cyan/green tokens.
7. **Clean Folloze typography.** Use the approved sans-serif stack throughout the
   shell; reserve customer-harvested typography for generated previews.

### Domain and guided brief

8. **Composed domain step.** Make the domain input and immediate brand payoff the
   obvious next action, with concrete language about logo, color, and site cues.
9. **Meaningful header state.** Replace the persistent generic minute promise with
   the current milestone after the prospect chooses a path.
10. **One brief progress system.** Present three prospect choices only: account or
    offer, audience, and goal.
11. **Separate autonomous work.** Brand, research, and generation live in one compact
    “Folloze is working” receipt instead of competing with brief progress.
12. **Collapsed brand receipt.** Default to logo, company, and verified status;
    palette/provenance is optional detail.
13. **Dominant current question.** Put the next required choice before secondary
    evidence and reduce the oversized intake stack.
14. **Mindless selection states.** Make campaign type, audience, objective, and
    source-mode selections unmistakable with accessible selected semantics.
15. **Conversational inputs.** Replace generic form language with concrete prompts,
    relevant examples, and a specific next-action label.
16. **Immediate research feedback.** Show what is being read as soon as a product or
    source URL is entered, without blocking the next choice.
17. **Explain recommendations quietly.** Lead with recommended audiences and keep
    public evidence one deliberate disclosure away.
18. **Simpler source modes.** Use `Paste a URL`, `Upload a PDF`, or `Describe the
    product` and state how each source improves the output.

### Build, reveal, save, and signal

19. **One build story.** Use one dynamic stage statement and a short four-stage track;
    remove repeated numerical progress and dashboard duplication.
20. **Stage-specific work visuals.** Brand, audience, message, and page stages use a
    meaningful artifact cue rather than the same orbit/pulse animation.
21. **Preview-centered reveal.** Reduce parent chrome and make the generated page the
    unmistakable hero with reliable contained desktop scrolling.
22. **Preview readiness in the toolbar.** Anchor `interactive`, `refining`, `ready to
    save`, and `saved` to the preview itself with an honest in-place transition.
23. **Progressive refinement.** Show one `Refine this experience` action; reveal the
    focused controls only when requested and summarize current choices instead of
    repeating every option.
24. **Gain-framed save and signal proof.** Use real logos or a graceful single-logo
    state, concise headline, one copyable URL, clear email purpose, and a compact
    real-activity receipt before any simulated example.
25. **One cross-surface visual grammar.** Keep the Folloze shell calm/light, one
    processing module deep navy, and the customer preview customer-led. Enforce
    accessible contrast, reduced motion, visible focus, and one contextual secondary
    action per state.

## Non-regression boundaries

These changes must not alter generation fingerprints, brand readiness, source
grounding, provisional/final lifecycle, claim gating, analytics privacy, publication,
or the 60-second performance contract.

## Verification

All 25 outcomes are implemented. The final pass also corrected the first-party
analytics origin check so a legitimate local session opened through
`127.0.0.1` is treated as the same browser-visible origin while forged origins
remain rejected.

### Quality gates

- `npm run qa`: passed on 2026-08-08 with 62 test files and 572 tests, plus
  successful Turbopack and webpack production builds. ESLint reports one
  pre-existing unused-variable warning and no errors.
- Desktop Playwright: 20 tests passed.
- Folloze visual verification: 2 tests passed, including an artifact capture
  run.
- Focused guided-entry and wireframe contracts: 17 tests passed.
- Clean Chromium session at 1440 × 1000: no console errors and no HTTP responses
  at or above 400 after the analytics-origin correction.

### Visual evidence

| State | Evidence |
| --- | --- |
| Entry | [`../output/design-uplift-v2/after/entry.png`](../output/design-uplift-v2/after/entry.png) |
| Domain | [`../output/design-uplift-v2/after/domain.png`](../output/design-uplift-v2/after/domain.png) |
| Brand payoff | [`../output/design-uplift-v2/after/domain-ready.png`](../output/design-uplift-v2/after/domain-ready.png) |
| Guided brief | [`../output/design-uplift-v2/after/guided.png`](../output/design-uplift-v2/after/guided.png) |
| Recommended audience | [`../output/design-uplift-v2/after/audience.png`](../output/design-uplift-v2/after/audience.png) |
| Build | [`../output/design-uplift-v2/after/build.png`](../output/design-uplift-v2/after/build.png) |
| Reveal | [`../output/design-uplift-v2/after/reveal.png`](../output/design-uplift-v2/after/reveal.png) |
| Save | [`../output/design-uplift-v2/after/save.png`](../output/design-uplift-v2/after/save.png) |
| Engagement | [`../output/design-uplift-v2/after/engagement.png`](../output/design-uplift-v2/after/engagement.png) |

### Final assessment

- **Design score: A-.** The first viewport is decisive, the guided flow has one
  task hierarchy, the customer preview owns the reveal, and save/engagement
  moments now communicate value instead of configuration.
- **AI-slop score: A-.** Real experience proof, specific motion language,
  verified brand ownership, restrained processing visuals, and removal of
  generic violet/product-theater treatments make the experience feel authored.
- **Goodwill score: 89/100.** Preview-before-email, honest progress, concise
  disclosure, visible real activity, and progressive refinement materially
  increase trust. The remaining goodwill risk is operational rather than visual:
  production latency and external integration configuration must continue to be
  measured against D-026.
