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

- Read-only replay recovered complete, high-confidence content from Aprio's selected service page. The latest live-model replay retained six sections, including a complete audit-reporting headline and service-specific mechanism copy. Some sections still used deterministic fallbacks, and the bounded semantic model review timed out. This is not a claim that every paragraph was model-written or human-approved.
- The final full local suite passed 1,929 tests with one skipped across 179 files, plus lint, type checking, and both production builds. Lint retained three existing unused-variable warnings.
- The final restoration regression passed with all 28 production-engine tests. It injects a failure after candidate selection, verifies restoration of the original paragraph, and confirms the unsupported number never reaches rendered HTML.
- The first remote browser run caught an account-alignment regression: shortening a long headline dropped the seller identity, so the existing specificity checks rejected the section. Account fallbacks now retain both company names in a complete headline. A new six-archetype compiler regression and 38 related tests passed locally. The specificity checks remain unchanged.
- Connected-browser checks confirmed the engagement personalization action at desktop and 390-pixel mobile widths. The local account-building confirmation displayed **View engagement**. The fixture finished before the manual click; component tests independently verified the callback and no resubmission.
- Local account testing used a reserved example email and memory-only storage, with email delivery disconnected. No email or Folloze publication occurred.
- The three pre-existing screenshot changes in `output/product-owner-remediation/` remain outside this repair.

## Release state

- Code is saved and pushed through `2edda36b1a837687b0147b49364ab7edf891c371` on `codex/buyer-journey-security`.
- [Remote quality gate](https://github.com/0xTrey/folloze-try-me-now/actions/runs/34040281433) passed: 1,935 tests with one skipped, 101 desktop browser checks, lint, type checking, both production builds, dependency audit, and the redacted history scan.
- Candidate `dpl_2sUAW5VAwwYeocm3z1uKt7RErsuN` was built from a clean detached worktree. Its homepage and health route returned HTTP 200 before promotion.
- The candidate was promoted to [the canonical production URL](https://folloze-try-me-now.vercel.app/). Deployment inspection resolved that URL to the candidate. Anonymous homepage and health checks returned HTTP 200; required production services were ready. No environment or database changes were made.
- The previous release, `dpl_4txynfL9EKGoEFvsBfuXDnTCthb6`, remains the rollback reference. The rejected first candidate was not promoted to the canonical URL.
- Existing saved HTML does not automatically regenerate when the application is deployed. The reported Aprio session and its account requests were not overwritten.
