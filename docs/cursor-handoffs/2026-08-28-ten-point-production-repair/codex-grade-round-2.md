# Codex acceptance grade, round 2

Date: 2026-08-28

Accepted base: `b9374fbc5789d6fa08f027f15dc6dda04f2666d1`

Candidate: working tree on `codex/messaging-compiler-v1`, before release commit

## Verdict

Accept for the release pipeline. Score: 96 of 100. No hard blocker remains in local production-shaped verification. GitHub push, Vercel deployment, and the production canary remain separate release gates.

## Score

| Requirement | Score | Weight | Evidence |
|---|---:|---:|---|
| R1 Preview wheel | 8 | 8 | Real app-shell E2E covers wheel, PageDown, ArrowDown, interior stability, boundary handoff, transient cross-origin load, and same-origin recovery. |
| R2 Start over | 9 | 10 | Deferred session creation, answer patch, upload status, claim, and polling responses cannot restore pre-reset state. Start over remains interactive while the claim dialog is open. |
| R3 Analytics | 9 | 9 | Final-only reveal exposes `See live engagement`, opens current-session titled activity, keeps illustrative activity separate, and hides premature duration. |
| R4 Email claim | 9 | 9 | Reveal explains the locked state, meaningful exploration unlocks `Save by email`, and the existing accessible claim flow is reused. |
| R5 Offer recommendations | 11 | 12 | Bounded official-site discovery starts from seller pages, accepts an explicit official subdomain, blocks off-origin redirects, and produces evidence-backed offers or honest free form. One point remains for live-site variance. |
| R6 Audience | 12 | 12 | Visible suggestions require evidence-backed candidates. Aprio-like fixtures produce finance and accounting buyers, while sparse evidence exposes no generic chip or unsupported AI/platform default. |
| R7 Objective diversity | 8 | 8 | Explore, meeting, and download action families persist through the selected answer, family spine, final HTML, label, and CTA type. |
| R8 Imagery uniqueness | 8 | 9 | Allocation uses upstream duplicate keys, content hashes, and normalized URLs; rendered tabs use distinct media or explicit fallbacks. One point remains for local assets without an upstream hash. |
| R9 Section integrity | 11 | 11 | Launch, guide, and align pass at 1280, 1440, and mobile with overflow, clipped text, focus, contrast, broken media, sparse, no-logo, and keyboard checks. |
| R10 Build progress | 11 | 12 | Preparing, research, planning, writing, checking, and finalizing are tied to production work boundaries and persisted monotonically. The controlled browser fixture proves public polling; genuine orchestrator receipts prove production callback order. |
| **Total** | **96** | **100** | **Ship threshold met locally.** |

## Final local evidence

- `git diff --check`: passed.
- `npm run lint`: passed with zero errors and three pre-existing warnings in `src/lib/cloudflare-upload-contract.test.ts`.
- `npm run typecheck`: passed.
- `npm test`: 146 files and 1,669 tests passed.
- `npm run benchmark:preview`: 5 files and 33 tests passed.
- `npm run build`: passed.
- `npm run build:webpack`: passed.
- `CI=1 npm run test:e2e`: 154 passed, 50 intentional project-gated skips, zero failures.
- `npm run qa:visual:folloze`: 3 passed.
- Focused analytics and privacy tests: 5 files and 33 tests passed.
- Focused lifecycle regression: 27 browser tests passed.
- Focused visual integrity matrix: 7 browser tests passed.
- Focused offer security: 9 unit tests passed.

## Privacy and security disposition

- Raw offer discovery evidence remains private and is omitted from the public session payload.
- The crawler validates every redirect and rejects off-host, protocol-downgrade, and alternate-port pivots.
- Analytics remains bounded, allowlisted, behavior-only, and nonblocking.
- No credential values, signed URLs, raw source bodies, or private trace payloads are included in committed evidence.

## Residual risks

1. Public-site crawl quality depends on the seller's HTML and metadata. Weak evidence correctly falls back to free form instead of inventing a recommendation.
2. Local image paths without an upstream content hash use normalized URL identity. Remote harvested assets carry the stronger content hash.
3. The browser progress fixture controls API receipts for deterministic observability. Production orchestrator tests independently prove each receipt is emitted at the corresponding work boundary.

## Release gates

1. Commit only the intended repair files and evidence. Preserve the three user-owned PNG modifications unstaged.
2. Re-run the required gates from a clean checkout of the candidate commit.
3. Push the candidate to GitHub.
4. Deploy the exact commit to Vercel production.
5. Run the twelve-step Aprio production canary from `acceptance-scorecard.md`.
6. If the canary exposes a regression, fix, regrade, commit, push, deploy, and repeat before reporting completion.
