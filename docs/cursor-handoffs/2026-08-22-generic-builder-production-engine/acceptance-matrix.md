# Acceptance Matrix

Cursor must update the Evidence column with tests, screenshots, or trace artifacts. `Met` requires current-run evidence.

| ID | Requirement | Verification | Evidence | Status |
| --- | --- | --- | --- | --- |
| G01 | Generic builder supports ABM, product, solution, industry, and event/webinar subtype. | Unit + desktop E2E | Current `npm run qa`: `wireframe-library.test.ts`, `golden-scenarios.test.ts`; current desktop E2E: account/campaign/content and guided event (28/28). | Met |
| G02 | Content Magic remains separate and unchanged. | Regression test | Current desktop E2E: guided Content Magic secondary route and seven-section content contract. | Met |
| G03 | Seller domain controls page brand; target is context only. | Brand fixture + E2E | Current `campaign-context.test.ts`, `experience-contract.test.ts`, and account generated-experience desktop fixture. | Met |
| G04 | Stable domain starts research before confirmation. | Fake timers + E2E network trace | Current `research-plan.test.ts`; guided-entry E2E observes preflight research copy and intercepted session request before confirmation. | Met |
| G05 | Domain edit increments revision and stale work cannot patch UI/spec. | Unit + E2E | Current stale-revision coverage in `preview-worker-coordinator.test.ts`, `generic-production-engine.test.ts`, and orchestrator tests; no dedicated browser domain-edit/stale-race scenario. | Partial |
| G06 | Single-flight dedupes same source and revision. | Unit | Current `single-flight.test.ts` via benchmark and full QA. | Met |
| G07 | Research workers run in parallel with bounded deadlines. | Benchmark + receipts | Current `npm run benchmark:preview` (5 files/30 tests) plus coordinator and production worker receipts. | Met |
| G08 | Coordinator does not wait for optional workers. | Timeout test | Current coordinator timeout/fail-soft tests in benchmark and full QA. | Met |
| G09 | No new provider work begins after 60 seconds. | Benchmark | Current benchmark plus `generic-production-engine.test.ts` hard-boundary assertion. | Met |
| G10 | Brandfetch accepts canonical/alias results and returns official logo evidence. | Unit fixtures | Current `brandfetch-logo.test.ts` and `brand-harvester.brandfetch.test.ts`. | Met |
| G11 | DOM/CSS harvester captures semantic colors, fonts, geometry, and assets. | Integration fixtures | Current `brand-harvester.test.ts`, blocked fixture test, and ServiceTitan fidelity fixture. | Met |
| G12 | Screenshot evidence captures color ratios, geometry, density, and hero style. | Fixture/eval | Current `brand-visual-evidence.test.ts` and `brand-system.test.ts`. | Met |
| G13 | Brand conflicts reconcile by authority, freshness, role, and confidence. | Unit | Current `brand-system.test.ts` conflict-order fixture and `evidence-reconciler.test.ts`. | Met |
| G14 | No generic palette is invented when evidence is weak. | Golden fixture | Current weak/fallback palette tests in `brand-system.test.ts` and `brand-fidelity.test.ts`. | Met |
| G15 | Broken/missing logo never shows broken image UI. | E2E | Current generated-experience asset-failure E2E and no-logo recovery capture; manifest reports zero broken images. | Met |
| G16 | Missing imagery selects intentional type/diagram treatment. | Renderer fixture | Current production-engine type-led test, renderer E2E, and no-logo/Apple captures. | Met |
| G17 | Apple fixture is neutral/black-led with scarce blue action. | Visual fixture + screenshot | Current `brand-system.test.ts`; `evidence/apple-{first-viewport,full-page}.png`; manifest records blue action `rgb(0, 113, 227)` and 20px radius. | Met |
| G18 | ADP fixture includes correct logo evidence and observed palette proportions. | Visual fixture + screenshot | Current `brand-system.test.ts` verifies official ADP logo evidence and red ratios; `evidence/adp-{first-viewport,full-page}.png`; manifest records ADP red action. Assets in screenshot are deterministic local stand-ins, not live downloads. | Met |
| G19 | ServiceTitan fixture preserves blue, geometry, button radius, and page character. | Visual fixture + screenshot | Current ServiceTitan fidelity/system fixtures; `evidence/servicetitan-{first-viewport,full-page}.png`; manifest records `rgb(2, 101, 220)` and 6px radius. | Met |
| G20 | 6sense/Cisco/no-logo recovery paths are covered. | Unit + E2E | Current verified-profile 6sense unit fixture, Cisco account E2E, and `no-logo-recovery` desktop E2E/captures. | Met |
| G21 | Audience/account step shows three AI chips plus free-form. | Component + E2E | Current audience recommendation unit contract, streaming composer component test, and editable guided-entry E2E. | Met |
| G22 | Offer/topic step shows three evidence-based chips plus free-form. | Component + E2E | Current offer recommendation unit contract, app question projection tests, and guided-entry E2E. | Met |
| G23 | Objective step shows three aligned chips plus free-form. | Component + E2E | Current objective/CTA recommendation unit contract, app question projection tests, and guided-entry E2E. | Met |
| G24 | Exactly one chip is marked Recommended and selection is visually obvious. | Component + accessibility | Current recommendation cardinality tests and `streaming-brief-composer.test.tsx` Recommended-label interaction. | Met |
| G25 | Recommendations may update without overwriting visitor edits. | Unit + E2E | Current reconciler/recommendation preservation tests and guided Live Brief edit E2E. | Met |
| G26 | Live Brief shows provenance and remains editable. | Component + E2E | Current app/component tests plus guided-entry E2E showing Seller provenance and edit controls. | Met |
| G27 | Workbench remains two-thirds conversation and one-third right rail on desktop. | Screenshot + layout assertion | Existing desktop workbench behavior passes, but this run did not capture a workbench screenshot with an explicit 2:1 geometry assertion. | Partial |
| G28 | Progress uses real receipts, not percentages or theater. | Component + trace assertion | `preview-lifecycle-surface.test.tsx` verifies receipt-backed states and production trace receipts pass; legacy enhancement progressbars still expose determinate values. | Partial |
| G29 | Framework selector is deterministic with bounded model ranking and reason codes. | Unit | Current `message-spine.test.ts`. | Met |
| G30 | Wireframe selector is deterministic, internal, and reason-coded. | Unit | Current `wireframe-library.test.ts`; no prospect-facing selector in desktop E2E. | Met |
| G31 | Section count is dynamically 4-8 based on material and composition. | Unit/golden | Current wireframe and session production-engine tests. | Met |
| G32 | Writers receive section role, evidence, word budget, and component slots. | Contract test | Current `section-copy-types.test.ts` and all five writer suites. | Met |
| G33 | Unsupported tension/urgency is omitted. | Eval/golden | Current production-spine, problem/urgency writer, factuality, and compiler tests. | Met |
| G34 | Buyer-facing copy contains no banned jargon or generic filler. | Validator + eval | Current factuality/editor tests and generated-experience forbidden-copy E2E. | Met |
| G35 | Every declarative claim maps to evidence and confidence. | Contract/eval | Current writer/factuality claim-map tests and production artifact `claimToEvidence` coverage. | Met |
| G36 | CTA defaults to book a meeting, with supported ABM/event exceptions. | Unit/golden | Current `objective-cta-recommendations.test.ts` generic, ABM, and event cases. | Met |
| G37 | `ExperienceSpecV2` remains the sole render contract. | Architecture test/search | Current `experience-contract.test.ts` and `session-production-engine.test.ts` assert schema 2.0; current architecture search found no new alternate render contract. | Met |
| G38 | No arbitrary model-generated CSS/HTML/JS enters the renderer. | Security test | Current writer/factuality rejection tests and hostile renderer input tests in full QA. | Met |
| G39 | Provisional page is interactive and honest; final upgrades current revision only. | E2E | Current lifecycle/orchestrator stale refinement tests and generated experience interaction E2E; no browser scenario exercises provisional-to-final replacement end to end. | Partial |
| G40 | Any worker/provider failure still yields a valid page or safe support-reference artifact. | E2E | Current compiler worker-failure tests and asset-failure E2E; provider failure is not exercised through the browser session API in this run. | Partial |
| G41 | Visual soft-fail never blocks reveal and triggers at most one repair. | Unit + benchmark | Current compiler one-repair/current-revision test plus benchmark fail-soft receipts. | Met |
| G42 | Operational traces reconstruct worker, revision, duration, fallback, and reveal. | Trace test | Current `generic-production-engine.test.ts` reconstructable receipt assertion plus `trace-store.test.ts`. | Met |
| G43 | Logs/analytics contain no raw prompt, domain, URL, email, source, copy, HTML, or secret. | Redaction test | Current `observability.test.ts`, product analytics tests, and production receipt no-copy/domain/URL assertion. | Met |
| G44 | Keyboard, focus, labels, contrast, reduced motion, and contained scrolling pass. | Accessibility E2E | Current desktop keyboard/tab/scroll containment tests and reduced-motion visual capture pass; no explicit automated contrast audit was run. | Partial |
| G45 | `benchmark:preview`, full `qa`, and desktop E2E pass. | Exact commands | Current: benchmark 5/30; QA 106/938 plus both production builds; desktop E2E 28/28. | Met |
| G46 | Local screenshots cover first viewport and full page for three brands. | Evidence files | Eight PNGs under `evidence/`: first/full Apple, ADP, ServiceTitan, and no-logo recovery; `visual-evidence-manifest.json`. | Met |

## Blocking defects

The package is not review-ready if any of these remain:

- missing official logo when verified evidence exists;
- seller page dominated by the wrong color role;
- invented claim, statistic, customer, or urgency;
- blank media placeholder, broken image, blank page, or permanent spinner;
- prospect-facing template selector;
- stale revision overwrites current work;
- provider work continues past the hard cutoff;
- raw input or secret appears in a trace;
- QA/build/E2E failure;
- uncommitted implementation work;
- push, deploy, Folloze write, or infrastructure mutation.
