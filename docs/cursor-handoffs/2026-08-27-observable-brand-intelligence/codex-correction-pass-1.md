# Correction pass 1: make the implementation production-real and privacy-safe

Codex independently reviewed commits `7a43194` through `2f2e376`. The first pass is not accepted yet. Fix every P1 item below, add the named regression coverage, rerun the full acceptance suite, and commit the correction as one logical pass.

## Execution boundaries

- Work only in `/Users/treyharnden/Projects/folloze-try-me-now-unified-builder` on `codex/unified-microsite-builder`.
- Preserve these unstaged visual artifacts exactly as found. Do not stage, revert, overwrite, or delete them:
  - `output/product-owner-remediation/evidence-backed-recommendations.png`
  - `output/product-owner-remediation/no-evidence-free-form.png`
  - `output/product-owner-remediation/partial-unavailable-brand-fallback.png`
- Do not push, deploy, publish, change GitHub settings, change Vercel, change PostHog, query production data, apply migrations, or inspect secrets.
- Keep BuildTrace private and first-party. Keep PostHog behavior-only.
- Preserve existing public API response shapes.
- Rendering must remain fail-soft. A quality warning may trigger a retry or operator review, but it must not block a usable preview.
- Make no company-specific production fix. The implementation and tests must generalize across brand archetypes and `launch`, `guide`, and `align` families.
- Do not add an eyebrow-headline-dek stack.

## P1 corrections

### 1. Enforce recursive BuildTrace schemas

Current issue: `src/lib/build-trace.ts` validates top-level fields but permits unknown nested properties in arrays and decision objects. Short private strings such as section text or decision secrets can pass the heuristic scanner.

Required implementation:

- Define exact recursive schemas for every nested object in `BuildTrace`, including sections, decisions, evidence references, quality records, timings, fallbacks, and receipts.
- Reject unknown nested keys at every depth.
- Enforce collection limits and bounded string formats.
- Preserve deterministic digests and revision semantics.

Required tests:

- Mutation table with unknown nested keys at every object depth.
- Hostile model output with source text, copy, domains, URLs, emails, HTML, tokens, and control characters.
- Outcomes `needs_input`, `failed`, `stale`, `fallback`, and `complete`.
- Section count, unique IDs, canonical order, evidence-reference resolution, status, and digest changes when safe inputs change.
- Public-session serialization test proving no BuildTrace, trace ID, prompt version, evidence reference, output hash, private decision, or allocation manifest reaches a public response.

### 2. Make the compiled asset plan authoritative

Current issues:

- `src/lib/asset-allocation.ts` deduplicates before scoring, so input order can preserve a weaker crop and discard a stronger representative of the same asset.
- `src/lib/generation/experience-template.ts` creates a second heuristic allocation path. The private trace can describe one plan while rendered HTML uses another.
- The allocation manifest is nested into `BrandSystemV2.imagery`, which risks public serialization.

Required implementation:

- Group candidates by normalized duplicate key first, rank within each group, then retain the best representative.
- Compile one deterministic allocation plan and consume it directly in the renderer.
- Keep private allocation evidence, hashes, and internal keys out of the public brand object.
- Preserve public-safe render fields only, with substantive imagery used at most once per experience. Logos may repeat in logo contexts.
- Keep `allocationKey`, semantic role, section ID, purpose, and evidence reference in the private trace.
- Extend URL safety to IPv4, IPv6, localhost, link-local, private, credential-bearing, and non-HTTP sources.
- When imagery is unavailable, render a designed brand treatment without creating a prohibited eyebrow-headline-dek stack.

Required tests:

- Reversed input order retains the same best candidate.
- Trace allocation and DOM render agree exactly.
- Every substantive image source is unique in the final DOM.
- Public serialization excludes private allocation data.
- Unsafe URL matrix, including IPv6 and redirect-style edge cases.
- No-image fallback remains usable and visually intentional.

### 3. Wire section writers into production output

Current issue: the first pass builds section contracts for trace metadata, but `runSectionWriters` does not drive the copy rendered by the production page. The dedicated prompts therefore do not improve the customer-visible experience.

Required implementation:

- Run the dedicated section writers in the production compile path.
- Feed accepted candidates into the editor and renderer for their matching section IDs.
- Preserve a deterministic, evidence-scoped fallback for timeouts, malformed provider output, rejected candidates, and missing provider configuration.
- Scope evidence by exact evidence kind and evidence ID, not only source role.
- Add claim-level coverage for qualitative, product, account, offer, audience, numeric, currency, and comparative statements.
- Validate CTA type at runtime.
- Bound candidate count, headline length, body length, list length, CTA length, HTML, control characters, and unsupported fields.
- Enforce a real wall-clock deadline even if a provider ignores abort signals.

Required tests:

- Production integration test proving accepted model copy appears in rendered HTML and in the matching private section receipt.
- Deterministic fallback test proving rejected or late model output never appears.
- Evidence-kind isolation tests.
- Unsupported qualitative-claim rejection tests.
- Runtime CTA validation and provider-output bound tests.
- Timeout test with a provider that ignores abort.
- Copy constitution checks: buyer and offer specificity, no placeholder language, no `Decision Lens N`, no `Section N`, no duplicated or near-duplicated claims, and no eyebrow-headline-dek stack.

