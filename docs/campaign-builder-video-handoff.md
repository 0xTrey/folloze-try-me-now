# Campaign Builder Video Review and Try Me Now Handoff

**Prepared:** July 31, 2026

**Source:** `GMT20260731-100944_Clip_Trey Harnden's Clip 07_31_2026.mp4`

**Audience:** Try Me Now product, design, and engineering contributors
**Purpose:** Turn the strongest patterns from the in-app Folloze Campaign Builder into actionable improvements for the customer-facing Try Me Now experience.

## Executive summary

The most valuable pattern in the Campaign Builder is not its chat interface. It is the transition from an unstructured request into a visible, correctable campaign brief, followed by an early research artifact and a real editable Folloze draft.

The customer-facing Try Me Now experience should borrow that product logic while improving the execution:

1. Start with one sentence, then expose the structured interpretation.
2. Clearly separate the seller, target account, and promoted offer.
3. Produce an evidence-backed audience insight before the full page is ready.
4. Allow generation once the minimum viable brief is complete.
5. Render real page artifacts progressively instead of hiding the work behind a generic loader.
6. Generate one intermediate `ExperienceSpec` that can drive both the website preview and a native Folloze board.
7. Let a claimed visitor continue editing in Folloze while keeping preview, draft creation, and publication as separate states.

The existing Try Me Now v2 plan already covers much of the necessary foundation: progressive artifacts, truthful progress receipts, evidence controls, source confirmation, brief editing, block-level regeneration and locking, layout variants, analytics proof, and a saved-experience cockpit. This handoff focuses on the remaining deltas revealed by the video.

## Source boundaries

The video is a 2 minute 58 second walkthrough of the current in-app Folloze Campaign Agent creating a traditional Folloze board.

This document separates three evidence levels:

- **Observed:** directly visible in the recording.
- **High-confidence inference:** strongly implied by persistent UI state or the created board.
- **Design recommendation:** proposed for Try Me Now; not a claim about the current Campaign Builder implementation.

No network trace, application logs, database schema, or Campaign Builder source code was inspected. Loading-stage labels therefore should not be treated as proof of distinct backend workers.

## Observed Campaign Builder process

| Time | Step | Visible behavior | Product implication |
| --- | --- | --- | --- |
| 00:00-00:16 | Entry | Personalized greeting and one large prompt field | The builder delays structure until after the visitor states intent. |
| 00:17-00:25 | Initial brief | User enters `Build a 1:1 Microsite for Folloze selling into Cisco.` | Natural language is the lowest-friction starting point. |
| 00:26-00:32 | Structured interpretation | A six-field Campaign Overview appears with a `0/6` counter | The chat is backed by a structured brief rather than being the source of truth itself. |
| 00:33-01:02 | Manual source exploration | User browses Cisco product pages in another tab | Product research is not visibly captured; this detour should be replaced in Try Me Now. |
| 01:03-01:05 | Inferred fields | Product becomes `Folloze Platform`; audience becomes `Cisco decision-makers and stakeholders`; progress becomes `2/6` | The system extracts and normalizes fields from minimal input. |
| 01:06-01:12 | Audience Hub | Cisco priorities, challenges, and innovation focus appear with confidence scores | A useful research artifact is delivered before page generation. |
| 01:13-01:31 | Guided refinement | Contextual suggestion chips appear; user adds `Help Cisco break into their key accounts.` | Recommendations reduce typing and show that the system understands the account context. |
| 01:31-01:47 | Objective normalization | Objective becomes `Enable Cisco to break into key accounts`; progress becomes `3/6` | Free text is converted into a reusable campaign field. |
| About 01:48 | Build decision | `Create your board` is enabled with only three of six fields complete | The six fields guide quality but do not form a blocking questionnaire. |
| 01:52-02:23 | Generation | Full-screen stages cycle through Thinking, Diagnostics, Structure, and Design | Generation is treated as a multi-stage process, although the stages may be presentational. |
| 02:24 onward | Native result | Board `249039` opens in the Folloze designer as Draft; Preview and Publish remain separate | The output is a durable editable object, not only a static AI response. |

### Campaign Overview fields

The visible brief contains:

1. Product/Solution
2. Target Audience
3. Campaign Message
4. Campaign Objective
5. Additional Info
6. Generation Instructions

The first four fields shape the actual campaign. The final two are better treated as optional advanced controls in the public experience.

### Generated output observed

The resulting board includes:

