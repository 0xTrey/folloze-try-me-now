# Folloze Try Me Now Decision Log

Last updated: 2026-08-04

Product requirements: [`product-requirements.md`](./product-requirements.md)

Launch plan: [`launch-plan.md`](./launch-plan.md)

## Source hierarchy

1. The user's July 30 and August 4 instructions and accepted defaults are
   authoritative for V1; the later instruction wins when they conflict.
2. The June 1 guided-flow brief supplies the historical product model:
   `/Users/treyharnden/Projects/folloze-content-engine/docs/plans/2026-06-01-try-me-now-guided-flowcharts.md`.
3. Supporting June 1 artifacts:
   - <https://docs.google.com/document/d/1XwlvYHj3dRugix8Imp67oewZFjfNPBB1FSpz_B_a86E>
   - <https://notes.granola.ai/t/52e70ab9-e920-482f-beb3-69f8821bff0d>

When a July 30 or August 4 decision conflicts with the June 1 artifact, the
newer recorded decision wins.

## Accepted V1 decisions

| ID | Decision | Rationale and implementation consequence | Status |
| --- | --- | --- | --- |
| D-001 | V1 has three paths: one-to-one ABM microsite, generalized campaign landing page, and content-to-magic experience. | These are the clearest top-of-funnel product proofs. The opening screen uses three cards. | Accepted |
| D-002 | Event and webinar are campaign subtypes, not a fourth path. | Keeps the opening decision simple while preserving the event use case from the June brief. | Accepted |
| D-003 | The primary flow asks no more than four creation questions. | The system should infer campaign message, structure, and brand treatment from sources and presets. | Accepted |
| D-004 | Company-domain entry is the starting gun for Brand Harvester. | Brand work begins immediately and runs while later questions are answered. The app must discard stale work when the domain changes. | Accepted |
| D-005 | Eligible background work starts progressively instead of waiting for the form to be complete. | Audience analysis begins on audience selection; content/event parsing begins on source submission; story generation starts as soon as the minimum path inputs exist. | Accepted |
| D-006 | The preview is ungated. | The visitor experiences value before identity capture. No login, password, or email is required to generate or view the temporary result. | Accepted |
| D-007 | A temporary URL is created and displayed as quickly as possible. | It is minted within two seconds of session creation and renders the live build state until the preview is ready. | Accepted |
| D-008 | A business email is requested only to keep and share the experience. | Claiming persists the experience and triggers a transactional email containing the live URL. | Accepted |
| D-009 | Unclaimed previews expire 30 minutes after the first preview becomes ready. | The final five minutes show a countdown. Expired URLs must not expose generated content. | Accepted |
| D-010 | Claimed experiences do not automatically expire in V1. | They persist until administrative removal so “keep this experience” is an honest promise. | Accepted default |
| D-011 | Progress is shown through three labels: Finding your brand, Understanding the audience, and Creating the story. | This is both status and a product narrative. The labels remain visible during progressive questions and generation. | Accepted |
| D-012 | Checklist state must be honest. | Each visible transition comes from a real job event. Timers may rotate explanatory cards but never fake task completion or percentages. | Accepted |
| D-013 | Loading cards explain what Folloze is doing and why it matters. | Loading time becomes a selling experience. Cards are relevant to the active task, dismissible, and reduced-motion safe. | Accepted |
| D-014 | The target experience is a credible preview in 30 seconds or less. | This was the original latency target. Trey later approved a longer bounded window for materially stronger copy and visuals. | Superseded by D-026 on 2026-08-04 |
| D-015 | The ABM V1 personalizes for one target account. | A Default/Target preview demonstrates personalization without the latency and complexity of the June brief's three-account example. | Accepted default |
| D-016 | Publish/share is an outcome, not a setup question. | The app automatically creates a 30-minute cache-only preview. It must not create or publish a Folloze board before a validated business-email claim. | Accepted; clarified 2026-07-30 |
| D-017 | Advanced freeform instructions are hidden behind an optional post-preview control. | First-time visitors get a guided path; they do not face the current six broad Campaign Agent fields. | Accepted |
| D-018 | Engagement analytics is a primary demo story. | The result includes “See who engages—and what they care about,” followed by a demo CTA. Illustrative data must be labeled. | Accepted |
| D-019 | Use OpenAI for generation and Folloze MCP/experience capabilities for the Folloze outcome. | Credentials remain server-side. A fresh Folloze instance will replace the test integration when available. | Accepted |
| D-020 | Do not use n8n. | Application orchestration lives in the app/backend and its job model. | Accepted |
| D-021 | Vercel is the default application host; Cloudflare remains available for a justified edge or browser-runtime need. | Start with the simplest deployable architecture and do not couple product behavior to a second platform unnecessarily. | Accepted default |
| D-022 | The experience is a visual MVP, but all three paths must work. | Visual polish may be scoped, while path coverage, honest progress, claim, expiration, and analytics story are launch requirements. | Accepted |
| D-023 | Transactional delivery and marketing subscription are separate. | Sending the claimed URL does not silently subscribe the visitor to marketing; optional consent is explicit. | Accepted default |
| D-024 | Output facts must be source-grounded. | The system must not invent customer claims, metrics, testimonials, speakers, dates, or target-account facts. | Accepted default |
| D-025 | Every validated business-email claim is written to a durable lead ledger before publication begins. | The ledger is keyed idempotently by session and records qualification, experience URL, publication, and delivery outcomes without storing generated HTML or source content. Transactional delivery still does not create a marketing subscription. | Accepted 2026-07-30 |
| D-026 | The target experience uses a 30–60 second quality window, with the first useful build signal or provisional artifact visible within 10 seconds. | Trey explicitly superseded D-014 so generation can spend more time on copy and visual quality. The first-preview OpenAI pass now defaults to 25 seconds and is hard-capped at 30 seconds; browser brand evidence defaults to 12 seconds and is hard-capped at 20 seconds. Verified public HTML/CSS and Brandfetch evidence run concurrently, and deterministic fallback remains available at the model deadline. | Accepted 2026-08-04; latency budget tightened 2026-08-07; supersedes D-014 |

