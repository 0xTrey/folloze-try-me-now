import type { EvidenceKindV2 } from "@/lib/generation/three-family-contract";

export type ResearchSourceAuthorityV2 =
  | "visitor"
  | "seller_official"
  | "target_official"
  | "third_party"
  | "provider_metadata";

export type ResearchQueryIntentV2 =
  | "company_positioning"
  | "official_products"
  | "official_solutions"
  | "official_industries"
  | "events_and_resources"
  | "buyer_roles_and_jobs"
  | "proof_and_demonstrations"
  | "target_priorities";

export interface ResearchQueryV2 {
  id: string;
  intent: ResearchQueryIntentV2;
  query: string;
  authority: ResearchSourceAuthorityV2;
}

export interface ResearchQueryPlanV2 {
  sessionId: string;
  revision: number;
  sellerDomain: string;
  sellerQueries: ResearchQueryV2[];
  offerQueries: ResearchQueryV2[];
  audienceQueries: ResearchQueryV2[];
  proofQueries: ResearchQueryV2[];
  targetQueries?: ResearchQueryV2[];
  sourceUrls: string[];
}

export interface EvidenceRecordV2 {
  id: string;
  revision: number;
  kind: EvidenceKindV2;
  statement: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceAuthority: ResearchSourceAuthorityV2;
  confidence: number;
  observedAt: string;
  supports: string[];
}

export interface BuildResearchQueryPlanV2Input {
  sessionId: string;
  revision: number;
  sellerDomain: string;
  companyName?: string;
  officialNavigationTerms?: readonly string[];
  sourceUrls?: readonly string[];
  targetDomain?: string;
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] ?? "";
}

