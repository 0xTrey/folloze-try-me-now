# Folloze for NVIDIA 1:1 Experience Research

## Board Identity

- Save intent: local preview only. No Folloze board has been created or updated.
- Working title: `Folloze for NVIDIA | Make Every Launch Account-Specific`.
- Vendor: Folloze.
- Target account: NVIDIA Corporation.
- Motion: buyer-facing one-to-one ABM executive workbench.
- Local source: `public/examples/folloze-for-nvidia-1to1.html`.
- Folloze theme: pending explicit yes/no authorization before any MCP save. Because Folloze owns the experience, the recommended save mode is to use the Folloze company theme unless the local design conflicts with the current returned theme.
- Board ID, designer URL, public Folloze URL, and tracker row: not created.

## Holistic Buyer Goal

Help NVIDIA enterprise, field, partner, and revenue-marketing leaders see how one governed Folloze system can turn launch content into account-specific experiences, reveal buying-group engagement, and give the field a clear next move.

## Message Spine

- Target-account context: NVIDIA publicly serves developers, partners, enterprises, startups, researchers, and industry teams across AI, accelerated computing, cloud, robotics, automotive, and other markets. Its public ecosystem includes product, program, partner, event, and technical-content paths.
- Buyer priority: keep a global story consistent while making every priority account, partner route, industry, and buying role feel specifically addressed.
- Why change: one generic campaign destination flattens distinct infrastructure, AI-platform, security, operations, partner, and executive questions. The field then has less useful first-party evidence for follow-up.
- Why now: NVIDIA's 2026 public launch cycle spans AI factories, agentic AI, physical AI, enterprise software, cloud partners, programs, and GTC content. Every launch creates more account-specific education and follow-up paths to manage.
- Vendor promise: Folloze turns AI-created or team-created content into live, governed account experiences, activates those experiences across campaign and sales motions, and captures the first-party engagement signals that guide the next move.
- Proof boundary: no claim that NVIDIA uses Folloze. No private NVIDIA or Folloze data. Account claims come from public NVIDIA pages; Folloze claims come from the current Folloze Brand Kit and public site.
- Buying committee: enterprise marketing, field marketing, partner marketing, product marketing, revenue operations, digital/web, and sales leadership.
- Next action: run a focused account-experience sprint around one NVIDIA launch, one priority account list, three buying-role paths, and one field handoff.

## Experience Shape

- Shape: Split Studio with an interactive narrative workbench.
- Why it fits: the page must connect campaign creation and governance on one side with live role-level experience and signal behavior on the other.
- First viewport: Folloze and NVIDIA marks, a sharp account-specific thesis, and a live visual showing launch content becoming three buying-role paths.
- Section order: hero, account-entry selector, Build/Activate/Signal operating path, field handoff and signal console, focused sprint CTA.
- Navigation: shell-safe scroll buttons with buyer-action labels. No raw hash anchors.
- CTA pattern: one primary request-demo destination plus in-page workbench controls.

## Message-Fit Matrix

| Public account signal | Source | Folloze value | Buyer-facing claim | Placement |
| --- | --- | --- | --- | --- |
| NVIDIA publicly addresses multiple industries, product families, and technical audiences. | https://www.nvidia.com/en-us/ | Personalized account experiences | One global story should open through the account's actual priority. | Hero and account selector |
| NVIDIA Programs serves developers, partners, startups, ISVs, students, and researchers. | https://www.nvidia.com/en-us/programs/ | Personalization and governed reuse | Reuse one governed campaign system without sending every audience through the same path. | Role paths |
| NVIDIA Cloud Partners are part of a global ecosystem delivering production AI infrastructure. | https://www.nvidia.com/en-us/data-center/gpu-cloud-computing/partners/ | Partner and field activation | Keep partner proof, NVIDIA messaging, and field follow-up connected around the account. | Activate section |
| GTC 2026 publicly spans enterprise, agentic, physical, and industry AI announcements. | https://nvidianews.nvidia.com/online-press-kit/gtc-2026-news | Campaign speed and content activation | Turn a launch cycle into account-specific experiences without rebuilding every destination. | Build section |
| NVIDIA public pages contain distinct enterprise AI, cloud, industry, program, and event paths. | https://www.nvidia.com/en-us/industries/ | First-party engagement signal | See which business question the account explored and route the next move accordingly. | Signal console |

## Source Design DNA

- Folloze system: Instrument Sans display type, Inter body, white and soft-gray canvases, navy foundations, violet actions, 24px cards, pill controls, thin borders, and restrained dark proof bands.
- NVIDIA account accent: black, white, and `#76B900`; square-edged utility cues and a precise technical rhythm. NVIDIA green is used as an account signal, not as the page's primary brand.
- Visual direction: premium control room rather than generic SaaS landing page. Wide editorial headlines, a live account-path visual, high-contrast signal console, real co-brand marks, and no stock imagery.
- Folloze harvest: `research/brand-harvest/folloze-home/`.
- NVIDIA harvest: `research/brand-harvest/nvidia-home-2026-07-31/`.
- NVIDIA logo source: official NVIDIA Newsroom/logo guidelines. External publication may require NVIDIA approval; keep this as an internal sales example until usage is cleared.

## Launch Gates

- Copy must not say demo, template, generated, scorecard, or evaluation hub.
- Every headline must advance the NVIDIA-specific argument.
- Every visible button must scroll, change state, open a useful panel, or link to a live source.
- External links must use `target="_blank" rel="noopener"` and direct `flzAnalytic('cta_click', ...)` wiring.
- Local QA must cover 1440px, 390px, and 320px with no horizontal overflow, no broken marks, and no console errors.
- Folloze save remains blocked until theme mode is explicitly authorized and the current MCP creation guide is read.

## Current State

- Research: complete for the local example. Public account claims are mapped to the source matrix above.
- Local HTML: complete at `public/examples/folloze-for-nvidia-1to1.html`.
- Local QA: passed on 2026-07-31.
  - Desktop visual review: 1440 x 1000.
  - Responsive visual review: 390 x 844 and 320 x 800.
  - Horizontal overflow: none at 390px or 320px.
  - Broken images: none.
  - Console errors after reload: none.
  - Interaction checks: account-path tabs, role-signal selector, sprint dialog, and navigation scrolling all passed.
  - Analytics fallback: in-page navigation emitted `anchor_click` into `window.__follozeExampleEvents`; external CTAs have direct `cta_click` wiring.
  - External destinations: all five bounded link checks returned HTTP 200.
  - Repository gate: `npm run qa` passed (lint, TypeScript, 324 unit tests, Turbopack build, and webpack build).
  - Existing end-to-end suite: 24 passed and 2 intentionally skipped.
  - Evidence: `output/playwright/folloze-nvidia-1to1-desktop.png`, `output/playwright/folloze-nvidia-1to1-mobile390.png`, and `output/playwright/folloze-nvidia-1to1-mobile320.png`.
- Folloze save: not requested.
- Public Folloze deployment: pending.
- Tracker: not applicable until a first Folloze create.
