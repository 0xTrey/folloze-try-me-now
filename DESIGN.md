# Try Me Now design system

Status: active product design baseline  
Owner: Trey Harnden  
Last reconciled: 2026-08-12

## Product design promise

Try Me Now should feel like a senior Folloze operator turned three useful inputs
into a buyer-ready experience. The prospect should never feel like they entered
an AI prompt studio or a template marketplace.

The interface has three visual owners:

1. **Folloze shell:** calm, crisp, light, and easy to scan.
2. **Folloze processing:** one purposeful deep-navy system module that makes the
   work visible without pretending a timer is progress.
3. **Generated preview:** fully led by the verified customer brand. Folloze shell
   tokens must not recolor the generated experience.

## Brand authority

- Approved logo asset in the product shell: `public/brand/folloze-logo.svg`.
- Public-safe brand authority: the local `folloze-brand-kit` skill.
- Folloze positioning: help B2B teams target and convert key accounts by turning
  approved or AI-created content into live, governed, measurable buyer experiences.
- Preferred display register: **Build. Activate. Signal.** Use it sparingly and
  only when it advances the product story.

## Core tokens

| Role | Token | Value |
| --- | --- | --- |
| Primary interaction | `--fz-action` | `#0077FF` |
| Primary hover | `--fz-action-dark` | `#0048DE` |
| Bright progress detail | `--fz-cyan` | `#00CCFF` |
| Completion and engagement | `--fz-success` | `#11D175` |
| Pale product surface | `--fz-canvas` | `#F3F9FD` |
| Quiet border | `--fz-border` | `#D8ECFA` |
| Body text | `--fz-body` | `#2C3D59` |
| Primary text | `--fz-ink` | `#1C293F` |
| Processing panel | `--fz-deep-ink` | `#071428` |
| Surface | `--fz-surface` | `#FFFFFF` |

Purple may appear only as a small secondary cue. It must not drive primary
buttons, selected states, focus rings, loading, or whole-page gradients.

## Typography

- Instrument Sans is the Folloze display face.
- Inter is the interface body face.
- Folloze-owned UI does not introduce editorial serif fallbacks.
- Body text is at least 16px when it carries instructions or decisions.
- Interface labels are at least 11px and use uppercase only for one screen-level
  kicker or a genuine system status.
- Headings are balanced and use short, concrete outcome language.

## Composition rules

- The first viewport is one composition: logo, one outcome promise, one supporting
  sentence, and the three product paths.
- Cards exist only when the card is the choice or a discrete information object.
- Do not nest decorative cards. Prefer one surface with spacing, rules, and clear
  hierarchy.
- Radii use a hierarchy: 8px controls, 12px modules, 18px primary interactive
  cards. Large 24px bubbles are exceptional.
- Borders establish structure before shadows. Shadows are reserved for the active
  decision or the generated preview.
- Fake browser chrome is not a Folloze shell motif. Real screenshots should read
  as the proof.

## Interaction hierarchy

1. Filled Folloze blue button: the next required action.
2. Bordered button: a valid secondary action.
3. Underlined text link: evidence, examples, or optional detail.

Every choice has a visible selected state, a focus-visible ring, and a 44px
minimum target. Only one secondary action competes with the primary action in a
given state.

## Guided-flow rules

- Ask one obvious question at a time.
- After the prospect chooses a motion, use one natural-language brief composer
  as the front door to the structured flow. Natural language is presentation;
  the visible, editable Live Brief remains product truth.
- The composer may accept a short description, public URL, or PDF. It must show
  an “I’m reading this as…” receipt and provenance for inferred fields.
- Completed conversational turns collapse into compact receipts. Do not make the
  prospect scroll through a chat transcript.
- Use one prospect-facing three-step brief: account or offer, audience, goal.
- Brand, research, and generation are shown separately as **Folloze is working**.
- Brand evidence collapses to logo, company name, and status by default. Color and
  provenance details are optional.
- Background research should feel immediate and truthful, never like a fake
  percentage or a blocking wizard.

## Preview and conversion rules

- The generated experience is the hero of the reveal.
- Provisional, refining, final, saved, and published are distinct states.
- Provisional preview stays interactive but cannot be saved or claimed.
- The preview toolbar carries one state label and one contextual secondary action.
- Refinement is optional and progressive. Do not expose an editor workbench before
  the prospect experiences the page.
- Email appears only after a final preview has demonstrated value.
- Save language describes the gain: keep the link, receive it by email, and retain
  engagement signals.

