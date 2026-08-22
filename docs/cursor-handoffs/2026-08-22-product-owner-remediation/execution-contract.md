# Execution Contract

## 1. Product-owner evidence

Trey's Thermo Fisher run exposed six failures:

1. Campaign choices were generic taxonomy labels: “Solution overview,” “Solution use cases,” and “Solution evaluation questions.”
2. Audience choices were generic horizontal roles, not Thermo Fisher's actual buyers.
3. Live engagement opened before the visitor had earned or requested it, and its elapsed-time claim was inaccurate.
4. The post-preview “Evidence and activity” surface added noise and should not exist.
5. The page lacked the logo, seller palette, and website imagery while the builder still said the brand was matched.
6. Copy and section design were generic. This is a separate design problem; do not attempt to solve it in this wave.

Current local health receipt:

```json
{
  "generation": { "mode": "fixture", "connected": false },
  "brandHarvester": {
    "mode": "safe-fast-extractor",
    "remoteBrowserConfigured": false,
    "brandfetchMode": "disabled",
    "brandfetchLogoApiConfigured": false,
    "brandfetchBrandApiConfigured": false
  }
}
```

That receipt explains the missing brand evidence. Code must not convert this state into “matched,” “official,” or “verified.” Cursor must not obtain or write credentials.

## 2. Root causes already located

| Failure | Current seam |
| --- | --- |
| Generic campaign chips | `src/lib/research/offer-recommendations.ts` supplies hard-coded `fallbackTopics`; `offerRecommendationsFor()` projects them into the composer. |
| Generic audience chips | `src/lib/generation/audience-recommendations.ts` supplies `fallbackRoles`; `audienceRecommendationsFor()` exposes hypotheses as choices. |
| Premature engagement | `src/components/try-me-now-app.tsx` opens the panel after five events and on `next-step`; another timer shows a toast at 18 seconds. |
| Inaccurate time | `engagementSeconds` is derived from the latest event timestamp minus `revealedAt`; sparse copy forces at least one second. |
| Unwanted right rail | `PreviewEvidenceActivitySurface` is mounted in `revealEvidenceRail`. |
| False brand confidence | Streaming receipts use the existence of `session.brand` as “matched,” even when the profile is fallback and readiness/provider evidence is absent. |
| Missing images | Renderer supports `brand.imageUrls`, but the reviewed runtime had no configured rich harvester and returned no verified image inventory. |

## 3. Required changes

### A. Campaign input: evidence or free form

1. Show campaign recommendation chips only when each visible option is a specific, evidence-backed offer or campaign idea tied to the seller.
2. Never show taxonomy fallbacks such as overview, use cases, priorities, questions, product overview, or solution overview.
3. If fewer than two credible, distinct options exist, show no chips. Keep one text field that accepts either:
   - a public product/solution/event URL; or
   - a free-form campaign description.
4. A supplied URL remains a valid answer and must trigger source research immediately.
5. Recommendation metadata must distinguish `evidence-backed` from `fallback`; the UI must filter by metadata, not fragile label matching alone.
6. Preserve visitor edits across later research revisions.

### B. Audience input: actual buyers or free form

1. Show audience chips only when grounded in seller-owned public evidence, an evidence-backed offer, or high-confidence industry/product research.
2. A visible option must name a plausible buyer persona or function that actually buys/evaluates the seller's offer. Broad terms such as “business transformation leaders,” “enterprise application owners,” and “operations teams” are not sufficient without seller-specific evidence.
3. Do not expose `hypothesis`, `seller-category-fallback`, or deterministic fallback candidates as selectable recommendations.
4. If fewer than two credible, distinct personas exist, show no chips and retain free-form audience input.
5. Keep provenance/confidence on the server contract and preserve explicit visitor choice.

### C. Engagement must be earned and accurate

1. Never auto-open the analytics panel.
2. Remove automatic opening after five events, on the final section, after save, or after generation.
3. Remove the 18-second automatic toast. A visitor may open engagement explicitly from the toolbar after the preview exists.
4. Do not display “You've spent N seconds here” below 15 verified foreground seconds.
5. Replace event-delta timing with a page-visible foreground timer that:
   - starts when the preview is revealed;
   - increments only while the document is visible;
   - pauses on `visibilitychange` when hidden;
   - resets per revealed session;
   - never backfills time from session creation or event timestamps.
6. Below the threshold, use non-numeric copy: “Explore the preview to see engagement appear here.”
7. Keep analytics capture and manual panel access. This is not an analytics removal.

### D. Remove the post-preview lifecycle rail

1. Remove `PreviewEvidenceActivitySurface` from the reveal experience.
2. Remove its empty right-rail space and make the desktop preview the primary full-width canvas.
3. Keep essential lifecycle truth in the compact toolbar/status and existing error/update notices.
4. Delete dead imports and tests or convert them into unit coverage for any lifecycle helpers still used elsewhere.
5. Do not replace the removed rail with another card, receipt list, progress dashboard, or analytics panel.

### E. Brand and imagery truthfulness

