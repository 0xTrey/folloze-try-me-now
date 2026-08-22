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
| Unified intake UX | intake-ux-builder | 2 | integrated |
| Personalization preview | personalization-preview-builder | 2 | integrated |
| Preview lifecycle and reveal | preview-lifecycle-builder | 2 | integrated |
| Adversarial QA | unified-builder-qa | 3 | starting |

## Decisions made

- Precedence follows the package README.
- One prospect front door: Build a buyer experience; Content Magic secondary.
- Personalization states are preview variants, not templates.
- Provisional reveal gated on material brief eligibility (not domain-only).
- Save/email modal only after final artifact + meaningful preview engagement.
- Primary unified path creates campaign sessions; experience type is inferred/display; Content Magic remains a separate route. ABM `useCase` switch-on-account-inference deferred unless QA blocks.
- No push, deploy, Vercel mutation, Folloze publish, or secret reads.

## Wave 1 summary

Research plan + deadlines; brand fidelity + ServiceTitan fixture; composition ranking + buyer labels; privacy-safe unified analytics contracts.

## Wave 2 summary

| Area | Outcome |
| --- | --- |
| Intake | Dominant Build CTA; Northpeak examples; transcript + Live Brief; unified entry analytics |
| Personalization | generic/account/industry/persona A/B variants with provenance; client-side switch |
| Lifecycle | Eligibility gate; receipt-backed evidence surface; modal timing; distinct lifecycle phases |

## Baseline / integration tests

- Baseline: 717 passed
- Post Wave 1: 759 passed
- Post Wave 2: **87 files / 776 passed**

## Unresolved concerns

- Desktop E2E still expects old three-path / Aprio entry — Wave 3 must update.
- Unified door does not yet flip `useCase` to `abm` when a named account is inferred.
- Full U05/U20 desktop Playwright evidence waits on Wave 3.

## Final commit list

- `04ccd57` feat: strengthen verified brand fidelity compilation
- `3672df7` feat: rank compositions and sanitize buyer-facing copy
- `88f4cd3` feat: add privacy-safe unified builder analytics contracts
- `2cabe80` feat: gate generation on eligible research plan waves
- `7c56104` docs: record unified builder Wave 1 run status
- _(Wave 2 commits landing next)_
