import type {
  PreviewWorkerTask,
  ProductionArtifact,
  WorkerExecution,
  WorkerKind,
  WorkerReceipt,
  WorkerResult
} from "./worker-types";

export interface PreviewWorkerWaveOptions {
  fingerprint: string;
  currentFingerprint: () => string;
  now?: () => Date;
  /**
   * Shared wall-clock ceiling for the whole parallel wave. Unfinished workers
   * receive fallback receipts instead of extending past the customer promise.
   */
  waveDeadlineMs?: number;
  /** Wall-clock moment after which no new external work may begin. */
  externalWorkDeadlineAt?: number;
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

function waveDeadlineError(ms: number): Error {
  return new Error(`Worker wave deadline elapsed after ${ms}ms`);
}

/** True when optional or late external work may still begin. */
export function canStartExternalWork(
  deadlineAt: number | undefined,
  now = Date.now()
): boolean {
  if (deadlineAt === undefined) return true;
  return now < deadlineAt;
}

export function blockedExternalWorkReceipt(
  worker: WorkerKind,
  queuedAt: Date,
  completedAt: Date,
  dependencies: WorkerKind[] = []
): WorkerReceipt {
  return {
    worker,
    status: "fallback",
    queuedAt: queuedAt.toISOString(),
    startedAt: queuedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - queuedAt.getTime()),
    evidenceRefs: [],
    dependencies,
    fallback: "No new external work started after the shared generation deadline."
  };
}

async function executeTask<T>(
  task: PreviewWorkerTask<T>,
  options: PreviewWorkerWaveOptions,
  queuedAt: Date
): Promise<WorkerExecution<T>> {
  const now = options.now ?? (() => new Date());
  const startedClock = now();

  if (!canStartExternalWork(options.externalWorkDeadlineAt, startedClock.getTime())) {
    return {
      receipt: blockedExternalWorkReceipt(
        task.worker,
        queuedAt,
        startedClock,
        task.dependencies ?? []
      )
    };
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waveTimer: ReturnType<typeof setTimeout> | undefined;
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
  const waveLimited =
    options.waveDeadlineMs === undefined
      ? null
      : new Promise<never>((_, reject) => {
          const remaining = Math.max(
            0,
            options.waveDeadlineMs! - Math.max(0, startedClock.getTime() - queuedAt.getTime())
          );
          waveTimer = setTimeout(() => {
            controller.abort(waveDeadlineError(options.waveDeadlineMs!));
            reject(waveDeadlineError(options.waveDeadlineMs!));
          }, remaining);
        });
  try {
    const raw = await Promise.race(
      waveLimited ? [work, timed, waveLimited] : [work, timed]
    );
    const result = resultFor(raw);
    const completedAt = now();
    const stale = options.currentFingerprint() !== options.fingerprint;
    const receipt: WorkerReceipt = {
      worker: task.worker,
      status: stale ? "stale" : result.fallback ? "fallback" : "completed",
      queuedAt: queuedAt.toISOString(),
      startedAt: startedClock.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedClock.getTime()),
      evidenceRefs: result.evidenceRefs ?? [],
      confidence: result.confidence,
      artifactRef: result.artifactRef,
      dependencies: task.dependencies ?? [],
      fallback: result.fallback
    };
    return { receipt, value: stale ? undefined : result.value };
  } catch (error) {
    const completedAt = now();
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timed out/i.test(message);
    const waveExpired = /wave deadline/i.test(message);
    return {
      receipt: {
        worker: task.worker,
        status: waveExpired ? "fallback" : timedOut ? "timed_out" : "failed",
        queuedAt: queuedAt.toISOString(),
        startedAt: startedClock.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedClock.getTime()),
        evidenceRefs: [],
        dependencies: task.dependencies ?? [],
        ...(waveExpired
          ? {
              fallback:
                "Parallel research hit its wave deadline; the best honest artifact is preserved."
            }
          : { error: errorDetails(error) })
      }
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (waveTimer) clearTimeout(waveTimer);
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

export interface ProductionWorkerWaveOptions extends PreviewWorkerWaveOptions {
  sessionId: string;
  revision: number;
  currentRevision: () => number;
}

/**
 * Runs the same deadline- and fingerprint-fenced worker boundary used by the
 * existing preview path, then projects each execution into the revisioned
 * production artifact contract. Stale revisions never carry a value.
 */
export async function runProductionWorkerWave(
  tasks: PreviewWorkerTask<unknown>[],
  options: ProductionWorkerWaveOptions
): Promise<ProductionArtifact<unknown>[]> {
  const executions = await runPreviewWorkerWave(
    tasks.map((task) => ({
      ...task,
      run: (context) =>
        task.run({
          ...context,
          sessionId: options.sessionId,
          revision: options.revision
        })
    })),
    options
  );

  return executions.map(({ receipt, value }) => {
    const revisionStale = options.currentRevision() !== options.revision;
    const status = revisionStale ? "stale" : receipt.status === "completed" ? "complete" : receipt.status;
    return {
      worker: receipt.worker,
      sessionId: options.sessionId,
      revision: options.revision,
      status,
      ...(status === "complete" && value !== undefined ? { value } : {}),
      evidenceRefs: receipt.evidenceRefs.map(({ id }) => id),
      confidence: receipt.confidence ?? 0,
      startedAt: receipt.startedAt ?? receipt.queuedAt,
      completedAt: receipt.completedAt,
      ...(receipt.fallback ? { fallbackCode: "worker_fallback" } : {}),
      ...(receipt.error ? { errorCode: receipt.error.name } : {})
    };
  });
}
