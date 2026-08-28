import { privateAssetAllocationFor, type BrandSystemV2 } from "@/lib/brand-system";
import {
  BuildTraceBuilder,
  buildTraceDigest,
  buildTraceValueDigest,
  normalizeAssetAllocationTrace,
  normalizeBrandDecisionTrace,
  normalizeCompositionDiagnostics,
  normalizeEvidenceGraphDiagnostics,
  normalizeLifecycleDiagnostics,
  normalizeQualityGateDiagnostics,
  normalizeRankedDecisionTrace,
  normalizeRecipeDiagnostics,
  normalizeResearchDiagnostics,
  normalizeSectionBuildTrace,
  normalizeStrategyDiagnostics,
  normalizeThesisDiagnostics,
  safeTraceIdentifier,
  type BuildTraceTerminalStatus,
  type BuildTraceV1,
  type BuildTraceWriterMode
} from "@/lib/build-trace";
import type { AssetAllocationPlan } from "@/lib/asset-allocation";
import { evaluateBrandFidelity } from "@/lib/brand-fidelity-evaluator";
import type { SemanticRoleSelection } from "@/lib/brand-semantics";
import {
  THESIS_FIELD_ROLES,
  type CampaignThesis,
  type CampaignThesisCompilation
} from "@/lib/generation/campaign-thesis";
import {
  messageStrategyDigestSource,
  messagingCompilerDigestSource,
  type MessagingCompilerArtifact,
  type StrategyEvaluation
} from "@/lib/generation/messaging-compiler-contracts";
import type { PageRecipeSelection } from "@/lib/generation/page-recipes";
import type { ProductionMessageSpine } from "@/lib/generation/production-message-spine";
import type {
  SectionCopyCandidate,
  SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type { thesisStrategyReceipt } from "@/lib/generation/thesis-strategy-bridge";
import {
  wireframeFamiliesV2,
  type WireframeDecisionV2
} from "@/lib/generation/three-family-contract";
import type { EvidenceGraphTraceReceipt } from "@/lib/research/evidence-graph";

export const PRODUCTION_BUILD_TRACE_TEMPLATE_VERSION = "three-family-v2";
export const PRODUCTION_BUILD_TRACE_PROMPT_VERSION = "section-writer-v1.0.0";

export interface ProductionTraceIdentity {
  traceId: string;
  attemptId: string;
  supportRef?: string;
}

export interface ProductionTraceStage {
  stage: string;
  status: string;
  startedAt: string;
  completedAt: string;
  detailCode: string;
}

export interface ProductionTraceSection {
  sectionId: string;
  role: string;
  /** The recipe slot's job code. The brief's prose job never enters the trace. */
  jobCode?: string;
  writerMode: BuildTraceWriterMode;
  model?: string;
  promptVersion?: string;
  templateVersion?: string;
  evidenceIds: readonly string[];
  inputDigestSource: unknown;
  candidateDigestSources?: readonly unknown[];
  /** Candidates produced, which may exceed the number that were digested. */
  candidateCount?: number;
  selectedCandidate?: number;
  selectionReasons?: readonly string[];
  /** Review rejection codes, from `CandidateRejectionCode`. */
  rejectionCodes?: readonly string[];
  repairStatus?: "not-attempted" | "repaired" | "repair-rejected";
  outputDigestSource: unknown;
  quality?: Record<string, number | boolean | string>;
  startedAt: string;
  completedAt: string;
  status: "completed" | "fallback" | "failed" | "stale";
  fallbackCode?: string;
}

/**
 * The upstream receipts the diagnostics block is projected from. Each member is
 * the source-free receipt its own layer already publishes, so this module never
 * recomputes a digest and never sees the material behind one.
 */
export interface ProductionTraceDiagnosticsInput {
  /** From `evidenceGraphTraceReceipt`. Supplies both graph and research blocks. */
  evidenceGraph?: EvidenceGraphTraceReceipt;
  /** The compiled thesis plus its own compilation receipt. */
  thesis?: {
    thesis: CampaignThesis;
    compilation: Pick<
      CampaignThesisCompilation,
      "version" | "digest" | "proofMode" | "omittedFields" | "unsupportedFields" | "reasonCodes"
    >;
  };
  /** From `thesisStrategyReceipt`. */
  strategy?: ReturnType<typeof thesisStrategyReceipt>;
  /** From `selectPageRecipe`. Only ids, order, codes, and digests are read. */
  recipe?: PageRecipeSelection;
  /**
   * Composition selection. Defaults to a projection of `familyDecision`, which
   * is the composition authority in the current pipeline.
   */
  composition?: {
    version?: string;
    selectedCompositionId: string;
    archetypeId?: string;
    digest?: string;
    rejected?: readonly { candidateId: string; reasonCode: string }[];
    reasonCodes?: readonly string[];
  };
  qualityGates?: readonly {
    gate: string;
    status: "passed" | "failed" | "warned" | "skipped";
    sectionId?: string;
    violations?: readonly string[];
  }[];
  lifecycle?: {
    inputFingerprint?: string;
    renderMs?: number;
    persistenceMs?: number;
    readbackMs?: number;
    totalMs?: number;
    fallbackCodes?: readonly string[];
  };
}

export interface ProductionBuildTraceInput {
  identity: ProductionTraceIdentity;
  sessionId: string;
  revision: number;
  startedAt: string;
  completedAt: string;
  terminalStatus: BuildTraceTerminalStatus;
  stages: readonly ProductionTraceStage[];
  evidenceIds?: readonly string[];
  brand?: BrandSystemV2;
  /**
   * The private allocation plan. Defaults to the one compiled alongside the
   * brand system; passed explicitly when a caller reconstructs a trace from a
   * brand object it did not compile.
   */
  assetAllocation?: AssetAllocationPlan;
  framework?: ProductionMessageSpine["framework"];
  frameworkConfidence?: number;
  frameworkEvidenceIds?: readonly string[];
  familyDecision?: WireframeDecisionV2;
  /**
   * The private messaging compiler artifact. Only digests, ids, scores, and
   * reason codes reach the trace; the ledger and argument text do not.
   */
  messagingCompiler?: {
    artifact: MessagingCompilerArtifact;
    evaluations: readonly StrategyEvaluation[];
    reasonCodes: readonly string[];
  };
  sections?: readonly ProductionTraceSection[];
  /** Final copy the visitor receives. Scored for fidelity, never gated on. */
  sectionCopy?: readonly SectionCopyCandidate[];
  fallbackCode?: string;
  /** Private diagnostics. Omitted entirely when nothing upstream reported. */
  diagnostics?: ProductionTraceDiagnosticsInput;
}

/**
 * Derives a stable trace identity when the caller has no session trace id yet,
 * so a build always produces provenance instead of silently skipping it.
 */
export function productionTraceIdentity(input: {
  sessionId: string;
  revision: number;
  traceId?: string;
  attemptId?: string;
  supportRef?: string;
}): ProductionTraceIdentity {
  return {
    traceId: safeTraceIdentifier(input.traceId ?? input.sessionId, "trace"),
    attemptId: safeTraceIdentifier(
      input.attemptId ?? `${input.sessionId}:${input.revision}`,
      "attempt"
    ),
    ...(input.supportRef ? { supportRef: input.supportRef } : {})
  };
}

function frameworkDecisionTrace(
  builder: BuildTraceBuilder,
  framework: ProductionMessageSpine["framework"],
  confidence: number,
  evidenceIds: readonly string[]
) {
  return normalizeRankedDecisionTrace({
    decision: "framework",
    version: "framework-ranker-v1",
    selectedCandidateId: framework.id,
    candidates: [
      {
        candidateId: framework.id,
        score: confidence,
        selected: true,
        reasonCodes: [...framework.reasonCodes]
      }
    ],
    evidenceRefs: builder.refs([...evidenceIds]),
    confidence,
    reasonCodes: [...framework.reasonCodes]
  });
}

function wireframeDecisionTrace(
  builder: BuildTraceBuilder,
  decision: WireframeDecisionV2
) {
  const confidence =
    decision.confidence === "high" ? 0.9 : decision.confidence === "medium" ? 0.7 : 0.4;
  return normalizeRankedDecisionTrace({
    decision: "wireframe",
    version: "three-family-v2.0.0",
    selectedCandidateId: decision.family,
    candidates: (["launch", "guide", "align"] as const).map((family) => ({
      candidateId: family,
      score: family === decision.family ? confidence : 0,
      selected: family === decision.family,
      reasonCodes: family === decision.family ? [decision.reasonCode] : []
    })),
    evidenceRefs: builder.refs([...decision.evidenceRefs]),
    confidence,
    reasonCodes: [
      decision.reasonCode,
      `subtype_${decision.subtype}`,
      `sections_${decision.sectionPlan.length}`
    ]
  });
}

/**
 * Projects the messaging compiler's decision. Candidates appear by digest so a
 * reviewer can prove which four arguments were considered and that a re-run
 * produced the same set, while the arguments themselves stay private. Only the
 * selected strategy is named, and a strategy id is an angle, not copy.
 */
function messagingDecisionTrace(
  builder: BuildTraceBuilder,
  artifact: MessagingCompilerArtifact,
  evaluations: readonly StrategyEvaluation[],
  reasonCodes: readonly string[]
) {
  const byId = new Map(evaluations.map((evaluation) => [evaluation.candidateId, evaluation]));
  const selected = byId.get(artifact.selectedStrategyId);
  return normalizeRankedDecisionTrace({
    decision: "messaging_strategy",
    version: artifact.compilerVersion,
    selectedCandidateId: artifact.selectedStrategyId,
    candidates: artifact.strategies.map((strategy) => {
      const evaluation = byId.get(strategy.id);
      return {
        candidateId: buildTraceDigest(messageStrategyDigestSource(strategy)),
        score: (evaluation?.total ?? 0) / 100,
        selected: strategy.id === artifact.selectedStrategyId,
        reasonCodes: [
          `candidate_${strategy.id}`,
          `angle_${strategy.angle}`,
          `framework_${strategy.frameworkId}`,
          ...(evaluation?.hardFailures ?? []).map((failure) => `hard_failure_${failure}`)
        ]
      };
    }),
    evidenceRefs: builder.refs(artifact.evidenceLedger.map(({ id }) => id)),
    confidence: (selected?.total ?? 0) / 100,
    reasonCodes: [
      `artifact_${buildTraceDigest(messagingCompilerDigestSource(artifact))}`,
      `brief_revision_${artifact.briefRevision}`,
      `strategies_${artifact.strategies.length}`,
      ...reasonCodes
    ]
  });
}

/**
 * Projects the compiled brand system into role-level provenance. Values are
 * digested so an operator can compare two builds without the trace carrying
 * the tokens themselves.
 */
export function brandDecisionTraceFor(
  builder: BuildTraceBuilder,
  brand: BrandSystemV2
) {
  const roleEvidence = builder.refs(brand.evidenceRefs);
  const role = (
    name: string,
    value: unknown,
    authority: string,
    confidence: number,
    reasons: readonly string[]
  ) => ({
    role: name,
    valueDigest: buildTraceDigest(value),
    sourceAuthority: authority,
    candidateCount: brand.evidenceRefs.length,
    confidence,
    selectionReasons: reasons,
    evidenceRefs: roleEvidence
  });
  const colorAuthority = (source: string) =>
    /screenshot/i.test(source)
      ? "official_screenshot"
      : /brandfetch/i.test(source)
        ? "brandfetch"
        : /visitor/i.test(source)
          ? "visitor_supplied"
          : "official_dom";
  // A compiled semantic selection already carries its own authority, candidate
  // count, and reasons; prefer it over the scalar approximation above.
  const semanticRole = (
    name: string,
    selection: SemanticRoleSelection<unknown> | undefined
  ) =>
    selection
      ? {
          role: name,
          valueDigest: buildTraceDigest(selection.value),
          sourceAuthority: selection.sourceAuthority,
          candidateCount: selection.candidateCount,
          confidence: selection.confidence,
          selectionReasons: [
            ...selection.selectionReasons,
            selection.applied ? "evidence_applied" : "evidence_unresolved"
          ],
          evidenceRefs: builder.refs(selection.evidenceRefs)
        }
      : undefined;
  const semantics = brand.semantics;
  const preferSemantic = (
    name: string,
    selection: SemanticRoleSelection<unknown> | undefined,
    scalar: ReturnType<typeof role>
  ) => semanticRole(name, selection) ?? scalar;
  return normalizeBrandDecisionTrace({
    version: "brand-system-v2.0.0",
    readiness: brand.readiness,
    confidence: brand.confidence,
    roles: [
      preferSemantic(
        "text",
        semantics?.colors.text,
        role(
          "text",
          brand.colorRoles.ink.value,
          colorAuthority(brand.colorRoles.ink.source),
          brand.colorRoles.ink.confidence,
          ["semantic_role_ink"]
        )
      ),
      preferSemantic(
        "surface",
        semantics?.colors.surface,
        role(
          "surface",
          brand.colorRoles.surface.value,
          colorAuthority(brand.colorRoles.surface.source),
          brand.colorRoles.surface.confidence,
          ["semantic_role_surface"]
        )
      ),
      preferSemantic(
        "accent",
        semantics?.colors.accent,
        role(
          "accent",
          brand.colorRoles.accent.value,
          colorAuthority(brand.colorRoles.accent.source),
          brand.colorRoles.accent.confidence,
          ["semantic_role_accent"]
        )
      ),
      preferSemantic(
        "ctabackground",
        semantics?.colors.ctaBackground,
        role(
          "ctabackground",
          brand.colorRoles.action.value,
          colorAuthority(brand.colorRoles.action.source),
          brand.colorRoles.action.confidence,
          ["semantic_role_action"]
        )
      ),
      role(
        "headingfont",
        brand.typography.display.value,
        brand.typography.display.portable ? "portable_family" : "substituted_family",
        brand.typography.display.confidence,
        brand.typography.display.substitution ? ["font_substituted"] : ["font_portable"]
      ),
      role(
        "bodyfont",
        brand.typography.body.value,
        brand.typography.body.portable ? "portable_family" : "substituted_family",
        brand.typography.body.confidence,
        brand.typography.body.substitution ? ["font_substituted"] : ["font_portable"]
      ),
      preferSemantic(
        "buttonradius",
        semantics?.geometry.buttonRadius,
        role(
          "buttonradius",
          brand.geometry.controlRadius,
          "compiled_geometry",
          brand.confidence,
          ["representative_control_radius"]
        )
      ),
      preferSemantic(
        "cardradius",
        semantics?.geometry.cardRadius,
        role("cardradius", brand.geometry.cardRadius, "compiled_geometry", brand.confidence, [
          "representative_card_radius"
        ])
      ),
      preferSemantic(
        "borderwidth",
        semantics?.geometry.borderWidth,
        role("borderwidth", brand.geometry.borderWidth, "compiled_geometry", brand.confidence, [
          "representative_border_width"
        ])
      ),
      preferSemantic(
        "shadowcharacter",
        semantics?.geometry.shadowCharacter,
        role("shadowcharacter", brand.geometry.shadow, "compiled_geometry", brand.confidence, [
          "representative_shadow"
        ])
      ),
      preferSemantic(
        "density",
        semantics?.geometry.density,
        role("density", brand.layout.density, "compiled_layout", brand.confidence, [
          "representative_density"
        ])
      )
    ],
    warnings: [
      ...(brand.logo.status === "missing" ? ["logo_missing"] : []),
      ...(brand.readiness !== "verified" ? [`readiness_${brand.readiness}`] : []),
      ...(brand.imagery.candidates.length === 0 ? ["imagery_absent"] : []),
      ...(semantics?.warnings ?? [])
    ],
    evidenceRefs: roleEvidence
  });
}

/**
 * Projects the global allocation plan. Asset URLs never enter the trace: each
 * placement is identified by a digest and the allocator's own source hash.
 */
export function assetAllocationTraceFor(
  builder: BuildTraceBuilder,
  plan: AssetAllocationPlan
) {
  return normalizeAssetAllocationTrace({
    version: plan.version,
    allocations: plan.allocations.map((allocation) => ({
      allocationKey: allocation.allocationKey,
      sectionId: allocation.sectionId,
      semanticRole: allocation.semanticRole,
      assetDigest: buildTraceDigest(allocation.assetRef),
      evidenceRef: builder.refs([allocation.evidenceRef])[0] ?? "",
      sourceUrlHash: allocation.sourceUrlHash,
      purpose: allocation.purpose,
      reusable: allocation.reusable,
      score: allocation.score
    })),
    rejectedCount: plan.rejections.length,
    rejectionReasons: [...new Set(plan.rejections.map(({ code }) => code))].sort()
  });
}

/** Digest-safe projection of accepted copy. The copy itself stays private. */
export function sectionCopyDigestSource(candidate: SectionCopyCandidate): unknown {
  return {
    sectionId: candidate.sectionId,
    role: candidate.role,
    status: candidate.status,
    wordCount: candidate.wordCount,
    evidenceRefs: [...candidate.evidenceRefs].sort(),
    hasHeadline: Boolean(candidate.headline?.trim()),
    hasBody: Boolean(candidate.body?.trim()),
    choiceCount: candidate.choices?.length ?? 0,
    ctaId: candidate.cta?.id ?? null,
    text: candidate.headline ?? candidate.body ?? ""
  };
}

/** Digest-safe projection of the writer input contract for one slot. */
export function sectionSlotDigestSource(
  slot: SectionWriterSlot,
  evidenceIds: readonly string[]
): unknown {
  return {
    id: slot.id,
    role: slot.role,
    v2Role: slot.v2Role ?? null,
    claimType: slot.claimType ?? null,
    wordBudget: slot.wordBudget,
    componentSlots: [...slot.componentSlots].sort(),
    allowedInteractions: [...slot.allowedInteractions].sort(),
    evidenceIds: [...evidenceIds].sort(),
    required: slot.required
  };
}

/* -------------------------------------------------------------------------- */
/* Diagnostics projections                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Projects the thesis into per-field provenance. Each field contributes its
 * status, confidence, buyer-facing permission, and opaque evidence refs; the
 * wording contributes only a hash, so a reader sees that the argument moved
 * without reading the argument.
 */
function thesisDiagnosticsFor(
  builder: BuildTraceBuilder,
  input: NonNullable<ProductionTraceDiagnosticsInput["thesis"]>
) {
  const { thesis, compilation } = input;
  return normalizeThesisDiagnostics({
    schemaVersion: thesis.schemaVersion,
    version: compilation.version,
    revision: thesis.revision,
    digest: compilation.digest,
    proofMode: compilation.proofMode,
    fields: THESIS_FIELD_ROLES.map((role) => {
      const field = thesis[role];
      if (!field) {
        return {
          role,
          present: false,
          status: "unknown",
          confidence: "low",
          buyerFacing: false,
          evidenceRefs: []
        };
      }
      const valueDigest = buildTraceValueDigest(field.value);
      return {
        role,
        present: true,
        status: field.status,
        confidence: field.confidence,
        buyerFacing: field.buyerFacing,
        evidenceRefs: builder.refs(field.evidenceRefs),
        ...(valueDigest ? { valueDigest } : {})
      };
    }),
    unsupportedFields: compilation.unsupportedFields,
    omittedFields: compilation.omittedFields,
    unknownCount: thesis.unknowns.length,
    reasonCodes: compilation.reasonCodes
  });
}

/**
 * Projects the strategy receipt. Dimension results and hard failures are what
 * make a rejection reviewable, so they are kept per candidate; the arguments
 * themselves stay in the private selection the receipt was taken from.
 */
function strategyDiagnosticsFor(
  receipt: NonNullable<ProductionTraceDiagnosticsInput["strategy"]>
) {
  return normalizeStrategyDiagnostics({
    version: receipt.version,
    thesisDigest: receipt.thesisDigest,
    strategyDigest: receipt.strategyDigest,
    ...(receipt.selectedId ? { selectedCandidateId: receipt.selectedId } : {}),
    candidates: receipt.records.map((record) => ({
      candidateId: record.candidateId,
      angle: record.angle,
      argumentKind: record.argumentKind,
      frameworkId: record.frameworkId,
      ...(record.total === undefined ? {} : { total: record.total }),
      ...(record.dimensions ? { dimensions: record.dimensions } : {}),
      hardFailures: record.hardFailures,
      reasonCodes: record.reasonCodes
    })),
    rejectedCandidateIds: receipt.rejectedIds,
    reasonCodes: receipt.reasonCodes
  });
}

function recipeDiagnosticsFor(selection: PageRecipeSelection) {
  return normalizeRecipeDiagnostics({
    schemaVersion: selection.schemaVersion,
    recipeId: selection.recipeId,
    recipeVersion: selection.recipeVersion,
    digest: selection.digest,
    thesisDigest: selection.thesisDigest,
    activated: selection.activated,
    thesisValid: selection.thesisValidation.valid,
    sections: selection.sections.map((section) => ({
      order: section.order,
      slotId: section.slotId,
      role: section.role,
      required: section.required
    })),
    rejected: selection.rejected.map((entry) => ({
      recipeId: entry.recipeId,
      reasonCode: entry.reasonCode
    })),
    reasonCodes: selection.reasonCodes
  });
}

/**
 * The composition selection, defaulted from the family decision. The two
 * families that were not chosen are recorded as the rejected alternatives,
 * because "which visual family lost" is otherwise unrecoverable from the trace.
 */
function compositionDiagnosticsFor(
  decision: WireframeDecisionV2 | undefined,
  override: ProductionTraceDiagnosticsInput["composition"]
) {
  if (override) return normalizeCompositionDiagnostics(override);
  if (!decision) return undefined;
  return normalizeCompositionDiagnostics({
    version: "three-family-v2.0.0",
    selectedCompositionId: decision.family,
    archetypeId: decision.subtype,
    rejected: wireframeFamiliesV2
      .filter((family) => family !== decision.family)
      .map((family) => ({ candidateId: family, reasonCode: "family_signal_absent" })),
    reasonCodes: [
      decision.reasonCode,
      `confidence_${decision.confidence}`,
      `sections_${decision.sectionPlan.length}`
    ]
  });
}

/**
 * Assembles one private BuildTrace for a production attempt. Every value is
 * normalized by the trace contract, so no raw copy, URL, or prompt can pass.
 */
export function compileProductionBuildTrace(
  input: ProductionBuildTraceInput
): BuildTraceV1 {
  const builder = new BuildTraceBuilder({
    traceId: input.identity.traceId,
    sessionId: input.sessionId,
    attemptId: input.identity.attemptId,
    revision: input.revision,
    startedAt: input.startedAt,
    ...(input.identity.supportRef ? { supportRef: input.identity.supportRef } : {})
  });

  builder.refs(input.evidenceIds ?? []);

  for (const stage of input.stages) {
    builder.recordTiming({
      stage: stage.stage,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      status: stage.status
    });
    if (["fallback", "failed", "stale", "timed_out"].includes(stage.status)) {
      builder.recordFallback({
        stage: stage.stage,
        code: stage.detailCode,
        scope: "stage",
        at: stage.completedAt
      });
    }
  }

  if (input.framework) {
    builder.recordDecision(
      "framework",
      frameworkDecisionTrace(
        builder,
        input.framework,
        input.frameworkConfidence ?? 0,
        input.frameworkEvidenceIds ?? []
      )
    );
  }
  if (input.messagingCompiler) {
    builder.recordDecision(
      "messaging",
      messagingDecisionTrace(
        builder,
        input.messagingCompiler.artifact,
        input.messagingCompiler.evaluations,
        input.messagingCompiler.reasonCodes
      )
    );
  }
  if (input.familyDecision) {
    builder.recordDecision("wireframe", wireframeDecisionTrace(builder, input.familyDecision));
  }
  if (input.brand) {
    builder.recordBrandDecision(brandDecisionTraceFor(builder, input.brand));
    const allocation =
      input.assetAllocation ?? privateAssetAllocationFor(input.brand);
    if (allocation) {
      builder.recordAssetAllocation(assetAllocationTraceFor(builder, allocation));
    }
  }

  for (const section of input.sections ?? []) {
    builder.recordSection(
      normalizeSectionBuildTrace({
        sectionId: section.sectionId,
        role: section.role,
        ...(section.jobCode ? { jobCode: section.jobCode } : {}),
        promptVersion: section.promptVersion ?? PRODUCTION_BUILD_TRACE_PROMPT_VERSION,
        templateVersion:
          section.templateVersion ?? `${PRODUCTION_BUILD_TRACE_TEMPLATE_VERSION}.0`,
        writerMode: section.writerMode,
        ...(section.model ? { model: section.model } : {}),
        inputEvidenceRefs: builder.refs([...section.evidenceIds]),
        inputDigest: buildTraceDigest(section.inputDigestSource),
        candidateDigests: (section.candidateDigestSources ?? []).map((candidate) =>
          buildTraceDigest(candidate)
        ),
        candidateCount:
          section.candidateCount ?? section.candidateDigestSources?.length ?? 0,
        selectedCandidate: section.selectedCandidate ?? 0,
        selectionReasons: [...(section.selectionReasons ?? [])],
        ...(section.rejectionCodes ? { rejectionCodes: [...section.rejectionCodes] } : {}),
        ...(section.repairStatus ? { repairStatus: section.repairStatus } : {}),
        outputDigest: buildTraceDigest(section.outputDigestSource),
        quality: section.quality ?? {},
        startedAt: section.startedAt,
        completedAt: section.completedAt,
        status: section.status,
        ...(section.fallbackCode ? { fallbackCode: section.fallbackCode } : {})
      })
    );
    if (section.fallbackCode) {
      builder.recordFallback({
        stage: "section-writer",
        code: section.fallbackCode,
        scope: "section",
        at: section.completedAt,
        sectionId: section.sectionId
      });
    }
  }

  // Fidelity is scored last so it sees the brand and copy the visitor will
  // actually get. It records what the build was worth, and gates nothing.
  if (input.brand && input.sectionCopy) {
    for (const result of evaluateBrandFidelity({
      brand: input.brand,
      sections: input.sectionCopy,
      availableEvidenceRefs: input.evidenceIds ?? []
    }).dimensions) {
      builder.recordQuality({
        ...result,
        evidenceRefs: builder.refs(result.evidenceRefs)
      });
    }
  }

  if (input.fallbackCode) {
    builder.recordFallback({
      stage: "final-reveal",
      code: input.fallbackCode,
      scope: "experience",
      at: input.completedAt
    });
  }

  recordProductionDiagnostics(builder, input);

  return builder.build({
    terminalStatus: input.terminalStatus,
    completedAt: input.completedAt
  });
}

/**
 * Records the diagnostics block. Kept separate from assembly so a reader can see
 * at a glance that diagnostics only ever consume already-published receipts and
 * that the lifecycle entry is always written when anything else was.
 */
function recordProductionDiagnostics(
  builder: BuildTraceBuilder,
  input: ProductionBuildTraceInput
): void {
  const diagnostics = input.diagnostics;
  const composition = compositionDiagnosticsFor(
    input.familyDecision,
    diagnostics?.composition
  );

  if (diagnostics?.evidenceGraph) {
    const receipt = diagnostics.evidenceGraph;
    builder.recordEvidenceGraphDiagnostics(
      normalizeEvidenceGraphDiagnostics({
        schemaVersion: receipt.schemaVersion,
        revision: receipt.revision,
        digest: receipt.digest,
        inputFingerprintDigest: receipt.inputFingerprintDigest,
        entityCount: receipt.entityCount,
        claimCount: receipt.claimCount,
        factCount: receipt.factCount,
        inferenceCount: receipt.inferenceCount,
        unknownCount: receipt.unknownCount,
        buyerFacingClaimCount: receipt.buyerFacingClaimCount,
        relationshipCount: receipt.relationshipCount,
        gaps: receipt.gaps
      })
    );
    builder.recordResearchDiagnostics(
      normalizeResearchDiagnostics({
        lanes: receipt.lanes.map((lane) => ({
          laneId: lane.laneId,
          outcome: lane.outcome,
          queryCount: lane.queryCount,
          entityCount: lane.entityCount,
          claimCount: lane.claimCount,
          gapCount: lane.gapCount,
          durationMs: lane.durationMs
        }))
      })
    );
  }
  if (diagnostics?.thesis) {
    builder.recordThesisDiagnostics(thesisDiagnosticsFor(builder, diagnostics.thesis));
  }
  if (diagnostics?.strategy) {
    builder.recordStrategyDiagnostics(strategyDiagnosticsFor(diagnostics.strategy));
  }
  if (diagnostics?.recipe) {
    builder.recordRecipeDiagnostics(recipeDiagnosticsFor(diagnostics.recipe));
  }
  if (composition) builder.recordCompositionDiagnostics(composition);
  for (const gate of diagnostics?.qualityGates ?? []) {
    builder.recordQualityGate(normalizeQualityGateDiagnostics(gate));
  }

  const fallbackCodes = [
    ...(diagnostics?.lifecycle?.fallbackCodes ?? []),
    ...input.stages
      .filter(({ status }) => ["fallback", "failed", "stale", "timed_out"].includes(status))
      .map(({ detailCode }) => detailCode),
    ...(input.sections ?? [])
      .map(({ fallbackCode }) => fallbackCode)
      .filter((code): code is string => Boolean(code)),
    ...(input.fallbackCode ? [input.fallbackCode] : [])
  ];
  const totalMs =
    diagnostics?.lifecycle?.totalMs
    ?? Math.max(0, Date.parse(input.completedAt) - Date.parse(input.startedAt));

  builder.recordLifecycleDiagnostics(
    normalizeLifecycleDiagnostics({
      revision: input.revision,
      attemptId: input.identity.attemptId,
      inputFingerprintDigest:
        diagnostics?.evidenceGraph?.inputFingerprintDigest
        ?? (diagnostics?.lifecycle?.inputFingerprint
          ? undefined
          : `fingerprint-unreported-${input.revision}`),
      ...(diagnostics?.lifecycle?.inputFingerprint
        ? { inputFingerprint: diagnostics.lifecycle.inputFingerprint }
        : {}),
      renderMs: diagnostics?.lifecycle?.renderMs ?? stageDurationMs(input, "render"),
      persistenceMs:
        diagnostics?.lifecycle?.persistenceMs ?? stageDurationMs(input, "persist"),
      readbackMs: diagnostics?.lifecycle?.readbackMs ?? stageDurationMs(input, "readback"),
      totalMs,
      fallbackCodes
    })
  );
}

/** Duration of the first stage whose name contains the given fragment. */
function stageDurationMs(input: ProductionBuildTraceInput, fragment: string): number {
  const stage = input.stages.find(({ stage: name }) => name.includes(fragment));
  if (!stage) return 0;
  return Math.max(0, Date.parse(stage.completedAt) - Date.parse(stage.startedAt));
}
