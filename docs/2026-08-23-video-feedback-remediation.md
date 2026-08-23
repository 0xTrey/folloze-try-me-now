# Try Me Now video-feedback remediation contract

Date: 2026-08-23
Source: `GMT20260823-185736_Clip_Trey Harnden's Clip 08_23_2026.mp4`
Duration: 3:33
Scope: campaign builder and Content Magic only

## Outcome

The demo must turn a seller domain plus a small amount of campaign or source content into a credible desktop preview without leaving the visitor in an ambiguous state. A partial but honest preview is preferable to an invisible artifact. Missing identity authority may block a branded preview; missing advanced design details may not erase an otherwise usable provisional preview.

The repaired experience is complete only when all of the following are true:

1. A campaign using `amazon.com` plus an official AWS Bedrock page visibly starts work, accepts the official source, preserves a provisional preview when advanced design evidence is incomplete, and makes **Skip to preview** produce an artifact or an explicit failure receipt.
2. The working state is dominant, named, animated, accessible, and driven by real receipt state. It distinguishes waiting, active work, attention required, and an artifact that is actually ready. It never invents a percentage or ETA.
3. Content Magic asks only for a public URL or PDF. Attaching either source starts extraction and generation; it never asks what buyers should understand, who the audience is, or what the goal is.
4. PDF upload either works end to end in the deployed storage topology or is disabled before file selection with an accurate explanation and URL alternative. It never fails silently.
5. URL extraction reports what happened: final URL, extraction method, source type, text/evidence count, warnings, confidence, and a specific recovery path. Empty extraction is not described as understanding the source.
6. Every terminal state includes an actionable next step and a support/trace reference. Long-running work exposes the current operation through progressive, stage-specific status copy.
7. Brand output applies only evidence-backed tokens. Useful identity, logo, palette, and typography evidence can be applied independently; incomplete geometry does not force a generic blue shell or delete a generated artifact.

## Video issue ledger

| Time | Observed problem | Product consequence |
|---|---|---|
| 0:03-0:45 | Amazon seller, AWS Bedrock source, AI/IT audience, and sales-conversation goal are entered. | Reproduction contract. |
| 0:45-0:58 | Colors look plausible, but fonts, section styling, accents, and numeric treatments look wrong. | Brand fidelity is not token-specific or evidence-weighted. |
| 0:58-1:27 | The page appears paused; the small status treatment does not prove active work. | Visitor cannot distinguish progress from failure. |
| 1:27-1:50 | The app asks for a clearer brand source even though an official AWS source was already supplied. | Official seller evidence is harvested but the full-readiness gate still blocks output. |
| 1:50-2:13 | All visible boxes look complete; **Skip to preview** appears to do nothing. | Checklist, generation, brand, and artifact readiness disagree. |
| 2:15-2:49 | Visitor restarts and selects Content Magic. | Campaign failure forces destructive recovery. |
| 2:49-3:06 | The same PDF is selected twice; neither attempt produces a useful result. | Core ingestion path is unavailable or its error is hidden. |
| 3:07-3:15 | A URL produces low confidence and no useful understanding. | Static extraction cannot read the source and exposes no diagnostic recovery. |
| 3:15-3:23 | The app asks what the content should help buyers understand. | A stale legacy prompt contradicts the source-led flow. |
| 3:23-3:33 | A spinner is visible, but it implies indefinite failure rather than trustworthy progress. | Loading semantics do not match real stage state. |

## Root-cause findings

### Confirmed code causes

- `src/lib/orchestrator.ts` discards `experience`, `experienceSpec`, and `qualityReceipt` whenever the final brand profile is not fully `ready`, including when a valid same-seller source already supplied useful identity evidence.
- `src/components/try-me-now-app.tsx` treats checklist/generation eligibility separately from preview/artifact readiness, so all visible inputs can look complete while no experience exists.
- **Skip to preview** only patches inferred answers and waits for the normal generation lifecycle; it does not guarantee a provisional artifact, and the final brand gate may erase the artifact it creates.
- `src/components/streaming-brief-composer.tsx` exposes only a question count and small receipt lines. The orchestrator already records useful stage events and durations, but the UI does not project them as a dominant worker state.
- Content Magic is source-led after attachment, but the older `IntentComposer` still contains the unwanted understand/believe/do prompt.
- The PDF route explicitly rejects uploads when the session store is `upstash-redis`, but the production health endpoint and value-blind environment inventory confirm that the live project is using Vercel Blob. The recorded failure is therefore in callback extraction, not missing storage.
- Content URL extraction reads static HTML only. JS shells, PDF URLs, gates, anti-bot pages, and sparse documents naturally produce empty or low-confidence artifacts.
- Content failure/unreadable states still render an active spinner and `aria-busy`, turning terminal failure into an indefinite working state.
- The app shell consumes only a small subset of brand tokens, while full design DNA is applied later inside the generated iframe. Strict readiness neutralizes useful partial seller colors and typography.

