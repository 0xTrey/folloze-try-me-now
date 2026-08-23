# Wireframe and Copy Contract

## 1. Shared page grammar

All three families use a reviewed desktop grammar:

- four to eight sections;
- six-section default;
- one dominant idea per section;
- one primary exploration device per page;
- sticky customer-readable navigation;
- alternating compression and release rather than repeated identical grids;
- one verified seller lockup and one dominant CTA hierarchy;
- one or two first-party images selected by purpose;
- minimum 16px body copy and readable full-page capture;
- no prospect-facing family/template language.

Every section slot declares:

```ts
type SectionSlotV2 = {
  id: string;
  role: SectionRoleV2;
  buyerJob: string;
  claimType: "fact" | "implication" | "hypothesis" | "instruction";
  requiredEvidenceKinds: EvidenceKind[];
  optional: boolean;
  wordBudget: { headline: [number, number]; body: [number, number] };
  visualRole: VisualRoleV2;
  interaction?: InteractionRoleV2;
  allowedCtas?: CtaId[];
};
```

Writers receive slots after the family decision locks. They do not invent new sections, geometry, or interactions.

## 2. Launch

Use for product, offer, event, and webinar promotion.

### Selection signals

- announcement, demand, registration, or offer intent;
- named product/event/offer;
- direct conversion objective;
- usable product/event imagery;
- concrete use cases or agenda.

### Default composition

1. **The buyer outcome**
   - Job: make the promoted change immediately valuable.
   - Headline formula: `[buyer outcome] without [specific friction]`.
   - Support: name the product, offer, event, or webinar and its mechanism.
   - Visual: strongest product/context/event image.
   - CTA: Book a meeting or Register.
2. **Why the current approach breaks**
   - Job: make one recognizable problem and consequence concrete.
   - Formula: `[observed problem] creates [supported consequence]; [offer] changes [specific behavior]`.
   - Visual: evidence-led type, product context, or sourced diagram.
3. **How the change works**
   - Job: explain three steps as `action → capability → observable output`.
   - Visual: product UI, workflow, diagram, or step sequence.
   - Static by default. Interaction only when it changes comprehension.
4. **Three ways to use it**
   - Job: let real buyer jobs choose a relevant path.
   - Each path: `job → benefit → capability → validation question`.
   - Paths must be research-derived, not generic role labels.
5. **Reasons to believe**
   - Job: earn confidence.
   - Evidence order: approved outcome, sourced quantified claim, product demonstration, labeled validation plan.
   - Omit unsupported proof rather than invent it.
6. **The next useful move**
   - Job: restate the outcome and bound the first action.
   - Formula: `[outcome] + [scope/activity] + [deliverable]`.
   - One primary CTA; optional resource CTA only when a real resource exists.

### Event/webinar subtype changes

- Hero names the event and the buyer outcome.
- Replace mechanism with a three-part agenda or learning path.
- Use speaker/session proof only when verified.
- CTA is Register only when registration intent/destination is valid; otherwise Explore the use case or Book a meeting.

## 3. Guide

Use for solution, industry, category, and evaluation education.

### Selection signals

- educational or evaluation objective;
- category/industry complexity;
- multiple decision criteria;
- strong explanatory source material;
- consultative rather than transactional CTA.

### Default composition

1. **What changed**
   - Job: establish a sharp point of view and the decision now possible.
   - Formula: `[change] makes [old approach] insufficient; evaluate [better decision]`.
   - Seller is the authority, not the headline subject.
2. **What is at stake**
   - Job: connect two or three business consequences.
   - Each item: `[stake] matters because [implication]`, ending with a buyer question.
   - Use one composed argument, not a generic feature-card grid.
3. **What to evaluate**
   - Job: give three or four plain-language criteria.
   - Formula: `[criterion] means [observable test]`.
   - Keep the framework unbranded unless the seller owns an established name.
4. **How the solution answers it**
   - Job: map criteria to real capability and decision change.
   - Formula: `If you need [criterion], use [capability] to produce [observable result]`.
5. **Where it applies**
   - Job: show three evidence-supported scenarios or roles.
   - Each: `trigger → decision → desired outcome`.
   - No generic personas.
6. **Continue the evaluation**
   - Job: give evidence/resources and a consultative next step.
   - Formula: `[evidence/resource] answers [question]`.
   - Default CTA: Book a working session.

## 4. Align

