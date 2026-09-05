export const BUYER_JOURNEY_EVALUATION_VERSION = "buyer-journey-evaluation-v1";
export type JourneyVariant = { id: string; label?: string };
export type Exposure = { exposureId: string; variantId: string; eligible?: boolean; converted?: boolean };
export type ReviewItem = { headline?: string; body?: string; sections?: string; sourceSnippets?: string };

function hash(value: string): number { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function assignStickyVariant(experimentId: string, anonymousId: string, version: string, variants: readonly JourneyVariant[]) {
  if (!experimentId || !anonymousId || !version || variants.length < 2) throw new Error("At least two variants and non-empty assignment keys are required.");
  const ids = variants.map((v) => v.id).filter(Boolean);
  if (new Set(ids).size !== ids.length || ids.length !== variants.length) throw new Error("Variant IDs must be unique and non-empty.");
  const canonicalIds = [...ids].sort();
  const key = JSON.stringify([experimentId, anonymousId, version, canonicalIds]);
  return { experimentId, version, variantId: canonicalIds[hash(key) % canonicalIds.length]! };
}

function wilson(successes: number, total: number) {
  if (total === 0) return { rate: 0, low: 0, high: 0 };
  const z = 1.96, p = successes / total, d = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / d, spread = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return { rate: successes / total, low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) };
}
export function summarizeExperimentOutcomes(exposures: readonly Exposure[], minEligibleExposures = 30, expectedVariantIds?: readonly string[]) {
  if (!Number.isInteger(minEligibleExposures) || minEligibleExposures < 1) throw new Error("minEligibleExposures must be positive.");
  const unique = new Map<string, Exposure>(); for (const e of exposures) { if (!e.exposureId) continue; const prior = unique.get(e.exposureId); if (prior && JSON.stringify(prior) !== JSON.stringify(e)) throw new Error("Conflicting duplicate exposure ID."); if (!prior) unique.set(e.exposureId, e); }
  const by = new Map<string, Exposure[]>(); for (const e of unique.values()) if (e.eligible === true) (by.get(e.variantId) ?? by.set(e.variantId, []).get(e.variantId)!).push(e);
  const variants = [...by].map(([variantId, rows]) => { const converted = rows.filter((e) => e.converted === true).length; return { variantId, eligibleExposures: rows.length, qualifiedConversions: converted, uncertainty: wilson(converted, rows.length) }; });
  const expected = [...new Set([...(expectedVariantIds ?? []), ...by.keys()])];
  const candidates = variants.filter((v) => v.eligibleExposures >= minEligibleExposures);
  const top = [...candidates].sort((a, b) => b.uncertainty.rate - a.uncertainty.rate || a.variantId.localeCompare(b.variantId))[0];
  const allArmsReady = expected.length >= 2 && expected.every((id) => candidates.some((v) => v.variantId === id));
  const clearlyTop = Boolean(top && allArmsReady && candidates.filter((v) => v.variantId !== top.variantId).every((v) => top.uncertainty.low > v.uncertainty.high));
  return { version: BUYER_JOURNEY_EVALUATION_VERSION, variants, winner: clearlyTop ? top!.variantId : undefined, winnerDeclared: clearlyTop, note: "Descriptive eligible-exposure analysis only; no causal or conversion-probability claim." };
}

export function createBlindedReviewExport(input: { items: readonly ReviewItem[]; reviewerMappings?: Record<string, string> }) {
  const text = (value: unknown) => typeof value === "string" ? value : undefined;
  const blinded = input.items.map((item, index) => ({ reviewId: `review-${index + 1}`, headline: text(item.headline), body: text(item.body), sections: text(item.sections), sourceSnippets: text(item.sourceSnippets) }));
  return { publicExport: { version: BUYER_JOURNEY_EVALUATION_VERSION, questions: ["comprehension", "relevance", "proof", "cta"], items: blinded }, privateReviewerMappings: input.reviewerMappings };
}
