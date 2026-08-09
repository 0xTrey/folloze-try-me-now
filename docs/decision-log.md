# Folloze Try Me Now Decision Log

Last updated: 2026-08-09

Product requirements: [`product-requirements.md`](./product-requirements.md)

Launch plan: [`launch-plan.md`](./launch-plan.md)

Active interface contract: [`../DESIGN.md`](../DESIGN.md)

Wireframe system: [`wireframe-library-strategy.md`](./wireframe-library-strategy.md)

Performance contract: [`try-me-now-60-second-performance-contract.md`](./try-me-now-60-second-performance-contract.md)

Analytics and tracing: [`product-analytics-and-tracing.md`](./product-analytics-and-tracing.md)

## Status vocabulary

- **Accepted** means the product behavior is implemented or is the approved
  behavior for the next implementation pass.
- **Accepted default** means the behavior is approved unless launch evidence or
  the named owner changes it.
- **Implemented** means the behavior has code and test coverage in this repo.
- **Config-gated** means the product contract exists, but a production credential,
  endpoint, sender, or privacy sign-off still controls external activation.
- **Deferred** means the idea is intentionally outside the current release.
- **Superseded** means a later decision ID is canonical. Superseded text remains
  here so the historical rationale is not lost.

## Source hierarchy

1. The user's July 30 through August 8 instructions and accepted defaults are
   authoritative for V1; the later recorded instruction wins when they conflict.
2. The June 1 guided-flow brief supplies the historical product model:
   `/Users/treyharnden/Projects/folloze-content-engine/docs/plans/2026-06-01-try-me-now-guided-flowcharts.md`.
3. Supporting June 1 artifacts:
   - <https://docs.google.com/document/d/1XwlvYHj3dRugix8Imp67oewZFjfNPBB1FSpz_B_a86E>
   - <https://notes.granola.ai/t/52e70ab9-e920-482f-beb3-69f8821bff0d>

When a July 30 through August 8 decision conflicts with the June 1 artifact,
the newer recorded decision wins.

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
| D-011 | Prospect progress and Folloze work are separate. The prospect sees three choices—account or offer, audience, and goal—while brand, research, message, and page work appear in one compact autonomous-work receipt. | One progress system answers “what do I need to do?” and one honest receipt answers “what is Folloze doing?” without contradictory counts. | Accepted; clarified 2026-08-08 |
| D-012 | Checklist state must be honest. | Each visible transition comes from a real job event. Timers may rotate explanatory cards but never fake task completion or percentages. | Accepted |
| D-013 | One purposeful processing module explains what Folloze is doing and why it matters. | Loading time becomes a selling experience without turning the page into an operations dashboard. The active visual changes by stage, is reduced-motion safe, and never fakes completion. | Accepted; clarified 2026-08-08 |
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
| D-027 | Brand fidelity fails closed and separates identity from presentation. Brandfetch and public-site evidence establish identity, logo, and canonical domain; verified HTML/CSS and browser evidence build `BrandDesignDNA` for layout, typography, surfaces, density, and imagery. | A returned official Brandfetch asset is accepted; a broken image or generic palette is never presented as harvested brand truth. `BrandDesignDNA` may change presentation but never invent narrative, proof, audience, or CTA claims. | Implemented 2026-08-06 |
| D-028 | Folloze selects the wireframe; prospects do not browse a template marketplace before value. Seventeen reviewed archetypes—five account, six campaign, and six content—map to six shared composition grammars and one canonical `ExperienceSpec`. | The system can produce varied, explainable experiences without 17 renderer forks. The locked selection receipt preserves why a structure was chosen, while shared analytics, accessibility, save, expiration, and brand primitives remain consistent. | Implemented 2026-08-07 |
| D-029 | Account and campaign experiences use the seven-section persuasion framework; content experiences remain source-preserving companions. | Account and campaign pages may reframe a verified seller/target/offer story. Content pages must preserve the original asset, distinguish source fact from interpretation, and never turn thin extraction into unsupported campaign copy. | Implemented 2026-08-07 |
| D-030 | The deterministic provisional preview is a real but unclaimable artifact. It appears before optional enrichment or model refinement completes, remains visible through refinement, and upgrades atomically only when attempt ID, input fingerprint, and artifact revision still match. | The visitor sees credible value quickly without weakening claim, source, or stale-result safety. Only a final `preview_ready_unclaimed` artifact can be saved or published; late work cannot overwrite changed inputs or a claimed revision. | Implemented 2026-08-07 |
| D-031 | The three entry examples are Aprio for Georgia-Pacific (one-to-one), ServiceNow AI Platform (campaign), and Cisco Hybrid Mesh Firewall (content). | Each card opens a motion-appropriate, verified example instead of a generic placeholder or a mismatched API/demo board. Example links are secondary proof, not the primary creation action. | Accepted and implemented 2026-08-07 |
| D-032 | Analytics uses layered authority: first-party product/session ledgers for durable QA and inputs, optional PostHog for funnels/errors/masked replay, and native Folloze analytics inside published buyer experiences. | Server and browser events use stable explicit names; PostHog autocapture is disabled. Raw source content, prompts, secrets, domains, and email stay out of ordinary analytics events. Email becomes a person property only after an explicit claim. Analytics failures never block the build. | Implemented; PostHog is config-gated 2026-08-05 |
| D-033 | The visual system has three owners: a calm light Folloze shell, one deep-navy Folloze processing module, and a customer-led generated preview. | This keeps Folloze recognizable without contaminating harvested customer branding. Verified Folloze blue/cyan/green tokens drive action, focus, progress, and success; the shell stays sans-serif, controls have visible focus and 44px targets, and motion respects reduced-motion preferences. | Implemented 2026-08-08 |
| D-034 | After a prospect chooses one of the three motions, the primary brief surface is a conversational composer that translates one short sentence, URL, or PDF into visible, editable structured fields. | This clarifies D-017 rather than permitting arbitrary prompt-driven generation. The natural-language layer is a capture surface over the existing seller, target, offer/source, audience, objective, evidence, wireframe, and claim contracts. Folloze asks only the highest-leverage unresolved question, shows provenance for inferred values, and never treats unvalidated streamed prose as product truth. | Accepted 2026-08-09 |
| D-035 | Brand delivery is progressive: a minimum-safe bundle of verified identity, official logo, and semantic color roles may power an unclaimable provisional preview; browser-derived typography, components, layout, and imagery enrich the final preview within the same 60-second deadline. | This makes D-026 and D-027 operationally compatible. A partial state is labeled honestly and never uses generic brand values, while optional desktop DesignDNA work can upgrade the preview without holding it hostage. Final save/share still requires the full final readiness and quality contract. | Accepted 2026-08-09 |

