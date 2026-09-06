# Selected-offer copy and engagement navigation

The September 6 repair addresses thin campaign copy and two navigation gaps reported on the Aprio preview. The existing saved preview and account requests were not rewritten during diagnosis.

## Changes

- Selecting an exact, verified offer can recover its unique official service URL. A homepage label cannot shadow a matching navigation URL. Foreign hosts, ambiguous matches, homepages, and editorial paths do not qualify. An explicit visitor URL takes precedence.
- HTML extraction now uses browser-compatible parsing. An unclosed main element no longer causes the reader to keep only a nested article and miss the rest of a service page.
- Offer-specific facts take precedence over unrelated homepage topics. Related articles and generic slogans do not become product claims.
- Headlines retain complete sentence boundaries. Model instructions receive the selected offer explicitly and request concrete service detail. Source punctuation is normalized to the shared voice rules.
- Model candidates with embedded citation IDs or missing required choice cards are rejected before selection. A later factuality rejection can restore only that section's original fallback, which still passes the normal whole-page and final checks.
- A required mechanism with no supported capability facts becomes an instruction to validate the work, not a fabricated capability claim.
- Long choice-card evidence never becomes internal placeholder wording. Evaluation and application sections can retain complete, cited service facts in a paragraph, followed by concise buyer questions. Evaluation criteria use supported capabilities when no specific objection evidence is available.
- The engagement panel now has the existing account-personalization action near its heading. Its label follows request status. The account-building confirmation uses **View engagement**, which opens engagement without submitting another request.

## Verification

- Read-only replay recovered complete, high-confidence content from Aprio's selected service page. A diagnostic live-model replay retained six sections, including a complete audit-reporting headline and service-specific mechanism copy. Some sections still used deterministic fallbacks, and the bounded semantic model review timed out. This is not a claim that every paragraph was model-written or human-approved.
- The full local suite passed 1,937 tests with one skipped across 180 files, plus lint, type checking, and both production builds. The final digest and evidence-assignment assertions passed a further 20 focused tests and the remote full suite. Lint retained three existing unused-variable warnings.
- The final restoration regression passed with all 28 production-engine tests. It injects a failure after candidate selection, verifies restoration of the original paragraph, and confirms the unsupported number never reaches rendered HTML.
- The first remote browser run caught an account-alignment regression: shortening a long headline dropped the seller identity, so the existing specificity checks rejected the section. Account fallbacks now retain both company names in a complete headline. A new six-archetype compiler regression and 38 related tests passed locally. The specificity checks remain unchanged.
- Connected-browser checks confirmed the engagement personalization action at desktop and 390-pixel mobile widths. The local account-building confirmation displayed **View engagement**. The fixture finished before the manual click; component tests independently verified the callback and no resubmission.
- The final live retry used Aprio, Audit & Assurance Solutions, CFOs and finance executives, and Speak with an advisor. It produced a five-section page with a complete service headline and substantive middle paragraphs. The application section was not retained in the final output; six sections are not claimed. No internal evidence placeholder wording appeared.
- [Final Aprio QA preview](https://folloze-try-me-now.vercel.app/e/APZFmP-ZITyubjimECOwyQAKwCFyqJc1) was checked at 1280- and 390-pixel widths without horizontal overflow. It is an expiring anonymous preview, not a permanent saved experience. The live engagement header action opened the existing personalization dialog, which was closed without entering an email or submitting a request.
- Local account testing used a reserved example email and memory-only storage, with email delivery disconnected. No email or Folloze publication occurred.
- The three pre-existing screenshot changes in `output/product-owner-remediation/` remain outside this repair.

## Release state

- Runtime code is saved and pushed through `b35f569fb7842feb62bfccacb1d1547e716ba398` on `codex/buyer-journey-security`.
- [Remote quality gate](https://github.com/0xTrey/folloze-try-me-now/actions/runs/34040926387) passed: 1,937 tests with one skipped, 101 desktop browser checks, lint, type checking, both production builds, dependency audit, and the redacted history scan.
- Candidate `dpl_Fovds3QZ1RASDD3firx6xhniTFPx` was built from a clean detached worktree. Its homepage and health route returned HTTP 200 before promotion.
- The candidate was promoted to [the canonical production URL](https://folloze-try-me-now.vercel.app/). Deployment inspection resolved that URL to the candidate. Anonymous homepage and health checks returned HTTP 200; required production services were ready. No environment or database changes were made.
- The preceding release, `dpl_2sUAW5VAwwYeocm3z1uKt7RErsuN`, remains available for rollback. The pre-repair release, `dpl_4txynfL9EKGoEFvsBfuXDnTCthb6`, is also retained. The rejected first candidate was not promoted to the canonical URL.
- Existing saved HTML does not automatically regenerate when the application is deployed. The reported Aprio session and its account requests were not overwritten.

## Handoff

The requested changes are implemented, verified, and live. The canonical source is this repository on `codex/buyer-journey-security`; runtime commit and deployment receipts are above. The remaining local changes are the three unrelated screenshot files. Trey's next action is to review the fresh preview or generate a new experience from the production app after that anonymous preview expires. No email, account request, or Folloze publication is part of this release.
