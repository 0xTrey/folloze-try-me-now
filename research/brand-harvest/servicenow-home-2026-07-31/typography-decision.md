# ServiceNow typography delivery decision

Verified: 2026-07-31

## Browser evidence

Chrome DevTools Protocol inspection of `https://www.servicenow.com/` confirmed that the live page loads ServiceNowSans Thin, Light, Regular, Book, Medium, Bold, and Mono WOFF2 resources from ServiceNow's `clientlib-arc-commons` bundle. The harvested computed styles identify ServiceNowSansBold for display and ServiceNowSansLight for body copy.

## Delivery decision

Do not copy, cache, or proxy the ServiceNowSans binaries. A public asset URL proves browser availability, not redistribution permission. ServiceNow's current [Website Terms of Use](https://www.servicenow.com/terms-of-use.html) say Website Content may not be copied, stored, transmitted, or republished without prior written consent and that no implied licenses are granted.

Use Instrument Sans for display and Inter for body copy. Both are already selected by this project, are distributed by Google Fonts under the SIL Open Font License 1.1, and have variable WOFF2 resources suited to the intended display and body treatments. The runtime profile stores the Google Fonts source URLs; generated pages receive them only through the existing first-party, signature-checked session font delivery route.

License evidence:

- [Instrument Sans OFL repository](https://github.com/Instrument/instrument-sans)
- [Inter OFL license](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt)

This is an explicit approximation, not a claim that Instrument Sans or Inter is ServiceNowSans.
