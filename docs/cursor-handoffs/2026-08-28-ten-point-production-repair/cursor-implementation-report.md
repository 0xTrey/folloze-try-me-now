# Cursor implementation report: ten-point production repair

**Date:** 2026-08-28

**Base SHA:** `b9374fbc5789d6fa08f027f15dc6dda04f2666d1`

**Branch:** `codex/messaging-compiler-v1`

**Round:** 2 (Codex round-1 grade: **30/100**, rejected because of R3/R4 blockers)
**Dirty state:** Code changes only; three user-owned PNGs under `output/product-owner-remediation/` remain modified and unstaged (preserved per contract).

## Round 1 → round 2 correction map

| ID | Round-1 failure | Round-2 fix | Primary files | Production-shaped test |
|---|---|---|---|---|
| R1 | Synthetic `setContent` host only | Real Try Me Now reveal shell + iframe scroll | `try-me-now-app.tsx`, `experience-template.ts` | `tests/e2e/final-only-preview-scroll.spec.ts` |
| R2 | Late GET poll only | Deferred POST/PATCH/upload/claim + reset from reveal/dialog | `try-me-now-app.tsx` | `tests/e2e/guided-entry.spec.ts` (R2 suite) |
| R3 | `!isFinalOnlyV2` hid analytics | Expose toolbar `See live engagement` + panel open for final-only V2 | `try-me-now-app.tsx` | `tests/e2e/final-only-shell.spec.ts` |
| R4 | `saveDialogOpen` gated on final-only V2 | Expose locked/unlocked `Save by email` + claim dialog | `try-me-now-app.tsx` | `tests/e2e/final-only-shell.spec.ts` |
| R5 | `extractOfferEvidence` did not fetch HTML | Bounded same-origin graph harvest + orchestrator wiring | `offer-discovery.ts`, `offer-evidence.ts`, `orchestrator.ts` | `offer-discovery.test.ts`, `ten-point-regression-fixtures.test.ts` |
| R6 | `audienceSuggestions[0]` leaked in UI | Evidence-backed recommendations only; free-form when sparse | `try-me-now-app.tsx`, `audience-recommendations.ts` | `ten-point-regression-fixtures.test.ts` |
| R7 | Objective patch ignored CTA | `syncObjectiveCtaFromSelection` + production `selectedCta` | `orchestrator.ts`, `session-production-engine.ts` | `objective-cta-propagation.test.ts` |
| R8 | `duplicateKey` test-only | Harvester `imageMetadata.contentHash` → allocator identity | `brand-system.ts`, `integrations/brand-harvester.ts` | `asset-allocation.test.ts` |
| R9 | `brokenImages` ignored; single family E2E | Pass function enforces broken media; family matrix E2E | `section-visual-integrity.ts` | `section-visual-integrity-matrix.spec.ts` |
| R10 | Checking/finalizing adjacent post-compile | `onCheckingProgress` before factuality; `onFinalizingProgress` before render | `generic-production-engine.ts`, `orchestrator.ts` | `final-only-build-progress.spec.ts` |

## R1 to R10 status (round 2)

| ID | Status | Evidence |
|---|---|---|
| R1 | **Ready for regrade** | `final-only-preview-scroll.spec.ts`: wheel, PageDown, ArrowDown, interior stability, top/bottom boundary handoff in real app shell |
| R2 | **Ready for regrade** | `guided-entry.spec.ts`: deferred POST start, PATCH answers, upload status, claim POST, late GET poll; reset from intake/build/reveal |
| R3 | **Ready for regrade** | `final-only-shell.spec.ts`: final-only V2 shows `See live engagement`, opens titled activity, no early duration |
| R4 | **Ready for regrade** | `final-only-shell.spec.ts`: locked save at reveal, unlock after `section_view`, claim dialog Escape/focus |
| R5 | **Ready for regrade** | `harvestOfferDiscoveryGraph` + `offerDiscoveryGraph` on session; `offerRecommendationsFor` consumes graph; sanitized HTML graph tests |
| R6 | **Ready for regrade** | No `audienceSuggestions[0]` in streaming or legacy audience UI; finance buyers in fixtures; sparse → free-form only |
| R7 | **Ready for regrade** | `patchSessionAnswers` sets `ctaType` from selected objective; `selectedCta` resolves selected not recommended |
| R8 | **Ready for regrade** | `resolveAssetCandidateDuplicateKey` + harvester `contentHash`; transformed-crop duplicate rejection in allocator tests |
| R9 | **Ready for regrade** | `sectionVisualIntegrityPasses` requires `brokenImages === 0`; matrix across launch/guide/align + sparse at 1280/1440/mobile |
| R10 | **Ready for regrade** | `final-only-build-progress.spec.ts`: all six phases via public session polling; monotonic phase receipts |

## Round-two files changed (delta from round 1)

