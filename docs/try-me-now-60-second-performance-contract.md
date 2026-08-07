# Try Me Now: 60-second performance contract

Date: August 7, 2026

Status: active product constraint

## Finding

The wireframes are not the slow part. The runtime registry already selects one
of 17 account, campaign, or content archetypes synchronously, stores that
selection in `ExperienceSpec`, and renders it through one of six composition
grammars. A local ServiceNow campaign run using the deterministic generator
reached a complete preview in about 2.0 seconds. The focused wireframe,
template, and `ExperienceSpec` suite completed 66 tests in about 0.7 seconds.

The 17-minute ServiceNow build was a manual design-and-publication workflow. It
must not be replicated inside Try Me Now. The product should lock a reviewed
wireframe, hydrate its fixed content slots, apply verified brand evidence, and
render without asking the model to invent layout, navigation, section count,
or component behavior.

## Previous critical path

The old budgets could exceed the customer promise before rendering:

- remote browser brand evidence: up to 58 seconds;
- public source extraction: up to 12 seconds;
- OpenAI draft plus an optional repair call: up to 52 seconds;
- remote logo candidates: as many as six sequential five-second validations.

Brand, target, and source jobs start in the background as inputs arrive, but the
story stage still treats their results as prerequisites. A fast visitor could
therefore reach the final question before those jobs had hidden their latency.

## Customer-visible budget

| Elapsed time | Required result |
| --- | --- |
| 0-5 seconds | Temporary URL plus a truthful build shell. Seller brand research has started. |
| 5-20 seconds | Wireframe locked; target and source research visible as independent progress. |
| 20-45 seconds | Branded, interactive preview assembled from fixed sections and verified evidence. |
| 45-60 seconds | Copy validation and final render complete, or a safe deterministic preview remains visible with an honest refinement state. |

The first usable preview must never wait for publishing, email, lead routing,
analytics persistence, optional imagery, or a second model repair pass.

## Runtime budgets

- OpenAI first-preview pass: 25-second default, 30-second hard maximum.
- Remote browser brand pass: 12-second default, 20-second hard maximum.
- Public HTML/CSS and Brandfetch run concurrently with the browser pass.
- Remote logo candidates validate concurrently in score order within one
  five-second network window.
- Source URL extraction retains its 12-second ceiling and starts when the URL
  stabilizes, not when the completed brief is submitted.
- Local wireframe selection, `ExperienceSpec` construction, quality validation,
  and HTML rendering share a two-second target.

No fast path may present generic framework colors as customer branding. A
final preview requires verified identity, logo, palette, and source evidence.
Browser-derived component DNA enriches that evidence when it returns inside the
budget; verified public HTML/CSS and Brandfetch evidence remain valid first-pass
authorities when the browser pass times out.

## Measurement contract

Primary service-level metric:

`generation_eligible -> preview_ready`

This begins when the last required brief answer is committed. It excludes human
form-fill time and includes every remaining prerequisite, model, composition,
render, and persistence step. Report p50, p95, percentage at or below 60 seconds,
and fallback rate by use case.

Supporting spans:

- seller brand duration;
- target brand duration;
- source intelligence duration;
- model duration and fallback reason;
- render duration;
- session-created-to-preview duration for the full prospect journey.

The browser should eventually emit `preview_rendered` after the generated
experience is actually visible. Server `preview_ready` remains the authoritative
build completion time until that acknowledgement is implemented.

## Acceptance criteria

1. Every experience family selects a reviewed wireframe without an LLM call.
2. Seller, target, and source research start as soon as their inputs stabilize.
3. The model fills fixed copy slots; it does not design the page.
4. A first-preview model timeout cannot exceed 30 seconds.
5. A remote browser-brand timeout cannot exceed 20 seconds.
6. Logo candidate validation cannot add serial five-second waits.
7. Source-grounded content still fails closed when the source cannot be read.
8. Final previews never use broken images or unverified generic palettes.
9. p95 `generation_eligible -> preview_ready` is at or below 60 seconds in a
   production-like run set covering account, campaign, and content inputs.
10. A timed-out refinement preserves the current safe preview and never replaces
    a newer revision.

## Next implementation slice

The current system still reveals `session.experience` only after final story
generation. The next slice is a phase-aware provisional preview: build the fixed
wireframe shell immediately, keep it unclaimable until verified brand and source
requirements pass, then atomically upgrade it with bounded generated copy. This
will make the 0-20-second product progress tangible without weakening the final
brand or evidence gates.
