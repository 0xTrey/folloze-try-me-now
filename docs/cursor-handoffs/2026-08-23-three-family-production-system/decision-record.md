# Decision Record

Date: August 23, 2026

## Product scope

1. Produce a generic campaign landing page for ABM, product, solution, industry, event, or webinar motions.
2. Build polished desktop experiences. Preserve baseline accessibility and responsive behavior, but do not add device preview controls.
3. Infer the motion and page family behind the scenes. The prospect never chooses a wireframe.
4. Build the generic experience first. Offer personalization variants only after the generic result is complete.

## Three families

1. **Launch**: product, offer, event, or webinar promotion.
2. **Guide**: solution, industry, category, or evaluation education.
3. **Align**: named-account or ABM relevance and a concrete first working decision.

`Align` replaces the proposed `Converse` label. It describes the buyer outcome without sounding like a chat UI or an internal sales motion.

## Page length and navigation

- Default to six sections.
- Permit four through eight when evidence and buyer complexity justify it.
- Allow at most one optional proof section and one optional resource section beyond the core composition.
- Use sticky, compact navigation with customer-readable labels derived from the selected sections.
- Hide family names, rank factors, confidence, worker names, evidence IDs, and production terminology from the buyer-facing page.

## First viewport

Every hero contains:

1. one verified seller lockup;
2. one specific buyer-facing headline;
3. one supporting sentence;
4. one CTA group;
5. one strong first-party image or an intentional type-led composition.

The hero does not contain cards, tabs, progress receipts, debug labels, template names, or explanatory UI.

## Brand requirements

Non-negotiable cues:

- logo;
- typography character and portable font choice;
- semantic color roles and observed proportions;
- button color, shape, border, typography, and hover behavior;
- card and control radius;
- border weight, shadow style, spacing, density, and maximum content width;
- navigation and hero geometry;
- one or two relevant first-party images;
- general imagery and motion character.

Inspect the official site DOM/CSS and a desktop screenshot. Extract five or six credible colors, then assign them semantic roles rather than painting the page with the loudest accent.

If a trustworthy logo and minimum brand system cannot be established, pause the customer-ready reveal and ask for a logo, brand guide, screenshot, or more specific source URL. Research may continue and the Live Brief may remain visible, but the system cannot claim the page is brand-matched.

## Interaction and CTA defaults

- Use one primary exploration device per page, plus ordinary navigation and CTA behavior.
- The bounded CTA library is:
  1. Book a meeting
  2. Book a working session
  3. Register
  4. Explore the use case
  5. Review the evidence
  6. Plan a validation session
- Default product/solution CTA: **Book a meeting**.
- Default Guide CTA: **Book a working session**.
- Default Align CTA: **Book a working session** or **Plan a validation session**, selected from the first decision promised by the page.
- Event/webinar CTA: **Register** only when event details and registration intent are supported.

## Launch defaults: questions 11–16

- Lead the headline with the buyer outcome. A product name may lead only when it is already recognizable and the headline still communicates a concrete buyer change.
- State a recognizable problem without inventing urgency.
- Make the mechanism static by default. Add interaction only when it improves comprehension or changes the evidence/next step.
- Derive three use-case paths from actual buyer research.
- Rank proof: approved customer outcome, sourced quantified claim, product demonstration, labeled validation plan.
- Use the bounded CTA library. Do not default to `Learn more` or `Get started`.

## Guide defaults: questions 17–22

- Lead with what changed, why the old decision frame breaks, and what better decision is possible.
- Compose stakes as a connected argument, not a generic feature grid.
- Keep evaluation criteria unbranded by default. Use a source-owned framework name only when it is established by the seller.
- Map every criterion to a real capability and observable decision change.
- Derive applications from actual roles, triggers, and decisions.
- Default the close to **Book a working session**.

## Align defaults: questions 23–29

- Use verified seller and target logos only. Target brand never controls seller design tokens.
- When target evidence is thin, frame a hypothesis or a question to validate. Never assert an unsupported priority.
- Connect public target observations to implications and seller capability with explicit provenance.
- Build one shared opportunity with practical workstreams. Avoid grand transformation language.
- Use target-specific roles or present questions to validate when role evidence is insufficient.
- Generic seller proof is allowed only when its relevance to the target is explicit; otherwise omit it.
- Default the close to a bounded working session and name the decision or deliverable.

## Copy constitution

Approved without exceptions:

- Headlines are specific, active, and usually 5–12 words.
- Body paragraphs are usually 25–60 words.
- Every section adds one new idea.
- Name the buyer, problem, mechanism, evidence, and next step concretely.
- Prefer verbs and nouns over abstractions.
- Reject copy that could fit a competitor unchanged.
- Every image supports the adjacent claim.
- Run a separate adversarial edit for specificity, repetition, evidence, headline quality, jargon, and CTA alignment.
- Ban `operating outcome`, `business fit`, `decision path`, `decision lens`, `supporting proof`, `narrative arc`, `stakeholder map`, `buying committee`, `seamless`, `transform`, `unlock`, `best-in-class`, `make progress with confidence`, `Introducing`, and unsupported `why now` language.

## Research defaults

- Begin research as soon as a domain is recognizable, before explicit confirmation.
- Run seller identity, brand, offer, audience, source, and market research concurrently under one revision.
- Search official navigation and product/solution/industry pages to infer actual offers.
- Build a deterministic query plan for actual buyer roles, buying groups, use cases, category, and proof.
- Prefer official sources. Use reliable third-party context only when it adds a necessary category fact and preserve provenance.
- Account proof may inform Align when it is verified and relevant.
- Suggestions shown to visitors must be evidence-backed and company-specific. Otherwise show free-form and URL input only.
