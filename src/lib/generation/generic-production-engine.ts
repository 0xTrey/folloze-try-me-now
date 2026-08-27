import type { BrandSystemV2 } from "@/lib/brand-system";
import type { BuildTraceTerminalStatus, BuildTraceV1 } from "@/lib/build-trace";
import {
  compileProductionBuildTrace,
  productionTraceIdentity,
  sectionCopyDigestSource,
  sectionSlotDigestSource,
  type ProductionTraceIdentity,
  type ProductionTraceSection,
  type ProductionTraceStage
} from "@/lib/generation/production-build-trace";
import {
  editCopyForFactuality,
  type ClaimEvidenceMapping,
  type CopyFactualityEditorArtifact,
  type CopyFactualityEditorInput
} from "@/lib/generation/copy-factuality-editor";
import { writeExplorationSections } from "@/lib/generation/exploration-section-writer";
import { writeMechanismProofSections } from "@/lib/generation/mechanism-proof-section-writer";
import { writeOpeningSections } from "@/lib/generation/opening-section-writer";
import { writeProblemUrgencySections } from "@/lib/generation/problem-urgency-section-writer";
import {
  writerSlotsFromFamilyMessageSpine,
  type FamilyProductionMessageSpine,
  type ProductionMessageSpine
} from "@/lib/generation/production-message-spine";
import type { WireframeDecisionV2 } from "@/lib/generation/three-family-contract";
import type {
  SectionCopyCandidate,
  SectionEvidenceClaim,
  SectionWriterArtifact,
  SectionWriterInput,
  SectionWriterKind,
  SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import {
  buildSectionWritingContracts,
  sectionContractDigestSource,
  type SectionWritingContract
} from "@/lib/generation/section-writing-contract";
import { writeTeamCtaSections } from "@/lib/generation/team-cta-section-writer";
import type { WireframeSelectionV1 } from "@/lib/generation/wireframe-library";
import type {
  ProductionArtifact,
  WorkerKind,
  WorkerReceipt
} from "@/lib/orchestration/worker-types";
import type {
  LiveBriefEvidenceField,
  LiveBriefEvidenceValueMap,
  MaterialLiveBriefEvidence,
  ReconciledLiveBriefField
} from "@/lib/research/evidence-reconciler";

export const GENERIC_PRODUCTION_HARD_DEADLINE_MS = 60_000;
export const GENERIC_PRODUCTION_MIN_SECTIONS = 4;
export const GENERIC_PRODUCTION_MAX_SECTIONS = 8;
const WRITER_KINDS = [
  "opening-writer",
  "problem-urgency-writer",
  "exploration-writer",
  "mechanism-proof-writer",
  "team-cta-writer"
] as const satisfies readonly SectionWriterKind[];
const INPUT_WORKERS = {
  evidence: "evidence-reconciler",
  brand: "brand-compiler",
  composition: "wireframe-ranker",
  spine: "message-spine-architect"
} as const;
const USABLE_STATUSES = new Set<ProductionArtifact<unknown>["status"]>([
  "complete",
  "fallback",
  "timed_out"
]);

export type GenericProductionMediaIntent =
  | "image-led"
  | "diagram-led"
  | "type-led";

export type GenericProductionFallbackCode =
  | "GPE_INVALID_INPUT"
  | "GPE_ARTIFACT_SESSION_MISMATCH"
  | "GPE_STALE_REVISION"
  | "GPE_DEPENDENCY_UNAVAILABLE"
  | "GPE_CONTRACT_MISMATCH"
  | "GPE_BRAND_HELP_REQUIRED"
  | "GPE_PROVIDER_DEADLINE_REACHED"
  | "GPE_WRITER_RESULT_INVALID"
  | "GPE_FACTUALITY_REJECTED"
  | "GPE_MINIMUM_SECTIONS_UNAVAILABLE";

export type GenericProductionCompileStage =
  | "artifact-validation"
  | "provider-deadline"
  | "writer-wave"
  | "factuality"
  | "section-compile"
  | "final-reveal";

export interface GenericProductionCompileReceipt {
  stage: GenericProductionCompileStage;
  status: "completed" | "fallback" | "failed" | "stale" | "timed_out";
  sessionId: string;
  revision: number;
  startedAt: string;
  completedAt: string;
  detailCode: string;
  artifactCount: number;
  evidenceCount: number;
}

export interface GenericProductionPage {
  version: 1;
  revision: number;
  brand: BrandSystemV2;
  familyDecision?: WireframeDecisionV2;
  familyMessageSpine?: FamilyProductionMessageSpine;
  composition: WireframeSelectionV1;
  framework: ProductionMessageSpine["framework"];
  omissions: ProductionMessageSpine["omissions"];
  sections: readonly SectionCopyCandidate[];
  claimToEvidence: readonly ClaimEvidenceMapping[];
  mediaIntent: GenericProductionMediaIntent;
  visualRepair: {
    allowedAttempts: 0 | 1;
    performedAttempts: 0;
    instruction: "manager_may_run_one_bounded_visual_repair" | "visual_repair_not_allowed";
  };
  reveal: {
    state: "final";
    revision: number;
    currentRevisionOnly: true;
  };
}

export interface GenericProductionSafeFallbackInstruction {
  code: GenericProductionFallbackCode;
  supportCode: string;
  revision: number;
  action:
    | "discard_stale_result"
    | "reveal_existing_current_revision"
    | "request_brand_input"
    | "compile_safe_deterministic_experience_spec";
  reason: string;
  allowProviderWork: false;
  visualRepairAllowed: false;
}

export interface GenericProductionEngineInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  startedAt: string;
  completedAt: string;
  providerWindow: {
    startedAtMs: number;
    currentTimeMs: number;
    hardDeadlineMs?: number;
  };
  evidenceArtifact: ProductionArtifact<MaterialLiveBriefEvidence>;
  brandArtifact: ProductionArtifact<BrandSystemV2>;
  familyDecisionArtifact?: ProductionArtifact<WireframeDecisionV2>;
  familyMessageSpineArtifact?: ProductionArtifact<FamilyProductionMessageSpine>;
  compositionArtifact: ProductionArtifact<WireframeSelectionV1>;
  messageSpineArtifact: ProductionArtifact<ProductionMessageSpine>;
  allowVisualRepair?: boolean;
  /** Optional session trace identity. Derived deterministically when absent. */
  trace?: { traceId?: string; attemptId?: string; supportRef?: string };
}

