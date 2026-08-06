# Try Me Now Wireframe Library Strategy

## Decision

Build a small repository of structural archetypes for account and campaign experiences, but do not maintain ten or twelve independent page implementations.

Each archetype should compose the same hardened primitives from the canonical `ExperienceSpec`:

- brand lockup and navigation;
- opening promise and primary action;
- credibility anchor;
- urgency or why-now sequence;
- three starting points;
- mechanism or operating model;
- role-specific value;
- evidence and resources when genuine;
- scoped next step;
- analytics bridge and save lifecycle.

`BrandDesignDNA` controls the source-faithful presentation layer: palette roles, typography, button geometry, card treatment, spacing density, imagery treatment, surface strategy, and restrained source motifs. The archetype controls information hierarchy and composition. The brand profile must never select or invent the business story.

## Account experience archetypes

1. **Executive account narrative**
   - Use when the target account story is strategic and cross-functional.
   - Lead with the account opportunity, then the business tension, operating mechanism, role implications, and working-session CTA.

2. **Technical validation path**
   - Use when the audience is architecture, security, data, IT, or platform leadership.
   - Lead with the technical outcome, then current-state constraints, architecture or workflow, validation questions, and a scoped technical session.

3. **Buying-committee alignment**
   - Use when three or more roles influence the decision.
   - Lead with the shared outcome, then role-selectable paths, common proof, decision dependencies, and a multi-stakeholder workshop.

4. **Proof-first account case**
   - Use when strong first-party mechanisms, approved customer evidence, or account-specific source material exists.
   - Lead with verified proof, then explain why it matters for the target, the mechanism behind it, and the next decision.

5. **Innovation workshop invitation**
   - Use for emerging initiatives where discovery matters more than a fixed product pitch.
   - Lead with the opportunity, then hypotheses, exploration paths, what the teams would map together, and the workshop deliverable.

## Campaign experience archetypes

1. **Product introduction**
   - Lead with the product promise, operating change, use-case paths, mechanism, proof, and first-use-case CTA.

2. **Demand and category education**
   - Lead with the market or operating shift, the cost of the status quo, three problem lenses, a better model, and an education-focused next step.

3. **Event or webinar invitation**
   - Lead with why the session matters, reasons to attend, agenda or takeaways, speaker or source proof, and registration intent.

4. **Use-case solution campaign**
   - Lead with one buyer job, then workflow stages, role value, proof requirements, and a scoped solution conversation.

5. **Customer proof campaign**
   - Lead with an approved outcome or story, then the before/after mechanism, evidence, relevance by role, and a proof-oriented next step.

6. **Launch follow-up or nurture**
   - Lead with what changed, then choose-your-interest paths, supporting resources, evaluation questions, and the next useful action.

## Selection rules

Archetype selection must be deterministic and visible in the Live Brief.

- Use case chooses the family: account or campaign.
- Objective and source type choose the archetype.
- Audience changes messaging emphasis, not page geometry.
- Evidence availability can promote a proof-first archetype; it cannot fabricate proof.
- Brand design evidence changes the visual system, not the archetype.
- A visitor may change the archetype before generation.
- Regeneration must preserve explicitly selected archetypes and locked content.

## Implementation model

Represent each archetype as configuration, not copied HTML:

```ts
interface WireframeArchetype {
  id: string;
  family: "account" | "campaign";
  intent: string;
  sectionOrder: readonly string[];
  heroComposition: string;
  emphasis: readonly string[];
  evidencePolicy: string;
  closingPattern: string;
}
```

The renderer owns the shared sections and responsive behavior. An archetype may reorder or specialize supported sections, but it must not introduce private CSS forks, one-off analytics events, or company-specific code.

## QA contract

Every archetype must pass the same checks:

- desktop scroll and full-screen behavior;
- harvested brand-token application;
- accessible headings, tabs, buttons, and focus states;
- no unsupported proof or empty media placeholders;
- analytics events from every interactive primitive;
- deterministic rendering from the same `ExperienceSpec`;
- anonymous preview and save lifecycle;
- screenshot and computed-style evidence at the supported desktop breakpoint.

Start with three account and three campaign archetypes. Add the remaining archetypes only after the first six pass production QA with multiple unrelated brands. This is a sequencing constraint, not a smaller product vision.
