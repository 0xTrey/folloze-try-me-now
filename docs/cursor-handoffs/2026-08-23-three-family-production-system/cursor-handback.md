# Cursor Handback

Status: READY_FOR_CODEX_QA

## Objective

Implemented Launch, Guide, and Align as the only V2 backend-selected production
families. The current-revision family decision now precedes copy writing, carries
an evidence-bound six-section plan into `ExperienceSpecV2`, and adapts through
the existing V1 renderer contract. Research, seller-brand compilation,
family-specific copy, privacy-safe receipts, and explicit brand-help recovery
remain inside the existing session/orchestration lifecycle.

## Commits

- `74c93a1` — establish three-family production contracts.
- `f973062` — ground production research in reconciled evidence.
- `99c018f` — enforce family-specific production copy contracts.
- `48d623b` — make seller brand recovery evidence-aware.
- `f0e2f10` — add privacy-safe production receipts.
- `385249d` — route production through Launch, Guide, and Align.
- `ab65973` — prove the production system with autoresearch and browser evidence.
- `f9e712c` — complete this handback and the acceptance matrix.
- `9ba2243` — refresh evidence from the final desktop run.

## Files and contracts

- Family/section compatibility: `src/lib/generation/three-family-contract.ts`
  and the V2-to-V1 renderer adapter.
- Research: deterministic query planning, source authority reconciliation,
  offer ranking, and evidence-gated audience recommendations.
- Brand: semantic tokens, asset-purpose selection, verified readiness,
  needs-input artifacts, same-domain source recovery, and the
  `BrandHelpRecovery` UI.
- Copy: family argument order, section evidence contracts, CTA bounds,
  novelty/swap/claim checks, and bounded factuality repairs.
- Orchestration/spec: current-revision family artifacts, brand-help terminal
  state, `WireframeDecisionV2`, and `compositionRecipe.productionFamily`.
- Observability: privacy-safe worker/family/brand-help projections for traces
  and product analytics.
- No legacy session, renderer, analytics, or claim/publication path was removed.

## Tests

- `npm run benchmark:preview` — 5 files, 32 tests passed.
- `npm run qa` — passed:
  - lint: 0 errors (3 pre-existing warnings in
    `cloudflare-upload-contract.test.ts`);
  - typecheck: passed;
  - unit/integration: 112 files, 1,013 tests passed;
  - Turbopack production build: passed;
  - webpack production build: passed.
- `npm run test:e2e -- --project=desktop` — 32/32 passed.
- Brand-help seller-URL resume browser test — passed.
- `CAPTURE_PRODUCTION_EVIDENCE=1 npm run qa:visual:folloze` — 3/3 passed.

## Evidence

- `evidence/visual-evidence-manifest.json` records family/subtype/reason,
  section navigation, evidence refs, semantic brand tokens, selected image
  roles, computed contrast, broken images, overflow, and page height.
- Committed first-viewport and full-page screenshots:
  - ADP / Launch;
  - Apple / Guide;
  - ServiceTitan / Align;
  - no-logo recovery/fallback.
- All four fixtures report zero broken images, no horizontal overflow, and
  body/button contrast of at least 4.5.
- The complete desktop suite also verifies responsive containment, keyboard
  navigation, safe asset fallback, and existing wrapper/logo contracts.

## Autoresearch

- Target: `custom`.
- Pre-implementation baseline: 43/100.
- Bounded loop: 5 iterations.
- Best retained result: 100/100, no blockers.
- A second legal section-shape candidate also scored 100/100 with no blocker
  but was not retained because it did not improve the current default.
- Misrouting, missing evidence, and broken-asset mutations were rejected by
  hard blockers.
- Report: `evidence/autoresearch/three-family-loop.json`.

## Acceptance matrix summary

74/74 gates are `Met` with current-run evidence. There are no `Partial`,
`Blocked`, or `Pending` rows.

## Concerns and blocked live proof

- No live provider, credentialed, deployment, publication, or infrastructure
  proof was attempted; these actions were outside the authorized local scope.
- Visual evidence uses deterministic local assets, so it proves renderer and
  contract behavior without making a live-brand availability claim.
- The only remaining lint output is three existing unused-variable warnings in
  `src/lib/cloudflare-upload-contract.test.ts`; lint exits successfully.
- No implementation blocker remains for Codex QA.

## Final receipt

```text
STATUS: READY_FOR_CODEX_QA
OBJECTIVE: Launch, Guide, and Align are the only V2 production families.
FILES: Contracts, research, brand, copy, orchestration, telemetry, UI recovery, QA, and handback updated.
TESTS: npm run qa passed; benchmark 32/32; desktop E2E 32/32; visual acceptance 3/3.
EVIDENCE: Four committed desktop fixture pairs plus manifest and autoresearch report.
CONTRACT: ExperienceSpecV2 carries a hidden evidence-bound WireframeDecisionV2 through the existing renderer adapter.
AUTORESEARCH: custom target improved from 43/100 to 100/100 with no blocker across a five-iteration bounded loop.
CONCERNS: Deterministic local proof only; no live providers or external mutations were authorized.
STOP: Local logical commits only. No push, deploy, publish, credential, or infrastructure mutation occurred.
```
