# Try Me Now V2 launch-gap audit

Date: 2026-09-16

Owner: Trey Harnden

Execution and verification: Codex

## Decision

The production runtime is healthy, but Try Me Now V2 is not ready for public
launch yet. The highest-value product defect was the homepage: it collapsed the
experience into one generic campaign-page CTA even though the underlying engine
still supported account, campaign, event, and content behavior.

That entry-layer defect is fixed on the pushed launch-prep branch. The remaining
launch blocker is proof, not another broad rebuild. The immutable preview is
built, but Vercel deployment protection redirects signed-out visitors to login.
The exact candidate still needs an anonymously reachable test surface, a fresh
four-lane cohort that meets the 95% terminal-success and 60-second p90 gates,
explicit release approval, production promotion, and analytics readback.

## Current production health

Observed at 2026-09-16 15:22 UTC from the canonical production alias.

| Check | Result |
| --- | --- |
| Canonical app | `https://folloze-try-me-now.vercel.app` returned HTTP 200. |
| Health | `ok: true`, `mode: production-capable`, no required blockers. |
| Production source | `origin/production` at `fb72ac5f84a488ea6e1d3b75f544fe9dc1a116f2`. |
| Sessions | Private Vercel Blob, production-safe. |
| Leads and first-party analytics | Neon Postgres. |
| Generation | OpenAI connected. |
| Abuse controls | Distributed Neon rate limiter active. |
| Email | AgentMail connected. |
| Preview lifecycle | 30-minute anonymous TTL, identity requested only for claim. |
| Runtime output | App-hosted HTML only. |
| Folloze writes | Disabled. No Folloze save or publication is implied. |

Health proves the required service configuration is present. It does not prove
the four-lane product experience, final quality, performance, email delivery,
anonymous end-to-end behavior, or release approval.

## Production analytics baseline

Read-only aggregate from the first-party production ledger at 2026-09-16 15:20
UTC. The window covers the prior 30 days and mixes several product versions and
internal QA traffic, so it is a risk signal, not a clean acceptance cohort.

| Measure | Observed | Gate | Result |
| --- | ---: | ---: | --- |
| Final or recorded ready previews | 93 | Fresh cohort required | Historical only |
| Terminal generation failures | 15 | 0 critical defects | Needs investigation by cohort |
| Terminal success | 86.1% | >= 95% | Fails |
| Preview median | 47.8 seconds | Informational | Within window |
| Preview p90 | 106.9 seconds | <= 60 seconds | Fails |
| Preview p95 | 128.6 seconds | Informational | High |
| Claim starts | 2 | Fresh claim cohort required | Insufficient |

Lane detail:

| Lane | Sessions | Ready | Failed | Preview p90 |
| --- | ---: | ---: | ---: | ---: |
| 1:1 account | 30 | 27 | 3 | 53.3 seconds |
| Campaign | 108 | 56 | 9 | 124.8 seconds |
| Event | 1 | 1 | 0 | 1.2 seconds |
| Content Magic | 23 | 9 | 3 | 72.7 seconds |

The event sample is too small to evaluate. Campaign and Content Magic exceed the
launch latency gate. No production product sessions were recorded after
September 11, so current code does not have a fresh post-change cohort.

## Gaps found and action taken

| Priority | Gap | Evidence | Action |
| --- | --- | --- | --- |
| P0 | Homepage hid the four launch lanes behind one generic campaign CTA. | Production component routed the only primary CTA to `campaign`. | Fixed locally with four outcome-led lane cards. |
| P0 | Event promotion was a campaign subtype without a distinct entry promise. | Runtime contract supports `campaignType: event`, but the homepage did not expose it. | Added a typed event lane mapped to `campaign` plus event mode. |
| P0 | Event domain intake reused Content Magic copy. | Event mode selected `useCaseContent.content`. | Added event-specific host and event-detail intake copy. |
| P0 | The launch plan described three paths and treated event as a campaign fixture. | `docs/launch-plan.md` was last updated 2026-08-12. | Replaced it with the four-lane V2 contract. |
| P1 | Entry analytics could not distinguish the four launch promises. | One `unified_entry_started` surface covered the homepage CTA. | Each lane now emits a safe, allowlisted entry surface. |
| P1 | The dependency lock reported one critical, two high, and two moderate advisories. | `npm audit` flagged Next.js, Sharp, js-yaml, and Vitest packages. | Upgraded to patched versions and restored a complete Testing Library peer tree. Final audit reports zero vulnerabilities. |
| P1 | Existing production performance misses the published gate. | Mixed 30-day p90 is 106.9 seconds and terminal success is 86.1%. | Do not approve launch from historical data. Run a fresh exact-commit cohort, then remediate the measured bottleneck. |
| P1 | Release operations do not have all named human owners. | Marketing Ops, Legal, Sales, GTM response, and long-term Engineering names are not recorded. | Trey remains accountable until each operating owner is assigned. |

