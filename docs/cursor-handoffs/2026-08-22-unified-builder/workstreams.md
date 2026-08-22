# Cursor Workstreams

The implementation manager should delegate these workstreams in the stated waves. Each subagent must inspect existing behavior and tests before editing, make the smallest coherent change, run targeted tests, and return changed files, evidence, and unresolved risks.

## 1. Unified intake UX

Agent: `intake-ux-builder`

Objective: replace the route-first form experience with one centered, persistent conversation while keeping the current API and session state machine.

Owns:

- `src/components/streaming-brief-composer.tsx`
- `src/components/streaming-brief-composer.module.css`
- presentation portions of `src/components/try-me-now-app.tsx`
- presentation portions of `src/app/globals.css`
- directly corresponding component tests

Requirements:

- one dominant Build a buyer experience entry;
- Content Magic remains reachable through a secondary path;
- remove the lower worked-example rail and legacy entry example links;
- replace them with approved Northpeak worked states where a seeded example is useful;
- persistent transcript of questions, answers, and interpreted brief;
- one missing material question at a time;
- compact editable summary for seller, target or audience, offer, objective, and experience type;
- larger Start over action;
- no second client-side state machine that diverges from the session API;
- desktop-first composition with accessible focus and keyboard behavior.

Stop when the component tests pass and the interaction can be driven from start through generation eligibility without route-card detours.

## 2. Research orchestration

Agent: `research-orchestration-builder`

Objective: start bounded brand, company, source, audience, and composition work as soon as relevant inputs stabilize without duplicate work or stale writes.

Owns:

- `src/lib/orchestration/**`
- orchestration portions of `src/lib/orchestrator.ts`
- `src/app/api/sessions/**` only when a route change is required
- corresponding orchestration, route, and benchmark tests

Requirements:

- normalized valid domains trigger seller research before explicit confirmation;
- target domains trigger separate target evidence and never replace seller authority;
- source URLs trigger source work as they stabilize;
- use existing single-flight and worker receipt contracts;
- parallel waves have explicit deadlines and fallback receipts;
- generation does not begin until the material brief is eligible;
- deterministic provisional rendering begins immediately after eligibility;
- no new external work begins after the shared 60-second deadline;
- stale worker results cannot replace newer revisions;
- failed optional enrichment preserves the best honest artifact.

Stop when the preview benchmark covers early start, dedupe, deadline, fallback, and stale-result cases.

## 3. Brand fidelity

Agent: `brand-fidelity-builder`

Objective: make verified brand evidence influence the full visual system rather than only logo and palette.

Owns:

- `src/lib/integrations/brand-harvester.ts`
- `src/lib/brand-intelligence.ts`
- `src/lib/brand-readiness.ts`
- `src/lib/brand-budget.ts`
- `src/lib/brandfetch-logo.ts`
- `src/lib/portable-brand-logo.ts`
- brand-related types and tests with parent coordination

Requirements:

- normalize company and canonical domain identity;
- accept valid Brandfetch results and record provenance;
- capture logo variants, semantic colors, typography character, radii, borders, surface density, imagery style, hero treatment, navigation and CTA motifs where evidence supports them;
- separate seller authority from target recognition;
- expose confidence and unresolved evidence honestly;
- never show broken images or fabricated fallback colors;
- use type-led or diagram-led treatment when imagery is unavailable;
- create a ServiceTitan-style regression fixture proving blue accent and moderate button radius survive extraction and compilation.

Stop when brand tests cover strong, neutral, incomplete, redirected, subdomain, and conflicting evidence cases.

## 4. Messaging and composition

Agent: `message-composition-builder`

Objective: use the existing production-quality message spine and internal composition catalog before preview reveal.

Owns:

- `src/lib/generation/message-spine.ts`
- `src/lib/generation/wireframe-library.ts`
- `src/lib/generation/visual-grammar.ts`
- `src/lib/generation/experience-template.ts`
- `src/lib/generation/experience-schema.ts`
- corresponding generation tests

Requirements:

- no prospect-facing template selection;
- rank reviewed compositions from route, audience, offer, brand evidence, asset quality, proof, and content density;
- preserve distinct account, campaign/event, and Content Magic message contracts;
- replace internal labels such as account thesis, decision paths, and supporting proof with buyer language;
- every output resolves one audience, tension, promise, mechanism, proof plan, decision help, and next action;
- model work fills constrained slots and never invents page geometry;
- quality review is bounded and fail-soft;
- generic filler or unsupported why-now language is omitted rather than invented.

