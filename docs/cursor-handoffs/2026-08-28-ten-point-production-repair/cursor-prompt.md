# Cursor coordinator prompt

Work in `/Users/treyharnden/Projects/folloze-try-me-now-unified-builder` on branch `codex/messaging-compiler-v1`.

Read every file in `docs/cursor-handoffs/2026-08-28-ten-point-production-repair/` before editing. Treat `execution-contract.md` as the product contract, `work-orders.md` as the implementation sequence, and `acceptance-scorecard.md` as the independent release gate.

Implement all ten requirements as one coherent repair release. Extend the current V2 pipeline. Do not create parallel recommendation, rendering, analytics, claim, or build-progress stacks.

Use Cursor subagents in parallel for these bounded read/write workstreams if the runtime supports them:

1. Preview input and reset.
2. Final-reveal analytics and email claim.
3. Offer, audience, and objective recommendation artifacts.
4. Receipt-backed build progression.
5. Asset allocation and section visual integrity.
6. Test fixture and browser regression authoring.
7. Privacy, trace, and public payload review.

One coordinator owns integration and prevents overlapping edits. Complete Work order 0 first. Work orders 1 through 6 may run in parallel only after their file boundaries are confirmed. Finish with Work orders 7 and 8.

Preserve the final-only contract. The customer does not see provisional HTML. Keep one finished artifact, persisted and read back, before reveal.

Do not touch, stage, revert, or rewrite these user-owned files:

- `output/product-owner-remediation/evidence-backed-recommendations.png`
- `output/product-owner-remediation/no-evidence-free-form.png`
- `output/product-owner-remediation/partial-unavailable-brand-fallback.png`

Do not read or print secrets. Do not commit, push, deploy, change repository visibility, or modify prior handoff logs. Do not hardcode Aprio, Jabra, or ADP into production logic.

When finished, write `cursor-implementation-report.md` in this package. Return a concise handback with the report path, R1 through R10 status, exact commands and exit codes, blockers, and anything Codex should challenge.
