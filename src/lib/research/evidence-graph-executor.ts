import {
  planResearchLanesV2,
  researchLaneOrderV2,
  type ResearchLaneIdV2,
  type ResearchLaneV2,
  type ResearchQueryPlanV2
} from "@/lib/orchestration/research-query-plan-v2";

import {
  EVIDENCE_GRAPH_SCHEMA_VERSION,
  evidenceGapCode,
  evidenceGraphDigest,
  evidenceGraphTraceReceipt,
  evidenceUnknownGapCode,
  normalizeEntityName,
  sortEvidenceGraphParts,
  unknownEvidenceClaim,
  type EvidenceClaimCandidate,
  type EvidenceEntity,
  type EvidenceGraph,
  type EvidenceGraphLaneReceipt,
  type EvidenceGraphTraceReceipt,
  type EvidenceLaneOutcome,
  type EvidenceRelationship
} from "./evidence-graph";
import {
  reconcileEvidenceGraphClaims,
  type EvidenceClaimConflict
} from "./evidence-reconciler";

/** Time held back from the lanes so reconciliation finishes inside the deadline. */
export const DEFAULT_EVIDENCE_RECONCILE_RESERVE_MS = 100;

export interface EvidenceLaneContext {
  laneId: ResearchLaneIdV2;
  lane: ResearchLaneV2;
  revision: number;
  inputFingerprint: string;
  /** Aborted when the lane budget elapses or the caller aborts. */
  signal: AbortSignal;
  laneBudgetMs: number;
  now: () => number;
}

export interface EvidenceLaneResult {
  entities?: readonly EvidenceEntity[];
  candidates?: readonly EvidenceClaimCandidate[];
  relationships?: readonly EvidenceRelationship[];
  gaps?: readonly string[];
  outcome?: EvidenceLaneOutcome;
}

export type EvidenceLaneRunner = (
  context: EvidenceLaneContext
) => Promise<EvidenceLaneResult | undefined>;

export type EvidenceLaneRunners = Partial<
  Record<ResearchLaneIdV2, EvidenceLaneRunner>
>;

export interface EvidenceTopicRequirement {
  subjectId: string;
  topic: string;
}

export interface ExecuteEvidenceGraphInput {
  /** Bounded plan from `buildResearchQueryPlanV2`. */
  plan: ResearchQueryPlanV2;
  revision: number;
  /** Current session revision. A mismatch returns a stale, claim-free graph. */
  activeRevision?: number;
  inputFingerprint: string;
  /** Total wall-clock budget owned by the caller, not read from a global clock. */
  deadlineMs: number;
  signal?: AbortSignal;
  now?: () => number;
  /** Injectable lane execution. Unserved lanes are recorded as skipped gaps. */
  lanes?: EvidenceLaneRunners;
  seedEntities?: readonly EvidenceEntity[];
  seedCandidates?: readonly EvidenceClaimCandidate[];
  /** Named absences known before execution, such as an unanswered question. */
  seedGaps?: readonly string[];
  /** Topics that must resolve to a claim or an explicit unknown. */
  requiredTopics?: readonly EvidenceTopicRequirement[];
  reconcileReserveMs?: number;
}

export interface EvidenceGraphRun {
  graph: EvidenceGraph;
  digest: string;
  receipts: EvidenceGraphLaneReceipt[];
  trace: EvidenceGraphTraceReceipt;
  conflicts: EvidenceClaimConflict[];
}

interface LaneExecution {
  laneId: ResearchLaneIdV2;
  outcome: EvidenceLaneOutcome;
  durationMs: number;
  queryCount: number;
  result: EvidenceLaneResult | undefined;
}

function timingKey(laneId: string): string {
  return `lane_${laneId.replace(/[^a-z0-9]+/gi, "_").toLocaleLowerCase()}`;
}

function boundedDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

