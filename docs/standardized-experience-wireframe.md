# Standardized Experience Wireframe

## Current implementation

The three Try Me Now paths use one reusable rendering system with family-specific labels and messaging. The current page order is more complicated than the sticky navigation implies.

| Order | Visible region | Drafted from | What it is meant to communicate | Current problem |
| --- | --- | --- | --- | --- |
| Global | Brand header and sticky navigation | Seller and target `BrandProfile`; `sectionLabels.close`; family navigation labels in `experience-renderers.ts` | Who the experience is from, who it is for, and how to move through it | ABM labels use internal language: “Account brief,” “Account thesis,” and “Decision paths.” |
| 1 | Overview / hero | `eyebrow`, `headline`, `subhead`, `primaryCta`, `audienceLabel`, and the selected hero asset | The single audience-specific promise: why this page is worth exploring | The promise can become broad if the target, offer, and outcome are not explicit. |
| 2 | Unnamed signature section | `narrativeArc` plus the eyebrow and headline from all three `sections` | A visual summary of the recommended buyer journey | This is the section shown in the screenshot. It is not named in the navigation. For ABM it is labeled “Decision paths for {account},” although it is only a preview of the three paths. |
| 3 | Account thesis / why it matters | `sectionLabels.thesis`, `thesisHeadline`, `thesisBody` | The account context, tension, and reason the audience should care now | “Account thesis” is strategy-team language rather than buyer language. |
| 4 | Interactive decision lenses | `sectionLabels.lenses`, three `signalLabels`, and the same three `sections` used above | Three distinct buyer questions or strategic angles; selecting one opens its detailed explanation | The navigation calls this “Decision paths,” while the in-page heading says “Choose the decision lens.” The same ideas were already shown in the signature section. |
| 5 | Supporting proof / resources | `ExperienceSpec.contentItems`; extracted source claims or, without a source artifact, clones of the same three narrative `sections` | Evidence, assets, and claims that validate the story | Without real evidence, narrative copy is relabeled as “proof,” causing the same ideas to appear a third time. |
| 6 | Next step / close | `sectionLabels.close`, `closingHeadline`, `closingBody`, and `primaryCta` | One clear action after the buyer understands the story | The structure is sound, but it should not introduce a second objective or repeat the hero. |
| Global | Footer and engagement instrumentation | Seller/target identity and the fixed analytics event contract | Ownership, context, and measurable engagement | This should remain structural and should not influence the messaging hierarchy. |

## How each section is drafted

1. `compileCampaignContext` locks the use case, audience, objective, CTA, structural labels, and legacy wireframe metadata.
2. The OpenAI generation prompt drafts the hero, thesis, narrative arc, three exploration sections, and close from the seller, target, offer/source, and audience evidence.
3. A deterministic family-specific draft is used when AI generation fails validation or times out.
4. The trust gate checks the draft, block edits are applied, and the result becomes the canonical `ExperienceSpec`.
5. The shared renderer turns that spec into the desktop page.

Primary code references:

- `src/lib/generation/campaign-context.ts`
- `src/lib/integrations/openai.ts`
- `src/lib/generation/experience-schema.ts`
- `src/lib/experience-contract.ts`
- `src/lib/generation/experience-renderers.ts`
- `src/lib/generation/experience-template.ts`
- `src/lib/orchestrator.ts`

## Why “Decision paths” is confusing

“Decision paths” is hardcoded renderer language. It currently describes two different things:

- the unnamed summary immediately below the hero; and
- the later interactive three-option module.

The generation contract separately calls the later region “Choose the decision lens.” Neither phrase tells a prospect what they can do. The intended meaning is simply: **choose one of three relevant topics to explore.**

## Recommended standardized wireframe

Keep one geometry for 1:1 ABM, campaign, and content experiences. Vary only the branding, evidence, labels, and generated messaging.

| Order | Recommended label | Job of the section | Content rule |
| --- | --- | --- | --- |
| Global | Built for `{account}` or experience-family label | Establish seller and target identity with verified logos | Always show verified brand identity; never use text in place of a missing logo without an explicit state. |
| 1 | Overview | Make one specific promise to one audience | Name the audience, problem or opportunity, seller mechanism, and outcome. |
| 2 | Why this matters | Explain the target/account context and consequence | Use account or source evidence. Do not repeat the hero. |
| 3 | What to explore | Let the visitor choose among three distinct buyer questions | Combine the current signature summary and interactive lens section into one module: three compact choices plus one active detail panel. |
| 4 | Evidence and resources | Validate the active story with real evidence | Show cited claims, uploaded content, or real assets only. If none exist, omit the region or call it “How it works”; never manufacture proof from narrative copy. |
| 5 | Next step | Offer one clear action | Match the page objective and preserve the selected CTA style. |

## Drafting rules for the standardized version

- Hero: one buyer-specific promise, not a category slogan.
- Why this matters: target context + consequence + why now.
- What to explore: three mutually distinct questions, not three restatements of the same capability.
- Exploration detail: problem, mechanism, outcome, and one validation question.
- Evidence and resources: sourced proof only, with provenance attached to every item.
- Next step: one action; no new narrative and no second objective.
- Every section must add new information. Reject generated drafts when a headline or supporting sentence substantially repeats an earlier region.

## Product decisions to lock before implementation

1. Use **What to explore** as the universal label, or vary it by family (for example, “Explore the offer” for campaigns).
2. Use a three-choice row with one active detail panel, or three stacked story modules. The recommended desktop pattern is the three-choice row plus active panel.
3. Omit the evidence region when no cited evidence exists, or replace it with an explicitly non-proof “How it works” region. Omission is the clearest default.
4. Replace “Account brief” with **Built for {account}** in 1:1 experiences.
5. Keep the sticky navigation at five buyer-readable stops: Overview, Why this matters, What to explore, Evidence and resources, Next step.
