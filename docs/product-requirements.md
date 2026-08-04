# Folloze Try Me Now V1 Product Requirements

Status: Approved for V1 implementation

Owner: Trey Harnden

Last updated: 2026-08-04

## Source material

- June 1 product walkthrough and flowcharts: `/Users/treyharnden/Projects/folloze-content-engine/docs/plans/2026-06-01-try-me-now-guided-flowcharts.md`
- Shared June 1 flowchart document: <https://docs.google.com/document/d/1XwlvYHj3dRugix8Imp67oewZFjfNPBB1FSpz_B_a86E>
- June 1 Granola meeting notes: <https://notes.granola.ai/t/52e70ab9-e920-482f-beb3-69f8821bff0d>
- Current Campaign Agent screenshot supplied with the project brief: `Screenshot 2026-07-30 at 4.32.59 PM.png`

The June 1 brief is the historical product foundation. The decisions recorded in
[`decision-log.md`](./decision-log.md) reflect the user's July 30 and August 4
direction and override conflicts in that earlier artifact.

## Product promise

An anonymous B2B marketer or seller chooses an outcome, provides a company
domain and two or three contextual answers, and receives a credible,
brand-aware Folloze experience within a 30–60 second quality window. The first
useful build signal or provisional artifact appears within 10 seconds.

The preview is ungated. A visitor enters a business email only to keep and share
the result. While the result is being generated, the product explains what it
is doing and why each step matters. The loading experience is part of the
Folloze product story, not a decorative spinner.

## Product and business outcomes

The visitor should leave believing:

- Folloze can understand their brand with minimal input.
- Folloze can tailor a journey to a buyer and objective.
- Folloze can turn a campaign idea or static content into an interactive
  experience quickly.
- Folloze can reveal who engages and what they care about.

The business should receive:

- a qualified business-email lead after value has been demonstrated;
- a clear signal about the visitor's use case, audience, and objective;
- measurable intent through preview interaction, claim, analytics-teaser, and
  demo-CTA events.

## V1 scope

### Included

1. Build a one-to-one ABM microsite.
2. Build a generalized campaign landing page.
   - Product or solution campaign
   - Demand-generation campaign
   - Event or webinar campaign
3. Turn content into a magic interactive experience.
   - Public content URL
   - PDF upload

### Not included

- A full Folloze editor or module-tuning workflow
- The current six-field Campaign Agent collection model
- Multi-account campaign orchestration
- CRM-dependent account enrichment
- Arbitrary freeform generation instructions in the primary flow
- User accounts, passwords, billing, or workspace administration
- Email, social, and ad asset generation
- n8n orchestration

## Experience flow

### 1. Choose an outcome

Show three cards with a short promise and representative thumbnail:

- **Personalize for one account** — Build a one-to-one ABM microsite.
- **Launch a Campaign** — Build a branded campaign or event landing page.
- **Make content interactive** — Turn an existing asset into a guided buyer
  experience.

No login or email is required.

### 2. Enter the company domain

- Normalize and validate the domain after a short debounce.
- Create an anonymous session as soon as the domain is accepted.
- Immediately start Brand Harvester; do not wait for later answers.
- Mint a temporary experience URL within two seconds of session creation.
- Display that URL immediately. Before the preview is ready, it renders the same
  in-progress checklist and story.
- If the domain changes, cancel the active harvest when possible and always
  discard stale results.

### 3. Answer progressive questions

- Ask one question per screen or card.
- Ask no more than four creation questions after the path is selected.
- Keep the live checklist visible while the user continues answering.
- Start each eligible background task as soon as its input becomes available.
- Offer inferred chips and defaults before requesting free text.
- Hide advanced prompting until after the first preview.

### 4. Watch Folloze build the experience

The persistent checklist is:

1. Finding your brand
2. Understanding the audience
3. Creating the story

Each state must be driven by a real backend event. Supporting story cards rotate
while work is active and explain why the current operation improves the buyer
experience.

### 5. Review the preview

- Make the generated experience the center of the result screen.
- Render a credible shell progressively when enough information exists.
- Offer guided actions: accept, regenerate, adjust audience, and adjust
  brand/assets.
- Keep raw generation instructions behind an optional advanced control.

### 6. Keep and share

- Primary claim CTA: **Enter your business email to keep this experience**.
- Claiming makes the result persistent and triggers a transactional email with
  the live URL.
- Do not require a password or user account.
- A successful claim remains successful if email delivery later fails; show the
  final URL on screen and allow email retry.

### 7. Tell the analytics story

- Secondary result CTA: **See who engages—and what they care about**.
- Open a short analytics story covering account identification, content
  engagement, and conversion intent.