Stop when golden scenarios prove route-specific copy and deterministic composition decisions.

## 5. Personalization preview

Agent: `personalization-preview-builder`

Objective: compile and render a generic state plus safe personalization variants from one canonical experience.

Owns:

- personalization portions of `src/lib/types.ts`
- personalization portions of `src/lib/experience-contract.ts`
- `src/lib/generation/experience-renderers.ts`
- preview controls in `src/components/try-me-now-app.tsx` with parent coordination
- corresponding contract, renderer, and component tests

Required preview states:

- generic;
- account;
- account plus industry;
- account plus industry plus persona A;
- account plus industry plus persona B when a second supported role exists.

Requirements:

- variants change headline, tension, proof emphasis, imagery or visual treatment, and next action where evidence supports it;
- variants are not company-name substitutions;
- every visible field has provenance and a safety classification;
- unsupported fields are omitted;
- variant switching does not regenerate or restart the session;
- variants are preview views, not separate wireframe choices.

Stop when tests prove safe substitution, omission, deterministic rendering, and no cross-variant state leakage.

## 6. Preview lifecycle and reveal

Agent: `preview-lifecycle-builder`

Objective: remove premature reveals and interruptions while preserving the provisional-first performance contract.

Owns:

- reveal, modal, claim, and preview state portions of `src/components/try-me-now-app.tsx`
- `src/components/try-me-now-enhancements.tsx`
- corresponding CSS and component tests
- claim API only when necessary and with parent coordination

Requirements:

- no preview before the material brief is generation-eligible;
- once eligible, provisional rendering remains fast and truthful;
- no save or email modal during intake;
- request email only after value is visible and the user has opened or meaningfully explored the preview;
- distinguish preview ready, enriching, saved locally, claimed, and published states;
- never claim Folloze publication;
- replace dense side panels with a larger, readable evidence and activity surface;
- show only receipt-backed progress; no fake percentages or vague refining theater;
- individual failed enrichment stages may retry without restarting the build.

Stop when lifecycle tests cover early clicks, slow enrichment, provisional preservation, modal timing, claim, and retry.

## 7. Telemetry and receipts

Agent: `telemetry-receipts-builder`

Objective: make the unified experience diagnosable without collecting unsafe payloads.

Owns:

- `src/lib/observability.ts`
- `src/lib/telemetry.ts`
- `src/lib/product-analytics.ts`
- `src/lib/product-analytics-client.ts`
- `src/lib/engagement-events.ts`
- `src/app/api/analytics/events/**`
- corresponding tests and inspection scripts when necessary

Required events:

- unified entry started;
- domain stabilized;
- input interpreted;
- brief field confirmed, edited, or skipped;
- worker started, completed, timed out, fell back, or failed;
- composition selected;
- provisional and final rendered;
- personalization variant viewed;
- resource and CTA interactions;
- modal displayed and claim attempted;
- retry requested;
- support reference created.

Privacy boundary:

- never include raw domains, URLs, email, prompts, source bodies, generated copy, HTML, credentials, cookies, or tokens in ordinary analytics;
- operational traces may use existing redacted fingerprints and support references;
- product analytics and generated-experience analytics remain separate registries.

Stop when redaction tests and event-contract tests pass and a failed session can be reconstructed by support reference.

## 8. Adversarial QA and integration

Agent: `unified-builder-qa`

Objective: challenge the integrated product and add missing regression coverage without weakening requirements.

Owns:

- tests and fixtures;
- implementation fixes only when explicitly returned to the implementation manager for approval;
- no deploy or remote mutation.

Required coverage:

- desktop unified happy paths for account, campaign, event, and secondary Content Magic;
- domain normalization and immediate research start;
- brief editing before generation;
- slow, failed, and partial provider behavior;
- no premature preview or modal;
- 15-second provisional and 60-second bounded-final fixture contract;
- brand fidelity and missing-asset fallbacks;
- five personalization views;
- CTA and content-item functionality;
- scroll, keyboard, focus, dialog, and preview-frame behavior;
- trace redaction and support reference;
- no public Folloze writes or publishing.

Final commands:

```bash
npm run benchmark:preview
npm run qa
npm run test:e2e -- --project=desktop
```

Stop with a written blocker if a failure cannot be resolved after two focused attempts. Do not hide, skip, or relax a failing contract.
