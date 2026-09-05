# Buyer journey and security status

The implementation is saved locally on `codex/buyer-journey-security`. Nothing was pushed or deployed, and no production database migration or credential change was made.

## Saved checkpoints

| Commit | Scope |
| --- | --- |
| `d471e61` | Acceptance plan and recovery boundary |
| `6c5c7de` | Shorter fallback copy and complete sentence boundaries |
| `ee59f31` | Request security, bot verification, encrypted storage, database-role preparation, and dependency remediation |
| `be8eb92` | Buyer brief, source knowledge, evidence-aware selection, section writing and review, CTA consistency, rendering, and evaluation fixtures |
| `da87f5c` | Completion-audit fixes for product-scoped proof and purchase-answer evidence through writers, review, and rendered HTML |

The three screenshots that were modified before this work remain untouched and uncommitted in `output/product-owner-remediation/`.

## Product improvements

These are implementation and fixture-verification receipts. They are not evidence of production adoption, completed human review, or conversion lift.

| # | Result | Verification or boundary |
| --- | --- | --- |
| 1 | One buyer-decision brief | Product, audience, buyer job, traffic, stage, questions, and action are explicit. Inferred stage and unknowns are labelled. A digest, freshness, and counts enter the operational timeline. |
| 2 | Exact-product clarification | Broad product categories are rejected with a focused question. Company identity alone remains unresolved unless confirmed. A name is not treated as independently verified research. |
| 3 | Reusable source knowledge | Versioned, bounded caches retain source-linked capabilities, workflow, proof, objections, and voice. Only complete, matching first-party source artifacts qualify. This does not add a general-purpose crawler or human approval workflow. |
| 4 | Distinct strategy arguments | Outcome, context, and mechanism arguments draw from different permitted evidence. Thin inputs cannot manufacture a proof-led argument or urgency. |
| 5 | Account relevance | Account context connects to seller capability with separate causal references. Public signals do not establish private pain. Positive and negative account-swap tests run in the benchmark, not on every live request. |
| 6 | Buyer-question sequencing | Explicit cold and post-demo context changes the sequence before final composition. Browser fixtures confirm different Guide and Align journeys. |
| 7 | Deterministic wireframe fit | Eligibility gates and weighted fit replace a dominating rule bonus. Stable tie-breaking and close-score uncertainty are retained. |
| 8 | Real proof and asset signals | Source count is not proof. Typed, public, permitted seller outcomes drive proof eligibility; selected usable imagery drives visual readiness. |
| 9 | Section assignments | Each section receives its buyer question, intended conclusion, claim references, relevant objection, and transition. Nonempty claim pools constrain both model and fallback writers, and the final reviewer uses the same references. |
| 10 | Earned modules | Unsupported friction, optional proof depth, and resources are omitted. Rendered order and navigation follow retained sections. Omitted sections no longer revive old draft content. |
| 11 | Clearer hero | Opening copy names the offer and buyer; a scoped seller claim explains the product where available. Actual comprehension still needs human review. |
| 12 | Supported problem | Workflow context is distinguished from account context. Unsupported friction is removed, and invented urgency is rejected. |
| 13 | Product mechanism | Source capability and workflow claims reach section writers. Unknown mechanisms remain validation questions rather than invented features. |
| 14 | Scoped proof | Customer outcomes and quantified results require explicit types, permitted use, public source scope, past-result language, and a match to the selected product. Source extraction binds proof to its own quote or section, not another section sharing a citation. Unresolved product identity cannot authorize proof. No-proof journeys use a walkthrough question. |
| 15 | Purchase questions | Verified pricing, security, and implementation answers can add a purchase-question module. A regression follows a synthetic published price through the section contract and fallback into rendered HTML. Missing facts remain unknown. |
| 16 | Concrete CTA | One shared contract controls label, destination, and expectation. Source links do not promise a completed registration. Missing destinations use an existing next-step anchor, without claiming a booking. Secret-bearing URLs are rejected. |
| 17 | Whole-page editorial review | A bounded structured model review checks meaning, unsupported claims, repetition, and CTA continuity. Repairs affect at most two sections. A failed rereview cannot clear an existing blocker. Live-provider quality has not been measured in this run. |
| 18 | Useful fallbacks | Minimum-length padding is removed. Short complete copy and explicit walkthrough questions replace internal review instructions. Unverified closing-offer details are not rendered. |
| 19 | Buyer-ready performance | Parallel writing remains bounded. Session-isolated section caching refreshes changed evidence, scoped brief fields, voice, or expired responses. Writer duration, model/fallback counts, cache hits, and review status enter telemetry. The source cache is per process, not a cross-instance knowledge service. |
| 20 | Outcome learning tools | The benchmark, six compiled review samples, blinded export, sticky assignment, and exposure/conversion analysis are available. Human comparisons, CRM outcome joining, production experiment activation, and measured conversion lift remain pending. |

