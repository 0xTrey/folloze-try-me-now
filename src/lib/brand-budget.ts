/**
 * A small, monotonic budget shared by the synchronous brand fast path. It is
 * deliberately independent from the longer-lived background enrichment work:
 * callers can refuse another provider attempt once the first-preview budget is
 * gone instead of letting individually reasonable timeouts add up.
 */
export interface BrandBudget {
  readonly deadlineAt: number;
  remainingMs(): number;
  exhausted(): boolean;
  timeoutMsFor(requestedMs: number): number;
  signalFor(requestedMs: number): AbortSignal;
}

export function createBrandBudget(
  totalMs = 15_000,
  now: () => number = Date.now
): BrandBudget {
  const boundedTotal = Math.max(1, Math.min(Math.floor(totalMs), 60_000));
  const deadlineAt = now() + boundedTotal;

  const remainingMs = () => Math.max(0, deadlineAt - now());
  const timeoutMsFor = (requestedMs: number) => {
    const boundedRequested = Math.max(1, Math.floor(requestedMs));
    return Math.max(0, Math.min(boundedRequested, remainingMs()));
  };
  return {
    deadlineAt,
    remainingMs,
    exhausted: () => remainingMs() <= 0,
    timeoutMsFor,
    signalFor(requestedMs: number) {
      const timeoutMs = timeoutMsFor(requestedMs);
      if (timeoutMs <= 0) {
        return AbortSignal.abort(new Error("The brand fast-path budget was exhausted."));
      }
      return AbortSignal.timeout(timeoutMs);
    }
  };
}
