# Tyler feedback implementation — 2026-08-13

Source: [Tyler Hart Try Me Now feedback](https://docs.google.com/document/d/1pLkXhKJMsh-VX5qaA2PkESmzMg3nxhz6NGxXo77_mZY/edit?tab=t.0)

This release keeps the ungated preview and the five-row Live Brief while tightening the experience around one promise: a few simple signals become a rich, branded buyer experience without hiding the result behind an email form.

## Implemented in this release

- Buyer-facing copy rejects unfinished ellipses and persona placeholders, normalizes `AI`, and uses complete one-sentence audience rationales.
- Audience suggestions account for the promoted offer and named account context; company-name normalization now preserves brands such as Datadog.
- Low-confidence brand extraction renders an explicit neutral treatment instead of invented colors. Verified Snowflake evidence covers its official mark and palette.
- Campaign validation always explains the missing signal rather than leaving a disabled Continue button unexplained.
- The ABM target domain is collected before optional context.
- Confirmed domains begin an unclaimable provisional build with ephemeral defaults. Explicit visitor answers replace those defaults and fingerprint fencing prevents stale output from winning.
- The Live Brief is editable from the preview, and “Watch one build” offers a zero-typing worked example.
- Funnel analytics now include path selection, domain confirmation, audience and goal confirmation, build start, preview render/scroll, save open, and save completion.
- The engagement view becomes the finale after save or five meaningful signals and closes with Build → Activate → Signal.
- The save dialog shows a five-minute expiry nudge while preserving the single business-email field and “No newsletter signup” language.
- Marketo lead and optional custom-activity synchronization are config-gated, post-save, best effort, allowlisted, and disabled by default. A validated public Munchkin ID can instrument the shell and generated preview without exposing REST credentials.

## Activation required outside the repository

Marketo remains off until the tenant supplies its `*.mktorest.com` endpoint, REST client credentials, and approved field/activity mappings. Munchkin is independently enabled with its public ID. Saving remains successful if Marketo is unavailable.

The expired-preview fresh-link component is implemented as a post-expiry UI contract, but transactional delivery is not activated in this release: an expired session is deleted by the current storage TTL, so sending a faithful rebuilt experience requires a separately approved retention and consent contract rather than a misleading empty link.

## Release boundary

Vercel is the sole authoritative host. The `production` branch is the release branch; Cloudflare and credential rotation are out of scope. Visual-quality checks remain fail-soft: they can trigger a deterministic repair or a neutral treatment, but never suppress an otherwise usable preview.
