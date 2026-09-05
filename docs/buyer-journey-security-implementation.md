# Buyer journey and security implementation

Implement the approved buyer-journey improvements while preserving a fast public builder, private editing access, and public buyer experiences. Quality scores are diagnostic checks, not conversion predictions.

## Recovery boundary

- Starting commit: `a188486` on `codex/messaging-compiler-v1`.
- Implementation branch: `codex/buyer-journey-security`.
- Preserve the three pre-existing modified PNGs in `output/product-owner-remediation/`.
- Save completed logical changes as commits after focused verification. Do not stage unrelated files.
- Revert only this implementation's commits if verification exposes a regression. Do not reset or discard the working tree.
- Deployment, secret rotation, database migration, and Git history rewriting are separate operations with separate receipts. Do not silently change production configuration.

## Product acceptance checklist

| # | Improvement | Required acceptance signal | State |
| --- | --- | --- | --- |
| 1 | Buyer-decision brief | Product, audience, traffic, stage, buyer question, and seller action have explicit values or labelled unknowns. | In progress |
| 2 | Exact product resolution | Broad categories cannot silently become the promoted product; ambiguous products have a focused clarification. | In progress |
| 3 | Reusable product knowledge | Source-backed product, proof, and voice context has versioned cache identity, freshness, and invalidation. | In progress |
| 4 | Distinct messaging strategies | Candidate arguments differ in evidence-backed rationale, not only headline wrappers. | In progress |
| 5 | Account relevance | Account context connects to a supported seller capability without assuming private pain; substitution is evaluated. | In progress |
| 6 | Buyer-question journey | Buyer questions and available evidence determine the page sequence before final layout selection. | In progress |
| 7 | Deterministic wireframe fit | Eligible candidates compete on explicit fit factors with stable ties and an uncertainty receipt. | In progress |
| 8 | Actual proof and asset inputs | Evidence count and image count cannot masquerade as proof or asset quality. | In progress |
| 9 | Section assignments | Each section owns a buyer question, conclusion, claim, evidence, objection, and transition. | In progress |
| 10 | Earned modular composition | Unsupported optional sections are omitted; compatible compositions respect mobile and content constraints. | In progress |
| 11 | Hero comprehension | Opening explains the actual product or workflow and buyer relevance in concrete language. | In progress |
| 12 | Recognizable problem | Current friction is evidence-backed; unsupported urgency and generic problem padding are rejected. | In progress |
| 13 | Product mechanism | Mechanism copy explains supported actions and outputs without inventing features. | In progress |
| 14 | Claim-matched proof | Proof type, relevance, source scope, and exact quantified claims are checked. | In progress |
| 15 | Purchase friction | Relevant known objections are addressed; unknown pricing, security, and implementation facts are not fabricated. | In progress |
| 16 | Concrete CTA offer | Action, destination, buyer benefit, and next-step expectations remain consistent. | In progress |
| 17 | Meaning-based editorial review | Whole-page review catches repeated arguments, unsupported claims, and unclear buyer value beyond keyword checks. | In progress |
| 18 | Useful fallback copy | No padding to minimum length, internal review instructions, or broken sentence truncation. | In progress |
| 19 | Buyer-ready performance | Reusable context and section-level change detection preserve bounded generation; latency and fallback use are measured together. | In progress |
| 20 | Outcome learning | Representative benchmark, blind-review export, and controlled experiment measurement distinguish diagnostics from observed conversions. | In progress |

## Security acceptance checklist

| Control | Required evidence | State |
| --- | --- | --- |
| Hide API keys | Server-only boundaries, client bundle checks, and redacted errors/logs. | Audit in progress |
| Purge secrets from Git | Redacted current-tree and history scan; exact remediation targets if any are confirmed. | Audit in progress |
| Expose only public DB key | No privileged database credential in browser code. This app currently uses server-side Neon, not a public database key. | Audit in progress |
| Row-level security | Reviewed migrations, runtime-role boundary, and separate live verification status. | Audit in progress |
| Encrypt sensitive data | Data inventory, storage encryption behavior, application protections, and key-rotation plan. | Audit in progress |
| Server-side authentication | Every private editor operation validates its server-issued capability. | Audit in progress |
| Record access | Cross-session access and public/private projections have regression tests. | Audit in progress |
| Field tampering | Strict writable-field allowlists and server-owned state. | Audit in progress |
| Session cookies | HttpOnly, Secure in HTTPS environments, SameSite, expiry, scope, and CSRF protections. | Audit in progress |
| Password hashing | Passwordless editor capability design confirmed; no unnecessary password system introduced. | Audit in progress |
| Login rate limiting | Applicable capability, session creation, claim, and recovery abuse controls. | Audit in progress |
| Bot protection | Server-verified abuse challenge where configured, with an explicit activation receipt. | Audit in progress |
| Parameterized queries | No user-controlled SQL interpolation in runtime data access. | Audit in progress |
| Input validation | Size, type, shape, origin, URL, and boundary checks on exposed operations. | Audit in progress |
| User-content escaping | Safe rendering and generated-content boundaries, including adversarial fixtures. | Audit in progress |
| File upload restrictions | PDF type/signature/size checks, expiry, authorization, and replay resistance. | Audit in progress |
| Minimal API responses | Private evidence, PII, credentials, and internal artifacts excluded from public payloads. | Audit in progress |
| Security headers | App and generated-experience headers tested without breaking required integrations. | Audit in progress |
| HTTPS | Production redirect/transport policy and HSTS verification separated from local development. | Audit in progress |
| Dependency scanning | Current package audit plus repeatable CI checks and reviewed remediation. | Audit in progress |

## Verification and release receipts

Record focused checks for each logical change, followed by lint, type checking, the complete unit suite, production builds, and representative browser checks. Keep fixture verification, live-provider generation, production release, and conversion results separate. Do not call a deployment-only control enabled based on code alone.

The security review is an AI-assisted first pass, not a substitute for a professional security audit or penetration test.
