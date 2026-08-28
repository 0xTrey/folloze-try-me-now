import type { SourceArtifact } from "@/lib/content-intelligence";
import type { BrandProfile, IntelligenceConfidence, SessionEvidenceItem } from "@/lib/types";

import {
  discoverOfferEvidenceFromPages,
  type OfferDiscoveryPageGraph
} from "./offer-discovery";

import type {
  ExtractedOfferEvidence,
  OfferCampaignMotion,
  OfferEvidenceKind
} from "./offer-recommendations";

export type { OfferDiscoveryPageGraph } from "./offer-discovery";

export interface ExtractOfferEvidenceInput {
  brand?: BrandProfile;
  motion: OfferCampaignMotion;
  evidenceItems?: readonly SessionEvidenceItem[];
  sourceArtifact?: SourceArtifact;
  discoveryPages?: OfferDiscoveryPageGraph;
  maxLabels?: number;
}

const navigationOnlyLabel =
  /^(?:(?:explore|view|see|browse|learn more|read more|skip to)\s+)?(?:(?:all|our|featured|latest|the latest from)\s+)?(?:products?(?:\s+(?:and|&)\s+services?)?|services?|solutions?|resources?|support|partners?|customers?|customer stories|company|about(?:\s+us)?|contact(?:\s+us)?|news|events?|careers?|industries|use cases?|why\s+[\p{L}\p{N}.&'-]+|take your next steps?|quick links?|resources and legal)$/iu;

const genericEvidenceLabels = new Set([
  "public focus area",
  "public positioning",
  "public operating context"
]);

const offerHeadingPattern =
  /\b(?:services?|solutions?|products?|platforms?|advisory|accounting|payroll|tax|audit|assurance|consulting|compliance|wealth management|managed services|digital transformation|erp|webinar|summit|conference)\b/i;

const companyDescriptorPattern = /\b(?:firm|company|provider)\b/i;

const editorialLabelPattern =
  /\b(?:insights?|research|trends?|blog|articles?|stories|news|updates?|resources?|podcasts?|videos?|reports?|guides?|case studies|events?)\b/i;

const editorialOfferOverridePattern =
  /\b(?:services?|solutions?|products?|platform|suite|cloud|software|application)\b/i;

function cleanLabel(value: string, max = 120): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[\s,;:|/-]+$/g, "");
}

