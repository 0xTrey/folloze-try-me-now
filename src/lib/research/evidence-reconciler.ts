import type {
  ImageryCue,
  NormalizedColorRatio,
  ScreenshotVisualEvidence,
  TypographyCue,
  VisualDensity,
  NavigationStyle,
  HeroStyle
} from "@/lib/brand-visual-evidence";
import type { NormalizedCompanyIdentity } from "@/lib/domain-identity";
import type {
  AudienceRecommendationSet
} from "@/lib/generation/audience-recommendations";
import type {
  ObjectiveCtaRecommendationSet
} from "@/lib/generation/objective-cta-recommendations";
import type {
  ProductionArtifact,
  WorkerKind
} from "@/lib/orchestration/worker-types";
import type { CtaType } from "@/lib/types";

import type { CompanyResearchBrief } from "./company-research";
import type {
  OfferEvidenceKind,
  OfferRecommendationSet
} from "./offer-recommendations";

export const materialLiveBriefFields = [
  "companyName",
  "canonicalDomain",
  "offer",
  "audience",
  "objective",
  "cta"
] as const;

export const optionalLiveBriefEvidenceFields = [
  "company",
  "category",
  "positioning",
  "brandVisual"
] as const;

export type MaterialLiveBriefField = (typeof materialLiveBriefFields)[number];
export type OptionalLiveBriefEvidenceField =
  (typeof optionalLiveBriefEvidenceFields)[number];
export type LiveBriefEvidenceField =
  | MaterialLiveBriefField
  | OptionalLiveBriefEvidenceField;

export interface ReconciledOfferValue {
  label: string;
  kind: OfferEvidenceKind;
}

export interface ReconciledAudienceValue {
  label: string;
  buyerRole: string;
  buyerJob: string;
}

export interface ReconciledCtaValue {
  type: CtaType;
  label: string;
}

export interface ReconciledBrandVisualValue {
  colors?: readonly NormalizedColorRatio[];
  radii: {
    controlPx?: number;
    cardPx?: number;
  };
  density?: VisualDensity;
  navigation?: NavigationStyle;
  hero?: HeroStyle;
  typography?: TypographyCue;
  imagery?: ImageryCue;
}

export interface LiveBriefEvidenceValueMap {
  companyName: string;
  canonicalDomain: string;
  company: string;
  category: string;
  positioning: string;
  offer: ReconciledOfferValue;
  audience: ReconciledAudienceValue;
  objective: string;
  cta: ReconciledCtaValue;
  brandVisual: ReconciledBrandVisualValue;
}

export type EvidenceAuthority =
  | "visitor"
  | "official"
  | "public"
  | "deterministic";

export type EvidenceSemanticRole =
  | "identity"
  | "seller"
  | "target"
  | "company-research"
  | "offer"
  | "audience-strategy"
  | "objective-cta"
  | "brand-visual"
  | "visitor-edit";

export interface LiveBriefFieldProvenance {
  authority: EvidenceAuthority;
  semanticRole: EvidenceSemanticRole;
  worker: WorkerKind | "visitor";
  source: string;
  observedAt: string;
  url?: string;
}

export interface ReconciledLiveBriefField<K extends LiveBriefEvidenceField> {
  revision: number;
  value: LiveBriefEvidenceValueMap[K];
  evidenceRefs: string[];
  confidence: number;
  provenance: LiveBriefFieldProvenance[];
  visitorEdited: boolean;
}

export type ReconciledLiveBriefFields = {
  [K in LiveBriefEvidenceField]?: ReconciledLiveBriefField<K>;
};

export interface VisitorLiveBriefEdit<K extends LiveBriefEvidenceField> {
  value: LiveBriefEvidenceValueMap[K];
  evidenceRef: string;
  confidence?: number;
  editedAt: string;
  editedAtRevision: number;
}

export type VisitorLiveBriefEdits = {
  [K in LiveBriefEvidenceField]?: VisitorLiveBriefEdit<K>;
};

