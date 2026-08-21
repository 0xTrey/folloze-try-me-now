# Try Me Now V2 for Folloze Chat: Product and Engineering Handoff

Status: proposed implementation authority for Try Me Now V2  
Owner: Trey Harnden  
Prepared: 2026-08-21  
Repository: `0xTrey/folloze-try-me-now`  
Companion system: `0xTrey/folloze-experience-production-system`

## Executive decision

Try Me Now V2 has one job: turn a very small amount of buyer or marketer input into a phenomenal, brand-native, interactive microsite or landing page quickly enough to create an immediate “Folloze just built that for me” moment.

The product exposes exactly three creation routes:

1. **ABM** — create a seller-branded, account-specific microsite.
2. **Campaign** — create a high-quality campaign landing page for an audience, offer, or event.
3. **Content Magic** — use the Content Magic skill to transform one approved URL or document into an interactive content experience.

Try Me Now does not expose the full Folloze production taxonomy, route directly across all 60 setup profiles, or execute the complete 11-step production workflow during the anonymous preview. It reuses the production system's quality contracts where they improve the generated experience, then emits a complete handoff packet if the experience is intentionally promoted into production.

The full 11-step production system remains the authority for deeper research, exact production routing, full adversarial review, visual approval, Folloze save/readback, analytics verification, publication, vanity routing, tracker updates, Git state, and release evidence.

## Superseding decisions

This handoff supersedes the following earlier Try Me Now directions where they conflict:

- Buyer-facing CTAs are no longer visual demonstrations. Every visible CTA must perform a real, validated action.
- Buyer-facing resource cards are no longer summary-only decorations. They must open or embed a real content experience, with a tested fallback.
- The 17 existing visual “archetypes” should be called **composition recipes**. “Workflow archetype” is reserved for the 17 production-system workflow shapes.
- A valid business-email claim preserves the Try Me Now web experience. It does not silently create, save, or publish a Folloze board.
- Native Folloze creation is a separate, explicit production handoff, not an automatic consequence of preview generation or email claim.
- Content creation is owned by the Content Magic route and skill. A generalized campaign generator must not impersonate Content Magic merely because a campaign includes a PDF or URL.

## Current implementation baseline

This handoff was prepared against `origin/codex/visual-v1` at commit `3508192`. Existing uncommitted work in Trey's primary local checkout was deliberately not used as an implementation target or modified.

The current repository already provides a strong base:

- `src/lib/types.ts` exposes the three `abm`, `campaign`, and `content` routes;
- the provisional/final revision fence and 60-second orchestration contract already exist;
- the versioned `ExperienceSpecV1`, deterministic wireframe selection, web renderer, brand pipeline, session persistence, analytics separation, and claim boundary are implemented;
- existing ABM, campaign, content, responsive, claim, security, analytics, and Folloze-wrapper tests provide regression coverage.

The implementation gaps addressed by this handoff are specific:

- `ExperienceSpecV1.cta` records intent, style, and label but not a structured action or destination;
- `ExperienceContentItem` records summary presentation but not a source URL, embedding mode, fallback, access model, or verification receipt;
- generated `data-demo-cta` controls emit analytics but do not execute a buyer action;
- some resource controls change an internal lens rather than opening the promised source or content experience;
- earlier documentation deliberately deferred live CTA destinations and native Folloze handoff;
- the runtime uses “archetype” for visual composition even though the production system now reserves that word for workflow ownership.

V2 should extend this base rather than replace the working session, revision, renderer, or safety architecture.

## Product promise

A visitor should be able to say something as small as:

> Build a microsite for Acme focused on infrastructure leaders at TargetCo.

or:

> Create a landing page for our Chicago executive dinner for security leaders.

or:

> Turn this report into an interactive buyer experience.

Folloze should then:

- recognize the seller's brand;
- understand the intended audience and outcome;
- research the minimum useful public context;
- select an appropriate reviewed composition;
- craft specific, source-safe messaging;
- personalize only where the evidence permits it;
- add purposeful visual elements and content items;
- create working CTA and resource interactions;
- render an honest provisional experience quickly;
- refine the same artifact into a polished final preview;
- explain completed work through real receipts rather than simulated progress.

The prospect should experience a simple chat. The backend should behave like a disciplined production team.

## Definition of a phenomenal result

A generated experience is not phenomenal because it is long, animated, or heavily personalized. It is phenomenal when it passes all of these tests:

1. **Instant recognition** — the seller's identity, visual character, and offer context are recognizable in the first viewport.
2. **Audience specificity** — the hero, tension, proof, and next step could not be swapped into an unrelated company or audience without obvious edits.
3. **One coherent argument** — every section advances the buyer from relevance to understanding, proof, and action.
4. **Useful interaction** — tabs, content readers, video, resources, assessments, or other controls help the buyer decide; they are not decoration.
5. **Working actions** — every CTA resolves to a real section, resource, video, form, calendar, or approved external destination.
6. **Purposeful content** — embedded content reinforces the message spine and includes a fallback when the original source cannot be framed.
7. **Brand-native presentation** — typography, color, imagery, density, surfaces, and motion reflect verified brand evidence rather than framework defaults.
8. **Source safety** — visible facts, proof, account claims, dates, speakers, and outcomes remain traceable to public or approved evidence.
9. **Mobile integrity** — the page remains legible, usable, and visually intentional at narrow widths.
10. **Honest state** — a provisional preview, saved web experience, Folloze draft, published board, analytics verification, and production deployment are never represented as the same thing.

