# Observable Brand Intelligence Build

Status: approved for Cursor implementation

Planning and acceptance owner: Codex

Implementation manager: Cursor Ultra

Repository: `/Users/treyharnden/Projects/folloze-try-me-now-unified-builder`

Branch: `codex/unified-microsite-builder`

Public baseline: `2529bd82748acb38933a0634f19726800723facb`

## Outcome

Make every generated experience explainable, brand-faithful, visually coherent, and specific to the seller, offer, and audience. A support reference must let an operator reconstruct how the system selected evidence, semantic brand tokens, wireframe, assets, messaging, fallbacks, and final sections without exposing private material to PostHog.

## Locked decisions

- This is a general production-engine repair. Do not add company-specific branches, constants, colors, geometry, copy, or fixtures.
- The seller domain remains the visual authority.
- Brandfetch supplies identity and enrichment. Official DOM, CSS, screenshots, and first-party assets supply design behavior.
- PostHog remains a behavior-analytics system. Private construction traces stay first-party.
- Every generated section receives a dedicated, versioned writing contract after the wireframe and message spine lock.
- Substantive imagery is allocated once per experience. Logos and deliberately decorative motifs may repeat.
- Visual quality produces warnings and a bounded repair. It never creates a hard render gate.
- The public experience payload stays backward-compatible.
- No Folloze publication, Vercel deployment, credential work, infrastructure migration, or production data mutation is part of Cursor's scope.
- Preserve the two unrelated modified files under `output/product-owner-remediation/`.

## Package map

1. [`execution-contract.md`](./execution-contract.md) defines the target architecture and privacy boundary.
2. [`work-orders.md`](./work-orders.md) contains six bounded implementation passes.
3. [`acceptance-matrix.md`](./acceptance-matrix.md) defines Codex acceptance and rejection criteria.
4. [`cursor-prompt.md`](./cursor-prompt.md) is the exact manager prompt.
5. [`cursor-handback.md`](./cursor-handback.md) is the required completion receipt.

## Completion boundary

Cursor implements and tests locally, creates logical commits, and completes the handback. Cursor does not push. Codex independently inspects the diff, runs the full gate, tests real generated artifacts, checks trace privacy, performs browser QA, and returns one bounded correction packet if needed. Codex alone decides whether the branch is accepted and pushed.
