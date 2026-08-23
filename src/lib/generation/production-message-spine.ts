import type {
  MessageFrameworkId,
  MessageFrameworkRanking
} from "@/lib/generation/message-spine";
import type {
  CompositionId,
  WireframeArchetypeId,
  WireframeSectionCount,
  WireframeSectionRole,
  WireframeSelectionV1
} from "@/lib/generation/wireframe-library";
import type { ProductionArtifact } from "@/lib/orchestration/worker-types";
import type {
  LiveBriefEvidenceField,
  MaterialLiveBriefEvidence,
  ReconciledLiveBriefField
} from "@/lib/research/evidence-reconciler";
import {
  adaptSectionSlotV2,
  boundedCtaV2,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type {
  CtaIdV2,
  SectionRoleV2,
  SectionSlotV2,
  WireframeDecisionV2,
  WireframeFamilyV2
} from "@/lib/generation/three-family-contract";

export const PRODUCTION_ARGUMENT_ROLES = [
  "audience",
  "tension",
  "promise",
  "mechanism",
  "proofPlan",
  "decisionHelp",
  "nextAction",
  "whyNow"
] as const;

export type ProductionArgumentRole = (typeof PRODUCTION_ARGUMENT_ROLES)[number];
export type RequiredProductionArgumentRole = Exclude<
  ProductionArgumentRole,
  "tension" | "whyNow"
>;
export type OptionalProductionArgumentRole = Extract<
  ProductionArgumentRole,
  "tension" | "whyNow"
>;

export interface EvidenceBoundedArgumentSlot {
  directive: string;
  evidenceRefs: string[];
  unknowns: string[];
}

export type RequiredProductionArgument = Record<
  RequiredProductionArgumentRole,
  EvidenceBoundedArgumentSlot
> &
  Partial<Record<OptionalProductionArgumentRole, EvidenceBoundedArgumentSlot>>;

export interface ProductionMessageSpineEvidenceEntry {
  field: LiveBriefEvidenceField;
  evidenceRefs: string[];
  confidence: number;
  visitorEdited: boolean;
}

export interface ProductionMessageSpineSectionSlot {
  id: `section-${number}`;
  order: number;
  role: WireframeSectionRole;
  label: string;
  wordBudget: {
    min: number;
    max: number;
  };
  argumentRoles: ProductionArgumentRole[];
  evidenceRefs: string[];
  unknowns: string[];
  omissions: OptionalProductionArgumentRole[];
}

export interface ProductionMessageSpine {
  version: 1;
  revision: number;
  framework: {
    id: MessageFrameworkId;
    name: string;
    reasonCodes: MessageFrameworkRanking["selected"]["reasonCodes"];
  };
  composition: {
    archetypeId: WireframeArchetypeId;
    compositionId: CompositionId;
    sectionCount: WireframeSectionCount;
  };
  argument: RequiredProductionArgument;
  sections: ProductionMessageSpineSectionSlot[];
  evidence: ProductionMessageSpineEvidenceEntry[];
  evidenceRefs: string[];
  unknowns: string[];
  omissions: OptionalProductionArgumentRole[];
  visibility: "internal";
}

export interface CompileProductionMessageSpineInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  evidenceArtifact: ProductionArtifact<MaterialLiveBriefEvidence>;
  frameworkArtifact: ProductionArtifact<MessageFrameworkRanking>;
  compositionArtifact: ProductionArtifact<WireframeSelectionV1>;
  startedAt: string;
  completedAt: string;
}

export interface FamilyProductionMessageSpineSectionSlot {
  id: string;
  order: number;
  role: SectionRoleV2;
  navigationLabel: string;
  claimType: SectionSlotV2["claimType"];
  argumentRoles: ProductionArgumentRole[];
  evidenceRefs: string[];
  unknowns: string[];
  omissions: OptionalProductionArgumentRole[];
  sourceSlot: SectionSlotV2;
}

export interface FamilyProductionMessageSpine {
  version: 2;
  revision: number;
  family: WireframeFamilyV2;
  subtype: WireframeDecisionV2["subtype"];
  reasonCode: string;
  argumentOrder: ProductionArgumentRole[];
  argument: RequiredProductionArgument;
  entities?: {
    sellerName: string;
    targetName?: string;
  };
  cta?: ReturnType<typeof boundedCtaV2>;
  sections: FamilyProductionMessageSpineSectionSlot[];
  evidenceRefs: string[];
  unknowns: string[];
  omissions: OptionalProductionArgumentRole[];
  visibility: "internal";
  writerBoundary: {
    messageSpineRequired: true;
    familyLocked: true;
  };
}

export interface CompileFamilyProductionMessageSpineInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  decision: WireframeDecisionV2;
  argument: RequiredProductionArgument;
  sellerName?: string;
  targetName?: string;
  ctaId?: CtaIdV2;
  startedAt: string;
  completedAt: string;
}

const FAMILY_ARGUMENT_ORDER: Record<
  WireframeFamilyV2,
  readonly ProductionArgumentRole[]
> = {
  launch: [
    "audience",
    "promise",
    "tension",
    "mechanism",
    "decisionHelp",
    "proofPlan",
    "nextAction"
  ],
  guide: [
    "audience",
    "whyNow",
    "tension",
    "decisionHelp",
    "mechanism",
    "proofPlan",
    "nextAction"
  ],
  align: [
    "audience",
    "promise",
    "whyNow",
    "tension",
    "mechanism",
    "proofPlan",
    "decisionHelp",
    "nextAction"
  ]
};

const V2_ROLE_ARGUMENTS: Record<
  SectionRoleV2,
  readonly ProductionArgumentRole[]
> = {
  "buyer-outcome": ["audience", "promise"],
  "current-friction": ["tension", "promise"],
  mechanism: ["mechanism"],
  "use-cases": ["decisionHelp", "mechanism"],
  proof: ["proofPlan"],
  "next-move": ["promise", "nextAction"],
  "market-change": ["promise", "decisionHelp", "whyNow"],
  stakes: ["tension", "decisionHelp"],
  "evaluation-criteria": ["decisionHelp"],
  "solution-mapping": ["decisionHelp", "mechanism"],
  applications: ["decisionHelp", "audience"],
  "evaluation-close": ["proofPlan", "nextAction"],
  "shared-priority": ["audience", "whyNow", "promise"],
  "account-relevance": ["audience", "tension", "whyNow"],
  "shared-opportunity": ["whyNow", "promise", "mechanism"],
  "priority-paths": ["whyNow", "audience", "decisionHelp"],
  "validation-plan": ["proofPlan", "mechanism"],
  "first-decision": ["decisionHelp", "nextAction"],
  "proof-depth": ["proofPlan"],
  resource: ["proofPlan", "decisionHelp"]
};

const usableStatuses = new Set<ProductionArtifact<unknown>["status"]>([
  "complete",
  "fallback",
  "timed_out"
]);

const fieldLabels: Record<LiveBriefEvidenceField, string> = {
  companyName: "seller company name",
  canonicalDomain: "seller canonical domain",
  company: "seller company description",
  category: "seller category",
  positioning: "seller positioning",
  offer: "selected offer",
  audience: "selected audience",
  objective: "selected objective",
  cta: "selected CTA",
  brandVisual: "seller brand visual evidence"
};

const roleArguments: Record<
  WireframeSectionRole,
  readonly ProductionArgumentRole[]
