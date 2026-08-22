import {
  audienceSuggestionsFor,
  narrativeProfileFor
} from "@/lib/brand-intelligence";
import type { ProductionArtifact } from "@/lib/orchestration/worker-types";
import type {
  BrandProfile,
  IntelligenceConfidence,
  SessionEvidenceItem
} from "@/lib/types";

export type AudienceRecommendationRoute = "generic-campaign" | "named-account";
export type AudienceCandidateConfidence = "high" | "medium" | "hypothesis";
export type AudienceEvidenceRole = "seller" | "target";

export interface AudienceCandidateProvenance {
  evidenceRef: string;
  entityRole: AudienceEvidenceRole;
  kind: "official-profile" | "public-evidence" | "deterministic-fallback";
  sourceUrl?: string;
  summary: string;
  confidence: number;
}

export interface AudienceAccountCandidate {
  id: string;
  label: string;
  buyerRole: string;
  buyerJob: string;
  rationale: string;
  recommended: boolean;
  confidence: number;
  confidenceBand: AudienceCandidateConfidence;
  recommendationKind: "evidence-backed" | "fallback";
  provenance: AudienceCandidateProvenance[];
  authority: {
    pageBrandOwner: "seller";
    offerOwner: "seller";
    sellerName: string;
    sellerDomain: string;
    targetUse: "none" | "abm-context-only";
  };
  targetContext?: {
    accountName: string;
    accountDomain: string;
    evidenceRefs: string[];
  };
}

export interface AudienceRecommendationSet {
  route: AudienceRecommendationRoute;
  candidates: [
    AudienceAccountCandidate,
    AudienceAccountCandidate,
    AudienceAccountCandidate
  ];
  recommendedCandidateId: string;
  sellerAuthority: {
    sellerName: string;
    sellerDomain: string;
    targetUse: "none" | "abm-context-only";
  };
}

export interface BuildAudienceRecommendationsInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  route: AudienceRecommendationRoute;
  seller: BrandProfile;
  target?: BrandProfile;
  offerLabel?: string;
  evidenceItems?: readonly SessionEvidenceItem[];
  generatedAt?: string;
}

export interface AudienceVisitorChoice {
  value: string;
  mode: "candidate" | "freeform";
  candidateId?: string;
  editedAtRevision: number;
}

export interface AudienceRecommendationState {
  revision: number;
  candidates: AudienceAccountCandidate[];
  recommendedCandidateId: string;
  visitorChoice?: AudienceVisitorChoice;
}

interface UsableEvidence {
  id: string;
  entityRole: AudienceEvidenceRole;
  sourceUrl: string;
  text: string;
  signals: string[];
  confidence: number;
}

interface RoleDefinition {
  family: string;
  buyerRole: string;
  buyerJob: string;
}

const unsafeEvidence =
  /\b(?:ignore|disregard|system prompt|developer message|assistant message|password|secret|api key|access token)\b/i;

const roleDefinitions: Array<{ pattern: RegExp; definition: RoleDefinition }> = [
  {
    pattern: /\b(?:finops|finance|financial|cost|spend|economics)\b/i,
    definition: {
      family: "finance",
      buyerRole: "Finance and FinOps leaders",
      buyerJob: "govern investment, usage, and measurable economic tradeoffs"
    }
  },
  {
    pattern: /\b(?:security|risk|governance|compliance|trust)\b/i,
    definition: {
      family: "security",
      buyerRole: "Security, risk, and governance leaders",
      buyerJob: "validate control, risk, and governance requirements before adoption"
    }
  },
  {
    pattern: /\b(?:data|analytics|ai|intelligence)\b/i,
    definition: {
      family: "data",
      buyerRole: "Data and AI leaders",
      buyerJob: "evaluate data readiness, governance, and operational value"
    }
  },
  {
    pattern: /\b(?:marketing|demand|revenue|sales|growth|customer)\b/i,
    definition: {
      family: "go-to-market",
      buyerRole: "Go-to-market leaders",
      buyerJob: "connect the offer to pipeline, customer, and revenue priorities"
    }
  },
  {
    pattern: /\b(?:platform|cloud|infrastructure|network|architecture|engineering|technical|api)\b/i,
    definition: {
      family: "technical",
      buyerRole: "Platform and architecture leaders",
      buyerJob: "validate architecture fit, operability, and implementation constraints"
    }
  },
  {
    pattern: /\b(?:operations|workflow|automation|integration|process|service)\b/i,
    definition: {
      family: "operations",
      buyerRole: "Operations and process leaders",
      buyerJob: "assess workflow impact, ownership, and the path to operational adoption"
    }
  },
  {
    pattern: /\b(?:executive|business|strategy|transformation|innovation)\b/i,
    definition: {
      family: "executive",
      buyerRole: "Executive sponsors",
      buyerJob: "align the business case, decision owners, and the next bounded commitment"
    }
  }
];

