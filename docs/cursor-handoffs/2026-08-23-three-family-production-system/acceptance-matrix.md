# Acceptance Matrix

Cursor updates the Evidence column with current-run tests, screenshots, traces, or code references. `Met` requires current-run evidence. `Partial` names the missing proof. `Blocked` names the exact external dependency. Do not mark a gate from intention.

| ID | Gate | Required evidence | Status | Evidence |
| --- | --- | --- | --- | --- |
| F01 | Only Launch, Guide, Align are legal V2 families. | Contract/schema tests. | Met | `three-family-contract.test.ts`; 1,013-test full run. |
| F02 | Event and webinar always route to Launch subtype. | Deterministic matrix tests. | Met | `three-family-contract.test.ts` event/webinar matrix. |
| F03 | Product/offer promotion routes to Launch. | Ranker tests. | Met | `three-family-contract.test.ts`; ADP manifest fixture. |
| F04 | Solution/industry/evaluation routes to Guide. | Ranker tests. | Met | `three-family-contract.test.ts`; Apple manifest fixture. |
| F05 | Named-account context routes to Align. | Ranker tests. | Met | `three-family-contract.test.ts`; ServiceTitan manifest fixture. |
| F06 | Selection is stable and never random. | Repeated fixture test. | Met | Repeated deterministic routing assertions and custom autoresearch. |
| F07 | Family/factors/confidence stay hidden from prospects. | Component/E2E assertions. | Met | `experience-contract.test.ts` public projection assertion; 32-test benchmark. |
| F08 | Legacy account/campaign/content sessions still decode/render. | Migration tests. | Met | V2-to-V1 adapter tests plus 31-test desktop regression. |
| S01 | Section range is four through eight. | Schema/generator tests. | Met | `three-family-contract.test.ts`; custom hard blocker. |
| S02 | Six-section default exists for every family. | Golden contract tests. | Met | Contract test and `visual-evidence-manifest.json`. |
| S03 | Optional proof/resource sections require evidence. | Section-plan tests. | Met | Evidence-gated optional slot tests. |
| S04 | Customer-readable navigation derives from sections. | Renderer/E2E assertions. | Met | Adapter test and family screenshots. |
| S05 | No buyer-facing internal labels or banned phrases. | Static validator + E2E. | Met | Copy contract banned-phrase fixtures; 31 desktop tests. |
| S06 | One primary exploration device maximum. | Spec/render tests. | Met | Section-plan invariant tests. |
| C01 | Message spine precedes section writers. | Coordinator receipt/order test. | Met | `production-message-spine.test.ts` and session engine tests. |
| C02 | Section copy references evidence or is typed implication/hypothesis. | Factuality tests. | Met | `three-family-copy-contract.test.ts`; factuality editor tests. |
| C03 | Headlines meet specificity and word-budget checks. | Copy evaluator tests. | Met | C03 contract fixture and writer budget tests. |
| C04 | Each section adds new information. | Repetition/novelty evaluator. | Met | C04 novelty fixture. |
| C05 | Competitor-swap rejection gate runs. | Adversarial copy test. | Met | C05 adversarial fixture. |
| C06 | Align account-swap rejection gate runs. | Named-account fixture test. | Met | C06 named-account fixture. |
| C07 | No invented metrics/customers/quotes/deadlines/urgency. | Claim-boundary fixtures. | Met | Factuality claim-boundary tests and 1,013-test run. |
| C08 | CTA comes from bounded library and aligns with objective. | CTA matrix tests. | Met | Family copy CTA matrix. |
| C09 | Launch, Guide, Align produce materially different arguments. | Golden comparisons. | Met | Golden family message-spine comparisons. |
| C10 | Copy/factuality editor records issues and bounded repairs. | Editor receipt tests. | Met | C10 issue/repair receipt fixtures. |
| R01 | Research starts when domain stabilizes. | Timing/orchestrator test. | Met | `guided-entry.spec.ts` early research assertion. |
| R02 | Research lanes share session/revision and reject stale results. | Race/fence tests. | Met | Research plan, evidence reconciler, and stale-revision tests. |
| R03 | Offer suggestions are company-specific and evidence-backed. | ADP/Thermo Fisher/etc. fixtures. | Met | `offer-recommendations.test.ts`. |
| R04 | Audience suggestions name actual buyer roles/jobs. | Persona specificity fixtures. | Met | `audience-recommendations.test.ts`. |
| R05 | Generic suggestions stay internal and do not render. | Component/E2E assertions. | Met | No-evidence guided-entry fixture. |
| R06 | Free-form + URL remain when fewer than two credible options exist. | No-evidence fixture. | Met | Guided-entry no-evidence browser test and orchestrator test. |
| R07 | Official sources outrank third-party context. | Reconciliation tests. | Met | `evidence-reconciler.test.ts`. |
| R08 | Align target facts and inference remain distinct. | Evidence typing tests. | Met | Research/evidence typing and named-account tests. |
| B01 | Seller domain is the sole visual authority. | Seller/target fixture. | Met | Brand compiler authority tests; Align screenshot. |
| B02 | Brandfetch canonical/alias responses are accepted and traced. | Provider adapter fixtures. | Met | Brand Harvester and Brandfetch fixture suites. |
| B03 | DOM/CSS and screenshot evidence populate semantic brand roles. | Brand compiler fixtures. | Met | `brand-system.test.ts`; harvester design-fidelity fixtures. |
| B04 | Verified brand requires real logo and credible palette. | Readiness tests. | Met | `brand-readiness.test.ts`. |
| B05 | Five or six observed colors are reconciled into semantic roles. | Apple/ADP/ServiceTitan fixtures. | Met | Brand compiler color fixtures and visual manifest token summaries. |
| B06 | Typography character and portable substitution are recorded. | Brand schema/renderer tests. | Met | Brand compiler typography tests and full desktop regression. |
| B07 | Buttons/radii/borders/shadows/density reflect source evidence. | Visual assertions/screenshots. | Met | Visual manifest token summaries and computed-style assertions. |
| B08 | One or two distinct first-party images are selected by role. | Asset manifest + screenshots. | Met | Visual manifest `selectedImages`; asset-selection tests. |
| B09 | Broken/blank/duplicate/utility imagery never renders. | Asset failure tests. | Met | Asset rejection tests; manifest `brokenImages: 0`. |
| B10 | Incomplete brand triggers asset request and preserves research. | Needs-input E2E. | Met | Brand compiler needs-input tests and brand-help URL resume browser test. |
| B11 | No generic palette is called customer branding. | Partial/unavailable fixture. | Met | Readiness and neutral fallback tests/screenshots. |
| B12 | Target account never reskins seller page. | Align visual fixture. | Met | ServiceTitan Align fixture and seller-authority tests. |
| U01 | Chat asks one material question at a time. | Desktop E2E. | Met | `guided-entry.spec.ts`. |
| U02 | Live Brief remains editable and current-revision only. | Component/E2E race tests. | Met | Guided-entry edit assertion and stale-revision tests. |
| U03 | Recommendation chips render only when evidence threshold passes. | Component/E2E tests. | Met | Evidence/no-evidence guided-entry fixtures. |
| U04 | Brand-help prompt accepts URL/logo/guide/screenshot and resumes. | Input/resume E2E. | Met | `brand-help-recovery.test.tsx` input matrix; guided-entry URL resume E2E. |
| U05 | No template picker or preview marketplace is prospect-facing. | E2E assertion. | Met | Guided-entry legacy-path assertions. |
| U06 | Preview contains no receipts, grades, or debug language. | E2E assertion. | Met | Generated experience and family browser suites. |
| U07 | Workbench preserves two-thirds composer / one-third Live Brief. | Screenshot geometry assertion. | Met | Guided-entry desktop geometry ratio assertion. |
| P01 | Shell appears within 5 seconds. | Benchmark. | Met | `preview-benchmark.test.ts`; benchmark command pass. |
| P02 | Safe provisional target remains within 15 seconds when brand minimum is ready. | Benchmark. | Met | Preview benchmark route fixtures. |
| P03 | Final or explicit needs-input terminal state occurs within 60 seconds. | Benchmark. | Met | Preview benchmark terminal fixtures. |
| P04 | No provider work starts after 60 seconds. | Fake-clock test. | Met | Preview benchmark and generation budget deadline tests. |
| P05 | Model pass cannot exceed 30 seconds or replace newer revision. | Timeout/race tests. | Met | Generation budget and stale-refinement tests. |
| P06 | Brand browser pass cannot exceed 20 seconds. | Timeout tests. | Met | 15-second brand budget plus Harvester timeout tests. |
| P07 | Local selection/compile/render targets two seconds. | Benchmark receipt. | Met | Local contract tests and visual fixture render under two seconds. |
| V01 | No horizontal overflow at desktop target. | Visual E2E. | Met | Manifest `horizontalOverflow: false` for all fixtures. |
| V02 | Full-page capture remains readable. | Desktop screenshots. | Met | Four committed full-page screenshots. |
| V03 | Hero meets one-lockup/one-promise/one-support/CTA/visual contract. | First-viewport screenshots. | Met | Four committed first-viewport screenshots. |
| V04 | Every selected image renders and supports adjacent copy. | Asset manifest + visual review. | Met | Manifest roles/status and visual review. |
| V05 | Text and button contrast pass automated checks. | Axe/contrast test. | Met | Visual E2E body/button contrast ≥ 4.5. |
| V06 | Keyboard navigation and focus remain usable. | Accessibility E2E. | Met | Generated experience and guided-entry keyboard tests. |
| O01 | Worker receipts include revision/status/timing/evidence IDs. | Trace tests. | Met | Telemetry receipt and trace-store tests. |
| O02 | Operational traces and behavior analytics remain separate. | Code/test evidence. | Met | Projection boundary tests. |
| O03 | Raw sources/prompts/responses/credentials never enter traces. | Privacy tests. | Met | Observability, trace, telemetry, and analytics privacy tests. |
| Q01 | `npm run benchmark:preview` passes. | Command receipt. | Met | 5 files / 32 tests passed. |
| Q02 | `npm run qa` passes. | Command receipt. | Met | Exact command passed lint, typecheck, 1,013 tests, Turbopack and webpack builds. |
| Q03 | Desktop E2E passes. | Command receipt. | Met | Final current-tree run: 32/32 desktop tests passed. |
| Q04 | Production visual evidence suite passes. | Command + manifest. | Met | `CAPTURE_PRODUCTION_EVIDENCE=1 npm run qa:visual:folloze`: 3/3 passed. |
| Q05 | Autoresearch score reaches at least 90/100 twice with no blocker. | JSONL + report. | Met | Custom loop iterations 1 and 3 scored 100 without blocker. |
| Q06 | Git worktree is clean after logical local commits. | Git status. | Met | Final clean status recorded after handback commit. |
| Q07 | No push/deploy/publish/credential/infrastructure mutation occurred. | Handback declaration. | Met | Declared in `cursor-handback.md`; local-only work. |
