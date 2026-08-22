# Execution Contract

## 1. Product boundary

The primary route builds a polished desktop campaign landing page for one of four inferred motions: ABM, product, solution, or industry. Event/webinar is a campaign subtype. The visitor never chooses a wireframe or sees the production team.

The conversation asks one material question at a time. For each field it offers:

1. one AI-generated recommendation marked **Recommended**;
2. two AI-generated alternatives;
3. one visible free-form response field.

Apply this pattern to:

- audience or target account;
- offer or topic;
- objective and CTA.

Recommendations must use current evidence and may update as background research improves. A recommendation is never a required selection.

## 2. Reuse before build

| Existing foundation | Required use |
| --- | --- |
| `src/lib/orchestration/*` | Extend current worker receipts, deadlines, single-flight, and revision fences. |
| `src/lib/generation/message-spine.ts` | Keep one evidence-bounded message strategy before section prose. |
| `src/lib/generation/wireframe-library.ts` | Rank reviewed archetypes internally; do not add a prospect-facing gallery. |
| `src/lib/generation/experience-schema.ts` | Compile all final work through the existing strict schema. |
| `src/lib/generation/experience-renderers.ts` | Keep trusted rendering and asset rules. |
| `src/lib/integrations/brand-harvester.ts` | Improve recovery and evidence, do not create a second harvester. |
| `src/lib/trace-store.ts` and product analytics | Add privacy-safe receipts; keep operational traces separate from behavior analytics. |
| `StreamingBriefComposer` and Live Brief | Preserve the guided chat surface and editable source of truth. |

Do not create a second orchestration model, second page schema, arbitrary model-generated CSS, or new public output runtime.

## 3. Eleven-step production process

```text
01 Normalize domain + company identity
02 Create/revise session and abort stale work
03 Harvest seller brand in parallel
04 Research company, offer, audience, source, and market context
05 Reconcile evidence into a material Live Brief
06 Rank and select one messaging framework
07 Build message spine; write and edit section copy
08 Rank and select one wireframe/composition
09 Compile one revisioned ExperienceSpecV2
10 Render; run fail-soft content and visual repair
11 Reveal app-hosted HTML; stream current-revision improvements and receipts
```

### State and revision contract

```text
typing
  -> domain_stable
  -> researching
  -> brief_material
  -> composing
  -> provisional_ready
  -> refining
  -> final_ready

input change -> revision + 1 -> cancel/ignore older result
worker timeout -> typed fallback -> continue
visual soft-fail -> render -> one bounded repair
fatal artifact error -> safe deterministic artifact + support reference
```

Only `revision === session.activeRevision` may update the visible brief, recommendations, spec, or preview.

## 4. Timing budget

| Work | Soft worker deadline | User-visible contract |
| --- | ---: | --- |
| Domain stabilization | 300-600ms debounce | Research begins before confirmation. |
| Identity + Brandfetch | 8s | Logo/identity receipt streams immediately. |
| DOM/CSS + screenshot analysis | 15s | Brand geometry may upgrade the provisional result. |
| Company/offer/audience research | 20s | Recommendations may update as evidence lands. |
| Framework ranking | 5s | Deterministic fallback is immediate. |
| Copy/message work | 20s | Writers start once the material spine exists. |
| Wireframe ranking + compile | 5s | Geometry is deterministic. |
| Render + validation | 5s | Never wait on optional workers. |
| Final cutoff | 60s | Stop new provider work; reveal best valid artifact. |

Performance budgets are cumulative wall-clock ceilings, not sequential allocations.

## 5. Brand authority contract

The seller domain owns the page system. A target account supplies context and a restrained logo lockup; it never reskins the seller page.

### Evidence order

1. Normalize canonical domain and aliases.
2. Use Brandfetch for official logo and metadata; accept canonical/alias matches.
3. Analyze official homepage/product page DOM and CSS.
4. Analyze a desktop screenshot for actual color proportions, geometry, typography, nav, hero, and imagery.
5. Fetch portable official assets through existing safe fetch/image delivery boundaries.
6. Reconcile conflicts by authority, freshness, confidence, and semantic role.

