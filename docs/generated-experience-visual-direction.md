# Generated Experience Visual Direction Contract

Status: accepted design contract; implementation follow-up required
Owner: Trey Harnden
Decision: D-036
Last reconciled: 2026-08-12

## North star

A prospect supplies a few simple signals and Folloze produces an engaging,
buyer-ready experience that feels authored for the seller, audience, and offer.
The page must arrive quickly, remain source-grounded, and always render the best
honest artifact available. Visual refinement improves an existing experience; it
does not hold the experience hostage.

## Operating model

Generation produces four separate, inspectable directions before the canonical
renderer applies them:

1. **Message direction:** what the page says, why it matters, and what the buyer
   should do next.
2. **Composition direction:** which shared grammar organizes the story and how the
   sections vary their geometry.
3. **Brand authority:** which organization owns the system and where a target or
   source brand may appear.
4. **Visual direction:** semantic color roles, typography, imagery, density,
   spacing, component treatment, and motion.

The model may select from bounded vocabularies and write image briefs. It does not
generate arbitrary CSS, invent brand evidence, change the CTA objective, or move
facts across evidence boundaries.

## 1. Semantic brand evidence

Brand harvesting records how visual properties are used, not only which values
occur most frequently.

Required roles when evidence supports them:

- identity and canonical domain;
- light and dark logo renditions;
- primary ink, muted text, canvas, soft surface, dark surface, divider, action,
  supporting accent, focus, button text, and on-color text;
- display and body typography, weight, tracking, line height, and delivery source;
- button height, radius, border, hover, and active treatment;
- content width, grid, spacing rhythm, card treatment, and shadow strength;
- hero theme, section cadence, imagery style, crop patterns, motifs, and motion.

Every applied role carries source, observed usage, confidence, and validation
state. A color found only inside an image does not become an action color. A font
name without a public delivery source does not become a guaranteed font.

When evidence is incomplete, the renderer uses an honest restrained treatment
from the verified roles it has. It never labels guessed or generic values as
harvested brand truth.

## 2. Brand authority

### Account and campaign experiences

- The seller owns typography, page surfaces, layout, CTA, interaction states,
  visual motifs, and imagery treatment.
- A target account contributes its verified mark, contextual copy, and relevant
  evidence. Its color remains local to a lockup, divider, account chip, or contained
  contextual visual.
- Target color should ordinarily occupy no more than 5% of visible color area and
  never controls the page H1, global CTA, navigation, focus, or section background.
- A target-led experience requires an explicit product mode; it is never inferred
  merely because a target domain exists.

### Content experiences

- The seller or publisher owns the page system.
- The supplied source controls facts and may control a contained source artifact.
- A document palette, chart palette, or customer logo does not silently become the
  global page theme.

## 3. Semantic palette and color cadence

For a typical enterprise page, the default visual budget is:

- 60–80% neutral or soft seller surfaces;
- 15–30% seller ink or a verified dark surface;
- 5–12% seller action accent;
- 0–5% supporting or target-account color.

These are guardrails, not quotas. Verified brand evidence may justify a more
color-dominant or deliberately monochrome page.

Rules:

- Headings default to primary ink or white on a verified dark surface.
- Accent is reserved for the primary CTA, selected state, focus, short emphasis,
  and an occasional rule or marker.
- Accent does not simultaneously own long headlines, full-width backgrounds,
  buttons, dividers, labels, and illustrations.
- Use at most one saturated full-width section in a seven-section page unless the
  observed brand cadence clearly supports more.
- Do not place two saturated sections next to each other.
- Normal body text meets 4.5:1 contrast; large text and UI elements meet 3:1.
- Deliberately neutral brands remain neutral. Visual review never penalizes a brand
  simply for using little color.

## 4. Section architecture

Account and campaign pages keep the seven-section persuasion framework. Each
section has one job and one dominant visual idea.

| Section | Job | Required visual behavior |
| --- | --- | --- |
| Promise | State the buyer outcome | One lockup, short headline, sentence, CTA group, and visual anchor |
| Why now | Name the constraint or urgency | One strong tension, fact, or editorial contrast |
| Proof | Establish credibility | Verified artifact, metric, citation, customer evidence, or explicit evidence gap |
| Explore | Let the buyer choose a relevant path | Meaningful interactive paths with unmistakable selection states |
| Mechanism | Explain how the outcome is created | Workflow, sequence, architecture, or operating-model visual |
| For your team | Connect the story to buying roles | Role-specific decisions and evidence without a generic feature grid |
| Next step | Offer a concrete move | One action, expected output, and restrained close |

Every section contains at least two of these: a meaningful editorial message, a
factual proof device, an interaction, or an authentic visual asset. A small text
block floating inside unused canvas does not qualify as a finished composition.

