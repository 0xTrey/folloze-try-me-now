# Unified Builder Codex Handback

Prepared: 2026-08-22  
Branch: `codex/unified-microsite-builder` (local; **not pushed**)  
Manager: Cursor Agent  
Authority: Codex review / release

## Verdict

Implementation package complete for local Codex review. `benchmark:preview`, unit suite (777), and desktop Playwright (27) pass. Nothing deployed. Folloze write/publish remains disabled.

## U01–U30 map

| ID | Status | Evidence |
| --- | --- | --- |
| U01 | met | Desktop E2E + component primary CTA |
| U02 | met | E2E/component: no worked-example rail / Aprio / ServiceNow / Cisco |
| U03 | met | Northpeak optional links |
| U04 | met | Content Magic secondary → content session |
| U05 | met | Desktop conversational campaign + event paths |
| U06 | met | Editable Live Brief (seller/audience/offer/objective/type) |
| U07 | met | One next material question (composer tests) |
| U08 | met | Domain stabilize → research plan / Ready to match |
| U09 | met | Separate target/source + single-flight |
| U10 | met | No preview before material eligibility |
| U11 | met | Benchmark 15s provisional fixture |
| U12 | met | No new external work after 60s |
| U13 | met | Fallback receipts + missing-asset E2E |
| U14 | met | Receipt-backed progress surface |
| U15–U17 | met | Brand fidelity + ServiceTitan blue/6px fixture |
| U18–U19 | met | Ranked composition + buyer labels / jargon sanitize |
| U20–U21 | met | Five personalization views; argument not name-only |
| U22–U24 | met | Modal timing; lifecycle phases; no Folloze publish claim |
| U25 | met | App-hosted / claim-boundary / health |
| U26 | met | Stale worker fencing |
| U27 | met | CTA scroll + keyboard/tabs E2E |
| U28–U29 | met | Redaction + support-ref reconstruction |
| U30 | met | benchmark + qa + desktop E2E |

## What remains unverified

1. **ABM primary-door path** — unified CTA still creates `campaign` sessions; named-account → `abm` flip deferred.
2. **Live provider SLOs** — fixture 15s/60s only; not re-timed against live Brandfetch/OpenAI.
3. **Live claim → email** — E2E mocks intake APIs; full durable claim not exercised end-to-end here.
4. **Production analytics/ops modes** — PostHog and distributed rate limits not part of this package.
5. **Human visual brand review** beyond ServiceTitan unit fixture.

## Hard blockers

None for the three package final commands.

## Suggested Codex next steps

1. Review commits on `codex/unified-microsite-builder` vs `production` (`1e22931`).
2. Decide whether ABM session flip-on-account is required before merge.
3. Optional live-provider smoke on a protected preview (still no Folloze publish).
4. Push / PR / deploy only under Codex release authority — Cursor did not push.
