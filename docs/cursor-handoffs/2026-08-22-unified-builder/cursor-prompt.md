# Cursor Manager Prompt

You are the implementation manager for the approved Unified Try Me Now Builder.

Read, in full:

1. `docs/cursor-handoffs/2026-08-22-unified-builder/README.md`
2. `docs/cursor-handoffs/2026-08-22-unified-builder/workstreams.md`
3. `docs/cursor-handoffs/2026-08-22-unified-builder/acceptance-matrix.md`
4. every required source listed in the README;
5. `git show origin/codex/try-me-now-v2-handoff:docs/try-me-now-v2-folloze-chat-handoff.md`

Then implement the package on the current branch.

Use the eight project subagents in `.cursor/agents/`. Delegate bounded work in three waves as described in the README. Parallelize only work with non-overlapping ownership. You are responsible for reconciling shared types, `try-me-now-app.tsx`, `orchestrator.ts`, and cross-workstream tests.

Start by running the baseline tests and inspecting the existing flow. Do not ask Trey routine implementation questions. Make the explicit decisions in the package. Stop only if primary evidence conflicts or a decision would change the approved product boundary.

Implementation rules:

- this is not a product rebuild;
- preserve the working session, API, renderer, claim, revision, and security architecture;
- preserve three backend families while exposing one primary conversational front door;
- do not delete Content Magic;
- do not expose template choice;
- do not create fake progress;
- do not weaken the 60-second contract;
- do not deploy, push, change Vercel settings, publish to Folloze, rotate credentials, or read secret values;
- do not touch files outside this worktree;
- do not stage user-local state;
- use small logical commits only after relevant tests pass.

Maintain `docs/cursor-handoffs/2026-08-22-unified-builder/run-status.md` with:

- workstream status;
- decisions made;
- files changed;
- tests run and exact outcomes;
- unresolved concerns;
- final commit list.

Before stopping, run:

```bash
npm run benchmark:preview
npm run qa
npm run test:e2e -- --project=desktop
```

If desktop E2E requires a dev server, start one on an available local port and stop it afterward. Finish with a concise handback for Codex that maps completed work to U01-U30 and explicitly states what remains unverified. Do not push or deploy.
