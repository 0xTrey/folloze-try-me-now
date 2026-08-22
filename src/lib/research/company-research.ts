import type { ProductionArtifact } from "../orchestration/worker-types";

export type CompanyResearchField = "company" | "category" | "positioning";

export type CompanyResearchSourceAuthority =
  | "visitor-supplied-official"
  | "company-official-site"
  | "company-official-resource"
  | "third-party";

export interface CompanyResearchSource {
  authority: CompanyResearchSourceAuthority;
  url: string;
  title?: string;
  observedAt: string;
}

/**
 * An extracted, normalized evidence item. This module does not retrieve or
 * parse source content.
 */
export interface NormalizedCompanyEvidence {
  id: string;
  revision: number;
  field: CompanyResearchField;
  value: string;
  confidence: number;
  source: CompanyResearchSource;
}

export type OfficialCompanyResearchSourceAuthority = Exclude<
  CompanyResearchSourceAuthority,
  "third-party"
>;

export interface OfficialCompanyResearchProvenance {
  authority: OfficialCompanyResearchSourceAuthority;
  url: string;
  title?: string;
  observedAt: string;
  official: true;
}

export interface CompanyResearchClaim {
  value: string;
  evidenceRef: string;
  confidence: number;
  revision: number;
  provenance: OfficialCompanyResearchProvenance;
}

export interface CompanyResearchConflict {
  field: CompanyResearchField;
  selectedEvidenceRef: string;
  supersededEvidenceRefs: string[];
  resolution: "authority" | "freshness" | "confidence" | "stable_order";
}

export interface CompanyResearchBrief {
  revision: number;
  claims: Partial<Record<CompanyResearchField, CompanyResearchClaim>>;
  conflicts: CompanyResearchConflict[];
}

export interface BuildCompanyResearchInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  evidence: readonly NormalizedCompanyEvidence[];
  startedAt: string;
  /** Shared wall-clock deadline, expressed as epoch milliseconds. */
  deadlineAt?: number;
  /** Allows a coordinator to preserve evidence collected before its timeout. */
  timedOut?: boolean;
  now?: () => Date;
}

const FIELD_ORDER: readonly CompanyResearchField[] = [
  "company",
  "category",
  "positioning"
];

function isOfficialAuthority(
  authority: CompanyResearchSourceAuthority
): authority is OfficialCompanyResearchSourceAuthority {
  return authority !== "third-party";
}

function authorityRank(authority: OfficialCompanyResearchSourceAuthority): number {
  return authority === "visitor-supplied-official" ? 2 : 1;
}

function observedAtTime(evidence: NormalizedCompanyEvidence): number {
  return Date.parse(evidence.source.observedAt);
}

function normalizeClaimValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isSupportedOfficialEvidence(
  evidence: NormalizedCompanyEvidence,
  revision: number
): evidence is NormalizedCompanyEvidence & {
  source: CompanyResearchSource & {
    authority: OfficialCompanyResearchSourceAuthority;
  };
} {
  return (
    evidence.revision === revision &&
    Boolean(evidence.id.trim()) &&
    Boolean(normalizeClaimValue(evidence.value)) &&
    Number.isFinite(evidence.confidence) &&
    evidence.confidence >= 0 &&
    evidence.confidence <= 1 &&
    isOfficialAuthority(evidence.source.authority) &&
    Boolean(evidence.source.url.trim()) &&
    Number.isFinite(observedAtTime(evidence))
  );
}

