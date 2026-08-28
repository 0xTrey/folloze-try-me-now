# Unified architecture

## Governing hierarchy

The runtime must separate six decisions that are currently too easy to blur:

```text
Visitor inputs
  -> Evidence Graph
  -> Campaign Thesis
  -> Strategy candidates and selection
  -> Page recipe
  -> Section briefs and section copy
  -> Composition family and brand system
  -> ExperienceSpecV2
  -> Final HTML
```

Each layer has one authority.

| Layer | Decides | Must not decide |
| --- | --- | --- |
| Evidence Graph | what is known, inferred, unknown, and permitted | page argument or layout |
| Campaign Thesis | the buyer, tension, promise, mechanism, proof, objection, action, and optional why-now | prose or geometry |
| Strategy selection | which complete argument wins | arbitrary new evidence or CSS |
| Page recipe | semantic sequence and section jobs | visual styling |
| Section writers | buyer-facing copy for one assigned job | unsupported facts or section order |
| Composition family | visual rhythm and component arrangement | campaign strategy |
| Brand system | semantic tokens, typography, geometry, buttons, and assets | messaging claims |
| Renderer | deterministic HTML from the approved spec | strategy or copy generation |

## Base experience, not generic experience

The first output is the canonical base experience. It is highly specific to the seller, offer, actual buyer, objective, evidence, and brand. It is not an account-personalized variant yet, but it must fail the logo-swap test: another competitor cannot replace the seller name and keep the argument intact.

Personalized variants become patches against this base in a later release. They do not block this release.

## Evidence Graph

The current evidence ledger is a strong foundation. Extend it into an executed research result rather than only a query plan.

```ts
type EvidenceGraph = {
  schemaVersion: "1.0";
  revision: number;
  inputFingerprint: string;
  entities: Array<{
    id: string;
    kind: "seller" | "offer" | "audience" | "proof" | "category" | "source";
    canonicalName: string;
    aliases: string[];
  }>;
  claims: Array<{
    id: string;
    subjectId: string;
    claim: string;
    status: "fact" | "inference" | "unknown";
    confidence: "high" | "medium" | "low";
    sourceAuthority: string;
    sourceRef: string;
    allowedUses: string[];
    prohibitedUses: string[];
    buyerFacing: boolean;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    kind: string;
    evidenceRefs: string[];
  }>;
  gaps: string[];
  timings: Record<string, number>;
};
```

Rules:

- Execute the existing bounded research plan against current approved sources.
- Reconcile duplicate and conflicting findings before thesis compilation.
- Preserve source authority, confidence, buyer-facing permission, allowed uses, and prohibited uses.
- Do not copy raw source bodies into trace, analytics, or public payloads.
- A research timeout narrows the claim set. It does not invent a replacement fact.

## Campaign Thesis

The Campaign Thesis is the single internal message authority. It is compiled once per active revision.

```ts
type ThesisField = {
  value?: string;
  evidenceRefs: string[];
  confidence: "high" | "medium" | "low";
  status: "fact" | "inference" | "unknown";
  buyerFacing: boolean;
};

type CampaignThesis = {
  schemaVersion: "1.0";
  revision: number;
  seller: ThesisField;
  offer: ThesisField;
  audience: ThesisField;
  audienceJob: ThesisField;
  currentState: ThesisField;
  desiredOutcome: ThesisField;
  promise: ThesisField;
  mechanism: ThesisField;
  proof: ThesisField;
  objection: ThesisField;
  nextAction: ThesisField;
  whyNow?: ThesisField;
  unknowns: string[];
};
```

Validation is recipe-aware. Missing `whyNow` is valid and omitted. A product or solution recipe cannot proceed without a real seller, offer, buyer job, promise, mechanism, and next action. Proof may be framed as an evaluation question when evidence is incomplete, but it may never be invented.

## Strategy candidates

Compile three complete arguments from the thesis:

1. outcome-led;
2. tension-led;
3. mechanism or proof-led.

The existing fourth angle may remain when evidence supports a materially different argument. Headline variations do not count as different strategies.

Hard failures run first:

- wrong identity;
- missing required thesis field;
- dangling or prohibited evidence use;
- unsupported claim;
- audience-free or offer-free argument;
- CTA that does not resolve the framed decision.

Valid strategies are ranked on audience recognition, offer specificity, differentiation, narrative coherence, evidence fit, objection handling, and CTA continuity. Use bounded pairwise comparison or a deterministic rubric. Persist the winner, rejected alternatives, dimension results, and concise reason codes.

## Recipe model

Strategic family, page recipe, and composition family are separate.

```text
Strategic family: Launch | Guide | Align
Page recipe:      Product/Solution | Problem/Category | Use Case/Workflow |
                  Content/Resource | Event/Webinar | Customer Proof
Composition:      current bounded visual family and archetype metadata
```

Define all six recipe contracts now. Activate only Product/Solution in production in this release. Existing paths that do not map to the activated recipe retain their current behavior until a later benchmarked activation.

The Product/Solution recipe contains four to seven sections selected from this semantic progression:

1. Recognize the buyer and promised outcome.
2. Name the current constraint in the buyer's language.
3. Explain the seller's distinct mechanism.
4. Show the most relevant use cases or workflow.
5. Establish proof or a credible validation path.
6. Answer the highest-value objection when evidence permits.
7. Make the next action feel like the logical continuation.