- an account-specific hero;
- sales and marketing alignment messaging;
- four Folloze value pillars;
- outcome-stat tiles;
- a market and AI complexity narrative;
- customer or proof cards;
- platform differentiators;
- FAQ and closing CTA sections;
- native component editing, reorder controls, anchor creation, and Add Section controls.

## Assessment of the current experience

### What works

- **Natural language first:** the user can start with intent instead of a blank form.
- **Structure becomes visible:** inferred fields are displayed and editable.
- **Early value:** Audience Hub demonstrates intelligence before the final page exists.
- **Contextual assistance:** suggestion chips reduce effort while showing relevance.
- **Minimum viable brief:** users can build without completing every optional field.
- **Durable output:** the result opens as a real editable draft.
- **Safe lifecycle boundary:** Preview and Publish are not conflated.

### What does not work well

- The seller, target, and promoted offer are easy to confuse.
- The target-audience label is broad and generic.
- Manual product browsing is not visibly attached to the campaign.
- Audience confidence percentages are not accompanied by sources or calibration.
- The generation screen hides all partial work and provides no ETA.
- The generated header unexpectedly shows `ModoMind`, indicating possible brand or template contamination.
- The hero contains an unresolved skeleton-like visual.
- Generic stock photography reduces account specificity.
- Outcome metrics such as `5x`, `+60%`, and `-35%` appear without visible sourcing.
- Customer and proof cards are inconsistent in identity and evidentiary quality.

These are not cosmetic defects. They point to missing provenance, dependency, validation, and lifecycle controls in the generated artifact pipeline.

## Likely backend architecture

The following is an informed model, not a confirmed description of Folloze internals.

1. **Session and identity layer**
   - Resolves the signed-in user and organization.
   - Creates or resumes a campaign session.
   - Persists every accepted answer and inferred field.

2. **Intent extraction layer**
   - Converts the initial request into seller, target, experience type, product, audience, and objective candidates.
   - Normalizes later answers into the structured campaign brief.

3. **Campaign brief store**
   - Maintains the six visible fields.
   - Likely records completion and edit state.
   - Should record provenance, confidence, citations, user overrides, and downstream dependencies in Try Me Now.

4. **Audience intelligence service**
   - Produces business priorities, operational challenges, and market or innovation focus.
   - Stores an audience profile that can be viewed independently and saved to the campaign.

5. **Messaging orchestrator**
   - Combines seller, target, offer, audience, objective, and optional direction into a messaging spine.
   - Selects the narrative, value pillars, CTA, and likely section family.

6. **Content and asset retrieval**
   - Searches an approved content library or customer-story catalog.
   - Ranks proof and imagery against the brief.
   - Should suppress anything that lacks a usable source or approved identity.

7. **Experience planner and compiler**
   - Produces a structured section/component tree.
   - Applies brand or theme tokens.
   - Compiles the result into the native Folloze designer schema.

8. **Generation job coordinator**
   - Tracks stage status and final board allocation.
   - May use polling, streaming, or a job queue.
   - The video does not prove that each visible loading label maps to a real worker.

9. **Board and publication lifecycle**
   - Creates a durable board record and ID.
   - Saves generated configuration as Draft.
   - Opens the native designer.
   - Keeps Preview and Publish as explicit later actions.

## Recommended target architecture for Try Me Now

### Canonical transformation

`CampaignBrief -> ExperienceSpec -> Preview Renderer + Folloze Renderer`

The website preview and Folloze board should not be separately generated products. Both should compile from one versioned `ExperienceSpec`.

### Suggested core objects

#### `CampaignDraft`

- session ID and anonymous editor token;
- seller brand and domain;
- target account and domain;
- promoted offer and source;
- use case;
- brief fields;
- audience profile ID;
- generation job ID;
- current experience revision;
- claim and expiration status.

#### `BriefField`

- key and normalized value;
- provenance: `user`, `inferred`, or `research`;
- confidence when meaningful;
- citations;
- `userEdited` and `locked` flags;
- required or optional status;
- list of dependent generation blocks.

#### `AudienceProfile`

- account identity;
- buyer roles;
- business priorities;
- operational challenges;
- innovation or market focus;
- citations and retrieval time;
- pin, exclude, and user-correction state.

#### `ExperienceSpec`

- version and source brief revision;
- message spine;
- brand tokens;
- ordered section/component tree;
- selected assets and proof;
- navigation model;
- CTA and destination;
- analytics instrumentation;
- citations and claim status for every generated block.

#### `GenerationJob`

