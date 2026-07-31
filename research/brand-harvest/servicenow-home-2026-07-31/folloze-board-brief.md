# Folloze Board Brand Harvest Brief

Company/domain: servicenow.com
Source URL: https://www.servicenow.com/
Target account: ServiceNow

Recommended experience shape: Workbench

## Design Direction

- Surface: use #032D42 as the dark anchor, #63DF4E/#62D84E for headline and CTA emphasis, #FFFFFF for light bands, and #D7E0E6/#E0F7DC for restrained support surfaces. The first viewport should feel green-and-deep-blue, not indigo-and-white.
- Typography: ServiceNowSansBold/Medium for display, ServiceNowSansBook for buttons, and ServiceNowSansLight for body. Use a sans-serif fallback when the proprietary face is unavailable; never an editorial serif.
- Primary color map: dark #032D42; accent #63DF4E; accessible small-text green on light surfaces #1A610E (harvested brandgreen-900); computed header CTA #62D84E; link #00718F; light surface #FFFFFF; pale neutral #D7E0E6.
- Button map: 56px capsule primary (#63DF4E on #032D42), 56px capsule outline (transparent with 2px #63DF4E and white text on dark), and compact 36px header capsule.
- Imagery: prefer verified ServiceNow-owned product/platform imagery. If no image survives delivery, use a purposeful brand-color workflow panel or type-led composition, never crossed-line placeholder geometry.
- Source structure: Skip to Main Content Products Industries Learning Support Partners Company Get Started | Get the latest ServiceNow updates Email Subscribe Company About Careers Locations Partners | Get the latest ServiceNow updates Email Subscribe Company About Careers Locations Partners

## CTA Language Pool

- Products
- Industries
- Learning
- Support
- Partners
- Company
- Search across ServiceNow
- Select your country
- Get Started
- Subscribe
- About
- Careers
- Locations
- Suppliers
- Investors
- Code of ethics
- Newsroom
- Workflow: Insight for what matters

## Logo And Asset Candidates

- ServiceNow: https://www.servicenow.com/content/dam/servicenow-assets/images/naas/servicenow-header-logo-white.svg
- ServiceNow logo: https://www.servicenow.com/content/dam/servicenow-assets/public/en-us/images/global-nav/images/logo/1024-up.svg

## Board Builder Notes

- Start from the source screenshots and `source-dna.md` before writing HTML.
- Treat the extracted buttons as the component map for nav, hero, resource, modal, and final CTA states.
- Use the source-site proof links only after verifying they are public and relevant to the buyer motion.
- If this becomes a Folloze MCP board, still run the normal link, analytics, mobile, and save-readiness gates.

## Risks To Resolve

- Brandfetch data unavailable: BRANDFETCH_API_KEY or --brandfetch-token not provided
- ServiceNow blocks ordinary server fetches with Akamai 403 responses. Use the verified runtime profile from this harvest or a browser-backed remote harvester.

## Output Files

- Brand JSON: research/brand-harvest/servicenow-home-2026-07-31/brand.json
- Source DNA: research/brand-harvest/servicenow-home-2026-07-31/source-dna.md
- Brand tokens CSS: research/brand-harvest/servicenow-home-2026-07-31/brand-tokens.css
- Asset manifest: research/brand-harvest/servicenow-home-2026-07-31/asset-manifest.json
- Screenshots: research/brand-harvest/servicenow-home-2026-07-31/screenshots
