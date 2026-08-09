# Try Me Now rich-experience hardening plan

Status: approved implementation direction  
Owner: Trey Harnden  
Prepared: 2026-08-09  
Related decisions: D-003, D-004, D-005, D-011, D-017, D-024, D-026 through D-033

## North star

A prospect supplies only a company domain and one short description, URL, or
document. Folloze immediately understands the brand, turns the input into a
visible and editable buyer brief, and produces a rich, source-grounded,
brand-native experience within 60 seconds.

The experience must feel simple to the prospect because Folloze does the hard
work. It must not feel like a prompt studio, a six-field intake form, a template
marketplace, or a transcript-heavy chatbot.

## Part 1: Zoom review and product direction

Source reviewed:
`/Users/treyharnden/Downloads/GMT20260809-204942_Clip_Trey Harnden's Clip 08_09_2026.mp4`

The 3:41 clip demonstrates the useful parts of the in-platform Campaign Agent:

| Time | Observed behavior | Try Me Now implication |
| --- | --- | --- |
| 0:00–0:26 | One large composer asks what the visitor wants to promote and supports a URL or file. | Use one natural-language brief composer after the prospect chooses a motion. |
| 0:26–0:45 | One sentence—“Build a landing page to promote my lawn care service”—starts the work. | Parse the sentence into the existing structured brief instead of requiring every field first. |
| 0:45–1:15 | The agent asks only for the missing audience and proposes relevant choices. | Ask one high-leverage clarification at a time and offer one recommendation plus alternatives. |
| 1:15–1:36 | The requested outcome becomes the CTA direction. | Keep objective and CTA as explicit structured truth even when inferred from conversation. |
| 1:36–2:18 | A large, clear creation state replaces the small spinner. | Make build progress spacious, truthful, and tied to actual work receipts. |
| 2:18–3:00 | The output is a branded, substantial landing page with dedicated copy and visuals. | The first preview must use the same verified brand, evidence, wireframe, and renderer contracts as the final page. |
| 3:00–3:22 | Adjacent email and ad examples make the result feel like a campaign kit. | Offer these only after the buyer page is ready; they never block the 60-second preview. |

### Decision: use a hybrid conversational composer

Yes, a streaming text box is the easier and more engaging medium—but only as
the presentation layer over the structured product engine.

The prospect flow becomes:

1. Choose one of the three motions: account, campaign, or content.
2. Enter the company domain if it is not already present in the sentence.
3. Write one short sentence, paste a public URL, or attach a PDF.
4. Watch Folloze convert that input into a visible `Live Brief`:
   - Your brand
   - Who it is for
   - What it is about
   - What the buyer should understand or do
   - Source and proof
5. Answer only the single most important unresolved question.
6. Explore the provisional preview while deeper brand, source, and copy work
   upgrades it in place.

This is not an open-ended chat. It must not let raw model prose become product
truth, choose an arbitrary wireframe, invent claims, or create uncontrolled
generation instructions. Every inferred field has provenance and remains
editable.

## The hardening backlog

### A. Make input feel effortless

1. Replace the form-like middle of the flow with one motion-aware `IntentComposer`.
2. Accept one sentence, one public URL, or one PDF from the same surface.
3. Keep company domain explicit when it cannot be safely inferred; start seller-brand research immediately after it stabilizes.
4. Parse intent into seller, target, offer/source, audience, outcome, and CTA direction without exposing parser terminology.
5. Show an immediate “I’m reading this as…” receipt before accepting inferred values.
6. Ask exactly one unresolved question at a time; never show a backlog of empty fields.
7. Provide one recommended audience or outcome plus two useful alternatives and an edit path.
8. Collapse completed turns into one-line receipts so the visitor never scrolls through a chat transcript.
9. Keep a five-row `Live Brief` visible and editable on desktop.
10. Start eligible research on a 500–650 ms text pause; selections and chips start work immediately.

### B. Make brand extraction fast and trustworthy