### Required brand artifact

```ts
type BrandSystemV2 = {
  revision: number;
  identity: { name: string; canonicalDomain: string; aliases: string[] };
  logo: { ref?: string; source?: string; confidence: number; status: "verified" | "missing" };
  colorRoles: {
    ink: EvidenceValue<string>;
    surface: EvidenceValue<string>;
    accent: EvidenceValue<string>;
    action: EvidenceValue<string>;
    support: EvidenceValue<string[]>;
    observedRatios?: Record<string, number>;
  };
  typography: { display: FontEvidence; body: FontEvidence };
  geometry: { controlRadius: number; cardRadius: number; borderWidth: number; shadow: string };
  layout: { maxWidth: number; density: "open" | "balanced" | "dense"; navStyle: string; heroStyle: string };
  imagery: { style: string; candidates: AssetEvidence[] };
  motion: { style: string; durationRangeMs: [number, number] };
  confidence: number;
  evidenceRefs: string[];
};
```

`EvidenceValue<T>` includes `value`, `source`, `confidence`, `observedAt`, and `revision`.

### Brand rules

- A red CTA does not make the page red. Preserve observed color ratios and semantic roles.
- Never invent a generic fallback palette. Use verified neutrals plus evidence-backed accents.
- Never render a broken image icon or empty media rectangle.
- Missing imagery selects a deliberate type-led or diagram-led composition.
- Use a public webfont only when portable; otherwise choose the closest bundled safe face and record the substitution.
- Capture button radius, border weight, whitespace, card geometry, navigation, shadows, icon style, imagery style, hero structure, and motion.
- Low confidence is visible in internal evidence, not buyer-facing apology text.

## 6. Research and evidence contract

Allowed evidence sources, in priority order:

1. visitor-supplied URL/document/text;
2. seller official site, product/solution/industry pages, and official resources;
3. target official site for ABM context only;
4. reliable third-party sources for category context.

Every claim includes an evidence reference and confidence. Unsupported facts are omitted. Inferences are phrased as implications or questions, not claims. Raw source bodies never enter analytics or ordinary logs.

## 7. Messaging framework contract

The framework ranker selects from a reviewed library using:

- motion and experience type;
- audience and buyer job;
- objective and CTA;
- offer maturity;
- evidence and proof density;
- content volume;
- buying motion and decision complexity.

Every resolved framework must define:

```text
audience -> tension? -> promise -> mechanism -> proof plan
         -> decision help -> next action -> why now?
```

`tension` and `why now` are optional. They must be omitted when unsupported.

### Copy rules

- Write like an exacting B2B copy chief: specific, concrete, concise, and buyer-aware.
- Lead with the buyer outcome or constraint, not the seller name.
- One idea per section; varied sentence rhythm; short headlines.
- Name the mechanism. Do not substitute adjectives for explanation.
- No invented statistics, customer claims, integrations, urgency, or outcomes.
- Ban generic phrases such as “unlock value,” “transform your business,” “seamless,” “best-in-class,” and “make progress with confidence.”
- Ban internal labels such as account thesis, decision path, supporting proof, narrative arc, stakeholder map, and buying committee.
- The editor separately checks specificity, factuality, duplication, jargon, unsupported urgency, and CTA alignment.

## 8. Composition contract

The wireframe ranker chooses a reviewed archetype and bounded composition using:

- message structure;
- section count and content volume;
- proof and imagery availability;
- interaction opportunities;
- seller geometry and density;
- campaign motion;
- audience decision complexity.

Typical pages use 4-8 sections. Seven is not mandatory. The selected composition defines section roles, word budgets, component slots, and allowed interactions before section writers start.

### Visual rules

- First viewport is one poster-like composition: one lockup, one promise, one support sentence, one CTA group, one authentic visual anchor.
- One job and one dominant visual idea per section.
- Avoid generic three-card grids, repeated centered sections, decorative icon circles, uniform large radii, and empty image containers.
- Alternate compression and release across the page.
- Body copy is at least 16px; full-page capture must remain readable.
- One to three useful interactions are enough: path selection, evidence reveal, role switch, assessment, or anchored CTA.
- Desktop is the product target. Preserve baseline responsive and accessibility behavior, but do not build tablet/mobile preview controls.

