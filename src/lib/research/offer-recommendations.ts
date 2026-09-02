export type OfferCampaignMotion = "product" | "solution" | "industry" | "event";
export type EventCampaignSubtype = "event" | "webinar";

export type OfferEvidenceKind =
  | "product"
  | "solution"
  | "industry"
  | "event"
  | "webinar"
  | "topic";

export type OfferEvidenceSource =
  | "visitor-input"
  | "supplied-url"
  | "homepage"
  | "official-page";

export type OfferRecommendationReasonCode =
  | "visitor_override"
  | "supplied_url_match"
  | "homepage_discovery"
  | "official_page_evidence"
  | "motion_match"
  | "event_subtype_match"
  | "high_confidence_evidence"
  | "medium_confidence_evidence"
  | "duplicate_evidence_merged"
  | "generic_taxonomy_suppressed"
  | "insufficient_specific_evidence"
  | "weak_evidence_fallback";

/**
 * A bounded projection of already-extracted evidence. This module deliberately
 * accepts no raw page body and performs no fetching.
 */
export interface ExtractedOfferEvidence {
  ref: string;
  label: string;
  kind: OfferEvidenceKind;
  source: OfferEvidenceSource;
  sourceUrl?: string;
  confidence: number;
}

export interface VisitorOfferOverride {
  label: string;
  evidenceRef: string;
  sourceUrl?: string;
  kind?: OfferEvidenceKind;
  confidence?: number;
}

export interface RankOfferRecommendationsInput {
  revision: number;
  motion: OfferCampaignMotion;
  eventSubtype?: EventCampaignSubtype;
  suppliedUrl?: string;
  visitorOverride?: VisitorOfferOverride;
  evidence: readonly ExtractedOfferEvidence[];
}

export interface OfferRecommendationCandidate {
  id: string;
  rank: 1 | 2 | 3;
  label: string;
  kind: OfferEvidenceKind;
  source: OfferEvidenceSource | "fallback";
  recommendationKind: "evidence-backed" | "fallback";
  recommended: boolean;
  reasonCodes: OfferRecommendationReasonCode[];
  evidenceRefs: string[];
  confidence: number;
}

export interface OfferRecommendationSet {
  revision: number;
  motion: OfferCampaignMotion;
  eventSubtype?: EventCampaignSubtype;
  status: "complete" | "fallback";
  recommendedId: string;
  candidates: [
    OfferRecommendationCandidate,
    OfferRecommendationCandidate,
    OfferRecommendationCandidate
  ];
  reasonCodes: OfferRecommendationReasonCode[];
  evidenceRefs: string[];
  confidence: number;
  presentation: {
    mode: "recommendations" | "freeform-with-url";
    candidateIds: string[];
    showFreeform: true;
    showSourceUrl: true;
  };
}

type OfferCandidateDraft = Omit<
  OfferRecommendationCandidate,
  "id" | "rank" | "recommended"
>;

interface RankedEvidenceGroup {
  key: string;
  best: ExtractedOfferEvidence;
  score: number;
  evidenceRefs: string[];
  reasonCodes: OfferRecommendationReasonCode[];
}

const MIN_SUPPORTED_CONFIDENCE = 0.58;

const sourceScores: Record<OfferEvidenceSource, number> = {
  "visitor-input": 400,
  "supplied-url": 300,
  "official-page": 200,
  homepage: 100
};

const fallbackTopics: Record<OfferCampaignMotion, readonly [string, string, string]> = {
  product: ["Product overview", "Product use cases", "Product evaluation questions"],
  solution: ["Solution overview", "Solution use cases", "Solution evaluation questions"],
  industry: ["Industry priorities", "Industry use cases", "Industry evaluation questions"],
  event: ["Event overview", "Event agenda", "Event audience questions"]
};

function cleanLabel(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .replace(/[\s,;:|/-]+$/g, "");
}

