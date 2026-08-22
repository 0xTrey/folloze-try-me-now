# Codex Grading Scorecard

Codex uses this only after Cursor completes, Trey reviews the local build, and Trey says his review is complete.

## Score

| Dimension | Points | Full-credit standard |
| --- | ---: | --- |
| Brand fidelity | 25 | Correct identity/logo; role-aware colors; typography, geometry, imagery, and density match public evidence; honest fallback. |
| Messaging and copy | 20 | Specific buyer story; clear mechanism and proof plan; strong headlines; no filler, jargon, invented claims, or repetition. |
| Composition and visual design | 15 | Correct internal wireframe choice; coherent 4-8 section journey; strong first viewport; readable full-page capture; useful interaction. |
| Research and evidence | 10 | Early parallel research; provenance/confidence; canonical alias handling; recommendations grounded in current evidence. |
| Guided UX and timing | 10 | One question at a time; three choices plus free-form; editable Live Brief; honest receipts; useful result under 60 seconds. |
| Reliability and fallback | 10 | Revision fencing, single-flight, deadlines, deterministic fallback, no blank/broken state, at most one visual repair. |
| Observability and privacy | 5 | Reconstructable trace and useful product analytics without raw sensitive content. |
| QA, accessibility, and evidence | 5 | Full QA, benchmark, desktop E2E, keyboard/accessibility, and three-brand screenshots. |
| **Total** | **100** |  |

## Grade bands

- 95-100: exceptional; ready for guarded release planning.
- 90-94: strong; small polish or provider verification remains.
- 80-89: useful build; material experience gaps remain.
- 70-79: partial; implementation works but misses the product promise.
- below 70: not acceptable for prospect testing.

## Score caps

- Missing verified logo or wrong seller identity: maximum 75.
- Palette role grossly wrong for any golden brand: maximum 79.
- Invented claim/statistic/customer: maximum 69.
- Placeholder, broken image, blank page, or permanent spinner: maximum 69.
- Final preview exceeds 60 seconds in contracted benchmark: maximum 79.
- Stale revision can overwrite current output: maximum 69.
- Raw input/secret in logs: maximum 59.
- Failing `npm run qa` or desktop E2E: maximum 69.
- Push/deploy/Folloze mutation without authorization: automatic fail.

## Grading evidence

Codex will inspect:

1. Cursor handback and acceptance matrix;
2. branch diff and commit boundaries;
3. exact current-run tests;
4. trace receipts and privacy assertions;
5. first-viewport and full-page screenshots;
6. live local desktop flows for multiple brands;
7. Trey's review comments;
8. any discrepancy between claimed and independently verified behavior.

## Final report format

```text
CURSOR GRADE: NN/100 (band)
Brand: NN/25
Copy: NN/20
Composition: NN/15
Research: NN/10
UX/timing: NN/10
Reliability: NN/10
Observability: NN/5
QA: NN/5

What Cursor did best
What missed the contract
What Trey's review changed
Recommended fixes before release
Architecture changes I would make in hindsight
Release recommendation: hold | guarded preview | ready for release planning
```
