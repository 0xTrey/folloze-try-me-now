# Seven-Section Experience Framework

## Scope

The seven-section framework is the canonical buyer-facing contract for:

- one-to-one account experiences;
- product, demand-generation, and event campaign pages.

Content Magic deliberately keeps its existing source-companion contract until its replacement is designed. Existing saved account and campaign drafts without the new framework also remain renderable through the legacy path.

## The seven buyer jobs

| Order | Section | Job | Copy contract | Visual contract |
| --- | --- | --- | --- | --- |
| 1 | The opening argument | Make one sharp promise to one audience | Outcome or tension, seller mechanism, and one specific CTA | Verified co-branding plus a relevant source-owned product or context image; otherwise use a strong type-led layout with no placeholder |
| 2 | The credibility anchor | Establish the strongest supported reason to believe | Verified fact followed by its buyer implication | Product UI, workflow, customer proof, cited chart, or source excerpt with explicit provenance |
| 3 | Why change now | Turn context into a reason to act without inventing urgency | Verified change, consequence, and better path | Evidence-led typographic or data treatment; no generic urgency image |
| 4 | Choose where to start | Give the buyer three real jobs to explore | Each choice has a buyer job, outcome, and separate validation question | Relevant product or workflow visual selected by purpose and asset type, not by array position |
| 5 | How the outcome is created | Make the seller mechanism concrete | Three or four steps, each expressed as action, capability, and observable output | Verified workflow, product, architecture, or process asset; otherwise type-led sequence |
| 6 | What each team needs to believe | Make the decision useful across functions | Three roles with distinct decision, risk, benefit, and evidence requirement | Cards or relevant product fragments; no generic headshots or stakeholder-map language |
| 7 | The first useful move | End with a bounded decision | Scope, activity, deliverable, resulting decision, and `verb + specific thing received` CTA | Concrete output list; decorative imagery is normally omitted |

## Family language

| Section | Account experience | Campaign page |
| --- | --- | --- |
| 1 | Opportunity for `{account}` | `{offer}` for `{audience}` |
| 2 | What is already working | Reasons to believe |
| 3 | Why now | Why this problem persists |
| 4 | Choose where to start | Choose a use case |
| 5 | How it works | What changes in practice |
| 6 | What each team needs | Value for your team |
| 7 | Map the first use case | Objective-specific action |

## Copy-generation pipeline

1. **Evidence mapper:** classify every usable item as seller fact, target fact, supplied-source claim, mechanism, genuine proof, or visitor input. Give each item a stable evidence ID.
2. **Message strategist:** write one message spine for the audience, account or context, offer, outcome, mechanism, and evidence.
3. **Angle competition:** compare status-quo tension, business upside, and differentiated mechanism. Select the strongest supported angle before drafting sections.
4. **Section writer:** draft the seven named contracts. Every section references evidence IDs and every visual receives an image brief with purpose, asset type, source, caption, and provenance.
5. **Creative and evidence edit:** remove repetition, improve rhythm and transitions, reject unsupported claims and fake urgency, and confirm the full page gives the buyer a new reason to believe.

The generated framework is stored in `ExperienceSpec.draft.persuasionFramework`. Legacy fields remain synchronized for compatibility, but the account and campaign web renderer uses the named framework whenever it is present.

## Rejection gates

- **Logo-swap:** replacing the target logo must break an account story.
- **Competitor-swap:** replacing the seller must break the mechanism and evidence.
- **New-information:** every section must add information rather than restate an earlier section.
- **So-what:** facts must be followed by implications.
- **Proof:** every evidence reference must resolve to the evidence map.
- **Ten-second:** the audience, offer, outcome, and next action must be obvious.
- **CTA:** the CTA must match the objective and name what the buyer receives.
- **Image relevance:** no broken image, generic placeholder, fake blueprint, or invented product UI.
- **Plain language:** ban “account thesis,” “decision path,” “decision lens,” “supporting proof,” “narrative arc,” “stakeholder map,” and “buying committee” from the new buyer-facing contract.

## Primary code references

- `src/lib/generation/experience-schema.ts`
- `src/lib/integrations/openai.ts`
- `src/lib/generation/experience-renderers.ts`
- `src/lib/generation/experience-template.ts`
- `src/lib/experience-contract.ts`