## 9. Typed worker boundary

Every worker returns:

```ts
type ProductionArtifact<T> = {
  worker: WorkerKind;
  sessionId: string;
  revision: number;
  status: "complete" | "fallback" | "timed_out" | "failed" | "stale";
  value?: T;
  evidenceRefs: string[];
  confidence: number;
  startedAt: string;
  completedAt: string;
  fallbackCode?: string;
  errorCode?: string;
};
```

No worker directly edits UI state, session storage, or HTML. The coordinator validates artifacts, checks revision, records a receipt, and compiles the canonical spec.

## 10. UX state contract

| State | Visitor sees | Primary action |
| --- | --- | --- |
| Empty | Centered composer and one example sentence | Enter domain/brief |
| Domain stabilizing | Inline “recognizing company” receipt | Keep typing |
| Researching | Compact live brief plus honest worker receipts | Answer next question |
| Partial evidence | Current recommendations, labeled as updating | Select or type |
| Material brief | Final required answer and editable receipts | Build preview |
| Composing | Large, clear work surface naming real tasks | Wait or edit brief |
| Provisional | Interactive best-current page, refining label | Explore |
| Final | Full desktop page and optional save | Review/save |
| Recoverable failure | Best deterministic page plus support reference | Retry failed layer |
| Expired | Clear expiry explanation | Start over |

The left conversation/work area uses two-thirds of the desktop workbench. The right Live Brief/process rail uses one-third and stays aligned right.

## 11. Failure policy

| Failure | Required behavior |
| --- | --- |
| Brandfetch unavailable | Continue DOM/CSS/screenshot lanes; never invent logo. |
| Official site blocked | Use verified Brandfetch metadata and neutral design; record blocked evidence. |
| Logo proxy rejects asset | Try next verified asset; use typographic wordmark only if no asset survives. |
| Research timeout | Use current official evidence; do not create generic filler. |
| LLM timeout/schema error | Use deterministic message/wireframe compiler. |
| Writer section fails | Compile remaining valid sections; minimum four coherent sections. |
| Stale worker result | Mark stale and discard without UI mutation. |
| Image missing | Select type-led/diagram-led component; never empty rectangle. |
| Visual soft-fail | Render first; run at most one bounded repair. |
| Invalid final artifact | Render safe deterministic artifact and show support reference. |

## 12. Observability and privacy

Log one traceable session and revision across input, worker, compile, render, and reveal.

Required operational events:

```text
domain_stabilized | revision_started | worker_queued | worker_started
worker_completed | worker_timed_out | worker_fallback | worker_stale
brief_material | framework_selected | wireframe_selected
spec_compiled | render_ready | repair_started | final_revealed
```

Record event name, session hash, revision, worker, status, duration, evidence count, confidence band, error/fallback code, and support reference. Do not log raw domain, URL, prompt, source body, generated copy/HTML, email, cookie, token, or credential.

Product analytics may record choice shown, choice selected, free-form used, edit, preview interaction, save modal, and CTA. It remains separate from authoritative server traces.

## 13. Test diagram

```text
INPUT                         PIPELINE                               OUTPUT
valid domain [UNIT/E2E]  ->   debounce + normalize [UNIT]       ->  identity receipt
edited domain [UNIT/E2E] ->   revision fence [UNIT/E2E]          ->  stale results ignored
blocked brand [UNIT/E2E] ->   multi-source recovery [UNIT]       ->  honest branded-neutral page
brand conflict [UNIT]    ->   evidence reconcile [UNIT/EVAL]     ->  role-aware BrandSystemV2
brief answers [E2E]      ->   recommendations [UNIT/EVAL]        ->  3 chips + free form
material brief [UNIT]    ->   framework/wireframe rank [UNIT]    ->  selected reason codes
mixed evidence [EVAL]    ->   spine + writers + editor [EVAL]    ->  specific supported copy
worker timeout [UNIT]    ->   bounded fallback [UNIT]            ->  valid provisional page
provider failure [E2E]   ->   deterministic compiler [E2E]       ->  no blank/spinner
final spec [UNIT]        ->   trusted renderer [UNIT/E2E]        ->  interactive desktop HTML
all paths                 ->   benchmark [BENCH]                  ->  <=60s cutoff
```

