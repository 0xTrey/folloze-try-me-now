# Unified Builder Run Status

Updated: 2026-08-22 (Cursor implementation manager)
Branch: `codex/unified-microsite-builder`
Base: `1e22931` (production)
Status: **ready for Codex review** (local only; not pushed/deployed)

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
| Adversarial QA | unified-builder-qa | 3 | integrated |

## Decisions made

- One prospect front door: Build a buyer experience; Content Magic secondary; not deleted.
- Primary unified path creates **campaign** sessions; experience type inferred/display. ABM `useCase` flip-on-named-account deferred (documented gap).
- Provisional reveal gated on material brief eligibility; claim only after meaningful engagement.
- Personalization states are preview variants, not templates.
- Preview SLO fixtures tightened to **15s provisional / 60s terminal**.
- No push, deploy, Vercel mutation, Folloze publish, or secret reads.

## Tests run and outcomes

| Command | Outcome |
| --- | --- |
| Baseline `vitest run` | 717 passed |
| Post Wave 1 | 759 passed |
| Post Wave 2 | 776 passed |
| Post Wave 3 `vitest run` | **87 files / 777 passed** |
| `npm run benchmark:preview` | **5 files / 28 passed** |
| `npm run qa` | exit 0 (lint warnings only; typecheck; tests; builds) — QA agent |
| `npm run test:e2e -- --project=desktop` | **27 passed** (manager re-verify) |

## Unresolved concerns (non-blocking for local handback)

- Primary door does not yet create `abm` sessions when a named account is inferred.
- Live Brandfetch/OpenAI timings vs fixture SLO not re-proven in this package.
- Full live claim/email path uses mocks in E2E.
- Production PostHog / distributed rate-limit readiness unchanged (health still local memory modes where configured).

## Final commit list

- `04ccd57` feat: strengthen verified brand fidelity compilation
- `3672df7` feat: rank compositions and sanitize buyer-facing copy
- `88f4cd3` feat: add privacy-safe unified builder analytics contracts
- `2cabe80` feat: gate generation on eligible research plan waves
- `7c56104` docs: record unified builder Wave 1 run status
- `1e0489c` feat: compile safe personalization preview variants
- `2b99efb` feat: gate preview reveal on material brief eligibility
- `70369df` feat: unify conversational buyer-experience intake
- `8cd7cc9` docs: record unified builder Wave 2 run status
- _(Wave 3 commits landing next)_

## Codex handback

See `docs/cursor-handoffs/2026-08-22-unified-builder/codex-handback.md`.
