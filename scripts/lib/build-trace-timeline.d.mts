import type { BuildTraceV1 } from "@/lib/build-trace";

export declare function renderBuildTraceTimeline(trace: BuildTraceV1 | unknown): string;

export declare function renderBuildTraceReport(
  reference: string,
  traces: readonly (BuildTraceV1 | unknown)[]
): string;