Required quality tiers:

- unit tests cover all branches, fallbacks, stale revisions, and schema boundaries;
- golden/eval fixtures cover at least ADP, Apple, ServiceTitan, 6sense, Cisco, and one blocked/no-logo domain;
- desktop E2E covers four motions, recommendation editing, early research, premature-preview prevention, final reveal, and fatal fallback;
- visual evidence includes first viewport and full-page captures for at least three materially different brands;
- accessibility covers keyboard selection, focus, dialogs, labels, contrast, and reduced motion.

## 14. Implementation order

| Lane | Modules | Depends on |
| --- | --- | --- |
| A Evidence | `integrations/`, `brand-*`, research orchestration | current session/revision types |
| B Strategy | `generation/message-*`, framework library | typed evidence contract |
| C Composition | `generation/wireframe-*`, visual grammar | typed brand + message contracts |
| D UX | streaming composer, workbench, receipts | recommendation + receipt projections |
| E Compiler | orchestrator, coordinator, ExperienceSpec | A+B+C |
| F QA | fixtures, evals, unit, E2E, benchmark | integrated E+D |

Launch A, B, C, and UX preparation in parallel. Merge typed seams through the manager. Integrate E only after shared contracts stabilize. Run F after every wave and again at completion.

## 15. Implementation tasks

- [ ] **P1** Extend worker kinds, typed artifacts, receipts, deadlines, and revision checks.
- [ ] **P1** Implement multi-source brand evidence and role-aware `BrandSystemV2` compilation.
- [ ] **P1** Implement evidence reconciliation and recommendation generation.
- [ ] **P1** Implement bounded framework and composition rankers with reason codes.
- [ ] **P1** Implement message spine, section-slot writer, and separate factuality/editorial pass.
- [ ] **P1** Compile dynamic 4-8 section `ExperienceSpecV2` artifacts without arbitrary CSS.
- [ ] **P1** Upgrade the chat flow to three recommendations plus free-form for each material question.
- [ ] **P1** Stream honest receipts; reveal provisional/final states without fake progress.
- [ ] **P1** Enforce 60-second provider cutoff and fail-soft rendering.
- [ ] **P1** Add unit, eval/golden, benchmark, accessibility, and desktop E2E coverage.
- [ ] **P2** Add visual-evidence capture script and review artifacts.
- [ ] **P2** Add privacy-safe trace reconstruction for every production stage.

## 16. Not in scope

- Personalization variants beyond preserving current functionality; part two after base-page approval.
- Content Magic changes; separate route and production contract.
- Folloze save, publish, vanity URLs, or Folloze analytics.
- Vercel deployment, release branch changes, Cloudflare, Blob migration, or credential rotation.
- Mobile/tablet preview controls or a template marketplace.
- Arbitrary model-generated HTML/CSS/JavaScript.
- A new database, queue, agent framework, renderer, or public output runtime.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | ---: | --- | --- |
| CEO Review | prior product interview | Scope and value | 1 | CLEAR | Base generic page first; variants deferred. |
| Codex Review | current planning pass | Product and execution judgment | 1 | CLEAR | Reuse current pipeline; typed artifacts; 60-second fail-soft cutoff. |
| Eng Review | `plan-eng-review` | Architecture, tests, performance | 1 | CLEAR | Six lanes, explicit revision fence, failure table, test diagram. |
| Design Review | `plan-design-review` | UI, brand, states, accessibility | 1 | CLEAR | State table, brand authority, composition rules, desktop ratio, visual evidence. |
| DX Review | not run | Implementation usability | 0 | NOT REQUIRED | Cursor manager contract and handback define the path. |

**VERDICT:** PRODUCT + DESIGN + ENGINEERING CLEARED FOR CURSOR IMPLEMENTATION

NO UNRESOLVED DECISIONS
