# Observable brand intelligence: evidence package

Generated from the working tree, not hand-written. Regenerate everything with:

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:preview
npm run qa
npm run qa:visual:folloze
npm run test:e2e -- --project=desktop
gitleaks git . --log-opts='--all' --redact=100 --no-banner
EMIT_BUILD_TRACE_EVIDENCE=1 npx vitest run scripts/emit-build-trace-evidence.test.ts
```

The last command writes the artifacts below from a real fixture compile through
the production path. Without the environment variable it still runs, asserting
the same privacy and quality properties without touching the files, so a normal
`npm test` keeps the emitter honest.

## Artifacts

| File | What it shows |
| --- | --- |
| `build-trace.json` | The serialized private BuildTrace for one committed attempt. |
| `build-trace-timeline.txt` | The same trace as the support CLI renders it. |
| `brand-and-asset-manifest.json` | Brand role selections, asset allocations, and fidelity scores. |
| `latency.json` | p50/p95 for a fixture compile including trace assembly. |
| `qa.log` | `npm run qa`: lint, types, unit tests, Turbopack build, webpack build. |
| `unit-tests.log` | Full unit run with file and test counts. |
| `benchmark.log` | `npm run benchmark:preview`. |
| `visual.log` | `npm run qa:visual:folloze`. |
| `e2e-desktop.log` | Full desktop Playwright project. |
| `gitleaks.log` | Full-history secret scan. |

## Privacy

Every value in the trace is a digest, an enum code, or a bounded identifier.
The emitter asserts `findBuildTracePrivacyViolations` returns empty and that the
rendered timeline contains no company name, URL, or address before writing.

## Brand archetype matrix

Fixtures live in `tests/fixtures/brand-fidelity/archetypes.ts` and are described
as evidence shapes rather than companies, so no production branch can key off
them. Behaviour is asserted in `src/lib/brand-fidelity-evaluator.test.ts`.

| Archetype | Evidence shape | Compiler must |
| --- | --- | --- |
| `monochrome-pill` | Near-black ink, white surface, one saturated action colour, pill controls | Resolve action colour, geometry, and typography with no warnings |
| `high-color-rounded` | Several saturated colours, large card radii, heavy display weight | Keep decorative colours out of the durable roles; resolve all three |
| `conservative-enterprise` | Navy and grey, compact spacing, 4px radii, single accent | Resolve a modest representative radius, not a house default |
| `editorial-serif` | Serif display and body, warm paper surface, square geometry | Classify serif character; resolve a near-zero radius |
| `sparse-logo-only` | Two colours, no geometry or typography observed | Decline to resolve geometry and typography, and warn |
| `contradictory-evidence` | Promotional overlay and third-party directory disagree with the site | Exclude both from durable roles, keep the site's own values, and warn |