11. Introduce one end-to-end 60-second deadline coordinator instead of allowing each provider to consume its independent maximum.
12. Split brand readiness into `minimum-safe` and `design-enriched` states.
13. Use Brandfetch identity, official logo, semantic colors, fonts, canonical domain, and public HTML/CSS in the fast truth path.
14. Treat desktop browser DesignDNA as progressive enrichment; mobile capture never gates the desktop preview.
15. Reconcile the app's 12–20 second remote budget with the harvester service's longer internal budget.
16. Propagate session supersession and request cancellation into browser work so abandoned jobs release capacity.
17. Parallelize exact domain, first-party canonical redirect, and registrable-parent Brandfetch candidates within one bounded budget.
18. Deduplicate official-logo byte validation by candidate URL and content hash.
19. Require a real logo-delivery receipt; a theoretical CDN URL is not a successfully rendered logo.
20. Create a field-level brand evidence ledger for logo, color roles, fonts, button, card, layout, motif, and imagery.
21. Reconcile palette roles from Brandfetch metadata, CSS variables, visible hero/text/CTA colors, and contrast—not raw frequency alone.
22. Add semantic DOM clustering for header, hero, primary CTA, card family, section rhythm, and display/body typography.
23. Rank imagery by editorial purpose and provenance; reject badges, tiny rasters, third-party widgets, dated event art, and irrelevant stock imagery.
24. Persist safe derived brand evidence by canonical domain and evidence version with stale-while-revalidate; do not cache secrets or raw unrestricted pages.
25. Add provider circuit breakers for blocked, unauthorized, rate-limited, invalid, and timed-out brand sources.

### C. Make messaging genuinely specific

26. Create `MessageSpineV2` before page copy: buyer job, tension, supported change, outcome, seller mechanism, proof boundary, and next decision.
27. Bind every factual sentence or structured claim to one or more evidence IDs.
28. Require the named offer and an evidence-backed mechanism in product and launch campaigns.
29. Require a distinctive target-evidence term in ABM copy; a company-name swap is not personalization.
30. Replace category-shaped deterministic fallback copy with an evidence-aware deterministic composer.
31. Give ABM, product launch, demand, event, proof-led, and content-source experiences distinct editorial contracts.
32. Enforce semantic novelty across the seven sections so the same claim cannot be repeated seven ways.
33. Require each buyer choice to use a different owned job, verb, outcome, and validation question.
34. Treat low-confidence evidence as a question or caveat, never as a declarative promise.
35. Require the CTA to name the concrete next-step deliverable, such as a working session, evaluation guide, or launch brief.
36. Replace whole-draft repair with field- or section-level repair so one weak sentence cannot trigger another full generation call.
37. Separate hard factual gates from voice/style scoring; preserve a factual draft while improving only weak wording.
38. Add an explicit content narrative plan: source premise, cited facts, implication, interaction, and original-source continuity.
39. Precompute the evidence and message spine during background enrichment so the provisional page is already credible.

### D. Make the generated experience visibly rich

40. Add a bounded `visualGrammar` to every wireframe archetype: hero ratio, proof device, interaction mode, media role, cadence, and close treatment.
41. Let BrandDesignDNA select only compatible presentation treatments such as editorial, product-forward, technical-system, minimal-premium, or energetic-campaign.
42. Add `brandDensity` so sparse brands receive disciplined whitespace and expressive brands can use larger color fields and imagery.
43. Add a semantic asset manifest with asset type, source, confidence, crop, placement, alt text, and approved reuse.
44. Enforce one hero visual and prevent accidental reuse later in the page.
45. Render an intentional type-led editorial state when no suitable image exists; never show broken media or generic placeholders.
46. Give each motion a distinctive close: working-session brief, technical validation agenda, proof receipt, campaign conversion panel, or source continuation.
47. Support seller-owned dual-brand ABM treatment with the target brand shown as restrained context—not a competing theme.
48. Add safe `quiet`, `guided`, and `demonstrative` motion profiles with reduced-motion support.
49. Add contrast gates for every derived CTA, accent text, dark field, and image overlay.
50. Prove visual variety across all 17 archetypes with geometry and section-treatment tests, not only copy snapshots.

