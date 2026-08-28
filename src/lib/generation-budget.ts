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

/**
 * Hard customer deadline gate: after T+60s, no new external provider work may
 * begin. Deterministic assembly and persistence remain allowed.
 */
export function canStartExternalWork(budget: GenerationBudget): boolean {
  return budget.remainingMs > 0;
}

/**
 * Phase checkpoints as a fraction of the customer deadline, taken from the
 * approved budget table (2s/15s/22s/44s/52s/59s of 60s). Expressed as fractions
 * so a shortened deadline in a test or a slower environment compresses every
 * phase proportionally instead of starving the last one.
 */
export const BUILD_PHASE_CHECKPOINT_FRACTIONS = {
  queued: 2 / 60,
  researching: 15 / 60,
  planning: 22 / 60,
  writing: 44 / 60,
  checking: 52 / 60,
  finalizing: 59 / 60
} as const;

export type BuildPhaseCheckpoint = keyof typeof BUILD_PHASE_CHECKPOINT_FRACTIONS;

/** Absolute wall-clock instant by which a phase should have handed over. */
export function phaseCheckpointAt(
  budget: GenerationBudget,
  phase: BuildPhaseCheckpoint
): number {
  return budget.eligibleAt + Math.round(budget.totalMs * BUILD_PHASE_CHECKPOINT_FRACTIONS[phase]);
}

/**
 * How long a provider may run inside one phase.
 *
 * Three limits apply and the smallest always wins: the caller's own requested
 * timeout, the time left before this phase must hand over, and the time left
 * before the finalization reserve. A worker-specific timeout can therefore
 * never push work past the customer deadline. This is why the function returns a
 * number the caller must use rather than a boolean it may ignore.
 */
export function providerBudgetMsForPhase(
  budget: GenerationBudget,
  phase: BuildPhaseCheckpoint,
  requestedMs: number,
  now = Date.now()
): number {
  const untilPhaseHandover = phaseCheckpointAt(budget, phase) - now;
  const untilFinalization = budget.finalizationAt - now;
  return Math.max(
    0,
    Math.min(
      Math.max(0, Math.round(requestedMs)),
      Math.round(untilPhaseHandover),
      Math.round(untilFinalization)
    )
  );
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
