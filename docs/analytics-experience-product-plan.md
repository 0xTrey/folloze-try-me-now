# Try Me Now analytics experience: product and build plan

Status: approved build direction from Trey, 2026-08-23. This plan replaces the earlier "open after the first meaningful interaction" behavior in `docs/codex-handoff-analytics-and-polish.md`. The analytics experience may still be opened manually, but its automatic reveal happens only after the visitor reaches the end of the generated experience.

## North star

The generated page should prove its own value. When a visitor reaches the bottom, Folloze opens a concise analytics cockpit that says, in effect: **you just explored this buyer journey; here is exactly what Folloze learned, what looked important, and how that signal becomes useful to marketing and sales.**

The experience must be truthful. Real activity, derived insight, and illustrative live-campaign examples are visually and semantically distinct. IDs such as `lens-2` are implementation details and never appear as the customer-facing explanation when the rendered value proposition is available.

## 25 improvements

### Trigger and truth

1. **Bottom-earned automatic reveal.** Emit a dedicated journey-complete signal only when the visitor actually reaches the document bottom or final journey section; never open the analytics cockpit on a timer or first click.
2. **One automatic reveal per session.** Auto-open once, preserve manual reopening, and never interrupt the visitor again after dismissal.
3. **Explicit completion receipt.** Lead with “You reached the end. Here is what Folloze captured,” connecting the popup to the action that earned it.
4. **Rendered section titles in every event.** Attach the human-readable section heading to section views and navigation events.
5. **Rendered value propositions in every lens event.** Attach the visible lens label and headline so “Decision lens 2” becomes the actual topic the buyer explored.
6. **Safe semantic fallbacks.** Use a clean section label only when the rendered title is absent; never expose raw kebab-case IDs or zero-based numbers.
7. **Truthful timing gate.** Do not display engaged seconds until at least 15 foreground seconds have actually accrued; never estimate or backfill time.
8. **Hard real/simulated boundary.** Give real preview activity the primary visual lane and put illustrative account/buying-group data behind an explicit “Simulated example, not captured leads” treatment.
9. **Signal deduplication by meaning.** Collapse rapid observer repeats while preserving different titles, value propositions, actions, and sections.

### Fast comprehension

10. **Four-second snapshot.** Open with a compact summary of sections explored, meaningful interactions, strongest topic, and next-step intent.
11. **Journey coverage map.** Show the ordered experience sections as visited/current/unvisited nodes using their real titles.
12. **Semantic activity timeline.** Group the real feed by section and use action verbs such as Opened, Explored, Returned, and Clicked rather than repeating “Viewed.”
13. **Signal-strength taxonomy.** Distinguish attention, exploration, depth, and conversion intent with labels and icons rather than pretending every event has equal importance.
14. **Interest ranking.** Rank only observed topics and sections; explain the ranking as “most explored” rather than an opaque AI score.
15. **Dwell visualization when available.** Show real section dwell as proportional bars after the three-second capture threshold; omit the chart when the signal is unavailable.
16. **Plain-English interpretation.** Add a deterministic “What this suggests” sentence tied to the strongest real event, with no invented buyer identity or intent.
17. **Next-best follow-up.** Translate the strongest event into a useful seller/marketer action, such as following up on the exact value proposition explored.

### Demonstrating Folloze depth

18. **Buying-group expansion.** Demonstrate how multiple known visitors roll up to an account view using clearly simulated, audience-relevant roles.
19. **Role-aware examples.** Derive example roles from the selected audience instead of always showing generic executive/program/operations titles.
20. **Account-level synthesis.** Show how separate visitor paths reveal consensus, divergence, and missing stakeholders without presenting simulated people as real leads.
21. **Capability explanations.** Expand Attention, Journey, Topics, Content, Intent, and Buying group into useful one-line definitions and example outputs, not six unexplained pills.
22. **Activation map.** Explain that these signals can route to CRM, marketing automation, sales alerts, and Folloze reporting without implying those systems are connected in the anonymous demo.
23. **Analytics-to-action close.** End with a clear Build → Activate → Learn → Follow up sequence that ties the preview to Folloze’s operating value.

### Experience quality

24. **Evidence-room visual hierarchy.** Use a desktop-first, wide analytics cockpit with a strong summary band, a primary real-journey lane, a secondary insight lane, and restrained motion when the bottom milestone fires.
25. **Accessible and resilient states.** Preserve focus trap, Escape/close behavior, readable contrast, reduced-motion support, no horizontal overflow, and purposeful sparse/empty states.

## Experience architecture

### Automatic reveal

1. The generated experience observes its own scroll boundary.
2. On the first genuine bottom reach, it emits `journey_complete` with the final section ID and rendered title.
3. The parent validates and sanitizes the payload, records the interaction through the existing best-effort engagement path, and auto-opens the analytics cockpit once for that session.
4. The top of the cockpit is the real-time proof lane. Dismissal prevents another automatic interruption; “See live engagement” remains available for manual reopening.

### Analytics cockpit hierarchy

1. **Completion band:** what just happened and why it matters.
2. **Live snapshot:** real counts and strongest observed topic; elapsed time only when truthful.
3. **Journey replay:** ordered, human-readable activity plus section coverage.
4. **Interest and follow-up:** observed priority and deterministic next action.
5. **Live-campaign expansion:** clearly simulated buying-group/account example.
6. **Folloze analytics depth:** capability explanations and activation destinations.
7. **Operating close:** Build → Activate → Learn → Follow up.

## Data contract

- New bounded context fields: `sectionTitle`, `targetTitle`, `lensTitle`, and `lensHeadline`.
- Each field is rendered-page text, trimmed, length-bounded, and treated as display metadata only.
- Existing raw IDs remain stable keys for dedupe and persistence.
- `journey_complete` is allowed once per generated page and once per parent session auto-open.
- Server event persistence remains best effort and cannot block preview interaction.
- No email, page HTML, source-body text, or arbitrary free-form visitor input is added to engagement payloads.

## Build sequence

1. **Contract first:** lock the event schema, one-time trigger, real/simulated labeling, and completion assertions.
2. **Generated-page instrumentation:** emit semantic titles and the journey-complete milestone.
3. **Parent orchestration:** sanitize the new context, produce customer-facing labels, preserve dedupe/persistence, and auto-open once.
4. **Cockpit redesign:** implement the new hierarchy and derived real-signal summaries without inventing data.
5. **Automated acceptance:** unit/component coverage plus deterministic desktop Playwright coverage for early non-open, bottom auto-open, title fidelity, dismissal, manual reopen, disclosure, focus, and overflow.
6. **QA:** run focused tests, full `npm run qa`, the analytics desktop E2E, browser console/visual checks, and record a health score.
7. **Autoresearch:** use a custom 100-point rubric to mutate one bounded UI/copy strategy per run; keep only statistically meaningful improvements that pass every hard blocker.

## Completion score

The implementation is complete only when all hard blockers pass and the experience scores at least 90/100:

- **Truth and semantic specificity (25):** actual section/value-prop titles, honest timing, real/simulated separation.
- **Comprehension and decision usefulness (25):** a buyer can understand what happened, what mattered, and the next action in under ten seconds.
- **Analytics depth and Folloze value (25):** journey, content/topic, intent, account, buying-group, and activation value are concrete.
- **Visual, interaction, and accessibility quality (25):** hierarchy, focus, motion, containment, empty states, and console health.

Hard blockers: any early auto-open; a raw lens/section ID shown when a title exists; simulated people presented as captured leads; fake or premature timing; invented intent; broken focus/close; horizontal overflow; console error; lost server event persistence; or any required test/build failure.
