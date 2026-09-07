# Messaging build-flow upgrade

Date: September 7, 2026

## Goal and boundary

Implement the 30 approved improvements inside the generation pipeline. Existing inputs, screens, questions, navigation, save and engagement actions, public API contracts, and final-only reveal stay unchanged. Infer only from the existing brief and permissioned evidence. Do not add a required question, silently activate visitor experiments, publish an experience, or deploy production as part of implementation.

The canonical work location is this repository on `codex/messaging-buildflow-30`, starting from `43dac57`. Three pre-existing screenshot changes in `output/product-owner-remediation/` are outside this work.

## Acceptance ledger

All 30 build-flow capabilities are implemented. The evidence below covers local runtime integration, automated checks, and bounded browser QA. Human approval, live conversion lift, remote saves, deployment, and publication remain separate receipts.

| # | Improvement | Build-only interpretation | Evidence |
| --- | --- | --- | --- |
| 1 | One Experience Plan | Compile current inputs into one plan consumed by writers, layout, and final review. | `compileBuildExperiencePlan` is called by the session compiler and consumed by generic production, section contracts, render design, and quality review. Plan and integration tests pass. |
| 2 | Visual and language brand kit | Version existing verified brand observations and sourced voice into a shared build contract. | `build-brand-kit.ts` versions visual, voice, asset, readiness, and direction inputs. Its tests cover first-party asset authority and sparse brands. |
| 3 | Offer-specific knowledge | Keep offer facts, corporate context, proof, and buyer context separately scoped. | `buyer-decision-journey.ts`, `content-source-knowledge.ts`, and the plan claim matrix reject off-offer and mismatched-source evidence. Adversarial integration tests pass. |
| 4 | Buyer situation | Derive traffic, stage, and decision from existing answers; retain unknowns. | Buyer brief and journey tests cover cold traffic, evaluation, known CTA expectations, and unknown inputs. |
| 5 | Readiness | Assess missing evidence internally; use existing safe terminal behavior, without new questions. | Plan readiness and production insufficient-evidence gates are exercised before model calls. No new required input or screen. |
| 6 | Strategic concepts | Rank bounded, evidence-eligible internal concepts; select automatically. | The plan carries the existing thesis strategy selection and eligible concepts into the actual writer contracts. Existing selection and production compiler regressions pass. |
| 7 | Buyer-question narrative | Give retained sections distinct jobs and transitions from the selected plan. | `assignBuyerJourneySections` supplies questions, conclusions, transitions, and scoped references to production contracts. Journey and integration tests pass. |
| 8 | Specificity | Require substantive offer detail and penalize competitor-swappable copy. | Candidate review and `build-quality-policy.ts` reject unsupported or generic factual sections. Tests cover validation-only pages and source-specific detail. |
| 9 | Evidence-led explanation | Assign permitted facts and proof to their explanatory role. | The plan claim matrix separates capability, proof, content insights, event details, and target-account context. Public and uploaded-source tests pass. |
| 10 | Thin-evidence fallback | Prefer concise supported facts, useful existing validation devices, or omission over filler. | `repairBuildFallbacks` retains whole permitted claims, preserves useful choice sections, and omits exhausted explanations. Compiler-to-render regression catches repeated guide paragraphs. |
| 11 | Art direction | Derive a coherent direction from brand, evidence, and assets. | The brand kit selects type, product, editorial, or evidence treatment. `buildRenderDesign` reaches the production renderer; direction tests pass. |
| 12 | Joint copy and layout | Give writers and renderer the same semantic and visual section contract. | Section contracts receive occupancy and mobile intent from the same plan as renderer CSS. Integration and render-design tests pass. |
| 13 | Flexible components | Select tested existing compositions and earned modules without new controls. | Existing family compositions render only retained roles. Locked-family, sparse-brand, and renderer tests pass. |
| 14 | Asset jobs | Allocate available verified imagery by narrative purpose without inventing assets. | Brand asset roles and the existing asset allocator preserve first-party and non-repetition fences. All local fixture images loaded in browser QA. |
| 15 | Mobile composition | Improve generated content fit and responsiveness inside existing components. | Shared copy limits and scoped responsive CSS are active. Four 390px frames had no horizontal overflow or copy extending beyond its section. |
| 16 | Useful interaction | Select and validate existing interaction devices for buyer usefulness. | Existing action contracts remain authoritative. Browser checks exercised section navigation, local next-step scrolling, and resource opening. |
| 17 | Optional depth | Use existing retained modules and navigation for evidence-supported depth. | Journey assignments gate proof/resource depth; rendered navigation tracks retained sections. No new navigation controls. |
| 18 | CTA integrity | Preserve the shared label, destination, expectation, and existing action behavior. | CTA tests cover truthful fallback labels and expectations. The guide CTA opened the expected Apple Support page in a new tab. Its closing headline now describes resource reading. |
| 19 | Meaningful personalization | Use permissible account context to alter relevance and evidence priority. | Account-context claim scopes and family writers preserve both identities. Strict session tests verify at least five differing account roles and locked Align behavior. |
| 20 | Controlled revision | Reuse existing input revisions, preserving unchanged approved build sections internally. No new editor. | Per-section dependency digests and actual section-client cache tests cover revision reuse, session isolation, and atomic retention of a valid prior final page. |
| 21 | Reusable knowledge | Reuse versioned evidence and model work with freshness and privacy fences. | Section response cache and encrypted public-offer source cache have scope, TTL, size, URL, and privacy tests. Persistent cache effectiveness has not been measured in production. |
| 22 | Stage timing | Record build stages, cold/warm reuse, fallback reasons, and final outcomes. | Production emits plan, compile, quality, source-cache, and buyer-ready timing receipts. Provider timing remains unmeasured; deterministic benchmark durations are labeled accordingly. |
| 23 | Bounded model topology | Keep deterministic checks cheap; bound independent drafting and editorial calls. | Removed the duplicate global draft call from orchestration. Existing bounded section wave plus capped semantic review/repair remain. Deadline and lifecycle tests pass. |
| 24 | Targeted regeneration | Invalidate changed dependencies, not every section. | `compareBuildPlanDependencies` and actual client-cache integration verify CTA/source changes invalidate affected work while retaining unrelated same-session sections. |
| 25 | Final deadline | Reserve finalization time and preserve final-only output with honest recovery. | Explicit zero budget cannot reopen provider work. Logical-clock cutoff, finalization reserve, stale-revision, and retained-final tests pass. |
| 26 | Separate quality dimensions | Evaluate factual safety, brand fidelity, and buyer usefulness independently. | `evaluateBuildQuality` emits separate dimensions and blocks failed pages. Public receipts contain bounded codes and counts, not source prose. |
| 27 | Representative benchmark | Replay 30 or more realistic synthetic briefs with source boundaries and blinded review output. | Candidate replay: 30/30 expected outcomes, 23 compiled pages and 7 intentional safe fallbacks. Blinded review artifacts are emitted without human scores. |
| 28 | Rendered QA | Check desktop/mobile layout, content, assets, navigation, and actual actions. | Four real compiler/renderer fixtures checked at desktop and mobile sizes. Eight fixed frames passed geometry/assets/heading checks. See the browser capture limitation below. |
| 29 | Approved-edit learning | Add an internal reviewed-feedback import/evaluation path; no unapproved global self-modification. | Reviewed-feedback CLI and exact-provenance selector are tested and connected to the static production registry. The committed registry is empty, so no feedback is activated. |
| 30 | Outcome measurement | Extend offline controlled-experiment analysis; do not enroll production visitors automatically. | Offline analysis CLI uses the canonical preregistration, fixed-horizon, unit-deduplication, and uncertainty functions. No enrollment, conversion-lift claim, or automatic winner. |