async function runLane(input: {
  lane: ResearchLaneV2;
  runner: EvidenceLaneRunner | undefined;
  revision: number;
  inputFingerprint: string;
  budgetMs: number;
  parentSignal: AbortSignal | undefined;
  now: () => number;
}): Promise<LaneExecution> {
  const startedAt = input.now();
  const base = {
    laneId: input.lane.id,
    queryCount: input.lane.queries.length
  };
  if (!input.runner) {
    return { ...base, outcome: "skipped", durationMs: 0, result: undefined };
  }
  if (input.parentSignal?.aborted) {
    return { ...base, outcome: "aborted", durationMs: 0, result: undefined };
  }
  if (input.budgetMs <= 0) {
    return { ...base, outcome: "timeout", durationMs: 0, result: undefined };
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  input.parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const expiry = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: "timeout" });
      }, input.budgetMs);
    });
    const attempt = input
      .runner({
        laneId: input.lane.id,
        lane: input.lane,
        revision: input.revision,
        inputFingerprint: input.inputFingerprint,
        signal: controller.signal,
        laneBudgetMs: input.budgetMs,
        now: input.now
      })
      .then(
        (result) => ({ kind: "settled", result }) as const,
        () => ({ kind: "failed" }) as const
      );
    const raced = await Promise.race([attempt, expiry]);
    const durationMs = boundedDuration(input.now() - startedAt);

    if (raced.kind === "timeout") {
      return { ...base, outcome: "timeout", durationMs, result: undefined };
    }
    if (raced.kind === "failed") {
      const outcome: EvidenceLaneOutcome = input.parentSignal?.aborted
        ? "aborted"
        : "error";
      return { ...base, outcome, durationMs, result: undefined };
    }
    const result = raced.result;
    const produced =
      (result?.entities?.length ?? 0) +
      (result?.candidates?.length ?? 0) +
      (result?.relationships?.length ?? 0);
    return {
      ...base,
      outcome: result?.outcome ?? (produced > 0 ? "ok" : "empty"),
      durationMs,
      result
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    input.parentSignal?.removeEventListener("abort", abortFromParent);
    controller.abort();
  }
}

function mergeEntities(
  groups: readonly (readonly EvidenceEntity[])[]
): EvidenceEntity[] {
  const merged = new Map<string, EvidenceEntity>();
  for (const group of groups) {
    for (const entity of group) {
      const id = entity.id.trim();
      const canonicalName = normalizeEntityName(entity.canonicalName);
      if (!id || !canonicalName) continue;
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, {
          id,
          kind: entity.kind,
          canonicalName,
          aliases: entity.aliases.map(normalizeEntityName).filter(Boolean)
        });
        continue;
      }
      const aliases = new Set(existing.aliases);
      for (const alias of entity.aliases.map(normalizeEntityName)) {
        if (alias && alias !== existing.canonicalName) aliases.add(alias);
      }
      if (canonicalName !== existing.canonicalName) aliases.add(canonicalName);
      merged.set(id, { ...existing, aliases: [...aliases] });
    }
  }
  return [...merged.values()];
}

function pruneRelationships(input: {
  relationships: readonly EvidenceRelationship[];
  entityIds: ReadonlySet<string>;
  claimIds: ReadonlySet<string>;
}): { relationships: EvidenceRelationship[]; prunedCount: number } {
  const relationships: EvidenceRelationship[] = [];
  let prunedCount = 0;
  for (const relationship of input.relationships) {
    const from = relationship.from.trim();
    const to = relationship.to.trim();
    const kind = relationship.kind.trim();
    const evidenceRefs = [
      ...new Set(relationship.evidenceRefs.filter((ref) => input.claimIds.has(ref)))
    ].sort();
    if (
      !kind ||
      !input.entityIds.has(from) ||
      !input.entityIds.has(to) ||
      evidenceRefs.length === 0
    ) {
      prunedCount += 1;
      continue;
    }
    relationships.push({ from, to, kind, evidenceRefs });
  }
  return { relationships, prunedCount };
}

function staleGraph(input: ExecuteEvidenceGraphInput): EvidenceGraph {
  return {
    schemaVersion: EVIDENCE_GRAPH_SCHEMA_VERSION,
    revision: input.revision,
    inputFingerprint: input.inputFingerprint,
    entities: [],
    claims: [],
    relationships: [],
    gaps: [evidenceGapCode("revision", "stale")],
    timings: { total: 0 }
  };
}

/**
 * Runs every planned lane in parallel inside one caller-owned deadline and
 * reconciles the results into a single typed graph.
 *
 * A lane that overruns its budget is aborted and recorded as a gap. It never
 * contributes a claim, and it never delays the graph past the deadline.
 */