### 4. Persist traces only after a successful session commit

Current issue: `src/lib/orchestrator.ts` can call `saveBuildTrace` while assembling an artifact, before the later session CAS succeeds. A discarded attempt can leave a ghost trace.

Required implementation:

- Move trace persistence into the confirmed successful session-commit path.
- Fence persistence by committed session revision and attempt ID.
- Keep writes idempotent, fail-soft, and inside the 500 ms budget.
- Call `purgeExpiredBuildTraces()` from the existing maintenance cleanup route and surface only bounded counts.
- Make `build-trace:inspect --json` emit a deliberately projected, privacy-safe view, not the raw stored object.

Required tests:

- CAS failure produces no retained trace or ghost event.
- Successful commit retains exactly one matching revision and attempt.
- Duplicate retry is idempotent.
- Maintenance cleanup purges expired traces and preserves live traces.
- JSON inspection output excludes source text, generated copy, emails, domains, URLs, HTML, tokens, credentials, and unknown fields.
- Persistence failure does not fail the customer preview.

### 5. Restore the behavior-only PostHog boundary

Current issues:

- `src/lib/product-analytics-projection.ts` sends human-readable `value_prop_label` and `section_title`.
- `src/lib/product-analytics-client.ts` sends stable visitor, browser-session, and product-session IDs on each event.
- `src/lib/posthog-config.ts` enables native exception capture, which can leak arbitrary application text.

Required implementation:

- Remove raw section titles, generated copy, and value-proposition labels from every PostHog payload. Use bounded semantic IDs or omit the field.
- Remove stable visitor, browser-session, and product-session IDs from PostHog payloads.
- Use only the approved server-generated one-way correlation key when cross-event linkage is required.
- Disable PostHog native exception capture. Route errors through bounded typed error codes and stage enums.
- Keep autocapture, automatic pageview, and session replay disabled. Honor DNT.
- Do not identify a person until an explicit email claim has completed.

Required tests:

- Mock the actual `posthog.capture` call and assert its final payload against an exact allowlist.
- Test every supported event projection with forbidden values in the source object and prove none survive.
- Prove visitor, browser-session, product-session, trace, support-reference, section-title, value-label, domain, URL, email, source text, generated copy, evidence, and HTML fields are absent.
- Prove no `$identify` call occurs before an explicit successful claim.
- Prove analytics failures remain nonblocking.

### 6. Strengthen generalized brand-fidelity verification

Current issue: the evaluator is fail-soft and private, but end-to-end coverage does not exercise every family by brand archetype, and geometry is scored without checking computed DOM styles.

Required implementation:

- Add parameterized archetype by family render and trace tests across `launch`, `guide`, and `align`.
- Measure computed DOM radius, borders, spacing, typography family/weight, button shape, semantic colors, and substantive-image uniqueness.
- Compare the DOM to the compiled semantic brand decisions using tolerances appropriate to each fixture.
- Keep every evaluator result `blocking: false`.
- Preserve the public payload shape and keep company names out of production logic.

Required tests:

- All fixture archetypes across all three families.
- Strong, sparse, contradictory, logo-only, and no-image evidence.
- Geometry, typography, palette, logo, and imagery assertions against computed DOM.
- Weak evidence still renders with explicit warnings and designed fallbacks.

## P2 hardening

Complete these unless a concrete compatibility blocker is documented in the handback:

- Cover all section-receipt outcomes and collection bounds.
- Add multi-brand deterministic hash tests.
- Keep exact section timing rather than copying a whole-session window into every section receipt.
- Ensure the emitted trace ID and support reference resolve to the same committed trace.
- Add a claim-state boundary test around email identification.
- Run mobile Playwright if the correction changes shared render or analytics code.

## Acceptance gate

Run and record:

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:preview
npm run qa
npm run qa:visual:folloze
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=mobile
gitleaks git . --log-opts='--all' --redact=100 --no-banner
```

Also run focused tests for each correction before the full suite.

The pass is accepted only if:

- every P1 correction is implemented and covered by a regression test;
- section-specific generated copy is proven in production-rendered HTML;
- trace persistence happens only after a successful session commit;
- PostHog capture payloads contain only allowlisted behavior and timing data;
- private trace and allocation data are absent from public payloads;
- renderer output follows the compiled brand and asset decisions;
- all quality results remain advisory and previews still render;
- all required commands pass without unexpected skips;
- no unrelated PNG is staged;
- no external mutation occurs.

## Handback

Update `cursor-handback.md` with:

- correction commit SHA;
- files changed;
- each P1 item mapped to code and regression evidence;
- exact test counts and command results;
- privacy declaration;
- changed public-contract declaration;
- remaining risks and skipped checks;
- explicit confirmation that no push, deploy, publish, external-system mutation, production-data access, or secret inspection occurred.

Stop after the correction commit and handback. Do not start another speculative pass.
