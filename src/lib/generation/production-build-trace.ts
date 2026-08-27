import type { BrandSystemV2 } from "@/lib/brand-system";
import {
  BuildTraceBuilder,
  buildTraceDigest,
  normalizeAssetAllocationTrace,
  normalizeBrandDecisionTrace,
  normalizeRankedDecisionTrace,
  normalizeSectionBuildTrace,
  safeTraceIdentifier,
  type BuildTraceTerminalStatus,
  type BuildTraceV1,
  type BuildTraceWriterMode
} from "@/lib/build-trace";
import type { AssetAllocationPlan } from "@/lib/asset-allocation";
import { evaluateBrandFidelity } from "@/lib/brand-fidelity-evaluator";
import type { SemanticRoleSelection } from "@/lib/brand-semantics";
import type { ProductionMessageSpine } from "@/lib/generation/production-message-spine";
import type {
  SectionCopyCandidate,
  SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type { WireframeDecisionV2 } from "@/lib/generation/three-family-contract";

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
  writerMode: BuildTraceWriterMode;
  model?: string;
  promptVersion?: string;
  templateVersion?: string;
  evidenceIds: readonly string[];
  inputDigestSource: unknown;
  candidateDigestSources?: readonly unknown[];
  selectedCandidate?: number;
  selectionReasons?: readonly string[];
  outputDigestSource: unknown;
  quality?: Record<string, number | boolean | string>;
  startedAt: string;
  completedAt: string;
  status: "completed" | "fallback" | "failed" | "stale";
  fallbackCode?: string;
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
  framework?: ProductionMessageSpine["framework"];
  frameworkConfidence?: number;
  frameworkEvidenceIds?: readonly string[];
  familyDecision?: WireframeDecisionV2;
  sections?: readonly ProductionTraceSection[];
  /** Final copy the visitor receives. Scored for fidelity, never gated on. */
  sectionCopy?: readonly SectionCopyCandidate[];
  fallbackCode?: string;
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
  if (input.familyDecision) {
    builder.recordDecision("wireframe", wireframeDecisionTrace(builder, input.familyDecision));
  }
  if (input.brand) {
    builder.recordBrandDecision(brandDecisionTraceFor(builder, input.brand));
    if (input.brand.imagery.allocation) {
      builder.recordAssetAllocation(
        assetAllocationTraceFor(builder, input.brand.imagery.allocation)
      );
    }
  }

  for (const section of input.sections ?? []) {
    builder.recordSection(
      normalizeSectionBuildTrace({
        sectionId: section.sectionId,
        role: section.role,
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
        selectedCandidate: section.selectedCandidate ?? 0,
        selectionReasons: [...(section.selectionReasons ?? [])],
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

  return builder.build({
    terminalStatus: input.terminalStatus,
    completedAt: input.completedAt
  });
}
