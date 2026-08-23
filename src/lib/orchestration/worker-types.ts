export type PreviewWorkerKind =
  | "brand-identity"
  | "brand-enrichment"
  | "account-research"
  | "source-intelligence"
  | "audience-strategy"
  | "message-spine"
  | "composition"
  | "render";

export type ProductionWorkerKind =
  | "identity-normalizer"
  | "brandfetch-retriever"
  | "dom-css-harvester"
  | "screenshot-analyst"
  | "company-researcher"
  | "offer-researcher"
  | "audience-strategist"
  | "objective-cta-strategist"
  | "evidence-reconciler"
  | "framework-ranker"
  | "wireframe-ranker"
  | "brand-compiler"
  | "message-spine-architect"
  | "opening-writer"
  | "problem-urgency-writer"
  | "exploration-writer"
  | "mechanism-proof-writer"
  | "team-cta-writer"
  | "copy-factuality-editor"
  | "spec-compiler-qa";

export type WorkerKind = PreviewWorkerKind | ProductionWorkerKind;
export type WorkerKindV2 = WorkerKind;

export type PreviewWorkerStatus =
  | "queued"
  | "running"
  | "completed"
  | "fallback"
  | "timed_out"
  | "failed"
  | "stale"
  | "needs_input";

export interface WorkerEvidenceRef {
  id: string;
  source?: string;
  kind?: string;
}

export interface EvidenceValue<T> {
  value: T;
  source: string;
  confidence: number;
  observedAt: string;
  revision: number;
}

export interface ProductionArtifact<T> {
  worker: WorkerKind;
  sessionId: string;
  revision: number;
  status: "complete" | "fallback" | "timed_out" | "failed" | "stale" | "needs_input";
  value?: T;
  evidenceRefs: string[];
  confidence: number;
  startedAt: string;
  completedAt: string;
  fallbackCode?: string;
  errorCode?: string;
  userRequest?: {
    kind: "logo" | "brand_guide" | "screenshot" | "source_url";
    prompt: string;
  };
}

export type ProductionArtifactV2<T> = ProductionArtifact<T>;

export interface WorkerReceipt {
  worker: WorkerKind;
  status: Exclude<PreviewWorkerStatus, "queued" | "running">;
  queuedAt: string;
  startedAt?: string;
  completedAt: string;
  durationMs?: number;
  evidenceRefs: WorkerEvidenceRef[];
  confidence?: number;
  artifactRef?: string;
  dependencies: WorkerKind[];
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
  sessionId?: string;
  revision?: number;
}

export interface PreviewWorkerTask<T> {
  worker: WorkerKind;
  timeoutMs: number;
  dependencies?: WorkerKind[];
  run: (context: WorkerContext) => Promise<WorkerResult<T> | T>;
}

export interface WorkerExecution<T> {
  receipt: WorkerReceipt;
  value?: T;
}
