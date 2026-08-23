# Three-Family Production System

Status: approved for Cursor implementation

Product owner: Trey Harnden

Planning and acceptance owner: Codex

Implementation manager: Cursor Ultra

Repository: `/Users/treyharnden/Projects/folloze-try-me-now-unified-builder`

Branch: `codex/unified-microsite-builder`

## Outcome

Turn a recognizable seller domain plus a few visitor signals into one customer-ready, seller-branded desktop campaign experience in less than 60 seconds. The system researches the seller, offer, buyer, proof, brand, and first-party assets in parallel; selects one of three reviewed page families behind the scenes; writes evidence-bounded copy; and compiles the result through the existing `ExperienceSpecV2` and renderer path.

## Locked decisions

- The only page families are **Launch**, **Guide**, and **Align**.
- Events and webinars are Launch subtypes.
- Selection is deterministic and hidden from prospects.
- Typical pages contain six sections; the legal range is four through eight.
- The seller domain controls logo, colors, typography character, button treatment, sizing, radius, density, and imagery style.
- A customer-ready result requires a real logo plus credible visual evidence. If the system cannot establish the brand, it asks the visitor for a logo, brand guide, screenshot, or better source URL.
- The system uses one or two relevant first-party images when available. It never uses broken media, empty rectangles, duplicate crops, sale banners, navigation icons, or invented product UI.
- Offer and audience suggestions appear only when they are specific and evidence-backed. Otherwise the visitor receives free-form and URL input.
- Buying groups and personas must reflect who the seller actually sells to. Unsupported role taxonomies never reach the UI.
- Copy must be customer-ready and specific. Internal production terms never appear on the page.
- Generic output is the first product. Personalization variants remain a later step.
- No Folloze publication occurs in this wave. Outputs remain app-hosted previews.

## Package map

1. [`decision-record.md`](./decision-record.md) translates Trey's 30-question response into explicit defaults.
2. [`execution-contract.md`](./execution-contract.md) defines architecture, state, timing, compatibility, and implementation waves.
3. [`wireframe-and-copy-contract.md`](./wireframe-and-copy-contract.md) defines Launch, Guide, Align, section recipes, CTAs, and the copy constitution.
4. [`research-and-brand-contract.md`](./research-and-brand-contract.md) defines deterministic research, source authority, BrandSystem requirements, asset selection, and brand recovery.
5. [`acceptance-matrix.md`](./acceptance-matrix.md) is the implementation checklist and evidence ledger.
6. [`autoresearch-qa-contract.md`](./autoresearch-qa-contract.md) defines the optimization score, fixtures, hard blockers, and repair loop.
7. [`cursor-prompt.md`](./cursor-prompt.md) is the Cursor manager work order.
8. [`cursor-handback.md`](./cursor-handback.md) is the required completion receipt.

## Existing foundations to reuse

- `src/lib/orchestration/*` for typed workers, revision fences, deadlines, and single-flight.
- `src/lib/integrations/brand-harvester.ts` and existing Brandfetch adapters for brand evidence.
- `src/lib/generation/message-spine.ts` for the evidence-bounded argument.
- `src/lib/generation/wireframe-library.ts` for deterministic selection and compatibility.
- `src/lib/generation/experience-schema.ts`, `src/lib/experience-contract.ts`, and existing renderers for the canonical output path.
- `StreamingBriefComposer` and the Live Brief for the guided chat surface.
- `src/lib/trace-store.ts` and product analytics for privacy-safe receipts and behavior events.

## Prohibited shortcuts

- No prospect-facing template selector.
- No random family selection.
- No second orchestrator, page schema, brand harvester, or output runtime.
- No arbitrary model-generated CSS or section geometry.
- No invented logo, palette, buyer, product, proof, statistic, customer, quote, deadline, or urgency.
- No generic fallback colors presented as the seller's brand.
- No tests weakened, deleted, or rewritten merely to pass.
- No credential reads or writes.
- No push, deploy, production mutation, publication, or infrastructure work.

## Completion boundary

Cursor completes local implementation, logical commits, tests, desktop evidence, the acceptance matrix, and the handback. Codex then runs independent QA, grades the current result, and sends Cursor one bounded repair pass if any verified gate fails. Trey reviews the local experience before any publication decision.
