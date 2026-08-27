# Execution Contract

## Production path

```text
normalized inputs
  -> evidence plan and research
  -> semantic brand compilation
  -> messaging framework and wireframe ranking
  -> message spine
  -> section writing contracts
  -> bounded parallel section generation
  -> cross-section factuality and repetition review
  -> unique asset allocation
  -> ExperienceSpecV2 compilation
  -> render
  -> fail-soft visual and content evaluation
  -> optional bounded repair
  -> reveal
```

Every stage emits a private, typed receipt tied to one session, attempt, revision, and support reference.

## BuildTrace contract

Add a versioned additive contract. Preserve existing operational receipt version 1 and public API payloads.

```ts
type BuildTraceV1 = {
  schemaVersion: 1;
  traceId: string;
  sessionId: string;
  attemptId: string;
  revision: number;
  pipelineVersion: string;
  supportRefHash?: string;
  startedAt: string;
  completedAt?: string;
  terminalStatus: "completed" | "fallback" | "needs_input" | "failed" | "stale";
  evidenceRefs: string[];
  decisions: {
    framework?: RankedDecisionTrace;
    wireframe?: RankedDecisionTrace;
    brand?: BrandDecisionTrace;
    assets?: AssetAllocationTrace;
  };
  sections: SectionBuildTrace[];
  quality: QualityTrace[];
  fallbacks: FallbackTrace[];
  timings: StageTimingTrace[];
};
```

Required section provenance:

```ts
type SectionBuildTrace = {
  sectionId: string;
  role: string;
  promptVersion: string;
  templateVersion: string;
  writerMode: "model" | "deterministic" | "repair";
  model?: string;
  inputEvidenceRefs: string[];
  inputDigest: string;
  candidateDigests: string[];
  selectedCandidate: number;
  selectionReasons: string[];
  outputDigest: string;
  quality: Record<string, number | boolean | string>;
  startedAt: string;
  completedAt: string;
  status: "completed" | "fallback" | "failed" | "stale";
  fallbackCode?: string;
};
```

Do not store raw provider credentials, uploaded source bodies, raw model prompts, raw model responses, business email, sensitive URL query strings, or unrestricted DOM in BuildTrace. The final selected copy already exists in the private session artifact. Trace prompt versions, structured evidence references, digests, scores, reasons, and fallbacks.

## Semantic brand compiler

Build one canonical `BrandSystemV2` from source-owned evidence.

Required semantic roles:

- `primary`, `accent`, `surface`, `surfaceAlt`, `text`, `textMuted`, `border`
- `ctaBackground`, `ctaText`, `link`, `focus`
- `headingFont`, `bodyFont`, `fontCharacter`, `weightCharacter`
- `buttonRadius`, `cardRadius`, `containerRadius`, `borderWidth`, `shadowCharacter`, `density`
- evidence references, confidence, source authority, and selected-candidate reasons for every applied role

Rules:

- Exclude temporary sale banners, consent layers, popups, modal overlays, disabled controls, and navigation utilities from dominant-color voting unless the evidence explicitly identifies them as persistent design language.
- Weight colors by component role, visible area, frequency, contrast use, and source authority. Do not choose the first candidate.
- Classify text, surface, action, and decorative colors separately before mapping semantic roles.
- Determine geometry from representative component distributions. Use median or weighted mode by component class, not the first observed radius.
- Preserve portable typography only. Record the closest fallback and why it was selected.
- Keep incomplete evidence explicit. Never call a generic palette customer branding.
- Produce warnings and a provisional score. Do not block rendering solely because the score is imperfect.

## Asset allocation

Create a global allocator over the complete experience.

```ts
type AssetAllocation = {
  allocationKey: string;
  sectionId: string;
  semanticRole: "hero" | "product" | "proof" | "process" | "people" | "supporting" | "logo" | "decorative";
  assetRef: string;
  evidenceRef: string;
  sourceUrlHash: string;
  purpose: string;
  reusable: boolean;
  score: number;
};
```

