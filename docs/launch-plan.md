# Folloze Try Me Now V1 Launch Plan

Status: Draft launch contract

Last updated: 2026-07-30

Product requirements: [`product-requirements.md`](./product-requirements.md)

Decision record: [`decision-log.md`](./decision-log.md)

## Launch objective

Release a top-of-funnel, PLG-style Try Me Now experience that reliably produces
one of three tailored Folloze previews in 30 seconds or less, demonstrates value
before requesting identity, converts a business-email claim into a persistent
URL and transactional follow-up, and tells a compelling analytics story.

## Readiness principles

- A local preview, a saved Folloze artifact, a deployed app, a delivered email,
  and a publicly verified URL are separate checkpoints.
- The checklist reports real job state; it never simulates progress.
- The preview is ungated. Email is requested only to keep and share it.
- An unclaimed experience is inaccessible after its 30-minute TTL.
- Generated claims and event facts remain grounded in supplied sources.
- A failed dependency produces an honest fallback or recoverable error.
- No secret, Folloze credential, OpenAI key, or email address is exposed to the
  browser or application logs.

## Rollout phases

### Phase 0: Local implementation and fixture validation

Exit criteria:

- All three paths work against deterministic fixture data.
- Progressive task dispatch is observable: Brand Harvester starts as soon as a
  valid domain is accepted.
- The temporary URL supports in-progress, ready, claimed, failed, and expired
  states.
- Claim and email delivery work against a non-production recipient/sandbox.
- Automated unit, integration, accessibility, and browser tests pass.

### Phase 1: Internal dogfood

Audience: Folloze Product, Marketing, Sales, CS, and the GTM Tiger Team.

Exit criteria:

- At least 15 complete test journeys: five per use case.
- Test inputs cover varied brands, industries, audiences, and content shapes.
- No critical brand, factuality, mobile, privacy, or session-isolation defect.
- p90 preview generation is 30 seconds or faster in the intended hosting
  environment.
- Folloze publish, persistent URL, and transactional email are verified from a
  fresh browser session.
- Product and Growth approve the loading story and result CTAs.

### Phase 2: Controlled external beta

Audience: invited prospects and selected website traffic.

Controls:

- traffic cap and per-IP/domain/session rate limits;
- feature flags for each use case and external integration;
- kill switch for generation and publishing;
- support contact and incident owner;
- daily review of failures, latency, claim rate, and source-grounding defects.

Exit criteria:

- Generation success is at least 95%.
- Claim and transactional-email operation success is at least 99%.
- Every tested unclaimed experience becomes inaccessible on expiration.
- No P0/P1 security, privacy, factuality, or cross-session incident.
- Product funnel baselines are captured by use case.

### Phase 3: Public website launch

Exit criteria:

- All launch configuration in this document is resolved.
- Legal/privacy and marketing-consent language are approved.
- Production sender domain, lead routing, Folloze instance, and CTA destination
  are active.
- Monitoring, alerting, rollback, and support runbooks have named owners.
- Public behavior is verified anonymously on desktop and mobile.

## Launch test matrix

Use at least five fixtures per path.

### One-to-one ABM

- Well-structured seller and target sites
- Sparse target site
- Target domain with redirects
- Seller and target in distinct industries
- Seller domain equal to target domain, which must produce a useful correction

Verify seller branding, target personalization, audience relevance, Default and
Target preview states, and primary CTA.

### Campaign landing page

- Product launch
- Demand-generation campaign
- In-person event with complete source page
- Webinar with incomplete source details
- Event URL that redirects or blocks crawling

Verify correct subtype, grounded event facts, clear offer, audience relevance,
and registration or campaign CTA.

### Content-to-magic

- Public HTML article
- Text-based PDF
- Long report with clear sections
- Scanned or unreadable PDF, which must fail recoverably
- Source containing prompt-like instructions, which must be treated as content

Verify extraction, source grounding, selected interaction pattern, at least
three useful modules, and no unsupported claims.

## Gate checklist

### Product and UX

- [ ] Three use-case cards are clear and visually distinct.
- [ ] No login or email gate appears before the preview.
- [ ] No path asks more than four creation questions.
- [ ] Company-domain acceptance starts Brand Harvester immediately.
- [ ] The temporary URL appears within two seconds at p95.
- [ ] The live checklist uses the approved three labels.
- [ ] Every checklist transition is backed by an actual progress event.
- [ ] Story cards are informative, dismissible, and reduced-motion safe.
- [ ] A credible preview is ready within 30 seconds at p90.
- [ ] Guided review actions work without exposing raw prompt complexity.
- [ ] Analytics story and final demo CTA work on desktop and mobile.

### Generation quality

- [ ] Brand profile or explicit fallback is present.
- [ ] Hero and narrative are audience-specific.
- [ ] Each result has one unambiguous primary CTA.
- [ ] Each result has at least three meaningful modules.
- [ ] Source claims and event facts are grounded.
- [ ] Broken-asset and mobile-overflow checks pass.
- [ ] Regeneration cannot mix stale inputs from a prior domain or session.

### Claim, email, and expiration

- [ ] Claim accepts a valid business email and rejects disposable/free-mail
  addresses, with an internal override documented.