The ABM and copywriting guidance shaped evidence boundaries, account relevance, section jobs, and concise fallbacks. Neon guidance shaped transaction-scoped database context. The security review is an AI-assisted first pass, not a professional penetration test.

## Security controls

| Control | Current result |
| --- | --- |
| Hide API keys | Credentials remain server-side. An exact-value check of four configured server secrets across 36 client files found no matches. |
| Purge secrets from Git | The full-history scan found no confirmed secrets. The final staged diff also passed. No purge or history rewrite was warranted. |
| Expose only public DB key | This app has no browser database credential. Neon access remains on the server; a public database key is not needed. |
| Enable row-level security | Migration 011 and transaction-scoped lead access are implemented. Live metadata audit failed: the current login has BYPASSRLS, owns all eight present tables, and none has RLS enabled. Migration 010's build-trace table and both new roles are absent. RLS is not active. |
| Encrypt sensitive data | AES-256-GCM envelopes protect Blob/Redis sessions and Blob lead receipts when enabled. Record-bound authentication, rotation key IDs, tamper checks, and strict legacy-read mode are tested. Production keys and old-record migration are not activated. SQL lead email remains application-readable and depends on provider encryption at rest, which was not independently verified. |
| Enforce server-side auth | Private editor reads and mutations validate the server-issued editor capability. Public buyer pages keep a separate public projection. |
| Lock record access | Cross-session and capability checks are covered by API tests. Database-level lead isolation still requires the RLS rollout below. |
| Block field tampering | Strict schemas separate writable answers from server-owned state. Unknown properties and invalid field types are rejected. |
| Secure session cookies | Editor cookies are HttpOnly, SameSite=Lax, scoped to `/api/sessions`, time-limited, and Secure in production. Cross-origin JSON mutations are rejected. |
| Hash passwords | There is no password login. Random editor capabilities are stored as SHA-256 hashes and compared in constant time. This is not a password-hashing scheme and should not be reused as one. |
| Rate limit login | Applicable creation, editor, claim, recovery, and related routes have abuse limits. Production fails closed without a distributed limiter. There is no password-login endpoint to add. |
| Add bot protection | Turnstile client and server verification are implemented and tested. Activation flags, site key, server secret, hostname, and action must be configured together. It is not active by default. |
| Parameterize queries | Runtime data access uses tagged, parameterized SQL. Lead session context and its query run in one transaction. |
| Validate all input | Strict schemas, streamed body limits, origin checks, URL safety, and route-specific bounds cover exposed operations. Signed upload callbacks retain their provider-specific verification. |
| Escape user content | Reviewed text still passes escaped HTML rendering. Provider instructions treat source text, strategy, and brief values as untrusted data. |
| Restrict file uploads | Existing ownership, PDF signature/type/size, expiry, and replay controls remain; upload request JSON is now bounded. |
| Trim API responses | Public projections exclude editor tokens, private source ledgers, internal strategy receipts, and sensitive delivery state. Rendered production copy is public content, not private diagnostics. |
| Add security headers | Local production HTTP checks returned CSP, nosniff, referrer, permissions, framing, and HSTS headers. Generated experience routes retain their nonce-based policy. The app shell permits inline Next scripts and is not described as a strict nonce-only CSP. |
| Force HTTPS | A fixed-host production redirect and HSTS are configured. The edge must own the forwarded-protocol header. No live production redirect test or release was performed. |
| Scan dependencies | `npm audit --audit-level=high` reports zero vulnerabilities. The js-yaml advisory was remediated. CI now includes dependency and pinned secret-scanning checks; remote CI has not run for this branch. |