const fallbackRoles: RoleDefinition[] = [
  {
    family: "operations",
    buyerRole: "Operations and process leaders",
    buyerJob: "assess workflow impact, ownership, and the path to operational adoption"
  },
  {
    family: "technical",
    buyerRole: "Technical evaluators",
    buyerJob: "validate architecture fit, implementation constraints, and operational risk"
  },
  {
    family: "executive",
    buyerRole: "Executive sponsors",
    buyerJob: "align the business case, decision owners, and the next bounded commitment"
  },
  {
    family: "governance",
    buyerRole: "Risk and governance owners",
    buyerJob: "confirm policy, control, and accountability requirements"
  }
];

const optionStopWords = new Set([
  "and",
  "for",
  "the",
  "their",
  "with",
  "leaders",
  "owners",
  "teams",
  "evaluating",
  "exploring",
  "considering",
  "responsible"
]);

function cleanText(value: string, max = 180): string {
  const clean = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return clean.replace(/[\s,;:.]+$/g, "");
}

function safeEvidenceText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = cleanText(value);
  if (clean.length < 4 || unsafeEvidence.test(clean)) return undefined;
  return clean;
}

function normalizedDomain(value: string): string {
  return value.toLocaleLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function sourceBelongsTo(profile: BrandProfile, sourceUrl: string): boolean {
  try {
    const host = normalizedDomain(new URL(sourceUrl).hostname);
    const domains = [
      profile.domain,
      profile.canonicalDomain,
      ...(profile.domainAliases ?? [])
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizedDomain);
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function confidenceNumber(value: IntelligenceConfidence | undefined): number {
  if (value === "high") return 0.9;
  if (value === "medium") return 0.7;
  return 0.4;
}

function profileConfidence(profile: BrandProfile): number {
  if (profile.source === "brand-harvester") return 0.9;
  if (profile.source === "fast-extractor") return 0.72;
  return 0.3;
}

function stableId(prefix: string, ...values: Array<string | undefined>): string {
  const input = values.filter(Boolean).join("|").toLocaleLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function optionTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= 3)
        .filter((token) => !optionStopWords.has(token))
    )
  ];
}

