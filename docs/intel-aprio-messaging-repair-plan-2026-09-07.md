# Intel and Aprio messaging repair

Status: Trey approved the coordinated repair and production release at 21:03 CDT on September 7. Implementation and local automated verification pass. Fresh provider-backed Intel and Aprio builds saved and read back successfully. Remote regression checks and desktop/mobile browser review remain release gates. Production has not changed.

## Outcome

Use the existing builder pipeline to produce a coherent, source-supported buyer argument. Preserve the current intake flow, avoid new setup questions, and verify fresh Intel and Aprio generated experiences before reporting success. Do not treat safe but empty copy as finished marketing.

## What to lift from the builder skills

| Builder principle | Apply it here |
| --- | --- |
| Message spine before copy | Bind the selected offer, audience, buyer priority, mechanism, outcome, proof, and next action in the existing message strategy and build plan. Missing urgency or proof remains an internal limitation, not an invented claim. |
| One argument across the page | Every section must add a distinct reason to believe, decision input, proof, or useful action. Rephrasing a prior claim does not earn another section. |
| Buyer-facing headlines | Use specific declarative headlines. Remove question-only subheaders and internal labels such as Scope, Requirements, or Next step when they substitute for actual content. |
| Source fact, implication, action | Preserve the relationship between an actual product/service name, its description, and its destination. Explain its relevance without turning an inference into a fact. |
| Account-substitution test | An account version must change the argument, mechanism relevance, outcome, and next action, not just the logo and company name. Keep private account details out of visible copy. |
| Rendered buyer review | Read the exact generated page top to bottom, exercise its interactions, and inspect desktop/mobile output. Compiler and health checks are separate receipts. |

Authorities read for this comparison: `Folloze-MCP-Demo-Builder/SKILL.md`, especially Message Spine Before Writing and Final Copy QA; `Folloze-One-To-One-Microsite-Builder/SKILL.md`; the strategist's `references/builder-handoff-contract.md`; and shared board-quality gates. These are messaging and acceptance contracts to adapt, not instructions to run an MCP board publication or add a second framework.

## Verified failures

### Intel intake and failed build

The reported build selected `Deliver AI scale` as the product and used Intel's general homepage as its offer source. The final quality gate withheld the result with `no_substantive_middle_explanation`. Keep that protection.

Two upstream defects were confirmed:

- Evidence-item projections bypassed the homepage semantic fence when the source was a nested `homepage.html` URL classified as an official page.
- Discovery rejected real short product labels because its product markers omitted processors and CPU, while a broad short-title heuristic treated those names as slogans.

The live homepage fetch on September 7 returned HTTP 200 and 142,221 bytes. It contains product navigation for Intel Core Ultra Processors, Intel Xeon Processors, and Intel Xeon CPU Max Series with individual product-detail URLs. These names and links are usable discovery evidence. The homepage slogan is not a product identity.

The current local recommendation guard requires affirmative offer evidence or complete meaningful agreement with a named product-detail URL. It suppresses brand-only product indexes and staff headings. Fresh runtime testing also caught generic taxonomy and editorial labels; their regressions now sit beside explicit positive coverage for real product and service names.

### Aprio generated copy

Read-only inspection of the reported Aprio build confirmed the correct selected source, `https://www.aprio.com/audit-assurance/`, a ready, complete, non-truncated HTML extraction, and eight extracted claims. Missing source access was not the main cause of this failure.

The saved source includes employee benefit plan audits, financial assurance, non-financial assurance, and Uniform Guidance compliance. The generator had substantive material available but substituted generic questions and repeated paragraphs.

The owning paths are `build-fallbacks.ts` and `exploration-section-writer.ts`. One inserts a question subheader and generic decision cards. The other places a cited paragraph above Scope, Requirements, and Next step questions. The previous quality policy accepted the whole section because its paragraph contained evidence, without checking each card's substance.