export async function executeEvidenceGraphRun(
  input: ExecuteEvidenceGraphInput
): Promise<EvidenceGraphRun> {
  const now = input.now ?? Date.now;
  const startedAt = now();

  if (
    input.activeRevision !== undefined &&
    input.activeRevision !== input.revision
  ) {
    const graph = staleGraph(input);
    return {
      graph,
      digest: evidenceGraphDigest(graph),
      receipts: [],
      trace: evidenceGraphTraceReceipt(graph, []),
      conflicts: []
    };
  }

  const reserveMs = Math.max(
    0,
    input.reconcileReserveMs ?? DEFAULT_EVIDENCE_RECONCILE_RESERVE_MS
  );
  const budgetMs = Math.max(0, Math.floor(input.deadlineMs) - reserveMs);
  const lanes = planResearchLanesV2(input.plan);
  const executions = await Promise.all(
    lanes.map((lane) =>
      runLane({
        lane,
        runner: input.lanes?.[lane.id],
        revision: input.revision,
        inputFingerprint: input.inputFingerprint,
        budgetMs,
        parentSignal: input.signal,
        now
      })
    )
  );
  const reconcileStartedAt = now();

  const ordered = [...executions].sort(
    (left, right) =>
      researchLaneOrderV2.indexOf(left.laneId) -
      researchLaneOrderV2.indexOf(right.laneId)
  );
  const entities = mergeEntities([
    input.seedEntities ?? [],
    ...ordered.map((execution) => execution.result?.entities ?? [])
  ]);
  const reconciled = reconcileEvidenceGraphClaims([
    ...(input.seedCandidates ?? []),
    ...ordered.flatMap((execution) => execution.result?.candidates ?? [])
  ]);

  const claims = [...reconciled.claims];
  const gaps = new Set<string>();
  for (const gap of input.seedGaps ?? []) {
    const trimmed = gap.trim();
    if (trimmed) gaps.add(trimmed);
  }
  for (const execution of ordered) {
    if (execution.outcome !== "ok") {
      gaps.add(evidenceGapCode(execution.laneId, execution.outcome));
    }
    for (const gap of execution.result?.gaps ?? []) {
      const trimmed = gap.trim();
      if (trimmed) gaps.add(trimmed);
    }
  }

  const resolvedTopics = new Set(
    reconciled.coverage
      .filter((entry) => entry.status !== "unknown")
      .map((entry) => `${entry.subjectId}\u0000${entry.topic}`)
  );
  for (const requirement of input.requiredTopics ?? []) {
    const subjectId = requirement.subjectId.trim();
    const topic = requirement.topic.trim().toLocaleLowerCase();
    if (!subjectId || !topic) continue;
    if (resolvedTopics.has(`${subjectId}\u0000${topic}`)) continue;
    const unknown = unknownEvidenceClaim({ subjectId, topic });
    gaps.add(evidenceUnknownGapCode(subjectId, topic));
    if (claims.some((claim) => claim.id === unknown.id)) continue;
    claims.push(unknown);
  }

  const entityIds = new Set(entities.map((entity) => entity.id));
  const claimIds = new Set(claims.map((claim) => claim.id));
  const { relationships, prunedCount } = pruneRelationships({
    relationships: ordered.flatMap(
      (execution) => execution.result?.relationships ?? []
    ),
    entityIds,
    claimIds
  });
  if (prunedCount > 0) gaps.add(evidenceGapCode("relationships", "pruned"));

  const sorted = sortEvidenceGraphParts({
    entities,
    claims,
    relationships,
    gaps: [...gaps]
  });
  const completedAt = now();
  const timings: Record<string, number> = {
    total: boundedDuration(completedAt - startedAt),
    reconcile: boundedDuration(completedAt - reconcileStartedAt),
    lane_budget: boundedDuration(budgetMs)
  };
  for (const execution of ordered) {
    timings[timingKey(execution.laneId)] = execution.durationMs;
  }

  const graph: EvidenceGraph = {
    schemaVersion: EVIDENCE_GRAPH_SCHEMA_VERSION,
    revision: input.revision,
    inputFingerprint: input.inputFingerprint,
    ...sorted,
    timings
  };
  const receipts: EvidenceGraphLaneReceipt[] = ordered.map((execution) => ({
    laneId: execution.laneId,
    outcome: execution.outcome,
    durationMs: execution.durationMs,
    queryCount: execution.queryCount,
    entityCount: execution.result?.entities?.length ?? 0,
    claimCount: execution.result?.candidates?.length ?? 0,
    gapCount: execution.result?.gaps?.length ?? 0
  }));

  return {
    graph,
    digest: evidenceGraphDigest(graph),
    receipts,
    trace: evidenceGraphTraceReceipt(graph, receipts),
    conflicts: reconciled.conflicts
  };
}

/** Coordinator entry point. Returns only the graph; receipts stay private. */
export async function executeEvidenceGraph(
  input: ExecuteEvidenceGraphInput
): Promise<EvidenceGraph> {
  return (await executeEvidenceGraphRun(input)).graph;
}