### App shell / reveal (R1 to R4, R6)
- `src/components/try-me-now-app.tsx`: final-only V2 analytics + save exposed; audience leak removed; objective CTA patch; header outside inert main; Domain back resets generation
- `src/components/try-me-now-app.test.ts`, `try-me-now-app.preview.test.tsx`: audience inference uses `audienceRecommendations` only
- `tests/e2e/final-only-preview-scroll.spec.ts` (new)
- `tests/e2e/final-only-shell.spec.ts`: analytics/save final-only V2 tests
- `tests/e2e/guided-entry.spec.ts`: expanded R2 deferred-response suite

### Offer discovery (R5)
- `src/lib/research/offer-discovery.ts`: `harvestOfferDiscoveryGraph`, bounded BFS crawl, nav + offer-path link discovery
- `src/lib/research/offer-discovery.test.ts`: harvest integration test
- `src/lib/orchestrator.ts`: harvest during brand stage; `offerDiscoveryGraph` on session; `discoveryPages` in `offerRecommendationsFor`
- `src/lib/generation/session-production-engine.ts`: `discoveryPages` in `offerEvidence`
- `src/lib/types.ts`: `offerDiscoveryGraph` (server-only, omitted from public session)

### Objective CTA propagation (R7)
- `src/lib/orchestrator.ts`: `syncObjectiveCtaFromSelection`
- `src/lib/objective-cta-propagation.test.ts` (new)

### Imagery / integrity / progress (R8 to R10)
- `src/lib/integrations/brand-harvester.ts`: `imageMetadataFromRemoteRecord` with `contentHash`
- `src/lib/generation/section-visual-integrity.ts`: broken image, clipped text, contrast checks in pass function
- `src/lib/generation/section-visual-integrity.test.ts`: mutation coverage
- `tests/e2e/section-visual-integrity-matrix.spec.ts` (new)
- `src/lib/generation/generic-production-engine.ts`: `onCheckingProgress` before factuality editor
- `src/lib/orchestrator.ts`: `onFinalizingProgress` before `renderExperienceHtml`
- `tests/e2e/final-only-build-progress.spec.ts` (new)
- `src/lib/asset-allocation.test.ts`: Jabra-like duplicate-key harvest fixture

## Test commands and results (round 2, exact)

| Command | Exit | Summary |
|---|---|---|
| `npm run lint` | 0 | 11 warnings, 0 errors |
| `npm run typecheck` | 0 | Clean |
| `npm test` | 0 | **146 files, 1662 tests passed** |
| `npm run benchmark:preview` | 0 | **5 files, 33 tests passed** |
| `npm run build` | 0 | Next.js 16.2.12 production build succeeded |
| `CI=1 npm run test:e2e -- --project=desktop` | 0 | **100 passed** (1 flaky: deferred claim R2, passed on retry #1) |
| `CI=1 npm run qa:visual:folloze` | 0 | **3 passed** |

Focused round-two regression:

```bash
npx vitest run \
  src/lib/research/offer-discovery.test.ts \
  src/lib/objective-cta-propagation.test.ts \
  src/lib/research/ten-point-regression-fixtures.test.ts \
  src/lib/generation/section-visual-integrity.test.ts
# Exit 0, all passed (run 2026-08-28)
```

## Fixture outputs

- Sanitized Aprio-like HTML graph in `offer-discovery.test.ts` and `ten-point-regression-fixtures.test.ts` (no hardcoded production company branches).
- Visual E2E screenshots on failure only under `test-results/`; no new committed PNGs.
- User-owned remediation PNGs under `output/product-owner-remediation/` were **not** touched.

## Remaining risks (for Codex regrade)

1. **Live crawl variance:** Runtime `harvestOfferDiscoveryGraph` depends on seller-site HTML shape; fixture tests prove the wired path, not every live domain.
2. **Deferred claim R2 flake:** First attempt occasionally misses iframe attach before engagement unlock; retry passed (timing).
3. **R7 HTML spot-check:** Unit/orchestrator tests prove `ctaType` storage and production-engine resolution; Codex may still want rendered CTA label parity in final HTML per objective chip.
4. **Port 3000:** E2E requires fresh dev server (`CI=1`).

## Items Codex should challenge on regrade

1. Open final-only V2 reveal in production-shaped fixture and confirm analytics + save are visible (not legacy temp URL / personalization).
2. Feed sanitized homepage/index/detail graph through `harvestOfferDiscoveryGraph` → `offerRecommendationsFor` without pre-injected service labels.
3. Select each objective action family and verify final CTA type in rendered HTML matches the selected candidate (not the recommended default).
4. Poll a deferred-provider build through all six `buildProgress` phases without regression.
5. Run visual integrity matrix across active families with deliberate broken-image / overflow mutations (unit tests fail each mutation).

## Blockers

None for handback. No commit, push, deploy, or secret access performed.
