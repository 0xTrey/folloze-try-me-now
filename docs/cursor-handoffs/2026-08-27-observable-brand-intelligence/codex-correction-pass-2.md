# Correction pass 2: close the remaining provenance, renderer, and privacy gaps

Codex independently reviewed commits `c70353b` and `f251c56`. The overall implementation is strong, but it is not accepted until the bounded issues below are corrected and verified.

## Execution boundaries

- Work only in `/Users/treyharnden/Projects/folloze-try-me-now-unified-builder` on `codex/unified-microsite-builder`.
- Preserve the three unstaged PNGs under `output/product-owner-remediation/` exactly as found. Do not stage, revert, overwrite, or delete them.
- Do not push, deploy, publish, change GitHub or Vercel, change PostHog, inspect production data, apply migrations, or inspect secrets.
- Keep the renderer fail-soft and keep public API response shapes unchanged.
- Make no company-specific fix.
- Commit this correction as one logical commit, update `cursor-handback.md`, and stop.

## Required corrections

### 1. Make the compiled asset placement exact

Current issue: `createPlanAssetAllocator` in `src/lib/generation/experience-template.ts` consumes a plan by semantic role and may take an unrelated spare. It ignores the compiled `sectionId`, so the DOM can place a valid image in a different section than the private allocation receipt describes.

Required implementation:

- When an `AssetRenderPlan` is supplied, claim the exact compiled `sectionId` plus semantic role. Do not re-rank, substitute, or take a spare.
- A missing exact placement must produce the designed non-image treatment.
- The legacy image-derived fallback may remain only when no compiled plan is supplied.
- Keep production delivery through `renderPlanWithFirstPartyImages`. The compiled `BrandSystemV2` is internal; do not add source URLs or private allocation evidence to any public session response.

Required tests:

- A plan whose placements are intentionally out of renderer call order still produces exact plan-to-DOM section agreement.
- A missing exact placement does not consume another section's image.
- Every substantive image appears at most once.
- Public session serialization still excludes BuildTrace and private allocation fields.

### 2. Remove the last permissive PostHog identify path

Current issue: `sanitizePostHogCapture` in `src/lib/posthog-config.ts` explicitly preserves `$set.email` for `$identify`. Current product code sends an opaque visitor ID, but the sanitizer leaves a future raw-email path open. The behavior-only contract forbids raw email in every PostHog payload.

Required implementation:

- Never preserve a raw email, domain, URL, content string, generated copy, prompt, evidence, support reference, trace ID, or product session ID in any capture or identify payload.
- Continue identifying only after a successful explicit claim, using the opaque first-party visitor ID and the bounded `identity_source` property.
- Keep autocapture, automatic pageviews, native exception capture, and replay disabled. Keep DNT enabled.

Required tests:

- Pass a hostile `$identify` payload through `before_send` and prove raw email and domain cannot survive.
- Prove the actual successful-claim identify call contains only an opaque ID and `identity_source`.
- Prove failed and retried claims still produce no identify call until success.

### 3. Correct section provenance and evidence-boundary behavior

Current issues:

- `generic-production-engine.ts` records `writerMode: "deterministic"` even when the accepted outcome is `model` or `model_partial`.
- `normalizeModelCandidate` silently drops out-of-contract evidence references rather than rejecting the candidate, which hides a provider evidence-boundary violation.
- `omissionReason` accepts arbitrary runtime strings despite being a bounded contract.

Required implementation:

- Record the true writer mode for each selected section.
- Reject a candidate that supplies any evidence reference outside its exact contract. Do not silently repair it into an accepted candidate.
- Runtime-validate `omissionReason` against its declared values. Reject or safely omit malformed provider output.

Required tests:

- Model, `model_partial`, and deterministic fallback receipts report the correct writer mode.
- One forbidden evidence reference rejects the candidate and the forbidden reference never enters the page or receipt.
- Unknown omission reasons cannot enter the page or private trace.

### 4. Run the generalized DOM matrix at both desktop widths

Current issue: `tests/e2e/brand-archetype-fidelity.spec.ts` covers six archetypes across `launch`, `guide`, and `align`, but only at 1440 pixels.

Required implementation and tests:

- Run every archetype and family at both 1280 and 1440 pixel widths.
- Keep computed DOM checks for geometry, typography, semantic colors, image uniqueness, designed fallbacks, and nonblocking warnings.
- Assert there is no horizontal overflow at either width.

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

Also run focused tests for the four corrections before the full suite.

The pass is accepted only if exact plan-to-DOM placement, email-free PostHog identification, truthful writer provenance, evidence-boundary rejection, and the two-width brand matrix are all proven. Preserve the unrelated PNGs and make no external mutation.

