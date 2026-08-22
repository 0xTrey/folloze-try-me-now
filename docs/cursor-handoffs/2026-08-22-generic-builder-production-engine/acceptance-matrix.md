# Acceptance Matrix

Cursor must update the Evidence column with tests, screenshots, or trace artifacts. `Met` requires current-run evidence.

| ID | Requirement | Verification | Evidence | Status |
| --- | --- | --- | --- | --- |
| G01 | Generic builder supports ABM, product, solution, industry, and event/webinar subtype. | Unit + desktop E2E |  | Pending |
| G02 | Content Magic remains separate and unchanged. | Regression test |  | Pending |
| G03 | Seller domain controls page brand; target is context only. | Brand fixture + E2E |  | Pending |
| G04 | Stable domain starts research before confirmation. | Fake timers + E2E network trace |  | Pending |
| G05 | Domain edit increments revision and stale work cannot patch UI/spec. | Unit + E2E |  | Pending |
| G06 | Single-flight dedupes same source and revision. | Unit |  | Pending |
| G07 | Research workers run in parallel with bounded deadlines. | Benchmark + receipts |  | Pending |
| G08 | Coordinator does not wait for optional workers. | Timeout test |  | Pending |
| G09 | No new provider work begins after 60 seconds. | Benchmark |  | Pending |
| G10 | Brandfetch accepts canonical/alias results and returns official logo evidence. | Unit fixtures |  | Pending |
| G11 | DOM/CSS harvester captures semantic colors, fonts, geometry, and assets. | Integration fixtures |  | Pending |
| G12 | Screenshot evidence captures color ratios, geometry, density, and hero style. | Fixture/eval |  | Pending |
| G13 | Brand conflicts reconcile by authority, freshness, role, and confidence. | Unit |  | Pending |
| G14 | No generic palette is invented when evidence is weak. | Golden fixture |  | Pending |
| G15 | Broken/missing logo never shows broken image UI. | E2E |  | Pending |
| G16 | Missing imagery selects intentional type/diagram treatment. | Renderer fixture |  | Pending |
| G17 | Apple fixture is neutral/black-led with scarce blue action. | Visual fixture + screenshot |  | Pending |
| G18 | ADP fixture includes correct logo evidence and observed palette proportions. | Visual fixture + screenshot |  | Pending |
| G19 | ServiceTitan fixture preserves blue, geometry, button radius, and page character. | Visual fixture + screenshot |  | Pending |
| G20 | 6sense/Cisco/no-logo recovery paths are covered. | Unit + E2E |  | Pending |
| G21 | Audience/account step shows three AI chips plus free-form. | Component + E2E |  | Pending |
| G22 | Offer/topic step shows three evidence-based chips plus free-form. | Component + E2E |  | Pending |
| G23 | Objective step shows three aligned chips plus free-form. | Component + E2E |  | Pending |
| G24 | Exactly one chip is marked Recommended and selection is visually obvious. | Component + accessibility |  | Pending |
| G25 | Recommendations may update without overwriting visitor edits. | Unit + E2E |  | Pending |
| G26 | Live Brief shows provenance and remains editable. | Component + E2E |  | Pending |
| G27 | Workbench remains two-thirds conversation and one-third right rail on desktop. | Screenshot + layout assertion |  | Pending |
| G28 | Progress uses real receipts, not percentages or theater. | Component + trace assertion |  | Pending |
| G29 | Framework selector is deterministic with bounded model ranking and reason codes. | Unit |  | Pending |
| G30 | Wireframe selector is deterministic, internal, and reason-coded. | Unit |  | Pending |
| G31 | Section count is dynamically 4-8 based on material and composition. | Unit/golden |  | Pending |
| G32 | Writers receive section role, evidence, word budget, and component slots. | Contract test |  | Pending |
| G33 | Unsupported tension/urgency is omitted. | Eval/golden |  | Pending |
| G34 | Buyer-facing copy contains no banned jargon or generic filler. | Validator + eval |  | Pending |
| G35 | Every declarative claim maps to evidence and confidence. | Contract/eval |  | Pending |
| G36 | CTA defaults to book a meeting, with supported ABM/event exceptions. | Unit/golden |  | Pending |
| G37 | `ExperienceSpecV2` remains the sole render contract. | Architecture test/search |  | Pending |
| G38 | No arbitrary model-generated CSS/HTML/JS enters the renderer. | Security test |  | Pending |
| G39 | Provisional page is interactive and honest; final upgrades current revision only. | E2E |  | Pending |
| G40 | Any worker/provider failure still yields a valid page or safe support-reference artifact. | E2E |  | Pending |
| G41 | Visual soft-fail never blocks reveal and triggers at most one repair. | Unit + benchmark |  | Pending |
| G42 | Operational traces reconstruct worker, revision, duration, fallback, and reveal. | Trace test |  | Pending |
| G43 | Logs/analytics contain no raw prompt, domain, URL, email, source, copy, HTML, or secret. | Redaction test |  | Pending |
| G44 | Keyboard, focus, labels, contrast, reduced motion, and contained scrolling pass. | Accessibility E2E |  | Pending |
| G45 | `benchmark:preview`, full `qa`, and desktop E2E pass. | Exact commands |  | Pending |
| G46 | Local screenshots cover first viewport and full page for three brands. | Evidence files |  | Pending |

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