## Generated-experience visual direction

The generated page uses the detailed contract in
[`docs/generated-experience-visual-direction.md`](./docs/generated-experience-visual-direction.md).
The governing product decision is D-036.

- Keep message, composition, brand authority, and visual direction as separate,
  inspectable artifacts. The model may choose from bounded options; it does not
  invent arbitrary CSS.
- Harvest semantic roles, not a bag of colors. Every applied typography, color,
  surface, button, grid, imagery, and motion decision needs provenance and
  confidence.
- The seller or publisher owns the page system. A target account contributes
  verified context and a restrained lockup, not an accidental whole-page reskin.
- Use brand ink and neutral surfaces for hierarchy. Accent color is scarce and
  purposeful; it does not simultaneously control headings, large backgrounds,
  buttons, dividers, labels, and illustration.
- Each section has one job and one dominant visual idea. The seven-section account
  and campaign story remains promise, urgency, proof, exploration, mechanism,
  team relevance, and next step.
- The first viewport is a poster: one lockup, one short promise, one supporting
  sentence, one CTA group, and one authentic visual anchor. No empty media card.
- Imagery must match its declared role and remain legible in a full-page capture.
  Missing or weak media selects an intentional type-led or diagram-led treatment.
- Alternate compression and release across the page. Repeated layouts, tiny type,
  decorative cards, and long stretches without a visual anchor are defects.
- Visual review is advisory and repair-oriented. It never withholds, blanks, or
  removes an otherwise valid preview. A weak result remains visible while one
  bounded repair or rerun may improve it.

Visual scoring does not control preview, claim, save, or publication readiness.
Source safety, valid artifacts, lifecycle state, and explicit claim rules remain
separate product gates. If visual evidence is incomplete, render the best honest
evidence-backed treatment available and keep refining it.

## Content and voice

- Lead with the buyer outcome or constraint.
- Prefer concrete nouns: experience, page, role, goal, message, proof, next step.
- Avoid internal narration such as `hypothesis`, `compose`, `conversion path`,
  `account thesis`, `decision path`, and `supporting proof`.
- Do not use `magic` as a product-state label.
- State what AI is doing when relevant; never imply unsupervised publishing or a
  guaranteed result.
- Generated facts and claims remain source-grounded.

## Motion and accessibility

- Motion communicates state, placement, or completion. Decorative orbits, glow,
  and pulsing rings are not a substitute for information.
- Prefer opacity and transform with 120–420ms duration.
- Respect `prefers-reduced-motion` everywhere.
- Keep WCAG AA contrast, visible labels, focus rings, correct dialog focus, and
  contained preview scrolling.

## Final-only visible shell (D-040)

The visitor sees three surfaces and nothing in between: intake, build, reveal.

**Intake.** One centered conversational surface. Completed answers collapse into
editable brief receipts that keep company-specific suggestions and their honest
provenance. No preview pane, placeholder frame, or "composing" panel sits beside
it, because there is nothing truthful to show there yet.

**Build.** One stable full-height shell with fixed geometry across every phase.
It renders one row per build phase, and each row's status and detail come from a
`BuildPhaseReceipt`, never from a timer, a guess, or a derived fraction. A
phase with no receipt reads as queued. Four states exist:

| State | Source | What changes |
| --- | --- | --- |
| Working | `buildProgress` receipts | Row statuses only |
| Slow | `buildProgress.slow` | Adds one notice naming the active work and confirming the brief is safe |
| Failed | `buildProgress.failure` | Replaces the body with `failure.nextAction`, plus retry when `failure.retryable` |
| Complete | `canRevealFinalExperience` | The shell is replaced by the reveal |

Forbidden in this shell: percentages, progress bars, elapsed counters, estimated
finish times, page skeletons, placeholder page imagery, and any internal recipe,
strategy, evidence ID, trace ID, digest, or model or provider name.

**Reveal.** The finished HTML is the full-frame plane and the only HTML the
visitor ever receives. `AssemblyPreview` has no non-final branch: it renders
nothing until a persisted, read-back final artifact receipt matches the current
experience revision, which makes a partial page structurally impossible rather
than merely discouraged.

Row and phase states must remain distinguishable without color. The build rows
carry a written state label beside the glyph for exactly this reason.

## Change discipline

Material design changes must name the affected decision IDs in
`docs/decision-log.md` and update the 25-item audit in
`docs/try-me-now-design-uplift-2026-08-08.md`.