export type EvidenceConflictResolution =
  | "visitor-authority"
  | "official-source-authority"
  | "semantic-role"
  | "freshness"
  | "confidence"
  | "stable-order";

export interface LiveBriefEvidenceConflict {
  field: LiveBriefEvidenceField;
  selectedEvidenceRefs: string[];
  supersededEvidenceRefs: string[];
  resolution: EvidenceConflictResolution;
}

export interface MaterialLiveBriefEvidence {
  revision: number;
  fields: ReconciledLiveBriefFields;
  materialCompleteness: "complete" | "incomplete";
  unresolvedFields: MaterialLiveBriefField[];
  optionalEvidenceMissing: OptionalLiveBriefEvidenceField[];
  conflicts: LiveBriefEvidenceConflict[];
}

export interface ReconcileLiveBriefEvidenceInput {
  sessionId: string;
  revision: number;
  identityArtifacts?: readonly ProductionArtifact<NormalizedCompanyIdentity>[];
  brandVisualArtifacts?: readonly ProductionArtifact<ScreenshotVisualEvidence>[];
  companyResearchArtifacts?: readonly ProductionArtifact<CompanyResearchBrief>[];
  offerRecommendationArtifacts?: readonly ProductionArtifact<OfferRecommendationSet>[];
  audienceRecommendationArtifacts?: readonly ProductionArtifact<AudienceRecommendationSet>[];
  objectiveCtaArtifacts?: readonly ProductionArtifact<ObjectiveCtaRecommendationSet>[];
  visitorEdits?: VisitorLiveBriefEdits;
  startedAt: string;
  completedAt: string;
}

interface FieldCandidate<K extends LiveBriefEvidenceField = LiveBriefEvidenceField> {
  field: K;
  value: LiveBriefEvidenceValueMap[K];
  evidenceRefs: string[];
  confidence: number;
  provenance: LiveBriefFieldProvenance[];
  visitorEdited: boolean;
  authorityRank: number;
  semanticRoleRank: number;
  freshness: number;
  stableKey: string;
}