function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function stableSlug(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function query(
  intent: ResearchQueryIntentV2,
  text: string,
  authority: ResearchSourceAuthorityV2
): ResearchQueryV2 {
  return {
    id: `query:${intent}:${stableSlug(text)}`,
    intent,
    query: text.replace(/\s+/g, " ").trim(),
    authority
  };
}

function uniqueQueries(values: readonly ResearchQueryV2[]): ResearchQueryV2[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.intent}:${item.query.toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildResearchQueryPlanV2(
  input: BuildResearchQueryPlanV2Input
): ResearchQueryPlanV2 {
  const sellerDomain = normalizeDomain(input.sellerDomain);
  if (!sellerDomain || !sellerDomain.includes(".")) {
    throw new Error("A recognizable seller domain is required for ResearchQueryPlanV2");
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new Error("ResearchQueryPlanV2 revision must be a non-negative integer");
  }
  const company = input.companyName?.trim() || sellerDomain;
  const site = `site:${sellerDomain}`;
  const navigationTerms = [...new Set(
    (input.officialNavigationTerms ?? [])
      .map((term) => term.replace(/\s+/g, " ").trim())
      .filter((term) => term.length >= 2)
  )].sort((left, right) => left.localeCompare(right));
  const productTerms = navigationTerms.filter((term) =>
    /\b(?:products?|platforms?|solutions?|services?|industr(?:y|ies)|events?|webinars?|resources?)\b/i.test(term)
  );
  const sourceUrls = [...new Set(
    (input.sourceUrls ?? []).flatMap((value) => {
      const normalized = safeSourceUrl(value);
      return normalized ? [normalized] : [];
    })
  )].sort();

  const sellerQueries = uniqueQueries([
    query("company_positioning", `${site} ${company} company category positioning`, "seller_official"),
    query("official_products", `${site} ${company} products platform`, "seller_official"),
    query("official_solutions", `${site} ${company} solutions use cases`, "seller_official"),
    query("official_industries", `${site} ${company} industries`, "seller_official"),
    query("events_and_resources", `${site} ${company} events webinars resources`, "seller_official")
  ]);
  const offerQueries = uniqueQueries([
    ...productTerms.map((term) =>
      query("official_products", `${site} "${term}"`, "seller_official")
    ),
    query("official_products", `${site} ${company} product solution offer`, "seller_official")
  ]);
  const audienceQueries = [
    query(
      "buyer_roles_and_jobs",
      `${site} ${company} who it is for roles teams jobs evaluation`,
      "seller_official"
    )
  ];
  const proofQueries = [
    query(
      "proof_and_demonstrations",
      `${site} ${company} customer stories results demo case study`,
      "seller_official"
    )
  ];
  const targetDomain = input.targetDomain ? normalizeDomain(input.targetDomain) : "";
  const targetQueries = targetDomain && targetDomain.includes(".")
    ? [
        query(
          "target_priorities",
          `site:${targetDomain} priorities initiatives products annual report`,
          "target_official"
        )
      ]
    : undefined;

  return {
    sessionId: input.sessionId,
    revision: input.revision,
    sellerDomain,
    sellerQueries,
    offerQueries,
    audienceQueries,
    proofQueries,
    ...(targetQueries ? { targetQueries } : {}),
    sourceUrls
  };
}

export type ResearchLaneIdV2 =
  | "seller_identity"
  | "offer"
  | "audience"
  | "proof"
  | "target"
  | "source";

/**
 * One executable unit of the bounded plan. Lanes are independent so a caller
 * can run them in parallel and let a single slow lane degrade on its own.
 */
export interface ResearchLaneV2 {
  id: ResearchLaneIdV2;
  authority: ResearchSourceAuthorityV2;
  queries: ResearchQueryV2[];
  sourceUrls: string[];
}

export const researchLaneOrderV2: readonly ResearchLaneIdV2[] = [
  "seller_identity",
  "offer",
  "audience",
  "proof",
  "target",
  "source"
];

/**
 * Derives executable lanes from an existing plan. A lane with no queries and
 * no source URLs is omitted rather than scheduled as empty work.
 */
export function planResearchLanesV2(plan: ResearchQueryPlanV2): ResearchLaneV2[] {
  const definitions: Array<{
    id: ResearchLaneIdV2;
    authority: ResearchSourceAuthorityV2;
    queries: readonly ResearchQueryV2[];
    sourceUrls: readonly string[];
  }> = [
    {
      id: "seller_identity",
      authority: "seller_official",
      queries: plan.sellerQueries,
      sourceUrls: []
    },
    { id: "offer", authority: "seller_official", queries: plan.offerQueries, sourceUrls: [] },
    {
      id: "audience",
      authority: "seller_official",
      queries: plan.audienceQueries,
      sourceUrls: []
    },
    { id: "proof", authority: "seller_official", queries: plan.proofQueries, sourceUrls: [] },
    {
      id: "target",
      authority: "target_official",
      queries: plan.targetQueries ?? [],
      sourceUrls: []
    },
    { id: "source", authority: "seller_official", queries: [], sourceUrls: plan.sourceUrls }
  ];

  return definitions
    .filter(
      (definition) =>
        definition.queries.length > 0 || definition.sourceUrls.length > 0
    )
    .map((definition) => ({
      id: definition.id,
      authority: definition.authority,
      queries: [...definition.queries],
      sourceUrls: [...definition.sourceUrls]
    }));
}

const authorityRank: Record<ResearchSourceAuthorityV2, number> = {
  visitor: 5,
  seller_official: 4,
  target_official: 3,
  third_party: 2,
  provider_metadata: 1
};

/** Rank for an authority string that may not be a known V2 authority. */
export function researchSourceAuthorityRankV2(authority: string): number {
  return authorityRank[authority as ResearchSourceAuthorityV2] ?? 0;
}

function boundedConfidence(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function reconcileEvidenceRecordsV2(
  records: readonly EvidenceRecordV2[],
  activeRevision: number
): EvidenceRecordV2[] {
  const current = records
    .filter((record) => record.revision === activeRevision)
    .map((record) => ({
      ...record,
      statement: record.statement.replace(/\s+/g, " ").trim(),
      confidence: boundedConfidence(record.confidence),
      supports: [...new Set(record.supports)].sort()
    }))
    .filter((record) => record.statement.length >= 3);
  const bySupport = new Map<string, EvidenceRecordV2>();
  for (const record of current) {
    const keys = record.supports.length ? record.supports : [record.id];
    for (const key of keys) {
      const existing = bySupport.get(key);
      if (
        !existing ||
        authorityRank[record.sourceAuthority] > authorityRank[existing.sourceAuthority] ||
        (authorityRank[record.sourceAuthority] === authorityRank[existing.sourceAuthority] &&
          record.confidence > existing.confidence) ||
        (authorityRank[record.sourceAuthority] === authorityRank[existing.sourceAuthority] &&
          record.confidence === existing.confidence &&
          record.id.localeCompare(existing.id) < 0)
      ) {
        bySupport.set(key, record);
      }
    }
  }
  return [...new Map(
    [...bySupport.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((record) => [record.id, record])
  ).values()];
}
