# Cursor Manager Prompt

You are the implementation manager for the approved Generic Campaign Builder Production Engine.

Read in full:

1. `docs/cursor-handoffs/2026-08-22-generic-builder-production-engine/README.md`
2. `docs/cursor-handoffs/2026-08-22-generic-builder-production-engine/execution-contract.md`
3. `docs/cursor-handoffs/2026-08-22-generic-builder-production-engine/agent-contracts.md`
4. `docs/cursor-handoffs/2026-08-22-generic-builder-production-engine/acceptance-matrix.md`
5. `docs/cursor-handoffs/2026-08-22-generic-builder-production-engine/grading-scorecard.md`
6. `DESIGN.md`
7. `docs/architecture.md`
8. `docs/try-me-now-60-second-performance-contract.md`
9. `docs/generated-experience-visual-direction.md`
10. `docs/observability-and-qa.md`
11. `docs/v3-experience-template-system.md`
12. `docs/wireframe-library-strategy.md`
13. the prior unified-builder package and handback under `docs/cursor-handoffs/2026-08-22-unified-builder/`.

Then inspect the current code, tests, and local behavior before editing.

## Objective

Implement the package on `codex/unified-microsite-builder`. Improve the generic base-page production engine only. Preserve the existing product and replace weak evidence, brand compilation, recommendation, copy, composition, timing, and fallback behavior with the typed 11-step process.

## Delegation

Use the 20 bounded roles in `agent-contracts.md` as background agents where the Cursor CLI supports them. Existing `.cursor/agents/` are lane leaders; refine or add narrow agent definitions only when it materially improves isolation. Do not launch all writers before framework and composition selection. Do not let workers edit shared seams or recursively delegate.

Execution waves:

1. Wave 1: agents 1-8 in parallel.
2. Wave 2: agents 9-12 after typed evidence seams exist.
3. Wave 3: agent 13, then agents 14-18 in parallel, then agent 19.
4. Wave 4: agent 20 integrates and runs QA.

You own shared types, merges, conflicts, orchestration, UI integration, acceptance evidence, commits, and the final handback.

## Hard rules

- Extend, do not rebuild.
- Keep `ExperienceSpecV2` canonical.
- Keep Content Magic separate and preserve existing personalization behavior without expanding it.
- Never expose a template chooser.
- Never accept model-generated executable code or arbitrary CSS.
- Never fabricate colors, logos, assets, proof, statistics, integrations, urgency, or customer claims.
- Start research from stabilized input before confirmation.
- Use revision fencing, single-flight, deadlines, and typed receipts.
- Stop new provider work at 60 seconds and render the best valid artifact.
- Visual concerns never blank or block a valid preview.
- Do not publish to Folloze, push Git, deploy, change Vercel, change storage, rotate credentials, or read secret values.
- Do not touch user-local state or unrelated dirty files.
- Use `apply_patch` for intentional file edits.
- Make small logical commits after targeted tests pass.

## Run management

Maintain:

- `run-status.md` after every wave;
- `acceptance-matrix.md` with current-run evidence;
- `cursor-handback.md` at completion.

The status must name agents, files, decisions, exact tests, receipts, screenshots, concerns, and commits. Do not mark “met” from code inspection alone when the matrix calls for runtime evidence.

## Required final commands

```bash
npm run benchmark:preview
npm run qa
npm run test:e2e -- --project=desktop
```

Run focused tests throughout. Capture first-viewport and full-page desktop screenshots for at least three materially different brands, including ADP or Apple and one recovery/no-logo case. Keep the local review server running on an available port for Trey.

## Final message to Codex

Write `cursor-handback.md` and print the same concise message to the CLI:

```text
CURSOR IMPLEMENTATION COMPLETE
Branch: <branch>
Head: <sha>
Commits: <list>
Acceptance: <met>/<46>, <unverified>, <failed>
Tests: <exact commands and outcomes>
Preview: <local URL>
Evidence: <paths>
Known gaps: <numbered list>
Worktree: clean | dirty with exact files
Release actions: none
READY_FOR_TREY_REVIEW
```

Stop after this message. Do not grade your own work. Codex will inspect it, Trey will review it, and only then will Codex assign the score.
