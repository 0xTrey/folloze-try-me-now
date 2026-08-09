# Try Me Now: 60-second performance contract

Date: August 9, 2026

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
| 5-15 seconds | Minimum-safe brand identity and source premise resolve where available; the reviewed wireframe is locked. |
| By 15 seconds | A source-grounded, interactive provisional preview is visible in deterministic contract tests. It uses only verified brand fields and is explicitly unclaimable. |
| 15-45 seconds | Desktop DesignDNA, full source evidence, assets, and model copy refine the same artifact in place. |
| 45-55 seconds | Quality gates complete; optional provider work is declared non-blocking. |
| 55-60 seconds | No new external work starts. The system assembles, renders, persists, and reaches a final or explicit safe terminal state. |

The first usable preview must never wait for publishing, email, lead routing,
analytics persistence, optional imagery, or a second model repair pass.

## Runtime budgets

- One shared attempt deadline owns the complete 60-second promise. Provider
  timeouts are sub-budgets, not permission to extend the customer deadline.
- OpenAI refinement pass: 30-second default and hard maximum, and it
  never blocks the deterministic provisional preview.
- Remote browser brand pass: 12-second default, 20-second hard maximum, treated
  as desktop presentation enrichment rather than a prerequisite for the first
  preview.
- Public HTML/CSS and Brandfetch run concurrently with the browser pass.
- Remote logo candidates validate concurrently in score order within one
  five-second network window.
- Source URL extraction retains its 12-second ceiling and starts when the URL
  stabilizes, not when the completed brief is submitted.
- Local wireframe selection, `ExperienceSpec` construction, quality validation,
  and HTML rendering share a two-second target.

No fast path may present generic framework colors as customer branding. A
minimum-safe provisional requires verified identity, official logo, and
semantic palette roles. A final preview requires the complete path-appropriate
brand and source quality contract. Browser-derived typography, component,
layout, and imagery DNA enriches the presentation when it returns inside the
budget; it never changes narrative, proof, audience, or CTA authority.

## Measurement contract

Primary service-level metric:

`generation_eligible -> preview_provisional_ready`

This begins when the last required brief answer is committed. It excludes human
form-fill time and includes every remaining prerequisite, deterministic
composition, render, and persistence step required for the first interactive
buyer page. Report p50, p95, percentage at or below 15 seconds, percentage at
or below 60 seconds, and fallback rate by use case.

The companion quality metric is `preview_provisional_ready -> preview_ready`.
It measures the bounded model refinement without hiding the usable page while
that work continues.

Supporting spans:

- seller brand duration;
- target brand duration;
- source intelligence duration;
- model duration and fallback reason;
- render duration;
- session-created-to-preview duration for the full prospect journey.

The browser must emit `preview_rendered` after the generated experience is
actually visible and interactive. The customer-visible SLO is measured from
committed `generation_eligible` to the matching artifact revision's
`preview_rendered`. Server `preview_provisional_ready` remains the operational
fallback when browser acknowledgement is unavailable.

## Acceptance criteria

1. Every experience family selects a reviewed wireframe without an LLM call.
2. Seller, target, and source research start as soon as their inputs stabilize.
3. The model fills fixed copy slots; it does not design the page.
4. A first-preview model timeout cannot exceed 30 seconds.
5. A remote browser-brand timeout cannot exceed 20 seconds.
6. Logo candidate validation cannot add serial five-second waits.
7. Source-grounded content still fails closed when the source cannot be read.
8. Final previews never use broken images or unverified generic palettes.
9. Deterministic contract tests produce a provisional preview by 15 seconds and
   a terminal final or explicit safe state by 60 seconds for account, campaign,
   and content inputs.
10. Production-like runs target p50 at or below 15 seconds and p95 at or below
    45 seconds for `generation_eligible -> preview_rendered`, and p95 at or below
    60 seconds for the final visible state.
11. A timed-out refinement preserves the current safe preview and never replaces
    a newer revision.

## Implemented provisional lifecycle

Try Me Now now commits a deterministic `preview_provisional` artifact through
the same `ExperienceSpec`, renderer, brand assets, analytics runtime, and
desktop iframe as the final experience. It appears before the OpenAI call,
remains explicitly labeled as refining, and cannot be saved or claimed. The
bounded model pass replaces it atomically only when the generation attempt and
input fingerprint still match. A changed brief discards the stale refinement;
a failed refinement leaves the interactive provisional page available with a
retry path.

The August 7 local ServiceNow campaign verification recorded:

- verified seller brand ready in 1,015 ms;
- `generation_eligible -> preview_provisional_ready` in 775 ms;
- deterministic composition and render in 8 ms;
- provisional-to-final upgrade in 248 ms when OpenAI was intentionally absent;
- no browser console errors and a 6,002 px inner experience that remained
  independently scrollable inside the desktop preview.

Slow-model integration coverage holds the provider promise unresolved while
asserting that the provisional iframe is ready, the claim boundary rejects the
draft, and a late model result cannot overwrite a newer brief revision.

The August 9 Keychain-backed local campaign verification recorded:

- verified Folloze identity and six-color palette harvested in 1,250 ms;
- browser-visible provisional preview in 2,308 ms after the build action;
- OpenAI `gpt-5.6-terra` structured refinement completed in 25,709 ms;
- browser-visible refined final in 28,185 ms;
- no browser console errors and no deterministic fallback in the successful run.

That run also exposed and fixed a provider schema incompatibility: Zod's URL
validator emitted the unsupported JSON Schema `uri` format. The provider-facing
schema now uses a bounded nullable string, while the returned draft is still
revalidated by the stricter product URL schema before acceptance. Safe error
classification now records provider status, code, type, and retryability without
logging provider messages, prompts, responses, URLs, or credentials.