The generated client-bundle scan produced one private-key alert. Inspection traced it to the `jose` dependency's generic `format_pem.js` template, not key material. No real PEM block or configured server-secret value was present. No broad allowlist was added.

## Verification receipts

- Full suite after the completion-audit fixes: 1,899 passed, zero failed, one skipped. A subsequent sentence-boundary correction passed all 33 focused writer and production integration tests.
- Type checking passed. Lint passed with three pre-existing unused-variable warnings in `cloudflare-upload-contract.test.ts`.
- Both Turbopack and Webpack production builds passed after the final runtime changes.
- Buyer-journey benchmark: 49 tests passed, including refreshed compiled review samples and retained-section assertions.
- Security and API checkpoint: 156 focused tests passed before `ee59f31`.
- Six synthetic fixtures were checked at 1440, 1024, and 390 pixels. No horizontal overflow or missing navigation target was found. One first-load image was pending during the initial pass; its settled recheck loaded correctly.
- The mobile fallback CTA scrolled to the actual next-step section, verified in the viewport after the animation. The production-built app opened its company-domain intake without a browser console error.
- The production-built app shell rendered in the connected browser with its security headers. A foreign-origin create request returned 403. With production backends intentionally absent, a private read returned 503 from the fail-closed limiter; unit/API tests cover the authorization decision itself.
- Fixture images are explicitly synthetic test assets, not verified screenshots of the named products.

Review material: [manifest](../output/buyer-journey-validation/manifest.json) and [blinded copy samples](../output/buyer-journey-validation/blind-review.json). Rebuild with `EMIT_BUYER_JOURNEY_EVIDENCE=1 npm run benchmark:buyer-journey`. Serve the output directory locally for browser inspection. Do not publish these synthetic examples as customer evidence.

## Activation still required

1. Approve a staging and production rollout. Verify the exact Vercel project and database before changing either.
2. On an isolated database branch, apply missing migration 010, then 011. Provision a separate application login that inherits only `try_me_runtime`, does not own tables, and has neither superuser nor BYPASSRLS. Provision a distinct maintenance login. Do not put login passwords in Git or in SQL files.
3. Set the application's restricted `DATABASE_URL`, the server-only `DATABASE_MAINTENANCE_URL`, and `DATABASE_RLS_ENABLED=true`. Run `node scripts/verify-database-security.mjs`, then test permitted lead access and denied cross-session reads/writes with synthetic records. The other eight tables use trusted service policies, not tenant-specific row isolation.
4. Configure the encryption key ring through the secret manager. Enable encrypted writes, migrate old Blob/Redis records, verify readback and rollback, then set `SENSITIVE_STORAGE_ALLOW_LEGACY_PLAINTEXT=false`. Retain old decryption keys for their full data-retention window. Database field-level encryption would be a separate schema and workflow change.
5. Configure both Turnstile flags and the public site key at build time, plus the server-only secret, exact hostname, and `session_create` action. Test valid, invalid, expired, and missing challenges on the intended host. See [Turnstile activation](security-turnstile-activation.md).
6. Deploy the verified branch, check anonymous rendering and private editor access, confirm HTTPS and headers at the public edge, then monitor errors and completion/fallback rates.
7. Run blinded human review before enabling a controlled experiment. Fix the eligible audience, randomization unit, qualified-conversion definition, downstream outcome window, exclusion rules, and analysis horizon in advance. The sample-size floor in the helper is a guard, not a statistical power calculation.

## Rollback

No rollback was needed. All runtime changes passed the checks above.

For code rollback, revert `da87f5c`, then `be8eb92`, then `ee59f31`, then `6c5c7de` on a recovery branch and rerun `npm run qa`. Preserve the three unrelated screenshots. Do not use `git reset --hard` or restore the entire working tree.

Database and encryption activation need their own recovery plan. Code rollback alone does not undo RLS, restore role ownership, migrate encrypted records, or recover retired keys. Keep the previous deployment and previous server configuration available until staging and production checks pass. No production data or credentials were changed during this implementation.