## Scope boundary

### Try Me Now owns

- the three-route prospect experience;
- conversational intake and the visible Live Brief;
- fast public research and evidence collection;
- seller and optional target brand evidence;
- route-specific message and personalization assembly;
- deterministic composition selection;
- source-grounded copy refinement;
- the responsive web experience;
- functional CTAs and embedded content items;
- preview analytics and example Folloze analytics storytelling;
- app-hosted persistence after claim;
- an optional production handoff packet.

### The production system owns

- exact `G01.01`-`G11.06` profile selection;
- one production workflow archetype and wireframe variant;
- control-plane choice: HTML, native, native API, or hybrid;
- full research and strategy packets;
- the bounded three-to-five-reviewer adversarial loop;
- operator visual approval;
- Folloze board selection or creation;
- native schema and section discovery;
- save, readback, publish, vanity, anonymous verification, analytics delivery, tracker, Git, and release receipts.

### Try Me Now does not own

- all 60 production profiles;
- a self-service Folloze editor;
- arbitrary template selection;
- generic website generation;
- CRM-dependent personalization in the anonymous path;
- native board publication during preview generation;
- a simulated claim that Folloze analytics or Pulse delivery occurred;
- a second copy of the production system inside the application.

## The three route contracts

### 1. ABM

**Job:** Create a seller-owned microsite that makes a named account feel understood without becoming invasive.

**Minimum inputs:**

- seller domain;
- target-account domain or clearly supplied target identity;
- audience;
- desired outcome or one-sentence brief.

**Internal ABM intent:**

The prospect still sees one ABM route, but the Live Brief must resolve the relationship and lifecycle intent when it materially changes the message:

- acquisition or new logo;
- expansion or cross-sell;
- renewal or optimization;
- executive follow-up;
- event or meeting follow-up;
- deal, workshop, or decision support.

The system should infer a reversible recommendation from the prompt and ask one question only when choosing the wrong intent would make the visible experience unsafe or strategically incorrect.

**Fast research:**

- seller offer, mechanism, proof, and approved resources;
- target's public priorities, operating context, market pressures, and relevant initiatives;
- safe seller-to-target relevance hypotheses;
- separate seller and target brand evidence.

**Visible personalization may use:**

- public company name and logo;
- public initiatives and operating priorities;
- industry and role context;
- approved customer or relationship evidence;
- seller proof that is relevant to the target's public context.

**Visible personalization may not use:**

- private intent, CRM fields, email, Slack, or meeting notes;
- implied product usage or relationship;
- inferred budget, timing, buying committee, or urgency;
- “we know you are struggling with” claims without approved evidence.

Lifecycle rules remain distinct:

- acquisition uses public context and must not imply a relationship or private intent;
- expansion uses only approved footprint, outcomes, and adjacent value;
- renewal emphasizes approved outcomes, adoption, education, and optimization rather than disguised upsell;
- executive follow-up uses a concise thesis, tradeoffs, and explicit ask;
- event or meeting follow-up uses only approved recap, resources, and next steps;
- deal or workshop support uses a buyer-safe recap and approved decision action.

**Required output:**

- seller-led visual system with restrained target recognition;
- account-specific first viewport;
- concise account thesis;
- two or three decision lenses or stakeholder paths;
- seller mechanism and relevant proof;
- two to four useful resources or interactions;
- one primary next step with a working action;
- default and target-account preview states where personalization behavior is being demonstrated.

### 2. Campaign

**Job:** Create a compelling landing page that makes an offer clear, relevant, credible, and actionable.

**Minimum inputs:**

- seller domain;
- campaign brief, offer URL, event source, or concise description;
- audience;
- desired action.

**Supported internal subtypes:**

- product or solution campaign;
- demand-generation campaign;
- launch or announcement;
- field event;
- webinar or virtual event promotion.

For event work, also resolve the experience intent:

- in-person event promotion;
- webinar promotion;
- virtual or simulive event request;
- live webinar request;
- replay or follow-up.

Try Me Now may render an excellent web promotion, replay, or follow-up experience for each intent. A request that requires a native Simulive, live Zoom, or hybrid Folloze control plane must be marked `production_required`; the web preview must not imply that native playback, forms, or live-event operations already exist.

These remain one prospect-facing Campaign route, but they are not forced into one page geometry. Each subtype receives its own message contract, lifecycle rules, and composition recipe.

**Required output:**

- clear offer and audience relevance in the first viewport;
- one primary conversion job;
- mechanism, proof, decision help, and useful resources;
- two to four embedded or in-page content items when evidence supports them;
- subtype-specific interaction and close treatment;
- working campaign CTA;
- verified event title, date, time zone, location, speakers, agenda, and lifecycle action for event or webinar work.