function dedupeKey(value: string): string {
  return cleanLabel(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const genericOfferTokens = new Set([
  "agenda",
  "audience",
  "business",
  "evaluation",
  "event",
  "general",
  "industry",
  "overview",
  "platform",
  "priorities",
  "product",
  "questions",
  "services",
  "solution",
  "topic",
  "use",
  "uses",
  "webinar"
]);

const strongHomepageOfferPattern =
  /\b(?:services?|solutions?|products?|platform|suite|cloud|software|application|advisory|accounting|payroll|tax|audit|assurance|consulting|compliance|wealth management|managed services|digital transformation|automation|headsets?|cameras?|devices?|erp)\b/i;

const homepageEditorialPattern =
  /\b(?:insights?|research|trends?|blog|articles?|stories|news|updates?|resources?|podcasts?|videos?|reports?|guides?|case studies|events?)\b/i;

const homepageEditorialOfferOverridePattern =
  /\b(?:services?|solutions?|products?|platform|suite|cloud|software|application)\b/i;

const editorialSourcePathPattern =
  /\/(?:insights?|research|trends?|blog|articles?|stories|news|updates?|resources?|podcasts?|videos?|reports?|guides?|case-stud(?:y|ies)|events?)(?:\/|$)/i;

// Keep technical implementation copy out of the marketable offer lane, while
// allowing concise homepage use-case headings to qualify as evidence.
const technicalHomepageLabelPattern =
  /\b(?:hosted runtime|runtime|audit log|compliance standards?|implementation details?|architecture|api reference|developer docs?|release notes?|security controls?)\b/i;
const homepageUseCasePattern =
  /^(?:capture|find|automate|manage|connect|secure|analyze|analyse|improve|streamline|reduce|scale|share|organize|organise|build|create|discover|protect|simplify)\b/i;

function isStrongHomepageOfferLabel(value: string): boolean {
  const clean = cleanLabel(value);
  if (/^[\s\d.,+$€£¥%]+$/.test(clean)) return false;
  if (/^(?:how|what|when|where|why|who)\b/i.test(clean) || /\?$/.test(clean)) return false;
  if (homepageEditorialPattern.test(clean) && !homepageEditorialOfferOverridePattern.test(clean)) {
    return false;
  }
  if (technicalHomepageLabelPattern.test(clean)) return false;
  if (homepageUseCasePattern.test(clean)) return true;
  return (
    strongHomepageOfferPattern.test(clean) ||
    /\b[A-Za-z][A-Za-z-]*\d+[A-Za-z\d-]*\b/.test(clean) ||
    /\b\d+[A-Za-z][A-Za-z\d-]*\b/.test(clean)
  );
}

function isHomepageUseCaseLabel(evidence: ExtractedOfferEvidence): boolean {
  return evidence.source === "homepage" && homepageUseCasePattern.test(cleanLabel(evidence.label));
}

function sourcePathname(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value).pathname.replace(/\/{2,}/g, "/") || "/";
  } catch {
    return undefined;
  }
}

function sourceRequiresExplicitOfferMarker(
  evidence: ExtractedOfferEvidence
): boolean {
  if (evidence.source === "homepage") return true;
  if (evidence.source !== "official-page") return false;
  const pathname = sourcePathname(evidence.sourceUrl);
  if (!pathname) return false;
  return pathname === "/" || editorialSourcePathPattern.test(pathname);
}

function isCompanySpecificOfferLabel(value: string): boolean {
  const key = dedupeKey(value);
  if (!key) return false;
  if (/\b(?:firm|company|provider)\b/i.test(key)) return false;
  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.every((token) => genericOfferTokens.has(token))) return false;
  return !/^(?:product|solution|industry|event|webinar)(?:\s+(?:overview|agenda|priorities|use cases|evaluation questions|audience questions))?$/i.test(
    key
  );
}

