# Execution Contract

## 1. User-visible promise

A visitor supplies a seller domain and a small number of campaign signals. Folloze returns one polished, seller-branded, customer-ready desktop experience in less than 60 seconds. The interface asks one material question at a time while research runs in the background. The visitor sees only useful recommendations, a compact Live Brief, truthful status, and the generated experience.

## 2. Eleven-step production process

```text
01 Normalize domain, company identity, aliases, and revision fingerprint
02 Create or revise session; cancel/ignore stale work
03 Start seller brand harvest and source screenshot analysis
04 Research company, offer, audience, category, proof, target, and supplied source
05 Reconcile evidence into one material Live Brief
06 Rank Launch, Guide, or Align and lock one backend decision
07 Build the evidence-bounded message spine and section plan
08 Write section candidates in bounded parallel slots; run factuality/copy edit
09 Compile BrandSystemV2 + ExperienceSpecV2 through existing adapters
10 Render, validate, and run one fail-soft content/visual repair
11 Reveal app-hosted HTML and stream only current-revision refinements
```

## 3. State and revision model

```text
typing
  -> domain_stable
  -> researching
  -> brief_material
  -> brand_ready | brand_help_required
  -> family_locked
  -> composing
  -> provisional_ready
  -> refining
  -> final_ready
```

- Every input mutation increments `session.activeRevision`.
- Only artifacts matching the active revision may change the brief, recommendations, family decision, spec, or preview.
- Stale work resolves as `stale`; it never overwrites the visible page.
- Optional worker timeout produces a typed fallback and cannot extend the 60-second attempt.
- A missing trustworthy brand produces `brand_help_required`, not fake customer branding.
- The Live Brief and research receipts may remain visible while waiting for brand assets.

## 4. Canonical family contract

```ts
type WireframeFamilyV2 = "launch" | "guide" | "align";

type ExperienceSubtypeV2 =
  | "product"
  | "offer"
  | "solution"
  | "industry"
  | "event"
  | "webinar"
  | "account";

type WireframeDecisionV2 = {
  version: 2;
  sessionId: string;
  revision: number;
  family: WireframeFamilyV2;
  subtype: ExperienceSubtypeV2;
  confidence: "high" | "medium" | "low";
  factors: readonly WireframeFactor[];
  evidenceRefs: readonly string[];
  sectionPlan: readonly SectionSlotV2[];
  reasonCode: string;
  locked: true;
};
```

The family is a production contract, not a prospect-facing label. Trace and QA may expose it; the generated page may not.

## 5. Selection order

1. Normalize requested motion and subtype.
2. Read material evidence: offer maturity, audience specificity, named-account context, event intent, proof density, content volume, asset inventory, and brand density.
3. Map promotional or registration intent to Launch.
4. Map education, category, industry, solution, or evaluation intent to Guide.
5. Map named-account relevance and account-specific first-decision intent to Align.
6. Resolve ties with deterministic factor weights and stable reason codes.
7. Choose the smallest coherent section composition between four and eight sections.
8. Lock the decision before section writers begin.

The model may rank bounded candidates, but it may not create a fourth family, invent geometry, or select randomly.

## 6. Parallel production lanes

### Lane A: identity and revision

- Canonicalize domain, subdomain, aliases, redirects, and company display name.
- Create one revision fingerprint.
- Start all other lanes once the domain is recognizable.

### Lane B: brand and assets

- Brandfetch identity/logo metadata.
- Official DOM/CSS semantic tokens.
- Desktop screenshot visual proportions and geometry.
- Portable public font determination or safe substitute.
- First-party image candidate collection and purpose-based scoring.
- BrandSystemV2 reconciliation.

### Lane C: company, offer, and proof research

- Official company positioning and category.
- Homepage navigation, product, solution, industry, event, and resource discovery.
- Supplied URL/document/text as highest-priority offer evidence.
- Relevant approved proof and product evidence.

### Lane D: audience and buying-group research

- Actual buyer roles, functions, jobs, decision criteria, triggers, and objections.
- Named-account context for Align only.
- Evidence-backed candidate audiences with rationale and provenance.

### Lane E: family and message strategy

- Evidence reconciliation.
- Family/subtype ranking and section-slot plan.
- Message spine and proof plan.
- CTA selection from the bounded library.

### Lane F: production and edit

- Section writers operate only on assigned slots and shared typed context.
- Copy/factuality editor removes unsupported claims, repetition, jargon, and vague CTAs.
- Compiler validates the complete current-revision spec.

### Lane G: render and acceptance

- Existing renderer produces the app-hosted page.
- Structural, claim, image, visual, accessibility, and timing checks run.
- One bounded repair may fix the artifact; a repair may not change evidence authority or active revision.

## 7. Typed worker boundary

