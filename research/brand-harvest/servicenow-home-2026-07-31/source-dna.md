# Source DNA - servicenow.com

Generated: 2026-07-31T11:44:45+00:00
Input: https://www.servicenow.com/
Resolved source: https://www.servicenow.com/
Confidence: high

Source DNA:
- Surface: deep brand blue #032D42 anchors the header and hero; wasabi green #63DF4E (computed CTA fill #62D84E) carries headlines, primary CTAs, tabs, and decorative emphasis on dark surfaces; white #FFFFFF is the primary light surface; #D7E0E6 and #E0F7DC are restrained pale support surfaces. For small green text on light surfaces, use the harvested `--arc-color-brandgreen-900` token #1A610E: its WCAG contrast is 7.61:1 on #FFFFFF, 6.70:1 on #E0F7DC, and 5.69:1 on #D7E0E6. Keep #63DF4E on #032D42, where it reaches 8.36:1, and for large or decorative green uses.
- Type observed in browser: ServiceNowSansBold/ServiceNowSansMedium for large claims, ServiceNowSansBook for buttons, and ServiceNowSansLight for body/navigation. Chrome DevTools confirmed public WOFF2 resources, but ServiceNow's Website Terms do not grant permission to copy, store, transmit, or proxy them. Runtime therefore uses the already-selected, OFL-licensed Instrument Sans display + Inter body pair through the first-party session font route. Never fall back to an editorial serif.
- Structure: Skip to Main Content Products Industries Learning Support Partners Company Get Started | Get the latest ServiceNow updates Email Subscribe Company About Careers Locations Partners | Get the latest ServiceNow updates Email Subscribe Company About Careers Locations Partners
- Button variants (manually corrected from the rendered first viewport):
  - Products: bg None, text #000000, radius 0px, font 400
  - Industries: bg None, text #000000, radius 0px, font 400
  - Learning: bg None, text #000000, radius 0px, font 400
  - Support: bg None, text #000000, radius 0px, font 400
  - Partners: bg None, text #000000, radius 0px, font 400
  - Company: bg None, text #000000, radius 0px, font 400
  - Search across ServiceNow: bg None, text #000000, radius 0px, font 400
  - Get Started: bg #62D84E, text #032D42, radius 500px, font 400
  - Primary hero: bg #63DF4E, text #032D42, 56px high, 24px horizontal padding, capsule radius, ServiceNowSansBook/600-equivalent sans
  - Secondary hero: transparent dark-blue surface, white text, 2px #63DF4E border, 56px high, capsule radius
  - Subscribe: bg #EBEBEB, text #C3C3C3, radius 100px, font 400
  - About: bg None, text #00718F, radius 0px, font 400
- Motion: {
  "fixedOrSticky": [],
  "hasVideo": false,
  "hasCarousel": false,
  "hasTabs": true,
  "hasForms": true,
  "prefersReducedMotionCSS": true
}
- Visual grammar: broad dark hero bands, large two-tone sans headlines, rounded product-demo frames, blue/indigo product UI panels used as supporting imagery, and small green star/status motifs. Translate this grammar into an original buyer page; do not generate empty circles, crossed lines, or generic placeholder diagrams.
- Proof assets:
  - Customer Service Management Empower self-service, boost agent productivity, and speed up resolution.: https://www.servicenow.com/products/customer-service-management.html
  - Provide better experiences Learn how you can use GenAI to equip customers and employees with self-service for requests. (3:17): https://www.servicenow.com/demos/put-ai-to-work-with-now-assist-for-customers-and-employees.html?tab1
  - Resolve issues faster Find out how your business can reduce manual work and help agents resolve cases faster. (4:08): https://www.servicenow.com/demos/put-ai-to-work-with-now-assist-for-agents.html?tab1
  - Customer Service Management Empower self-service, boost agent productivity, and speed up resolution.: https://www.servicenow.com/products/customer-service-management.html
  - Telecommunications Service Management Unlock growth with AI-powered experiences across customer service and network operations.: https://www.servicenow.com/products/telecommunications-service-management.html
  - Banking Future-proof your bank with one AI platform.: https://www.servicenow.com/industries/banking.html
  - Product hubs Find the resources, tools, and guidance you need for any ServiceNow product.: https://www.servicenow.com/community/products/ct-p/product-discussions
  - Explore Resources: https://developer.servicenow.com/dev.do
- Risks or unavailable signals:
  - Brandfetch data unavailable: BRANDFETCH_API_KEY or --brandfetch-token not provided
  - Akamai returns 403 to ordinary server-side HTTP fetches. The runtime must use this verified harvested profile or a browser-backed remote harvester instead of falling back to generic indigo/serif styling.
  - ServiceNowSans is observed-only brand evidence, not a deliverable asset. See `typography-decision.md` for the license and delivery decision.

Folloze usage:
- Suggested shape: Workbench
- Use this note as working input only. Do not paste source-harvest language into buyer-facing board copy.
- Verify official logo treatment before save, especially dark/light navbar variants.
- Screenshots: research/brand-harvest/servicenow-home-2026-07-31/screenshots
