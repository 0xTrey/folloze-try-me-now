# Observable brand intelligence acceptance

Codex accepts the implementation at `f07f53fcede645dbd7549eb24bf77d2d84ea4acd` for publication to the public GitHub branch `codex/unified-microsite-builder`. This acceptance covers the code and repository release. It does not authorize or claim a Vercel deployment, production migration, or external analytics mutation.

## What is now proven

1. Every production attempt can produce a private BuildTrace with section-level writer, evidence, timing, fallback, and output-hash provenance.
2. Trace persistence happens after the committed session write, stays idempotent, expires after 30 days, and remains outside public session payloads.
3. Brand evidence compiles into semantic color, typography, geometry, imagery, and logo roles without introducing a hard render gate.
4. Compiled image placements bind to the exact section and semantic role. Missing placements use designed non-image treatments instead of borrowing another section's image.
5. Each substantive image is allocated once per experience.
6. Each section has a dedicated writing contract. Model output is evidence-bounded, malformed candidates fail safely, and the receipt records the writer that produced the delivered copy.
7. PostHog receives behavior-only, bounded payloads. Raw email, domains, URLs, source content, prompts, copy, support references, trace IDs, and product session IDs do not cross that boundary.
8. Visitor identity is linked only after a successful explicit claim, using an opaque visitor ID and `identity_source`.
9. Brand-fidelity evaluation is generalized across six archetypes and all three experience families at 1280 and 1440 pixels. Warnings can trigger repair without blocking rendering.
10. The public repository history passes the default Gitleaks rules. The only allowlists require an exact match on one synthetic-test commit, one test path, and one detector rule.

## Independent acceptance evidence

| Gate | Result |
| --- | --- |
| Focused BuildTrace, asset, generation, orchestration, analytics, PostHog, and cleanup tests | 19 files, 332 tests passed |
| Full unit suite | 126 files, 1,404 tests passed |
| Preview benchmark | 5 files, 33 tests passed |
| Lint | 0 errors, 3 pre-existing warnings |
| TypeScript | Passed |
| Next.js Turbopack build | Passed |
| Next.js webpack build | Passed |
| Visual Folloze smoke suite | 3 tests passed |
| Desktop Playwright suite | 70 tests passed |
| Mobile Playwright suite | 52 passed, 18 explicitly desktop-only tests skipped |
| Generalized brand matrix | 36 of 36 passed across six archetypes, three families, and two widths |
| Full-history Gitleaks | 251 commits scanned, no leaks found |
| Production dependency audit | 0 known vulnerabilities |

The clean-room run used a detached worktree at the accepted commit and a dedicated local server on port 3311. The user-owned server on port 3001 was not touched.

## Independent review findings

- Asset-plan audit: pass. Exact section and role lookup, no spare substitution, one-use imagery, designed fallback, public-plan exclusion, and two-width rendering were verified.
- Messaging provenance audit: pass. Writer mode, evidence-boundary rejection, omission-reason validation, malformed-response fallback, and rendered-copy provenance were verified.
- PostHog privacy audit: pass. Hostile identify payloads, claim timing, opaque identity, redaction, DNT, and disabled autocapture, pageview, exception, and replay settings were verified.

## Residual risks that do not block this GitHub release

1. A successful claim can call the opaque PostHog identify helper more than once if the product invokes it repeatedly. This does not expose identity, but a future idempotency guard would reduce duplicate analytics calls.
2. The final BuildTrace is retained for the shared production attempt. A provisional preview is not stored as a separate trace revision.
3. Real database trace persistence still needs a migration and environment-backed smoke test before it can be claimed as production-operational.
4. Provider-backed section generation and live 15-second provisional or 55-second final latency targets still need an environment-backed run. Deterministic and mocked-provider behavior is proven locally.
5. Three unrelated product-owner-remediation PNGs remain modified and unstaged in the source worktree. They are not part of this release.

## Release decision

Accepted for push to the public GitHub branch `codex/unified-microsite-builder`. Do not merge into or push the protected `production` branch as part of this release. Do not deploy Vercel from this acceptance receipt.
