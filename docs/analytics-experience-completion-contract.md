# Analytics experience completion contract

This is the acceptance contract for the redesigned Try Me Now analytics experience. It is intentionally buyer-safe: the panel must make the value of Folloze analytics obvious without presenting illustrative activity as captured lead data.

## Product behavior

1. The live-engagement surface is a progressive disclosure, not an interruption. It must not auto-open on preview load, on the first section, after a short dwell, or merely because the visitor opened the toolbar.
2. Auto-open may happen once, and only after the embedded experience reports an explicit final-section/journey-complete event. The event must be emitted when the visitor actually reaches the final section, not from a timer or a synthetic loop.
3. A manual “See live engagement” control remains available before completion. Manual open is not counted as the one-time completion auto-open.
4. The completion event must carry the final section identifier, its human-readable section title, and the last selected value-proposition title (when the visitor selected one). The analytics panel must show those human-readable titles; “Decision Lens 2” alone is not acceptable buyer-facing copy.
5. Duplicate final-section messages are idempotent. They must not reopen a dismissed panel, duplicate a signal, or create duplicate server events.
6. The panel opens with a clear hierarchy: current visitor activity first, a concise snapshot second, journey/depth context third, and capability explanation last. It must be scannable without requiring a prospect to decode a dashboard.
7. Real activity is labeled as live/current and is sourced from the current browser session. Illustrative account or buying-group examples are visibly labeled “Simulated” or “Illustrative examples” and “Not captured leads.” They must never look like real people, real timestamps, or captured account activity.
8. No displayed duration may claim fewer than 15 foreground seconds. If the session has not reached that threshold, show an honest sparse-state sentence rather than a fabricated duration or score.
9. The panel supports keyboard use: focus moves into it on open, Tab/Shift+Tab are trapped, Escape closes it, focus returns to the opener, and background content is inert while open.
10. At the supported desktop viewport there is no horizontal overflow, clipped content, or unusable scroll region. The panel remains readable at 1280px and 1440px widths.
11. The full flow produces zero uncaught console errors and no unhandled promise rejections. Provider failures are represented as recoverable UI state and an actionable support reference.

## Data and telemetry contract

The generated-experience bridge must accept a typed message with this shape (additional fields may be added without changing these semantics):

```ts
{
  source: "folloze-experience",
  action: "journey_complete",
  payload: {
    sectionId: string,
    sectionTitle: string,
    lensTitle?: string,
    position: "final",
    completionKey: string
  }
}
```

`completionKey` is stable for a session and final section. The host must validate `event.source`, the embedded frame window, string lengths, and `position === "final"` before acting.

The host must preserve the existing analytics server boundary:

- record a deduplicated preview interaction for the journey completion and the titled final section;
- retain `sessionId`, visitor/browser correlation, use case, and attribution fields under the existing sanitized analytics contract;
- POST to the existing analytics endpoint and persist/read back through the existing server path;
- do not send raw email, arbitrary HTML, tokens, or unbounded message payloads;
- distinguish client capture, server persistence, and simulated display in both logs and UI.

## Analytics surface requirements

The completed panel should make these 25 improvements visible or structurally possible:

1. One-line “what this proves” summary at the top.
2. Current-session signal count with an honest sparse state.
3. Foreground engagement threshold and truthful duration bucket.
4. Most recent meaningful interaction, not a noisy click stream.
5. Final section title and value-prop title in the completion signal.
6. Journey progress from first view to final section.
7. Topic/lens depth represented as a simple ranked view.
8. CTA intent separated from passive viewing.
9. Content/section attention shown by relative depth, not invented percentages.
10. Buying-group view clearly separated from visitor activity.
11. Simulated examples marked with persistent disclosure.
12. Role labels grounded in the selected audience when examples are shown.
13. Capability cards explaining Attention, Journey, Topics, Content, Intent, and Buying group.
14. A short “how this becomes useful” explanation for sellers.
15. Evidence/source provenance where a real signal has one.
16. Empty states that tell the visitor what action will produce the next signal.
17. A compact chronological feed with readable timestamps.
18. De-duplication of repeated section events.
19. A completion badge that cannot be mistaken for a lead score.
20. A next-step recommendation based on observed behavior, not a fabricated lead grade.
21. Clear distinction between private preview analytics and live campaign analytics.
22. A saved-experience state that explains the persistence change.
23. Responsive/desktop overflow protection and readable density.
24. Accessible labels, focus order, Escape close, and reduced-motion behavior.
25. Error/support state with a correlation reference and no silent failure.

## Completion scoring rubric

Score 0–2 per category, 20 points total:

| Category | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Trigger correctness | Opens early or never | Manual works, auto behavior incomplete | One-time auto-open only after actual final event |
| Titled context | Numeric lens labels only | Some section labels | Final section and value proposition are explicit |
| Truthfulness | Simulated data looks real | Disclosure exists but is weak | Live/simulated/persistence boundaries are unmistakable |
| Analytics usefulness | Raw noisy feed | Feed plus a few counters | Snapshot, journey, depth, capability, and next move are scannable |
| Interaction quality | Keyboard/overflow/errors fail | Partial support | Focus trap, close return, desktop layout, and zero console errors |
| Persistence contract | No server record | Client-only or unverified | Deduplicated event is sanitized, posted, and persisted |
| Sparse-state honesty | Fabricated duration/score | Generic empty state | Explicit “explore to see signals” and no sub-15s duration |
| Visual hierarchy | Dashboard clutter | Readable but flat | Current activity leads; context and capabilities progressively disclose |
| Resilience | Provider error breaks flow | Error shown | Retry/support reference and safe continuation |
| Regression safety | No automated coverage | Partial tests | Deterministic E2E covers trigger, title, disclosure, keyboard, overflow, console |

### Hard blockers

- Auto-open before the final section or repeated auto-open.
- A “Decision Lens 2”/generic numeric label shown without the actual section title.
- Simulated people or activity presented as captured leads.
- Any fabricated duration under 15 foreground seconds.
- Analytics event not sanitized or server persistence regresses.
- Keyboard trap, close behavior, horizontal overflow, or uncaught console errors.

Release target: at least 18/20, with zero hard blockers. A score below 18 is not ready for live QA.