An event CTA must match its verified lifecycle:

- upcoming → register;
- live → join;
- replay → watch;
- follow-up → recap, resources, or meeting.

Missing event facts may produce an in-page “View event details” action or a request for one missing fact. They may not produce an invented registration experience.

### 3. Content Magic

**Job:** Transform one approved source into a guided, interactive experience that teaches, proves, and advances a next action.

**Minimum inputs:**

- seller domain or visible brand owner;
- public URL or supported document;
- audience;
- desired learning or conversion outcome.

**Owner:** The Folloze Content Magic skill is the route-specific authority. It owns source understanding, the teaching sequence, the signature interaction, source-grounded claims, and original-source continuity.

**Required output:**

- real source title and identity;
- source premise and important findings;
- a purposeful teaching sequence;
- an interaction such as topic exploration, role path, assessment, guided chapters, or decision aid;
- one or two source-backed highlights rather than generic question cards;
- the original source or a source-grounded embedded reading experience;
- a working next action;
- clear limitations when the source cannot support a claim.

The campaign path may accept a URL or PDF as offer evidence. It must not invoke a generic “content mode” that duplicates or weakens Content Magic.

## Prospect interaction contract

The preferred interface is a constrained Folloze chat, not an open-ended prompt studio.

1. The visitor selects ABM, Campaign, or Content Magic.
2. The visitor enters one sentence, public URL, or PDF plus a seller domain when it cannot be inferred safely.
3. Folloze displays “I’m reading this as…” and projects the input into a visible Live Brief.
4. The Live Brief shows:
   - visible brand owner;
   - target or audience;
   - offer or source;
   - desired buyer belief;
   - desired buyer action.
5. Folloze asks no more than one material unresolved question at a time.
6. Research, brand, source, and resource work begins as soon as the relevant input stabilizes.
7. The visitor sees a truthful build shell within five seconds.
8. A safe, interactive provisional experience appears by 15 seconds in contract tests.
9. Evidence, copy, imagery, and presentation refine the same artifact in place.
10. By 60 seconds, the experience is final or remains an explicit safe provisional state with a bounded retry.
11. After preview, the visitor may adjust audience, outcome, tone, visual direction, resource choice, or CTA without restarting the entire experience.
12. A business email is requested only after value is visible and the preservation, follow-up, privacy, and retention purposes are disclosed separately.

The five-, 15-, and 60-second values are service-level objectives measured against declared deterministic fixtures and production-like environments, not guarantees that arbitrary external providers will respond within those windows. Provider degradation preserves the best honest artifact and records the fallback reason.

Progress messages must name real artifacts:

- “Seller identity verified”
- “Target context collected from three public sources”
- “Message spine selected”
- “Three resources checked; two are embeddable”
- “CTA destination verified”
- “Mobile layout passed”

Do not show fake percentages or vague “AI is thinking” states.

Progress messages may render counts, validation results, or completion language only from completed worker receipts. When no receipt exists, show a truthful generic running state and never invent source counts, embedability, validation status, or completion.

## Fast Quality Pipeline

Try Me Now compresses the quality-producing portion of the production process into a bounded, parallel preview pipeline. It does not claim completion of the full production lifecycle.

```text
Prompt and route
      ↓
Source plan and permission boundary
      ↓
Research ───── Brand evidence ───── Resource discovery
      └──────────────┬────────────────────┘
                     ↓
          Strategy and message spine
                     ↓
       Personalization and copy assembly
                     ↓
      Composition and content-item planning
                     ↓
        ExperienceSpecV2 reconciliation
                     ↓
 CTA + content + evidence + visual validators
                     ↓
       Provisional or refined web preview
                     ↓
       Optional production handoff packet
```

This pipeline reuses the intent of production steps 1–8—research, brand, strategy, messaging, build, review, and visual output—without performing steps 9–11 or representing a generated preview as an approved production artifact.

## Runtime worker and agent model

The backend should use a mixture of deterministic workers and bounded model agents. More agents do not automatically create better work. Quality comes from clear contracts, shared evidence, one reconciler, and hard validators.

| Component | Type | Responsibility | Output |
| --- | --- | --- | --- |
| Intake router | Deterministic | Resolve ABM, Campaign, or Content Magic and normalize the prompt | `route_decision` |
| Source mapper | Deterministic/model-assisted | Classify supplied inputs, permissions, missing facts, and research jobs | `source_plan` |
| Local context researcher | Bounded agent | Read approved user-supplied files, briefs, notes, and context; separate visible evidence from internal-only strategy context | `local_source_ledger` |
| Public researcher | Bounded agent | Collect only the public context needed by the route | `public_source_ledger` |
| Brand Harvester | Deterministic service | Harvest seller brand authority and separately harvest optional target recognition evidence; never merge brand roles without approved co-branding | `brand_packet` |
| Resource curator | Bounded agent | Find and rank useful articles, proof, product pages, videos, and source assets | `resource_plan` |
| Embed preflight | Deterministic | Check URL safety, framing, CSP, video identity, access, and fallback | `embed_receipts` |
| Motion strategist | Bounded agent | Produce the route-specific strategy and message spine | `message_spine` |
| Personalization strategist | Bounded agent | Select safe account, audience, or generic substitutions | `personalization_plan` |
| Copy architect | Bounded agent | Fill constrained copy slots from approved evidence and spine | `message_packet` |
| Visual/content architect | Bounded agent | Select the composition recipe, section jobs, visual grammar, and content placements | `visual_plan` |
| Reconciler/compiler | Deterministic with bounded repair | Resolve conflicts and compile one canonical spec | `ExperienceSpecV2` |
| Quality validators | Deterministic | Prove evidence, actions, embeds, accessibility, mobile behavior, and analytics ownership | `quality_receipts` |
| Fast adversarial reviewer | Bounded agent | Challenge buyer relevance, unsupported claims, generic copy, and broken experience logic | `review_receipt` |