- current stage and completed receipts;
- artifact revisions produced by each stage;
- attempts, timestamps, and timeouts;
- resumable job token;
- recoverable versus terminal error state;
- idempotency key.

#### `PublicationRecord`

- temporary preview URL and expiry;
- Folloze board ID and designer URL;
- draft-save state;
- publish request and result;
- anonymous public verification state;
- artifact revision and digest used for publication.

### Recommended pipeline

1. Create an expiring anonymous session.
2. Parse the initial sentence into a provisional CampaignDraft.
3. Immediately show the seller, target, and offer interpretation for correction.
4. Run seller-brand, target-account, audience, offer-source, and approved-content research in parallel.
5. Stream completed research receipts into the Live Brief and preview shell.
6. Ask only for the missing decision that materially changes the story.
7. Generate the message spine and ExperienceSpec.
8. Validate brand identity, citations, claims, links, component schema, accessibility, and unsupported metrics.
9. Render the temporary website preview from the approved ExperienceSpec.
10. On claim, persist the session and lead record.
11. On an explicitly authorized Folloze action, compile the same ExperienceSpec into a Folloze draft.
12. Keep publication and anonymous verification as separately reported operations.

## Prioritized product recommendations

### P0. Seller, target, and offer disambiguation

**Problem:** The video allows the user to conflate Cisco products with the Folloze offer being sold into Cisco.

**Recommendation:** Within seconds of the first sentence, show three separate editable values:

- Building as: Folloze
- Building for: Cisco
- Promoting: Folloze Platform

Use both seller and target logos when available. Never infer the target's product as the seller's offer without explicit confirmation.

**Acceptance criteria:**

- The three identities are separately represented in session state.
- Each value shows its provenance.
- Changing one value invalidates only dependent research and generated blocks.
- The final preview never displays an unrelated third-party brand.

### P0. Live Brief as a visible trust contract

**Problem:** AI decisions remain opaque unless the user opens or edits individual fields.

**Recommendation:** Upgrade the Live Brief so each field displays value, source, completion, and correction controls. Use labels such as `You said`, `We inferred`, and `Public research`.

**Acceptance criteria:**

- Every generation-driving field is visible before or during generation.
- Inferred and researched values are visually distinct from user-entered values.
- The visitor can correct a field without restarting the session.
- Field edits increment the brief revision and regenerate only affected outputs.

### P0. Evidence-backed Audience Lens

**Problem:** The Audience Hub is a strong aha moment, but confidence scores without citations can create false trust.

**Recommendation:** Produce a compact `What we learned about [account]` result after account research. Show three to five cited findings across priorities, challenges, and buyer concerns. Allow pin, exclude, and edit actions.

**Acceptance criteria:**

- Every finding has a public source or is labeled as a user hypothesis.
- No arbitrary confidence percentage is shown unless it is calibrated and explainable.
- Pin and exclude changes affect the generation fingerprint.
- The first useful audience artifact appears before the full page completes.

### P0. Claim and metric governance

**Problem:** The generated board displays unsupported-looking metrics and confident claims.

**Recommendation:** Treat claim validation as a generation blocker. A metric or customer claim must carry a source, be labeled as a planning assumption, or be removed.

**Acceptance criteria:**

- Unsupported numbers cannot appear in the generated experience.
- Customer logos and stories resolve to approved, verified identities.
- Every proof block records source URL, retrieval date, and claim text.
- Failed proof validation produces a safe mechanism-based fallback rather than invented evidence.

### P1. Campaign offer and source capture

**Problem:** The user manually browses Cisco pages, but the selected source is not visibly attached to the build.

**Recommendation:** Add offer discovery to the campaign path: search the seller's public product catalog, choose a detected offer, or paste a product URL. Show a source-understanding confirmation before final generation.

**Acceptance criteria:**

- Selected source title, domain, image, and extracted anchors are visible.
- The visitor can replace or remove the source.
- Source content controls messaging authority; seller brand controls design authority.
- The final ExperienceSpec records the selected source revision.

### P1. Canonical ExperienceSpec and dual renderers

**Problem:** A website-only HTML artifact can diverge from the eventual native Folloze board.

**Recommendation:** Generate one versioned ExperienceSpec and compile it into both the immediate web preview and native Folloze components.

**Acceptance criteria:**

- Preview and Folloze output share the same message spine, section order, assets, CTA, and citations.
- Renderer-specific differences are explicit and testable.
- Publication accepts only an approved ExperienceSpec revision and digest.
- A stale generation cannot overwrite a newer visitor-edited revision.

