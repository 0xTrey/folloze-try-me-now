# Codex Acceptance Matrix

Cursor completion claims are advisory. Codex reruns every P0 gate and a representative subset of P1 through P3 from the resulting tree.

## P0 hard gates

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| P0-01 | Lint, types, unit tests, Turbopack build, and webpack build pass. | `npm run qa` |
| P0-02 | Existing benchmark remains green. | `npm run benchmark:preview` |
| P0-03 | No live secret or credential enters tracked files or history. | Gitleaks full-history scan with zero findings. |
| P0-04 | Public payload and existing sessions remain backward-compatible. | Schema, decoder, session, and renderer regression tests. |
| P0-05 | BuildTrace contains no raw email, domain, URL query, prompt, response, HTML, source body, token, or credential. | Privacy-negative unit and integration tests. |
| P0-06 | PostHog remains behavior-only and nonblocking. | Projection, config, route, and failure tests. |
| P0-07 | Visual evaluation never blocks a valid provisional render. | Partial and contradictory evidence tests. |
| P0-08 | No company-specific production branch or literal is added. | Repo search plus generalized fixture review. |
| P0-09 | Substantive images do not repeat. | Allocation unit tests and DOM assertion across each rendered fixture. |
| P0-10 | Every section has a writing contract and provenance receipt. | BuildTrace schema and runtime fixture assertions. |

Any P0 failure rejects the build.

## P1 engine quality

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| P1-01 | Framework and wireframe decisions retain candidates, scores, evidence, and reason codes. | Serialized BuildTrace fixture. |
| P1-02 | Brand roles retain source authority, candidate distribution, selection reasons, and confidence. | Brand decision trace fixture. |
| P1-03 | Geometry uses representative distributions by component class. | Mixed-radius and mixed-density tests. |
| P1-04 | Temporary promotions and overlays cannot become the main brand system without corroboration. | Overlay exclusion fixture. |
| P1-05 | Section copy names a specific audience, offer, problem, value, and next step where the section contract requires them. | Multi-brand and multi-family copy fixtures. |
| P1-06 | Unsupported claims and internal production language are rejected. | Adversarial copy tests. |
| P1-07 | Cross-section repetition stays below the defined similarity threshold. | Similarity and repeated-opening tests. |
| P1-08 | Provider failure still produces coherent section-specific copy. | Timeout and malformed-provider fixture. |
| P1-09 | Trace write failure never blocks the preview. | Store-failure test. |
| P1-10 | A support reference reconstructs committed decisions only. | CAS, retry, stale-revision, and CLI inspection tests. |

## P2 behavior and privacy

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| P2-01 | Product events have stable names, areas, section titles, and idempotent IDs. | Contract and browser tests. |
| P2-02 | Engagement analytics appears only at the final section or by explicit action. | Desktop E2E. |
| P2-03 | Elapsed time is accurate and does not claim depth before evidence exists. | Fake-clock and sparse-state tests. |
| P2-04 | Simulation remains labeled and separate from captured leads. | Analytics UI test. |
| P2-05 | PostHog receives no private construction details. | Captured-request ledger assertion. |
| P2-06 | Session replay remains disabled by default and fully masked when enabled. | PostHog config test. |
| P2-07 | Keyboard focus, Escape, focus return, and background inert behavior work in analytics surfaces. | Accessibility E2E. |

## P3 visual and performance

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| P3-01 | Launch, Guide, and Align render without overflow at 1280px and 1440px. | Playwright desktop assertions and screenshots. |
| P3-02 | At least five brand archetypes exercise different palettes, geometry, typography, and imagery behavior. | Fixture matrix and visual manifest. |
| P3-03 | Images are first-party, delivered safely, role-appropriate, unique, and unbroken. | Manifest plus DOM and HTTP assertions. |
| P3-04 | Text and actions pass contrast and readability checks. | Automated contrast assertions. |
| P3-05 | Trace fanout stays at or below 500ms and is nonblocking. | Timing tests and receipt. |
| P3-06 | Provisional target remains at or below 15 seconds and final target at or below 55 seconds in the fixture benchmark. | p50 and p95 benchmark receipt. |

## Required commands

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:preview
npm run qa
npm run qa:visual:folloze
npm run test:e2e -- --project=desktop
gitleaks git . --log-opts='--all' --redact=100 --no-banner
```

Run the mobile project only for changed shared surfaces. The product remains desktop-first, but changes must not make the existing mobile shell unusable.

## Required evidence package

- commit list and `git status`
- command results with test counts and failures
- fixture by family matrix
- sanitized serialized BuildTrace and support reference
- brand-decision and asset-allocation manifests
- PostHog request projection fixture
- privacy-negative test result
- latency p50 and p95
- first-viewport and full-page desktop screenshots
- residual risk list

Unexpected skips, hidden failures, missing evidence, weakened tests, or an unreproducible clean-checkout command reject the build.