### Concurrency waves

**Wave 0 — immediate and deterministic**

- parse the prompt;
- select one of three routes;
- establish visibility and permission boundaries;
- choose candidate composition recipes;
- create the temporary experience shell.

**Wave 1 — parallel evidence work**

- approved user-supplied files, notes, briefs, and context;
- seller brand harvesting;
- target research and recognition evidence for ABM;
- offer, event, or source research for Campaign;
- source extraction through Content Magic;
- resource discovery and embed preflight.

Local and public evidence remain separate ledgers. If the visitor supplies no local or private material, the local ledger records `status: not_provided` rather than disappearing from the contract.

**Wave 2 — shared strategy truth**

- the reconciler may issue a provisional message spine only from evidence marked usable for preview;
- visible claims, proof, brand identity, and CTAs cannot become final until their source, permission, and brand gates pass;
- missing or conflicting evidence remains explicitly provisional and is excluded from unsupported visible claims;
- missing “why now” or proof remains omitted rather than invented;
- the evidence ledger is locked for the current revision.

**Wave 3 — parallel assembly**

- copy architect fills the approved argument;
- personalization strategist selects safe variations;
- visual/content architect selects the section sequence, interaction pattern, and visual treatment.

**Wave 4 — compile and prove**

- the reconciler creates one `ExperienceSpecV2`;
- deterministic validators test every CTA, content item, source reference, image, interaction, analytics owner, responsive rule, and accessibility requirement;
- one bounded adversarial pass may recommend a surgical repair;
- affected deterministic validators rerun after a repair, and the repaired artifact receives a new revision and digest;
- a repair cannot replace a newer revision or hold the visitor beyond the shared deadline.

## Canonical ExperienceSpecV2

The highest-priority implementation is a versioned contract that every route, agent, validator, and renderer shares. This is more important than adding more free-form agents.

```text
ExperienceSpecV2
├── identity
│   ├── session_id
│   ├── revision
│   ├── input_fingerprint
│   └── artifact_digest
├── route
│   ├── use_case: abm | campaign | content_magic
│   ├── abm_intent
│   ├── relationship_state
│   ├── campaign_subtype
│   ├── event_experience_intent
│   ├── lifecycle
│   ├── composition_recipe
│   └── preview_mode
├── brief
│   ├── original_prompt
│   ├── seller
│   ├── target_or_audience
│   ├── offer_or_source
│   ├── buyer_belief
│   └── buyer_action
├── evidence
│   ├── local_source_ledger_ref
│   ├── public_source_ledger_ref
│   ├── claim_refs
│   ├── proof_refs
│   ├── visibility_boundary
│   └── unresolved_gaps
├── brand
│   ├── seller_authority: primary_authority
│   ├── target_recognition: secondary_recognition
│   ├── approved_cobrand
│   ├── wrapper_and_producer_versions
│   ├── validation_status
│   ├── source_and_rights
│   ├── tokens
│   ├── asset_manifest
│   └── readiness_receipt
├── strategy
│   ├── audience_truth
│   ├── context
│   ├── buyer_tension
│   ├── why_change
│   ├── why_now
│   ├── vendor_promise
│   ├── mechanism
│   ├── proof_plan
│   ├── decision_help
│   └── next_action
├── personalization
│   ├── mode
│   ├── safe_fields
│   ├── omitted_fields
│   └── visible_variants
│       ├── variant_id
│       ├── field_and_value
│       ├── source_refs
│       ├── classification
│       ├── reason
│       └── audience_state
├── composition
│   ├── recipe
│   ├── section_jobs
│   ├── visual_grammar
│   ├── responsive_plan
│   └── interaction_map
├── copy
│   ├── headline_and_hero
│   ├── section_copy
│   ├── proof_language
│   └── content_labels
├── actions
│   ├── primary_cta
│   ├── secondary_ctas
│   └── action_receipts
├── content_items
│   ├── items
│   └── embed_receipts
├── measurement
│   ├── product_events
│   ├── experience_events
│   ├── ownership
│   └── verification_level
├── quality
│   ├── deterministic_receipts
│   ├── adversarial_receipt
│   ├── repair_receipt
│   └── preview_state
├── claim_contract
│   ├── purpose_and_consent_text_ref
│   ├── consent_scope
│   ├── retention_policy_ref
│   ├── marketing_opt_in
│   └── lead_write_receipt
└── production_handoff
    ├── status
    ├── requested_permissions
    └── handoff_packet_ref
```