## 5. First-viewport contract

The first viewport behaves like a poster, not a dashboard.

- One seller and optional target lockup.
- One 8–14 word headline.
- One supporting sentence.
- One CTA group.
- One dominant verified asset or intentional type-led/diagram-led treatment.
- No decorative hero card, empty media rectangle, or competing manifesto panel.
- The visual anchor takes approximately 30–55% of the section's visual weight.

At desktop scale, use a 12-column grid, keep body measure between 45 and 75
characters, and keep headline measure between 18 and 40 characters. The hierarchy
must remain visible when the full-page screenshot is reduced to roughly 25% scale.

## 6. Imagery and proof

Every visual slot declares its role before asset selection:

- `brand-moment`: authentic seller campaign or brand asset;
- `product-ui`: legible product screen;
- `proof-artifact`: report, chart, quote, or cited evidence;
- `workflow-diagram`: understandable process or architecture;
- `source-cover`: actual source material;
- `video-still`: meaningful source moment.

The selected asset must match the declared role, decode successfully, preserve a
deliberate crop, and remain legible in a full-page capture. The hero asset is not
repeated later. A generic faux dashboard is not a substitute for missing evidence.

If the required asset is weak, blurry, broken, or absent, the renderer keeps the
page and selects the grammar's intentional no-asset treatment. It may create a
source-grounded diagram or type-led proof composition, but never an empty box.

## 7. Typography and density

- Use no more than two verified font families.
- Use a distinct display/body pair only when the harvest can deliver both safely.
- Typical desktop ranges: 72–100px hero, 48–72px section heading, 24–36px local
  heading, and 17–20px body.
- Display line height stays approximately 0.95–1.10; body copy stays around 1.45–1.65.
- Use no more than one uppercase micro-label per section.
- Cards exist only for decisions, cited proof, or independent artifacts.
- Repeated layouts may appear at most twice in sequence.
- Use one shared grid so headings, media, dividers, and actions align.

Copy and layout are coupled. Long copy triggers editing or a different composition;
it does not silently shrink type until the page looks miniature.

## 8. Visual rhythm and motion

Alternate visual compression and release. A dense proof, interactive, or workflow
section should be followed by a calmer editorial or media-led section. Avoid long
stretches of small headings, outlined boxes, and empty canvas.

Use one dominant visual moment every one to two viewports. A seven-section page
should normally contain at least three distinct section compositions.

Motion communicates state or spatial relationship. Use restrained entrance,
selection, and reveal motion between 120 and 420ms. Respect reduced-motion
preferences. Decorative glow, orbit, or pulse does not compensate for weak
composition.

## 9. Advisory visual review and bounded repair

Visual review—including the proposed Q8 visual-quality check—is a diagnostic,
not a hard gate. It may score and record:

- brand fidelity;
- asset integrity;
- composition and whitespace;
- typography and legibility;
- color cadence and visual rhythm.

Suggested interpretation:

- **85–100:** render and continue without visual repair.
- **70–84:** render immediately; run a repair only when the reason is specific and
  the 60-second budget allows it.
- **Below 70:** render the best current artifact; retain it while one bounded repair
  or rerun may improve the named defect.

No score suppresses preview, claim, save, or publication. The current artifact
stays visible during repair. The review stores safe reason codes rather than raw
customer inputs or screenshots in ordinary analytics.

Preferred deterministic repairs include:

- remap accent-heavy headings or sections to verified ink and surfaces;
- replace a broken or blurry asset with the next verified candidate;
- switch an empty media composition to an intentional no-asset grammar;
- correct on-color text or CTA contrast;
- shorten copy or choose a denser composition instead of shrinking type;
- vary a repeated section composition while preserving the story and evidence.

If repair fails or time expires, keep the original usable artifact. Product
readiness is governed by valid structure, source safety, stale-result protection,
and lifecycle state, not an aesthetic score.

## Review checklist

Before calling a generated page visually ready, ask:

1. Is the visual owner obvious?
2. Are applied brand roles evidenced and used semantically?
3. Does the first viewport have one clear promise, action, and visual anchor?
4. Does each section have one job and a different enough composition?
5. Are visuals authentic, legible, role-correct, and free of empty boxes?
6. Does the page alternate color, density, and scale without accent flooding?
7. Can the full-page screenshot still be understood at thumbnail scale?
8. Would a bounded repair improve a named defect without hiding the current page?

## Implementation boundary

This contract extends D-026 through D-030, D-033, and D-035. It does not alter
source grounding, generation fingerprints, provisional/final state, claim gating,
analytics privacy, expiration, or publication semantics. Implementation should
use the existing canonical renderer, shared primitives, and six visual grammars.