On 2026-08-04, Trey explicitly superseded D-014. On 2026-08-07, he clarified
that the complete Try Me Now result must fit inside 60 seconds. D-026 is the
canonical latency and progressive-feedback decision.

## Superseded June 1 directions

| Earlier direction | V1 replacement |
| --- | --- |
| Event or Webinar Promotion as a top-level third card | Generalized Campaign is the card; event/webinar is a subtype. |
| Base experience plus three personalized account versions | One target-account version plus a Default preview state. |
| Optimize for launching a first campaign in 15 minutes | Deliver a credible Try Me Now preview in a 30–60 second quality window, with useful build feedback within 10 seconds. |
| Ask whether output should be publishable or shareable | Create a temporary URL automatically; claim controls persistence. |
| Six visible Campaign Agent information categories | Three-to-four progressive questions and a three-step live checklist. |
| Login-before-generation remained an open question | No login before generation; business email appears only at claim. |

## External configuration decisions still needed

These are configuration/sign-off needs, not open product-flow questions. Their
recommended defaults are already reflected in the requirements.

| ID | Needed configuration | Current default | Blocks |
| --- | --- | --- | --- |
| P-001 | Production Folloze instance and least-privilege service credential | Use the test experience MCP until the fresh instance is ready. | Production publish |
| P-002 | OpenAI project key and spend/rate limits | Project-scoped server-side credential. | Live generation |
| P-003 | Transactional sender domain and reply-to | Verified Folloze-controlled sender with monitored reply-to. | External claim email |
| P-004 | Final demo/scheduling CTA URL | Folloze scheduling or demo-request page with campaign attribution. | Public conversion path |
| P-005 | Marketo or other lead-routing destination | Retry-safe asynchronous sync that never blocks claim. | Marketing handoff |
| P-006 | Privacy, retention, and optional marketing-consent language | Operational email plus separate optional marketing consent. | Public launch |
| P-007 | Analytics-story data source | Clearly labeled example analytics until a real embed is approved. | Final analytics presentation |
| P-008 | Named incident, support, and prospect-response owners | Engineering owns runtime incident; GTM owns lead follow-up. | Public launch |

## Deferred decisions

The following are intentionally outside V1 and should be reconsidered only
after beta data:

- multi-account ABM generation and account/segment auto-selection;
- CRM, enrichment-provider, and authenticated company-data sources;
- automatic event lifecycle states before, during, and after an event;
- persistent Folloze user accounts and an editable workspace handoff;
- additional campaign assets such as email, LinkedIn, and paid-media copy;
- conversion targets beyond the initial reliability and latency gates;
- a real embedded analytics dashboard in place of the labeled analytics story.

## Decision-change protocol

Any change to an accepted decision should record:

1. the decision ID being changed;
2. the new behavior;
3. why the evidence justifies the change;
4. its effect on product requirements, tests, privacy, latency, and launch gates;
5. the approving owner and date.

Do not silently change checklist semantics, email gating, TTL, source grounding,
or the 30–60 second quality-window promise in implementation code.
