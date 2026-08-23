# Codex Repair Packet: Three-Family Production System

Status: READY_FOR_CURSOR_REPAIR

## Objective

Close the verified gap between the new Launch, Guide, and Align contracts and the
actual customer-facing page. The first Cursor pass made the contracts, routing,
brand gate, research thresholds, and privacy boundaries materially stronger, but
the real session engine still writes through the legacy message-spine path and
the visual evidence suite can pass placeholder-style fixture media. This repair
must make the production path—not only the type system—prove the approved result.

No push, deploy, publication, live credential use, destructive Git action, or
infrastructure mutation is authorized.

## Independent grade before repair

- Code and architecture: **78/100**.
- Customer-facing visual and copy evidence: **42/100**.
- Cursor's autoresearch `100/100` is a manifest-contract score, not an aesthetic
  or live-provider score.

## P1 blockers

### R1. Wire family-specific copy into the production path

Evidence:

- `src/lib/generation/session-production-engine.ts:509-518` calls the legacy
  `compileProductionMessageSpine`.
- `compileFamilyProductionMessageSpine` exists at
  `src/lib/generation/production-message-spine.ts:707` but has no production
  caller outside tests.
- Current screenshots repeat generic phrases such as “evidence-bounded path,”
  “Review the decision path,” and “For Buying team” across every family.

Required behavior:

1. The locked current-revision `WireframeDecisionV2` must be an input to the
   production message spine before section writing.
2. Launch, Guide, and Align must send distinct role order, navigation labels,
   CTA semantics, and evidence requirements to the writers and final renderer.
3. Do not merely preserve V2 metadata while continuing to write V1 copy.
4. Preserve the existing legacy renderer through a typed adapter where useful,
   but the rendered copy must originate from the family-specific spine.
5. Add an integration assertion from session input to rendered HTML proving each
   family has distinct customer-facing section labels and copy order.

### R2. Make the supplied official brand page authoritative in every harvester

Evidence:

- `src/lib/integrations/brand-harvester.ts:3145` sends
  `sourceUrl: https://${domain}` to the configured remote harvester even when the
  caller supplied a more specific official URL.

Required behavior:

- Send the normalized caller-supplied `sourceUrl` to the remote/browser
  harvester as well as the local public-page pass.
- Add a test proving a product/solution/brand-recovery URL reaches the remote
  request unchanged after safe normalization.

## P2 repairs

### R3. Accept verified canonical domains and approved aliases

`src/lib/orchestrator.ts:1918-1927` currently requires exact hostname equality.
Use the existing canonical-domain/alias identity rules so a verified official
regional or alias host can recover the seller brand without allowing cross-brand
or unsafe URLs. Preserve the SSRF and seller-authority boundary.

### R4. Make brand-help copy match implemented actions

The reusable recovery component supports URL, logo, brand-guide, and screenshot
inputs, but the live app exposes only `availableKinds={["source_url"]}` and a
no-op file handler. For this bounded pass either:

1. integrate secure temporary uploads for all advertised file kinds, with size,
   MIME, content, ownership, cleanup, and session-revision tests; or
2. truthfully ask for a more specific official page URL now and keep uploads as
   a separately documented follow-up.

Do not advertise an action the live UI cannot perform. Prefer option 2 unless an
existing secure upload path can be reused without broadening this repair.

### R5. Normalize operational receipt status parsing

`src/lib/telemetry-receipt-projection.ts:201-205` derives a map key as
`worker_${status}`. A valid `complete` receipt does not match the existing
`worker_completed` event key. Parse against an explicit normalized status set
or normalize `complete` and `completed`. Add positive round-trip tests for every
legal operational receipt kind/status and negative privacy tests.

### R6. Replace false-confidence visual/autoresearch evidence

The current visual fixture creates abstract gray SVGs with a zig-zag line and
then calls them product imagery. The no-logo fixture renders a full page and is
counted as a visual pass even though the real product should stop at
`brand_help_required`. The autoresearch evaluator only rereads and mutates the
checked-in manifest.

Required changes:

1. Rename the existing score everywhere to **manifest contract score**.
2. Never present it as a product-design or live-brand score.
3. Add a runtime integration fixture that executes the real production engine,
   family copy path, renderer, and brand gate before Playwright inspects HTML.
4. A missing-logo runtime fixture must show the recovery UI and expose no
   customer-ready experience HTML.
5. Family screenshots must use representative local first-party-style fixtures
   with purposeful hero/supporting roles; no line-chart placeholder asset may be
   accepted as a successful media treatment.
6. Assert the actual rendered image role/source, seller logo containment,
   no clipping, no broken images, no overflow, CTA contrast >= 4.5, and banned
   internal/generic phrase absence.
7. Capture distinct Launch, Guide, and Align first-viewport and full-page
   screenshots from that runtime path.

## Copy and composition acceptance

Rendered output must visibly follow these families:

- **Launch:** outcome -> friction -> mechanism -> specific use cases -> proof ->
  conversion.
- **Guide:** market change -> connected stakes -> evaluation criteria ->
  solution mapping -> applications -> consultative close.
- **Align:** target priority -> account relevance -> shared opportunity ->
  target-specific priorities -> validation plan -> working session.

The rendered customer page must not contain:

- decision path
- account thesis
- supporting proof
- operating outcome
- business fit
- evidence-bounded
- For Buying team
- generic “Explore the decision” or “Review the decision path” CTA copy

Each fixture must name an evidence-supported buyer persona and a concrete offer,
topic, or account priority. If evidence is insufficient, the UI must use
free-form/URL input or a clearly labeled validation question rather than generic
recommendation buttons.

## Required tests

Run and record exact current-tree results:

```bash
npm run benchmark:preview
npm run qa
npm run test:e2e -- --project=desktop
CAPTURE_PRODUCTION_EVIDENCE=1 npm run qa:visual:folloze
git diff --check
git status --short --branch
```

Add focused coverage for:

- session -> family-specific message spine -> writer -> renderer;
- supplied source URL reaching the remote harvester request;
- canonical/alias source recovery and cross-brand rejection;
- every legal operational receipt status;
- no-logo recovery with no rendered experience;
- real rendered family copy and media assertions.

## Handback format

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
OBJECTIVE: <one line>
COMMITS: <logical local commits>
FILES: <changed files>
TESTS: <exact commands and outcomes>
EVIDENCE: <runtime screenshot/manifest paths>
FIXED: <R1-R6 with direct proof>
REMAINING: <honest gaps, especially live-provider proof>
STOP: Local commits only; no push, deploy, publish, credential, or infrastructure mutation.
```

## Stop condition

Stop when R1-R6 are either proven by current-run evidence or reported as a named
blocker. Do not weaken tests, lower contrast/evidence thresholds, add hard-coded
company fixtures to production code, or broaden into personalization, Folloze
publishing, deployment, or infrastructure work.