Use for named-account or ABM relevance.

### Selection signals

- named target account;
- account-specific public evidence;
- target-specific priority, initiative, or question;
- multi-role evaluation;
- working-session or validation objective.

### Default composition

1. **The shared priority**
   - Job: explain why this account-specific page exists.
   - Formula: `[target-specific priority] could improve [outcome]` with seller mechanism in support.
   - Use verified seller/target logos; missing target logo becomes normalized text.
2. **Why it matters here**
   - Job: connect two or three public target observations to relevance.
   - Each: `observed fact → target implication → seller capability or labeled hypothesis`.
3. **The opportunity to align**
   - Job: state one joint opportunity and three practical workstreams.
   - Each: `[workstream/action] → [observable output]`.
   - Do not promise transformation.
4. **Choose a priority**
   - Job: provide three target-specific role or priority paths.
   - Each path must change the question, proof, and next step.
   - When evidence is weak, show questions to validate rather than invented roles.
5. **Relevant proof or validation plan**
   - Job: establish confidence relevant to the target's industry/use case.
   - Prefer target-relevant proof; otherwise product evidence plus a proposed validation agenda.
   - Generic seller proof appears only when relevance is explicit.
6. **The first working decision**
   - Job: make the first session concrete.
   - Formula: `In a [scope] session, we will [activity] and leave with [deliverable/decision]`.
   - CTA: Book a working session or Plan a validation session.

## 5. Optional sections

The ranker may add at most:

- one **Proof depth** section when evidence inventory contains multiple relevant proof artifacts;
- one **Resource** section when a verified resource answers a material buyer question.

The ranker may remove a default section when evidence is insufficient or the buyer job is redundant. It may not use optional sections to repeat the hero or inflate page length.

## 6. CTA library

| ID | Label | Use |
| --- | --- | --- |
| `book_meeting` | Book a meeting | Direct product/solution demand. |
| `book_working_session` | Book a working session | Consultative evaluation or Align. |
| `register` | Register | Verified event/webinar registration intent. |
| `explore_use_case` | Explore the use case | Low-friction product or educational exploration. |
| `review_evidence` | Review the evidence | Proof-led page with a real evidence destination. |
| `plan_validation` | Plan a validation session | Complex technical or multi-role sale. |

The system chooses label and visual treatment; this demo does not require a live destination. The button may be visually demonstrated without navigating.

## 7. Copy-generation order

1. Map every usable fact and visitor input to a stable evidence ID.
2. Build one message spine: audience, problem, promise, mechanism, proof plan, decision help, next action.
3. Compare supported angles: status-quo tension, business upside, and differentiated mechanism.
4. Select a family and section plan.
5. Run bounded section writers against explicit slots.
6. Run one copy/factuality editor over the complete page.
7. Reject or repair only the failed sections; do not regenerate the whole page blindly.

## 8. Section writing rules

- One idea per section.
- Headline: usually 5–12 words, active and specific.
- Body: usually 25–60 words per paragraph.
- Every claim follows `claim → buyer implication → evidence or action`.
- Name a mechanism instead of substituting adjectives.
- Use company-specific offers and buyer roles.
- Phrase inference as implication, hypothesis, or question.
- Make every CTA name what the buyer receives.
- Vary rhythm and visual density across sections.

## 9. Rejection gates

- **Competitor swap**: if a competitor name can replace the seller unchanged, copy fails.
- **Account swap**: if another target can replace the account unchanged, Align copy fails.
- **New information**: every section must add a material idea.
- **So what**: facts must include a buyer implication.
- **Evidence resolution**: factual claims must resolve to evidence IDs.
- **Ten second**: audience, offer, outcome, and next action must be obvious.
- **CTA**: CTA matches objective and names the result.
- **Image relevance**: each image supports the adjacent claim.
- **Plain language**: internal production labels and banned phrases fail.
- **No fake urgency**: deadlines, market pressure, or superiority require evidence.

## 10. Visual anti-patterns

- repeated generic three-card grids;
- multiple competing interactive widgets;
- huge centered headlines with no evidence or visual anchor;
- uniform oversized radii regardless of seller geometry;
- empty media frames or decorative gradients standing in for imagery;
- duplicated website image crops;
- target branding overriding seller design;
- generic stock imagery or generated fake product UI;
- unexplained charts, diagrams, icons, or scores;
- buyer-facing production receipts, quality grades, template names, or debug language.