const authorityRanks: Record<EvidenceAuthority, number> = {
  visitor: 4,
  official: 3,
  public: 2,
  deterministic: 1
};

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueProvenance(
  values: readonly LiveBriefFieldProvenance[]
): LiveBriefFieldProvenance[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = canonicalValue(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceAuthority(source: string): EvidenceAuthority {
  const normalized = source.toLocaleLowerCase();
  if (normalized.includes("visitor")) return "visitor";
  if (
    normalized.includes("official") ||
    normalized.includes("canonical") ||
    normalized.includes("brandfetch") ||
    normalized.includes("redirect")
  ) {
    return "official";
  }
  return "public";
}

function provenance(input: {
  authority: EvidenceAuthority;
  semanticRole: EvidenceSemanticRole;
  worker: WorkerKind;
  source: string;
  observedAt: string;
  url?: string;
}): LiveBriefFieldProvenance {
  return {
    authority: input.authority,
    semanticRole: input.semanticRole,
    worker: input.worker,
    source: input.source,
    observedAt: input.observedAt,
    ...(input.url ? { url: input.url } : {})
  };
}

function candidate<K extends LiveBriefEvidenceField>(input: {
  field: K;
  value: LiveBriefEvidenceValueMap[K];
  evidenceRefs: readonly string[];
  confidence: number;
  provenance: readonly LiveBriefFieldProvenance[];
  visitorEdited?: boolean;
  semanticRoleRank: number;
}): FieldCandidate<K> {
  const evidenceRefs = unique(input.evidenceRefs);
  const fieldProvenance = uniqueProvenance(input.provenance);
  const freshness = Math.max(0, ...fieldProvenance.map((item) => timestamp(item.observedAt)));
  const authorityRank = Math.max(
    0,
    ...fieldProvenance.map((item) => authorityRanks[item.authority])
  );
  return {
    field: input.field,
    value: input.value,
    evidenceRefs,
    confidence: boundedConfidence(input.confidence),
    provenance: fieldProvenance,
    visitorEdited: input.visitorEdited === true,
    authorityRank,
    semanticRoleRank: input.semanticRoleRank,
    freshness,
    stableKey: `${input.field}:${canonicalValue(input.value)}:${evidenceRefs.join("|")}`
  };
}

function usableArtifact<T>(
  artifact: ProductionArtifact<T>,
  input: ReconcileLiveBriefEvidenceInput
): artifact is ProductionArtifact<T> & { value: T } {
  if (
    artifact.sessionId !== input.sessionId ||
    artifact.revision !== input.revision ||
    !artifact.value ||
    !["complete", "fallback", "timed_out"].includes(artifact.status)
  ) {
    return false;
  }
  const nestedRevision = (artifact.value as { revision?: unknown }).revision;
  return nestedRevision === undefined || nestedRevision === input.revision;
}

function identityCandidates(
  artifacts: readonly ProductionArtifact<NormalizedCompanyIdentity>[],
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  return artifacts.flatMap((artifact) => {
    if (!usableArtifact(artifact, input)) return [];
    const nameEvidence = artifact.value.evidence.name;
    const domainEvidence = artifact.value.evidence.canonicalDomain;
    const result: FieldCandidate[] = [];
    if (nameEvidence.revision === input.revision && nameEvidence.value.trim()) {
      const authority = sourceAuthority(nameEvidence.source);
      result.push(candidate({
        field: "companyName",
        value: nameEvidence.value,
        evidenceRefs: [nameEvidence.source],
        confidence: nameEvidence.confidence,
        provenance: [provenance({
          authority,
          semanticRole: "identity",
          worker: artifact.worker,
          source: nameEvidence.source,
          observedAt: nameEvidence.observedAt
        })],
        visitorEdited: authority === "visitor",
        semanticRoleRank: 4
      }));
    }
    if (
      domainEvidence.revision === input.revision &&
      domainEvidence.value.trim()
    ) {
      const authority = sourceAuthority(domainEvidence.source);
      result.push(candidate({
        field: "canonicalDomain",
        value: domainEvidence.value,
        evidenceRefs: [domainEvidence.source],
        confidence: domainEvidence.confidence,
        provenance: [provenance({
          authority,
          semanticRole: "identity",
          worker: artifact.worker,
          source: domainEvidence.source,
          observedAt: domainEvidence.observedAt
        })],
        visitorEdited: authority === "visitor",
        semanticRoleRank: 4
      }));
    }
    return result;
  });
}

function companyCandidates(
  artifacts: readonly ProductionArtifact<CompanyResearchBrief>[],
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  const fields = ["company", "category", "positioning"] as const;
  return artifacts.flatMap((artifact) => {
    if (!usableArtifact(artifact, input)) return [];
    return fields.flatMap((field) => {
      const claim = artifact.value.claims[field];
      if (!claim || claim.revision !== input.revision) return [];
      const authority: EvidenceAuthority =
        claim.provenance.authority === "visitor-supplied-official"
          ? "visitor"
          : "official";
      return [candidate({
        field,
        value: claim.value,
        evidenceRefs: [claim.evidenceRef],
        confidence: claim.confidence,
        provenance: [provenance({
          authority,
          semanticRole: "company-research",
          worker: artifact.worker,
          source: claim.evidenceRef,
          observedAt: claim.provenance.observedAt,
          url: claim.provenance.url
        })],
        semanticRoleRank: 4
      })];
    });
  });
}

function offerCandidates(
  artifacts: readonly ProductionArtifact<OfferRecommendationSet>[],
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  return artifacts.flatMap((artifact) => {
    if (!usableArtifact(artifact, input)) return [];
    const selected = artifact.value.candidates.find(
      (item) =>
        item.id === artifact.value.recommendedId ||
        item.recommended
    );
    if (!selected) return [];
    const authority: EvidenceAuthority =
      selected.source === "visitor-input"
        ? "visitor"
        : selected.source === "fallback"
          ? "deterministic"
          : "official";
    return [candidate({
      field: "offer",
      value: { label: selected.label, kind: selected.kind },
      evidenceRefs: selected.evidenceRefs,
      confidence: selected.confidence,
      provenance: [provenance({
        authority,
        semanticRole: "offer",
        worker: artifact.worker,
        source: selected.source,
        observedAt: artifact.completedAt
      })],
      visitorEdited: selected.source === "visitor-input",
      semanticRoleRank: 4
    })];
  });
}

function audienceCandidates(
  artifacts: readonly ProductionArtifact<AudienceRecommendationSet>[],
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  return artifacts.flatMap((artifact) => {
    if (!usableArtifact(artifact, input)) return [];
    const selected = artifact.value.candidates.find(
      (item) =>
        item.id === artifact.value.recommendedCandidateId ||
        item.recommended
    );
    if (!selected) return [];
    const sourceProvenance = selected.provenance.map((item) => {
      const authority: EvidenceAuthority =
        item.kind === "deterministic-fallback" ? "deterministic" : "official";
      return provenance({
        authority,
        semanticRole: item.entityRole,
        worker: artifact.worker,
        source: item.evidenceRef,
        observedAt: artifact.completedAt,
        url: item.sourceUrl
      });
    });
    const hasTargetContext = selected.provenance.some(
      (item) => item.entityRole === "target"
    );
    return [candidate({
      field: "audience",
      value: {
        label: selected.label,
        buyerRole: selected.buyerRole,
        buyerJob: selected.buyerJob
      },
      evidenceRefs: selected.provenance.map((item) => item.evidenceRef),
      confidence: selected.confidence,
      provenance: sourceProvenance.length
        ? sourceProvenance
        : [provenance({
            authority: "deterministic",
            semanticRole: "audience-strategy",
            worker: artifact.worker,
            source: "deterministic-policy",
            observedAt: artifact.completedAt
          })],
      semanticRoleRank: hasTargetContext ? 4 : 3
    })];
  });
}

function objectiveCtaCandidates(
  artifacts: readonly ProductionArtifact<ObjectiveCtaRecommendationSet>[],
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  return artifacts.flatMap((artifact) => {
    if (!usableArtifact(artifact, input)) return [];
    const selected = artifact.value.candidates.find(
      (item) =>
        item.id === artifact.value.recommendedCandidateId ||
        item.recommended
    );
    if (!selected || selected.revision !== input.revision) return [];
    const evidenceRefs = [...selected.provenance.evidenceRefs];
    const authority: EvidenceAuthority =
      selected.provenance.strategy === "evidence-backed"
        ? "official"
        : "deterministic";
    const fieldProvenance = [provenance({
      authority,
      semanticRole: "objective-cta",
      worker: artifact.worker,
      source: selected.provenance.strategy,
      observedAt: artifact.completedAt
    })];
    return [
      candidate({
        field: "objective",
        value: selected.objective,
        evidenceRefs,
        confidence: selected.confidence,
        provenance: fieldProvenance,
        semanticRoleRank: 4
      }),
      candidate({
        field: "cta",
        value: { ...selected.cta },
        evidenceRefs,
        confidence: selected.confidence,
        provenance: fieldProvenance,
        semanticRoleRank: 4
      })
    ];
  });
}

function visualValue(
  value: ScreenshotVisualEvidence,
  revision: number
): ReconciledBrandVisualValue {
  const current = <T extends { revision: number }>(
    item: T | undefined
  ): T | undefined => item?.revision === revision ? item : undefined;
  const colors = current(value.observedColorRatios);
  const controlRadius = current(value.radii.controlPx);
  const cardRadius = current(value.radii.cardPx);
  const density = current(value.density);
  const navigation = current(value.navigation);
  const hero = current(value.hero);
  const typography = current(value.typography);
  const imagery = current(value.imagery);
  return {
    ...(colors ? { colors: colors.value } : {}),
    radii: {
      ...(controlRadius ? { controlPx: controlRadius.value } : {}),
      ...(cardRadius ? { cardPx: cardRadius.value } : {})
    },
    ...(density ? { density: density.value } : {}),
    ...(navigation ? { navigation: navigation.value } : {}),
    ...(hero ? { hero: hero.value } : {}),
    ...(typography ? { typography: typography.value } : {}),
    ...(imagery ? { imagery: imagery.value } : {})
  };
}

function brandVisualCandidates(
  artifacts: readonly ProductionArtifact<ScreenshotVisualEvidence>[],
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  return artifacts.flatMap((artifact) => {
    if (!usableArtifact(artifact, input) || artifact.evidenceRefs.length === 0) {
      return [];
    }
    const values = [
      artifact.value.observedColorRatios,
      artifact.value.radii.controlPx,
      artifact.value.radii.cardPx,
      artifact.value.density,
      artifact.value.navigation,
      artifact.value.hero,
      artifact.value.typography,
      artifact.value.imagery
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const currentValues = values.filter((item) => item.revision === input.revision);
    if (currentValues.length === 0) return [];
    return [candidate({
      field: "brandVisual",
      value: visualValue(artifact.value, input.revision),
      evidenceRefs: artifact.evidenceRefs,
      confidence: artifact.confidence,
      provenance: currentValues.map((item) => provenance({
        authority: "official",
        semanticRole: "brand-visual",
        worker: artifact.worker,
        source: item.source,
        observedAt: item.observedAt
      })),
      semanticRoleRank: 4
    })];
  });
}

function visitorEditCandidates(
  edits: VisitorLiveBriefEdits | undefined,
  input: ReconcileLiveBriefEvidenceInput
): FieldCandidate[] {
  if (!edits) return [];
  return (Object.entries(edits) as Array<
    [LiveBriefEvidenceField, VisitorLiveBriefEdit<LiveBriefEvidenceField>]
  >).flatMap(([field, edit]) => {
    if (
      !edit ||
      edit.editedAtRevision > input.revision ||
      !edit.evidenceRef.trim() ||
      !Number.isFinite(Date.parse(edit.editedAt))
    ) {
      return [];
    }
    return [candidate({
      field,
      value: edit.value,
      evidenceRefs: [edit.evidenceRef],
      confidence: edit.confidence ?? 1,
      provenance: [{
        authority: "visitor",
        semanticRole: "visitor-edit",
        worker: "visitor",
        source: edit.evidenceRef,
        observedAt: edit.editedAt
      }],
      visitorEdited: true,
      semanticRoleRank: 5
    })];
  });
}

function compareCandidates(left: FieldCandidate, right: FieldCandidate): number {
  return Number(right.visitorEdited) - Number(left.visitorEdited)
    || right.authorityRank - left.authorityRank
    || right.semanticRoleRank - left.semanticRoleRank
    || right.freshness - left.freshness
    || right.confidence - left.confidence
    || left.stableKey.localeCompare(right.stableKey);
}

function conflictResolution(
  selected: FieldCandidate,
  runnerUp: FieldCandidate
): EvidenceConflictResolution {
  if (selected.visitorEdited !== runnerUp.visitorEdited) return "visitor-authority";
  if (selected.authorityRank !== runnerUp.authorityRank) {
    if (selected.authorityRank === authorityRanks.visitor) {
      return "visitor-authority";
    }
    return "official-source-authority";
  }
  if (selected.semanticRoleRank !== runnerUp.semanticRoleRank) return "semantic-role";
  if (selected.freshness !== runnerUp.freshness) return "freshness";
  if (selected.confidence !== runnerUp.confidence) return "confidence";
  return "stable-order";
}

function reconcileCandidates(
  candidates: readonly FieldCandidate[],
  revision: number
): {
  fields: ReconciledLiveBriefFields;
  conflicts: LiveBriefEvidenceConflict[];
} {
  const fields: ReconciledLiveBriefFields = {};
  const conflicts: LiveBriefEvidenceConflict[] = [];
  const allFields = [
    ...materialLiveBriefFields,
    ...optionalLiveBriefEvidenceFields
  ] as const;

  for (const field of allFields) {
    const ranked = candidates
      .filter((item) => item.field === field)
      .sort(compareCandidates);
    const selected = ranked[0];
    if (!selected) continue;
    const selectedValue = canonicalValue(selected.value);
    const equivalent = ranked.filter(
      (item) => canonicalValue(item.value) === selectedValue
    );
    const conflicting = ranked.filter(
      (item) => canonicalValue(item.value) !== selectedValue
    );
    const reconciledField = {
      revision,
      value: selected.value,
      evidenceRefs: unique(equivalent.flatMap((item) => item.evidenceRefs)),
      confidence: selected.confidence,
      provenance: uniqueProvenance(
        equivalent.flatMap((item) => item.provenance)
      ),
      visitorEdited: selected.visitorEdited
    } as ReconciledLiveBriefField<typeof field>;
    const assignableFields = fields as Partial<
      Record<
        LiveBriefEvidenceField,
        ReconciledLiveBriefField<LiveBriefEvidenceField>
      >
    >;
    assignableFields[field] = reconciledField;
    if (conflicting[0]) {
      conflicts.push({
        field,
        selectedEvidenceRefs: selected.evidenceRefs,
        supersededEvidenceRefs: unique(
          conflicting.flatMap((item) => item.evidenceRefs)
        ),
        resolution: conflictResolution(selected, conflicting[0])
      });
    }
  }

  return { fields, conflicts };
}

/**
 * Reconciles only current-revision, typed worker projections. The result keeps
 * bounded values and source metadata; it never copies fetched source bodies.
 */
export function reconcileLiveBriefEvidence(
  input: ReconcileLiveBriefEvidenceInput
): ProductionArtifact<MaterialLiveBriefEvidence> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return {
      worker: "evidence-reconciler",
      sessionId: input.sessionId,
      revision: input.revision,
      status: "failed",
      evidenceRefs: [],
      confidence: 0,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorCode: "invalid_evidence_reconciliation_revision"
    };
  }

  const candidates = [
    ...identityCandidates(input.identityArtifacts ?? [], input),
    ...brandVisualCandidates(input.brandVisualArtifacts ?? [], input),
    ...companyCandidates(input.companyResearchArtifacts ?? [], input),
    ...offerCandidates(input.offerRecommendationArtifacts ?? [], input),
    ...audienceCandidates(input.audienceRecommendationArtifacts ?? [], input),
    ...objectiveCtaCandidates(input.objectiveCtaArtifacts ?? [], input),
    ...visitorEditCandidates(input.visitorEdits, input)
  ];
  const { fields, conflicts } = reconcileCandidates(candidates, input.revision);
  const unresolvedFields = materialLiveBriefFields.filter(
    (field) => !fields[field]
  );
  const optionalEvidenceMissing = optionalLiveBriefEvidenceFields.filter(
    (field) => !fields[field]
  );
  const materialCompleteness =
    unresolvedFields.length === 0 ? "complete" as const : "incomplete" as const;
  const materialConfidence = materialLiveBriefFields
    .map((field) => fields[field]?.confidence)
    .filter((value): value is number => value !== undefined);
  const confidence = materialConfidence.length
    ? materialConfidence.reduce((sum, value) => sum + value, 0) /
      materialConfidence.length
    : 0;
  const value: MaterialLiveBriefEvidence = {
    revision: input.revision,
    fields,
    materialCompleteness,
    unresolvedFields: [...unresolvedFields],
    optionalEvidenceMissing: [...optionalEvidenceMissing],
    conflicts
  };

  return {
    worker: "evidence-reconciler",
    sessionId: input.sessionId,
    revision: input.revision,
    status: materialCompleteness === "complete" ? "complete" : "fallback",
    value,
    evidenceRefs: unique(
      Object.values(fields).flatMap((field) => field?.evidenceRefs ?? [])
    ),
    confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(materialCompleteness === "complete"
      ? {}
      : { fallbackCode: "material_live_brief_evidence_incomplete" })
  };
}
