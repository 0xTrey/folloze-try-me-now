# Generic Campaign Builder Production Engine

Status: approved for Cursor implementation
Owner: Trey Harnden
Implementation manager: Cursor Ultra
Architecture, product judgment, grading, and release authority: Codex
Prepared: 2026-08-22
Branch: `codex/unified-microsite-builder`
Starting SHA: `5913367`

## Outcome

Make the current generic builder reliably produce one polished, brand-native desktop campaign landing page in under 60 seconds from a seller domain plus a few guided signals.

Supported motions:

- ABM campaign;
- product page;
- solution page;
- industry page;
- event or webinar promotion as a campaign subtype.

Content Magic remains a separate route. Personalization variants remain an optional part-two experience after the base page is ready.

This is a production-engine improvement inside the existing unified builder. It is not a rewrite, template marketplace, Folloze publishing project, or new hosting architecture.

## North-star test

> I supplied a few signals. Folloze produced a buyer-ready, on-brand experience that looks researched, written, and art-directed for this company.

The output fails this test if the logo is missing, the palette is wrong, the copy could fit any vendor, the layout looks like a starter template, the page contains placeholders, or the visitor waits more than 60 seconds without a useful preview.

## Read first

1. [`execution-contract.md`](./execution-contract.md)
2. [`agent-contracts.md`](./agent-contracts.md)
3. [`acceptance-matrix.md`](./acceptance-matrix.md)
4. [`grading-scorecard.md`](./grading-scorecard.md)
5. [`cursor-prompt.md`](./cursor-prompt.md)
6. Existing sources listed in the execution contract.

## Non-negotiable architecture

- Reuse the current session, revision, trace, render, claim, security, and analytics boundaries.
- Preserve `ExperienceSpecV2` as the only canonical generated-page contract.
- Preserve deterministic, internal composition selection. Never expose templates to the prospect.
- Start research from a stable registrable domain before confirmation.
- Run bounded research, strategy, brand, copy, and composition work in parallel.
- Exchange typed artifacts with evidence, confidence, revision, and deadlines. Agents do not pass prose instructions to one another.
- Render the strongest honest artifact available. Visual weakness may trigger one repair; it may never create a blank page.
- Keep the app-hosted HTML preview as the output. Do not publish to Folloze.
- Do not push, deploy, rotate credentials, change Vercel, or read secret values.

## Delivery waves

```text
DOMAIN STABLE
     |
     +--> WAVE 1: evidence workers (parallel, deadline-bounded)
     |      identity | Brandfetch | DOM/CSS | screenshot | company | offer | audience | CTA
     |
     +--> WAVE 2: reconcile and select
     |      evidence reconciler | framework ranker | wireframe ranker | brand compiler
     |
     +--> WAVE 3: produce
     |      message spine | section writers | copy/factuality editor
     |
     +--> WAVE 4: compile, render, repair, trace
            ExperienceSpecV2 | renderer | fail-soft QA | reveal
```

Workers may overlap when prerequisites exist. The coordinator does not wait for every worker. Late results may patch only the current revision.

## Completion definition

Cursor is ready to hand back when:

- every G01-G46 acceptance item is met or named as unverified;
- brand, copy, composition, timing, fallback, and stale-revision fixtures pass;
- three recommendation chips plus free-form input work for audience/account, offer/topic, and objective;
- an evidence-backed provisional preview appears within the contracted budget and final work stops at 60 seconds;
- `npm run benchmark:preview`, `npm run qa`, and desktop E2E pass;
- a local desktop preview and screenshot evidence are ready for Trey;
- all changes are committed locally with a clean worktree;
- `cursor-handback.md` ends with `READY_FOR_TREY_REVIEW`;
- nothing is pushed or deployed.

Codex will inspect the handback and open the local build. Trey reviews first. Codex grades only after Trey says his review is complete.