### Evidence-ranked causal catalog

The items below are deliberately separated into **confirmed/likely** causes and **runtime hypotheses**. They are not all simultaneous defects; they form the diagnostic checklist that prevents a superficial fix.

#### UX and state semantics

1. Progress copy does not identify the current operation. **Confirmed**
2. Progress does not expose elapsed time or last update. **Confirmed**
3. The UI does not distinguish queued, running, blocked, stale, failed, and complete. **Confirmed**
4. A spinner continues after failed/unreadable extraction. **Confirmed**
5. `aria-busy` remains true for a terminal content failure. **Confirmed**
6. Checklist completion is visually confused with artifact readiness. **Confirmed**
7. Skip patches inputs instead of guaranteeing a preview attempt. **Confirmed**
8. A disabled or ineffective skip has no visible reason. **Likely**
9. Long work has no dominant stage visualization. **Confirmed**
10. Receipts are too small to reassure a visitor that workers are active. **Confirmed**
11. Restart is the only obvious recovery from a stalled campaign. **Confirmed**
12. A retry does not say whether it resumed, restarted, or reused prior evidence. **Likely**
13. Terminal failures do not consistently offer a specific recovery action. **Confirmed**
14. Empty extraction is framed as low-confidence understanding instead of failure to read. **Confirmed**
15. The Content Magic belief question survives the source-led redesign. **Confirmed**

#### Orchestration and lifecycle

16. Full brand readiness is used as an all-or-nothing preview gate. **Confirmed**
17. A generated artifact is deleted when advanced brand evidence is incomplete. **Confirmed**
18. Same-seller source authority is not sufficient for a provisional artifact. **Confirmed**
19. Brand, brief, generation, and reveal predicates have different definitions of ready. **Confirmed**
20. Skip cannot bypass the final brand gate. **Confirmed**
21. Generation failure has no first-class public terminal state. **Likely**
22. Answer patches can invalidate an in-flight generation attempt. **Likely**
23. Invalidated work is not shown as restarting with the latest brief. **Likely**
24. Stale-attempt suppression can look like inactivity for up to 30 seconds. **Likely**
25. Client polling may preserve a stale public session during worker completion. **Runtime hypothesis**
26. Worker events are richer than the projection consumed by the composer. **Confirmed**
27. Generation can begin from source presence before source usefulness is established. **Confirmed**
28. Content readiness allows a URL even when extraction is failed/unreadable. **Confirmed**
29. The preview pane mounts only when an experience exists, leaving no artifact-level error panel. **Confirmed**
30. Repeated skip clicks lack an explicit idempotency receipt. **Likely**

#### Brand system

31. Shell typography ignores harvested seller typography. **Confirmed**
32. Useful seller accents are neutralized unless the entire brand profile is ready. **Confirmed**
33. Typography, control geometry, card geometry, palette, logo, identity, and source evidence are bundled into one readiness decision. **Confirmed**
34. A missing geometry signal can suppress otherwise useful logo/palette evidence. **Confirmed**
35. The app does not visibly explain which brand tokens are verified versus provisional. **Likely**
36. Generic design-register choices can introduce numeric or section treatments absent from the source brand. **Likely**
37. Seller and product-brand roles can be confused for Amazon versus AWS. **Runtime hypothesis**
38. Brandfetch/public-page/remote-browser evidence can disagree without a visible adjudication receipt. **Likely**
39. Official source redirects or client-rendered pages may reduce available typography/geometry evidence. **Runtime hypothesis**
40. Missing remote-harvester configuration can silently reduce fidelity to a fast HTML/CSS pass. **Likely**
41. CSS custom fonts may be discovered but not technically portable. **Likely**
42. Token confidence is not applied independently by logo, palette, type, shape, and imagery. **Confirmed**
43. Fallback shell styling can be mistaken for harvested brand styling. **Confirmed**
44. No regression fixture covers Amazon/AWS role separation and typography. **Likely**
45. Preview exposure does not state when advanced brand enrichment is continuing. **Confirmed**

