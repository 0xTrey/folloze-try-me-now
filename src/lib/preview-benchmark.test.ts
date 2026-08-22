import { describe, expect, it } from "vitest";

import {
  evaluatePreviewBenchmark,
  PREVIEW_BENCHMARK_ROUTES,
  PREVIEW_SLO_MS,
  type PreviewBenchmarkSample
} from "@/lib/preview-benchmark";
import { createSingleFlight } from "@/lib/orchestration/single-flight";
import {
  canStartExternalWork,
  runPreviewWorkerWave
} from "@/lib/orchestration/preview-worker-coordinator";
import {
  isMaterialBriefEligible,
  planEarlyResearch
} from "@/lib/orchestration/research-plan";
import {
  canStartExternalWork as budgetAllowsExternalWork,
  generationBudgetFor
} from "@/lib/generation-budget";

const routeFixtures: PreviewBenchmarkSample[] = [
  { route: "abm", shellMs: 1_100, provisionalMs: 12_000, terminalMs: 48_000, outcome: "ready" },
  { route: "campaign", shellMs: 900, provisionalMs: 11_000, terminalMs: 52_000, outcome: "ready" },
  { route: "event", shellMs: 1_000, provisionalMs: 13_000, terminalMs: 55_000, outcome: "ready" },
  { route: "content", shellMs: 1_200, provisionalMs: 14_500, terminalMs: 59_000, outcome: "provisional" }
];

describe("60-second app-hosted HTML preview benchmark", () => {
  it("covers ABM, campaign, event, and content with the 15s/60s fixture contract (U11)", () => {
    const results = evaluatePreviewBenchmark(routeFixtures);

    expect(results.map(({ route }) => route)).toEqual(PREVIEW_BENCHMARK_ROUTES);
    expect(results.every(({ passed }) => passed)).toBe(true);
    expect(results.find(({ route }) => route === "content")).toMatchObject({
      outcome: "provisional",
      terminalMs: 59_000,
      passed: true
    });
    expect(PREVIEW_SLO_MS).toEqual({ shell: 5_000, provisional: 15_000, terminal: 60_000 });
  });

  it("reports the precise checkpoint breach without hiding a slow route", () => {
    const results = evaluatePreviewBenchmark(
      routeFixtures.map((sample) =>
        sample.route === "event" ? { ...sample, terminalMs: 60_001 } : sample
      )
    );

    expect(results.find(({ route }) => route === "event")).toMatchObject({
      passed: false,
      breaches: ["terminal"]
    });
  });

  it("fails provisional samples that miss the 15-second fixture ceiling", () => {
    const results = evaluatePreviewBenchmark(
      routeFixtures.map((sample) =>
        sample.route === "campaign" ? { ...sample, provisionalMs: 15_001 } : sample
      )
    );
    expect(results.find(({ route }) => route === "campaign")).toMatchObject({
      passed: false,
      breaches: ["provisional"]
    });
  });

  it("fails closed when any public route is absent from the benchmark", () => {
    expect(() => evaluatePreviewBenchmark(routeFixtures.slice(0, 3))).toThrow(
      "Preview benchmark is missing route coverage: content"
    );
  });
});

describe("unified research orchestration benchmark contracts", () => {
  it("covers early start before material brief eligibility", () => {
    const plan = planEarlyResearch({
      useCase: "abm",
      companyDomain: "northpeak.com",
      answers: { targetDomain: "acme.com" }
    });
    expect(plan.generationEligible).toBe(false);
    expect(plan.jobs.map((job) => job.reason)).toEqual([
      "seller_domain_stabilized",
      "target_domain_stabilized"
    ]);
    expect(
      isMaterialBriefEligible("abm", {
        targetDomain: "acme.com",
        audience: "Platform leaders",
        objective: "Book a meeting"
      })
    ).toBe(true);
  });

  it("covers single-flight dedupe for stabilized seller domains", async () => {
    const flight = createSingleFlight<string, string>((key) => key.trim().toLowerCase());
    const factory = async () => "seller-brand";
    const [a, b] = await Promise.all([
      flight.run(" NorthPeak.com ", factory),
      flight.run("northpeak.com", factory)
    ]);
    expect([a, b]).toEqual(["seller-brand", "seller-brand"]);
  });

  it("covers bounded deadlines that refuse new external work after 60 seconds", () => {
    const budget = generationBudgetFor(0, { totalMs: 60_000, finalizationReserveMs: 5_000 }, 60_000);
    expect(budgetAllowsExternalWork(budget)).toBe(false);
    expect(canStartExternalWork(budget.deadlineAt)).toBe(false);
  });

  it("covers safe fallback receipts when optional enrichment fails", async () => {
    const results = await runPreviewWorkerWave(
      [
        {
          worker: "brand-enrichment",
          timeoutMs: 50,
          run: async () => ({
            fallback: "Optional enrichment failed; kept the honest provisional artifact."
          })
        }
      ],
      { fingerprint: "bench-v1", currentFingerprint: () => "bench-v1" }
    );
    expect(results[0].receipt.status).toBe("fallback");
    expect(results[0].receipt.fallback).toMatch(/honest provisional/i);
  });

  it("covers stale worker results that cannot replace a newer revision", async () => {
    let fingerprint = "rev-1";
    const results = await runPreviewWorkerWave(
      [
        {
          worker: "render",
          timeoutMs: 50,
          run: async () => {
            fingerprint = "rev-2";
            return { value: { html: "stale" }, artifactRef: "rev-1" };
          }
        }
      ],
      { fingerprint: "rev-1", currentFingerprint: () => fingerprint }
    );
    expect(results[0].receipt.status).toBe("stale");
    expect(results[0].value).toBeUndefined();
  });
});
