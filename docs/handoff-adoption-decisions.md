# Handoff adoption decisions

Date: 2026-07-31  
Scope: Try Me Now UX v2 on `codex/visual-v1`  
Inputs:

- `docs/campaign-builder-video-handoff.md`
- `docs/codex-handoff-analytics-and-polish.md`
- `docs/ux-v2-build-plan.md`

## Decision rule

Adopt recommendations that improve the public preview, grounding, analytics proof, or future architecture without changing claim, Folloze draft, publish, or production semantics. Hold lifecycle mutations until the product behavior is explicit and independently testable.

## Campaign Builder handoff

| Recommendation | Decision | v2 action |
|---|---|---|
| Separate seller, target, and offer | Adopt | Added first-class campaign brief fields. The current guided UI continues to ask for seller and target; offer selection remains a follow-on UI choice. |
| Live Brief provenance and dependencies | Adopt | Added field provenance, citations, dependent blocks, confirmation, and independent revision metadata. This creates the contract for precise regeneration without claiming selective regeneration is finished. |
| Cited Audience Lens | Adopt | Keep the existing company-specific audience recommendations and evidence tray; back them with a canonical cited Audience Lens contract. |
| Campaign offer and source capture | Adapt | Added offer/source and confirm/reject state. Do not expose automatic offer selection publicly until approved research sources and offer authority are defined. |
| Canonical `ExperienceSpec` with dual renderers | Adopt web; defer Folloze renderer | The web renderer now consumes a versioned `ExperienceSpec`. Folloze rendering remains explicitly `not-requested`; HTML remains the delivered preview. |
| Curated Add Section composer | Adopt contract; defer public composer | Added curated-section planning metadata. Public add/reorder/remove controls wait for an approved section allowlist and renderer mappings. |
| Native Folloze draft handoff | Defer | Do not add `Continue editing in Folloze` until claim ownership, draft permissions, retry behavior, and designer URL exposure are approved. |
| Explicit preview, draft, publish, verification states | Defer lifecycle mutation | Preserve temporary preview and email-save behavior. Do not fold draft creation, publish, and anonymous verification into one apparent success state. |
| CTA destination in the anonymous preview | Superseded by current direction | The preview now demonstrates CTA intent, label, and visual treatment only. Destination capture belongs to a later claimed-workspace or native-draft step. |
| Tablet and mobile preview controls | Superseded by current direction | Keep one reliable desktop preview. The generated page can remain responsive, but the builder does not expose device-mode controls. |

## Analytics and polish handoff

| Recommendation | Decision | v2 action |
|---|---|---|
| Durable event sink | Adopt, migration pending | Add an allowlisted, non-blocking `/api/events` path and storage migration. Telemetry failure must never block the buyer experience. Do not call events durable until migration `004_create_try_me_events.sql` is applied and read back from the target database. |
| Visibility-aware engagement and dwell | Adopt | Generated experiences emit view, heartbeat, and section-dwell events based on visible time. |
| Buying-group activity demonstration | Adopt with disclosure | Show deterministic example buying-group activity in the analytics panel, prominently labeled as illustrative placeholder data and separated from the visitor's real activity. |
| Company-name casing fidelity | Adopt | Preserve harvested organization casing through generation, including mixed-case brands such as ServiceNow. |
| Per-session editor boundary | Harden before public release | The mutation boundary is HTTP-only and same-site, but the current single `tmn_editor` cookie is overwritten by the next session in the same browser. Move to a per-session cookie name with legacy fallback before relying on multi-tab or multi-account editing. |
| CI workflow | Defer | Useful hardening, but not required for this UX iteration and intentionally outside the active QA change surface. |
| Production promotion | Reject for this cycle | The active goal requires an exact-commit Vercel preview and leaves production untouched. |

## Product decisions still required

1. Does entering a business email only preserve the web workspace, or also create a native Folloze draft?
2. Is native Folloze draft creation a separate explicit `Continue editing in Folloze` action?
3. Which offer sources and content catalog are approved, and must a prospect confirm an offer before generation?
4. Which native section families are supported in the first public Add Section composer?
5. When does `ExperienceSpec` replace rendered HTML as the digest and version authority?
6. Which research sources are permitted for audience evidence, and how should confidence be communicated?
7. What event marks the GTM lead-conversion handoff: email save, native draft creation, publish, or a later meeting CTA?

## Guardrails for this build

- No OpenAI key, provider secret, cookie, or token enters browser code, generated HTML, git, logs, or lead exports.
- Anonymous previews remain temporary and private-by-URL.
- Email save, Folloze draft creation, Folloze publish, anonymous public verification, and production deployment remain separate checkpoints.
- Simulated analytics are always labeled and never mixed into durable real-event records.
- Production is not changed by this branch.