Legacy `ExperienceSpecV1` remains readable. New V2 fields should be additive until stored V1 sessions are migrated or retired deliberately. The legacy three-section `ExperienceDraft` fields are compatibility projections, not the V2 visual contract; V2 section jobs and route-specific compositions are authoritative.

Every visible personalization variant must resolve to approved source references and a safety classification. `risky_reviewed` requires an explicit approval receipt; a value without source references is omitted from the visible artifact.

The normalized brand wrapper retains its contract version, producer schema version, validation status, authority role, source reference, asset allowlist, rights notes, desktop/mobile evidence state, and unresolved exclusions. Brand evidence remains an internal production artifact; only approved assets and normalized public-safe fields enter the generated page.

## CTA action contract

Every buyer-facing CTA requires:

```text
cta_id
purpose
label
action_type
destination
fallback_destination
lifecycle
access_requirement
analytics_event
analytics_owner
verification_state
```

Allowed action types include:

- scroll to an existing section;
- open an embedded content item;
- play a verified video;
- open a verified external source;
- open an approved calendar or meeting destination;
- open a configured form;
- open an accessible in-page dialog or decision aid.

Rules:

1. Every CTA has exactly one primary action and one resolvable destination.
2. “Watch,” “Read,” “Download,” “Register,” “Book,” and “Explore” labels must perform the named action.
3. A missing external destination must not create a dead button. Use a truthful in-page action or change the label.
4. Event CTAs require verified lifecycle and destination evidence.
5. External destinations receive a tested fallback and safe-link attributes.
6. Every meaningful interaction has exactly one analytics owner.
7. A locally working CTA does not prove hosted Folloze behavior or analytics delivery.
8. A buyer-experience CTA is separate from the Try Me Now product's save, share, analytics-demo, and request-demo controls.

A dead or misleading CTA is a preview blocker for the affected revision.

## Content-item and embed contract

Every content item requires:

```text
item_id
kind
title
purpose
source
source_owner
section_job
permission_status
primary_mode
embed_configuration
embed_status
fallback
fallback_url
access_requirement
caption_or_transcript_status
analytics_events
accessibility
responsive_behavior
expiry_or_review_date
verification_state
```

Preferred delivery order:

1. native or first-party Folloze content item when the later production control plane supports it;
2. verified in-page reader or media player;
3. source-grounded embedded briefing when the original source blocks framing;
4. direct on-page briefing;
5. explicit external source fallback;
6. omit the item when none of the above is safe or useful.

A discovered resource is not eligible for selection until permission, embed status, section job, and fallback are resolved. Unknown frameability selects a safe briefing or link fallback rather than an iframe. A resource lacking permission status or a usable fallback cannot become an embedded item.

### External webpages

- Never assume a public page can be iframed.
- Check `X-Frame-Options`, CSP, redirect behavior, authentication, and mobile sizing.
- Provide an explicit external fallback.
- Distinguish the source from a Folloze-authored summary.

### YouTube and provider video

- Verify the video identity, title, source owner, thumbnail, and availability.
- Prefer privacy-enhanced embedding where supported.
- Do not autoplay with sound.
- Respect reduced-motion preferences.
- Require captions or a meaningful transcript/fallback when available.
- Track play and fallback actions separately.
- Never place a play icon over an image when no working player exists.

### Accessible readers

- The trigger declares the dialog or reader relationship.
- The reader has a visible close action, accessible name, Escape support, and focus restoration.
- Every iframe has a meaningful title.
- The experience remains usable when the embed fails.

### Quantity by route

- ABM: usually two to four account-relevant resources or decision aids.
- Campaign: usually two to four offer, proof, event, or education resources.
- Content Magic: the source-led teaching sequence plus its signature interaction and original-source continuity.

The product requirement is meaningful content, not filler. A route may use fewer external assets—or zero external embeds—when no safe and useful resource passes preflight. The on-page experience must still provide purposeful decision help rather than padding the page with decorative cards.

## Messaging and personalization contracts

### Shared message spine

Every route resolves:

- audience truth;
- context;
- buyer tension;
- why change;
- why now, only when supported;
- seller promise;
- mechanism;
- proof and permission;
- decision help;
- next action;
- visibility boundary.

### ABM personalization

ABM copy must use account-specific evidence, not a company-name substitution. The target identity is context; the seller remains the visible design owner unless an approved co-branding brief says otherwise.

### Campaign personalization

Campaign copy is specific to the audience, offer, market, and lifecycle. It does not pretend to be one-to-one personalization and does not expose account-level signals.

### Content Magic personalization

Content authority comes from the submitted source. Audience adaptation may change sequence, explanation, and next action, but it may not rewrite the source's claims or invent proof.

### Copy quality

Copy should use:

- one-reader focus;
- concrete language;
- specific tension and promise;
- useful curiosity;
- mechanism before hype;
- proof near the claim it supports;
- risk reduction;
- one clear next action.

