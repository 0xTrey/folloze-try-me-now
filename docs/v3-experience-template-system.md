# Try Me Now V3 Experience Template System

## Decision

Try Me Now keeps one versioned `ExperienceSpec`, one security boundary, and one set of reusable brand, navigation, CTA, analytics, accessibility, and persistence primitives.

It does not force every use case through one generic page geometry.

The renderer selects one of three desktop template families from the approved campaign register:

| Template family | Registers | First-view promise | Core composition |
| --- | --- | --- | --- |
| Account microsite | `one-to-one-abm` | The seller understands this named account | Seller and target lockup, account thesis, decision lenses, supporting public content, next step |
| Campaign landing page | `campaign-demand`, `campaign-product`, `campaign-event` | The offer is clear and the audience can choose a relevant path | Seller and offer hero, value routes, proof and resources, one campaign action |
| Content companion | `content-magic` | The submitted source has become useful and interactive | Actual source title, finding-led hero, interactive chapters or excerpts, one or two source-backed highlights, source-specific action |

Campaign subtypes keep their own wireframe identifier and message framing while sharing the campaign renderer family.

## Shared contract

Every template consumes the same approved inputs:

- seller identity and verified logo delivery;
- optional target identity;
- offer or source identity;
- company-specific audience and objective;
- brand colors, typography, source-owned images, and readiness evidence;
- source title, topics, excerpts, and confirmation state;
- one visual-only CTA intent, label, and style;
- analytics event allowlist and the direct-page event bridge;
- artifact revision and digest.

The selected `wireframeName`, `experienceShape`, and register remain part of the canonical spec. Canonical means one validated source of truth, not one layout.

## Source authority

| Experience | Messaging authority | Visual authority | Required fallback |
| --- | --- | --- | --- |
| Account | Seller public evidence plus safe target-account context | Seller brand, with a verified target mark in the lockup | Mechanism-based account story with explicit low-confidence brand state |
| Campaign | Seller offer page, optional public URL, event details, or supporting PDF | Seller brand | Seller-category offer story without invented proof |
| Content | Uploaded PDF or public source page | Seller brand | Cleaned source title and source-grounded findings; never `Uploaded document` |

Brand and source readiness must stay truthful. A logo or palette that is still preliminary cannot be labeled complete merely because generation has moved on.

## Prospect flow

1. Choose account, campaign, or content.
2. Enter the seller domain. Brand harvesting begins immediately.
3. Add the one use-case-specific input:
   - target domain for account;
   - campaign type for campaign;
   - public URL or PDF for content.
4. Choose a company-specific audience and one objective.
5. Optionally add text, a public URL, or a PDF as additional guidance.
6. Watch the existing 30-60 second progressive build screen.
7. Land directly on one large desktop preview.
8. Tune tone, visual direction, CTA label, and CTA style only.
9. See the Folloze analytics prompt after a meaningful interaction, halfway exploration, or roughly 30 seconds.
10. Enter a business email only to save the temporary experience.

## Adopted handoff recommendations

- seller, target, and offer remain separate identities;
- the Live Brief keeps visible provenance and truthful stage state;
- campaign URLs and PDFs receive the same source confirmation treatment as Content Magic;
- the website preview and any future Folloze renderer use the same `ExperienceSpec` revision;
- preview, saved draft, publication, and anonymous verification remain separate lifecycle states;
- unsupported metrics and customer proof fail closed;
- the generation lease must outlive the maximum model timeout;
- real source title and brand evidence drive the final result.

## Deliberately deferred or removed from the prospect demo

- mobile and tablet preview modes;
- the reveal interstitial;
- post-preview quality receipts and internal diagnostics;
- supporting-asset pickers and block-level edit or lock controls;
- live CTA destinations;
- automatic Folloze draft creation or publishing before email claim;
- a public self-service Add Section composer.

These capabilities may exist in the full Folloze product. They distract from the Try Me Now job: get to a convincing, branded, measurable example quickly.

## Acceptance matrix

- Account, campaign, and content outputs have distinct template fingerprints.
- All three share the same analytics and CTA safety contract.
- Both seller and target logos render through first-party session routes when available.
- Jitterbit resolves to its official mark and source-owned plum/orange system instead of framework blue.
- TechTarget never leaves a blank target-logo slot.
- A PDF shows upload progress, accepted state, actionable failure state, and a real or safely inferred title.
- Content companions replace generic question cards with one or two source-backed highlights.
- The default desktop preview is large, scrollable, and free of nested-page jank.
- Full screen remains available.
- The direct experience can surface the analytics invitation without the builder wrapper.
- No API key, raw source file, private URL, email, generated HTML, or secret-bearing diagnostic is exposed.
