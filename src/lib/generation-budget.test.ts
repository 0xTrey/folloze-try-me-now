import { describe, expect, it } from "vitest";

import {
  canStartExternalWork,
  canStartOptionalRefinement,
  generationBudgetFor,
  timingMetaForGenerationBudget
} from "@/lib/generation-budget";

const options = { totalMs: 60_000, finalizationReserveMs: 5_000 };

describe("generation budget", () => {
  it("reserves the final five seconds of the 60-second customer contract", () => {
    const budget = generationBudgetFor(1_000, options, 31_000);

    expect(budget).toMatchObject({
      deadlineAt: 61_000,
      finalizationAt: 56_000,
      elapsedMs: 30_000,
      remainingMs: 30_000,
      remainingBeforeFinalizationMs: 25_000
    });
    expect(canStartOptionalRefinement(budget, 25_000)).toBe(true);
  });

  it("does not start a 25-second optional refinement after the T+30 cutoff", () => {
    const budget = generationBudgetFor(1_000, options, 31_001);

    expect(budget.remainingBeforeFinalizationMs).toBe(24_999);
    expect(canStartOptionalRefinement(budget, 25_000)).toBe(false);
  });

  it("refuses any new external work after the shared 60-second deadline", () => {
    const before = generationBudgetFor(1_000, options, 60_999);
    const after = generationBudgetFor(1_000, options, 61_000);

    expect(canStartExternalWork(before)).toBe(true);
    expect(canStartExternalWork(after)).toBe(false);
  });

  it("keeps deterministic timing evidence bounded and reproducible", () => {
    const budget = generationBudgetFor(0, options, 60_500);

    expect(timingMetaForGenerationBudget(budget)).toEqual({
      budgetMs: 60_000,
      finalizationReserveMs: 5_000,
      elapsedMs: 60_500,
      remainingMs: 0,
      remainingBeforeFinalizationMs: 0,
      deadlineAt: "1970-01-01T00:01:00.000Z",
      finalizationAt: "1970-01-01T00:00:55.000Z"
    });
  });
});
