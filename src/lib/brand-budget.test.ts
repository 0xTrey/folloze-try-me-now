import { describe, expect, it, vi } from "vitest";

import { createBrandBudget } from "@/lib/brand-budget";

describe("brand fast-path budget", () => {
  it("never grants a provider more time than remains in the shared deadline", () => {
    let time = 1_000;
    const now = vi.fn(() => time);
    const budget = createBrandBudget(30, now);

    expect(budget.deadlineAt).toBe(1_030);
    time = 1_012;
    expect(budget.remainingMs()).toBe(18);
    expect(budget.timeoutMsFor(8_000)).toBe(18);
    expect(budget.signalFor(8_000)).toBeInstanceOf(AbortSignal);
    time = 1_035;
    expect(budget.timeoutMsFor(8_000)).toBe(0);
    expect(budget.exhausted()).toBe(true);
  });
});