```ts
type ProductionArtifactV2<T> = {
  worker: WorkerKindV2;
  sessionId: string;
  revision: number;
  status: "complete" | "fallback" | "timed_out" | "failed" | "stale" | "needs_input";
  value?: T;
  evidenceRefs: string[];
  confidence: number;
  startedAt: string;
  completedAt: string;
  fallbackCode?: string;
  errorCode?: string;
  userRequest?: {
    kind: "logo" | "brand_guide" | "screenshot" | "source_url";
    prompt: string;
  };
};
```

Workers never mutate UI state, session storage, or HTML directly. The coordinator validates artifacts, checks revision, records privacy-safe receipts, and compiles the canonical spec.

## 8. Timing budget

| Work | Soft deadline | Hard behavior |
| --- | ---: | --- |
| Domain stabilization | 300–600ms | Research starts before explicit confirmation. |
| Identity + Brandfetch | 8s | Stream identity/logo receipt as available. |
| DOM/CSS + screenshot | 15s | Upgrade geometry and imagery when current. |
| Company/offer/audience/proof | 20s | Specific suggestions update with evidence. |
| Family + section-plan lock | 5s | Deterministic fallback is immediate. |
| Message and section writing | 20s | Parallel by slot after strategy lock. |
| Compile + render + validation | 5s | Optional work cannot block. |
| Model refinement | 30s maximum | Cannot replace a newer revision. |
| Attempt cutoff | 60s | No new provider work starts. |

Budgets are parallel wall-clock ceilings, not sequential allocations. Preserve the existing provisional lifecycle only when it meets minimum-safe brand truth. A neutral research shell is not a customer-ready branded preview.

## 9. Compatibility and migration

- Preserve existing `UseCase = abm | campaign | content`; do not conflate intake mode with family.
- Add a versioned decoder for persisted `account | campaign | content` wireframe families.
- Preserve legacy drafts and renderers through compatibility adapters.
- Add `WireframeDecisionV2` and family-specific section plans without changing existing persisted data in place.
- Keep legacy fields synchronized at the production-draft adapter until all callers migrate.
- Compile through the current `ExperienceSpecV2`; do not create a parallel page schema.
- Preserve current analytics event names where consumers exist; add version/family/reason fields rather than replacing events.

## 10. Brand intervention behavior

When brand evidence is incomplete:

1. continue safe official-source and company research;
2. show the normalized company name and an honest brand research state;
3. do not claim `matched`, `official`, `verified`, or customer-ready branding;
4. do not render generic colors as the seller palette;
5. ask: `We found the company, but we need a clearer brand source. Add a logo, brand guide, screenshot, or a more specific page URL.`;
6. accept the minimum requested asset and resume the current revision;
7. preserve earlier research so the visitor does not start over.

## 11. Suggestion behavior

- Campaign/offer recommendations must name a real product, solution, event, industry motion, or evidence-supported buyer outcome.
- Audience recommendations must name actual buyer roles/functions and explain their buying job.
- Display two or three choices only when at least two pass specificity and evidence thresholds.
- Otherwise display one clear free-form field and a product/source URL path.
- Do not display generic placeholders such as `Business transformation leaders`, `Operations teams`, `Solution overview`, or `Evaluation questions`.
- A selected recommendation writes its evidence refs and revision into the Live Brief.

## 12. Logging and privacy

- Record worker start/end/status/duration, revision, evidence IDs, family decision, reason code, section plan, fallback code, error code, render milestones, and QA results.
- Product analytics records user-visible interactions and current-revision timing.
- Operational traces and behavior analytics remain separate.
- Do not log raw source bodies, model prompts/responses, uploaded files, email, URLs containing sensitive query data, provider messages, tokens, or credentials.

## 13. Implementation waves

### Wave 1: shared contracts and compatibility

- Add family/section/worker/brand types and decoders.
- Add deterministic family ranker and event→Launch mapping.
- Add tests before changing render behavior.

### Wave 2: research and brand evidence

- Build deterministic query planning and source reconciliation.
- Extend current harvester outputs into complete BrandSystemV2 evidence.
- Implement first-party image purpose selection and brand-help intervention.
- Tighten offer/audience suggestion thresholds.

### Wave 3: message and page families

- Implement Launch, Guide, and Align section-plan contracts.
- Generate the message spine before section prose.
- Run bounded parallel writers after the plan locks.
- Add adversarial copy/factuality edit.

### Wave 4: UX and renderer integration

- Keep the streaming chat and Live Brief.
- Add brand-help request/resume state.
- Compile through ExperienceSpecV2 and existing renderers.
- Ensure customer-readable navigation and no internal labels.

### Wave 5: acceptance and autoresearch

- Run deterministic fixture matrix.
- Capture desktop first viewport and full-page evidence.
- Score baseline and bounded variants.
- Repair verified blockers without weakening gates.
- Update acceptance matrix and handback.

## 14. Scope boundary

This wave does not build personalization variants, Content Magic, Folloze publication, vanity routing, lead email automation, mobile/tablet preview modes, infrastructure migration, new credentials, or production deployment.
