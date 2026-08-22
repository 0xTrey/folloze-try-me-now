# Unified Builder Acceptance Matrix

| ID | User-visible requirement | Required evidence |
| --- | --- | --- |
| U01 | Homepage has one dominant Build a buyer experience action | Desktop screenshot and component assertion |
| U02 | Worked-example rail and old Aprio, ServiceNow, and Cisco entry links are absent | Component test |
| U03 | Northpeak examples are used only as optional, relevant worked states | Snapshot and link assertion |
| U04 | Content Magic remains available through a secondary route | Component and route test |
| U05 | Intake is a persistent conversation, not disconnected question boxes | Desktop Playwright flow |
| U06 | Seller, target or audience, offer, objective, and inferred type remain visible and editable | Component and API tests |
| U07 | Only the next materially missing question is asked | Conversation-state tests |
| U08 | A normalized valid domain starts brand/company work before explicit confirmation | Orchestration receipt test |
| U09 | Target and source inputs start separate, deduplicated work | Single-flight and worker tests |
| U10 | Selecting an account does not automatically reveal the final preview while the brief is incomplete | Desktop E2E assertion |
| U11 | Generation-eligible sessions receive a deterministic provisional artifact within the contract fixture | Preview benchmark |
| U12 | No new external work starts after 60 seconds | Deadline test |
| U13 | Optional provider failure preserves an honest renderable artifact | Fallback test and screenshot |
| U14 | Progress copy is backed by worker receipts | Receipt-contract test |
| U15 | Brand compilation includes semantic color, geometry, typography character, and imagery treatment when verified | Brand fixtures and renderer assertion |
| U16 | No broken image, fabricated fallback color, or empty media frame is rendered | Visual fixture tests |
| U17 | ServiceTitan-style evidence preserves blue accents and source-like button geometry | Regression fixture |
| U18 | Prospects never choose a wireframe; composition is deterministic and explainable internally | Selector tests |
| U19 | Buyer-facing labels replace internal strategy jargon | Exact-copy assertions |
| U20 | Preview supports generic, account, account-industry, and two account-industry-persona states when evidence permits | Renderer and desktop E2E |
| U21 | Personalization changes the argument and proof emphasis, not only names | Golden scenario assertions |
| U22 | No save/email modal appears during intake or immediately on preview reveal | Lifecycle tests |
| U23 | Email claim appears only after visible value and meaningful preview engagement | Component/E2E event assertion |
| U24 | Preview ready, enriching, claimed, and published are represented as distinct states | State contract tests |
| U25 | Public runtime stays app-hosted HTML only with Folloze write/publish disabled | Health and claim-boundary tests |
| U26 | Session revision fencing rejects stale worker output | Orchestration test |
| U27 | Every primary CTA performs a real scroll, dialog, resource, or verified external action | Renderer/E2E assertions |
| U28 | Product analytics exclude raw prompts, domains, URLs, email, source bodies, copy, HTML, and secrets | Redaction tests |
| U29 | A failure produces a support reference and stage-level trace evidence | Failure-path test and trace inspection |
| U30 | `npm run benchmark:preview`, `npm run qa`, and desktop E2E pass | Captured command output |

## Non-blocking upgrade checks

These can trigger one bounded repair but may not suppress the best honest preview:

- richer imagery;
- stronger brand nuance;
- more specific copy;
- optional resource depth;
- greater section novelty;
- alternate composition recommendation.

## Hard blockers

- unsupported or fabricated visible claim;
- seller/target brand-role confusion;
- dead primary CTA;
- inaccessible primary interaction;
- broken required content with no fallback;
- stale revision overwriting a newer artifact;
- unsafe fetch or unredacted sensitive analytics;
- public Folloze write or publish capability becoming enabled.