### P1. Section composer after reveal

**Problem:** Block editing alone does not demonstrate the composability visible in the native designer.

**Recommendation:** Add a curated `Add section` control after the first preview. Offer only supported section families such as proof, customer story, FAQ, resource carousel, assessment, calculator, or CTA.

**Acceptance criteria:**

- A section can be added, reordered, removed, regenerated, and locked.
- Adding a section does not require re-entering the brief.
- New sections inherit the active brand, evidence, analytics, and accessibility contract.
- Locked blocks survive later strategic rewrites and layout changes.

### P1. Native Folloze draft handoff

**Problem:** A convincing website preview still may feel like a disconnected mockup.

**Recommendation:** After the visitor claims the experience, offer `Continue editing in Folloze`. Create a draft from the approved ExperienceSpec and return a designer URL. Keep publication separate.

**Acceptance criteria:**

- The UI distinguishes temporary preview, saved Folloze draft, and public deployment.
- Draft creation is idempotent and cannot create duplicate boards on retry.
- The exact ExperienceSpec revision and digest are recorded with the board.
- Public completion is reported only after publish and anonymous readback succeed.

### P1. Truthful and recoverable generation stages

**Problem:** The Campaign Builder's full-screen loading loop hides partial value and may not reflect real work.

**Recommendation:** Stream real stage receipts and keep the partial preview visible.

Recommended stages:

1. Seller identity confirmed
2. Target account researched
3. Audience lens prepared
4. Offer source understood
5. Messaging spine created
6. Proof and assets selected
7. Claims validated
8. Preview rendered

**Acceptance criteria:**

- Every completed label corresponds to a persisted artifact or verified state transition.
- Reloading resumes the current job and already completed artifacts.
- A stage can be retried without repeating successful unrelated work.
- Errors name the failed stage and offer a corrective action.

### P2. Approved content and proof matching

**Problem:** The video appears to place customer stories and imagery automatically, but their relevance and provenance are inconsistent.

**Recommendation:** Add an approved-content matcher that ranks customer stories, assets, and product resources against the audience and objective. Show why each item was selected.

**Acceptance criteria:**

- Every selected asset has a verified source and usable identity.
- The visitor can replace, pin, or remove an asset.
- Duplicate or weakly related stories are suppressed.
- Asset selection is preserved through page regeneration.

## Recommended customer journey

### Target: first value within 10 seconds; complete preview within about 60 seconds

1. **Choose a path or enter one sentence.**
2. **Confirm the brand lock.** Show seller, target, and promoted offer.
3. **Continue answering while research runs.** Do not block the next question.
4. **Reveal the Audience Lens.** Show cited account priorities and buyer concerns.
5. **Ask for one outcome.** Offer context-aware suggestions.
6. **Enable Build.** Treat remaining direction as optional refinement.
7. **Render progressively.** Brand shell, hero, audience lens, story sections, proof, and CTA appear as completed.
8. **Reveal an editable experience.** Support edit, alternatives, lock, add section, and device preview.
9. **Prove analytics.** The first meaningful preview interaction creates a visible engagement receipt.
10. **Claim to keep it.** Email or authentication persists the workspace.
11. **Continue in Folloze.** Create a native draft only through the authorized handoff.
12. **Publish separately.** Report anonymous verification independently from draft creation.

## Failure and fallback contract

| Failure | Safe fallback | Visitor control |
| --- | --- | --- |
| Seller brand cannot be resolved | Neutral Folloze-safe theme with company name text | Correct domain or continue with default |
| Target research fails | Ask for one public URL or allow a user-entered hypothesis | Retry research or continue without claim |
| Offer is ambiguous | Show two or three detected seller offers | Select, paste URL, or use general platform |
| Audience evidence is weak | Show role-based hypotheses labeled as hypotheses | Edit or approve the assumptions |
| Approved proof cannot be found | Use product mechanism and capability explanation | Add a source or continue without customer proof |
| LLM output violates schema | Repair once, then render a deterministic safe template | Retry only the story stage |
| Asset fails to load | Remove the media component or use an approved fallback | Choose another verified asset |
| Generation exceeds target latency | Keep completed artifacts visible and return an expiring resume URL | Leave and resume later |
| Folloze draft creation fails | Preserve the complete website preview and claim record | Retry draft handoff |
| Publish or anonymous verification fails | Keep status as Draft or Publish pending | Retry publication; never claim the page is live |

## Relationship to the current UX v2 plan

