import type {
  ExtractedOfferEvidence,
  OfferCampaignMotion,
  OfferEvidenceKind,
  OfferEvidenceSource
} from "./offer-recommendations";

export interface OfferDiscoveryPage {
  url: string;
  html: string;
}

export interface OfferDiscoveryPageGraph {
  origin: string;
  pages: readonly OfferDiscoveryPage[];
}

export interface OfferDiscoveryBudget {
  maxPages: number;
  maxLinks: number;
  maxLabels: number;
  /** Total wall-clock budget for the complete harvest, independent of page timeout. */
  maxDurationMs: number;
}

export const DEFAULT_OFFER_DISCOVERY_BUDGET: OfferDiscoveryBudget = {
  maxPages: 6,
  maxLinks: 48,
  maxLabels: 24,
  maxDurationMs: 6_000
};

export interface DiscoverOfferEvidenceFromPagesInput {
  motion: OfferCampaignMotion;
  graph: OfferDiscoveryPageGraph;
  maxPages?: number;
  maxLinks?: number;
  maxLabels?: number;
}

const htmlEntityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

const offerHeadingPattern =
  /\b(?:services?|solutions?|products?|platforms?|advisory|accounting|payroll|tax|audit|assurance|consulting|compliance|wealth management|managed services|digital transformation|erp|webinar|summit|conference)\b/i;

const companyDescriptorPattern = /\b(?:firm|company|provider)\b/i;

const offerPathPattern =
  /\/(?:services?|solutions?|products?|advisory|accounting|payroll|erp|tax|audit|assurance|consulting|compliance|wealth-management|managed-services|digital-transformation|industr(?:y|ies)|offerings?)(?:\/|$)/i;

const nonOfferPathPattern =
  /\/(?:about|contact|locations?|careers?|jobs?|pay-invoices?|login|privacy|legal|alliance|ecosystem|insights?(?:-events)?|news|blog|articles?|resources?|customer-stories|case-stud(?:y|ies)|events?)(?:\/|$)/i;

const offerIndexPathPattern =
  /\/(?:all-)?(?:services?|solutions?|products?|offerings?)(?:\/|$)/i;

const explicitOfferLabelPattern =
  /\b(?:services?|solutions?|products?|platform|suite|cloud|software|application|advisory|accounting|payroll|tax|audit|assurance|consulting|compliance|wealth management|managed services|digital transformation|automation|headsets?|cameras?|devices?|erp)\b/i;

const editorialLabelPattern =
  /\b(?:insights?|research|trends?|blog|articles?|stories|news|updates?|resources?|podcasts?|videos?|reports?|guides?|case studies|events?)\b/i;

const editorialOfferOverridePattern =
  /\b(?:services?|solutions?|products?|platform|suite|cloud|software|application)\b/i;

const technicalLabelPattern =
  /\b(?:hosted runtime|runtime|audit log|compliance standards?|implementation details?|architecture|api reference|developer docs?|release notes?|security controls?)\b/i;