type Writer = (
  input: SectionWriterInput
) => SectionWriterArtifact | Promise<SectionWriterArtifact>;

export interface GenericProductionEngineDependencies {
  writers?: Partial<Record<SectionWriterKind, Writer>>;
  factualityEditor?: (
    input: CopyFactualityEditorInput
  ) => CopyFactualityEditorArtifact | Promise<CopyFactualityEditorArtifact>;
  currentRevision?: () => number;
  currentTimeMs?: () => number;
}

interface GenericProductionResultBase {
  workerReceipts: readonly WorkerReceipt[];
  compileReceipts: readonly GenericProductionCompileReceipt[];
  /** Private provenance for this attempt. Never part of a public payload. */
  buildTrace: BuildTraceV1;
}

export type GenericProductionEngineResult =
  | (GenericProductionResultBase & {
      outcome: "production-page";
      artifact: ProductionArtifact<GenericProductionPage>;
    })
  | (GenericProductionResultBase & {
      outcome: "safe-deterministic-fallback";
      instruction: GenericProductionSafeFallbackInstruction;
    });

const DEFAULT_WRITERS: Record<SectionWriterKind, Writer> = {
  "opening-writer": writeOpeningSections,
  "problem-urgency-writer": writeProblemUrgencySections,
  "exploration-writer": writeExplorationSections,
  "mechanism-proof-writer": writeMechanismProofSections,
  "team-cta-writer": writeTeamCtaSections
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hardDeadlineAt(input: GenericProductionEngineInput): number {
  const requested = input.providerWindow.hardDeadlineMs ??
    GENERIC_PRODUCTION_HARD_DEADLINE_MS;
  const bounded = Number.isFinite(requested)
    ? Math.max(0, Math.min(requested, GENERIC_PRODUCTION_HARD_DEADLINE_MS))
    : GENERIC_PRODUCTION_HARD_DEADLINE_MS;
  return input.providerWindow.startedAtMs + bounded;
}

function supportCode(
  input: Pick<GenericProductionEngineInput, "sessionId" | "revision">,
  code: GenericProductionFallbackCode
): string {
  const source = `${input.sessionId}:${input.revision}:${code}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `GPE-${input.revision}-${(hash >>> 0).toString(36).toUpperCase()}`;
}

function receiptStatus(
  status: ProductionArtifact<unknown>["status"]
): WorkerReceipt["status"] {
  if (status === "complete") return "completed";
  if (status === "timed_out") return "timed_out";
  return status;
}

function workerReceipt(
  artifact: ProductionArtifact<unknown>,
  dependencies: readonly WorkerKind[] = []
): WorkerReceipt {
  const started = Date.parse(artifact.startedAt);
  const completed = Date.parse(artifact.completedAt);
  return {
    worker: artifact.worker,
    status: receiptStatus(artifact.status),
    queuedAt: artifact.startedAt,
    startedAt: artifact.startedAt,
    completedAt: artifact.completedAt,
    ...(Number.isFinite(started) && Number.isFinite(completed)
      ? { durationMs: Math.max(0, completed - started) }
      : {}),
    evidenceRefs: artifact.evidenceRefs.map((id) => ({ id })),
    confidence: boundedConfidence(artifact.confidence),
    dependencies: [...dependencies],
    ...(artifact.fallbackCode ? { fallback: artifact.fallbackCode } : {}),
    ...(artifact.errorCode
      ? {
          error: {
            name: artifact.status === "stale" ? "StaleArtifact" : "ArtifactError",
            message: artifact.errorCode
          }
        }
      : {})
  };
}

interface ProductionTraceContext {
  identity: ProductionTraceIdentity;
  evidenceIds: string[];
  brand?: BrandSystemV2;
  framework?: ProductionMessageSpine["framework"];
  frameworkConfidence?: number;
  frameworkEvidenceIds?: readonly string[];
  familyDecision?: WireframeDecisionV2;
  sections: ProductionTraceSection[];
}

function traceContextFor(input: GenericProductionEngineInput): ProductionTraceContext {
  return {
    identity: productionTraceIdentity({
      sessionId: input.sessionId,
      revision: input.revision,
      ...(input.trace?.traceId ? { traceId: input.trace.traceId } : {}),
      ...(input.trace?.attemptId ? { attemptId: input.trace.attemptId } : {}),
      ...(input.trace?.supportRef ? { supportRef: input.trace.supportRef } : {})
    }),
    evidenceIds: [],
    sections: []
  };
}

function traceStages(
  receipts: readonly GenericProductionCompileReceipt[]
): ProductionTraceStage[] {
  return receipts.map((receipt) => ({
    stage: receipt.stage,
    status: receipt.status,
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    detailCode: receipt.detailCode
  }));
}

function buildTraceFor(
  input: GenericProductionEngineInput,
  context: ProductionTraceContext,
  compileReceipts: readonly GenericProductionCompileReceipt[],
  terminalStatus: BuildTraceTerminalStatus,
  fallbackCode?: string
): BuildTraceV1 {
  return compileProductionBuildTrace({
    identity: context.identity,
    sessionId: input.sessionId,
    revision: input.revision,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    terminalStatus,
    stages: traceStages(compileReceipts),
    evidenceIds: context.evidenceIds,
    ...(context.brand ? { brand: context.brand } : {}),
    ...(context.framework ? { framework: context.framework } : {}),
    ...(context.frameworkConfidence !== undefined
      ? { frameworkConfidence: context.frameworkConfidence }
      : {}),
    ...(context.frameworkEvidenceIds
      ? { frameworkEvidenceIds: context.frameworkEvidenceIds }
      : {}),
    ...(context.familyDecision ? { familyDecision: context.familyDecision } : {}),
    sections: context.sections,
    ...(fallbackCode ? { fallbackCode } : {})
  });
}

function terminalStatusFor(
  status: GenericProductionCompileReceipt["status"],
  code: GenericProductionFallbackCode
): BuildTraceTerminalStatus {
  if (code === "GPE_BRAND_HELP_REQUIRED") return "needs_input";
  if (status === "stale") return "stale";
  if (status === "failed") return "failed";
  return "fallback";
}

/**
 * Maps each planned slot to one section provenance record. Slots that never
 * produced accepted copy are still recorded so a support reference shows the
 * gap instead of hiding it.
 */
/**
 * Resolves the versioned writing contract for every locked section. Sections
 * only reach the renderer through a slot, so a slot without a contract is a
 * gap the trace has to show rather than paper over.
 */
function sectionWritingContracts(
  input: GenericProductionEngineInput,
  evidence: readonly SectionEvidenceClaim[]
): Map<string, SectionWritingContract> {
  const decision = input.familyDecisionArtifact?.value;
  if (!decision) return new Map();
  const contracts = buildSectionWritingContracts({
    sessionId: input.sessionId,
    revision: input.revision,
    decision,
    brief: {
      audience: "",
      promise: "",
      mechanism: "",
      proofPlan: "",
      decisionHelp: "",
      nextAction: "",
      unknowns: []
    },
    evidence
  });
  return new Map(contracts.map((contract) => [contract.sectionId, contract]));
}

function sectionTraces(input: {
  slots: readonly SectionWriterSlot[];
  sections: readonly SectionCopyCandidate[];
  writerArtifacts: readonly SectionWriterArtifact[];
  contracts: ReadonlyMap<string, SectionWritingContract>;
  startedAt: string;
  completedAt: string;
}): ProductionTraceSection[] {
  const accepted = new Map(input.sections.map((section) => [section.sectionId, section]));
  const candidatesBySection = new Map<string, SectionCopyCandidate[]>();
  for (const artifact of input.writerArtifacts) {
    for (const candidate of artifact.value ?? []) {
      const existing = candidatesBySection.get(candidate.sectionId) ?? [];
      existing.push(candidate);
      candidatesBySection.set(candidate.sectionId, existing);
    }
  }
  return input.slots.map((slot) => {
    const section = accepted.get(slot.id);
    const candidates = candidatesBySection.get(slot.id) ?? [];
    const selectedIndex = section
      ? Math.max(
          0,
          candidates.findIndex(
            (candidate) => candidate.wordCount === section.wordCount
              && candidate.status === section.status
          )
        )
      : 0;
    const contract = input.contracts.get(slot.id);
    return {
      sectionId: slot.id,
      role: slot.v2Role ?? slot.role,
      writerMode: "deterministic" as const,
      ...(contract
        ? {
            promptVersion: contract.prompt.version,
            templateVersion: `${contract.version}.${contract.registryVersion}`
          }
        : {}),
      evidenceIds: section?.evidenceRefs ?? slot.evidenceRefs,
      inputDigestSource: contract
        ? {
            slot: sectionSlotDigestSource(slot, slot.evidenceRefs),
            contract: sectionContractDigestSource(contract)
          }
        : sectionSlotDigestSource(slot, slot.evidenceRefs),
      candidateDigestSources: candidates.map((candidate) =>
        sectionCopyDigestSource(candidate)
      ),
      selectedCandidate: selectedIndex,
      selectionReasons: [
        ...(section
          ? ["factuality_accepted", `status_${section.status}`]
          : ["not_accepted"]),
        ...(contract ? [`contract_${contract.role}`] : ["contract_absent"])
      ],
      outputDigestSource: section
        ? sectionCopyDigestSource(section)
        : { sectionId: slot.id, status: "absent" },
      quality: {
        wordcount: section?.wordCount ?? 0,
        evidencecount: section?.evidenceRefs.length ?? 0,
        withinwordbudget: Boolean(
          section
            && section.wordCount >= slot.wordBudget.min
            && section.wordCount <= slot.wordBudget.max
        ),
        required: slot.required
      },
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      status: section
        ? section.status === "complete"
          ? ("completed" as const)
          : ("fallback" as const)
        : ("fallback" as const),
      ...(section ? {} : { fallbackCode: "section_not_accepted" })
    };
  });
}

function compileReceipt(
  input: GenericProductionEngineInput,
  stage: GenericProductionCompileStage,
  status: GenericProductionCompileReceipt["status"],
  detailCode: string,
  artifactCount: number,
  evidenceCount: number
): GenericProductionCompileReceipt {
  return {
    stage,
    status,
    sessionId: input.sessionId,
    revision: input.revision,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    detailCode,
    artifactCount,
    evidenceCount
  };
}

function fallback(
  input: GenericProductionEngineInput,
  code: GenericProductionFallbackCode,
  reason: string,
  action: GenericProductionSafeFallbackInstruction["action"],
  status: GenericProductionCompileReceipt["status"],
  workerReceipts: readonly WorkerReceipt[],
  compileReceipts: readonly GenericProductionCompileReceipt[],
  context: ProductionTraceContext
): GenericProductionEngineResult {
  const compilerArtifact: ProductionArtifact<never> = {
    worker: "spec-compiler-qa",
    sessionId: input.sessionId,
    revision: input.revision,
    status:
      status === "stale"
        ? "stale"
        : status === "timed_out"
          ? "timed_out"
          : "fallback",
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    fallbackCode: code
  };
  const finalReceipts = [
    ...compileReceipts,
    compileReceipt(input, "final-reveal", status, code, 0, 0)
  ];
  return {
    outcome: "safe-deterministic-fallback",
    instruction: {
      code,
      supportCode: supportCode(input, code),
      revision: input.revision,
      action,
      reason,
      allowProviderWork: false,
      visualRepairAllowed: false
    },
    workerReceipts: [
      ...workerReceipts,
      workerReceipt(compilerArtifact, [
        "brand-compiler",
        "message-spine-architect",
        "wireframe-ranker",
        "copy-factuality-editor"
      ])
    ],
    compileReceipts: finalReceipts,
    buildTrace: buildTraceFor(
      input,
      context,
      finalReceipts,
      terminalStatusFor(status, code),
      code
    )
  };
}

function artifactFailure(
  input: GenericProductionEngineInput
): {
  code: GenericProductionFallbackCode;
  reason: string;
  status: GenericProductionCompileReceipt["status"];
} | undefined {
  if (
    !input.sessionId.trim() ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    !Number.isSafeInteger(input.activeRevision) ||
    input.activeRevision < 0 ||
    !Number.isFinite(input.providerWindow.startedAtMs) ||
    !Number.isFinite(input.providerWindow.currentTimeMs)
  ) {
    return {
      code: "GPE_INVALID_INPUT",
      reason: "The compiler input or provider window is invalid.",
      status: "failed"
    };
  }

  const artifacts = [
    input.evidenceArtifact,
    input.brandArtifact,
    ...(input.familyDecisionArtifact ? [input.familyDecisionArtifact] : []),
    ...(input.familyMessageSpineArtifact
      ? [input.familyMessageSpineArtifact]
      : []),
    input.compositionArtifact,
    input.messageSpineArtifact
  ];
  if (artifacts.some((artifact) => artifact.sessionId !== input.sessionId)) {
    return {
      code: "GPE_ARTIFACT_SESSION_MISMATCH",
      reason: "At least one production artifact belongs to another session.",
      status: "failed"
    };
  }
  if (
    input.revision !== input.activeRevision ||
    artifacts.some((artifact) => artifact.revision !== input.revision) ||
    (input.evidenceArtifact.value !== undefined &&
      input.evidenceArtifact.value.revision !== input.revision) ||
    (input.brandArtifact.value !== undefined &&
      input.brandArtifact.value.revision !== input.revision) ||
    (input.familyDecisionArtifact?.value !== undefined &&
      input.familyDecisionArtifact.value.revision !== input.revision) ||
    (input.messageSpineArtifact.value !== undefined &&
      input.messageSpineArtifact.value.revision !== input.revision) ||
    Object.values(input.evidenceArtifact.value?.fields ?? {}).some(
      (field) => field !== undefined && field.revision !== input.revision
    )
  ) {
    return {
      code: "GPE_STALE_REVISION",
      reason: "A stale artifact or inactive revision was discarded.",
      status: "stale"
    };
  }
  if (
    input.evidenceArtifact.worker !== INPUT_WORKERS.evidence ||
    input.brandArtifact.worker !== INPUT_WORKERS.brand ||
    input.compositionArtifact.worker !== INPUT_WORKERS.composition ||
    input.messageSpineArtifact.worker !== INPUT_WORKERS.spine
  ) {
    return {
      code: "GPE_CONTRACT_MISMATCH",
      reason: "A production artifact was supplied by the wrong worker.",
      status: "failed"
    };
  }
  if (input.brandArtifact.status === "needs_input") {
    return {
      code: "GPE_BRAND_HELP_REQUIRED",
      reason:
        input.brandArtifact.userRequest?.prompt ??
        "A clearer seller brand source is required before a customer-ready reveal.",
      status: "fallback"
    };
  }
  if (
    input.familyDecisionArtifact &&
    (input.familyDecisionArtifact.worker !== INPUT_WORKERS.composition ||
      input.familyDecisionArtifact.value?.version !== 2 ||
      input.familyDecisionArtifact.value.locked !== true)
  ) {
    return {
      code: "GPE_CONTRACT_MISMATCH",
      reason: "The V2 family decision is not a locked wireframe-ranker artifact.",
      status: "failed"
    };
  }
  if (
    input.familyMessageSpineArtifact &&
    (!input.familyDecisionArtifact ||
      input.familyMessageSpineArtifact.worker !== INPUT_WORKERS.spine ||
      input.familyMessageSpineArtifact.value?.version !== 2 ||
      input.familyMessageSpineArtifact.value.family !==
        input.familyDecisionArtifact.value?.family ||
      input.familyMessageSpineArtifact.value.reasonCode !==
        input.familyDecisionArtifact.value?.reasonCode)
  ) {
    return {
      code: "GPE_CONTRACT_MISMATCH",
      reason:
        "The V2 family message spine does not match the locked family decision.",
      status: "failed"
    };
  }
  if (
    artifacts.some(
      (artifact) => !USABLE_STATUSES.has(artifact.status) || artifact.value === undefined
    )
  ) {
    return {
      code: "GPE_DEPENDENCY_UNAVAILABLE",
      reason: "A required production artifact is unavailable.",
      status: "failed"
    };
  }

  const selection = input.compositionArtifact.value!;
  const spine = input.messageSpineArtifact.value!;
  const familySpine = input.familyMessageSpineArtifact?.value;
  const familySlots = familySpine
    ? writerSlotsFromFamilyMessageSpine(familySpine)
    : undefined;
  const plan = selection.compositionPlan;
  if (
    plan.sectionCount < GENERIC_PRODUCTION_MIN_SECTIONS ||
    plan.sectionCount > GENERIC_PRODUCTION_MAX_SECTIONS ||
    plan.sectionCount !== plan.sections.length ||
    spine.sections.length !== plan.sections.length ||
    spine.composition.sectionCount !== plan.sectionCount ||
    spine.composition.archetypeId !== selection.archetypeId ||
    spine.composition.compositionId !== selection.compositionId ||
    plan.archetypeId !== selection.archetypeId ||
    plan.compositionId !== selection.compositionId ||
    spine.sections.some(
      (slot, index) =>
        slot.order !== index + 1 ||
        slot.role !== plan.sections[index]?.role
    ) ||
    (familySpine !== undefined &&
      (familySpine.sections.length !== plan.sections.length ||
        familySlots?.some(
          (slot, index) =>
            slot.spineOrder !== index + 1 ||
            slot.role !== plan.sections[index]?.role ||
            slot.label !== plan.sections[index]?.label
        )))
  ) {
    return {
      code: "GPE_CONTRACT_MISMATCH",
      reason: "The message spine and selected composition do not describe the same page.",
      status: "failed"
    };
  }
  return undefined;
}

function fieldText(
  field: LiveBriefEvidenceField,
  value: ReconciledLiveBriefField<LiveBriefEvidenceField>["value"]
): string {
  switch (field) {
    case "companyName":
      return `${value as string} is the seller company name.`;
    case "canonicalDomain":
      return `${value as string} is the seller canonical domain.`;
    case "company":
    case "category":
    case "positioning":
    case "objective":
      return value as string;
    case "offer": {
      const offer = value as LiveBriefEvidenceValueMap["offer"];
      return `${offer.label} is the selected ${offer.kind}.`;
    }
    case "audience": {
      const audience = value as LiveBriefEvidenceValueMap["audience"];
      return `${audience.label} own the buyer job to ${audience.buyerJob}.`;
    }
    case "cta": {
      const cta = value as LiveBriefEvidenceValueMap["cta"];
      return `${cta.label} is the selected next action.`;
    }
    case "brandVisual":
      return "Current-revision seller visual evidence defines the page treatment.";
  }
}

function sourceRoleFor(
  field: LiveBriefEvidenceField,
  value: ReconciledLiveBriefField<LiveBriefEvidenceField>
): SectionEvidenceClaim["sourceRole"] {
  if (value.visitorEdited) return "visitor";
  if (field === "offer") return "offer";
  if (value.provenance.some((item) => item.semanticRole === "target")) return "target";
  if (
    value.provenance.some((item) =>
      item.semanticRole === "company-research" ||
      item.semanticRole === "objective-cta"
    )
  ) {
    return "source";
  }
  return "seller";
}

function sectionEvidence(
  evidence: MaterialLiveBriefEvidence,
  revision: number
): SectionEvidenceClaim[] {
  const byId = new Map<string, SectionEvidenceClaim>();
  for (const [field, reconciled] of Object.entries(evidence.fields) as Array<
    [
      LiveBriefEvidenceField,
      ReconciledLiveBriefField<LiveBriefEvidenceField> | undefined
    ]
  >) {
    if (!reconciled || reconciled.revision !== revision) continue;
    const text = fieldText(field, reconciled.value);
    for (const id of reconciled.evidenceRefs) {
      const current = byId.get(id);
      byId.set(id, {
        id,
        text: current ? `${current.text} ${text}` : text,
        confidence: current
          ? Math.min(current.confidence, boundedConfidence(reconciled.confidence))
          : boundedConfidence(reconciled.confidence),
        revision,
        sourceRole: current?.sourceRole ?? sourceRoleFor(field, reconciled)
      });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function writerSlots(
  spine: ProductionMessageSpine,
  selection: WireframeSelectionV1
): SectionWriterSlot[] {
  return spine.sections.map((spineSlot, index) => {
    const planSlot = selection.compositionPlan.sections[index]!;
    const optionalUnsupportedContext =
      spineSlot.role === "context" &&
      spineSlot.omissions.includes("tension") &&
      spine.argument.whyNow === undefined;
    return {
      id: spineSlot.id,
      role: spineSlot.role,
      label: spineSlot.label,
      wordBudget: { ...spineSlot.wordBudget },
      componentSlots: [...planSlot.componentSlots],
      allowedInteractions: [...planSlot.allowedInteractions],
      evidenceRefs: [...spineSlot.evidenceRefs],
      required: !optionalUnsupportedContext
    };
  });
}

function mediaIntentFor(
  brand: BrandSystemV2,
  slots: readonly SectionWriterSlot[]
): GenericProductionMediaIntent {
  if (brand.imagery.candidates.length > 0) return "image-led";
  if (
    /diagram/i.test(brand.imagery.style) ||
    slots.some((slot) => slot.componentSlots.includes("diagram-hero"))
  ) {
    return "diagram-led";
  }
  return "type-led";
}

function invalidWriterArtifact(
  artifact: SectionWriterArtifact,
  expectedWorker: SectionWriterKind,
  input: GenericProductionEngineInput
): boolean {
  return (
    artifact.worker !== expectedWorker ||
    artifact.sessionId !== input.sessionId ||
    artifact.revision !== input.revision
  );
}

/**
 * Compiles typed, current-revision production artifacts into one render-ready
 * page contract. It never calls a provider and never emits HTML, CSS, or JS.
 */
export async function compileGenericProductionPage(
  input: GenericProductionEngineInput,
  dependencies: GenericProductionEngineDependencies = {}
): Promise<GenericProductionEngineResult> {
  const dependencyArtifacts = [
    input.evidenceArtifact,
    input.brandArtifact,
    ...(input.familyDecisionArtifact ? [input.familyDecisionArtifact] : []),
    ...(input.familyMessageSpineArtifact
      ? [input.familyMessageSpineArtifact]
      : []),
    input.compositionArtifact,
    input.messageSpineArtifact
  ];
  const workerReceipts: WorkerReceipt[] = dependencyArtifacts.map((artifact) =>
    workerReceipt(artifact)
  );
  const compileReceipts: GenericProductionCompileReceipt[] = [];
  const traceContext = traceContextFor(input);
  traceContext.evidenceIds = unique(
    dependencyArtifacts.flatMap((artifact) => artifact.evidenceRefs)
  );
  if (input.brandArtifact.value) traceContext.brand = input.brandArtifact.value;
  if (input.familyDecisionArtifact?.value) {
    traceContext.familyDecision = input.familyDecisionArtifact.value;
  }
  if (input.messageSpineArtifact.value) {
    traceContext.framework = input.messageSpineArtifact.value.framework;
    traceContext.frameworkConfidence = boundedConfidence(
      input.messageSpineArtifact.confidence
    );
    traceContext.frameworkEvidenceIds = input.messageSpineArtifact.value.evidenceRefs;
  }
  const failure = artifactFailure(input);
  if (failure) {
    compileReceipts.push(
      compileReceipt(
        input,
        "artifact-validation",
        failure.status,
        failure.code,
        dependencyArtifacts.length,
        0
      )
    );
    return fallback(
      input,
      failure.code,
      failure.reason,
      failure.status === "stale"
        ? "discard_stale_result"
        : failure.code === "GPE_BRAND_HELP_REQUIRED"
          ? "request_brand_input"
        : "compile_safe_deterministic_experience_spec",
      failure.status,
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  compileReceipts.push(
    compileReceipt(
      input,
      "artifact-validation",
      "completed",
      "production_artifacts_current",
      dependencyArtifacts.length,
      input.evidenceArtifact.evidenceRefs.length
    )
  );

  const now = dependencies.currentTimeMs?.() ??
    input.providerWindow.currentTimeMs;
  const deadlineAt = hardDeadlineAt(input);
  if (now >= deadlineAt) {
    compileReceipts.push(
      compileReceipt(
        input,
        "provider-deadline",
        "timed_out",
        "provider_deadline_reached_before_writer_wave",
        0,
        0
      )
    );
    return fallback(
      input,
      "GPE_PROVIDER_DEADLINE_REACHED",
      "The hard provider window closed before the writer wave could begin.",
      "reveal_existing_current_revision",
      "timed_out",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  compileReceipts.push(
    compileReceipt(
      input,
      "provider-deadline",
      "completed",
      "provider_work_window_open",
      0,
      0
    )
  );

  const evidenceValue = input.evidenceArtifact.value!;
  const selection = input.compositionArtifact.value!;
  const spine = input.messageSpineArtifact.value!;
  const familySpine = input.familyMessageSpineArtifact?.value;
  const brand = input.brandArtifact.value!;
  const evidence = sectionEvidence(evidenceValue, input.revision);
  const slots = familySpine
    ? writerSlotsFromFamilyMessageSpine(familySpine)
    : writerSlots(spine, selection);
  const objectiveField = evidenceValue.fields.objective;
  const ctaField = evidenceValue.fields.cta;
  if (!objectiveField || !ctaField) {
    return fallback(
      input,
      "GPE_CONTRACT_MISMATCH",
      "The material brief is missing the objective or CTA required by section writers.",
      "compile_safe_deterministic_experience_spec",
      "failed",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }

  const writerArgument = familySpine?.argument ?? spine.argument;
  const writerCta = familySpine?.cta ?? ctaField.value;
  const baseWriterInput = {
    sessionId: input.sessionId,
    revision: input.revision,
    activeRevision: input.activeRevision,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    slots,
    brief: {
      ...(familySpine
        ? {
            family: familySpine.family,
            ...(familySpine.entities?.sellerName
              ? { sellerName: familySpine.entities.sellerName }
              : {}),
            ...(familySpine.entities?.targetName
              ? { targetName: familySpine.entities.targetName }
              : {})
          }
        : {}),
      audience: writerArgument.audience.directive,
      promise: writerArgument.promise.directive,
      mechanism: writerArgument.mechanism.directive,
      proofPlan: writerArgument.proofPlan.directive,
      decisionHelp: writerArgument.decisionHelp.directive,
      nextAction: writerArgument.nextAction.directive,
      ...(writerArgument.tension
        ? { tension: writerArgument.tension.directive }
        : {}),
      ...(writerArgument.whyNow
        ? { whyNow: writerArgument.whyNow.directive }
        : {}),
      unknowns: [...(familySpine?.unknowns ?? spine.unknowns)]
    },
    evidence,
    objective: objectiveField.value,
    cta: { ...writerCta }
  } satisfies Omit<SectionWriterInput, "worker">;

  const writers = { ...DEFAULT_WRITERS, ...dependencies.writers };
  const writerArtifacts = await Promise.all(
    WRITER_KINDS.map((worker) =>
      Promise.resolve(writers[worker]({ ...baseWriterInput, worker }))
    )
  );
  workerReceipts.push(
    ...writerArtifacts.map((artifact) =>
      workerReceipt(artifact, [
        "message-spine-architect",
        "wireframe-ranker",
        "evidence-reconciler"
      ])
    )
  );

  if (
    (dependencies.currentRevision?.() ?? input.activeRevision) !== input.revision
  ) {
    compileReceipts.push(
      compileReceipt(
        input,
        "writer-wave",
        "stale",
        "writer_wave_stale_revision",
        writerArtifacts.length,
        evidence.length
      )
    );
    return fallback(
      input,
      "GPE_STALE_REVISION",
      "The active revision changed while writers were running; their results were discarded.",
      "discard_stale_result",
      "stale",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  if ((dependencies.currentTimeMs?.() ?? now) >= deadlineAt) {
    compileReceipts.push(
      compileReceipt(
        input,
        "writer-wave",
        "timed_out",
        "writer_wave_crossed_provider_deadline",
        writerArtifacts.length,
        evidence.length
      )
    );
    return fallback(
      input,
      "GPE_PROVIDER_DEADLINE_REACHED",
      "Writer results completed after the hard cutoff and were not revealed.",
      "reveal_existing_current_revision",
      "timed_out",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  if (
    writerArtifacts.some((artifact, index) =>
      invalidWriterArtifact(artifact, WRITER_KINDS[index]!, input)
    )
  ) {
    compileReceipts.push(
      compileReceipt(
        input,
        "writer-wave",
        "failed",
        "writer_artifact_identity_mismatch",
        writerArtifacts.length,
        evidence.length
      )
    );
    return fallback(
      input,
      "GPE_WRITER_RESULT_INVALID",
      "A writer returned an artifact for the wrong worker, session, or revision.",
      "compile_safe_deterministic_experience_spec",
      "failed",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  compileReceipts.push(
    compileReceipt(
      input,
      "writer-wave",
      writerArtifacts.some((artifact) => artifact.status !== "complete")
        ? "fallback"
        : "completed",
      writerArtifacts.some((artifact) => artifact.status !== "complete")
        ? "writer_wave_partial"
        : "writer_wave_complete",
      writerArtifacts.length,
      evidence.length
    )
  );

  const factualityEditor = dependencies.factualityEditor ?? editCopyForFactuality;
  const editorArtifact = await Promise.resolve(
    factualityEditor({
      sessionId: input.sessionId,
      revision: input.revision,
      activeRevision: input.revision,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      slots,
      evidence,
      objective: objectiveField.value,
      cta: { ...writerCta },
      ...(familySpine
        ? {
            familyContext: {
              family: familySpine.family,
              sellerName:
                familySpine.entities?.sellerName ??
                String(evidenceValue.fields.companyName?.value ?? ""),
              ...(familySpine.entities?.targetName
                ? { targetName: familySpine.entities.targetName }
                : {})
            }
          }
        : {}),
      writerArtifacts
    })
  );
  workerReceipts.push(
    workerReceipt(editorArtifact, [...WRITER_KINDS])
  );

  if (
    (dependencies.currentRevision?.() ?? input.activeRevision) !== input.revision ||
    editorArtifact.status === "stale" ||
    editorArtifact.revision !== input.revision ||
    editorArtifact.sessionId !== input.sessionId
  ) {
    compileReceipts.push(
      compileReceipt(
        input,
        "factuality",
        "stale",
        "factuality_result_stale",
        1,
        editorArtifact.evidenceRefs.length
      )
    );
    return fallback(
      input,
      "GPE_STALE_REVISION",
      "The factuality result was stale and could not update the current page.",
      "discard_stale_result",
      "stale",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  if (
    editorArtifact.worker !== "copy-factuality-editor" ||
    !editorArtifact.value ||
    !USABLE_STATUSES.has(editorArtifact.status)
  ) {
    compileReceipts.push(
      compileReceipt(
        input,
        "factuality",
        "failed",
        editorArtifact.errorCode ?? "factuality_editor_unavailable",
        1,
        editorArtifact.evidenceRefs.length
      )
    );
    return fallback(
      input,
      "GPE_FACTUALITY_REJECTED",
      "The factuality editor did not produce a usable current-revision artifact.",
      "compile_safe_deterministic_experience_spec",
      "failed",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }
  compileReceipts.push(
    compileReceipt(
      input,
      "factuality",
      editorArtifact.status === "complete" ? "completed" : "fallback",
      editorArtifact.fallbackCode ?? "factuality_passed",
      1,
      editorArtifact.evidenceRefs.length
    )
  );

  const order = new Map(slots.map((slot, index) => [slot.id, index]));
  const sections = [...editorArtifact.value.acceptedSections].sort(
    (left, right) =>
      (order.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
  );
  traceContext.sections = sectionTraces({
    slots,
    sections,
    writerArtifacts,
    contracts: sectionWritingContracts(input, evidence),
    startedAt: input.startedAt,
    completedAt: input.completedAt
  });
  const roles = new Set(sections.map(({ role }) => role));
  const coherent =
    roles.has("hero") &&
    roles.has("next-action") &&
    sections.length >= GENERIC_PRODUCTION_MIN_SECTIONS &&
    sections.length <= GENERIC_PRODUCTION_MAX_SECTIONS;
  if (!coherent) {
    compileReceipts.push(
      compileReceipt(
        input,
        "section-compile",
        "fallback",
        "minimum_coherent_sections_unavailable",
        sections.length,
        editorArtifact.evidenceRefs.length
      )
    );
    return fallback(
      input,
      "GPE_MINIMUM_SECTIONS_UNAVAILABLE",
      "Fewer than four coherent sections, or a required opening/next action, survived factuality review.",
      "compile_safe_deterministic_experience_spec",
      "fallback",
      workerReceipts,
      compileReceipts,
      traceContext
    );
  }

  const currentTime = dependencies.currentTimeMs?.() ?? now;
  const allowVisualRepair =
    input.allowVisualRepair === true && currentTime < deadlineAt;
  const partial =
    dependencyArtifacts.some((artifact) => artifact.status !== "complete") ||
    writerArtifacts.some((artifact) => artifact.status !== "complete") ||
    editorArtifact.status !== "complete" ||
    sections.length !== slots.length;
  const confidence = Math.min(
    ...dependencyArtifacts.map((artifact) =>
      boundedConfidence(artifact.confidence)
    ),
    boundedConfidence(editorArtifact.confidence)
  );
  const page: GenericProductionPage = {
    version: 1,
    revision: input.revision,
    brand,
    ...(input.familyDecisionArtifact?.value
      ? { familyDecision: structuredClone(input.familyDecisionArtifact.value) }
      : {}),
    ...(familySpine
      ? { familyMessageSpine: structuredClone(familySpine) }
      : {}),
    composition: selection,
    framework: {
      ...spine.framework,
      reasonCodes: [...spine.framework.reasonCodes]
    },
    omissions: [...(familySpine?.omissions ?? spine.omissions)],
    sections,
    claimToEvidence: [...editorArtifact.value.claimToEvidence],
    mediaIntent: mediaIntentFor(brand, slots),
    visualRepair: {
      allowedAttempts: allowVisualRepair ? 1 : 0,
      performedAttempts: 0,
      instruction: allowVisualRepair
        ? "manager_may_run_one_bounded_visual_repair"
        : "visual_repair_not_allowed"
    },
    reveal: {
      state: "final",
      revision: input.revision,
      currentRevisionOnly: true
    }
  };
  const artifact: ProductionArtifact<GenericProductionPage> = {
    worker: "spec-compiler-qa",
    sessionId: input.sessionId,
    revision: input.revision,
    status: partial ? "fallback" : "complete",
    value: page,
    evidenceRefs: unique([
      ...input.evidenceArtifact.evidenceRefs,
      ...input.brandArtifact.evidenceRefs,
      ...editorArtifact.evidenceRefs
    ]),
    confidence: partial ? Math.min(confidence, 0.55) : confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(partial
      ? { fallbackCode: "generic_production_page_partial_acceptance" }
      : {})
  };
  workerReceipts.push(
    workerReceipt(artifact, [
      "brand-compiler",
      "message-spine-architect",
      "wireframe-ranker",
      "copy-factuality-editor"
    ])
  );
  compileReceipts.push(
    compileReceipt(
      input,
      "section-compile",
      partial ? "fallback" : "completed",
      partial
        ? "production_page_partial_acceptance"
        : "production_page_compiled",
      sections.length,
      artifact.evidenceRefs.length
    ),
    compileReceipt(
      input,
      "final-reveal",
      "completed",
      "current_revision_final_reveal",
      1,
      artifact.evidenceRefs.length
    )
  );

  traceContext.evidenceIds = unique([
    ...traceContext.evidenceIds,
    ...artifact.evidenceRefs
  ]);
  return {
    outcome: "production-page",
    artifact,
    workerReceipts,
    compileReceipts,
    buildTrace: buildTraceFor(
      input,
      traceContext,
      compileReceipts,
      partial ? "fallback" : "completed",
      partial ? "generic_production_page_partial_acceptance" : undefined
    )
  };
}