### Already planned or in progress

- instant brand recognition;
- use-case micro-demos and seeded examples;
- explainable audience recommendations;
- evidence tray with pin and exclude controls;
- content-source confirmation;
- CTA and destination selection;
- progressive artifacts and truthful receipts;
- brief editing without restart;
- block editing, alternatives, and locks;
- strategic rewrites and layout variants;
- visual evidence selection;
- device exploration controls;
- analytics and personalization-quality receipts;
- claimed experience cockpit and revision history.

### Clip-derived additions or upgrades

1. Treat seller, target, and offer as separate first-class entities.
2. Add provenance and dependency state to every Live Brief field.
3. Make the Audience Lens a visible early artifact rather than only a recommendation list.
4. Extend source confirmation to campaign offers, not only Content Magic inputs.
5. Introduce a canonical ExperienceSpec with website and Folloze renderers.
6. Add curated section composition after reveal.
7. Make `Continue editing in Folloze` a formal claimed-experience handoff.
8. Preserve explicit temporary preview, Folloze draft, published page, and anonymous verification states.

## Suggested implementation sequence

### Work package 1: Brief correctness

- Add seller, target, and offer fields.
- Add provenance, citations, dependency metadata, and user override state.
- Implement partial invalidation when a field changes.

### Work package 2: Audience and source intelligence

- Build the evidence-backed Audience Lens.
- Add campaign offer discovery and source confirmation.
- Connect pin, exclude, and source choices to the generation fingerprint.

### Work package 3: Canonical experience model

- Define and version ExperienceSpec.
- Move website rendering behind the ExperienceSpec contract.
- Add schema, citation, claim, link, and brand validation.

### Work package 4: Prospect composition

- Add curated section insertion and reordering.
- Preserve locks and direct edits across regeneration.
- Extend revision history to section operations.

### Work package 5: Folloze handoff

- Compile ExperienceSpec into the constrained Folloze board contract.
- Add idempotent draft creation and designer URL return.
- Preserve explicit publication and anonymous verification steps.

### Work package 6: End-to-end QA

- Run all three experience paths.
- Exercise ambiguous seller/target/offer inputs.
- Test stale-generation protection, refresh/resume, stage retry, and expiration.
- Verify unsupported metrics and mismatched logos fail closed.
- Compare website preview and Folloze draft from the same ExperienceSpec revision.
- Verify public status only after anonymous readback.

## Launch acceptance checklist

- [ ] A visitor can start with one sentence and see the structured interpretation.
- [ ] Seller, target, and offer are distinct and individually editable.
- [ ] Every inferred or researched brief field shows provenance.
- [ ] The Audience Lens contains citations or labels assumptions honestly.
- [ ] A preview can be generated from the minimum viable brief.
- [ ] Progress receipts reflect real persisted artifacts.
- [ ] Unsupported claims, metrics, logos, and customer stories are blocked.
- [ ] The partial experience survives refresh and resumes safely.
- [ ] Edits regenerate only dependent blocks.
- [ ] Sections can be added, removed, reordered, regenerated, and locked.
- [ ] Website preview and Folloze draft compile from the same ExperienceSpec.
- [ ] Draft creation is idempotent.
- [ ] Preview, Folloze save, publish, and anonymous verification are separately reported.
- [ ] The first meaningful preview interaction produces an analytics receipt.
- [ ] Mobile, keyboard, reduced-motion, accessibility, and failure states pass QA.

## Open product decisions

1. Should claiming create a Folloze draft automatically, or should `Continue editing in Folloze` remain a second explicit action?
2. Does a visitor receive a temporary website preview before email, or an expiring Folloze-hosted preview?
3. Which audience-research sources are approved for the customer-facing experience?
4. Should confidence be hidden entirely, replaced by evidence quality, or shown only when calibrated?
5. Which native Folloze section types are safe for public self-service composition?
6. What is the approved content library for customer stories, images, metrics, and proof?
7. Who owns expiration and deletion of anonymous previews and unpublished boards?
8. What exact event marks the conversion from anonymous trial to routed GTM lead?

## Handoff recommendation

The build team should treat the current UX v2 plan as the implementation baseline and add the eight clip-derived deltas above. The first engineering priority should be the canonical CampaignDraft and ExperienceSpec contracts. Without those contracts, provenance, partial regeneration, native Folloze handoff, and trustworthy lifecycle reporting will remain difficult to implement consistently.

No implementation files were changed as part of this review. This document is advisory input for the active Try Me Now build.
