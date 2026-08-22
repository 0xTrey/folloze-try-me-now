export type PreviewWorkerKind =
  | "brand-identity"
  | "brand-enrichment"
  | "account-research"
  | "source-intelligence"
  | "audience-strategy"
  | "message-spine"
  | "composition"
  | "render";

export type PreviewWorkerStatus =
  | "queued"
  | "running"
  | "completed"
  | "fallback"
  | "timed_out"
  | "failed"
  | "stale";

export interface WorkerEvidenceRef {
  id: string;
  source?: string;
  kind?: string;
}

export interface WorkerReceipt {
  worker: PreviewWorkerKind;
  status: Exclude<PreviewWorkerStatus, "queued" | "running">;
  queuedAt: string;
  startedAt?: string;
  completedAt: string;
  durationMs?: number;
  evidenceRefs: WorkerEvidenceRef[];
  confidence?: number;
  artifactRef?: string;
  dependencies: PreviewWorkerKind[];
  fallback?: string;
  error?: { name: string; message: string };
}

export interface WorkerResult<T> {
  value?: T;
  evidenceRefs?: WorkerEvidenceRef[];
  confidence?: number;
  artifactRef?: string;
  fallback?: string;
}

export interface WorkerContext {
  signal: AbortSignal;
  fingerprint: string;
}

export interface PreviewWorkerTask<T> {
  worker: PreviewWorkerKind;
  timeoutMs: number;
  dependencies?: PreviewWorkerKind[];
  run: (context: WorkerContext) => Promise<WorkerResult<T> | T>;
}

export interface WorkerExecution<T> {
  receipt: WorkerReceipt;
  value?: T;
}
