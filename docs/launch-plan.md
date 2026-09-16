# Folloze Try Me Now V2 launch plan

Status: launch candidate contract

Last updated: 2026-09-16

Product requirements: [`product-requirements.md`](./product-requirements.md)

Launch-gap audit: [`launch-gap-audit-2026-09-16.md`](./launch-gap-audit-2026-09-16.md)

## Launch objective

Launch a top-of-funnel Try Me Now experience that produces a polished,
interactive microsite or landing page before asking for identity. The entry
experience offers four distinct lanes:

1. 1:1 account microsite
2. Campaign landing page
3. Event promotion page
4. Content Magic

The visitor receives an app-hosted preview first. Saving, persistent access,
email follow-up, personalization, and any later production handoff remain
separate operations. Launch does not authorize automatic Folloze board
creation or publication.

## Product contract

- The homepage presents four outcome-led lanes. Event promotion is not hidden
  inside a generic campaign choice, and Content Magic remains source-led.
- The typed runtime stays canonical. The four entry lanes map to `abm`,
  `campaign`, `campaign` with event mode, and `content`.
- A visitor can explore a preview without entering an email address.
- The page reports real work. It does not simulate percentages, elapsed time,
  completion, delivery, save, or publication.
- Generated claims and event facts remain grounded in supplied or approved
  public evidence.
- A failed dependency produces an honest fallback or a recoverable error.
- The anonymous preview, claimed persistence, transactional email, later
  production handoff, and Folloze publication are separate receipts.
- Vercel is the authoritative application host. Production releases originate
  from the intentional `production` branch.

## Release receipts

Report each checkpoint separately:

| Receipt | What it proves |
| --- | --- |
| Local tests | Source behavior passes in the isolated checkout. |
| Commit | The scoped change is saved in Git. |
| Push | The exact commit exists on GitHub. |
| Deployment | Vercel built an immutable deployment from that commit. |
| Anonymous QA | A fresh signed-out browser completed the intended public journey. |
| Analytics | The first-party ledger recorded the allowlisted funnel and timing events. |
| Release approval | Trey explicitly approved production promotion. |
| Production promotion | The canonical alias points to the approved immutable deployment. |
| Folloze publication | A separate authorized workflow created, published, and anonymously verified a Folloze URL. |

A later receipt never backfills an earlier one. A passing local build does not
prove anonymous QA, email delivery, publication, or release approval.

## Rollout phases

### Phase 0: Local candidate

Exit criteria:

- Four lane options are visible, keyboard-operable, and mapped to the expected
  typed runtime contract.
- Deterministic unit and browser tests cover all four mappings.
- Lint, type checking, unit tests, both production builds, and dependency audit
  pass.
- Desktop and mobile screenshots show no horizontal overflow, broken assets,
  eyebrow-headline-dek stack, or leading-zero labels.

### Phase 1: Fresh internal dogfood

Audience: Folloze Product, Marketing, Sales, CS, and the GTM Tiger Team.

Exit criteria:

- At least 20 complete journeys, five per launch lane, run against the exact
  release candidate after the analytics cohort start time is recorded.
- Inputs cover varied brands, industries, audiences, offers, event shapes,
  HTML content, and PDF content.
- No critical brand, factuality, mobile, privacy, or session-isolation defect.
- At least 95% of eligible terminal generation attempts reach a final preview.
- Preview generation p90 is no slower than 60 seconds. The first truthful build
  signal appears within 10 seconds at p90.
- Product approves the four entry promises, loading story, generated result,
  and final CTA.

### Phase 2: Controlled external beta

Controls:

- traffic cap and distributed rate limits;
- kill switch for generation and claim flows;
- named runtime incident and prospect-response owners;
- daily review of failure, latency, claim, and source-grounding signals;
- rollback to the pinned prior immutable deployment.

Exit criteria:

- Generation success is at least 95% in the fresh beta cohort.
- Claim and transactional-email operation success is at least 99% when those
  flows are enabled for the cohort.
- Every tested unclaimed preview becomes inaccessible on expiration.
- No P0 or P1 security, privacy, factuality, or cross-session incident.
- Funnel baselines are captured by launch lane.

### Phase 3: Public launch

Exit criteria:

- Trey approves the exact commit and immutable deployment for promotion.
- Privacy and optional marketing-consent language are approved.
- Final CTA, lead routing, sender identity, monitoring, rollback, and support
  ownership are active or explicitly out of scope for the launch surface.
- Anonymous desktop and mobile journeys pass on the canonical alias.
- Post-promotion health, error logs, and first-party analytics are read back.

## Four-lane test matrix

Use at least five fixtures per lane.