> = {
  hero: ["audience", "promise"],
  context: ["tension", "promise"],
  mechanism: ["mechanism"],
  proof: ["proofPlan"],
  pathways: ["decisionHelp"],
  agenda: ["promise", "decisionHelp"],
  "chapter-navigation": ["decisionHelp", "proofPlan"],
  "decision-support": ["decisionHelp", "proofPlan"],
  resources: ["proofPlan"],
  "seller-validation": ["mechanism", "proofPlan"],
  "next-action": ["nextAction"]
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function failedArtifact(
  input: CompileProductionMessageSpineInput,
  status: "failed" | "stale",
  errorCode: string
): ProductionArtifact<ProductionMessageSpine> {
  return {
    worker: "message-spine-architect",
    sessionId: input.sessionId,
    revision: input.revision,
    status,
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCode
  };
}

function artifactRevisionFailure(
  input: CompileProductionMessageSpineInput
): string | undefined {
  const artifacts = [
    input.evidenceArtifact,
    input.frameworkArtifact,
    input.compositionArtifact
  ];
  if (artifacts.some((artifact) => artifact.sessionId !== input.sessionId)) {
    return "production_message_spine_session_mismatch";
  }
  if (
    input.revision !== input.activeRevision ||
    artifacts.some((artifact) => artifact.revision !== input.revision)
  ) {
    return "production_message_spine_stale_revision";
  }
  if (
    input.evidenceArtifact.value?.revision !== undefined &&
    input.evidenceArtifact.value.revision !== input.revision
  ) {
    return "production_message_spine_stale_revision";
  }
  const fields = input.evidenceArtifact.value?.fields;
  if (
    fields &&
    Object.values(fields).some(
      (field) => field !== undefined && field.revision !== input.revision
    )
  ) {
    return "production_message_spine_stale_revision";
  }
  return undefined;
}

function usableArtifact<T>(artifact: ProductionArtifact<T>): artifact is ProductionArtifact<T> & {
  value: T;
} {
  return usableStatuses.has(artifact.status) && artifact.value !== undefined;
}

function refs(
  ...fields: Array<ReconciledLiveBriefField<LiveBriefEvidenceField> | undefined>
): string[] {
  return unique(fields.flatMap((field) => field?.evidenceRefs ?? []));
}

function evidenceUnknowns(evidence: MaterialLiveBriefEvidence): string[] {
  return unique([
    ...evidence.unresolvedFields.map(
      (field) => `Missing material evidence for ${fieldLabels[field]}.`
    ),
    ...evidence.optionalEvidenceMissing.map(
      (field) => `No current-revision evidence for ${fieldLabels[field]}.`
    )
  ]);
}

function supportedProofRefs(evidence: MaterialLiveBriefEvidence): string[] {
  const proofFields = [
    evidence.fields.offer,
    evidence.fields.company,
    evidence.fields.category,
    evidence.fields.positioning
  ];
  return unique(
    proofFields.flatMap((field) => {
      if (
        !field ||
        !field.provenance.some(
          (item) => item.authority === "official" || item.authority === "public"
        )
      ) {
        return [];
      }
      return field.evidenceRefs;
    })
  );
}

function compileArgument(
  evidence: MaterialLiveBriefEvidence,
  frameworkId: MessageFrameworkId
): {
  argument?: RequiredProductionArgument;
  unknowns: string[];
  omissions: OptionalProductionArgumentRole[];
  hasProof: boolean;
} {
  const audience = evidence.fields.audience;
  const offer = evidence.fields.offer;
  const objective = evidence.fields.objective;
  const cta = evidence.fields.cta;
  if (!audience || !offer || !objective || !cta) {
    return {
      unknowns: evidenceUnknowns(evidence),
      omissions: ["tension", "whyNow"],
      hasProof: false
    };
  }

  const category = evidence.fields.category;
  const positioning = evidence.fields.positioning;
  const proofRefs = supportedProofRefs(evidence);
  const hasProof = proofRefs.length > 0;
  const mechanismRefs = refs(positioning, category, offer);
  const mechanismUnknowns =
    positioning || category
      ? []
      : ["The operating mechanism is not supported by current-revision evidence."];
  const proofUnknowns = hasProof
    ? []
    : [
        "No current-revision official or public offer proof is available.",
        "Quantified outcomes and customer claims must be omitted."
      ];

  const argument: RequiredProductionArgument = {
    audience: {
      directive: `Address ${audience.value.label} and the buyer job: ${audience.value.buyerJob}.`,
      evidenceRefs: refs(audience),
      unknowns: []
    },
    promise: {
      directive: `Frame ${offer.value.label} as a bounded path toward ${objective.value}; do not claim the outcome has already been achieved.`,
      evidenceRefs: refs(offer, objective),
      unknowns: []
    },
    mechanism: {
      directive: positioning
        ? `Explain only the supported positioning for ${offer.value.label}: ${positioning.value}`
        : category
          ? `Explain ${offer.value.label} through the supported category ${category.value}; treat implementation details as unknown.`
          : `Explain only what current evidence supports about ${offer.value.label}; do not invent capabilities, integrations, or operating steps.`,
      evidenceRefs: mechanismRefs,
      unknowns: mechanismUnknowns
    },
    proofPlan: {
      directive: hasProof
        ? frameworkId === "proof-led-decision"
          ? "Lead with the strongest referenced offer evidence, state its limits, and keep every proof statement traceable."
          : "Use referenced offer evidence only; separate supported facts from validation questions."
        : "Use a validation plan instead of declarative proof; ask the reader to verify the mechanism, outcome, and fit.",
      evidenceRefs: proofRefs,
      unknowns: proofUnknowns
    },
    decisionHelp: {
      directive: `Help ${audience.value.label} evaluate ${offer.value.label} against ${audience.value.buyerJob}; phrase unsupported details as questions.`,
      evidenceRefs: refs(audience, offer, objective),
      unknowns: mechanismUnknowns
    },
    nextAction: {
      directive: `Use ${cta.value.label} as the bounded next action for ${objective.value}.`,
      evidenceRefs: refs(cta, objective),
      unknowns: []
    }
  };

  return {
    argument,
    unknowns: unique([
      ...evidenceUnknowns(evidence),
      ...mechanismUnknowns,
      ...proofUnknowns,
      "No evidence-bounded status-quo tension was supplied.",
      "No evidence-bounded timing reason was supplied."
    ]),
    omissions: ["tension", "whyNow"],
    hasProof
  };
}

function sectionSlots(
  selection: WireframeSelectionV1,
  argument: RequiredProductionArgument,
  omissions: OptionalProductionArgumentRole[]
): ProductionMessageSpineSectionSlot[] {
  return selection.compositionPlan.sections.map((section, index) => {
    const requestedRoles = roleArguments[section.role];
    const argumentRoles = requestedRoles.filter(
      (role) => role in argument
    ) as ProductionArgumentRole[];
    const omittedRoles = requestedRoles.filter(
      (role): role is OptionalProductionArgumentRole =>
        (role === "tension" || role === "whyNow") && omissions.includes(role)
    );
    const boundedSlots = argumentRoles.map((role) => argument[role]!);
    return {
      id: `section-${index + 1}`,
      order: index + 1,
      role: section.role,
      label: section.label,
      wordBudget: { ...section.wordBudget },
      argumentRoles,
      evidenceRefs: unique(boundedSlots.flatMap((slot) => slot.evidenceRefs)),
      unknowns: unique(boundedSlots.flatMap((slot) => slot.unknowns)),
      omissions: [...omittedRoles]
    };
  });
}

function evidenceEntries(
  evidence: MaterialLiveBriefEvidence
): ProductionMessageSpineEvidenceEntry[] {
  return (
    Object.entries(evidence.fields) as Array<
      [
        LiveBriefEvidenceField,
        ReconciledLiveBriefField<LiveBriefEvidenceField> | undefined
      ]
    >
  )
    .filter(
      (
        entry
      ): entry is [
        LiveBriefEvidenceField,
        ReconciledLiveBriefField<LiveBriefEvidenceField>
      ] => entry[1] !== undefined
    )
    .map(([field, value]) => ({
      field,
      evidenceRefs: [...value.evidenceRefs],
      confidence: value.confidence,
      visitorEdited: value.visitorEdited
    }));
}

/**
 * Compiles current-revision strategy and geometry into an internal contract for
 * bounded section writers. It produces directives, never final copy or markup.
 */
export function compileProductionMessageSpine(
  input: CompileProductionMessageSpineInput
): ProductionArtifact<ProductionMessageSpine> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failedArtifact(
      input,
      "failed",
      "invalid_production_message_spine_revision"
    );
  }

  const revisionFailure = artifactRevisionFailure(input);
  if (revisionFailure) {
    return failedArtifact(
      input,
      revisionFailure === "production_message_spine_stale_revision"
        ? "stale"
        : "failed",
      revisionFailure
    );
  }

  if (
    input.evidenceArtifact.worker !== "evidence-reconciler" ||
    input.frameworkArtifact.worker !== "framework-ranker" ||
    input.compositionArtifact.worker !== "wireframe-ranker"
  ) {
    return failedArtifact(
      input,
      "failed",
      "production_message_spine_worker_mismatch"
    );
  }

  if (
    !usableArtifact(input.evidenceArtifact) ||
    !usableArtifact(input.frameworkArtifact) ||
    !usableArtifact(input.compositionArtifact)
  ) {
    return failedArtifact(
      input,
      "failed",
      "production_message_spine_dependency_unavailable"
    );
  }

  const evidence = input.evidenceArtifact.value;
  const framework = input.frameworkArtifact.value;
  const selection = input.compositionArtifact.value;
  if (
    selection.compositionPlan.compositionId !== selection.compositionId ||
    selection.compositionPlan.archetypeId !== selection.archetypeId ||
    selection.compositionPlan.sectionCount !==
      selection.compositionPlan.sections.length
  ) {
    return failedArtifact(
      input,
      "failed",
      "production_message_spine_composition_mismatch"
    );
  }

  const compiled = compileArgument(evidence, framework.selected.id);
  if (!compiled.argument) {
    return failedArtifact(
      input,
      "failed",
      "production_message_spine_material_evidence_incomplete"
    );
  }

  const evidenceLedger = evidenceEntries(input.evidenceArtifact.value);
  const value: ProductionMessageSpine = {
    version: 1,
    revision: input.revision,
    framework: {
      id: framework.selected.id,
      name: framework.selected.name,
      reasonCodes: [...framework.selected.reasonCodes]
    },
    composition: {
      archetypeId: selection.archetypeId,
      compositionId: selection.compositionId,
      sectionCount: selection.compositionPlan.sectionCount
    },
    argument: compiled.argument,
    sections: sectionSlots(
      selection,
      compiled.argument,
      compiled.omissions
    ),
    evidence: evidenceLedger,
    evidenceRefs: unique(
      evidenceLedger.flatMap((entry) => entry.evidenceRefs)
    ),
    unknowns: compiled.unknowns,
    omissions: compiled.omissions,
    visibility: "internal"
  };
  const confidenceInputs = [
    input.evidenceArtifact.confidence,
    input.frameworkArtifact.confidence,
    input.compositionArtifact.confidence
  ].map(boundedConfidence);
  const confidence = Math.min(...confidenceInputs);

  return {
    worker: "message-spine-architect",
    sessionId: input.sessionId,
    revision: input.revision,
    status: compiled.hasProof ? "complete" : "fallback",
    value,
    evidenceRefs: value.evidenceRefs,
    confidence: compiled.hasProof ? confidence : Math.min(confidence, 0.55),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(!compiled.hasProof
      ? { fallbackCode: "production_message_spine_no_proof_evidence" }
      : {})
  };
}

