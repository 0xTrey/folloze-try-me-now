# Unified Try Me Now Builder: Cursor Execution Package

Status: approved for implementation
Owner: Trey Harnden
Execution manager: Cursor Agent
Architecture and release authority: Codex
Prepared: 2026-08-22
Branch: `codex/unified-microsite-builder`
Base: production commit `1e22931f357a5955e3f7ec24e412405b439cf1aa`

## Outcome

Turn the current route-first, form-like intake into one guided Folloze conversation that produces a buyer-ready, brand-native microsite within the existing 60-second preview contract.

The visitor should feel that they supplied a few signals and Folloze assembled a disciplined production team behind the scenes. The system must keep the working generation, session, rendering, claim, analytics, and security architecture. This is a focused product improvement, not a rebuild.

## Current product decision

The prospect sees one dominant front door: **Build a buyer experience**.

The conversation resolves the internal output family:

- account-specific ABM microsite;
- campaign, industry, product, event, or webinar landing page;
- Content Magic, available as a secondary route and not deleted.

The visitor never chooses among wireframes, recipes, or workflow profiles. The backend selects a reviewed composition from verified inputs.

## Explicit video feedback being implemented

- `00:01-00:10`: remove the lower Worked Example / Watch Me Build rail.
- `00:10-00:15`: make Start over larger and easier to find.
- `00:15-00:41`: remove the Aprio, ServiceNow, and Cisco entry-page example links; use the stronger Northpeak examples.
- `01:40-02:16`: stop revealing results and overlays before the visitor finishes the material brief.
- `01:56-02:16`: simplify dense post-build panels and make valuable account-depth evidence larger.
- `02:42-03:31`: fix brand fidelity beyond a color swatch. ServiceTitan missed blue, geometry, button radius, and page character.
- `03:31-04:12`: perform the production-quality research and selection work before reveal; do not expose vague Quality pass / Refining theater.
- `04:13-04:39`: begin brand and company research as soon as a valid domain stabilizes, before explicit confirmation.
- `04:39-05:21`: make seller, audience or target, offer, and objective visible and editable in a simple sequence.
- `05:48-06:22`: do not auto-build as soon as one account suggestion is selected.
- `08:14-10:24`: provide generic, account, account plus industry, and account plus industry plus persona preview states.
- `08:38-10:42`: merge the prospect-facing ABM and campaign intake into one microsite builder; infer the internal experience type.
- `10:28-10:35`: move Content Magic out of the primary first-run path without deleting its route or renderer.

## Precedence and conflict decisions

1. Trey's approved video decisions control the first-run interface.
2. `docs/architecture.md` controls security, session ownership, claim boundaries, and public runtime behavior.
3. `docs/try-me-now-60-second-performance-contract.md` controls timing and fallback behavior.
4. `ExperienceSpecV2`, route-specific renderers, and the existing template registry remain canonical.
5. `docs/generated-experience-visual-direction.md` controls brand authority and fail-soft visual quality.
6. `docs/observability-and-qa.md` controls trace redaction and verification.
7. Content Magic remains a distinct backend family even though it is secondary on the entry page.
8. Personalization states are preview variants, not user-selected templates.
9. A provisional preview appears only after the material brief is generation-eligible. Once eligible, the deterministic provisional target remains 15 seconds and the final target remains 60 seconds.
10. Visual quality may trigger one bounded repair. It may never create a blank screen or permanent spinner.

## Required source reading

Read these before editing:

- `docs/architecture.md`
- `docs/try-me-now-60-second-performance-contract.md`
- `docs/v3-experience-template-system.md`
- `docs/wireframe-library-strategy.md`
- `docs/generated-experience-visual-direction.md`
- `docs/observability-and-qa.md`
- `docs/tyler-feedback-implementation-2026-08-13.md`
- `docs/ux-v2-build-plan.md`
- `docs/cursor-handoffs/2026-08-22-unified-builder/workstreams.md`
- `docs/cursor-handoffs/2026-08-22-unified-builder/acceptance-matrix.md`

Also read the V2 product contract without copying it into the branch:

```bash
git show origin/codex/try-me-now-v2-handoff:docs/try-me-now-v2-folloze-chat-handoff.md
```

## Architecture invariants

- Preserve `ExperienceSpecV2` as the canonical compilation target.
- Preserve readable V1 sessions and compatibility projections.
- Preserve session revision fencing and stale-worker protection.
- Preserve separate ABM, campaign/event, and Content Magic contracts internally.
- Preserve deterministic composition selection; no prospect-facing template marketplace.
- Preserve functional CTA and content-item contracts.
- Preserve temporary anonymous previews and business-email claim semantics.
- Preserve app-hosted HTML as the only public runtime output.
- Keep Folloze writes and Folloze publishing disabled.
- Do not reopen Cloudflare migration work.
- Do not log raw prompts, domains, URLs, emails, source bodies, generated HTML, or secrets in ordinary analytics.
- Do not add synchronous layout generation or provider work that breaks the 60-second contract.

## Delivery sequence

### Wave 1: foundations in parallel

- research orchestration;
- brand fidelity;
- message and composition selection;
- telemetry and receipts.

### Wave 2: integrated prospect experience

- unified conversational intake;
- personalization preview states;
- preview reveal, save, and modal lifecycle.

### Wave 3: adversarial integration and QA

- contract tests;
- desktop end-to-end tests;
- performance benchmark;
- visual and trace review;
- full `npm run qa`.

The implementation manager owns integration conflicts. Subagents do not broaden scope, push branches, deploy, modify Vercel settings, rotate credentials, or publish to Folloze.

## Completion definition

Implementation is ready for Codex review when:

- the acceptance matrix is supported by tests or explicit evidence;
- `npm run benchmark:preview` passes;
- `npm run qa` passes;
- desktop Playwright covers the unified happy paths and failure fallback;
- no secrets or user-local state are staged;
- changes are committed locally on `codex/unified-microsite-builder`;
- nothing has been pushed or deployed by Cursor.
