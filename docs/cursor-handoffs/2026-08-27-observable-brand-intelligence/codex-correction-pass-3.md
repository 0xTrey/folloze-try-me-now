# Correction pass 3: make the public-repository history scan clean

Codex independently verified correction pass 2 at `320d873`. The product, renderer, privacy, and messaging audits pass. One release gate remains: the exact full-history Gitleaks command reports two synthetic hostile-input fixtures from the unpushed commit `c70353b`.

## Execution boundaries

- Work only in `/Users/treyharnden/Projects/folloze-try-me-now-unified-builder` on `codex/unified-microsite-builder`.
- Preserve the three unstaged PNGs under `output/product-owner-remediation/` exactly as found. Do not stage, revert, overwrite, or delete them.
- Do not rewrite Git history, force-push, push, deploy, publish, mutate GitHub or Vercel, inspect secrets, or change product behavior.
- Do not weaken or replace the default Gitleaks rules.
- Commit this correction as one logical commit, update `cursor-handback.md`, and stop.

## Required correction

Add a repository-root `.gitleaks.toml` that:

1. Extends the complete default Gitleaks configuration.
2. Allows only the known synthetic redaction fixtures in commit `c70353b8a00c85431afa347f9d7c6ec5f8e4e8f0`.
3. Uses an `AND` condition over the exact commit, exact test path, and exact detector rule.
4. Covers:
   - `stripe-access-token` and `generic-api-key` in `src/lib/build-trace.test.ts` at that commit.
   - `generic-api-key` in `src/lib/posthog-boundary.test.ts` at that commit.
5. Does not allow any rule in any other path, commit, or current file content.

The narrow structure already validated by Codex is:

```toml
title = "Folloze Try Me Now gitleaks configuration"

[extend]
useDefault = true

[[allowlists]]
description = "Synthetic secret-shaped redaction fixture in one unpushed BuildTrace test commit"
targetRules = ["stripe-access-token", "generic-api-key"]
commits = ["c70353b8a00c85431afa347f9d7c6ec5f8e4e8f0"]
paths = ["^src/lib/build-trace\\.test\\.ts$"]
condition = "AND"

[[allowlists]]
description = "Synthetic generic-key redaction fixture in one unpushed PostHog test commit"
targetRules = ["generic-api-key"]
commits = ["c70353b8a00c85431afa347f9d7c6ec5f8e4e8f0"]
paths = ["^src/lib/posthog-boundary\\.test\\.ts$"]
condition = "AND"
```

## Required verification

Run the exact release command from the repository root:

```bash
gitleaks git . --log-opts='--all' --redact=100 --no-banner
```

Acceptance requires exit code `0` and `no leaks found` across the complete history. Then run:

```bash
npm run lint
npm run typecheck
npm test
git status --short
```

Update `cursor-handback.md` with the exact commit, scan result, test counts, and a statement that the allowlist is limited to the two synthetic fixtures in one unpushed commit. Do not claim the release is pushed or deployed.