It must not fabricate urgency, imitate a named writer, invent customer proof, or sacrifice the visible brand's voice for generic direct-response language.

## Visual and interaction rules

1. The model fills constrained content slots; it does not invent page geometry.
2. The renderer selects a reviewed composition recipe deterministically.
3. Every major section has one explicit job: orient, diagnose, explain, prove, personalize, answer, route, or convert.
4. Every section adds a new reason to believe, decision input, proof point, or useful action.
5. Do not use more than two consecutive split-image sections.
6. Vary information behavior with cards, tabs, diagrams, proof treatments, media, content readers, agenda, FAQ, assessment, form, calculator, or decision surfaces.
7. Use one hero asset intentionally and avoid accidental repetition later in the page.
8. When no suitable image exists, render a strong type-led or diagram-led treatment instead of generic stock imagery or a broken placeholder.
9. Seller brand controls the visual system. Target branding is restrained recognition unless co-branding is approved.
10. Motion is purposeful, bounded, and reduced-motion safe.
11. Responsive QA covers 1440, 768, 414, 390, 375, and 320 pixel widths.
12. Keyboard focus, contrast, overflow, dialog behavior, readable type, and embed fallback are hard implementation requirements.

## Quality gates and preview behavior

### Hard blockers

- unsupported visible claim;
- fabricated account, customer, event, or source fact;
- untrusted or mismatched brand identity presented as verified;
- dead primary CTA;
- misleading action label;
- broken required content item without a fallback;
- inaccessible primary interaction;
- unsafe destination or source fetch;
- stale agent output attempting to replace a newer revision;
- Content Magic source that cannot be read sufficiently to ground the experience.

### Upgrade gates

- message specificity;
- proof proximity;
- visual variety;
- imagery quality;
- section novelty;
- brand fidelity beyond minimum-safe identity;
- optional resource depth.

Upgrade scores should improve the preview but must not create a blank-screen failure. When enrichment or repair times out, preserve the best honest artifact and expose its limitation. One bounded repair may run; repeated speculative rewrites are not permitted inside the 60-second promise.

## Measurement model

Try Me Now has two separate measurement surfaces.

### Product telemetry

This records actual use of the Try Me Now application:

- route selected;
- generation eligibility;
- provisional rendered;
- final rendered;
- interaction depth;
- resource opened;
- CTA exercised;
- experience claimed;
- production handoff requested.

Raw prompts, source content, URLs, domains, email, generated copy, and credentials do not belong in ordinary analytics events.

Product telemetry and generated-experience interaction events use separate registries. The generated-experience registry includes route-safe events such as `reader_open`, `reader_close`, `video_play`, `resource_open`, `source_fallback`, and `cta_click`; it still excludes raw URLs, source bodies, generated copy, and personal data.

### Generated-experience measurement packet

The spec defines:

- primary outcome;
- primary CTA;
- meaningful interactions;
- event ownership;
- funnel sequence;
- allowed properties;
- verification state.

For a web preview, local interaction wiring may be verified. Folloze-hosted analytics, Pulse delivery, and campaign performance remain unverified until the production system reaches and proves those states.

Illustrative analytics used to demonstrate Folloze must remain visibly labeled **Example analytics** and remain separate from the visitor's actual activity.

## Claim and consent contract

Preserving an experience and consenting to marketing follow-up are different purposes.

- The claim surface explains whether the email will preserve the experience, request human follow-up, or both.
- The accepted privacy notice and retention policy are versioned in the claim receipt.
- Marketing opt-in is a separate, optional boolean; it is never inferred from preservation.
- Raw email remains server-side and out of product telemetry, generated HTML, model prompts, and generated-experience analytics.
- A lead or claim record is created only after explicit consent, validation, and a successful durable-write receipt.
- Failure to write the durable claim does not imply success. Preserve the current temporary preview and provide a bounded retry.
- A claim record is product state, not proof of CRM sync, Folloze production, publication, or email delivery.
- Deletion, expiry, and operator access follow the referenced retention policy rather than an undocumented permanent default.

## Lifecycle contract

```text
collecting
  → researching
  → preview_provisional
  → preview_ready_unclaimed
  → claim_pending
  → saved_web_experience

preview_provisional → refinement_failed → preview_provisional
collecting|preview_ready_unclaimed → expired
saved_web_experience → production_handoff_requested
```

Rules:

- A provisional preview is visible and interactive but cannot be claimed until its hard contracts pass.
- Claiming persists the web experience and creates the approved claim or lead record only after the claim-and-consent contract succeeds.
- Claiming does not create or publish a Folloze board.
- `production_handoff_requested` means only that an explicit handoff packet was created.
- A future Folloze draft, saved readback, publication, vanity route, anonymous verification, and analytics verification are production-system states.
- No Try Me Now state may imply a later production state without the corresponding production receipt.

## Production handoff contract

When an authenticated user deliberately chooses **Continue with Folloze production**, Try Me Now creates `try-me-now-production-handoff.v1`.

Required fields:

- original prompt and confirmed Live Brief;
- Try Me Now route and campaign subtype;
- current `ExperienceSpecV2` revision and digest;
- approved seller, target, offer, and source identities;
- separate local and public source ledgers plus claim, proof, and normalized brand-evidence references;
- message spine and copy-role recommendation;
- personalization decisions and visibility boundary;
- selected composition recipe and section jobs;
- CTA and content-item contracts;
- measurement plan;
- user edits and locked decisions;
- preview artifact and screenshot references;
- quality, action, embed, and review receipts;
- unresolved gaps;
- exact permissions granted by the user.

Every populated reference must resolve to the active revision. A path, URL, or receipt name is not evidence by itself.

The production system then:

1. treats the packet as an input, not as proof that production stages are complete;
2. creates its canonical request, route card, measurement packet, research/strategy packet, and manifest;
3. selects the exact G-profile, workflow archetype, wireframe variant, build mode, and builder;
4. revalidates evidence, permissions, destinations, brand freshness, and claims;
5. validates the canonical research-strategy packet and all referenced IDs before promoting any Try Me Now finding to an approved production artifact;
6. preserves useful Try Me Now decisions without forcing the production experience to retain the web composition;
7. requests separate authority for Folloze save, publication, vanity, tracker, or external actions.

No secret, editor token, raw claim email, provider credential, or unrestricted source body belongs in the handoff packet.

## Highest-priority implementation package

The first implementation package should be **Contracted Experience Assembly**. It creates the quality spine that every later agent and feature depends on.

### P0.1 — ExperienceSpecV2 and route adapters

Deliver:

- additive `ExperienceSpecV2` schema;
- explicit `abm`, `campaign`, and `content_magic` route contracts;
- ABM intent, relationship, and lifecycle fields without adding prospect-facing route cards;
- campaign subtype contract;
- event experience intent plus `production_required` handling for native Simulive/live requests;
- renamed `composition_recipe` vocabulary;
- V1 read compatibility;
- artifact revision, fingerprint, and digest rules.

Acceptance:

- all three routes compile into one validated spec;
- stale outputs cannot replace a newer revision;
- the existing web renderer can read a normalized V2 projection;
- no production G-profile is selected during Try Me Now generation.

### P0.2 — Functional CTA and content-item runtime

Deliver:

- structured CTA action schema;
- structured content-item/embed schema;
- server-side destination validation;
- iframe and video preflight;
- resource eligibility, permission, review-date, and fallback receipts;
- reader/player/fallback components;
- analytics ownership map;
- keyboard and mobile behavior.

Acceptance:

- 100% of visible CTAs resolve to a working action in route fixtures;
- every content item opens, embeds, or falls back correctly;
- no blank iframe, fake video, placeholder URL, or decorative dead button ships;
- the action verb matches the actual destination.

### P0.3 — Agent-task and reconciliation contracts

Deliver:

- typed `agent_task` envelope;
- allowed inputs, output artifact, visibility class, deadline, and stop condition;
- shared source/claim IDs;
- one canonical reconciler;
- finding and repair receipts;
- conflict policy: evidence and safety outrank style.

Acceptance:

- agents cannot invoke renderers or external writes directly;
- agents cannot introduce claims absent from the evidence packet;
- all outputs resolve to one active spec revision;
- one bounded repair cannot overwrite a newer artifact;
- every repair reruns affected deterministic validators before a new digest becomes ready.

### P0.4 — Route-specific strategy adapters

Deliver:

- ABM strategy and public-personalization adapter;
- Campaign strategy adapter with lifecycle-aware event handling;
- Content Magic skill adapter with source authority and teaching sequence;
- shared message-spine schema;
- route-specific copy and quality evaluators.

Acceptance:

- ABM is recognizably account-specific without private-signal leakage;
- campaign variants differ in offer, lifecycle, argument, and conversion design;
- Content Magic remains source-led and cannot degrade into a generic campaign page;
- a company-name swap fails ABM specificity checks.

### P0.5 — Fast quality gate

Deliver:

- claim/proof coverage validator;
- local/public source-ledger and permission validation;
- brand readiness validator;
- CTA/content validator;
- section novelty and repeated-pattern validator;
- accessibility and responsive checks;
- one fast adversarial review and repair receipt;
- best-honest-artifact fallback.

Acceptance:

- provisional preview is available by 15 seconds in declared deterministic contract-test fixtures;
- final or explicit safe provisional state exists by 60 seconds in those fixtures and the production-like SLO suite;
- hard blockers prevent claim of the affected revision;
- optional visual enrichment cannot blank or remove the current usable preview.

## Follow-on work packages

### P1 — Make the output unmistakably premium

- deepen composition recipes for ABM and campaign subtypes;
- add source-appropriate Content Magic interaction recipes;
- improve design-DNA application and semantic asset selection;
- add purposeful diagrams, product visuals, proof surfaces, and campaign imagery;
- add visual regression fixtures across contrasting brands and source types;
- add post-preview controls for tone, visual direction, CTA, and resources.

### P1 — Make personalization and messaging exceptional

