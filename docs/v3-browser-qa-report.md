# Try Me Now V3 browser QA report

Date: 2026-08-04
Branch: `codex/visual-v1`

## Outcome

The V3 guided shell, three-template renderer, brand pipeline, source flow, embedded scrolling, CTA preview, and engagement preview passed the final local QA gate.

## Automated gate

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: 50 files and 435 tests passed
- `npm run build`: passed with Turbopack
- `npm run build:webpack`: passed

## Browser scenarios

### Entry experience

- Desktop-first three-path entry rendered at 1440 × 1000.
- No console errors.
- Evidence: [V3 desktop entry](../output/playwright/v3-entry-desktop.png)

### 1:1 ABM: Folloze for NVIDIA

- Both Folloze and NVIDIA rendered as first-party image assets, not text substitutes.
- NVIDIA's hidden design-system SVG sprite was materialized into a standalone safe logo.
- Inner preview scrolled independently from 0 to 1,200 px; at its 3,764 px boundary, the next wheel moved the parent page from 0 to 480 px.
- Preview opened at the top and produced no console errors.
- Evidence: [Folloze for NVIDIA preview](../output/playwright/v3-abm-nvidia-preview.png)

### Campaign: Jitterbit

- Template family: `campaign-launch`
- Template fingerprint: `v3-campaign-routes-proof-thesis`
- Wireframe: `product-launch-landing-page`
- Official Jitterbit logo and semantic colors rendered: `#1B3E51`, `#F44414`, and `#FEFEFE`.
- Brand status consistently read “Identity and brand matched” and “Captured.”
- All four audience recommendations exposed one Jitterbit-specific supporting signal and a public Jitterbit source.
- Preview scrolled to its 3,954 px maximum and handed the next wheel to the parent page.
- Console errors, failed requests, and HTTP 4xx/5xx responses: zero.
- Evidence: [Jitterbit audience evidence](../output/playwright/v3-campaign-jitterbit-audience.png)

### Content: ServiceNow source companion

- Template family: `content-source`
- Template fingerprint: `v3-content-source-findings-paths`
- Wireframe: `content-resource-companion`
- Official ServiceNow identity and colors rendered.
- Source title resolved to `ServiceNow`; all four audiences had one ServiceNow-specific signal.
- Exactly two source-highlight cards rendered.
- Source template syntax such as `|date=`, `|publisher=`, `[[`, and `{{` was removed before drafting and is now rejected by the copy-quality gate.
- Preview scrolled from 0 to its 3,668 px maximum within a 4,441 px document and 773 px viewport.
- The visual CTA did not navigate; it emitted a `cta_click` event, received `202`, and increased the live engagement count to two interactions.
- Evidence: [content audience evidence](../output/playwright/v3-content-servicenow-audience.png), [clean content preview](../output/playwright/v3-content-servicenow-preview.png), [live engagement](../output/playwright/v3-content-live-analytics.png)

## PDF upload behavior

The local dev process did not have `BLOB_READ_WRITE_TOKEN`, so a real local Blob upload could not complete. The failure now:

- returns a deliberate `503` instead of an opaque server error;
- appears once as a plain-language inline message;
- uses the session support reference;
- clears when the visitor switches to Public URL;
- never copies the failed filename into the URL field.

The token/callback/status/finalization path remains covered by route tests. A real PDF upload still needs one environment-backed smoke test after a deployment with Vercel Blob configured.

Evidence: [friendly PDF-unavailable state](../output/playwright/v3-content-pdf-unavailable.png)

## Privacy and remaining verification

- The public session projection intentionally replaces the submitted source URL with `https://source-provided.invalid/`; the server retains the real URL for generation. This was verified by successful generation and projection tests.
- Full-screen controls remain present and covered by component/runtime tests. The campaign browser harness reset while activating browser fullscreen, so native fullscreen should receive a manual smoke check in the deployed environment.
- No Vercel production deployment was performed during this QA pass.