- [ ] Email and claim data remain server-side and are redacted from logs.
- [ ] Claim is idempotent and safe at the expiration boundary.
- [ ] Claimed URL is visible even if email delivery fails.
- [ ] Transactional email contains the correct persistent URL.
- [ ] Unclaimed preview TTL starts when the first preview becomes ready.
- [ ] Countdown appears during the final five minutes.
- [ ] Expired URLs no longer expose generated content.
- [ ] Claimed experiences persist until administrative removal.

### Security and privacy

- [ ] Server fetches block private IPs, localhost, metadata endpoints,
  non-HTTP schemes, and unsafe redirect chains.
- [ ] Uploaded files enforce type and size limits and are isolated from the app
  runtime.
- [ ] Crawled/uploaded instructions are treated as untrusted data.
- [ ] Tokens are opaque and cross-session access tests fail closed.
- [ ] Rate limits cover IP, session, domain, generation, claim, and email abuse.
- [ ] Secrets exist only in approved server-side environment storage.
- [ ] Operational and optional marketing consent are separated.
- [ ] Data retention and deletion behavior appear in privacy copy.

### Accessibility and compatibility

- [ ] Core flow is keyboard-operable.
- [ ] Focus order and live-status announcements are understandable.
- [ ] Color contrast meets WCAG 2.1 AA.
- [ ] Animations respect reduced motion.
- [ ] Layout passes at 360, 768, and 1440 pixel widths.
- [ ] Current Chrome, Safari, Firefox, and Edge smoke tests pass.

### Observability and operations

- [ ] One correlation ID connects session, generation, Folloze, claim, and email
  events without logging PII.
- [ ] Dashboards report latency, success, dependency errors, claims, expiration,
  and demo-CTA activity by use case.
- [ ] Alerts cover sustained generation failure, p90 latency breach, publish
  failure, email failure, and expiration-worker failure.
- [ ] Retry and dead-letter behavior is defined for publish and email jobs.
- [ ] Feature flags can disable each use case and external dependency.
- [ ] Kill switch and rollback are tested.

## Performance and reliability gates

| Measure | Public launch gate |
| --- | --- |
| Temporary URL creation | p95 <= 2 seconds |
| Credible preview | p90 <= 30 seconds |
| Generation success | >= 95% across launch fixtures and beta traffic |
| Claim and email operation success | >= 99% |
| Unclaimed access revocation | 100% of expiration tests |
| Critical security, privacy, factuality, or accessibility defects | 0 open |

## Funnel dashboard

At minimum, report:

- visits and use-case selection;
- valid domain submissions;
- brand-harvest, generation, and preview success;
- median, p90, and p95 generation duration;
- preview interaction depth;
- claim starts and successful claims;
- email send, delivery, and failure;
- analytics-teaser opens;
- demo-CTA clicks;
- expirations;
- qualified leads by use case.

Beta establishes conversion baselines. Product and Growth set conversion
targets only after enough traffic exists to avoid optimizing against noise.

## External launch configuration still needed

These items do not block local implementation, but they block public launch:

| Configuration | Recommended default | Owner/sign-off needed |
| --- | --- | --- |
| Folloze environment | Dedicated Try Me Now instance with least-privilege service credential | Product/Engineering |
| OpenAI credential | Project-scoped key and spend/rate limits in server environment storage | Engineering/Finance |
| Transactional sender | Verified Folloze-controlled sender domain and monitored reply-to | Marketing Ops/IT |
| Final demo CTA | Folloze scheduling or demo-request destination with campaign attribution | Growth/Sales |
| Lead routing | Marketo destination and retry-safe webhook; it must not block the claim | Marketing Ops |
| Privacy and consent | Approved privacy copy plus separate optional marketing consent | Legal/Marketing |
| Claimed retention | Persist until administrative removal for V1 | Product/Legal |
| Analytics story | Clearly labeled example analytics until a real embed is approved | Product |
| Public host | Vercel production project; Cloudflare may support edge/browser services | Engineering |
| Support ownership | Named incident and prospect-response owners | GTM/Engineering |

## Rollback and incident behavior

- Disable new generation before taking down already claimed experiences.
- Preserve successful claims when email or lead routing is degraded.
- Fall back to the temporary app-hosted preview if Folloze publishing is
  unavailable, while clearly labeling that state.
- Stop crawling a domain after repeated dependency or policy failures.
- Revoke an affected session immediately if cross-session exposure, unsafe
  content, or secret leakage is suspected.
- Document incident start time, affected session IDs, dependency status,
  mitigation, and public-verification result without copying PII into the
  incident record.

## Launch evidence package

Before public launch, retain:

- automated test output and production performance report;
- 15-fixture QA matrix with screenshots at target breakpoints;
- anonymous verification of temporary, claimed, and expired URLs;
- transactional email delivery evidence;
- security and privacy checklist sign-off;
- monitoring and alert screenshots;
- named owners for rollback, support, Marketing Ops, and Legal approval.

Passing local tests is not evidence that the Folloze URL was published, the
email was delivered, or the anonymous public experience works. Record those as
separate checkpoints.
