# Acceptance Matrix

Cursor updates the Evidence column with current-run tests, screenshots, traces, or code references. `Met` requires current-run evidence. `Partial` names the missing proof. `Blocked` names the exact external dependency. Do not mark a gate from intention.

| ID | Gate | Required evidence | Status | Evidence |
| --- | --- | --- | --- | --- |
| F01 | Only Launch, Guide, Align are legal V2 families. | Contract/schema tests. | Pending | |
| F02 | Event and webinar always route to Launch subtype. | Deterministic matrix tests. | Pending | |
| F03 | Product/offer promotion routes to Launch. | Ranker tests. | Pending | |
| F04 | Solution/industry/evaluation routes to Guide. | Ranker tests. | Pending | |
| F05 | Named-account context routes to Align. | Ranker tests. | Pending | |
| F06 | Selection is stable and never random. | Repeated fixture test. | Pending | |
| F07 | Family/factors/confidence stay hidden from prospects. | Component/E2E assertions. | Pending | |
| F08 | Legacy account/campaign/content sessions still decode/render. | Migration tests. | Pending | |
| S01 | Section range is four through eight. | Schema/generator tests. | Pending | |
| S02 | Six-section default exists for every family. | Golden contract tests. | Pending | |
| S03 | Optional proof/resource sections require evidence. | Section-plan tests. | Pending | |
| S04 | Customer-readable navigation derives from sections. | Renderer/E2E assertions. | Pending | |
| S05 | No buyer-facing internal labels or banned phrases. | Static validator + E2E. | Pending | |
| S06 | One primary exploration device maximum. | Spec/render tests. | Pending | |
| C01 | Message spine precedes section writers. | Coordinator receipt/order test. | Pending | |
| C02 | Section copy references evidence or is typed implication/hypothesis. | Factuality tests. | Pending | |
| C03 | Headlines meet specificity and word-budget checks. | Copy evaluator tests. | Pending | |
| C04 | Each section adds new information. | Repetition/novelty evaluator. | Pending | |
| C05 | Competitor-swap rejection gate runs. | Adversarial copy test. | Pending | |
| C06 | Align account-swap rejection gate runs. | Named-account fixture test. | Pending | |
| C07 | No invented metrics/customers/quotes/deadlines/urgency. | Claim-boundary fixtures. | Pending | |
| C08 | CTA comes from bounded library and aligns with objective. | CTA matrix tests. | Pending | |
| C09 | Launch, Guide, Align produce materially different arguments. | Golden comparisons. | Pending | |
| C10 | Copy/factuality editor records issues and bounded repairs. | Editor receipt tests. | Pending | |
| R01 | Research starts when domain stabilizes. | Timing/orchestrator test. | Pending | |
| R02 | Research lanes share session/revision and reject stale results. | Race/fence tests. | Pending | |
| R03 | Offer suggestions are company-specific and evidence-backed. | ADP/Thermo Fisher/etc. fixtures. | Pending | |
| R04 | Audience suggestions name actual buyer roles/jobs. | Persona specificity fixtures. | Pending | |
| R05 | Generic suggestions stay internal and do not render. | Component/E2E assertions. | Pending | |
| R06 | Free-form + URL remain when fewer than two credible options exist. | No-evidence fixture. | Pending | |
| R07 | Official sources outrank third-party context. | Reconciliation tests. | Pending | |
| R08 | Align target facts and inference remain distinct. | Evidence typing tests. | Pending | |
| B01 | Seller domain is the sole visual authority. | Seller/target fixture. | Pending | |
| B02 | Brandfetch canonical/alias responses are accepted and traced. | Provider adapter fixtures. | Pending | |
| B03 | DOM/CSS and screenshot evidence populate semantic brand roles. | Brand compiler fixtures. | Pending | |
| B04 | Verified brand requires real logo and credible palette. | Readiness tests. | Pending | |
| B05 | Five or six observed colors are reconciled into semantic roles. | Apple/ADP/ServiceTitan fixtures. | Pending | |
| B06 | Typography character and portable substitution are recorded. | Brand schema/renderer tests. | Pending | |
| B07 | Buttons/radii/borders/shadows/density reflect source evidence. | Visual assertions/screenshots. | Pending | |
| B08 | One or two distinct first-party images are selected by role. | Asset manifest + screenshots. | Pending | |
| B09 | Broken/blank/duplicate/utility imagery never renders. | Asset failure tests. | Pending | |
| B10 | Incomplete brand triggers asset request and preserves research. | Needs-input E2E. | Pending | |
| B11 | No generic palette is called customer branding. | Partial/unavailable fixture. | Pending | |
| B12 | Target account never reskins seller page. | Align visual fixture. | Pending | |
| U01 | Chat asks one material question at a time. | Desktop E2E. | Pending | |
| U02 | Live Brief remains editable and current-revision only. | Component/E2E race tests. | Pending | |
| U03 | Recommendation chips render only when evidence threshold passes. | Component/E2E tests. | Pending | |
| U04 | Brand-help prompt accepts URL/logo/guide/screenshot and resumes. | Input/resume E2E. | Pending | |
| U05 | No template picker or preview marketplace is prospect-facing. | E2E assertion. | Pending | |
| U06 | Preview contains no receipts, grades, or debug language. | E2E assertion. | Pending | |
| U07 | Workbench preserves two-thirds composer / one-third Live Brief. | Screenshot geometry assertion. | Pending | |
| P01 | Shell appears within 5 seconds. | Benchmark. | Pending | |
| P02 | Safe provisional target remains within 15 seconds when brand minimum is ready. | Benchmark. | Pending | |
| P03 | Final or explicit needs-input terminal state occurs within 60 seconds. | Benchmark. | Pending | |
| P04 | No provider work starts after 60 seconds. | Fake-clock test. | Pending | |
| P05 | Model pass cannot exceed 30 seconds or replace newer revision. | Timeout/race tests. | Pending | |
| P06 | Brand browser pass cannot exceed 20 seconds. | Timeout tests. | Pending | |
| P07 | Local selection/compile/render targets two seconds. | Benchmark receipt. | Pending | |
| V01 | No horizontal overflow at desktop target. | Visual E2E. | Pending | |
| V02 | Full-page capture remains readable. | Desktop screenshots. | Pending | |
| V03 | Hero meets one-lockup/one-promise/one-support/CTA/visual contract. | First-viewport screenshots. | Pending | |
| V04 | Every selected image renders and supports adjacent copy. | Asset manifest + visual review. | Pending | |
| V05 | Text and button contrast pass automated checks. | Axe/contrast test. | Pending | |
| V06 | Keyboard navigation and focus remain usable. | Accessibility E2E. | Pending | |
| O01 | Worker receipts include revision/status/timing/evidence IDs. | Trace tests. | Pending | |
| O02 | Operational traces and behavior analytics remain separate. | Code/test evidence. | Pending | |
| O03 | Raw sources/prompts/responses/credentials never enter traces. | Privacy tests. | Pending | |
| Q01 | `npm run benchmark:preview` passes. | Command receipt. | Pending | |
| Q02 | `npm run qa` passes. | Command receipt. | Pending | |
| Q03 | Desktop E2E passes. | Command receipt. | Pending | |
| Q04 | Production visual evidence suite passes. | Command + manifest. | Pending | |
| Q05 | Autoresearch score reaches at least 90/100 twice with no blocker. | JSONL + report. | Pending | |
| Q06 | Git worktree is clean after logical local commits. | Git status. | Pending | |
| Q07 | No push/deploy/publish/credential/infrastructure mutation occurred. | Handback declaration. | Pending | |