## Local repair receipts

Work location: isolated checkout
`/Users/treyharnden/.codex/worktrees/folloze-try-me-now-launch-prep`

Branch: `codex/launch-prep-2026-09-16`

Base: production commit `fb72ac5f84a488ea6e1d3b75f544fe9dc1a116f2`

Completed:

- Four explicit entry lanes with no email gate or production action.
- Deterministic lane-to-runtime mapping.
- Event-specific domain intake.
- Lane-specific first-party entry analytics.
- Patched Next.js, Sharp, js-yaml, and Vitest dependencies.
- Updated unit, component, resume, and browser expectations.
- Updated V2 launch contract and receipt boundaries.

Verified:

- Full unit suite: 2,065 passed, 1 skipped, 0 failed.
- Type checking passed.
- Lint passed with three pre-existing unused-variable warnings in
  `cloudflare-upload-contract.test.ts`.
- Turbopack and Webpack production builds passed.
- 13 desktop guided-journey browser tests passed.
- Dedicated four-lane responsive checks passed on desktop and mobile.
- `npm audit --audit-level=high` reports zero vulnerabilities.
- Desktop screenshot shows all four outcome cards with no broken preview assets.
- Candidate code commit `a6df2106b18e8940b75b543154ea058bd4bcad9b`
  is pushed to `origin/codex/launch-prep-2026-09-16`.
- Vercel preview deployment `dpl_AQsPiTA4BWJnUyFg2GzPai7ZaT8S` reached Ready
  without changing the production alias.
- A fresh signed-out browser confirmed deployment protection redirects the
  preview and its health endpoint to Vercel login.

Not yet claimed in this audit:

- Anonymous candidate QA
- Candidate analytics cohort
- Release approval
- Production promotion
- Folloze save or publication
- External announcement

## Next-week launch checklist

### Candidate completion

- [x] Codex runs the full unit suite, both production builds, dependency audit,
  and desktop plus mobile lane QA.
- [x] Codex records the exact commit, pushes the feature branch, and keeps the
  production branch unchanged.
- [ ] Trey Harnden reviews the four entry promises and first generated output
  from each lane.

### Fresh cohort

- [ ] Codex records the candidate deployment ID, commit, and cohort start time.
  The deployment and commit are recorded; cohort time begins only after an
  anonymously reachable test surface exists.
- [ ] Codex runs five complete fixtures per lane, 20 total, using the launch
  matrix in [`launch-plan.md`](./launch-plan.md).
- [ ] Codex reports terminal success, first truthful signal p90, final preview
  p90, fallback reason, and quality defects by lane.
- [ ] Codex fixes the narrow measured blocker if terminal success is below 95%
  or final preview p90 exceeds 60 seconds, then restarts the cohort.
- [ ] Trey Harnden approves the output quality after reviewing at least one
  strong and one degraded example per lane.

### Operating owners and approvals

- [ ] Trey Harnden assigns one named Marketing Ops owner for sender identity
  and lead routing.
- [ ] Trey Harnden assigns one named Legal or privacy approver for consent and
  retention language.
- [ ] Trey Harnden assigns one named Sales or Growth owner for the final CTA.
- [ ] Trey Harnden assigns one named GTM responder and one named Engineering
  incident responder for launch week.
- [ ] Trey Harnden gives explicit approval for the exact production promotion.

### Release receipts

- [ ] Codex verifies the immutable Vercel candidate before any alias change.
- [ ] Codex records the prior immutable deployment as the rollback target.
- [ ] Codex promotes only after Trey approves the exact candidate.
- [ ] Codex completes fresh signed-out desktop and mobile journeys on the
  canonical alias.
- [ ] Codex reads back post-promotion health, errors, and first-party analytics.
- [ ] Codex reports transactional email separately if the claim path is in the
  approved launch scope.

## Exact blockers

1. No fresh exact-commit four-lane cohort meets the 95% success and 60-second
   p90 gates.
2. Historical mixed production traffic fails both gates and cannot substitute
   for a candidate cohort.
3. Event promotion has only one recorded production sample.
4. The pushed preview is Ready, but Vercel deployment protection redirects
   signed-out desktop, mobile, and health checks to Vercel login. Anonymous
   candidate QA cannot start until Trey approves a bounded access strategy or
   the exact candidate is promoted under the separate release gate.
5. Trey has not approved a production promotion for this candidate.
6. Named Marketing Ops, Legal, Sales or Growth, GTM response, and long-term
   Engineering owners are not recorded.

Folloze publication is not a blocker for the V2 app-hosted preview launch. It is
a separate later-production capability that remains disabled and requires its
own authorization, save receipt, publication receipt, and anonymous readback.
