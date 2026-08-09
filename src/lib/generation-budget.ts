export interface GenerationBudgetOptions {
  totalMs: number;
  finalizationReserveMs: number;
}

export interface GenerationBudget {
  eligibleAt: number;
  deadlineAt: number;
  finalizationAt: number;
  totalMs: number;
  finalizationReserveMs: number;
  elapsedMs: number;
  remainingMs: number;
  remainingBeforeFinalizationMs: number;
}

/**
 * Creates a single monotonic customer-facing budget for a generation revision.
 * It does not authorize a weaker artifact: callers still own brand, source,
 * claim, and stale-input gates. It only decides whether optional work has time
 * to start without stealing the finalization reserve.
 */
export function generationBudgetFor(
  eligibleAt: number,
  options: GenerationBudgetOptions,
  now = Date.now()
): GenerationBudget {
  const totalMs = Math.max(1, Math.round(options.totalMs));
  const finalizationReserveMs = Math.max(
    0,
    Math.min(totalMs, Math.round(options.finalizationReserveMs))
  );
  const deadlineAt = eligibleAt + totalMs;
  const finalizationAt = deadlineAt - finalizationReserveMs;
  return {
    eligibleAt,
    deadlineAt,
    finalizationAt,
    totalMs,
    finalizationReserveMs,
    elapsedMs: Math.max(0, now - eligibleAt),
    remainingMs: Math.max(0, deadlineAt - now),
    remainingBeforeFinalizationMs: Math.max(0, finalizationAt - now)
  };
}

export function canStartOptionalRefinement(
  budget: GenerationBudget,
  requiredMs: number
): boolean {
  return budget.remainingBeforeFinalizationMs >= Math.max(1, Math.round(requiredMs));
}

export function timingMetaForGenerationBudget(budget: GenerationBudget) {
  return {
    budgetMs: budget.totalMs,
    finalizationReserveMs: budget.finalizationReserveMs,
    elapsedMs: budget.elapsedMs,
    remainingMs: budget.remainingMs,
    remainingBeforeFinalizationMs: budget.remainingBeforeFinalizationMs,
    deadlineAt: new Date(budget.deadlineAt).toISOString(),
    finalizationAt: new Date(budget.finalizationAt).toISOString()
  };
}