Section count follows argument needs. It is never filled to satisfy a template quota.

## Section Brief

Extend the current `SectionWriterBrief` instead of creating a parallel writer system.

```ts
type SectionBrief = {
  sectionId: string;
  semanticJob: string;
  buyerMovement: string;
  previousConclusion?: string;
  nextSetup?: string;
  thesisFields: string[];
  requiredEvidenceRefs: string[];
  optionalEvidenceRefs: string[];
  prohibitedClaims: string[];
  prohibitedIdeas: string[];
  allowedCtas: string[];
  visualRole: string;
  wordBudget: { headline: [number, number]; body: [number, number] };
};
```

Each section gets only the thesis fields and evidence allowed for its job. The section must move the buyer from one explicit belief or question to the next.

## Production authority

The live production path must use the dedicated section-model client when configured. A reviewed production result must not be overwritten by an earlier global draft, hero, or deterministic copy field.

The authority order is:

1. model section candidate that passes all gates;
2. one bounded model repair that passes all gates;
3. prevalidated deterministic final recipe copy;
4. recoverable failure when no final artifact can pass.

No raw prompt directive, internal label, evidence instruction, placeholder, or procedural copy may reach the rendered page.

## Copy review

Review has two layers.

### Hard gates

- schema and contract validity;
- evidence resolution and allowed use;
- identity and offer correctness;
- no invented facts, proof, metrics, urgency, or customer claims;
- no placeholders, internal jargon, or prohibited terminology;
- no duplicate or near-duplicate claims across sections;
- word and component budgets;
- safe HTML and URL constraints.

### Persuasion ranking

- actual buyer recognition;
- concrete seller and offer specificity;
- differentiated mechanism;
- narrative contribution to the whole page;
- credible evidence use;
- clear language;
- objection usefulness;
- CTA continuity.

A weak persuasion score triggers one bounded repair or selects a stronger valid candidate. It does not weaken factuality gates.

## Final-only lifecycle

Internal drafts are permitted. Public provisional HTML is not.

```text
queued
  -> researching
  -> planning
  -> writing
  -> checking
  -> finalizing
  -> ready(final)
```

Only `ready(final)` exposes HTML. A new input revision hides any older artifact for that request and invalidates late work through the existing fingerprint and attempt fencing.

Target budget:

| Phase | Customer-visible language | Deadline |
| --- | --- | ---: |
| Session and route | Preparing the build | 2s |
| Brand and research | Reading the brand, offer, and buyer context | 15s |
| Thesis and recipe | Choosing the strongest story for this buyer | 22s |
| Section production | Writing the buyer journey | 44s |
| Review and repair | Checking the claims, flow, and brand treatment | 52s |
| Persist and read back | Finalizing the experience | 59s |
| Reveal | Final HTML | 60s |

Reserve at least five seconds for render, persistence, and readback. Provider work must share one deadline and stop before the finalization reserve.

Failure rules:

- Missing optional enrichment reduces available claims.
- Invalid model output uses the prevalidated deterministic final recipe.
- If the deterministic result also fails, show a recoverable failure with a support reference and the smallest next action.
- Never call a draft final because the deadline expired.
- Never expose unpersisted HTML.

## Visible experience

The storyboard influences the shell, not the page strategy.

### Intake

- One central conversational surface.
- One question at a time: company, offer, audience, outcome, optional source.
- Completed answers collapse into compact editable receipts.
- Recommendations must be evidence-backed and company-specific.
- Brand confirmation shows the real company name, logo, and honest evidence status.

### Build

- Preserve one stable full-height shell.
- Show one active task and completed receipts, not fake percentages.
- Use active verbs: reading, grounding, choosing, writing, checking, finalizing.
- Use blue for active, green for complete, gray for queued.
- Provide explicit working, slow, failed, and complete states.
- Slow state confirms the inputs are safe and names the current task.
- No HTML preview, skeleton page, or partial copy appears.

### Reveal

- Transition from the same shell into a full-frame desktop experience.
- Make the generated page the visual hero.
- Show one clear final state and one route back to the brief.
- Do not add analytics, personalization, save, publish, or Content Magic panels in this release.

### Composition rule

Never use an eyebrow, headline, and explanatory dek as a stacked unit. Use one direct headline, then place supporting context in a separate body or status block.

## Diagnostics

Private BuildTrace must record:

- evidence graph version and digest;
- research queries and typed outcomes by code, not raw bodies;
- Campaign Thesis version, field confidence, evidence refs, and digest;
- strategy candidate IDs, dimensions, failures, winner, and reason codes;
- recipe and composition selection with rejected alternatives;
- each section job, prompt version, writer source, candidate count, rejection codes, repair status, evidence refs, output digest, and duration;
- quality-gate results;
- render, persistence, readback, and total timing;
- active revision, fingerprint, attempt ID, and fallback codes.

PostHog remains behavior-only and nonblocking. It must not receive raw domains, URLs, email, source text, prompts, copy, evidence, trace IDs, or support references.

## Decision impact

This package supersedes the customer-facing provisional behavior in D-026, D-030, and D-035. The 60-second limit, progressive work receipts, stale-result protection, evidence truth, and final save boundary remain. D-036 remains advisory for visual quality, but a public artifact still must be structurally valid, truthful, persisted, and marked final.