### E. Make 60 seconds an enforceable product contract

51. Set sub-budgets from a shared deadline: identity/brand minimum 8–15 seconds, source premise 3–5 seconds, provisional render by 15 seconds, first copy pass 18–25 seconds, finalization by 55 seconds.
52. Race the provisional renderer against optional enrichment instead of awaiting all provider work.
53. Split source extraction into a fast premise and a full cited artifact.
54. Reuse one source artifact per input fingerprint and eliminate duplicate story-stage fetches.
55. Use one compact first-pass model schema; move long-form refinement to the remaining budget.
56. Stop starting external work at T+55 and reserve the last five seconds for assemble, render, persist, and terminal state.
57. Keep stale-result attempt ID, fingerprint, artifact-revision, and claim gates unchanged.
58. Hydrate optional imagery and secondary assets after the HTML shell commits without destructive layout shifts.
59. Move noncritical trace/product-snapshot fanout off the visible render path while keeping the durable session mutation authoritative.
60. Guarantee a usable safe provisional page at T+60 even when one provider is degraded; expose the exact evidence gap instead of a generic failure.

### F. Make quality measurable

61. Add a durable attempt record with eligibility, provisional-visible, final-visible, outcome, provider phase timings, fallback reason, and release.
62. Add `preview_rendered` from the browser after the iframe is visibly interactive; server-ready alone is not the user-visible SLO.
63. Track time to brand minimum, source premise, provisional, final, and terminal state without raw domain, prompt, source text, URL, email, or secrets in telemetry.
64. Log structured copy gate failure codes and the selected fallback strategy.
65. Add real-domain replay fixtures for Apple, Cisco, ServiceNow, 6sense, Philips/regional subdomain, CSS-in-JS, provider-blocked, and broken-logo cases.
66. Add deterministic fake-clock contract tests for all three motions: provisional by 15 seconds and terminal by 60 seconds.
67. Add visual golden tests across the six composition grammars and representative brand DNA profiles.
68. Add claim-boundary tests proving a provisional artifact cannot be saved or published and late work cannot mutate a claimed revision.
69. Add analytics privacy tests proving raw prompt, content, domain, URL, email, and credentials never enter ordinary events or PostHog.
70. Add a release dashboard for p50, p95, under-15 provisional rate, under-60 terminal rate, provider degradation, deterministic fallback, and save conversion.

## Priority order

### P0: prove the simple magic

- Conversational composer plus visible Live Brief.
- Minimum-safe brand bundle and fast identity path.
- MessageSpineV2 and evidence-aware deterministic provisional.
- Shared 60-second deadline, provisional by 15 seconds, terminal by 60 seconds.
- User-visible preview timing and privacy-safe attempt telemetry.

### P1: make every result feel intentionally designed

- Visual grammar and semantic asset manifest.
- Browser-derived desktop DesignDNA enrichment and in-place upgrade.
- Section novelty, buyer-job differentiation, proof/CTA gates.
- Real-domain and multi-grammar visual QA matrix.

### P2: deepen the post-preview product story

- Optional, collapsed campaign-kit examples—email and ad-message drafts—generated from the approved message spine.
- Durable brand-evidence cache and provider health routing.
- More refined post-preview controls and activation handoff.

Campaign-kit outputs are explicitly post-preview and draft-only. They do not
alter the core page-generation SLO and do not imply publication, scheduling, or
activation.

## Part 2: custom eight-workstream goal