## Verification receipts

On September 7, `npm run qa` completed successfully: lint had no errors and three pre-existing unused-variable warnings; typecheck passed; 197 test files passed with 2,003 tests passed and one skipped; both normal and webpack production builds passed. `git diff --check` passed.

- Candidate benchmark: `output/build-flow-benchmark/candidate-2026-09-07T21-35-39-636Z.json`.
- Blinded review: `output/build-flow-benchmark/blind-review-candidate-2026-09-07T21-35-39-636Z.json`.
- Fresh visual bundle: `output/build-flow-visual-qa/2026-09-07T21-30-35-144Z/`.
- Browser receipt: `output/build-flow-visual-qa/2026-09-07T21-30-35-144Z/browser-qa.json`.

Browser QA found and repaired repeated guide copy, a mismatched resource-action headline, and an incorrectly grouped CSS selector that narrowed whole sections. Original previews and diagnostic captures remain available. Some later full-page screenshots showed browser compositor scaling artifacts. The final fixed-size iframe checks independently verified all eight layouts, with no horizontal overflow, missing images, duplicate H1, or copy extending beyond section bounds. Diagnostic PNGs are not a human visual approval receipt.

The candidate benchmark uses synthetic evidence and deterministic compilation. The cache tests use the real section client with a stub provider. Neither is a real-model quality or latency measurement. No before/after improvement percentage is claimed because a pre-change replay was not captured.

## Internal operation

Run `npm run benchmark:build-flow` for the focused build suite. Set `EMIT_BUILD_FLOW_BENCHMARK=1 BUILD_FLOW_BENCHMARK_LABEL=candidate` when running `scripts/emit-build-flow-benchmark.test.ts` to preserve a timestamped candidate. Set `EMIT_BUILD_FLOW_VISUAL_QA=1` when running `scripts/emit-build-flow-visual-qa.test.ts` to generate a fresh local review bundle without overwriting prior previews.

Reviewed feedback is imported with `npm run build-flow:import-learning -- --input <repo-input.json> --output <new-repo-output.json>`. Input must include explicit reviewer approval, exact build/evidence provenance, and a trusted ledger. Review accepted rules and their trusted entries in Git before changing `src/lib/generation/approved-build-learning-registry.json`. The selector matches brand, offer, evidence digest/version, source build/version, and ledger version. Imported text remains untrusted editorial guidance and passes the normal evidence and quality gates. The current registry contains no active rules.

Analyze an already registered offline experiment with `npm run build-flow:analyze-outcomes -- --input <repo-input.json> --output <new-repo-output.json> --as-of <ISO-time>`. The fixed horizon must have elapsed; assignments and exclusions must follow the input registration. Output is aggregate analysis with uncertainty, not an automatic rollout or a causal-lift guarantee. Both CLIs reject overwrites and paths outside the repository.

## Release boundary

The implementation does not add user inputs, screens, questions, controls, or API request fields. No visitor experiment, feedback rule, email, Folloze publication, remote push, or production deployment was activated by this work. Release requires a separate decision and fresh production verification. Previously saved HTML does not regenerate merely because new code is deployed.

Initial product targets remain targets: 80 percent of benchmark pages approved without substantive editing, and 95 percent of eligible builds reaching a final page within 60 seconds. Automated results must not be described as human approval or measured production performance.
