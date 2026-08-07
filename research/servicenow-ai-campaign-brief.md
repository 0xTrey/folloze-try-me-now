# ServiceNow AI Platform campaign brief

Status: local campaign example for the Folloze Try Me Now entry page.

## Campaign mode

- Motion: one-to-many product campaign.
- Audience: enterprise AI, platform, IT, operations, risk, and transformation leaders.
- Buyer job: understand how ServiceNow connects AI to enterprise data, workflows, actions, and governance.
- Promise: move AI from recommendations to governed action on one enterprise platform.
- Primary CTA: `Schedule a demo` at `https://www.servicenow.com/contact-us.html`.
- Secondary resource: `Get the AI Platform Blueprint` at `https://www.servicenow.com/standard/other-documents/blueprint-for-agentic-business.html`.
- Selected experience shape: narrative workflow plus product workbench.

## Public source contract

- [ServiceNow AI Platform](https://www.servicenow.com/platform.html)
  - Unifies AI, data, workflows, and security on a single platform.
  - Frames the architecture as Sense, Decide, Act, and Secure.
  - Describes ServiceNow Otto, AI Agents, Autonomous Workforce, and AI Control Tower.
  - States that Workflow Data Fabric connects data from more than 450 systems.
- [ServiceNow AI Agents](https://www.servicenow.com/products/ai-agents.html)
  - AI Agents act autonomously across IT, customer service, HR, risk and security, and application development.
  - AI Agent Studio, Orchestrator, tools, roles, data, and agent connectivity support the agentic workflow.
- [ServiceNow AI Control Tower](https://www.servicenow.com/products/ai-control-tower.html)
  - Discovers, secures, governs, observes, and measures enterprise AI.

No customer metrics, analyst claims, or unsourced outcome claims are used in the campaign.

## Source Design DNA

- Surface: dominant deep teal (`#032d42`) with white typography; vivid green (`#63df4e`) is reserved for high-value emphasis and primary actions.
- Type: ServiceNow Sans when available, with a restrained grotesk fallback; oversized, tight display type and short body lines.
- Structure: slim global-style header, AI capability sub-navigation, centered statement hero, full-width product architecture, alternating dark and light bands, final dark conversion field.
- Buttons: rounded solid green primary; light text links with a directional arrow; visible focus ring.
- Motion: deliberate tab-state changes and scroll reveals; no decorative auto-motion; reduced-motion fallback.
- Proof assets: ServiceNow-owned platform, AI agent, and AI Control Tower screenshots from the public source page.

## Brand evidence

- Browser-captured source fold: `research/brand-harvest/manual/servicenow-platform-fold.png`.
- Validated broad-brand bundle: `research/brand-harvest/servicenow-home/` (`brand.json.validation.status: ok`, desktop and mobile captured).
- Product-page bundle: `research/brand-harvest/servicenow-ai-platform/`.
- The product-page CLI bundle captured the desktop source, computed tokens, CSS variables, and manual screenshot but did not complete its second responsive extraction; its `brand.json.validation.status` is therefore `incomplete`. The validated homepage bundle plus the verified product-page browser capture and official asset URLs are the visual source of truth. This split must remain visible in handoff reporting.

## Page sections

1. **Hero — Put enterprise AI to work.** Establishes the product promise and routes to the real demo CTA.
2. **Why now — AI has enough ideas. The enterprise needs action.** Defines the gap between AI recommendations and workflow execution.
3. **Architecture — Sense, decide, act, secure.** An interactive product workbench tied to the source platform model.
4. **Capability system — One platform, four ways to move work.** Explains Otto, AI Agents, Autonomous Workforce, and AI Control Tower.
5. **Role paths — Start with the work that cannot wait.** Lets buyers inspect IT, CRM, employee, and risk/security scenarios.
6. **Resource proof — Go deeper on the platform.** Uses only real ServiceNow product and blueprint destinations.
7. **Final CTA — Make AI part of how work gets done.** Repeats the single conversion path.

## Publication state

Save intent: create a new Folloze campaign board named `ServiceNow AI Platform Campaign` from `public/examples/servicenow-ai-platform-campaign.html` after Trey approved the local preview on August 7, 2026.

- Vendor: ServiceNow.
- Target account: none; this is a one-to-many campaign landing page.
- Theme mode: no Folloze company theme. Folloze no-theme ID `5374`; required stylesheet `https://cdn.folloze.com/theme/2/5374.css?v=1767691946`.
- Folloze guide: current board-creation and analytics guide read before save.
- Analytics: external CTAs use direct `cta_click` tracking; architecture tabs, role tabs, and internal navigation use descriptive interaction events.
- QA status before save: user-approved local preview; desktop and responsive checks passed in the initial build. Publishing preflight will be rerun against the exact saved HTML.
- Tracker status: not in scope for this request.
- Board ID: `249912`.
- Designer URL: `https://app.folloze.com/app/board/249912/designer`.
- Public deployment: `https://engage.folloze.com/servicenow-ai-platform-campaign`.
- Publication verification: published and public; saved and published config hashes both `70ee93abc6081378ceed91b9cf57e0ff0af258b0`. Anonymous HTTP returned `200` with the expected board ID, vanity slug, title, and hero copy; a signed-out hosted-browser check showed no sign-in redirect, no broken images, no horizontal overflow, the ServiceNow logo and headline, and working architecture and role tabs.
- Try Me Now integration: the campaign example now points to the verified Folloze public URL rather than the local preview route.
