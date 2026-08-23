# Autoresearch and QA Contract

## 1. Target

Domain: `custom`

Asset: one deterministic generated desktop experience plus its current-revision evidence, brand, family-selection, timing, and QA receipts.

The loop optimizes one bounded dimension at a time. It may change selector logic, brand reconciliation/fallback, evidence-bound copy, section composition, or timing. It may not weaken tests, thresholds, evidence authority, privacy rules, or the 60-second contract.

## 2. Score: 100 points

### Buyer specificity and evidence: 0–25

- 0–10: generic buyer/offer copy, missing evidence, competitor-swappable.
- 11–17: company context exists but roles/jobs/mechanism remain shallow.
- 18–22: specific offer, actual personas, evidence-bounded argument and CTA.
- 23–25: unmistakably seller-specific and buyer-useful; every material claim resolves cleanly.

### Brand fidelity and truthfulness: 0–25

- 0–10: wrong/missing logo, generic palette, no source imagery, false match claim.
- 11–17: correct identity and some tokens, but weak geometry/typography/assets.
- 18–22: logo, semantic colors, typography character, buttons, radius, density, and imagery align.
- 23–25: immediately recognizable seller design language with truthful provenance and intentional fallbacks.

### Composition and utility: 0–25

- 0–10: repetitive template, empty sections, decorative media, unclear path.
- 11–17: coherent page but generic structure or weak interaction.
- 18–22: family-specific argument, 4–8 earned sections, useful exploration, strong CTA.
- 23–25: poster-like hero, controlled rhythm, every section earns pixels, images and interaction materially help.

### Reliability, timing, and honesty: 0–25

- 0–10: stale overwrite, >60s, hidden failure, misleading status, broken media.
- 11–17: happy path works but timeouts/fallbacks or receipts are weak.
- 18–22: revision-safe, bounded timing, honest terminal states, clean traces.
- 23–25: deterministic across fixtures, fast, recoverable, private, and fully evidenced.

## 3. Hard blockers

Any blocker forces `reverted` regardless of score:

- wrong seller or target identity;
- invented logo, claim, metric, customer, quote, deadline, or urgency;
- broken, blank, placeholder, duplicate, or irrelevant selected media;
- stale revision overwrites current work;
- prospect-facing family/template selector;
- provider work starts after cutoff;
- sensitive source/model/provider/credential data enters traces;
- customer-ready brand claim without minimum evidence;
- generic recommendation chips reach the UI;
- any required unit, build, benchmark, E2E, privacy, or accessibility gate fails.

## 4. Deterministic fixture suite

1. **Launch product: ADP-like seller**
   - workforce/payroll product;
   - actual HR/payroll/finance/operations buyer jobs;
   - red/neutral brand proportions, verified logo, relevant official imagery;
   - Book a meeting CTA.
2. **Launch event**
   - webinar or field event;
   - evidence-supported audience and agenda;
   - Register CTA only with valid registration intent.
3. **Guide: ServiceTitan-like seller**
   - industry/solution education;
   - evaluation criteria and application scenarios;
   - Book a working session CTA.
4. **Align: Folloze for a named target**
   - seller visual authority;
   - target-specific public observations and roles;
   - Book a working session or Plan a validation session.
5. **Sparse neutral brand: Apple-like source**
   - black/white dominant, blue used narrowly for actions;
   - real logo and image roles;
   - no over-application of accent.
6. **No evidence / provider unavailable**
   - no recommendation chips;
   - explicit brand-help request;
   - research preserved; no fake palette/logo.
7. **Stale revision race**
   - edit seller/offer while research and model work remain pending;
   - older results cannot land.

Every fixture asserts:

- named persona and buyer job;
- concrete offer/source;
- one aligned CTA;
- claim evidence/confidence;
- one locked family and 4–8 sections;
- no placeholders or identity swap;
- no prospect-facing family name;
- valid logo/brand state;
- imagery manifest and zero broken images;
- timing and current-revision receipts.

## 5. Loop rules

1. Capture current baseline before implementation changes.
2. Score the baseline honestly in all four dimensions.
3. Propose one mutation strategy.
4. Run the smallest relevant tests, then all required gates for a candidate winner.
5. Score the variant.
6. Before three experiments, keep only a strict improvement over the current best.
7. After three experiments, keep only when `score > median + 1.4826 × MAD`.
8. Record every kept/reverted run in `autoresearch.jsonl` and `autoresearch.md`.
9. Deprioritize failed mutation strategies.
10. Stop after five consecutive reverts, a hard blocker, or score ≥90 twice consecutively with no blocker.

Do not store raw customer/source content in autoresearch files. Store fixture IDs, aggregate scores, strategies, code/test references, and concise summaries only.

## 6. Mutation strategies

- `family-selector-specificity`
- `section-plan-subtraction`
- `offer-recommendation-evidence-threshold`
- `audience-role-specificity`
- `brand-color-role-reconciliation`
- `brand-geometry-translation`
- `first-party-asset-purpose-ranking`
- `brand-help-recovery`
- `headline-specificity-edit`
- `section-novelty-edit`
- `proof-plan-reconciliation`
- `cta-outcome-alignment`
- `revision-race-hardening`
- `critical-path-parallelization`

## 7. Required commands

```bash
npm run benchmark:preview
npm run qa
npm run test:e2e -- --project=desktop
CAPTURE_PRODUCTION_EVIDENCE=1 npm run qa:visual:folloze -- --project=desktop
git diff --check
git status --short --branch
```

Add focused test commands for the changed lane before the full suite.

## 8. Visual evidence

For every family and failure state capture:

- first viewport at the product desktop target;
- full page;
- selected family/reason/evidence receipt in a separate internal manifest;
- brand token summary;
- selected image URLs/roles/status without sensitive query data;
- console error count;
- broken-image count;
- overflow/contrast/accessibility results;
- generation milestone durations.

Screenshots are evidence of rendering, not live-provider proof. Provider use requires separate request/result receipts.

## 9. Cursor repair loop

After the implementation handback, Codex will produce one repair packet containing:

```text
STATUS: PASS | REPAIR_REQUIRED | BLOCKED
SCORE: <overall and four dimensions>
FAILED_GATES: <acceptance IDs>
REPRODUCTION: <exact fixture and command>
EVIDENCE: <paths, traces, screenshots>
ROOT_CAUSE: <bounded diagnosis>
REPAIR_SCOPE: <specific files/contracts allowed>
DO_NOT_CHANGE: <tests, thresholds, unrelated systems>
STOP: <proof required for completion>
```

Cursor performs one bounded repair pass, commits it, updates the matrix/handback, and stops. Codex reruns the complete gauntlet. A second repair pass requires a new verified root cause, not speculative polishing.
