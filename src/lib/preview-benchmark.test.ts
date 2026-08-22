import { describe, expect, it } from "vitest";

import {
  evaluatePreviewBenchmark,
  PREVIEW_BENCHMARK_ROUTES,
  PREVIEW_SLO_MS,
  type PreviewBenchmarkSample
} from "@/lib/preview-benchmark";

const routeFixtures: PreviewBenchmarkSample[] = [
  { route: "abm", shellMs: 1_100, provisionalMs: 16_000, terminalMs: 72_000, outcome: "ready" },
  { route: "campaign", shellMs: 900, provisionalMs: 14_000, terminalMs: 61_000, outcome: "ready" },
  { route: "event", shellMs: 1_000, provisionalMs: 18_000, terminalMs: 74_000, outcome: "ready" },
  { route: "content", shellMs: 1_200, provisionalMs: 24_000, terminalMs: 89_000, outcome: "provisional" }
];

describe("90-second app-hosted HTML preview benchmark", () => {
  it("covers ABM, campaign, event, and content with one fail-soft SLO", () => {
    const results = evaluatePreviewBenchmark(routeFixtures);

    expect(results.map(({ route }) => route)).toEqual(PREVIEW_BENCHMARK_ROUTES);
    expect(results.every(({ passed }) => passed)).toBe(true);
    expect(results.find(({ route }) => route === "content")).toMatchObject({
      outcome: "provisional",
      terminalMs: 89_000,
      passed: true
    });
    expect(PREVIEW_SLO_MS).toEqual({ shell: 5_000, provisional: 30_000, terminal: 90_000 });
  });

  it("reports the precise checkpoint breach without hiding a slow route", () => {
    const results = evaluatePreviewBenchmark(
      routeFixtures.map((sample) =>
        sample.route === "event" ? { ...sample, terminalMs: 90_001 } : sample
      )
    );

    expect(results.find(({ route }) => route === "event")).toMatchObject({
      passed: false,
      breaches: ["terminal"]
    });
  });

  it("fails closed when any public route is absent from the benchmark", () => {
    expect(() => evaluatePreviewBenchmark(routeFixtures.slice(0, 3))).toThrow(
      "Preview benchmark is missing route coverage: content"
    );
  });
});