### 1:1 account microsite

- Well-structured seller and target sites
- Sparse target site
- Target domain with redirects
- Seller and target in distinct industries
- Seller domain equal to target domain, which must produce a useful correction

Verify seller branding, target personalization, audience relevance, account
argument quality, and the primary CTA.

### Campaign landing page

- Product launch
- Demand-generation campaign
- Named product URL
- Offer inferred from seller-owned public evidence
- Thin or blocked offer source that must recover honestly

Verify the offer, audience, message spine, proof sequence, differentiated page
composition, and campaign CTA.

### Event promotion

- In-person field event with a complete source page
- Webinar with incomplete source details
- Event URL that redirects
- Event source that blocks crawling
- Event with missing date or registration destination

Verify event mode, grounded event facts, reason to attend, audience relevance,
and an honest registration path.

### Content Magic

- Public HTML article
- Text-based PDF
- Long report with clear sections
- Scanned or unreadable PDF, which must fail recoverably
- Source containing prompt-like instructions, which must remain untrusted data

Verify source grounding, the selected interaction pattern, at least three
useful modules, and no unsupported claims.

## Launch gates

### Product and UX

- [ ] Four launch lanes are visible and materially distinct.
- [ ] No login or email gate appears before the preview.
- [ ] No lane asks more than four creation questions before generation starts.
- [ ] The first build state uses real workflow events.
- [ ] A final preview is ready within the 60-second p90 target.
- [ ] The generated result feels like a real microsite or landing page, not a
  generic summary card.
- [ ] Desktop and mobile journeys work at 390, 768, 1024, and 1440 pixels.

### Generation and truth

- [ ] Brand profile or explicit neutral fallback is present.
- [ ] Hero and narrative are audience-specific.
- [ ] Each result has one unambiguous primary CTA.
- [ ] Each result has at least three meaningful modules.
- [ ] Claims and event facts are grounded.
- [ ] Regeneration cannot mix stale inputs, attempts, or sessions.
- [ ] Structural and truth validators pass before reveal.

### Claim, email, and expiration

- [ ] Business-email validation and the internal test override are documented.
- [ ] Claim is idempotent and safe at the expiration boundary.
- [ ] Claimed URL remains available if email delivery fails.
- [ ] Transactional email contains the correct persistent URL.
- [ ] Unclaimed preview TTL starts when the final preview becomes ready.
- [ ] Expired URLs no longer expose generated content.

### Security, privacy, and operations

- [ ] Server fetches reject private networks, unsafe schemes, and redirect
  chains.
- [ ] Uploaded files enforce type and size limits.
- [ ] Tokens are opaque and cross-session access fails closed.
- [ ] Distributed rate limits, Turnstile, secrets, and encryption remain active.
- [ ] Operational and optional marketing consent are separate.
- [ ] Dashboards report success, latency, dependency failures, claims,
  expiration, and CTA activity by lane.
- [ ] Rollback and kill-switch behavior are rehearsed.

## Performance and reliability gates

| Measure | Launch gate |
| --- | --- |
| First truthful build signal | p90 <= 10 seconds |
| Final preview | p90 <= 60 seconds |
| Generation success | >= 95% across the fresh candidate cohort |
| Claim and email operation success | >= 99% when enabled |
| Unclaimed access revocation | 100% of expiration tests |
| P0/P1 security, privacy, factuality, or accessibility defects | 0 open |

Historical mixed traffic does not satisfy these gates. Start a new cohort on
the exact candidate commit and retain the cohort start time with the evidence.

## Next-week owners

| Work | Accountable owner | Execution owner |
| --- | --- | --- |
| Product direction and release approval | Trey Harnden | Trey Harnden |
| Candidate implementation and deterministic verification | Trey Harnden | Codex |
| Fresh four-lane dogfood cohort | Trey Harnden | Codex prepares fixtures and evidence; Trey assigns participants |
| Performance remediation if p90 exceeds 60 seconds | Trey Harnden | Codex |
| Vercel deployment, anonymous QA, and rollback receipt | Trey Harnden | Codex after release approval |
| Privacy, consent, sender, CTA, and lead-routing sign-off | Trey Harnden | Trey assigns the named Marketing Ops, Legal, and Sales owners |
| Prospect response and runtime incident coverage | Trey Harnden | Trey assigns the named GTM and Engineering responders |

The unassigned Marketing Ops, Legal, Sales, GTM, and long-term Engineering
names are explicit launch blockers. Trey remains accountable until each name is
recorded.

## Release boundary

Do not merge to `production`, promote the canonical alias, create or publish a
Folloze board, send external announcements, or claim launch approval without a
separate explicit authorization and its own receipt.