- Allocate globally before rendering.
- A substantive asset may appear once.
- Logos and explicitly decorative motifs may repeat.
- Reject broken, tiny, transparent utility, icon-only, navigation, tracking, data URI, JavaScript URL, and duplicate-crop assets.
- Use purpose, aspect ratio, nearby source text, section role, and image quality in scoring.
- If there are fewer credible images than slots, use a designed non-image treatment. Never duplicate a substantive image to fill space.

## Dedicated section writing engine

Each selected wireframe slot receives one `SectionWritingContract` after the message spine locks.

```ts
type SectionWritingContract = {
  version: string;
  sectionId: string;
  family: "launch" | "guide" | "align";
  role: string;
  jobToBeDone: string;
  audience: BuyerContext;
  offer: OfferContext;
  objective: ObjectiveContext;
  messageSpine: MessageSpine;
  allowedEvidenceRefs: string[];
  proofRequirements: string[];
  visualBrief: string;
  interactionGoal: string;
  wordBudget: { min: number; max: number };
  requiredElements: string[];
  prohibitedPatterns: string[];
  promptVersion: string;
};
```

Generation rules:

- Run section writers in bounded parallel slots after the wireframe decision is revision-locked.
- Each model call returns two candidates in one structured response. A deterministic evaluator selects one using specificity, evidence coverage, buyer relevance, role fit, clarity, repetition, and word budget.
- The evaluator cannot invent evidence or approve unsupported claims.
- Run one cross-section editor that flags duplicate claims, repeated openings, generic filler, inconsistent terminology, and broken narrative order. It may select or request a bounded rewrite. It cannot silently add facts.
- Preserve a deterministic fallback, but it must use section-specific evidence and buyer language. Remove generic product-software filler from prospect-facing output.
- Prohibit internal terms such as `decision lens`, `operating fit`, `observable result`, `section N`, `template`, `fallback`, `quality gate`, and `evidence ref` unless the supplied evidence uses the phrase as a genuine customer term.

## Analytics and private trace boundary

PostHog receives behavior events only:

- anonymous visitor, browser-session, and app-session identifiers
- use case and bounded categorical state
- interaction type, UI area, section identifier, elapsed bucket, completion milestone, release, environment, and opaque correlation key
- sanitized client and server errors

PostHog must not receive raw domain, email, source URL, uploaded content, generated copy, HTML, prompt material, evidence payloads, provider responses, support references, or BuildTrace contents.

The first-party store receives private BuildTrace receipts:

- additive and versioned storage
- 30-day retention unless the existing shorter session lifecycle applies
- idempotent writes keyed by trace, attempt, revision, stage, and event ID
- fail-soft and nonblocking
- write budget at or below 500ms
- bounded event count and payload size
- server-only read path and CLI inspection by support reference or trace ID

Use an opaque one-way correlation key when behavior analytics must join to a private trace. Never expose the private trace ID directly to PostHog.

## Generalized visual-brand evaluator

Evaluate behavior, not company literals.

Fixture categories:

1. monochrome brand with one action accent and pill geometry
2. high-color brand with rounded cards and bold display type
3. conservative enterprise brand with compact spacing and modest radius
4. editorial brand with serif-led typography and restrained actions
5. sparse evidence with logo but incomplete geometry
6. missing logo and contradictory palette evidence

Score:

- identity and logo
- semantic palette role accuracy
- typography character
- representative geometry
- component density and visual rhythm
- imagery quality, role fit, uniqueness, and safe delivery
- section-copy specificity and evidence linkage
- accessibility and readability

The evaluator returns scores, warnings, violations, evidence references, and suggested repair dimensions. `blocking` is always `false` for visual quality. Identity uncertainty may request better source evidence, but the app still returns an honest provisional experience rather than failing silently.

## Compatibility invariants

- Preserve `ExperienceSpecV2`, current use-case values, family selection, session revision fences, support references, public preview payloads, claim flow, and existing event names.
- Add fields and decoders. Do not rewrite persisted data in place.
- Preserve the current renderer entry points and production-draft adapter.
- Do not add a second orchestrator, renderer, session store, analytics store, or brand harvester.
- Never weaken an existing test or quality threshold merely to pass.