const FAMILY_SECTION_ROLES: Record<
  WireframeFamilyV2,
  ReadonlySet<SectionRoleV2>
> = {
  launch: new Set([
    "buyer-outcome",
    "current-friction",
    "mechanism",
    "use-cases",
    "proof",
    "next-move",
    "proof-depth",
    "resource"
  ]),
  guide: new Set([
    "market-change",
    "stakes",
    "evaluation-criteria",
    "solution-mapping",
    "applications",
    "evaluation-close",
    "proof-depth",
    "resource"
  ]),
  align: new Set([
    "shared-priority",
    "account-relevance",
    "shared-opportunity",
    "priority-paths",
    "validation-plan",
    "first-decision",
    "proof-depth",
    "resource"
  ])
};

export function argumentOrderForFamilyV2(
  family: WireframeFamilyV2
): ProductionArgumentRole[] {
  return [...FAMILY_ARGUMENT_ORDER[family]];
}

export function argumentRolesForSectionV2(
  role: SectionRoleV2
): ProductionArgumentRole[] {
  return [...V2_ROLE_ARGUMENTS[role]];
}

function failedFamilySpineArtifact(
  input: CompileFamilyProductionMessageSpineInput,
  status: "failed" | "stale",
  errorCode: string
): ProductionArtifact<FamilyProductionMessageSpine> {
  return {
    worker: "message-spine-architect",
    sessionId: input.sessionId,
    revision: input.revision,
    status,
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCode
  };
}

