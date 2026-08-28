# V2 base experience scoped autoresearch

This directory is an isolated evaluation session for the final-only Try Me Now V2 base experience. It must not read, append, or mutate the legacy messaging compiler or three-family autoresearch logs.

## Contract

The runner evaluates a deterministic public-safe fixture corpus through the runtime benchmark command. A release candidate must satisfy both consecutive evaluations:

- no hard blockers;
- total score at least 90/100;
- final-only lifecycle, with no customer-visible provisional HTML;
- total runtime at or below 60,000 ms;
- actual runtime receipt and artifact provenance, not fixture-declared output.

The four dimensions are scored from 0 to 25:

1. buyer and offer specificity;
2. evidence and trust;
3. argument and page quality;
4. brand, flow, and reliability.

Known degradation must exit nonzero. The runner is offline and must not require network access, credentials, provider keys, or PostHog.

## Commands

```bash
npm run autoresearch:v2-base-experience
npm run autoresearch:v2-base-experience -- --include-degraded
git diff --check
```

The first command requires two consecutive blocker-free runs at 90 or higher. The second deliberately includes the generic degradation fixture and must exit nonzero. Runtime artifacts are written only to the V2 handoff evidence directory by the benchmark emission path.

## Session boundary

Allowed files are this directory, the V2 fixture corpus, the focused Vitest benchmark, the package script entry, and the V2 evidence artifact. Do not modify production source, existing autoresearch logs, UI, screenshots, credentials, Git history, or deployment from this session.

## Current result

The retained runtime evaluation passed twice at 100/100 with no blockers. It observed the real `compileSessionProductionPage` result, mixed model and deterministic writer provenance, bounded deterministic recovery, stale-revision rejection, and private stage receipts. The deliberate generic degradation was detected twice and returned a nonzero exit code. These are synthetic, offline compiler checks. Browser, persistence, and readback evidence remain separate release gates.
