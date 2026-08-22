import type {
  PreviewWorkerTask,
  WorkerExecution,
  WorkerReceipt,
  WorkerResult
} from "./worker-types";

export interface PreviewWorkerWaveOptions {
  fingerprint: string;
  currentFingerprint: () => string;
  now?: () => Date;
}

function errorDetails(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error)
  };
}

function resultFor<T>(result: WorkerResult<T> | T): WorkerResult<T> {
  if (
    result !== null &&
    typeof result === "object" &&
    ("value" in result || "evidenceRefs" in result || "confidence" in result || "artifactRef" in result || "fallback" in result)
  ) return result as WorkerResult<T>;
  return { value: result as T };
}

function timeoutError(ms: number): Error {
  return new Error(`Worker timed out after ${ms}ms`);
}

async function executeTask<T>(
  task: PreviewWorkerTask<T>,
  options: PreviewWorkerWaveOptions,
  queuedAt: Date
): Promise<WorkerExecution<T>> {
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const started = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Defer invocation into a promise so a synchronously thrown worker is
  // represented by a failed receipt just like an asynchronously rejected one.
  const work = Promise.resolve().then(() =>
    task.run({ signal: controller.signal, fingerprint: options.fingerprint })
  );
  const timed = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(timeoutError(task.timeoutMs));
      reject(timeoutError(task.timeoutMs));
    }, task.timeoutMs);
  });
  try {
    const raw = await Promise.race([work, timed]);
    const result = resultFor(raw);
    const completedAt = now();
    const stale = options.currentFingerprint() !== options.fingerprint;
    const receipt: WorkerReceipt = {
      worker: task.worker,
      status: stale ? "stale" : result.fallback ? "fallback" : "completed",
      queuedAt: queuedAt.toISOString(),
      startedAt: started.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - started.getTime()),
      evidenceRefs: result.evidenceRefs ?? [],
      confidence: result.confidence,
      artifactRef: result.artifactRef,
      dependencies: task.dependencies ?? [],
      fallback: result.fallback
    };
    return { receipt, value: stale ? undefined : result.value };
  } catch (error) {
    const completedAt = now();
    const timedOut = error instanceof Error && /timed out/i.test(error.message);
    return {
      receipt: {
        worker: task.worker,
        status: timedOut ? "timed_out" : "failed",
        queuedAt: queuedAt.toISOString(),
        startedAt: started.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - started.getTime()),
        evidenceRefs: [],
        dependencies: task.dependencies ?? [],
        error: errorDetails(error)
      }
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Runs independent preview workers concurrently and returns every receipt. */
export async function runPreviewWorkerWave(
  tasks: PreviewWorkerTask<unknown>[],
  options: PreviewWorkerWaveOptions
): Promise<WorkerExecution<unknown>[]> {
  const queuedAt = (options.now ?? (() => new Date()))();
  return Promise.all(tasks.map((task) => executeTask(task, options, queuedAt)));
}