/**
 * Applies a locked Launch, Guide, or Align decision to the argument before any
 * section writer can receive a slot. It changes message order and ownership,
 * while carrying the reviewed slot recipe through unchanged.
 */
export function compileFamilyProductionMessageSpine(
  input: CompileFamilyProductionMessageSpineInput
): ProductionArtifact<FamilyProductionMessageSpine> {
  if (
    !input.sessionId.trim() ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0
  ) {
    return failedFamilySpineArtifact(
      input,
      "failed",
      "invalid_family_message_spine_input"
    );
  }
  if (
    input.revision !== input.activeRevision ||
    input.decision.revision !== input.revision
  ) {
    return failedFamilySpineArtifact(
      input,
      "stale",
      "family_message_spine_stale_revision"
    );
  }
  if (
    input.decision.sessionId !== input.sessionId ||
    input.decision.version !== 2 ||
    input.decision.locked !== true
  ) {
    return failedFamilySpineArtifact(
      input,
      "failed",
      "family_message_spine_decision_mismatch"
    );
  }
  if (
    input.decision.sectionPlan.length < 4 ||
    input.decision.sectionPlan.length > 8 ||
    input.decision.sectionPlan.some(
      (slot) => !FAMILY_SECTION_ROLES[input.decision.family].has(slot.role)
    )
  ) {
    return failedFamilySpineArtifact(
      input,
      "failed",
      "family_message_spine_section_contract_mismatch"
    );
  }
  const allowedCtas = new Set(
    input.decision.sectionPlan.flatMap((slot) => slot.allowedCtas ?? [])
  );
  if (input.ctaId && !allowedCtas.has(input.ctaId)) {
    return failedFamilySpineArtifact(
      input,
      "failed",
      "family_message_spine_cta_not_allowed"
    );
  }

  const omissions = (["tension", "whyNow"] as const).filter(
    (role) => !(role in input.argument)
  );
  const sections = input.decision.sectionPlan.map(
    (slot, index): FamilyProductionMessageSpineSectionSlot => {
      const requestedRoles = V2_ROLE_ARGUMENTS[slot.role];
      const argumentRoles = requestedRoles.filter(
        (role) => role in input.argument
      ) as ProductionArgumentRole[];
      const boundedSlots = argumentRoles.map((role) => input.argument[role]!);
      return {
        id: slot.id,
        order: index + 1,
        role: slot.role,
        navigationLabel: slot.navigationLabel,
        claimType: slot.claimType,
        argumentRoles,
        evidenceRefs: unique(
          boundedSlots.flatMap((argumentSlot) => argumentSlot.evidenceRefs)
        ),
        unknowns: unique(
          boundedSlots.flatMap((argumentSlot) => argumentSlot.unknowns)
        ),
        omissions: requestedRoles.filter(
          (role): role is OptionalProductionArgumentRole =>
            (role === "tension" || role === "whyNow") &&
            omissions.includes(role)
        ),
        sourceSlot: {
          ...slot,
          requiredEvidenceKinds: [...slot.requiredEvidenceKinds],
          wordBudget: {
            headline: [...slot.wordBudget.headline] as [number, number],
            body: [...slot.wordBudget.body] as [number, number]
          },
          ...(slot.allowedCtas ? { allowedCtas: [...slot.allowedCtas] } : {})
        }
      };
    }
  );
  const evidenceRefs = unique(
    sections.flatMap((section) => section.evidenceRefs)
  );
  const hasUnsupportedFact = sections.some(
    (section) =>
      section.claimType === "fact" &&
      section.evidenceRefs.length === 0 &&
      !section.sourceSlot.optional
  );
  const value: FamilyProductionMessageSpine = {
    version: 2,
    revision: input.revision,
    family: input.decision.family,
    subtype: input.decision.subtype,
    reasonCode: input.decision.reasonCode,
    argumentOrder: argumentOrderForFamilyV2(input.decision.family),
    argument: input.argument,
    ...(input.sellerName?.trim()
      ? {
          entities: {
            sellerName: input.sellerName.trim(),
            ...(input.targetName?.trim()
              ? { targetName: input.targetName.trim() }
              : {})
          }
        }
      : {}),
    ...(input.ctaId ? { cta: boundedCtaV2(input.ctaId) } : {}),
    sections,
    evidenceRefs,
    unknowns: unique(
      Object.values(input.argument).flatMap((slot) => slot?.unknowns ?? [])
    ),
    omissions,
    visibility: "internal",
    writerBoundary: {
      messageSpineRequired: true,
      familyLocked: true
    }
  };

  return {
    worker: "message-spine-architect",
    sessionId: input.sessionId,
    revision: input.revision,
    status: hasUnsupportedFact ? "fallback" : "complete",
    value,
    evidenceRefs,
    confidence: hasUnsupportedFact ? 0.55 : 1,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(hasUnsupportedFact
      ? { fallbackCode: "family_message_spine_fact_requires_evidence" }
      : {})
  };
}

export function writerSlotsFromFamilyMessageSpine(
  spine: FamilyProductionMessageSpine
): SectionWriterSlot[] {
  if (
    spine.version !== 2 ||
    !spine.writerBoundary.messageSpineRequired ||
    !spine.writerBoundary.familyLocked
  ) {
    throw new Error("V2 section writers require a locked message spine");
  }
  return spine.sections.map((section) =>
    adaptSectionSlotV2(
      spine.family,
      section.sourceSlot,
      section.order,
      section.evidenceRefs
    )
  );
}
