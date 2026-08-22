# Unified Builder Run Status

Updated: 2026-08-22 (Cursor implementation manager)
Branch: `codex/unified-microsite-builder`
Base: `1e22931` (production)

## Workstream status

| Workstream | Agent | Wave | Status |
| --- | --- | --- | --- |
| Research orchestration | research-orchestration-builder | 1 | integrated |
| Brand fidelity | brand-fidelity-builder | 1 | integrated |
| Messaging and composition | message-composition-builder | 1 | integrated |
| Telemetry and receipts | telemetry-receipts-builder | 1 | integrated |
| Unified intake UX | intake-ux-builder | 2 | starting |
| Personalization preview | personalization-preview-builder | 2 | starting |
| Preview lifecycle and reveal | preview-lifecycle-builder | 2 | starting |
| Adversarial QA | unified-builder-qa | 3 | pending |

## Decisions made

- Precedence follows the package README (video feedback → architecture → 60s contract → ExperienceSpec/renderers → visual direction → observability).
- One prospect front door: Build a buyer experience; Content Magic remains secondary and not deleted.
- Personalization states are preview variants, not templates.
- No push, deploy, Vercel mutation, Folloze publish, or secret reads.
- Provisional generation gated on material brief eligibility (not domain-only).
- Brand fidelity compiles seller authority separately from target recognition; no fabricated high-confidence colors.
- Composition ranking is internal-only; buyer jargon sanitized fail-soft.
- Unified product events are privacy-safe contracts; UI emit hooks deferred to Wave 2.

## Wave 1 summary

| Area | Outcome |
| --- | --- |
| Research | `research-plan`, wave deadlines, `canStartExternalWork`, eligibility gate, stale fencing |
| Brand | `compileBrandFidelity`, ServiceTitan Anvil fixture (`#0265DC`, 6px radius), NorthStar imagery fix |
| Messaging | Multi-factor wireframe ranking, route spines, buyer nav labels, golden scenarios |
| Telemetry | Unified event contracts, stronger redaction, support-ref reconstruction tests |

Seams for Wave 2: `captureUnifiedProductEvent` hooks; `experience-renderers.ts` base jargon fallbacks; consume `compileBrandFidelity` / imagery treatment in preview variants.

## Baseline

- Sources read: package README, workstreams, acceptance matrix, architecture, 60s contract, visual direction, observability, tyler feedback, ux-v2 plan, v3 templates, wireframe strategy, V2 chat handoff.
- Baseline: `npx vitest run` → **81 files / 717 passed**.
- Post Wave 1 integrate: `npx vitest run` → **84 files / 759 passed**.

## Files changed (Wave 1)

See commits below. Key new files: `research-plan.ts`, `brand-fidelity.test.ts`, `product-analytics-contracts.ts`, `tests/fixtures/brand-fidelity/**`.

## Tests run and outcomes

- Wave 1 targeted + full suite: **759 passed**
- `npm run benchmark:preview` covered via preview-benchmark / generation-budget suites in Wave 1 agent runs

## Unresolved concerns

- Wave 2 must wire unified analytics emits or funnels stay empty.
- Renderer base fallbacks still may leak "Account thesis" until personalization/lifecycle pass.
- Full U01–U07 / U20–U24 / E2E evidence waits on Waves 2–3.

## Final commit list

_(updated as Wave 1 commits land)_
