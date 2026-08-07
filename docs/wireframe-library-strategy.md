# Try Me Now Wireframe Library

## Review surface and implementation

- Open the local visual catalog at `http://127.0.0.1:3000/wireframes/` while the app is running.
- The backend source of truth is `src/lib/generation/wireframe-library.ts`; it registers all 17 archetypes and returns an explainable, locked selection receipt.
- The generated `ExperienceSpec` stores that receipt, and the renderer maps it to one of the six composition grammars while preserving the shared BrandDesignDNA, analytics, accessibility, save, and expiration behavior.
- The visual catalog is an internal review surface only. Prospects never choose from the full library before generation.
- The catalog's **Keep** and **Needs edits** states are stored locally in the reviewer browser so the team can work through the library without affecting generated experiences.

## Product anchor

The system should make one moment memorable:

> I gave Folloze a few signals and, about a minute later, it produced something that looks like our brand and feels ready for a buyer.

The visitor should not browse a large template marketplace before seeing value. Folloze should select the strongest compatible wireframe, explain the choice in the Live Brief, and let the visitor try at most two alternatives after the first preview.

## Core decision

Build a catalog of named wireframe archetypes, but do not build a separate renderer or CSS fork for every archetype.

The library has three layers:

1. **Experience family** controls the persuasion or exploration contract: account, campaign, or content.
2. **Archetype** controls the buyer job, section emphasis, evidence policy, and closing action.
3. **Composition grammar** controls the spatial arrangement: split editorial, evidence-led, interactive paths, workflow spine, data story, or chapter journey.

Every result still uses the same hardened primitives, `ExperienceSpec`, analytics hooks, accessibility behavior, save lifecycle, and `BrandDesignDNA` skin.

## Shared page shell