- Clearly label illustrative values as **Example analytics**. Never imply that
  sample traffic is real.
- Final CTA: **See Folloze analytics in action**.

## Path-specific requirements

### One-to-one ABM microsite

Inputs:

1. Company or product domain
2. Target account domain
3. Target audience
4. Objective

Objective presets:

- Introduce a solution
- Educate the buying group
- Accelerate an opportunity
- Book a meeting

Required output:

- seller-branded microsite personalized to one target account;
- audience-specific hero, account relevance statement, buyer narrative,
  proof/resources, and primary CTA;
- **Default** and **Target account** preview states;
- plain-language explanation: “Visitors from this account see this version.”

V1 supports one target account. Base-plus-three-account personalization remains
a future expansion.

### Generalized campaign landing page

Inputs:

1. Company or product domain
2. Campaign type
3. Target audience
4. Objective

Campaign types:

- Product or solution
- Demand generation
- Event or webinar

Objective presets:

- Generate demand
- Drive registrations
- Launch or announce
- Book meetings

Event or webinar behavior:

- Show one conditional source field for an event URL or compact event details.
- Extract title, date/time, speakers, location, agenda, and registration action
  when present.
- Ask inline for required missing facts.
- Never invent event details.

Required output:

- branded campaign page with a clear offer, audience relevance, supporting
  proof/resources, and primary CTA;
- registration-focused structure for event and webinar campaigns.

### Content-to-magic experience

Inputs:

1. Company or product domain
2. Public content URL or PDF upload
3. Target audience
4. Objective

Objective presets:

- Educate buyers
- Increase content engagement
- Capture qualified interest
- Book a meeting

Required behavior:

- Extract themes, chapters, claims, and proof points automatically.
- Recommend the interaction pattern instead of asking the user to design it.
- Select from controlled patterns such as topic picker, role selector,
  pain-point cards, assessment, guided content path, or conversion module.
- Ground factual claims in the supplied source.
- Return a recoverable error for unreadable, unsupported, password-protected,
  or oversized content.

## Audience selection

After domain enrichment, recommend up to four relevant audience chips. Use
these fallbacks when enrichment cannot provide better choices:

- Executives
- Marketing and revenue leaders
- IT and technical leaders
- Operations and procurement
- Other

Selecting **Other** opens one concise free-text input. An audience selection
immediately triggers audience analysis and generation refinement.

## Honest checklist contract

Visible states are `pending`, `running`, `complete`, `fallback`, and `failed`.
Do not show invented percentages or advance a step on a timer.

| Checklist item | Start condition | Completion condition |
| --- | --- | --- |
| Finding your brand | A valid company domain is accepted | A brand profile or explicit fallback is available |
| Understanding the audience | Domain enrichment begins; it is refined when the user selects an audience | The inferred context and selected audience are reconciled |
| Creating the story | Sufficient path inputs are available | Experience model, copy, layout, and quality checks are ready |

Default story cards:

- **Finding your brand:** “Strong experiences feel native to the company behind
  them. We’re identifying the visual and messaging signals buyers already
  recognize.”
- **Understanding the audience:** “Relevance comes from aligning the problem,
  proof, and next step to the person viewing the page.”
- **Creating the story:** “Folloze turns campaign inputs into a guided buyer
  journey—not another generic landing page.”

Story cards rotate every five to seven seconds only while their related step is
active. They are dismissible, never block questions, and respect reduced-motion
preferences. Failures replace sales copy with a clear recovery action.

## Session, claim, and expiration contract

Primary states:

`collecting -> generating -> preview_ready_unclaimed -> claim_pending -> claimed`

Exceptional states:

`generation_failed`, `claim_failed`, `expired`

Rules:

- Use an opaque, unguessable session token.
- The temporary URL survives refresh and shows the current build state.
- Start the 30-minute TTL when the first preview becomes ready.
- Show a countdown during the final five minutes.
- After expiration, the temporary URL must not expose generated content.
- Claim is idempotent and pauses expiration while publish and email operations
  complete.
- Unclaimed previews remain cache-only. They must never invoke the Folloze MCP
  save or publish path.
- A validated business-email claim must be written to the durable lead ledger
  before any Folloze publication attempt begins.
- Claimed experiences do not automatically expire in V1. Removal is an
  administrative action.
- Multi-tab use must resolve to the same authoritative session state.
- An expired visitor may restart with non-sensitive answers cached locally.

Business email handling:

