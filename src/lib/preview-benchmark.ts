export const PREVIEW_BENCHMARK_ROUTES = ["abm", "campaign", "event", "content"] as const;

export type PreviewBenchmarkRoute = (typeof PREVIEW_BENCHMARK_ROUTES)[number];

/** Customer-visible contract: shell by 5s, provisional by 15s, terminal by 60s. */
export const PREVIEW_SLO_MS = {
  shell: 5_000,
  provisional: 15_000,
  terminal: 60_000
} as const;

export interface PreviewBenchmarkSample {
  route: PreviewBenchmarkRoute;
  shellMs: number;
  provisionalMs: number;
  terminalMs: number;
  outcome: "ready" | "provisional";
}

export interface PreviewBenchmarkResult extends PreviewBenchmarkSample {
  passed: boolean;
  breaches: Array<keyof typeof PREVIEW_SLO_MS>;
}

/**
 * Route-complete service-level contract for the public HTML preview. A safe
 * provisional result is acceptable at the terminal boundary; a missing page
 * is not. Deep Folloze release lifecycle work is intentionally absent.
 */
export function evaluatePreviewBenchmark(
  samples: PreviewBenchmarkSample[]
): PreviewBenchmarkResult[] {
  const seen = new Set(samples.map(({ route }) => route));
  const missing = PREVIEW_BENCHMARK_ROUTES.filter((route) => !seen.has(route));
  if (missing.length) {
    throw new Error(`Preview benchmark is missing route coverage: ${missing.join(", ")}`);
  }
  return samples.map((sample) => {
    const breaches = (Object.keys(PREVIEW_SLO_MS) as Array<keyof typeof PREVIEW_SLO_MS>)
      .filter((checkpoint) => sample[`${checkpoint}Ms`] > PREVIEW_SLO_MS[checkpoint]);
    return { ...sample, passed: breaches.length === 0, breaches };
  });
}
