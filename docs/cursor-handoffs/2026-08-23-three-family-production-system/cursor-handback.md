# Cursor Handback

Status: DONE_WITH_CONCERNS

## Objective

Closed Codex repair items R1-R6 on the current branch. The real session engine
now carries its locked Launch, Guide, or Align decision through a family message
spine, bounded writers, the compatibility adapter, and rendered customer HTML.
Official recovery URLs stay authoritative across harvesters, verified aliases
remain SSRF-safe, the live recovery panel advertises only its working URL action,
operational receipt statuses normalize explicitly, and visual proof now runs
through the production engine and brand gate.

## Commits

- `5695d70` — render family-specific production copy while preserving accepted
  provider refinement and explicit workspace overrides.
- `f63a6f9` — preserve official source URLs and verified seller aliases across
  local and remote brand harvesters.
- `139c611` — make the live brand recovery interface truthfully URL-only.
- `89ca9bf` — normalize operational receipt statuses and reject unsafe fields.
- `16a3354` — replace placeholder evidence with runtime engine/browser proof.

No existing commit was rewritten or discarded.

## Files and contracts

- Family runtime: `session-production-engine.ts`,
  `production-message-spine.ts`, writer modules, generic engine, draft adapter,
  and `experience-template.ts`.
- Brand authority: `brand-harvester.ts`, orchestrator seller-source validation,
  and focused canonical/alias/unsafe-URL tests.
- Recovery UI: `brand-help-recovery.tsx`, its live app panel, and component tests.
- Receipts: `telemetry-receipt-projection.ts` and full positive/privacy-negative
  round-trip coverage.
- Runtime proof: `three-family-runtime-fixture.ts`,
  `generic-production-visual-evidence.spec.ts`, manifest evaluator, screenshots,
  manifest, and contract-score report.
- Acceptance: `acceptance-matrix.md` and this handback.

## Tests

- `npm run benchmark:preview` — passed, 5 files / 32 tests.
- `npm run qa` — final run passed:
  - lint: 0 errors; 3 existing warnings in
    `cloudflare-upload-contract.test.ts`;
  - typecheck: passed;
  - Vitest: 113 files / 1,055 tests;
  - Turbopack production build: passed;
  - webpack production build: passed.
- `npm run test:e2e -- --project=desktop` — passed, 32/32.
- `CAPTURE_PRODUCTION_EVIDENCE=1 npm run qa:visual:folloze` — passed, 3/3.
- `npm run autoresearch:three-family` — manifest contract score 100/100,
  no blockers.
- `git diff --check` — passed.

The first full `npm run qa` found four precedence regressions where family copy
overwrote accepted provider refinement and workspace controls. The repair now
applies saved controls last and preserves accepted provider headline/subhead
fields while family section structure and rendered family flow stay
authoritative. The final full gate passed.

## Runtime evidence

- `evidence/visual-evidence-manifest.json`
- `evidence/adp-launch-first-viewport.png`
- `evidence/adp-launch-full-page.png`
- `evidence/apple-guide-first-viewport.png`
- `evidence/apple-guide-full-page.png`
- `evidence/servicetitan-align-first-viewport.png`
- `evidence/servicetitan-align-full-page.png`
- `evidence/brand-help-recovery-first-viewport.png`
- `evidence/brand-help-recovery-full-page.png`
- `evidence/autoresearch/three-family-loop.json`

The screenshots were inspected after the final capture. Launch, Guide, and
Align have distinct navigation and copy order, concrete offers or account
priorities, named buyer personas, contained seller logos, and purposeful local
product/workflow media. The recovery fixture shows only the official-page URL
form and no customer-ready iframe. The manifest reports zero broken or clipped
images, no horizontal overflow, unique journey anchors, valid navigation
targets, CTA/body contrast of at least 4.5, and no packet-banned phrases.

## Fixed

- R1: The locked V2 family decision now compiles the family spine before writer
  slots. Session-to-HTML integration asserts distinct order, labels, copy, CTA
  semantics, and anchors for all three families.
- R2: The normalized caller-supplied source URL reaches both the local public
  page pass and configured remote/browser request.
- R3: Confirmed canonical aliases and regional hosts are accepted. Cross-brand,
  HTTP, credentialed, custom-port, and loopback URLs are rejected.
- R4: The live panel asks only for a more-specific official page URL. No upload
  action or no-op file handler is advertised.
- R5: `complete` and `completed` normalize to `completed`; every legal status
  round-trips and unsafe operational payloads fail closed.
- R6: Visual and manifest evidence run the production session engine, family
  copy path, renderer, and brand gate. Missing-logo evidence stops at recovery.

## Remaining

- No live provider, credentialed harvester, external browser, deployment,
  publication, or infrastructure proof was run; those actions were outside this
  packet.
- Local first-party-style media proves selection, purpose, rendering, and
  containment. It does not claim live seller asset availability or aesthetic
  approval.
- The 100/100 result is only a manifest contract score. It is not a
  product-design or live-brand score.
- Secure logo, guide, and screenshot uploads remain a separately scoped
  follow-up. The current live UI does not advertise them.

## Final receipt

```text
STATUS: DONE_WITH_CONCERNS
OBJECTIVE: Close R1-R6 so the current production path proves family copy, source authority, truthful recovery, normalized receipts, and runtime visual evidence.
COMMITS: 5695d70, f63a6f9, 139c611, 89ca9bf, 16a3354, plus the final handback commit.
FILES: Family generation/renderer, orchestrator/harvester, recovery UI, telemetry projection, runtime E2E fixtures, screenshots/manifests, acceptance matrix, and handback.
TESTS: benchmark 32/32; qa 1,055/1,055 plus two production builds; desktop E2E 32/32; captured visual suite 3/3; manifest contract score 100/100; git diff --check passed.
EVIDENCE: Three runtime family screenshot pairs, one runtime recovery pair, visual-evidence-manifest.json, and autoresearch/three-family-loop.json.
FIXED: R1 family spine reaches writers/HTML; R2 supplied URL reaches remote/local harvesters; R3 verified aliases accepted and unsafe/cross-brand URLs rejected; R4 URL-only live recovery; R5 explicit status normalization/privacy checks; R6 runtime engine/brand-gate/media/copy visual proof.
REMAINING: No live-provider or aesthetic approval claim; secure uploads remain separately scoped.
STOP: Local commits only; no push, deploy, publish, credential, or infrastructure mutation.
```
