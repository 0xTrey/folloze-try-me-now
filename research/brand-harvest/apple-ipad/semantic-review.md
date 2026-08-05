# Apple semantic brand review

Reviewed against the current Apple homepage, the current iPad page, the Brand Harvester desktop and mobile captures, and the user-provided iPad screenshot on 2026-08-05.

## Accepted roles

- Primary ink: `#1D1D1F`
- Strong neutral: `#000000`
- Surface: `#FFFFFF`
- Soft surface: `#F5F5F7`
- Interactive accent and solid CTA: `#0071E3`
- Text-link accent: `#0066CC`
- Muted text: `#6E6E73`
- Divider: `#D2D2D7`
- Display type: `SF Pro Display` with a system sans fallback
- Body type: `SF Pro Text` with a system sans fallback
- Button shape: pill
- Card radius: `28px`

## Why the generated page was wrong

The iPad capture used `#1D1D1F` 536 times and `#000000` 484 times. `#0071E3` appeared only four times. The original token generator treated vivid color as the primary brand role and filtered low-saturation neutrals out of primary-color selection, which promoted Apple blue into headlines and other non-interactive copy.

The runtime profile and generic extractor now keep neutral text colors eligible for the primary-ink role, parse `rgb(...)` semantic variables, and reserve the harvested blue for links, focus, and CTA treatments.
