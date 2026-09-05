# Buyer journey and security status

The September 5 release is live at the [production URL](https://folloze-try-me-now.vercel.app). Tested runtime commit `6b7cfe2` is pushed to both `codex/buyer-journey-security` and `production`. Deployment `dpl_4txynfL9EKGoEFvsBfuXDnTCthb6` is READY and owns the canonical alias. Restricted database access, forced RLS, Turnstile, encrypted writes, strict encrypted reads, and public security headers are active.

## Saved checkpoints

| Commit | Scope |
| --- | --- |
| `d471e61` | Acceptance plan and recovery boundary |
| `6c5c7de` | Shorter fallback copy and complete sentence boundaries |
| `ee59f31` | Request security, bot verification, encrypted storage, database-role preparation, and dependency remediation |
| `be8eb92` | Buyer brief, source knowledge, evidence-aware selection, section writing and review, CTA consistency, rendering, and evaluation fixtures |
| `da87f5c` | Completion-audit fixes for product-scoped proof and purchase-answer evidence through writers, review, and rendered HTML |
| `8794148` | Sentence-boundary correction and saved implementation status |
| `09f27e4` | Database cross-session verification, conditional Blob migration, and browser-contract updates |
| `559461b` | Browser expectations aligned with the approved next-step chooser and earned sections |
| `6b7cfe2` | Preserved reviewed campaign/content copy, buyer-facing fallback navigation, and production rollout receipts |

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
| 11 | Clearer hero | Opening copy names the offer and buyer; a scoped seller claim explains the product where available. Campaign and content previews preserve the canonical reviewed draft instead of overwriting it with seller-category copy. The renderer also ignores legacy campaign/content personalization overlays. Actual comprehension still needs human review. |
| 12 | Supported problem | Workflow context is distinguished from account context. Unsupported friction is removed, and invented urgency is rejected. |
| 13 | Product mechanism | Source capability and workflow claims reach section writers. Unknown mechanisms remain validation questions rather than invented features. |
| 14 | Scoped proof | Customer outcomes and quantified results require explicit types, permitted use, public source scope, past-result language, and a match to the selected product. Source extraction binds proof to its own quote or section, not another section sharing a citation. Unresolved product identity cannot authorize proof. No-proof journeys use a walkthrough question. |
| 15 | Purchase questions | Verified pricing, security, and implementation answers can add a purchase-question module. A regression follows a synthetic published price through the section contract and fallback into rendered HTML. Missing facts remain unknown. |
| 16 | Concrete CTA | One shared contract controls label, destination, and expectation. Source links do not promise a completed registration. Missing destinations use an existing next-step anchor, without claiming a booking. Secret-bearing URLs are rejected. |
| 17 | Whole-page editorial review | A bounded structured model review checks meaning, unsupported claims, repetition, and CTA continuity. Repairs affect at most two sections. A failed rereview cannot clear an existing blocker. Live campaign generation was smoke-tested, but both samples used the legacy fallback after section acceptance fell below its coherence gate. This is not live validation of every section-review path. |
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
| Enable row-level security | Migrations 010 and 011 were tested on an isolated schema-only branch and applied to production. All nine tables have forced RLS. The application login owns no tables, has neither superuser nor BYPASSRLS, inherits only the runtime role, and is separate from maintenance. Synthetic lead probes verified allowed own-session access and denied cross-session reads, updates, and inserts. The other eight tables use trusted service policies, not tenant-specific row isolation. |
| Encrypt sensitive data | Production writes use AES-256-GCM envelopes for Blob sessions and Blob lead receipts. The migration encrypted 277 existing records with authenticated readback and no conflicts or failures. One new live record was already encrypted. A strict-read audit authenticated all 278 records and found no plaintext. Strict mode is deployed, and a real session was recovered and rebuilt under that mode. Production does not use Redis. SQL lead email remains application-readable and depends on provider encryption at rest, which was not independently verified. |
| Enforce server-side auth | Private editor reads and mutations validate the server-issued editor capability. Public buyer pages keep a separate public projection. |
| Lock record access | Cross-session and capability checks are covered by API tests. Database-level lead isolation passed actual allowed and denied operations on both the canary and production branches. Synthetic probe records were removed after verification. |
| Block field tampering | Strict schemas separate writable answers from server-owned state. Unknown properties and invalid field types are rejected. |
| Secure session cookies | Editor cookies are HttpOnly, SameSite=Lax, scoped to `/api/sessions`, time-limited, and Secure in production. Cross-origin JSON mutations are rejected. |
| Hash passwords | There is no password login. Random editor capabilities are stored as SHA-256 hashes and compared in constant time. This is not a password-hashing scheme and should not be reused as one. |
| Rate limit login | Applicable creation, editor, claim, recovery, and related routes have abuse limits. Production fails closed without a distributed limiter. There is no password-login endpoint to add. |
| Add bot protection | Both Turnstile flags, the site key, server secret, exact production hostname, and `session_create` action are active. A real browser completed the protected session flow. Missing and invalid tokens returned 403; cross-origin creation also returned 403. Expired and replayed real tokens were not separately exercised in the live browser. |
| Parameterize queries | Runtime data access uses tagged, parameterized SQL. Lead session context and its query run in one transaction. |
| Validate all input | Strict schemas, streamed body limits, origin checks, URL safety, and route-specific bounds cover exposed operations. Signed upload callbacks retain their provider-specific verification. |
| Escape user content | Reviewed text still passes escaped HTML rendering. Provider instructions treat source text, strategy, and brief values as untrusted data. |
| Restrict file uploads | Existing ownership, PDF signature/type/size, expiry, and replay controls remain; upload request JSON is now bounded. |
| Trim API responses | Public projections exclude editor tokens, private source ledgers, internal strategy receipts, and sensitive delivery state. Rendered production copy is public content, not private diagnostics. |
| Add security headers | The public production URL returns CSP, nosniff, referrer, permissions, framing, and HSTS headers. Generated experience routes retain their nonce-based policy. The app shell permits inline Next scripts and is not described as a strict nonce-only CSP. |
| Force HTTPS | The live HTTP URL returned 308 to the canonical HTTPS URL, which returned 200 with HSTS. The edge must own the forwarded-protocol header. |
| Scan dependencies | `npm audit --audit-level=high` reports zero vulnerabilities. The js-yaml advisory was remediated. Remote CI passed dependency and pinned full-history secret scans. |

The generated client-bundle scan produced one private-key alert. Inspection traced it to the `jose` dependency's generic `format_pem.js` template, not key material. No real PEM block or configured server-secret value was present. No broad allowlist was added.

## Verification receipts

- [GitHub quality gate 33997924983](https://github.com/0xTrey/folloze-try-me-now/actions/runs/33997924983) passed at released runtime commit `6b7cfe2`: 1,909 tests passed, one skipped, 101 desktop browser tests passed, both production builds passed, and the dependency and Git-history scans passed.
- Strict deployment `dpl_4A7vhDihYJxSesmgsLapekWvwmyR` was promoted and verified. The `production` branch was then fast-forwarded to the identical tested commit without rewriting history. Its Git-triggered deployment `dpl_4txynfL9EKGoEFvsBfuXDnTCthb6` is READY, owns the canonical alias, and returned production-capable health.
- The rebuilt Folloze sample preserved the canonical hero, shared CTA, and buyer-facing navigation. It reached a persisted, read-back final artifact. The existing editor cookie recovered the encrypted session; anonymous editor and recovery requests returned 403. Public generated HTML returned 200 with nonce-based CSP and no-store headers.
- The live engagement panel captured the selected topic and section. Desktop, compact-desktop, and mobile checks at 1440, 1024, and 390 pixels found no horizontal overflow in the shell or iframe; the mobile image check found no broken images. No lead claim, email, Folloze save, or Folloze publication was performed.
- [GitHub quality gate 33997221090](https://github.com/0xTrey/folloze-try-me-now/actions/runs/33997221090) passed at `559461b`: 1,906 tests passed, one skipped, 101 desktop browser tests passed, both production builds passed, and no dependency vulnerabilities or confirmed Git secrets were found.
- Production deployment `dpl_HHUhhVLQ1fJAFb8Xay73x58wC2gQ` was promoted to the canonical URL after those checks. Health reported production-capable sessions, leads, generation, and distributed limits. The bounded post-promotion log query returned no 5xx requests.
- Visual inspection of the first Folloze sample caught a late personalization overlay replacing the canonical hero and CTA with a seller website phrase. The follow-up fixed that overwrite and passed a fresh production readback.
- Current preview and development environment values route to a separate private Blob store. Production retains its original store and data. The old store attachment still lists all three environments, and older immutable deployments retain their historical credentials. Environment routing is verified; historical credential revocation and attachment cleanup are not completed security receipts.
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

## Remaining measurement and hardening

1. Review thin-evidence copy with humans and measure fallback rates. Both live smoke builds used the legacy artifact fallback after `GPE_MINIMUM_SECTIONS_UNAVAILABLE`. They verified end-to-end generation, storage, and the preview fix, not successful live acceptance of every section-writer path or a conversion improvement.
2. Exercise expiration and replay with real Turnstile tokens. Missing, invalid, and valid live challenges were checked. See [Turnstile activation](security-turnstile-activation.md).
3. Run blinded human review before enabling a controlled experiment. Fix the eligible audience, randomization unit, qualified-conversion definition, downstream outcome window, exclusion rules, and analysis horizon in advance. The sample-size floor in the helper is a guard, not a statistical power calculation.
4. Clean up the historical multi-environment Blob attachment and rotate historical credentials through a coordinated redeployment. Current environment values use distinct stores, but old deployment credentials have not been revoked. Do not mistake environment metadata changes for credential revocation.

## Rollback

After encryption, do not promote a pre-security deployment: it cannot read encrypted records. Deployment `dpl_4A7vhDihYJxSesmgsLapekWvwmyR` is an already-verified copy of the released code with strict encryption and the preview fix. The earlier encrypted-write deployment `dpl_HHUhhVLQ1fJAFb8Xay73x58wC2gQ` can read authenticated envelopes and, if required, legacy plaintext. It still uses restricted database credentials and Turnstile, but contains the preview-copy defect, so a forward fix is preferred.

The earlier compatibility deployment `dpl_AH3CxbqTwjYUrU8gYoLDkTqyQT6a` can decrypt with the retained key ring but writes plaintext. It is an emergency recovery option only, not an acceptable steady state. Do not delete or regenerate the configured key ring during rollback; retain decryption keys for the complete retention window.

The pre-migration Neon recovery branch is `br-bold-fire-amhxaudb`, retained through September 19, 2026. The schema-only canary is `br-rough-river-am3ah18y`, expiring September 12. The source database is shared with other work: never rewind the whole database for this app. Recover only this application's tables, policies, and role changes after identifying the exact impact.

Use `node scripts/verify-database-security.mjs` for metadata, and `node scripts/verify-database-cross-session.mjs` with an explicit expected host for a synthetic behavior probe. The Blob migration defaults to dry-run; `--apply` uses conditional writes and authenticated readback. `vercel env run` preserves ambient variables, so unset local `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` when auditing remote configuration. Never print connection strings, tokens, keys, or decrypted records.

No destructive Git rollback was performed. The three unrelated screenshots remain unmodified by this rollout and uncommitted.
