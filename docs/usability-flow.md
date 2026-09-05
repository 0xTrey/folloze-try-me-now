# Try Me Now usability flow

The entry headline and supporting copy span the page width with responsive edge spacing. The build options below remain in a centered, bounded layout. The entry page leads into one focused question at a time. The active question and its choices appear before a collapsed answer summary. Completed answers remain editable without repeating the same information in a separate sidebar.

## Completed experience

The result screen uses the full available width for its heading and supporting copy. Four button-styled actions sit together: View Experience, Personalize for 3 accounts (or the current account-request state), Edit Brief, and View Engagement. View Experience opens the standalone URL in a new tab. A large, full-width interactive experience appears immediately below the actions, with native scrolling and the publication note below it. Mobile keeps all four controls in a two-column grid.

Reaching the end offers two choices: engagement analytics and account personalization. The standalone document adds this prompt at delivery time, so existing saved artifacts receive the same behavior without regeneration. Its owner check uses the existing scoped HTTP-only editor cookie through an authenticated API, not a token in the experience URL. Anonymous visitors and failed owner checks receive no private builder controls. Embedded documents use the builder's dialog instead of a second popup inside the frame.

Either standalone choice returns to the owned session and requested panel without creating or rebuilding a page. Existing account versions are restored. The tab transfers up to 24 allowlisted, non-contact activity events and its foreground duration to the analytics panel; the transfer expires after five minutes and is consumed on return. This temporary activity is not authentication or a substitute for durable analytics. It contains no email, editor token, or personalization form fields.

The displayed engagement timer pauses while analytics, personalization, next steps, brief editing, or build details cover the experience. Closing the overlay resumes the same total, including fractional seconds. Hidden-tab time is excluded. Analytics keeps its actual activity feed and Journey, Topic depth, and Intent cards. The Live journey snapshot, capability catalog, and dark campaign-routing bar are removed.

Edit brief keeps a local draft of the offer, audience, and objective. Cancel does not save anything. Rebuild sends the draft through the same validated answer API used by intake. A changed generation-ready brief receives a fresh build window; an unchanged brief does not restart generation. A failed save retains the draft for retry.

## Account versions

Automatic account selection and manual account entry are separate options. Manual buyer roles are optional. The app keeps unsubmitted account entries in the current page session when the dialog closes and reopens. Explicit X and Escape close the dialog; clicking the backdrop does not. Pending account selection displays a status message and has a 30-second client timeout, with retry and manual-entry recovery.

Escape continues to work after a form transition removes the focused control. An unfinished account request uses Continue personalization on the result screen; queued builds and finished versions use separate status labels.

After account selection, a compact confirmation replaces the internal build dashboard: "We're building all three versions for you. Check your email in about 5 minutes to see what they look like." Back to your experience closes the dialog without submitting again. The five-minute wording is an estimate, not a delivery guarantee; the server emails the available finished links after the targets settle. A known unconfigured email service gets a return-to-page message instead of an email promise.

The account-submission route schedules work with server-side `after()`, and fulfillment invokes email delivery without requiring a browser status read. Closing the dialog or page does not cancel submitted work. Reopening restores its server-side status and can trigger recovery of interrupted work. Reloading the browser is not a promise of draft persistence. Final links and email failure states remain available when a visitor returns to the dialog.

An email with pending delivery is not active work while the request is awaiting account choices. Polling starts for queued or generating variants, or for deliverable links awaiting email delivery. Background reads do not disable account entry.

## Destinations and visual checks

The example link points to the current [North Peak personalized campaign](https://experience.folloze.com/northpeak-personalized-campaign-example), not the older Engage board. On September 5, 2026, browser inspection found no Qualified script or messenger on the replacement example. No consent or organization settings were changed. The older Engage example still loaded Qualified.

The primary CTA has no default Folloze meeting destination. Verified source destinations and explicitly configured destinations remain supported. Without a destination, the page uses its in-experience exploration fallback.

Chapter-journey panels use light-surface body text and headings on their light background. Verified brand evidence remains the source for color choices; the renderer does not invent a Dynatrace palette when evidence is missing.

These changes are source changes until separately deployed. Testing a fixture verifies interaction and layout, not live AI output quality or the exact Dynatrace experience reported by Luke.

## Local verification

On September 5, 2026, the original five usability changes passed 1,758 tests across 156 files, TypeScript checks, and both production builds (Turbopack and webpack). Lint reported zero errors and three existing warnings in the upload-contract test. Browser checks covered desktop and mobile result layouts, cancelling and rebuilding a retained brief, interactive account choices after email entry, retained manual account drafts, Escape after form transitions and backdrop clicks, and a complete three-account fixture build. The full experience opened in its own tab. Email was disabled for these local checks; no email was sent and no Folloze board was published.

The follow-up confirmation and full-width entry update added coverage for both queued and generating requests, a return CTA before and after completion, and known disabled-email states. Browser checks confirmed matching headline and subheader widths on desktop and mobile, no horizontal overflow, the compact customer-facing confirmation, and a working return action. The existing route and fulfillment tests also verify server-side scheduling and email handoff without a browser status request.

The full-width result and analytics follow-up passed 1,784 tests across 160 files. Browser checks confirmed the four result actions, a large interactive frame without horizontal overflow at desktop and mobile widths, and a timer that stayed at 37 seconds while analytics remained open. The standalone bottom prompt restored both analytics activity and an existing account-selection request without another email submission or a new build. Owner-only resume, expired or unauthorized links, bounded activity transfer, and fractional timer pause/resume behavior have regression coverage. Opening an analytics owner control does not count as buyer CTA intent.
