import { describe, expect, it } from "vitest";

import {
  generationAttemptKey,
  generationPerformanceDashboardRows,
  summarizeGenerationPerformance,
  type GenerationPerformanceRecord
} from "@/lib/generation-performance";

function record(
  event: GenerationPerformanceRecord["event"],
  attemptId: string,
  offsetMs: number,
  options: Partial<GenerationPerformanceRecord> = {}
): GenerationPerformanceRecord {
  return {
    event,
    at: new Date(Date.UTC(2026, 7, 9, 12, 0, 0) + offsetMs).toISOString(),
    outcome: "success",
    spanId: attemptId,
    ...options
  };
}

describe("generation performance contract", () => {
  it("reports the 15-second provisional and 60-second terminal budgets across three motions", () => {
    const records = [
      record("generation_eligible", "abm-a", 0),
      record("preview_provisional_ready", "abm-a", 8_000),
      record("preview_ready", "abm-a", 45_000),
      record("generation_eligible", "campaign-b", 60_000),
      record("preview_provisional_ready", "campaign-b", 75_000),
      record("generation_completed", "campaign-b", 84_000, {
        meta: { source: "deterministic-fallback", fallbackReason: "model_timeout" }
      }),
      record("preview_ready", "campaign-b", 118_000),
      record("generation_eligible", "content-c", 120_000),
      record("preview_provisional_ready", "content-c", 132_000),
      record("preview_ready", "content-c", 179_000)
    ];

    const summary = summarizeGenerationPerformance(records);

    expect(summary.attemptsObserved).toBe(3);
    expect(summary.eligibleToProvisional).toMatchObject({
      count: 3,
      p50Ms: 12_000,
      p95Ms: 15_000,
      underTargetCount: 3,
      underTargetRate: 1
    });
    expect(summary.eligibleToTerminal).toMatchObject({
      count: 3,
      p50Ms: 58_000,
      p95Ms: 59_000,
      underTargetCount: 3,
      underTargetRate: 1
    });
    expect(summary.fallbackAttempts).toBe(1);
  });

  it("excludes discarded retries and marks unresolved attempts incomplete", () => {
    const summary = summarizeGenerationPerformance([
      record("generation_eligible", "superseded", 0),
      record("generation_discarded", "superseded", 2_000),
      record("generation_eligible", "pending", 3_000),
      record("preview_provisional_ready", "pending", 10_000),
      record("generation_eligible", "failed", 20_000),
      record("generation_failed", "failed", 30_000, { outcome: "error" })
    ]);

    expect(summary).toMatchObject({
      attemptsObserved: 3,
      excludedDiscardedAttempts: 1,
      incompleteAttempts: 1,
      failedAttempts: 1,
      terminalAttempts: 0
    });
    expect(summary.eligibleToTerminal.count).toBe(0);
  });

  it("rejects unsafe metadata rather than using raw customer or provider content", () => {
    const summary = summarizeGenerationPerformance([
      record("generation_eligible", "safe", 0),
      record("preview_provisional_ready", "unsafe", 1_000, {
        meta: { sourceUrl: "https://private.example/customer-brief" }
      }),
      record("preview_ready", "unsafe-token", 2_000, {
        meta: { fallbackReason: "sk-secret-value" }
      })
    ]);

    expect(summary.unsafeRecordsRejected).toBe(2);
    expect(summary.attemptsObserved).toBe(1);
    expect(generationAttemptKey(record("generation_eligible", "safe", 0))).toBe("safe");
    expect(generationAttemptKey({
      event: "generation_eligible",
      at: new Date().toISOString(),
      outcome: "started",
      meta: { attemptId: "legacy-attempt" }
    })).toBe("legacy-attempt");
  });

  it("returns aggregate-only dashboard rows and refuses to call a small sample healthy", () => {
    const summary = summarizeGenerationPerformance([
      record("generation_eligible", "one", 0),
      record("preview_provisional_ready", "one", 5_000),
      record("preview_ready", "one", 20_000)
    ]);
    const rows = generationPerformanceDashboardRows(summary);

    expect(rows).toContainEqual(expect.objectContaining({
      metric: "eligible_to_provisional_p95_ms",
      value: 5_000,
      targetMs: 15_000,
      status: "insufficient-data"
    }));
    expect(JSON.stringify(rows)).not.toContain("one");
  });
});
