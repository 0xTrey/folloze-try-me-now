# Try Me Now usability flow

The approved entry page leads into one focused question at a time. The active question and its choices appear before a collapsed answer summary. Completed answers remain editable without repeating the same information in a separate sidebar.

## Completed experience

The result screen shows a small branded thumbnail and a clear View experience link. The full page opens in a separate tab. Personalize for 3 accounts and Edit brief remain available on the result screen; engagement is a secondary action.

Edit brief keeps a local draft of the offer, audience, and objective. Cancel does not save anything. Rebuild sends the draft through the same validated answer API used by intake. A changed generation-ready brief receives a fresh build window; an unchanged brief does not restart generation. A failed save retains the draft for retry.

## Account versions

Automatic account selection and manual account entry are separate options. Manual buyer roles are optional. The app keeps unsubmitted account entries in the current page session when the dialog closes and reopens. Explicit X and Escape close the dialog; clicking the backdrop does not. Pending account selection displays a status message and has a 30-second client timeout, with retry and manual-entry recovery.

Escape continues to work after a form transition removes the focused control. An unfinished account request uses Continue personalization on the result screen; queued builds and finished versions use separate status labels.

Closing the dialog does not cancel a submitted build. Reopening restores its server-side status. Reloading the browser is not a promise of draft persistence.

An email with pending delivery is not active work while the request is awaiting account choices. Polling starts for queued or generating variants, or for deliverable links awaiting email delivery. Background reads do not disable account entry.

## Destinations and visual checks

The example link points to the current [North Peak personalized campaign](https://experience.folloze.com/northpeak-personalized-campaign-example), not the older Engage board. On September 5, 2026, browser inspection found no Qualified script or messenger on the replacement example. No consent or organization settings were changed. The older Engage example still loaded Qualified.

The primary CTA has no default Folloze meeting destination. Verified source destinations and explicitly configured destinations remain supported. Without a destination, the page uses its in-experience exploration fallback.

Chapter-journey panels use light-surface body text and headings on their light background. Verified brand evidence remains the source for color choices; the renderer does not invent a Dynatrace palette when evidence is missing.

These changes are source changes until separately deployed. Testing a fixture verifies interaction and layout, not live AI output quality or the exact Dynatrace experience reported by Luke.

## Local verification

On September 5, 2026, all 1,758 tests across 156 files, TypeScript checks, and both production builds (Turbopack and webpack) passed. Lint reported zero errors and three existing warnings in the upload-contract test. Browser checks covered desktop and mobile result layouts, cancelling and rebuilding a retained brief, interactive account choices after email entry, retained manual account drafts, Escape after form transitions and backdrop clicks, and a complete three-account fixture build. The full experience opened in its own tab. Email was disabled for these local checks; no email was sent and no Folloze board was published.