const navigationOnlyLabel =
  /^(?:(?:explore|view|see|browse|learn more|read more|skip to)\s+)?(?:(?:all|our|featured|latest|the latest from)\s+)?(?:products?(?:\s+(?:and|&)\s+services?)?|services?|solutions?|resources?|support|partners?|customers?|customer stories|company|about(?:\s+us)?|contact(?:\s+us)?|news|events?|careers?|industries|use cases?|why\s+[\p{L}\p{N}.&'-]+|take your next steps?|quick links?|resources and legal)$/iu;

const genericEvidenceLabels = new Set([
  "public focus area",
  "public positioning",
  "public operating context"
]);

const sentencePattern =
  /\b(?:helps?|supports?|serves?|includes?|managing|evaluating|improving|navigating|for|with|across|put|puts|unlock|unlocks|transform|transforms)\b/i;

function hasExplicitOfferMarker(value: string): boolean {
  const clean = cleanLabel(value);
  return (
    explicitOfferLabelPattern.test(clean) ||
    /\b[A-Za-z][A-Za-z-]*\d+[A-Za-z\d-]*\b/.test(clean) ||
    /\b\d+[A-Za-z][A-Za-z\d-]*\b/.test(clean)
  );
}

function isStatOnlyLabel(value: string): boolean {
  return /^[\s\d.,+$€£¥%]+$/.test(cleanLabel(value));
}

function isEditorialLabel(value: string): boolean {
  const clean = cleanLabel(value);
  if (!clean) return false;
  if (/^(?:how|what|when|where|why|who)\b/i.test(clean) || /\?$/.test(clean)) return true;
  return editorialLabelPattern.test(clean) && !editorialOfferOverridePattern.test(clean);
}

function isNavigationOnlyOfferLabel(label: string): boolean {
  const clean = cleanLabel(label);
  if (!clean) return true;
  if (navigationOnlyLabel.test(clean)) return true;
  if (/^the latest from\b/i.test(clean)) return true;
  return false;
}

function looksLikeSentence(value: string): boolean {
  return sentencePattern.test(value) || value.split(/\s+/).length > 8;
}

function isBoundedOfferLabel(value: string): boolean {
  const clean = cleanLabel(value);
  if (!clean || clean.length < 6 || isNavigationOnlyOfferLabel(clean)) return false;
  if (isStatOnlyLabel(clean) || isEditorialLabel(clean)) return false;
  if (companyDescriptorPattern.test(clean)) return false;
  if (genericEvidenceLabels.has(clean.toLocaleLowerCase())) return false;
  if (looksLikeSentence(clean) || clean.length > 72) return false;
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return /\d/.test(clean) || /\b(?:Pro|Now|Suite|Cloud|Platform)\b/.test(clean);
  }
  return offerHeadingPattern.test(clean) || tokens.length >= 2;
}

function offerLikePhrase(value: string): string | undefined {
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

function decodeHtml(value: string): string {
  let result = value;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const decoded = result.replace(
      /&(?:#(x[0-9a-f]+|\d+)|([a-z]+));/gi,
      (entity, numeric: string | undefined, named: string | undefined) => {
        if (named) return htmlEntityMap[named.toLocaleLowerCase()] ?? entity;
        if (!numeric) return entity;
        const radix = numeric.toLocaleLowerCase().startsWith("x") ? 16 : 10;
        const codePoint = Number.parseInt(radix === 16 ? numeric.slice(1) : numeric, radix);
        return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
    );
    if (decoded === result) break;
    result = decoded;
  }
  return result;
}

function attr(tag: string, name: string): string | undefined {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  if (quoted?.[2]) return decodeHtml(quoted[2]).trim();
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"))?.[1]?.trim();
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

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

function normalizedHost(hostname: string): string {
  return hostname.toLocaleLowerCase().replace(/^www\./, "").replace(/\.$/, "");
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

function absolutePublicUrl(value: string | undefined, base: URL): string | undefined {
  if (!value || /^(?:data|javascript|mailto|tel):/i.test(value)) return undefined;
  try {
    const url = new URL(decodeHtml(value), base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function isSameOrigin(pageUrl: string, originUrl: string): boolean {
  try {
    const page = new URL(pageUrl);
    const origin = new URL(originUrl);
    const effectivePort = (url: URL) =>
      url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "");
    return (
      normalizedHost(page.hostname) === normalizedHost(origin.hostname) &&
      page.protocol === origin.protocol &&
      effectivePort(page) === effectivePort(origin)
    );
  } catch {
    return false;
  }
}

function isBrandRelatedSeed(pageUrl: string, brandOriginUrl: string): boolean {
  try {
    const pageHost = normalizedHost(new URL(pageUrl).hostname);
    const brandHost = normalizedHost(new URL(brandOriginUrl).hostname);
    return pageHost === brandHost || pageHost.endsWith(`.${brandHost}`);
  } catch {
    return false;
  }
}

function isOfferPath(pathname: string): boolean {
  if (offerPathPattern.test(pathname)) return true;
  return /\/[a-z0-9-]+-(?:services?|solutions?|products?|advisory|accounting|payroll|tax|audit|assurance|consulting|compliance|wealth-management|managed-services|digital-transformation)(?:\/|$)/i.test(
    pathname
  );
}

function isNonOfferPath(pathname: string): boolean {
  return nonOfferPathPattern.test(pathname);
}

function isOfferIndexPath(pathname: string): boolean {
  return offerIndexPathPattern.test(pathname);
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

function looksLikeMarketingTagline(label: string): boolean {
  const clean = cleanLabel(label);
  if (!clean || offerHeadingPattern.test(clean)) return false;
  // Homepage use-case headings are valuable offer evidence even when they do
  // not contain a product taxonomy noun (for example, "Capture knowledge").
  if (/^(?:capture|find|automate|manage|connect|secure|analyze|analyse|improve|streamline|reduce|scale|share|organize|organise|build|create|discover|protect|simplify)\b/i.test(clean)) {
    return false;
  }
  if (/\b(?:services?|solutions?|advisory|accounting|payroll|erp)\b/i.test(clean)) return false;
  const tokens = clean.split(/\s+/).filter(Boolean);
  return tokens.length <= 6 && /^[A-Z]/.test(clean);
}

function acceptDiscoveredLabel(label: string, sourceUrl?: string): string | undefined {
  const phrase = offerLikePhrase(label) ?? (isBoundedOfferLabel(label) ? cleanLabel(label) : undefined);
  if (!phrase) return undefined;
  if (technicalLabelPattern.test(phrase)) return undefined;
  if (isNavigationOnlyOfferLabel(phrase)) return undefined;
  if (isStatOnlyLabel(phrase) || isEditorialLabel(phrase)) return undefined;
  if (sourceUrl) {
    try {
      if (isNonOfferPath(new URL(sourceUrl).pathname) && !hasExplicitOfferMarker(phrase)) {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }
  if (looksLikeMarketingTagline(phrase)) return undefined;
  return phrase;
}

function extractNavRegions(html: string): string[] {
  return [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].map((match) => match[1] ?? "");
}

function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  for (const match of html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const level = Number.parseInt((match[1] ?? "h1").slice(1), 10);
    const text = stripTags(match[2] ?? "");
    if (text.length >= 3) headings.push({ level, text });
  }
  return headings;
}

function extractSemanticLabels(html: string): string[] {
  const labels: string[] = [];
  // Put the semantic class constraint inside the expression. Matching every
  // container first can consume an outer element and skip the nested label
  // that carries the actual product or use-case taxonomy.
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b[^>]*\bclass\s*=\s*(["'])[^"']*(?:eyebrow|kicker|category|use[-_]?case)[^"']*\2[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(match[3] ?? "");
    if (text.length >= 3 && text.length <= 72) labels.push(text);
  }
  return labels;
}

function extractAnchors(
  html: string,
  base: URL
): Array<{ label: string; url: string; inNav: boolean }> {
  const navRegions = extractNavRegions(html);
  const anchors: Array<{ label: string; url: string; inNav: boolean }> = [];
  const seen = new Set<string>();

  const pushAnchor = (tag: string, body: string, inNav: boolean) => {
    const url = absolutePublicUrl(attr(`<a${tag}>`, "href"), base);
    const label = stripTags(body).replace(/\s+/g, " ").slice(0, 180);
    if (!url || label.length < 2) return;
    const key = `${dedupeKey(label)}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push({ label, url, inNav });
  };

  for (const region of navRegions) {
    for (const match of region.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      pushAnchor(match[1] ?? "", match[2] ?? "", true);
    }
  }

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    pushAnchor(match[1] ?? "", match[2] ?? "", false);
  }

  return anchors;
}

function sourceForPage(pageUrl: string, originUrl: string): OfferEvidenceSource {
  try {
    const page = new URL(pageUrl);
    const origin = new URL(originUrl);
    const pagePath = page.pathname.replace(/\/+$/, "") || "/";
    const originPath = origin.pathname.replace(/\/+$/, "") || "/";
    if (pagePath === originPath || pagePath === "/") return "homepage";
    return "official-page";
  } catch {
    return "official-page";
  }
}

function confidenceForCandidate(input: {
  level?: number;
  inNav: boolean;
  onOfferPath: boolean;
  source: OfferEvidenceSource;
}): number {
  if (input.level === 1 && input.onOfferPath) return 0.88;
  if (input.level === 2 || input.level === 3) return input.onOfferPath ? 0.78 : 0.66;
  if (input.inNav && input.onOfferPath) return input.source === "homepage" ? 0.74 : 0.8;
  if (input.onOfferPath) return 0.72;
  if (input.inNav) return 0.62;
  return 0.58;
}

/**
 * Bounded, same-origin offer discovery from sanitized HTML pages. Inspects navigation,
 * headings, and offer-path links without fetching or leaving the supplied graph.
 */
export function discoverOfferEvidenceFromPages(
  input: DiscoverOfferEvidenceFromPagesInput
): ExtractedOfferEvidence[] {
  const budget: OfferDiscoveryBudget = {
    maxPages: input.maxPages ?? DEFAULT_OFFER_DISCOVERY_BUDGET.maxPages,
    maxLinks: input.maxLinks ?? DEFAULT_OFFER_DISCOVERY_BUDGET.maxLinks,
    maxLabels: input.maxLabels ?? DEFAULT_OFFER_DISCOVERY_BUDGET.maxLabels,
    maxDurationMs: DEFAULT_OFFER_DISCOVERY_BUDGET.maxDurationMs
  };

  try {
    new URL(input.graph.origin);
  } catch {
    return [];
  }

  const pages = input.graph.pages
    .filter((page) => isSameOrigin(page.url, input.graph.origin))
    .slice(0, budget.maxPages);

  const results: ExtractedOfferEvidence[] = [];
  const seen = new Set<string>();
  let linksScanned = 0;

  const push = (candidate: ExtractedOfferEvidence) => {
    const label = cleanLabel(candidate.label);
    const accepted = acceptDiscoveredLabel(label, candidate.sourceUrl);
    if (!accepted) return;
    const key = dedupeKey(accepted);
    if (!key || seen.has(key)) return;
    seen.add(key);
    results.push({ ...candidate, label: accepted });
  };

  for (const page of pages) {
    let pageUrl: URL;
    try {
      pageUrl = new URL(page.url);
    } catch {
      continue;
    }

    const source = sourceForPage(page.url, input.graph.origin);
    const onOfferPath = isOfferPath(pageUrl.pathname);
    const base = new URL(page.url);

    for (const heading of extractHeadings(page.html)) {
      push({
        ref: stableId("offer-discovery", page.url, `h${heading.level}`, heading.text),
        label: heading.text,
        kind: inferKind(heading.text, input.motion),
        source,
        sourceUrl: page.url,
        confidence: confidenceForCandidate({
          level: heading.level,
          inNav: false,
          onOfferPath,
          source
        })
      });
    }

    if (source === "homepage") {
      for (const label of extractSemanticLabels(page.html)) {
        push({
          ref: stableId("offer-discovery", page.url, "semantic-label", label),
          label,
          kind: inferKind(label, input.motion),
          source,
          sourceUrl: page.url,
          confidence: 0.92
        });
      }
    }

    for (const anchor of extractAnchors(page.html, base)) {
      if (linksScanned >= budget.maxLinks) break;
      linksScanned += 1;

      let anchorUrl: URL;
      try {
        anchorUrl = new URL(anchor.url);
      } catch {
        continue;
      }
      if (!isSameOrigin(anchor.url, input.graph.origin)) continue;

      const anchorOnOfferPath = isOfferPath(anchorUrl.pathname);
      if (isNonOfferPath(anchorUrl.pathname)) continue;
      if (!anchorOnOfferPath && !hasExplicitOfferMarker(anchor.label)) continue;

      const label = acceptDiscoveredLabel(anchor.label, anchor.url);
      if (!label) continue;

      const evidenceSource: OfferEvidenceSource = anchorOnOfferPath
        ? "official-page"
        : anchor.inNav && source === "homepage"
          ? "homepage"
          : "official-page";

      push({
        ref: stableId("offer-discovery", anchor.url, "link", label),
        label,
        kind: inferKind(label, input.motion),
        source: evidenceSource,
        sourceUrl: anchor.url,
        confidence: confidenceForCandidate({
          inNav: anchor.inNav,
          onOfferPath: anchorOnOfferPath,
          source: evidenceSource
        })
      });
    }
  }

  return results
    .filter((item) => item.confidence >= 0.58)
    .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label))
    .slice(0, budget.maxLabels);
}

function offerDetailUrlsFromHtml(html: string, origin: string, maxLinks: number): string[] {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return [];
  }
  const candidates: Array<{ url: string; priority: number; order: number }> = [];
  const seen = new Set<string>();
  for (const [order, anchor] of extractAnchors(html, base).entries()) {
    try {
      const pathname = new URL(anchor.url).pathname;
      const anchorOnOfferPath = isOfferPath(pathname);
      if (isNonOfferPath(pathname)) continue;
      const explicitLabel = hasExplicitOfferMarker(anchor.label);
      if (!anchorOnOfferPath && !explicitLabel) continue;
      const key = pathname.replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        url: anchor.url,
        priority: isOfferIndexPath(pathname) ? 300 : anchorOnOfferPath ? 200 : 100,
        order
      });
    } catch {
      continue;
    }
  }
  return candidates
    .sort((left, right) => right.priority - left.priority || left.order - right.order)
    .slice(0, maxLinks)
    .map(({ url }) => url);
}

export interface HarvestOfferDiscoveryGraphInput {
  origin: string;
  /** Trusted official answer URL to prioritize as the first page. */
  sourceUrl?: string;
  fetchPage?: (url: string) => Promise<OfferDiscoveryPage | undefined>;
  budget?: Partial<OfferDiscoveryBudget>;
}

/**
 * Bounded same-origin HTML harvest for offer discovery. Fetches the homepage and a
 * small number of offer-path detail pages without leaving the submitted origin.
 */
export async function harvestOfferDiscoveryGraph(
  input: HarvestOfferDiscoveryGraphInput
): Promise<OfferDiscoveryPageGraph | undefined> {
  const budget: OfferDiscoveryBudget = {
    ...DEFAULT_OFFER_DISCOVERY_BUDGET,
    ...input.budget
  };
  const startedAt = Date.now();
  let originUrl: URL;
  try {
    originUrl = new URL(input.origin);
  } catch {
    return undefined;
  }

  const seedUrl = input.sourceUrl ? absolutePublicUrl(input.sourceUrl, originUrl) : undefined;
  if (seedUrl && !isBrandRelatedSeed(seedUrl, originUrl.toString())) return undefined;
  const discoveryOriginUrl = new URL(seedUrl ?? originUrl.toString());

  const fetchPage =
    input.fetchPage ??
    (async (url: string): Promise<OfferDiscoveryPage | undefined> => {
      const { fetchPinnedPublicText } = await import("@/lib/safe-fetch");
      try {
        const remainingMs = Math.max(1, budget.maxDurationMs - (Date.now() - startedAt));
        const response = await fetchPinnedPublicText(url, {
          maxBytes: 512_000,
          timeoutMs: Math.min(8_000, remainingMs),
          validateUrl: (candidate) => {
            if (!isSameOrigin(candidate.toString(), discoveryOriginUrl.toString())) {
              throw new Error("Offer discovery redirects must stay on the approved source host.");
            }
          }
        });
        if (response.status < 200 || response.status >= 400) return undefined;
        if (!isSameOrigin(response.finalUrl.toString(), discoveryOriginUrl.toString())) return undefined;
        return { url: response.finalUrl.toString(), html: response.text };
      } catch {
        return undefined;
      }
    });

  const boundedFetchPage = async (url: string): Promise<OfferDiscoveryPage | undefined> => {
    const remainingMs = budget.maxDurationMs - (Date.now() - startedAt);
    if (remainingMs <= 0 || !isSameOrigin(url, discoveryOriginUrl.toString())) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const page = await Promise.race([
        fetchPage(url),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), remainingMs);
        })
      ]);
      return page && isSameOrigin(page.url, discoveryOriginUrl.toString()) ? page : undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const homepage = await boundedFetchPage(seedUrl ?? originUrl.toString());
  if (!homepage?.html.trim() || Date.now() - startedAt >= budget.maxDurationMs) return undefined;

  const pages: OfferDiscoveryPage[] = [homepage];
  const seenUrls = new Set(pages.map((entry) => entry.url));
  const queue = offerDetailUrlsFromHtml(homepage.html, homepage.url, budget.maxLinks).filter(
    (url) => !seenUrls.has(url)
  );

  while (queue.length > 0 && pages.length < budget.maxPages && Date.now() - startedAt < budget.maxDurationMs) {
    const nextUrl = queue.shift();
    if (!nextUrl || seenUrls.has(nextUrl)) continue;
    const detailPage = await boundedFetchPage(nextUrl);
    if (!detailPage?.html.trim()) continue;
    seenUrls.add(detailPage.url);
    pages.push(detailPage);
    for (const discoveredUrl of offerDetailUrlsFromHtml(
      detailPage.html,
      detailPage.url,
      budget.maxLinks
    )) {
      if (!seenUrls.has(discoveredUrl) && !queue.includes(discoveredUrl)) {
        queue.push(discoveredUrl);
      }
    }
  }

  return {
    origin: discoveryOriginUrl.toString(),
    pages
  };
}