Primary public sources: [Intel homepage](https://www.intel.com/content/www/us/en/homepage.html) and [Aprio Audit & Assurance](https://www.aprio.com/audit-assurance/), checked September 7, 2026.

## Approved coordinated repair

1. Finish affirmative offer validation and source binding. Verify actual Intel product recommendations through the intake, not only isolated label tests.
2. Give objective recommendations distinct jobs and real actions. Education, sales conversations, and resource engagement are different objectives; recommend resource engagement only when an appropriate resource exists. Do not promise downloads or bookings that merely scroll. Do not force three near-synonyms to fill the control.
3. Repair the existing writers and their shared contract. Give cards distinct supported content. Preserve useful source topic/description ownership. Allow a redundant section introduction to be absent when substantive cards carry the section. Do not replace unsupported sections with generic homework.
4. Apply the same acceptance rules to model and deterministic output. Check individual card evidence, section-to-section repetition, specific buyer relevance, and CTA behavior. A factuality pass does not imply a usefulness pass.
5. Update realistic regressions and benchmark expectations, then run repository QA and fresh provider-backed Intel and Aprio flows through the rendered result. Preserve earlier previews. Do not weaken acceptance to make an old fixture pass.

No new framework selector, intake question, visitor experiment, or Folloze publication is part of this plan. The app production release is authorized but remains separate from local verification.

## Local work and verification

Branch: `codex/intel-aprio-intake-copy-repair`, based on `28f39eff49947dbf5af6907160ec3916c4b4f0b6`.

The coordinated repair covers offer discovery/ranking, objective/CTA contracts, source extraction and citation ownership, section writers, model and deterministic acceptance, sparse-evidence allocation, renderer section identity, and realistic regressions. The three pre-existing modified PNGs in `output/product-owner-remediation/` are preserved and excluded from the repair commit.

Local verification completed at 22:05 CDT on September 7:

- 2,037 tests passed, one skipped, including all 30 build-flow benchmark scenarios.
- Lint passed with the same three pre-existing unused-variable warnings in `cloudflare-upload-contract.test.ts`.
- TypeScript validation passed during both the Turbopack and webpack production builds. Both builds passed.
- `git diff --check` passed. Temporary diagnostic routes and logging were removed before the final builds.
- A bounded independent review of source ownership, claim allocation, and numeric-identity handling found no actionable defect; its 45 focused tests passed.

The initial broader tests failed because the prior writers violated the stricter rules. The repair fixes those writers rather than accepting generic question cards. Thin fixtures now require a safe fallback when their evidence cannot earn a complete page.

## Scope checkpoint

The investigation skill's Phase 4 checkpoint was satisfied by Trey's instruction at 21:03 CDT: "do it and then pish to prod". That approval covers the coordinated repair, remote save, and production release after verification. Do not ask for the same scope approval again.

## Fresh runtime findings during the approved repair

The first fresh local Intel intake recommended Core Ultra Series 3 Processors, with distinct awareness and sales-conversation goals. The first provider-backed build still failed the final copy check. Its exact source artifact exposed table and footnote crowding plus overly strict product-title matching. The source repair now reserves citation-contained descriptions from distinct sections and keeps product FAQs separate from table metrics and footnotes. A new extraction and build are required; the old failed run is not a success receipt.

The first fresh local Aprio build saved and read back a final artifact. Reading its anonymous HTML confirmed substantive service cards but also an unsupported generic validation paragraph. The plan now removes unearned validation sections or gives them their own remaining source detail. Thin benchmark fixtures with only an offer identity and one useful detail now require a safe failure instead of a four-section page padded with questions. Existing previews are preserved for comparison.

Another fresh Intel build exposed numeric identity handling: the factuality editor treated the `3` in the exact selected product name as an unsupported statistic. The editor now recognizes bounded complete entity names while still rejecting unsupported metrics elsewhere, including `3 hours`, `50%`, or a different model number. A session-level regression verifies that the product name survives when capability quotations omit its model number.

Reading a later Intel result caught a paraphrased duplicate across two sections. Model and semantic-repair contracts now honor the deterministic allocation's reserved facts, so a section cannot consume another section's only detail. This narrows existing evidence permissions; it does not add facts or change the final safety gates.

Latest fresh local runtime receipts, using real public-source fetches and the configured model provider:

| Run | Final save/readback, UTC September 8 | Anonymous generated HTML |
| --- | --- | --- |
| Intel `qcacSgMUBuRiGo_xZWHSZjh5NCjhl85c` | Saved 03:03:49.601, read back 03:03:49.604; revision 21; structural and truth gates passed | HTTP 200. AI capability introduction, distinct graphics detail, device/form-factor detail, and product-page action. No question subheaders. |
| Aprio `1sl3uHnS0Y23XsMeP1x83fxDhuJYSrFo` | Saved 03:03:50.250, read back 03:03:50.253; revision 21; structural and truth gates passed | HTTP 200. Audit/reporting explanation and a distinct Employee Benefit Plan audit detail. No generic question cards or repeated paragraphs. |

Intel's fresh intake offered actual named products and two distinct objectives: Build product awareness and Generate sales conversations. The resulting CTA links to the selected Intel product page. Local Aprio has no booking destination configured, so its CTA honestly scrolls instead of claiming to book a meeting.

These local runs use in-memory persistence with external lead delivery, Folloze writes, Redis, and Blob storage disabled. Their save/readback receipts do not prove production persistence or live delivery. Source and copy were inspected through the app's API and anonymous HTML; desktop/mobile rendering and interactions still require browser verification. The earlier previews remain unchanged.

Browser verification is pending because the Mac is locked. An API result or saved HTML is not a desktop/mobile visual approval.

Production was not changed by this repair. The prior release receipt remains in `docs/messaging-buildflow-30.md`; recheck the live alias before any future deployment.