function similarity(left: string, right: string): number {
  const leftTokens = new Set(optionTokens(left));
  const rightTokens = new Set(optionTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

/**
 * Removes repeated and near-identical audience options while preserving the
 * strategy rank of the first option.
 */
export function dedupeNearIdenticalAudienceOptions(options: readonly string[]): string[] {
  const result: string[] = [];
  for (const rawOption of options) {
    const option = cleanText(rawOption, 120);
    if (!option) continue;
    const normalized = option.toLocaleLowerCase();
    const duplicate = result.some((existing) => {
      const existingNormalized = existing.toLocaleLowerCase();
      return (
        normalized === existingNormalized ||
        (Math.min(normalized.length, existingNormalized.length) >= 24 &&
          (normalized.includes(existingNormalized) || existingNormalized.includes(normalized))) ||
        similarity(option, existing) >= 0.6
      );
    });
    if (!duplicate) result.push(option);
  }
  return result;
}

function roleFor(label: string): RoleDefinition {
  return (
    roleDefinitions.find(({ pattern }) => pattern.test(label))?.definition ?? {
      family: "business",
      buyerRole: cleanText(label, 90),
      buyerJob: "evaluate the offer against the team's operating priorities and next decision"
    }
  );
}

function profileEvidence(
  profile: BrandProfile,
  entityRole: AudienceEvidenceRole
): UsableEvidence[] {
  if (profile.source === "fallback" || !sourceBelongsTo(profile, profile.sourceUrl)) return [];
  const values = [
    ...profile.publicTopics,
    profile.description,
    profile.publicContext
  ]
    .map(safeEvidenceText)
    .filter((value): value is string => Boolean(value));
  return values.slice(0, 4).map((text, index) => ({
    id: stableId(`${entityRole}-profile`, profile.domain, text),
    entityRole,
    sourceUrl: profile.sourceUrl,
    text,
    signals: optionTokens(text).slice(0, 5),
    confidence: Math.max(0.6, profileConfidence(profile) - index * 0.04)
  }));
}

function explicitEvidence(
  items: readonly SessionEvidenceItem[],
  profile: BrandProfile,
  entityRole: AudienceEvidenceRole
): UsableEvidence[] {
  return items.flatMap((item) => {
    const text = safeEvidenceText(item.text);
    if (
      !text ||
      item.disposition === "excluded" ||
      item.entityRole !== entityRole ||
      !sourceBelongsTo(profile, item.sourceUrl)
    ) {
      return [];
    }
    return [
      {
        id: item.id,
        entityRole,
        sourceUrl: item.sourceUrl,
        text,
        signals: item.signals
          .map((signal) => safeEvidenceText(signal))
          .filter((signal): signal is string => Boolean(signal))
          .slice(0, 5),
        confidence: confidenceNumber(item.confidence)
      }
    ];
  });
}

function evidenceFor(
  items: readonly SessionEvidenceItem[],
  profile: BrandProfile,
  entityRole: AudienceEvidenceRole
): UsableEvidence[] {
  const combined = [
    ...explicitEvidence(items, profile, entityRole),
    ...profileEvidence(profile, entityRole)
  ];
  const seen = new Set<string>();
  return combined.filter((item) => {
    const key = item.text.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sellerAuthorityProvenance(seller: BrandProfile): AudienceCandidateProvenance {
  const official =
    seller.source !== "fallback" && sourceBelongsTo(seller, seller.sourceUrl);
  return {
    evidenceRef: official ? `seller:${seller.sourceUrl}` : `seller:${normalizedDomain(seller.domain)}`,
    entityRole: "seller",
    kind: official ? "official-profile" : "deterministic-fallback",
    ...(official ? { sourceUrl: seller.sourceUrl } : {}),
    summary: official
      ? `${seller.companyName} is the seller and owns the offer and page brand`
      : "Seller identity is present, but public seller evidence is sparse",
    confidence: official ? profileConfidence(seller) : 0.3
  };
}

function evidenceScore(label: string, role: RoleDefinition, evidence: UsableEvidence): number {
  const candidateTokens = new Set(optionTokens(`${label} ${role.buyerRole} ${role.buyerJob}`));
  const evidenceTokens = new Set([
    ...optionTokens(evidence.text),
    ...evidence.signals.flatMap(optionTokens)
  ]);
  return [...candidateTokens].filter((token) => evidenceTokens.has(token)).length;
}

function rankedEvidence(
  label: string,
  role: RoleDefinition,
  evidence: UsableEvidence[],
  candidateIndex: number
): UsableEvidence | undefined {
  const ranked = evidence
    .map((item, index) => ({
      item,
      index,
      score: evidenceScore(label, role, item)
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.item.confidence - left.item.confidence ||
        ((left.index - candidateIndex + evidence.length) % Math.max(evidence.length, 1)) -
          ((right.index - candidateIndex + evidence.length) % Math.max(evidence.length, 1))
    )[0];
  return ranked && ranked.score > 0 ? ranked.item : undefined;
}

function evidenceProvenance(evidence: UsableEvidence): AudienceCandidateProvenance {
  return {
    evidenceRef: evidence.id,
    entityRole: evidence.entityRole,
    kind: "public-evidence",
    sourceUrl: evidence.sourceUrl,
    summary: cleanText(evidence.text, 140),
    confidence: evidence.confidence
  };
}

function confidenceBand(value: number): AudienceCandidateConfidence {
  if (value >= 0.8) return "high";
  if (value >= 0.58) return "medium";
  return "hypothesis";
}

function distinctRoleOptions(suggestions: readonly string[]): Array<{
  label: string;
  role: RoleDefinition;
}> {
  const deduped = dedupeNearIdenticalAudienceOptions(suggestions);
  const selected: Array<{ label: string; role: RoleDefinition }> = [];
  const usedFamilies = new Set<string>();

  for (const label of deduped) {
    const role = roleFor(label);
    if (usedFamilies.has(role.family)) continue;
    selected.push({ label, role });
    usedFamilies.add(role.family);
    if (selected.length === 3) return selected;
  }

  for (const fallback of fallbackRoles) {
    if (usedFamilies.has(fallback.family)) continue;
    selected.push({ label: fallback.buyerRole, role: fallback });
    usedFamilies.add(fallback.family);
    if (selected.length === 3) return selected;
  }

  return selected.slice(0, 3);
}

function rationaleFor(input: {
  role: RoleDefinition;
  offerLabel: string;
  seller: BrandProfile;
  target?: BrandProfile;
  evidence?: UsableEvidence;
}): string {
  const { role, offerLabel, seller, target, evidence } = input;
  if (target && evidence?.entityRole === "target") {
    return `Recommended for ${target.companyName} because its public ${cleanText(evidence.text, 96)} context makes ${role.buyerRole} relevant: they ${role.buyerJob} while evaluating ${offerLabel}. ${seller.companyName} remains the offer and page authority.`;
  }
  if (evidence) {
    return `Recommended because ${role.buyerRole} ${role.buyerJob}, supported by ${seller.companyName}'s public ${cleanText(evidence.text, 96)} evidence.`;
  }
  return `Hypothesis to confirm: ${role.buyerRole} may ${role.buyerJob} while evaluating ${offerLabel}; public seller evidence is too sparse to state this as fact.`;
}

/**
 * Builds exactly three bounded recommendation candidates. Target evidence may
 * contextualize a named-account audience, but seller authority always owns the
 * offer and page brand.
 */
export function buildAudienceRecommendations(
  input: BuildAudienceRecommendationsInput
): ProductionArtifact<AudienceRecommendationSet> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (input.revision !== input.activeRevision) {
    return {
      worker: "audience-strategist",
      sessionId: input.sessionId,
      revision: input.revision,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      startedAt: generatedAt,
      completedAt: generatedAt,
      errorCode: "audience_revision_mismatch"
    };
  }

  const sellerEvidence = evidenceFor(input.evidenceItems ?? [], input.seller, "seller");
  const targetAllowed =
    input.route === "named-account" &&
    input.target &&
    input.target.identity?.confirmationStatus !== "rejected";
  const targetEvidence =
    targetAllowed && input.target
      ? evidenceFor(input.evidenceItems ?? [], input.target, "target")
      : [];
  const targetContextAvailable = Boolean(
    targetAllowed &&
      input.target &&
      input.target.source !== "fallback" &&
      targetEvidence.length
  );
  const contextEvidence =
    input.route === "named-account" && targetContextAvailable
      ? targetEvidence
      : sellerEvidence;
  const contextualTarget =
    input.route === "named-account" && targetContextAvailable
      ? input.target
      : undefined;
  const suggestions = audienceSuggestionsFor(input.seller, contextualTarget, {
    promotedOffer: input.offerLabel,
    objective: "Evaluate the next step"
  });
  const options = distinctRoleOptions(suggestions);
  const offerLabel =
    cleanText(input.offerLabel ?? narrativeProfileFor(input.seller).offerLabel, 96) ||
    `${input.seller.companyName}'s offering`;
  const authorityProvenance = sellerAuthorityProvenance(input.seller);
  const targetUse =
    input.route === "named-account" && input.target
      ? "abm-context-only" as const
      : "none" as const;

  const candidates = options.map(({ label, role }, index): AudienceAccountCandidate => {
    const evidence = rankedEvidence(label, role, contextEvidence, index);
    const contextualProvenance = evidence ? evidenceProvenance(evidence) : undefined;
    const provenance = contextualProvenance &&
      contextualProvenance.evidenceRef !== authorityProvenance.evidenceRef
      ? [authorityProvenance, contextualProvenance]
      : [authorityProvenance];
    const evidenceConfidence = evidence
      ? (authorityProvenance.confidence + evidence.confidence) / 2
      : Math.min(authorityProvenance.confidence, 0.4);
    const confidence = Number(evidenceConfidence.toFixed(2));
    const band = confidenceBand(confidence);
    return {
      id: stableId(
        "audience",
        input.seller.domain,
        contextualTarget?.domain,
        role.family,
        label
      ),
      label,
      buyerRole: role.buyerRole,
      buyerJob: role.buyerJob,
      rationale: rationaleFor({
        role,
        offerLabel,
        seller: input.seller,
        target: contextualTarget,
        evidence
      }),
      recommended: index === 0,
      confidence,
      confidenceBand: band,
      recommendationKind:
        evidence && band !== "hypothesis" && authorityProvenance.kind !== "deterministic-fallback"
          ? "evidence-backed"
          : "fallback",
      provenance,
      authority: {
        pageBrandOwner: "seller",
        offerOwner: "seller",
        sellerName: input.seller.companyName,
        sellerDomain: input.seller.domain,
        targetUse
      },
      ...(input.route === "named-account" && input.target
        ? {
            targetContext: {
              accountName: input.target.companyName,
              accountDomain: input.target.domain,
              evidenceRefs: targetEvidence.map(({ id }) => id)
            }
          }
        : {})
    };
  });

  if (candidates.length !== 3) {
    throw new Error("Audience strategy must resolve exactly three distinct role candidates.");
  }
  const tuple = candidates as AudienceRecommendationSet["candidates"];
  const artifactConfidence = Number(
    (tuple.reduce((sum, candidate) => sum + candidate.confidence, 0) / tuple.length).toFixed(2)
  );
  const evidenceRefs = [
    ...new Set(tuple.flatMap((candidate) =>
      candidate.provenance.map(({ evidenceRef }) => evidenceRef)
    ))
  ];
  const complete =
    input.seller.source !== "fallback" &&
    contextEvidence.length > 0 &&
    (input.route === "generic-campaign" || targetContextAvailable);

  return {
    worker: "audience-strategist",
    sessionId: input.sessionId,
    revision: input.revision,
    status: complete ? "complete" : "fallback",
    value: {
      route: input.route,
      candidates: tuple,
      recommendedCandidateId: tuple[0].id,
      sellerAuthority: {
        sellerName: input.seller.companyName,
        sellerDomain: input.seller.domain,
        targetUse
      }
    },
    evidenceRefs,
    confidence: artifactConfidence,
    startedAt: generatedAt,
    completedAt: generatedAt,
    ...(complete ? {} : { fallbackCode: "audience_sparse_evidence" })
  };
}

/**
 * Applies only current-revision generated fields. Visitor choice is copied
 * verbatim, including a free-form value or a choice whose candidate later
 * disappears, so background recommendation updates cannot overwrite it.
 */
export function mergeAudienceRecommendationArtifact(
  current: AudienceRecommendationState | undefined,
  artifact: ProductionArtifact<AudienceRecommendationSet>,
  activeRevision: number
): AudienceRecommendationState | undefined {
  if (
    artifact.revision !== activeRevision ||
    artifact.status === "stale" ||
    !artifact.value ||
    (artifact.status !== "complete" && artifact.status !== "fallback")
  ) {
    return current;
  }
  return {
    revision: artifact.revision,
    candidates: artifact.value.candidates,
    recommendedCandidateId: artifact.value.recommendedCandidateId,
    ...(current?.visitorChoice ? { visitorChoice: current.visitorChoice } : {})
  };
}