1. Define a single helper for prospect-facing brand state with at least:
   - `researching`;
   - `verified` (identity plus usable logo/palette evidence);
   - `partial` (identity known, visual evidence incomplete);
   - `unavailable` (providers/configuration failed or absent).
2. “Matched,” “official,” “verified,” or “brand colors shaping the page” may appear only for `verified`.
3. Fallback profiles must say the visual system is still being researched or unavailable. Do not imply that a generic palette is the seller's brand.
4. Surface a bounded, non-secret diagnostic in development/QA when Brandfetch and the remote harvester are unconfigured. Never expose tokens or raw provider responses.
5. Preserve the current fail-soft page behavior, but make neutral/type-led fallback explicit and honest.
6. Ensure verified `logoUrl`/portable logo and `imageUrls` survive session projection into `ExperienceSpecV2` and the renderer.
7. When at least two safe, seller-owned images exist, use distinct imagery in the hero and at least one later section; do not repeat one image as filler.
8. Image load failure must show the existing intentional fallback treatment, never a broken icon or blank framed rectangle.
9. Do not add a Thermo Fisher hard-code or any per-company fallback matrix.

### F. Freeze messaging and wireframes

Do not change these in this wave:

- copy writers;
- production message spine;
- framework ranking;
- section names or page sequence;
- wireframe library, randomization, or deterministic ranking;
- the number of wireframes;
- personalization variants.

Trey and Codex are defining three reviewed wireframes and their copy contracts separately. A speculative rewrite now would create more throwaway code.

## 4. Cursor work lanes

Cursor may use bounded parallel agents, but the manager owns integration and commits.

| Lane | Objective | Primary files | Stop condition |
| --- | --- | --- | --- |
| 1 | Gate offer and audience recommendations by evidence | recommendation modules, orchestrator, composer tests | no generic fallback chips; free form remains |
| 2 | Remove automatic engagement and implement honest foreground timing | app, enhancements, analytics tests | panel manual-only; time accurate and thresholded |
| 3 | Remove lifecycle rail and expand preview | app, lifecycle surface/CSS/tests | no Evidence and activity surface or empty column |
| 4 | Make brand readiness and asset projection truthful | brand helpers, receipts, template/session tests | fallback never claims verified; logo/images preserved |
| 5 | Integration and visual QA | E2E, fixtures, handback | all gates pass and screenshots show intended states |

Agents may not broaden scope or recursively delegate.

## 5. Acceptance tests

### Recommendations

- [ ] Weak/no offer evidence produces zero chips and a URL/free-form field.
- [ ] Three specific official product/solution signals produce up to three distinct chips with exactly one recommended.
- [ ] Generic fallback labels never reach the public session/composer.
- [ ] Weak/no audience evidence produces zero chips and free-form input.
- [ ] High-confidence seller/offer evidence produces 2–3 buyer-specific personas.
- [ ] Hypothesis/fallback audiences never appear as recommendations.
- [ ] Visitor edits survive later recommendation refresh.

### Engagement

- [ ] Preview reveal alone does not open a toast or panel.
- [ ] Five section views do not open the panel.
- [ ] Reaching the last section does not open the panel.
- [ ] Manual toolbar action opens the panel.
- [ ] Hidden-tab time does not count.
- [ ] Under 15 seconds displays no numeric dwell claim.
- [ ] At/above 15 seconds displays measured foreground duration.
- [ ] Session change resets the timer.

### Preview surface

- [ ] “Evidence and activity,” “Build receipts,” “Account depth,” and “Your exploration” are absent from the reveal DOM.
- [ ] Desktop preview uses the available width with no empty right column.
- [ ] Save, full-screen, retry/update notices, and manual engagement remain functional.

### Brand and assets

- [ ] Provider-disabled fixture state never says matched/official/verified.
- [ ] Verified brand state shows the real logo and semantic color roles.
- [ ] Partial brand state is explicit and never presents generic colors as harvested.
- [ ] Two verified seller images reach two distinct rendered roles.
- [ ] Asset failure produces an intentional fallback and zero broken-image icons.
- [ ] No secret values, provider payloads, or raw source content enter logs/client contracts.

### Quality gates

Run and report:

```bash
npm run benchmark:preview
npm run qa
npm run test:e2e -- --project=desktop
```

Add one focused desktop test covering the new recommendation/engagement/rail behavior. Capture a desktop screenshot for:

1. evidence-backed recommendations;
2. no-evidence free form;
3. verified brand with imagery;
4. partial/unavailable brand fallback.

Fixtures must be labeled as fixtures. Do not claim they prove live Brandfetch or remote-harvester connectivity.

## 6. Handback

Update `cursor-handback.md` with:

- exact commits;
- files and behavior changed by lane;
- exact test output;
- screenshot paths;
- provider/configuration facts verified without reading secret values;
- anything still unverified;
- confirmation that messaging/wireframes were untouched;
- confirmation of no push/deploy/publish/credential action.

End with exactly:

`READY_FOR_TREY_REVIEW`