- implement Safe/Risky/Prohibited policy by route;
- add account and audience specificity evaluators;
- add role-aware copy assembly;
- add proof-permission and claim-expiry handling;
- add surgical section repair rather than whole-page regeneration;
- add buyer and direct-response review without permitting invented urgency.

### P1 — Make embedded content a signature capability

- build reusable accessible readers and media players;
- add resource ranking by section job;
- add source-grounded fallback briefings;
- add video caption/transcript behavior;
- add route-specific content quantity and quality thresholds.

### P2 — Production handoff

- serialize `try-me-now-production-handoff.v1`;
- expose an authenticated **Continue with Folloze production** action;
- connect to the production-system intake without exposing release tools to anonymous generation;
- preserve lifecycle and permission separation;
- add handoff replay and reconciliation tests.

The production handoff should be implemented only after P0 experience quality is proven. It must not delay the Try Me Now wow moment.

## Suggested repository change map

The implementation team should confirm naming against the current branch, but the likely ownership is:

```text
src/lib/types.ts
  additive V2 public/session projections and compatibility

src/lib/experience-contract.ts
  V2 assembly and V1 projection

src/lib/generation/experience-schema.ts
  route-specific message and visual schemas

src/lib/orchestration/
  agent task, wave coordinator, reconciler, receipts

src/lib/actions/
  CTA resolution, validation, and action registry

src/lib/content-items/
  resource eligibility, embed preflight, readers, and fallbacks

src/lib/generation/experience-renderers.ts
src/lib/generation/experience-template.ts
  functional CTA/content rendering and composition recipes

src/lib/integrations/
  Brand Harvester, source intelligence, and bounded model adapters

src/lib/quality/
  evidence, messaging, visual, action, responsive, and accessibility gates

src/lib/production-handoff/
  packet serialization and explicit production-system bridge
```

Avoid turning the existing `orchestrator.ts` into one larger monolith. Keep the public session coordinator small and move typed responsibilities behind route and worker interfaces.

## Evaluation suite

### Route fixture set

Maintain at least five diverse fixtures for each route:

- ABM: software, infrastructure, services, regulated enterprise, and sparse-public-evidence target;
- Campaign: product, demand, launch, field event, and webinar;
- Content Magic: article, report, PDF, video-supported source, and partially unreadable source.

### Automated contract tests

- route selection and no cross-route leakage;
- V1/V2 compatibility;
- source and claim provenance;
- personalization visibility policy;
- deterministic composition selection;
- CTA destination resolution;
- iframe/CSP fallback;
- YouTube/player fallback;
- action analytics ownership;
- stale revision fencing;
- 15-second provisional and 60-second terminal deadlines;
- stored-session and claim compatibility;
- no secrets or private source data in browser output or ordinary telemetry.

### Browser and visual QA

- route fingerprint is visible without reading internal metadata;
- seller identity and optional target recognition are correct;
- page has purposeful visual cadence;
- content readers, media, tabs, and dialogs work with keyboard and pointer;
- every CTA executes the expected action;
- all supported viewports avoid horizontal overflow and clipped controls;
- reduced-motion behavior remains complete;
- the current preview remains visible during refinement and repair;
- example analytics remains clearly illustrative.

### Human wow review

For representative fixtures, reviewers score:

- brand recognition;
- account or audience specificity;
- message coherence;
- proof credibility;
- visual distinction;
- interaction usefulness;
- CTA clarity;
- overall “I would show this to a prospect” confidence.

Scores guide improvement. Unsupported claims, dead actions, security issues, and inaccessible primary interactions remain hard blockers.

## Release gates

Report each state independently:

1. handoff and schemas approved;
2. local implementation complete;
3. contract tests complete;
4. browser and visual QA complete;
5. exact commit pushed;
6. protected Vercel preview verified;
7. production promotion explicitly authorized;
8. production deployment verified;
9. production-system handoff tested separately;
10. no Folloze board save or publication implied by the Try Me Now release.

## Definition of done for Try Me Now V2

Try Me Now V2 is ready when:

- the prospect sees only ABM, Campaign, and Content Magic;
- one concise prompt, URL, or PDF is enough to begin;
- a useful build shell appears within five seconds;
- a brand-safe, interactive provisional preview appears by 15 seconds in contract tests;
- a refined final or explicit safe provisional state exists by 60 seconds;
- ABM, Campaign, and Content Magic are visibly and structurally different;
- every buyer-facing CTA works;
- every visible content item is purposeful, sourced, accessible, and usable through its fallback;
- the experience is company-, audience-, and use-case-specific rather than generic;
- brand, evidence, messaging, personalization, visual, action, and measurement receipts resolve to the active spec revision;
- a visual enrichment failure cannot erase the best honest preview;
- email claim preserves the web experience without silently mutating Folloze;
- an explicit production handoff can transfer the approved artifact and evidence without weakening the 11-step production system's independent gates.

## Immediate next action

Begin with P0.1 and P0.2 together: define `ExperienceSpecV2`, then make CTA and content-item actions first-class parts of that schema and renderer. This removes the current presentation-only behavior and establishes the contract needed by every research, messaging, personalization, visual, and QA agent that follows.