#### PDF and URL ingestion

46. The Upstash incompatibility branch exists, but production reports `vercel-blob`; it is not the recorded failure. **Confirmed not causal in production**
47. Direct Blob upload depends on a correctly configured client-token callback. **Likely**
48. Callback/extraction failures are collapsed into generic client copy. **Confirmed**
49. The exact 1.62 MB, 95-page AWS PDF has a valid signature and searchable text, yet production returned `pdf_source_unreadable`; whole-document extraction is too brittle. **Confirmed live reproduction**
50. OCR-required PDFs are not converted into a usable source. **Confirmed**
51. Polling can time out while extraction continues. **Likely**
52. Upload failure details are not kept next to the source control long enough for diagnosis. **Likely**
53. Static URL extraction cannot render client-side content. **Confirmed**
54. URL extraction rejects non-HTML responses, including direct PDF URLs. **Confirmed**
55. Safe-fetch redirects, content length, or content type can reject a valid-looking URL. **Likely**
56. Article/main selection can miss relevant content in unconventional markup. **Confirmed design limitation**
57. Anti-bot, consent, or sign-in pages can be mistaken for the source page. **Runtime hypothesis**
58. Confidence is mechanically low when title, sections, citations, and claims are sparse. **Confirmed**
59. Extraction warnings and evidence counts are not prominent enough to guide recovery. **Confirmed**
60. The UI offers PDF before deployed storage readiness is proven. **Confirmed contract defect**

#### Testing and observability

61. Existing tests do not prove Amazon/AWS plus skip-to-preview end to end. **Likely**
62. Parser tests do not prove deployed browser-to-Blob-to-session readback. **Confirmed gap**
63. No live PDF smoke test gates release. **Confirmed gap**
64. URL fixtures underrepresent JS shells and anti-bot pages. **Likely**
65. Tests assert copy/visibility more often than artifact creation. **Likely**
66. No contract requires every terminal state to have a recovery action. **Likely**
67. No screenshot regression specifically checks seller typography and numeric treatment. **Likely**
68. Stage duration telemetry is not translated into a user-visible or QA timeline. **Confirmed**
69. Provider configuration health is not checked before the visitor commits to a path. **Likely**
70. Sanitized support references exist, but exact upload/extraction codes are hidden from the primary UI. **Confirmed**

## Live runtime evidence

- Campaign reproduction: session `yXr1v5dLlx6haReqE7ekkGqMJdCC5NmG`, support reference `TMN-A8FE09F1E85B`. The seller profile contained a valid Brandfetch logo, eight real colors, verified identity, verified source evidence, and `designReady=false`. The final status was `brand_help_required`; the readiness gate discarded the generated experience.
- Logo reproduction: the same verified profile's stable `/image/seller-logo` delivery route returned `404` because Brandfetch-hosted URLs were intentionally omitted from proxy sources but the legacy session route did not redirect them.
- PDF reproduction: session `EG-CgSTQeW-v483spOTumYLYPdNcD0Rh`, support reference `TMN-0187A4E998D6`. The 1,624,124-byte `AWS_in_GxP_Systems.pdf` uploaded to Blob in about one second, moved from `pending` to `failed` in about 5.4 seconds, and returned `pdf_source_unreadable` with request ID `32b45155-af12-4e50-8e3a-10dbaa10cb89`.
- Local extraction of the identical PDF reads 95 pages, 79 text-bearing pages, 180,000 bounded characters, 79 citations, eight claims, and 74 visual candidates. The disparity proves an environment-sensitive or page-sensitive extraction failure rather than an invalid document.
- Production `/api/health` reports Vercel Blob, OpenAI, Brandfetch Logo API, Brandfetch Brand API, and PostHog configured. Remote browser harvesting remains unavailable and is a separate fidelity limitation.

## Implemented remediation in this pass