On 2026-08-04, Trey explicitly superseded D-014. On 2026-08-07, he clarified
that the complete Try Me Now result must fit inside 60 seconds. D-026 is the
canonical latency decision. D-030 is the canonical lifecycle and stale-result
safety decision for delivering that speed.

On 2026-08-08, the guided-flow presentation in D-011 and D-013 was clarified:
the visitor's three choices and Folloze's four autonomous work stages are related
but are not two competing progress meters.

On 2026-08-09, D-034 clarified D-017: a natural-language composer is approved
as a structured-input surface, but arbitrary generation instructions remain
outside the primary flow. D-035 clarifies that verified minimum-safe brand
evidence can support the provisional artifact while deeper DesignDNA remains a
bounded final-preview enrichment.

## Superseded June 1 directions

| Earlier direction | V1 replacement |
| --- | --- |
| Event or Webinar Promotion as a top-level third card | Generalized Campaign is the card; event/webinar is a subtype. |
| Base experience plus three personalized account versions | One target-account version plus a Default preview state. |
| Optimize for launching a first campaign in 15 minutes | Deliver a credible Try Me Now preview in a 30–60 second quality window, with useful build feedback within 10 seconds. |
| Ask whether output should be publishable or shareable | Create a temporary URL automatically; claim controls persistence. |
| Six visible Campaign Agent information categories | Three-to-four progressive questions, one three-choice guide, and one compact Folloze-work receipt. |
| Prospect chooses from many templates | Folloze selects one compatible reviewed archetype and stores an explainable locked receipt. |
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
- a real embedded analytics dashboard in place of the labeled analytics story;
- prospect-facing template browsing before the first generated preview;
- automatic native Folloze publication before a validated business-email claim;
- using `BrandDesignDNA` to rewrite source facts, claims, audiences, or conversion goals.

## Decision-change protocol

Any change to an accepted decision should record:

1. the decision ID being changed;
2. the new behavior;
3. why the evidence justifies the change;
4. its effect on product requirements, tests, privacy, latency, and launch gates;
5. the approving owner and date.

Every material interface or lifecycle change must name the affected decision ID
in its plan, design handoff, test, or commit message. Do not silently change
checklist semantics, provisional/final readiness, email gating, TTL, source
grounding, template-selection ownership, analytics privacy, brand authority, or
the 30–60 second quality-window promise in implementation code.