Every generated experience uses the same outer shell:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Seller logo   [for Target logo]       Section navigation       CTA │
├──────────────────────────────────────────────────────────────────────┤
│ 01 Opening                                                         │
│    One audience, one promise, one action, one relevant visual      │
├──────────────────────────────────────────────────────────────────────┤
│ 02–06 Family-specific story and interaction modules                │
├──────────────────────────────────────────────────────────────────────┤
│ 07 First useful move                                               │
│    Scope + activity + deliverable + resulting decision + CTA       │
├──────────────────────────────────────────────────────────────────────┤
│ Source/provenance • Folloze analytics • accessibility • footer     │
└──────────────────────────────────────────────────────────────────────┘
```

The preview product surrounds this page with the temporary URL, expiration state, save-by-email action, quality receipt, and engagement instrumentation. Those controls do not become part of the buyer-facing page.

## Six composition grammars

These are the reusable spatial systems underneath every archetype.

### G1. Editorial split

- Type-led opening on the left; verified product, account, or source visual on the right.
- Alternates between full-width argument sections and balanced two-column sections.
- Best for executive narratives, product launches, and guides.

### G2. Evidence lead

- Opens with a supported result, verified fact, or source finding.
- Uses proof strips, before/after comparisons, and evidence annotations.
- Best for customer proof, account business cases, and research reports.

### G3. Interactive paths

- Opens with one shared promise, then gives the visitor three useful ways into the story.
- Keeps one path active while preserving the larger narrative around it.
- Best for buying teams, demand campaigns, and content guides.

### G4. Workflow spine

- Uses a strong vertical or horizontal progression from current state to outcome.
- Every step contains action, capability, output, and evidence.
- Best for technical evaluation, use-case campaigns, and technical documents.

### G5. Data story

- Builds around a finding, cited chart, benchmark, or diagnostic result.
- Uses restrained data visualization and explanatory copy, not decorative dashboards.
- Best for reports, research, assessments, and quantified proof.

### G6. Chapter journey

- Organizes a time-based or agenda-based experience into chapters.
- Supports clips, speakers, takeaways, resources, and a clear continuation action.
- Best for webinars, events, and nurture experiences.

## Account experience library

Account pages use the seven-section persuasion contract. Replacing the target company with an unrelated company must break the story.

### A1. Executive account narrative

**Default when:** the account opportunity is strategic or cross-functional and no stronger specialist signal exists.

**Composition:** G1 Editorial split.

**Section sequence:**

1. Opportunity for `{target account}`
2. The strongest reason to believe
3. Why this matters now
4. Three priorities worth exploring
5. How the outcome is created
6. What each team needs
7. Map the first useful move

**CTA:** a working session with a named deliverable.

### A2. Technical evaluation

**Default when:** the audience includes architecture, security, data, infrastructure, IT, or platform leadership.

**Composition:** G4 Workflow spine.

**Section sequence:**

1. Technical outcome for `{target account}`
2. Verified platform or architecture anchor
3. Constraints the team must resolve
4. Three validation tracks
5. Architecture or workflow sequence
6. Requirements, risks, and evidence by owner
7. Scope a technical validation session

**CTA:** architecture review, technical workshop, or bounded pilot definition.

### A3. Proof-led business case

**Default when:** approved customer evidence, quantified outcomes, or strong first-party proof exists.

**Composition:** G2 Evidence lead.

**Section sequence:**

1. Supported result and its relevance to `{target account}`
2. What changed for the reference customer or use case
3. Why the status quo remains expensive or risky
4. Three implications for the target account
5. Mechanism behind the result
6. Evidence the target team should validate
7. Build the account-specific business case

**CTA:** business-case workshop or proof review with a concrete output.

### A4. Buying-team alignment

**Default when:** three or more distinct roles influence the decision or the objective is to educate the buying group.

**Composition:** G3 Interactive paths.

**Section sequence:**

1. One shared outcome for `{target account}`
2. Common reason to believe
3. Why alignment matters now
4. Choose a role or priority
5. Shared operating mechanism
6. Decision, risk, benefit, and evidence by role
7. Align on the first decision

**CTA:** multi-role working session with an alignment map.

### A5. Innovation workshop

**Default when:** the initiative is emerging, discovery-led, or framed around a new capability rather than a fixed purchase.

**Composition:** G1 Editorial split with G3 path module.

**Section sequence:**

1. Opportunity worth exploring
2. Evidence that the opportunity is real
3. Why the window matters
4. Three hypotheses to test
5. What the teams would map together
6. Workshop inputs and outputs
7. Run the innovation workshop

**CTA:** a workshop whose deliverable and decision are explicit.

## Campaign experience library

Campaign pages use the same seven buyer jobs as account pages, but the offer and audience replace the named-account thesis.

### C1. Product introduction

**Default when:** the visitor supplies a product page, product document, or explicit product description.

**Composition:** G1 Editorial split.

**Section sequence:**

1. Product promise for the selected audience
2. Strongest supported reason to believe
3. The operating change behind the launch
4. Three use cases or starting points
5. How the product creates the outcome
6. Value and evidence by role
7. Choose the first use case

**CTA:** explore a use case, request a demonstration, or plan an evaluation.

### C2. Demand and category education

**Default when:** the objective is awareness, education, or demand creation and the offer is broader than one product.

**Composition:** G3 Interactive paths.

**Section sequence:**

1. The problem worth understanding
2. What credible evidence says
3. Why the old approach persists
4. Choose the problem closest to you
5. A better operating model
6. What changes for each team
7. Continue with one useful action

**CTA:** explore, assess, or discuss the selected problem.

### C3. Use-case solution campaign

**Default when:** the input names a specific buyer job, workflow, or operational outcome.

**Composition:** G4 Workflow spine.

**Section sequence:**

1. One buyer job and one promised outcome
2. Capability that makes the outcome credible
3. Where the current workflow breaks
4. Three ways into the use case
5. Action, capability, and output sequence
6. Ownership and evidence by role
7. Scope the first workflow

**CTA:** map, validate, or pilot the workflow.

### C4. Event or webinar

**Default when:** the input includes event details, a registration objective, or a webinar source.

**Composition:** G6 Chapter journey.

**Section sequence:**

1. Why this session is worth the time
2. Speaker, source, or topic credibility
3. Why the topic matters now
4. Three reasons to attend or keep exploring
5. Agenda, chapters, or takeaways
6. Who should join and what they will leave with
7. Register or continue the conversation

**CTA:** register, watch, or continue with one topic.

### C5. Customer proof campaign

**Default when:** an approved customer story or quantified outcome is the primary source.

**Composition:** G2 Evidence lead.

**Section sequence:**

1. Approved outcome
2. Customer or source credibility
3. Before and after
4. Three lessons for the audience
5. Mechanism behind the result
6. What another team should validate
7. Explore a similar path

**CTA:** review the evidence, explore the use case, or plan a proof session.

### C6. Launch follow-up and nurture

**Default when:** the objective is follow-up, continued engagement, or resource discovery after a launch or event.

**Composition:** G6 Chapter journey with G3 path module.

**Section sequence:**

1. What changed or what to remember
2. Strongest supporting fact
3. Why it matters after the announcement
4. Choose an interest path
5. Resources arranged as a guided sequence
6. Questions to bring to the next conversation
7. Take the next useful action

**CTA:** open a resource, compare paths, or schedule follow-up.

## Content experience library

Content experiences do not use the account/campaign persuasion framework. They preserve the source argument, cite the source, and turn passive reading into exploration or application.

Every content wireframe must keep the original asset accessible and visibly distinguish source fact, source interpretation, and visitor input.

### M1. Executive report

**Default when:** the source is a report, white paper, executive brief, or long-form PDF without benchmark data as its main value.

**Composition:** G1 Editorial split.

**Section sequence:**

1. Source identity and the central takeaway
2. Executive summary in three points
3. The argument behind the takeaway
4. Choose a finding to explore
5. Evidence and cited excerpts
6. What the findings may mean for your team
7. Read the source or continue the conversation

### M2. Playbook and guide

**Default when:** the source teaches a process, framework, checklist, or set of practices.

**Composition:** G3 Interactive paths.

**Section sequence:**

1. What the guide helps the reader do
2. The core principle
3. Choose a chapter or job
4. Guided steps from the source
5. Examples, checklists, or supporting excerpts
6. Apply the guide to one situation
7. Keep the original guide or use the framework

### M3. Research and benchmark explorer

**Default when:** the source contains primary research, survey data, benchmarks, or several cited findings.

**Composition:** G5 Data story.

**Section sequence:**

1. The most important cited finding
2. Research scope and credibility
3. Three findings worth exploring
4. Interactive benchmark or finding explorer
5. What the evidence supports and does not support
6. Locate your own situation without inventing a score
7. Read the methodology or discuss the implication

### M4. Technical document walkthrough

**Default when:** the source is a product brief, architecture guide, technical paper, implementation guide, or reference document.

**Composition:** G4 Workflow spine.

**Section sequence:**

1. System outcome described by the source
2. Architecture or component overview
3. Constraints and prerequisites
4. Choose a technical path
5. Workflow, architecture, or implementation sequence
6. Validation checklist with cited source references
7. Open the source or scope a technical review

### M5. Webinar and video companion

**Default when:** the source is a webinar, presentation recording, transcript, or chaptered video.

**Composition:** G6 Chapter journey.

**Section sequence:**

1. Topic, speaker, and central idea
2. Why the speaker or source is credible
3. Key takeaways
4. Chapter or clip navigator
5. Supporting resources and cited moments
6. Questions worth carrying forward
7. Watch the full source or continue with one topic

### M6. Assessment workbench

**Default when:** the objective is evaluation, qualification, self-assessment, or applying a source framework.

**Composition:** G5 Data story with G3 path module.

**Section sequence:**

1. Framework or decision the source helps evaluate
2. Source-backed dimensions
3. Guided diagnostic questions
4. Transparent result or maturity pattern
5. Gaps, implications, and cited recommendations
6. Suggested next actions with no invented certainty
7. Save the result or apply it in a working session

## Deterministic selection rules

The LLM writes within a selected wireframe; it does not silently invent or select the page structure.

### Account selection

1. Technical audience or technical objective → A2.
2. Approved quantified proof as the strongest evidence → A3.
3. Three or more distinct decision roles or buying-group education → A4.
4. Workshop, discovery, or emerging-initiative objective → A5.
5. Otherwise → A1.

### Campaign selection

1. Event details or registration objective → C4.
2. Approved customer story as primary source → C5.
3. Follow-up, nurture, or post-launch objective → C6.
4. Specific workflow or use case → C3.
5. Product URL, document, or product description → C1.
6. Otherwise → C2.

### Content selection

1. Transcript, recording, webinar, or video → M5.
2. Assessment or qualification objective → M6.
3. Primary research, benchmark, survey, or data-heavy report → M3.
4. Architecture, product, technical, or implementation document → M4.
5. Playbook, guide, checklist, or framework → M2.
6. Otherwise → M1.

The Live Brief should display a plain-language receipt such as:

> Using a technical evaluation layout because the audience is platform architects and the supplied source contains an architecture workflow.

After preview, “Try another layout” may show the two next-best compatible archetypes. It must not show incompatible structures or reset the user’s locked copy and assets.

## What BrandDesignDNA is allowed to change

Brand evidence changes the presentation system, not the buyer story:

- color roles and surface strategy;
- display and body typography;
- button geometry and interaction styling;
- card geometry, borders, and shadows;
- content width, section spacing, and grid gaps;
- source-faithful motifs;
- logo and verified source imagery treatment.

Brand evidence cannot reorder the story, select an archetype, invent proof, or choose a CTA objective.

## Module registry

Each archetype composes from a bounded module registry:

- `OpeningPromise`
- `CredibilityAnchor`
- `WhyNowSequence`
- `ThreeStartingPoints`
- `MechanismSteps`
- `RoleValueGrid`
- `EvidenceStrip`
- `SourceSummary`
- `FindingExplorer`
- `ChapterNavigator`
- `AssessmentWorkbench`
- `FirstUsefulMove`

Modules accept structured content and brand tokens. They do not accept arbitrary HTML or per-company CSS.

## ExperienceSpec contract

Add a versioned wireframe selection receipt instead of growing one large `wireframeName` enum forever:

```ts
interface WireframeSelectionV1 {
  version: 1;
  family: "account" | "campaign" | "content";
  archetypeId:
    | "account-executive"
    | "account-technical"
    | "account-proof"
    | "account-team"
    | "account-workshop"
    | "campaign-product"
    | "campaign-demand"
    | "campaign-use-case"
    | "campaign-event"
    | "campaign-proof"
    | "campaign-nurture"
    | "content-report"
    | "content-guide"
    | "content-research"
    | "content-technical"
    | "content-webinar"
    | "content-assessment";
  compositionId:
    | "editorial-split"
    | "evidence-lead"
    | "interactive-paths"
    | "workflow-spine"
    | "data-story"
    | "chapter-journey";
  reasonCode: string;
  alternativeIds: string[];
  selectedBy: "system" | "visitor";
  locked: boolean;
}
```

The current wireframe fields remain readable for saved-session compatibility. New generations use this receipt as the canonical selection record.

## Buyer-facing language cleanup

New page navigation and section labels should use plain language. Remove these labels from generated experiences:

- Account thesis
- Decision path or decision lens
- Supporting proof
- Narrative arc
- Stakeholder map
- Buying committee

Recommended shared navigation:

- Overview
- Why it matters
- Where to start
- How it works
- For your team
- Evidence
- Next step

Content navigation changes by source type but stays equally plain: Key finding, Explore, Chapters, Apply it, Source, Next step.

## Initial implementation sequence

Do not build all 17 archetypes at once.

### Phase 0: contract cleanup

- Add `WireframeSelectionV1` to `ExperienceSpec`.
- Replace buyer-facing legacy jargon in the current account composition.
- Keep legacy names parseable for saved sessions.
- Add selection receipts to the Live Brief and trace stream.

### Phase 1: nine production archetypes

- Account: A1 Executive, A2 Technical, A4 Buying-team alignment.
- Campaign: C1 Product, C2 Demand, C4 Event.
- Content: M1 Executive report, M2 Guide, M6 Assessment.

These nine cover the most common inputs while exercising all six composition grammars except the specialist proof variants.

### Phase 2: evidence and specialist variants

- Account: A3 Proof-led, A5 Workshop.
- Campaign: C3 Use case, C5 Customer proof, C6 Nurture.
- Content: M3 Research, M4 Technical, M5 Webinar.

### Phase 3: preview choice and optimization

- Show two compatible alternatives after the first preview.
- Preserve locked content and assets when switching.
- Track archetype selection, alternative views, completion, engagement, save, and CTA intent.
- Use PostHog and session traces to compare time-to-preview, completion, depth, save rate, and CTA intent by archetype.

## QA contract

Every archetype must pass the same gates:

- exact module order and valid selection receipt;
- desktop scroll, embedded preview handoff, and full-screen behavior;
- harvested brand-token application with computed-style evidence;
- accessible headings, controls, tabs, and focus order;
- no unsupported proof, fake metrics, empty media, or broken imagery;
- no buyer-facing internal marketing jargon;
- every interactive primitive emits a bounded analytics event;
- deterministic regeneration from the same `ExperienceSpec`;
- locked copy and assets survive layout switching;
- anonymous preview, expiration, claim, save, and publication boundaries;
- screenshot evidence across unrelated brands and source types.

## Recommendation

Adopt the full 17-archetype catalog as the product model, but implement it through six composition grammars and a shared module registry. Build the nine Phase 1 archetypes first. This gives prospects visible variety while keeping rendering, QA, analytics, accessibility, and brand fidelity inside one maintainable system.