function compareEvidence(
  left: NormalizedCompanyEvidence & {
    source: CompanyResearchSource & {
      authority: OfficialCompanyResearchSourceAuthority;
    };
  },
  right: NormalizedCompanyEvidence & {
    source: CompanyResearchSource & {
      authority: OfficialCompanyResearchSourceAuthority;
    };
  }
): number {
  const authorityDifference =
    authorityRank(right.source.authority) - authorityRank(left.source.authority);
  if (authorityDifference !== 0) return authorityDifference;

  const freshnessDifference = observedAtTime(right) - observedAtTime(left);
  if (freshnessDifference !== 0) return freshnessDifference;

  const confidenceDifference = right.confidence - left.confidence;
  if (confidenceDifference !== 0) return confidenceDifference;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function conflictResolution(
  selected: NormalizedCompanyEvidence & {
    source: CompanyResearchSource & {
      authority: OfficialCompanyResearchSourceAuthority;
    };
  },
  runnerUp: NormalizedCompanyEvidence & {
    source: CompanyResearchSource & {
      authority: OfficialCompanyResearchSourceAuthority;
    };
  }
): CompanyResearchConflict["resolution"] {
  if (authorityRank(selected.source.authority) !== authorityRank(runnerUp.source.authority)) {
    return "authority";
  }
  if (observedAtTime(selected) !== observedAtTime(runnerUp)) return "freshness";
  if (selected.confidence !== runnerUp.confidence) return "confidence";
  return "stable_order";
}

function compileBrief(
  evidence: readonly NormalizedCompanyEvidence[],
  revision: number
): CompanyResearchBrief {
  const supported = evidence
    .filter((item) => isSupportedOfficialEvidence(item, revision))
    .sort(compareEvidence);
  const claims: CompanyResearchBrief["claims"] = {};
  const conflicts: CompanyResearchConflict[] = [];

  for (const field of FIELD_ORDER) {
    const fieldEvidence = supported.filter((item) => item.field === field);
    const selected = fieldEvidence[0];
    if (!selected) continue;

    claims[field] = {
      value: normalizeClaimValue(selected.value),
      evidenceRef: selected.id,
      confidence: selected.confidence,
      revision,
      provenance: {
        authority: selected.source.authority,
        url: selected.source.url,
        ...(selected.source.title ? { title: selected.source.title } : {}),
        observedAt: selected.source.observedAt,
        official: true
      }
    };

    const selectedValue = normalizeClaimValue(selected.value).toLowerCase();
    const conflicting = fieldEvidence.filter(
      (item) => normalizeClaimValue(item.value).toLowerCase() !== selectedValue
    );
    const runnerUp = conflicting[0];
    if (runnerUp) {
      conflicts.push({
        field,
        selectedEvidenceRef: selected.id,
        supersededEvidenceRefs: conflicting.map((item) => item.id),
        resolution: conflictResolution(selected, runnerUp)
      });
    }
  }

  return { revision, claims, conflicts };
}

function artifactConfidence(brief: CompanyResearchBrief): number {
  const claims = FIELD_ORDER
    .map((field) => brief.claims[field])
    .filter((claim): claim is CompanyResearchClaim => Boolean(claim));
  if (claims.length === 0) return 0;
  return claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length;
}

/**
 * Compiles current-revision official evidence into one bounded company brief.
 * Unsupported and stale evidence is omitted rather than converted to filler.
 */
export function buildCompanyResearchArtifact(
  input: BuildCompanyResearchInput
): ProductionArtifact<CompanyResearchBrief> {
  const completedAt = (input.now ?? (() => new Date()))();

  if (input.revision !== input.activeRevision) {
    return {
      worker: "company-researcher",
      sessionId: input.sessionId,
      revision: input.revision,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      startedAt: input.startedAt,
      completedAt: completedAt.toISOString(),
      errorCode: "STALE_COMPANY_RESEARCH_REVISION"
    };
  }

  const brief = compileBrief(input.evidence, input.revision);
  const evidenceRefs = FIELD_ORDER.flatMap((field) => {
    const evidenceRef = brief.claims[field]?.evidenceRef;
    return evidenceRef ? [evidenceRef] : [];
  });
  const timedOut =
    input.timedOut === true ||
    (input.deadlineAt !== undefined && completedAt.getTime() >= input.deadlineAt);
  const hasClaims = evidenceRefs.length > 0;

  return {
    worker: "company-researcher",
    sessionId: input.sessionId,
    revision: input.revision,
    status: timedOut ? "timed_out" : hasClaims ? "complete" : "fallback",
    value: brief,
    evidenceRefs,
    confidence: artifactConfidence(brief),
    startedAt: input.startedAt,
    completedAt: completedAt.toISOString(),
    ...(timedOut
      ? {
          fallbackCode: hasClaims
            ? "COMPANY_RESEARCH_TIMEOUT_OFFICIAL_EVIDENCE"
            : "COMPANY_RESEARCH_TIMEOUT_NO_OFFICIAL_EVIDENCE"
        }
      : hasClaims
        ? {}
        : { fallbackCode: "NO_SUPPORTED_OFFICIAL_COMPANY_EVIDENCE" })
  };
}