> **Custom goal:** Harden Folloze Try Me Now so an anonymous prospect can choose
> one of three motions, provide a company domain plus one short sentence, URL,
> or PDF, and receive an extremely rich, source-grounded, brand-native,
> interactive buyer experience within 60 seconds. Replace the form-like middle
> with a conversational composer that projects natural language into visible,
> editable structured truth. Deliver a minimum-safe provisional preview within
> 15 seconds and a final or explicit safe terminal state within 60 seconds.
> Improve brand extraction, message specificity, visual composition, asset
> quality, observability, and regression coverage without weakening SSRF and
> credential safety, source grounding, analytics privacy, deterministic
> wireframe ownership, provisional/final claim gating, or stale-result fences.

### Agent lanes

1. **Product integration and decision owner**  
   Own the interaction contract, decision log, shared types, cross-lane review,
   and final integration. Stop when the eight lanes agree on one state model and
   acceptance contract.

2. **Conversational composer**  
   Build the natural-language input, attachment affordances, interpretation
   receipt, one-question follow-up, compact turn receipts, and editable Live
   Brief. Stop when all three motions use one accessible composer grammar and
   the underlying structured session answers remain authoritative.

3. **Brand fast path**  
   Implement minimum-safe identity readiness, bounded Brandfetch/canonical
   candidate resolution, logo-validation dedupe, evidence receipts, and clear
   provider failure states. Stop when verified identity can unblock the first
   preview without claiming full DesignDNA.

4. **DesignDNA enrichment and renderer fidelity**  
   Add visual grammar, asset manifest, brand density, presentation-only DNA
   authority, contrast checks, and purposeful missing-asset states. Stop when
   representative outputs vary meaningfully by motion and remain visibly native
   to the harvested brand.

5. **Messaging engine**  
   Add MessageSpineV2, evidence binding, motion-specific editorial contracts,
   evidence-aware fallback, novelty/offer/buyer-job/CTA gates, and surgical
   repair. Stop when generic but valid-looking copy is rejected and every
   factual claim is traceable.

6. **60-second orchestration**  
   Add the shared deadline, provider sub-budgets, source fast premise,
   deterministic provisional race, T+55 finalization reserve, and deduped
   per-fingerprint work. Stop when deterministic tests prove <=15-second
   provisional and <=60-second terminal behavior for all three motions.

7. **Observability and analytics privacy**  
   Add durable attempt timing, browser-visible preview timing, provider spans,
   quality/fallback codes, dashboard queries, and completeness measures without
   raw customer input in ordinary analytics. Stop when one failed session can be
   reconstructed safely from session, attempt, trace, and browser events.

8. **QA and adversarial verification**  
   Build real-domain fixtures, fake-clock lifecycle tests, browser flow tests,
   17-archetype visual matrices, broken-logo/source/provider scenarios,
   accessibility tests, and claim/privacy regressions. Stop when the full
   quality gate is green and screenshot/timing evidence is durable in the repo.

## Acceptance contract

1. Three motion cards remain the only first decision.
2. The prospect can begin with one sentence, URL, or PDF and sees a parsed,
   editable brief rather than raw AI output.
3. No more than one unanswered question is visible at once.
4. Seller brand, target brand, and source research begin as soon as their inputs
   stabilize and run concurrently where safe.
5. An honest build surface appears within five seconds of session creation.
6. A source-grounded, interactive provisional preview is visible within 15
   seconds of generation eligibility in deterministic contract tests.
7. A final preview or explicit safe provisional terminal state exists by 60
   seconds; a spinner can never hold the visitor hostage beyond the deadline.
8. Generic colors, text logos, broken imagery, unsupported claims, and arbitrary
   template selection never masquerade as a completed result.
9. Every factual message has evidence provenance; low-confidence evidence is
   framed as a question or caveat.
10. Provisional remains unclaimable, email remains post-value, and no public
    Folloze publish occurs before validated business-email claim.
11. Analytics captures meaningful interactions, errors, and timings while raw
    prompt, source content, URL, domain, email, and secrets stay out of ordinary
    event payloads.
12. Full unit, integration, desktop browser, visual, accessibility, privacy,
    and timing-contract suites pass before deploy.