function dedupeKey(value: string): string {
  return cleanLabel(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function confidenceNumber(value: IntelligenceConfidence | undefined): number {
  if (value === "high") return 0.9;
  if (value === "medium") return 0.72;
  return 0.58;
}

function profileConfidence(profile: BrandProfile): number {
  if (profile.source === "brand-harvester") return 0.72;
  if (profile.source === "fast-extractor") return 0.68;
  return 0.3;
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

function stableId(prefix: string, ...values: Array<string | undefined>): string {
  const input = values.filter(Boolean).join("|").toLocaleLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function isNavigationOnlyOfferLabel(label: string): boolean {
  const clean = cleanLabel(label);
  if (!clean) return true;
  if (navigationOnlyLabel.test(clean)) return true;
  if (/^the latest from\b/i.test(clean)) return true;
  return false;
}

function inferKind(label: string, motion: OfferCampaignMotion): OfferEvidenceKind {
  const value = label.toLocaleLowerCase();
  if (/\bwebinar\b/.test(value)) return "webinar";
  if (/\b(?:event|summit|conference|symposium)\b/.test(value)) return "event";
  if (/\b(?:industry|industries|healthcare|manufacturing|retail|financial services)\b/.test(value)) {
    return "industry";
  }
  if (
    /\b(?:product|platform|device|headset|camera|microphone|spectrometer|software suite|application)\b/.test(
      value
    )
  ) {
    return "product";
  }
  if (motion === "event") return "event";
  if (motion === "product") return "product";
  if (motion === "industry") return "industry";
  return "solution";
}

function boundedArtifactConfidence(artifact: SourceArtifact): number {
  if (artifact.confidence === "high") return 0.85;
  if (artifact.confidence === "medium") return 0.72;
  return 0.58;
}

const sentencePattern =
  /\b(?:helps?|supports?|serves?|includes?|managing|evaluating|improving|navigating|for|with|across)\b/i;

function looksLikeSentence(value: string): boolean {
  return sentencePattern.test(value) || value.split(/\s+/).length > 8;
}

export function isBoundedOfferLabel(value: string): boolean {
  const clean = cleanLabel(value);
  if (!clean || clean.length < 6 || isNavigationOnlyOfferLabel(clean)) return false;
  if (companyDescriptorPattern.test(clean)) return false;
  if (/^[\s\d.,+$€£¥%]+$/.test(clean)) return false;
  if (/^(?:how|what|when|where|why|who)\b/i.test(clean) || /\?$/.test(clean)) return false;
  if (editorialLabelPattern.test(clean) && !editorialOfferOverridePattern.test(clean)) return false;
  if (genericEvidenceLabels.has(clean.toLocaleLowerCase())) return false;
  if (looksLikeSentence(clean) || clean.length > 72) return false;
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return /\d/.test(clean) || /\b(?:Pro|Now|Suite|Cloud|Platform)\b/.test(clean);
  }
  return offerHeadingPattern.test(clean) || tokens.length >= 2;
}

export function offerLikePhrase(value: string): string | undefined {
  const clean = cleanLabel(value);
  if (!clean) return undefined;

  const serviceMatch = clean.match(
    /\b([A-Z][\p{L}\p{N}&'/-]*(?:\s+(?:and|&)\s+[A-Z][\p{L}\p{N}&'/-]+|\s+[\p{L}\p{N}&'/-]+){0,12}\s+Services?)\b/u
  );
  if (serviceMatch?.[1]) {
    const phrase = cleanLabel(serviceMatch[1]);
    if (phrase.length >= 8 && !isNavigationOnlyOfferLabel(phrase)) {
      return phrase;
    }
  }

  const solutionMatch = clean.match(
    /\b([A-Z][\p{L}\p{N}&'/-]*(?:\s+[\p{L}\p{N}&'/-]+){0,8}\s+Solutions?)\b/u
  );
  if (solutionMatch?.[1]) {
    const phrase = cleanLabel(solutionMatch[1]);
    if (phrase.length >= 8 && !isNavigationOnlyOfferLabel(phrase)) {
      return phrase;
    }
  }

  const productMatch = clean.match(
    /\b([A-Z][\p{L}\p{N}&'/-]*\d[\p{L}\p{N}&'/-]*(?:\s+\d+)?(?:\s+[A-Z][\p{L}\p{N}&'/-]+){0,3})\b/u
  );
  if (productMatch?.[1]) {
    const phrase = cleanLabel(productMatch[1]);
    if (phrase.length >= 4 && !isNavigationOnlyOfferLabel(phrase)) {
      return phrase;
    }
  }

  const namedProductMatch = clean.match(
    /\b((?:RUN|Workforce)\s+[A-Z][\p{L}\p{N}&'/-]*(?:\s+[A-Z][\p{L}\p{N}&'/-]+){0,4})\b/u
  );
  if (namedProductMatch?.[1]) {
    const phrase = cleanLabel(namedProductMatch[1]);
    if (phrase.length >= 8 && !isNavigationOnlyOfferLabel(phrase)) {
      return phrase;
    }
  }

  if (isBoundedOfferLabel(clean)) {
    return clean;
  }

  return undefined;
}

function labelsFromEvidenceItem(item: SessionEvidenceItem): string[] {
  const labels: string[] = [];
  const textPhrase = offerLikePhrase(item.text);
  if (textPhrase) labels.push(textPhrase);

  if (!genericEvidenceLabels.has(item.label.toLocaleLowerCase())) {
    const labelPhrase = offerLikePhrase(item.label);
    if (labelPhrase) labels.push(labelPhrase);
  }

  for (const signal of item.signals) {
    if (!isBoundedOfferLabel(signal)) continue;
    labels.push(cleanLabel(signal));
  }

  return labels;
}

/**
 * Projects bounded offer labels from brand profile, reconciled evidence items,
 * optional same-origin page discovery, and source artifact headings.
 */
export function extractOfferEvidence(
  input: ExtractOfferEvidenceInput
): ExtractedOfferEvidence[] {
  const {
    brand,
    motion,
    evidenceItems = [],
    sourceArtifact,
    discoveryPages,
    maxLabels = 24
  } = input;
  const results: ExtractedOfferEvidence[] = [];
  const seen = new Set<string>();

  const push = (candidate: ExtractedOfferEvidence) => {
    const label = cleanLabel(candidate.label);
    if (label.length < 3 || isNavigationOnlyOfferLabel(label)) return;
    const key = dedupeKey(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    results.push({ ...candidate, label });
  };

  if (brand && brand.source !== "fallback") {
    const sourceUrl = brand.sourceUrl;
    const baseConfidence = profileConfidence(brand);

    if (brand.title) {
      const titleLabel = offerLikePhrase(brand.title);
      if (titleLabel) {
        push({
          ref: stableId("offer-evidence", brand.domain, "title"),
          label: titleLabel,
          kind: inferKind(titleLabel, motion),
          source: "homepage",
          sourceUrl,
          confidence: baseConfidence
        });
      }
    }

    for (const [index, topic] of brand.publicTopics.slice(0, 8).entries()) {
      const label = isBoundedOfferLabel(topic) ? cleanLabel(topic) : offerLikePhrase(topic);
      if (!label) continue;
      push({
        ref: stableId("offer-evidence", brand.domain, "topic", String(index), label),
        label,
        kind: inferKind(label, motion),
        source: "homepage",
        sourceUrl,
        confidence: Math.max(0.42, baseConfidence - index * 0.05)
      });
    }
  }

  for (const item of evidenceItems) {
    if (item.disposition === "excluded" || item.entityRole === "target") continue;
    if (brand && !sourceBelongsTo(brand, item.sourceUrl)) continue;
    const confidence = confidenceNumber(item.confidence);
    for (const label of labelsFromEvidenceItem(item)) {
      push({
        ref: stableId("offer-evidence", item.id, label),
        label,
        kind: inferKind(label, motion),
        source: "official-page",
        sourceUrl: item.sourceUrl,
        confidence
      });
    }
  }

  if (discoveryPages) {
    for (const discovered of discoverOfferEvidenceFromPages({
      motion,
      graph: discoveryPages,
      maxLabels
    })) {
      push(discovered);
    }
  }

  if (
    sourceArtifact &&
    sourceArtifact.status !== "failed" &&
    sourceArtifact.status !== "unreadable"
  ) {
    const sourceUrl =
      sourceArtifact.source.finalUrl ?? sourceArtifact.source.sourceUrl;
    const confidence = boundedArtifactConfidence(sourceArtifact);

    const titleLabel = sourceArtifact.content.title
      ? offerLikePhrase(sourceArtifact.content.title)
      : undefined;
    if (titleLabel) {
      push({
        ref: stableId("offer-evidence", "artifact", "title"),
        label: titleLabel,
        kind: inferKind(titleLabel, motion),
        source: "official-page",
        sourceUrl,
        confidence
      });
    }

    for (const section of sourceArtifact.content.sections.slice(0, 16)) {
      const label = offerLikePhrase(section.title);
      if (!label) continue;
      push({
        ref: stableId("offer-evidence", "artifact-section", section.id, label),
        label,
        kind: inferKind(label, motion),
        source: "official-page",
        sourceUrl,
        confidence: Math.max(0.58, confidence - 0.04)
      });
    }

    for (const link of sourceArtifact.content.links.slice(0, 20)) {
      if (brand && !sourceBelongsTo(brand, link.url)) continue;
      const label = offerLikePhrase(link.label);
      if (!label) continue;
      push({
        ref: stableId("offer-evidence", "artifact-link", link.id, label),
        label,
        kind: inferKind(label, motion),
        source: "official-page",
        sourceUrl: link.url,
        confidence: Math.max(0.58, confidence - 0.08)
      });
    }
  }

  return results.slice(0, maxLabels);
}