export function isEvidenceBackedOfferEvidence(
  evidence: ExtractedOfferEvidence
): boolean {
  return (
    evidence.source !== "visitor-input" &&
    evidence.confidence >= MIN_SUPPORTED_CONFIDENCE &&
    isCompanySpecificOfferLabel(evidence.label) &&
    (!sourceRequiresExplicitOfferMarker(evidence) || isStrongHomepageOfferLabel(evidence.label))
  );
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function isMotionMatch(
  kind: OfferEvidenceKind,
  motion: OfferCampaignMotion
): boolean {
  if (motion === "event") return kind === "event" || kind === "webinar";
  return kind === motion;
}

function reasonCodesFor(
  evidence: ExtractedOfferEvidence,
  input: RankOfferRecommendationsInput,
  matchesSuppliedUrl: boolean
): OfferRecommendationReasonCode[] {
  const reasonCodes: OfferRecommendationReasonCode[] = [];
  if (evidence.source === "visitor-input") reasonCodes.push("visitor_override");
  if (matchesSuppliedUrl) reasonCodes.push("supplied_url_match");
  if (evidence.source === "homepage") reasonCodes.push("homepage_discovery");
  if (evidence.source === "official-page") reasonCodes.push("official_page_evidence");
  if (isMotionMatch(evidence.kind, input.motion)) reasonCodes.push("motion_match");
  if (
    input.motion === "event" &&
    input.eventSubtype &&
    evidence.kind === input.eventSubtype
  ) {
    reasonCodes.push("event_subtype_match");
  }
  reasonCodes.push(
    evidence.confidence >= 0.8
      ? "high_confidence_evidence"
      : "medium_confidence_evidence"
  );
  return reasonCodes;
}

function evidenceScore(
  evidence: ExtractedOfferEvidence,
  input: RankOfferRecommendationsInput,
  matchesSuppliedUrl: boolean
): number {
  return (
    sourceScores[evidence.source] +
    (matchesSuppliedUrl ? 500 : 0) +
    (isMotionMatch(evidence.kind, input.motion) ? 100 : 0) +
    (input.motion === "event" &&
    input.eventSubtype &&
    evidence.kind === input.eventSubtype
      ? 50
      : 0) +
    (isHomepageUseCaseLabel(evidence) ? 140 : 0) +
    evidence.confidence * 100
  );
}

function normalizedEvidence(
  input: RankOfferRecommendationsInput
): ExtractedOfferEvidence[] {
  const extracted = input.evidence.map((item) => ({
    ...item,
    ref: item.ref.trim(),
    label: cleanLabel(item.label),
    confidence: clampConfidence(item.confidence)
  }));

  if (input.visitorOverride) {
    extracted.push({
      ref: input.visitorOverride.evidenceRef.trim(),
      label: cleanLabel(input.visitorOverride.label),
      kind: input.visitorOverride.kind ?? (
        input.motion === "event" ? input.eventSubtype ?? "event" : input.motion
      ),
      source: "visitor-input",
      ...(input.visitorOverride.sourceUrl
        ? { sourceUrl: input.visitorOverride.sourceUrl }
        : {}),
      confidence: clampConfidence(input.visitorOverride.confidence ?? 1)
    });
  }

  return extracted.filter(
    (item) =>
      item.ref.length > 0 &&
      item.label.length >= 3 &&
      item.confidence >= MIN_SUPPORTED_CONFIDENCE
  );
}

function rankEvidenceGroups(
  input: RankOfferRecommendationsInput
): RankedEvidenceGroup[] {
  const suppliedUrl = canonicalUrl(input.suppliedUrl);
  const groups = new Map<string, RankedEvidenceGroup>();

  for (const evidence of normalizedEvidence(input)) {
    const key = dedupeKey(evidence.label);
    if (!key) continue;
    const matchesSuppliedUrl =
      Boolean(suppliedUrl) && canonicalUrl(evidence.sourceUrl) === suppliedUrl;
    const score = evidenceScore(evidence, input, matchesSuppliedUrl);
    const reasons = reasonCodesFor(evidence, input, matchesSuppliedUrl);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        best: evidence,
        score,
        evidenceRefs: [evidence.ref],
        reasonCodes: reasons
      });
      continue;
    }

    existing.evidenceRefs = [...new Set([...existing.evidenceRefs, evidence.ref])];
    existing.reasonCodes = [
      ...new Set([
        ...existing.reasonCodes,
        ...reasons,
        "duplicate_evidence_merged" as const
      ])
    ];
    if (score > existing.score) {
      existing.best = evidence;
      existing.score = score;
    }
  }

  return [...groups.values()].sort((left, right) => {
    const priority = (group: RankedEvidenceGroup): number => {
      if (group.best.source === "visitor-input") return 2;
      return isEvidenceBackedOfferEvidence(group.best) ? 1 : 0;
    };
    return (
      priority(right) - priority(left) ||
      right.score - left.score ||
      right.best.confidence - left.best.confidence ||
      left.key.localeCompare(right.key)
    );
  });
}