- Core verified identity, logo, palette, and source evidence now authorize a labelled provisional preview even when advanced design DNA is incomplete; missing or cross-domain authority still blocks rendering.
- Both provisional and final campaign gates use the same brand-authority contract, with a regression covering incomplete design DNA through provisional and final readiness.
- Stable session logo URLs now redirect validated domain-bound Brandfetch Logo API assets, and opaque Brand API assets require a server-side Brandfetch provenance receipt.
- Content Magic no longer mounts the legacy understand/believe/do composer, and failed/unreadable sources stop spinning and offer explicit recovery.
- Public `application/pdf` URLs now use the PDF extraction pipeline instead of being rejected as non-HTML.
- Direct PDF upload polling now waits up to 90 seconds with truthful 20-second and 60-second copy; the normal session poll reconciles a callback that finishes after the foreground deadline.
- Whole-document PDF extraction receives a bounded 36-page retry. When local extraction remains unavailable and the configured OpenAI file path succeeds, the uploaded PDF remains usable as a native model-grounded source instead of being rejected before generation.
- The streaming composer now exposes a large stage-state panel for waiting, active work, attention, and completed preview states without fabricated percentages.

## Remediation workstreams

### A. Preserve a provisional campaign artifact

- Split brand authority from design completeness.
- Require domain-safe identity authority for a branded preview: same-seller official source plus accepted identity/logo, or a verified reviewed profile.
- Treat missing typography/geometry/imagery as enrichment warnings, not reasons to delete a generated artifact.
- Preserve the prior valid preview during answer-driven regeneration.
- Make skip start an explicit, idempotent provisional-preview attempt and expose its receipt.

### B. Make work unmistakable

- Promote current stage to a dominant status card in the two-thirds work area.
- Show a named operation, truthful explanation, elapsed time, last update, and latest completed receipt.
- Animate only while a stage is actually running.
- After a stale threshold, replace motion with a stalled/retry state.
- Announce stage changes through an accessible live region.

### C. Make Content Magic source-only

- Remove the legacy message-belief composer from Content Magic.
- Begin extraction immediately after URL confirmation or accepted PDF.
- Infer audience, objective, CTA, and composition from the source.
- Represent `pending`, `processing`, `ready`, `needs-review`, `unreadable`, `failed`, and `complete` distinctly.
- Keep source diagnostics and recovery in the same card.

### D. Make ingestion truthful

- Verify the production session store and Blob attachment before enabling PDF.
- If unsupported, render PDF as temporarily unavailable and keep URL available; do not open a file chooser.
- If supported, prove callback, extraction, session persistence, polling, and cleanup with a deployed smoke test.
- Surface stable error code, request/support reference, and recommended recovery.
- Add rendering-capable or provider-backed URL extraction as a bounded fallback after static HTML fails; never claim facts from an unreadable source.

### E. Apply evidence-backed brand tokens independently

- Create token-level readiness for identity/logo, palette, typography, controls, shape, layout, and imagery.
- Apply each token only when its evidence is accepted.
- Use a neutral token only for the missing dimension, not for the entire experience.
- Keep Amazon as seller authority while allowing an official AWS offer page to supply product messaging and imagery.
- Add a visible `brand enrichment continuing` state to provisional output.

### F. Regression and release gates

1. Unit: brand authority versus advanced design readiness.
2. Unit: skip patch and provisional artifact preservation.
3. Component: active, stalled, failed, provisional, and complete progress states.
4. Component: Content Magic never renders the belief/audience/objective prompts.
5. API: PDF preflight for supported and unsupported storage modes.
6. Extraction: healthy HTML, JS shell, direct PDF, sparse page, blocked page, and non-2xx fixtures.
7. Desktop E2E: Amazon/AWS campaign to provisional preview.
8. Desktop E2E: URL-based Content Magic to preview.
9. Deployed smoke: real PDF upload or verified disabled state.
10. Visual QA: seller logo, palette, typography, button style, shape, imagery, progress, and error recovery.

## Implementation order

1. Preserve and reveal provisional campaign artifacts.
2. Repair skip lifecycle and stage projection.
3. Remove stale Content Magic questions and correct terminal status semantics.
4. Resolve or truthfully disable the incompatible PDF runtime path.
5. Improve URL extraction diagnostics and optional rendering fallback.
6. Apply token-level brand evidence to shell and generated experience.
7. Add contract tests, desktop E2E, and deployed smoke coverage.
8. Run lint, typecheck, unit suite, both builds, desktop E2E, and visual inspection.

## Non-goals for this remediation

- Publishing generated experiences to Folloze.
- Personalization variants.
- New mobile/tablet designs.
- Fabricated progress percentages, fake analytics, placeholder imagery, or unsupported brand claims.
- A complete wireframe or copy-system redesign unrelated to the observed failures.