- Validate syntax and reject known disposable and free-mail domains.
- Provide a documented internal/demo override.
- Store email only on the server and redact it from application logs.
- Record each claim by unique session ID with company and target domains, use
  case, audience, objective, source type, experience URL, and coarse
  publication/email outcomes. Never copy generated HTML or source content into
  the lead ledger.
- Treat the URL email as transactional. Marketing subscription requires a
  separate, optional consent control.

## Generated-experience quality bar

Every result must include:

- recognizable brand treatment or an explicit visual fallback;
- an audience-specific hero and narrative;
- one clear primary action;
- at least three meaningful content or interaction modules;
- a mobile-safe layout;
- no broken image or asset references;
- analytics hooks on module views, interactions, and CTAs;
- no invented customer claims, metrics, testimonials, speakers, dates, or
  account facts.

The quality gate checks brand fit, copy clarity, CTA completeness, factual
grounding, asset integrity, and mobile rendering.

## Data and instrumentation

Minimum server-side session record:

- opaque session ID and token hash;
- use case and path-specific answers;
- normalized company and target domains;
- audience and objective;
- source-asset reference and processing status;
- brand profile and generation status;
- ordered progress events;
- generated experience reference;
- temporary and claimed URL state;
- created, preview-ready, expiration, claim, and update timestamps;
- business email only after claim, protected and log-redacted;
- durable lead-ledger status keyed by session ID;
- coarse error code and retry count.

Required funnel events:

- `try_me_viewed`
- `use_case_selected`
- `company_domain_submitted`
- `brand_harvest_started`, `brand_harvest_completed`, `brand_harvest_failed`
- `audience_selected`
- `objective_selected`
- `source_submitted`
- `temp_url_created`
- `generation_started`, `generation_completed`, `generation_failed`
- `preview_viewed`
- `regenerate_requested`
- `claim_started`, `claim_completed`, `claim_failed`
- `followup_email_sent`, `followup_email_delivered`, `followup_email_failed`
- `analytics_teaser_opened`
- `demo_cta_clicked`
- `session_expired`

Attach an anonymous session ID, use case, timestamps, duration, result status,
and coarse error code. Never send source content, email, or generated copy in
analytics payloads.

## Success metrics

Launch service-level objectives:

- Temporary URL available within two seconds of session creation at p95.
- First useful build signal or provisional artifact available within 10 seconds
  at p90.
- Credible preview ready within the 30–60 second quality window and no slower
  than 60 seconds at p90.
- At least 95% generation success across the launch fixture set.
- At least 99% claim and transactional-email operation success.
- 100% of unclaimed expiration tests revoke access correctly.
- Zero critical accessibility, secret-exposure, cross-session-access, or
  unsupported-factual-claim defects.

Product metrics to baseline during beta:

- use-case selection rate;
- domain-to-preview completion rate;
- median and p90 time to preview;
- preview interaction depth;
- business-email claim rate;
- analytics-teaser open rate;
- demo-CTA conversion rate;
- qualified-lead rate by use case.

Conversion targets will be set after beta establishes a traffic baseline.

## Required edge-case coverage

- Malformed, unreachable, redirected, parked, and bot-protected domains
- Domain changed while harvest is running
- Seller and target account domains are identical
- Source URL redirects or requires authentication
- Unsupported, corrupt, oversized, password-protected, or scanned-only PDF
- Missing required event facts
- Brand Harvester, OpenAI, Folloze MCP, publish, or email timeout
- Prompt-injection text inside crawled pages and uploaded content
- Duplicate submit, refresh, back navigation, and multi-tab claim
- Claim at the expiration boundary
- Disposable/free email and email-delivery bounce
- Repeated crawling, rate abuse, and unsafe generated content
- Attempts to fetch localhost, private IPs, metadata endpoints, or non-HTTP
  schemes
- Mobile keyboard, screen-reader, keyboard-only, and reduced-motion use

## Product acceptance criteria

The product is ready for launch only when:

- all three paths generate and render their required output;
- domain submission starts Brand Harvester before later questions are answered;
- every visible checklist transition maps to a real progress event;
- the temporary URL correctly renders in-progress, ready, claimed, and expired
  states;
- p90 generation meets the 30–60 second quality-window promise on production
  infrastructure, with a useful signal or provisional artifact within 10
  seconds;
- output passes brand, factuality, CTA, asset, and mobile checks;
- business-email claim, persistence, and transactional email work end to end;
- unclaimed content is inaccessible 30 minutes after the preview becomes ready;
- the analytics story and demo CTA are functional and instrumented;
- required security, privacy, session-isolation, accessibility, rate-limit, and
  error-recovery tests pass.

Detailed rollout gates and operational ownership are in
[`launch-plan.md`](./launch-plan.md).