function fallbackLabels(input: RankOfferRecommendationsInput): readonly string[] {
  if (input.motion === "event" && input.eventSubtype === "webinar") {
    return ["Webinar overview", "Webinar agenda", "Webinar audience questions"];
  }
  return fallbackTopics[input.motion];
}

function candidateId(label: string, rank: number): string {
  const slug = dedupeKey(label).replace(/\s+/g, "-").slice(0, 56) || "topic";
  return `offer-${rank}-${slug}`;
}

/**
 * Ranks exactly three distinct offer/topic choices from deterministic evidence.
 * Visitor evidence and a matching supplied URL outrank homepage discovery.
 * Missing support yields clearly generic topic directions, never a named offer.
 */
export function rankOfferRecommendations(
  input: RankOfferRecommendationsInput
): OfferRecommendationSet {
  const groups = rankEvidenceGroups(input).slice(0, 3);
  const candidateDrafts: OfferCandidateDraft[] = groups.map((group) => ({
    label: group.best.label,
    kind: group.best.kind,
    source:
      canonicalUrl(group.best.sourceUrl) === canonicalUrl(input.suppliedUrl) &&
      Boolean(canonicalUrl(input.suppliedUrl))
        ? ("supplied-url" as const)
        : group.best.source,
    recommendationKind: isEvidenceBackedOfferEvidence(group.best)
      ? "evidence-backed" as const
      : "fallback" as const,
    reasonCodes: isCompanySpecificOfferLabel(group.best.label)
      ? group.reasonCodes
      : [...new Set([
          ...group.reasonCodes,
          "generic_taxonomy_suppressed" as const
        ])],
    evidenceRefs: group.evidenceRefs,
    confidence: group.best.confidence
  }));

  const usedKeys = new Set(candidateDrafts.map((candidate) => dedupeKey(candidate.label)));
  for (const label of fallbackLabels(input)) {
    if (candidateDrafts.length === 3) break;
    if (usedKeys.has(dedupeKey(label))) continue;
    usedKeys.add(dedupeKey(label));
    candidateDrafts.push({
      label,
      kind: "topic",
      source: "fallback",
      recommendationKind: "fallback",
      reasonCodes: ["weak_evidence_fallback"],
      evidenceRefs: [],
      confidence: 0.1
    });
  }

  const candidates = candidateDrafts.map((candidate, index) => ({
    id: candidateId(candidate.label, index + 1),
    rank: (index + 1) as 1 | 2 | 3,
    ...candidate,
    recommended: index === 0
  })) as [
    OfferRecommendationCandidate,
    OfferRecommendationCandidate,
    OfferRecommendationCandidate
  ];
  const evidenceRefs = [...new Set(candidates.flatMap((candidate) => candidate.evidenceRefs))];
  const visibleCandidates = candidates.filter(
    ({ recommendationKind }) => recommendationKind === "evidence-backed"
  );
  const hasCredibleChoices = visibleCandidates.length >= 2;
  const reasonCodes = [...new Set([
    ...candidates.flatMap((candidate) => candidate.reasonCodes),
    ...(!hasCredibleChoices
      ? ["insufficient_specific_evidence" as const]
      : [])
  ])];

  return {
    revision: input.revision,
    motion: input.motion,
    ...(input.motion === "event" && input.eventSubtype
      ? { eventSubtype: input.eventSubtype }
      : {}),
    status: hasCredibleChoices ? "complete" : "fallback",
    recommendedId: candidates[0].id,
    candidates,
    reasonCodes,
    evidenceRefs,
    confidence: candidates[0].confidence,
    presentation: {
      mode: hasCredibleChoices ? "recommendations" : "freeform-with-url",
      candidateIds: hasCredibleChoices
        ? visibleCandidates.map(({ id }) => id)
        : [],
      showFreeform: true,
      showSourceUrl: true
    }
  };
}
