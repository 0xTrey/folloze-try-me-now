import type { BuildTraceV1 } from "@/lib/build-trace";
import { saveBuildTrace, type BuildTraceSaveResult } from "@/lib/build-trace-store";
import type { TryMeSession } from "@/lib/types";

/**
 * Retains the private trace for an attempt the session actually kept.
 *
 * Persisting during assembly would leave a record of a build no visitor ever
 * saw whenever the later compare-and-set loses. The committed session is the
 * only place that knows which attempt and revision won, so the write happens
 * here, fenced by both, and never propagates a failure into the preview.
 */
export async function retainCommittedBuildTrace(input: {
  committed: TryMeSession | null | undefined;
  trace: BuildTraceV1;
  attemptId: string;
}): Promise<BuildTraceSaveResult | undefined> {
  const committed = input.committed;
  if (!committed) return undefined;
  if (committed.stages.story.attemptId !== input.attemptId) return undefined;
  try {
    return await saveBuildTrace({
      trace: input.trace,
      committedRevision: committed.revision
    });
  } catch {
    return undefined;
  }
}
