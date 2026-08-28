import {
  config,
  hasBrandfetchBrandApi,
  hasBrandfetchLogoApi,
  hasRemoteBrandHarvester
} from "@/lib/config";
import { isIP } from "node:net";
import sharp from "sharp";
import {
  brandfetchLogoApiUrl,
  isBrandfetchHostedLogoUrl,
  isBrandfetchLogoApiUrl
} from "@/lib/brandfetch-logo";
import { withBrandReadiness } from "@/lib/brand-readiness";
import {
  fallbackCompanyName,
  normalizeCompanyDisplayName,
  resolvePublicCompanyName
} from "@/lib/company-name";
import {
  companyDomainStem,
  registrableCompanyDomain,
  sharesRegistrableCompanyDomain
} from "@/lib/domain-identity";
import { logServerError } from "@/lib/http";
import {
  portableBrandLogoFromBytes,
  portableBrandLogoFromSvg
} from "@/lib/portable-brand-logo";
import { fetchPinnedPublicBytes, fetchPinnedPublicText } from "@/lib/safe-fetch";
import type {
  BrandDesignDNA,
  BrandImageMetadata,
  BrandProfile,
  IntelligenceConfidence
} from "@/lib/types";
import { normalizeDomain } from "@/lib/validation";
import {
  brandDesignDNAFor,
  brandPresentationFor,
  type PresentedBrandProfile,
  verifiedBrandProfileFor
} from "@/lib/verified-brand-profiles";
import { createBrandBudget, type BrandBudget } from "@/lib/brand-budget";

const htmlEntityMap: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">"
};

const decodeHtml = (value: string) => {
  let decoded = value;
  for (let round = 0; round < 3; round += 1) {
    const next = decoded.replace(
      /&(amp|quot|apos|#39|lt|gt|#(?:x[0-9a-f]+|\d+));/gi,
      (entity, code: string) => {
        const named = htmlEntityMap[entity.toLowerCase()];
        if (named) return named;
        if (code.toLowerCase() === "apos") return "'";
        if (!code.startsWith("#")) return entity;
        const numeric = code[1]?.toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
        return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 0x10ffff
          ? String.fromCodePoint(numeric)
          : entity;
      }
    );
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
};

const stripTags = (value: string) =>
  decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

export function extractReadableContent(html: string): string {
  const collect = (tagName: "article" | "main") =>
    [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi"))]
      .map((match) => match[0])
      .sort((a, b) => stripTags(b).length - stripTags(a).length);
  const article = collect("article")[0];
  const main = collect("main")[0];
  const region = article && stripTags(article).length >= 300
    ? article
    : main && stripTags(main).length >= 300
      ? main
      : html;
  const cleaned = region
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:nav|header|footer|aside|form|noscript)\b[\s\S]*?<\/(?:nav|header|footer|aside|form|noscript)>/gi, " ");
  return stripTags(cleaned).slice(0, 7000);
}

const titleCaseDomain = fallbackCompanyName;

const entityKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function normalizeOfficialBrandSourceUrl(
  domain: string,
  sourceUrl: string,
  approvedDomains: readonly string[] = []
): string {
  const submittedDomain = normalizeDomain(domain);
  if (!submittedDomain || !sourceUrl.trim() || sourceUrl.length > 1000) {
    throw new TypeError("Use a public HTTPS page on the seller company domain.");
  }
  let normalized: URL;
  try {
    normalized = new URL(sourceUrl.trim());
  } catch {
    throw new TypeError("Use a public HTTPS page on the seller company domain.");
  }
  const hostname = normalized.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  const unsafeHost =
    !hostname ||
    isIP(hostname) !== 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");
  if (
    normalized.protocol !== "https:" ||
    normalized.port ||
    normalized.username ||
    normalized.password ||
    unsafeHost
  ) {
    throw new TypeError("Use a public HTTPS page on the seller company domain.");
  }
  const authorities = [
    submittedDomain,
    ...approvedDomains.flatMap((candidate) => {
      try {
        return [normalizeDomain(candidate)];
      } catch {
        return [];
      }
    })
  ];
  if (
    !authorities.some((authority) =>
      sharesRegistrableCompanyDomain(hostname, authority)
    )
  ) {
    throw new TypeError("Use a public HTTPS page on the seller company domain.");
  }
  normalized.hash = "";
  return normalized.toString();
}

function canonicalCompanyName(value: string, domain: string): string {
  const cleaned = value.replace(/\.(?:com|net|org)\s*$/i, "").trim();
  const domainKey = entityKey(companyDomainStem(domain));
  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let length = 1; length <= words.length; length += 1) {
    const prefix = words.slice(0, length).join(" ");
    if (domainKey && entityKey(prefix) === domainKey) return prefix;
  }
  return normalizeCompanyDisplayName(cleaned, domain);
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim();
}

function absoluteHttpsUrl(value: string | undefined, base: URL): string | undefined {
  if (!value || value.startsWith("data:")) return undefined;
  try {
    const resolved = new URL(decodeHtml(value), base);
    const hostname = resolved.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const nonPublicHostname =
      isIP(hostname) !== 0 ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal");
    return resolved.protocol === "https:" &&
      !resolved.port &&
      !resolved.username &&
      !resolved.password &&
      !nonPublicHostname
      ? resolved.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function extractMeta(html: string, key: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = attr(tag, "name") ?? attr(tag, "property");
    if (name?.toLowerCase() === key.toLowerCase()) return attr(tag, "content");
  }
  return undefined;
}

function strongestSrcsetSource(srcset: string, base: URL): string | undefined {
  return srcset
    .split(",")
    .map((entry, index) => {
      const [rawUrl, rawDescriptor = ""] = entry.trim().split(/\s+/, 2);
      const url = absoluteHttpsUrl(rawUrl, base);
      const descriptor = rawDescriptor.toLowerCase();
      const width = descriptor.endsWith("w")
        ? Number.parseFloat(descriptor.slice(0, -1))
        : 0;
      const density = descriptor.endsWith("x")
        ? Number.parseFloat(descriptor.slice(0, -1))
        : 0;
      return {
        url,
        // Width descriptors are the strongest signal. Density descriptors are
        // normalized below them, and source order only breaks exact ties.
        score: Number.isFinite(width) && width > 0
          ? 10_000 + width
          : Number.isFinite(density) && density > 0
            ? 1_000 + density * 100
            : index
      };
    })
    .filter((candidate): candidate is { url: string; score: number } => Boolean(candidate.url))
    .sort((left, right) => right.score - left.score)[0]?.url;
}

function imageSource(tag: string, base: URL): string | undefined {
  const srcset = attr(tag, "srcset") ?? attr(tag, "data-srcset");
  if (srcset) {
    const srcsetUrl = strongestSrcsetSource(srcset, base);
    if (srcsetUrl) return srcsetUrl;
  }
  const direct = attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-lazy-src");
  return absoluteHttpsUrl(direct, base);
}

type LogoCandidateSource =
  | "semantic-image"
  | "json-ld"
  | "itemprop"
  | "css"
  | "meta"
  | "link-icon"
  | "brandfetch"
  | "remote-profile"
  | "verified-profile";

interface LogoCandidate {
  source: string;
  score: number;
  sourceKind: LogoCandidateSource;
  width?: number;
  height?: number;
}

const logoCandidatesByProfile = new WeakMap<BrandProfile, LogoCandidate[]>();

function documentBaseUrl(html: string, fallback: URL): URL {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0];
  const href = absoluteHttpsUrl(baseTag ? attr(baseTag, "href") : undefined, fallback);
  return href ? new URL(href) : fallback;
}

function structuredLogoUrls(html: string, base: URL, companyKeys: string[]): string[] {
  const results: string[] = [];
  const visit = (value: unknown, inheritedOrganization = false): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, inheritedOrganization));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = (Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]])
      .filter((type): type is string => typeof type === "string")
      .map((type) => type.toLowerCase());
    const nameKey = entityKey(typeof record.name === "string" ? record.name : "");
    const organization = inheritedOrganization ||
      types.some((type) => ["organization", "corporation", "brand"].includes(type));
    const ownerMatches = !nameKey || companyKeys.some((key) => nameKey.includes(key) || key.includes(nameKey));
    if (organization && ownerMatches) {
      const logo = record.logo;
      const rawUrls = typeof logo === "string"
        ? [logo]
        : logo && typeof logo === "object"
          ? [
              (logo as Record<string, unknown>).contentUrl,
              (logo as Record<string, unknown>).url
            ]
          : [];
      for (const raw of rawUrls) {
        const url = absoluteHttpsUrl(typeof raw === "string" ? raw : undefined, base);
        if (url) results.push(url);
      }
    }
    Object.values(record).forEach((child) => visit(child, organization));
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      visit(JSON.parse(match[1] ?? ""));
    } catch {
      // Malformed public JSON-LD is ignored; it is evidence, never instructions.
    }
  }
  return results.filter((url, index, urls) => urls.indexOf(url) === index);
}

function responsiveLogoTags(html: string): string[] {
  const tags: string[] = [...(html.match(/<img\b[^>]*>/gi) ?? [])];
  for (const picture of html.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi) ?? []) {
    const fallback = picture.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const inherited = ["alt", "class", "id", "width", "height"]
      .map((name) => {
        const value = attr(fallback, name);
        return value ? `${name}="${escapeSvgAttribute(value)}"` : "";
      })
      .filter(Boolean)
      .join(" ");
    for (const source of picture.match(/<source\b[^>]*>/gi) ?? []) {
      tags.push(`<img data-picture-source="true" ${inherited} ${source.replace(/^<source\b|>$/gi, "")}>`);
    }
  }
  return tags;
}

function numericAttr(tag: string, name: string): number {
  const value = Number.parseInt(attr(tag, name) ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Some design systems publish one hidden SVG sprite containing every site icon.
 * A logo symbol inside that sprite is official artwork, but the sprite itself is
 * intentionally `display:none` and therefore renders as a blank image. Convert
 * a company-matched logo symbol into a standalone SVG before making it portable.
 */
function renderableInlineLogoSvg(
  svg: string,
  companyName: string,
  companyKeys: string[]
): string | undefined {
  const symbols = [...svg.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/gi)].map(
    (match) => {
      const openingTag = `<symbol${match[1] ?? ""}>`;
      const descriptor = [
        attr(openingTag, "id"),
        attr(openingTag, "aria-label"),
        match[2]?.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],
        match[2]?.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1]
      ]
        .filter(Boolean)
        .join(" ");
      const descriptorKey = entityKey(stripTags(descriptor));
      let score = 0;
      if (companyKeys.some((key) => descriptorKey.includes(key))) score += 100;
      if (/logo|wordmark|brand/i.test(descriptor)) score += 60;
      if (/home/i.test(descriptor)) score += 10;
      if (/menu|close|caret|search|cart|user|icon/i.test(descriptor)) score -= 80;
      return {
        body: match[2] ?? "",
        openingTag,
        score
      };
    }
  );

  if (!symbols.length) return svg;
  const selected = symbols.sort((a, b) => b.score - a.score)[0];
  if (!selected || selected.score < 100) {
    const openingTag = svg.match(/^<svg\b[^>]*>/i)?.[0] ?? "";
    const hiddenRoot =
      /\bdisplay\s*:\s*none\b/i.test(openingTag) ||
      /\baria-hidden\s*=\s*["']true["']/i.test(openingTag) ||
      /\bclass\s*=\s*["'][^"']*\bhide\b/i.test(openingTag);
    return hiddenRoot ? undefined : svg;
  }

  const viewBox = attr(selected.openingTag, "viewBox");
  if (
    !viewBox ||
    !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[ ,]+-?(?:\d+(?:\.\d+)?|\.\d+)){3}$/.test(viewBox)
  ) return undefined;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeSvgAttribute(companyName)} logo" viewBox="${viewBox}">`,
    selected.body,
    "</svg>"
  ].join("");
}

function extractLogo(
  html: string,
  base: URL,
  companyName: string
): {
  logoUrl?: string;
  portableLogo?: BrandProfile["portableLogo"];
  candidates: LogoCandidate[];
  receipt: NonNullable<BrandProfile["diagnostics"]>["logo"];
} {
  const assetBase = documentBaseUrl(html, base);
  const companyKeys = [entityKey(companyName), entityKey(base.hostname.split(".")[0] ?? "")]
    .filter((key) => key.length >= 2)
    .filter((key, index, values) => values.indexOf(key) === index);
  let imageCandidateCount = 0;
  let rejectedImageCount = 0;
  const inlineSvgCandidates = (html.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi) ?? [])
    .filter((svg) => {
      const openingTag = svg.match(/^<svg\b[^>]*>/i)?.[0] ?? "";
      const descriptor = [
        attr(openingTag, "aria-label"),
        attr(openingTag, "id"),
        attr(openingTag, "class"),
        svg.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],
        svg.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1]
      ]
        .filter(Boolean)
        .join(" ");
      const descriptorKey = entityKey(stripTags(descriptor));
      return (
        companyKeys.some((key) => descriptorKey.includes(key)) &&
        (/logo|brand/i.test(descriptor) || /role\s*=\s*["']img|aria-label|<title/i.test(svg))
      );
    });
  const inlineSvgCandidateCount = inlineSvgCandidates.length;
  const scored = responsiveLogoTags(html)
    .map((tag): LogoCandidate | null => {
      const source = imageSource(tag, assetBase);
      if (!source) return null;
      imageCandidateCount += 1;
      const sourceName = (() => {
        try {
          return new URL(source).pathname.split("/").at(-1) ?? "";
        } catch {
          return "";
        }
      })();
      const descriptor = [
        attr(tag, "alt"),
        attr(tag, "class"),
        attr(tag, "id"),
        sourceName
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const width = numericAttr(tag, "width");
      const height = numericAttr(tag, "height");
      const isVectorAsset = /\.svg(?:\?|$)/.test(source);
      const looksLikePhotography =
        !isVectorAsset &&
        (Boolean(width && height && (width > 600 || height > 300)) ||
          /hero|banner|photograph|building|campus|office|1600x900|1200x630/.test(descriptor));
      if (looksLikePhotography) {
        rejectedImageCount += 1;
        return null;
      }
      const descriptorKey = entityKey(descriptor);
      const companyNameSignal = companyKeys.some((key) => descriptorKey.includes(key));
      if (!companyNameSignal) {
        rejectedImageCount += 1;
        return null;
      }
      const nonLogoRole =
        /app[-_ ]?store|google[-_ ]?play|download(?:[^a-z]+\w+){0,4}[^a-z]+app|badge|customer|partner|testimonial/.test(
          descriptor
        );
      if (nonLogoRole) {
        rejectedImageCount += 1;
        return null;
      }
      const structuralLogoSignal = /mainnav|site[-_ ]?logo|navbar.*logo|header.*logo/.test(descriptor);
      const compactCompanyMark =
        companyNameSignal &&
        (isVectorAsset ||
          Boolean(width && height && width <= 400 && height <= 180 && width > height * 1.2)) &&
        !/hero|banner|building|campus|office/.test(descriptor);
      const namedLogoSignal = companyNameSignal && /\blogo\b/.test(descriptor);
      if (!structuralLogoSignal && !namedLogoSignal && !compactCompanyMark) {
        rejectedImageCount += 1;
        return null;
      }
      let score = 0;
      if (descriptor.includes("logo")) score += 50;
      if (companyNameSignal) score += 35;
      if (/mainnav|site[-_ ]?logo|navbar.*logo|header.*logo/.test(descriptor)) score += 45;
      if (attr(tag, "data-picture-source") === "true") score += 15;
      if (/favicon|apple-touch|lang-picker|customer|partner|testimonial/.test(descriptor)) score -= 90;
      // A small square mark is often an app icon or favicon-sized symbol. Keep
      // it as a last-resort candidate, but prefer a deliverable wordmark when a
      // verified provider can resolve one.
      if (width && height && width <= 96 && height <= 96 && Math.abs(width - height) < 20) score -= 65;
      if (width > height * 1.6) score += 25;
      return { source, score, sourceKind: "semantic-image" as const, width, height };
    })
    .filter((candidate): candidate is LogoCandidate => Boolean(candidate));

  const supplemental: LogoCandidate[] = [];
  for (const source of structuredLogoUrls(html, assetBase, companyKeys)) {
    supplemental.push({ source, score: 130, sourceKind: "json-ld" });
  }
  for (const tag of html.match(/<(?:img|meta|link)\b[^>]*\bitemprop\s*=\s*["'][^"']*logo[^"']*["'][^>]*>/gi) ?? []) {
    const source = imageSource(tag, assetBase) ??
      absoluteHttpsUrl(attr(tag, "content") ?? attr(tag, "href"), assetBase);
    if (source) supplemental.push({ source, score: 125, sourceKind: "itemprop" });
  }
  for (const key of ["og:logo", "twitter:logo", "logo"]) {
    const source = absoluteHttpsUrl(extractMeta(html, key), assetBase);
    if (source) supplemental.push({ source, score: 115, sourceKind: "meta" });
  }
  for (const tag of html.match(/<[^>]+\bstyle\s*=\s*["'][^"']*(?:background|mask)(?:-image)?\s*:[^"']+["'][^>]*>/gi) ?? []) {
    const descriptor = [attr(tag, "aria-label"), attr(tag, "class"), attr(tag, "id")]
      .filter(Boolean)
      .join(" ");
    const descriptorKey = entityKey(descriptor);
    if (!/logo|wordmark|brand/i.test(descriptor) || !companyKeys.some((key) => descriptorKey.includes(key))) {
      continue;
    }
    const style = attr(tag, "style") ?? "";
    for (const match of style.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const source = absoluteHttpsUrl(match[1], assetBase);
      if (source) supplemental.push({ source, score: 105, sourceKind: "css" });
    }
  }
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (!/apple-touch-icon|mask-icon|(?:^|\s)icon(?:\s|$)/.test(rel)) continue;
    const source = absoluteHttpsUrl(attr(tag, "href"), assetBase);
    if (!source) continue;
    const sizes = attr(tag, "sizes") ?? "";
    const largestSize = Math.max(
      0,
      ...[...sizes.matchAll(/(\d+)x(\d+)/gi)].map((match) => Number.parseInt(match[1] ?? "0", 10))
    );
    supplemental.push({
      source,
      score: 5 + Math.min(largestSize / 64, 8),
      sourceKind: "link-icon",
      width: largestSize || undefined,
      height: largestSize || undefined
    });
  }
  const candidates = [...scored, ...supplemental]
    .sort((left, right) => right.score - left.score)
    .filter(
      (candidate, index, values) =>
        values.findIndex((other) => other.source === candidate.source) === index
    )
    .slice(0, 12);
  const selected = candidates.find((candidate) => candidate.score >= 35);
  if (selected) {
    return {
      logoUrl: selected.source,
      candidates,
      receipt: {
        strategy: "semantic-image",
        imageCandidateCount,
        rejectedImageCount,
        inlineSvgCandidateCount,
        selectedScore: selected.score,
        selectedSource: selected.sourceKind
      }
    };
  }

  // Many official navigation wordmarks (including Cisco's) are authored
  // directly in the page. Preserve only self-contained, inert SVG; the
  // session image route serves the validated bytes from the first-party app.
  const portableLogo = inlineSvgCandidates
    .map((svg) => renderableInlineLogoSvg(svg, companyName, companyKeys))
    .filter((svg): svg is string => Boolean(svg))
    .map((svg) => portableBrandLogoFromSvg(svg))
    .find((candidate): candidate is NonNullable<BrandProfile["portableLogo"]> => Boolean(candidate));
  if (portableLogo) {
    return {
      portableLogo,
      candidates,
      receipt: {
        strategy: "inline-svg-portable",
        imageCandidateCount,
        rejectedImageCount,
        inlineSvgCandidateCount
      }
    };
  }

  const fallbackIcon = candidates.find((candidate) => candidate.sourceKind === "link-icon");
  if (fallbackIcon) {
    return {
      logoUrl: fallbackIcon.source,
      candidates,
      receipt: {
        strategy: "favicon",
        imageCandidateCount,
        rejectedImageCount,
        inlineSvgCandidateCount,
        selectedScore: fallbackIcon.score,
        selectedSource: fallbackIcon.sourceKind
      }
    };
  }
  return {
    candidates,
    receipt: {
      strategy: inlineSvgCandidateCount > 0 ? "inline-svg-unportable" : "none",
      imageCandidateCount,
      rejectedImageCount,
      inlineSvgCandidateCount
    }
  };
}

type HarvestedAssetPurpose = "product" | "context" | "diagram" | "evidence" | "unknown";

const HARVESTED_ASSET_PURPOSE_RANK: Record<HarvestedAssetPurpose, number> = {
  product: 4,
  context: 3,
  diagram: 2,
  evidence: 1,
  unknown: 0
};

function harvestedAssetPurpose(descriptor: string): HarvestedAssetPurpose {
  if (
    /\b(product|platform|dashboard|interface|product-ui|app-screen|console|workspace|device)\b/i.test(
      descriptor
    )
  ) return "product";
  if (
    /\b(evidence|proof|report|resource|case-study|customer-story|benchmark|research|whitepaper)\b/i.test(
      descriptor
    )
  ) return "evidence";
  if (
    /\b(people|person|team|customer|technician|worker|operator|office|field|portrait|photo)\b/i.test(
      descriptor
    )
  ) return "context";
  if (/\b(diagram|architecture|workflow|process|explainer|schematic|integration-map)\b/i.test(descriptor)) {
    return "diagram";
  }
  return "unknown";
}

function harvestedAssetDuplicateKey(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname
    .toLowerCase()
    .replace(
      /[-_](?:\d+x\d+|\d+[wh]|small|medium|large|thumb(?:nail)?|desktop|mobile|crop)(?=[-_.])/g,
      ""
    );
  return `${parsed.origin.toLowerCase()}${path}`;
}

function extractImageUrls(
  html: string,
  css: string,
  base: URL,
  logoUrl?: string
): string[] {
  const candidates = new Map<string, number>();
  const add = (url: string | undefined, score: number, descriptor = "") => {
    const pathname = url ? new URL(url).pathname : "";
    const fullDescriptor = `${descriptor} ${pathname}`;
    if (
      !url ||
      url === logoUrl ||
      /\.(?:css|js|mjs|json|map|woff2?|ttf|otf|eot|pdf|zip|mp4|webm)(?:$|[?#])/i.test(url) ||
      /(?:^|[/_.-])(logos?|wordmark|brandmark|badge|app[-_ ]?store|google[-_ ]?play|favicon|icons?)(?:[/_.?-]|$)/i.test(
        pathname
      ) ||
      (/\.svg(?:$|[?#])/i.test(url) &&
        !/diagram|architecture|platform|workflow|illustration|visual/i.test(descriptor))
    ) return;
    if (
      /(?:^|[/_.-])(event|roadshow|webinar|conference|summit|register|registration|speaker|dates?|regions?|promo(?:tion)?|sale)(?:[/_.?-]|$)/i.test(
        pathname
      ) ||
      /\b(event-banner|roadshow|webinar|conference|summit|register|registration|speaker|promotion|sale)\b/i.test(
        descriptor
      ) ||
      /\b(stock-photo|stock-image|placeholder|lorem-picsum)\b/i.test(fullDescriptor)
    ) return;
    const purpose = harvestedAssetPurpose(fullDescriptor);
    const reusableScore =
      HARVESTED_ASSET_PURPOSE_RANK[purpose] * 1_000 + score;
    candidates.set(url, Math.max(reusableScore, candidates.get(url) ?? Number.NEGATIVE_INFINITY));
  };

  add(absoluteHttpsUrl(extractMeta(html, "og:image"), base), 55, "social preview");
  add(absoluteHttpsUrl(extractMeta(html, "twitter:image"), base), 50, "social preview");

  for (const tag of responsiveLogoTags(html)) {
    const source = imageSource(tag, base);
    if (!source) continue;
    const descriptor = [attr(tag, "alt"), attr(tag, "class"), attr(tag, "id"), source]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const width = numericAttr(tag, "width");
    const height = numericAttr(tag, "height");
    let score = 10;
    if (/hero|platform|product|solution|overview|architecture|workflow/.test(descriptor)) score += 45;
    if (/campaign|experience/.test(descriptor)) score += 15;
    if (/(?:^|[^a-z])(?:logos?|icons?|avatar|headshot|testimonial|badge|flag|cookie|language|spinner|rating|stars?|review|widget)(?:[^a-z]|$)|g2\.com|trustpilot/.test(descriptor)) score -= 100;
    if (width >= 600 || height >= 400) score += 25;
    if (
      (width && width <= 96) ||
      (height && height <= 96) ||
      (width && height && width * height < 80_000)
    ) continue;
    if (/\.svg(?:\?|$)/.test(source) && !/diagram|architecture|platform|workflow/.test(descriptor)) score -= 20;
    add(source, score, descriptor);
  }

  for (const rule of css.matchAll(/([^{}]{1,260})\{([^{}]{0,2400})\}/g)) {
    const selector = rule[1].trim();
    const body = rule[2];
    if (
      !selector ||
      selector.startsWith("@") ||
      /logo|wordmark|brandmark|badge|icon|avatar|cookie|captcha|spinner|rating|stars?|review|widget/i.test(
        selector
      )
    ) continue;
    const visualRole = /hero|masthead|banner|platform|product|solution|architecture|workflow|illustration|visual/i.test(
      selector
    );
    const declarations = body.match(
      /(?:background(?:-image)?|content)\s*:\s*[^;}{]*url\([^;}{]+\)/gi
    ) ?? [];
    for (const declaration of declarations) {
      for (const match of declaration.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        const source = absoluteHttpsUrl(match[1], base);
        add(source, visualRole ? 70 : 20, selector);
      }
    }
  }

  return [...candidates.entries()]
    .filter(([, score]) => score >= 25)
    .sort((a, b) => b[1] - a[1])
    .filter(
      ([url], index, values) =>
        values.findIndex(([other]) =>
          harvestedAssetDuplicateKey(other) === harvestedAssetDuplicateKey(url)
        ) === index
    )
    .slice(0, 6)
    .map(([url]) => url);
}

function normalizeHex(value: string): string | undefined {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return undefined;
  const raw = match[1];
  return `#${(raw.length === 3 ? raw.split("").map((char) => `${char}${char}`).join("") : raw).toUpperCase()}`;
}

function normalizeCssColor(value: string): string | undefined {
  const normalizedHex = normalizeHex(value);
  if (normalizedHex) return normalizedHex;
  const match = value.trim().match(
    /^rgba?\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})(?:\s*(?:,|\/)\s*(\d*\.?\d+%?))?\s*\)$/i
  );
  if (!match) return undefined;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return undefined;
  }
  const rawAlpha = match[4];
  if (rawAlpha) {
    const alpha = rawAlpha.endsWith("%")
      ? Number.parseFloat(rawAlpha) / 100
      : Number.parseFloat(rawAlpha);
    if (!Number.isFinite(alpha) || alpha < 0.5 || alpha > 1) return undefined;
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function cssColorLiterals(value: string): string[] {
  return value.match(/#[0-9a-f]{3,6}\b|rgba?\([^)]{1,64}\)/gi) ?? [];
}

function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function saturation(hex: string): number {
  const channels = rgb(hex).map((value) => value / 255);
  return Math.max(...channels) - Math.min(...channels);
}

interface StaticSemanticColorRoles {
  darkSurface?: string;
  softSurface?: string;
  supportingAccent?: string;
  lightSurfaceAccent?: string;
  lightText?: string;
  mutedText?: string;
  divider?: string;
  focus?: string;
  surface?: string;
}

function extractPalette(html: string, css: string): {
  colors: string[];
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  semanticRoles: StaticSemanticColorRoles;
  diagnostics: NonNullable<NonNullable<BrandProfile["diagnostics"]>["palette"]>;
} {
  const source = css.trim() || html;
  const counts = new Map<string, number>();
  for (const literal of cssColorLiterals(source)) {
    const color = normalizeCssColor(literal);
    if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  const rawVariables = new Map(
    [...source.matchAll(/--([a-z0-9_-]+)\s*:\s*([^;}{]+)/gi)].map((match) => [
      match[1].toLowerCase(),
      match[2].trim()
    ])
  );
  const resolveVariableColor = (value: string, seen = new Set<string>()): string | undefined => {
    const direct = cssColorLiterals(value)
      .map(normalizeCssColor)
      .find((color): color is string => Boolean(color));
    if (direct) return direct;
    const reference = value.match(/var\(\s*--([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
    if (!reference || seen.has(reference)) return undefined;
    const referencedValue = rawVariables.get(reference);
    if (!referencedValue) return undefined;
    return resolveVariableColor(referencedValue, new Set([...seen, reference]));
  };
  const variables = [...rawVariables.entries()]
    .map(([name, value]) => ({
      name,
      color: resolveVariableColor(value),
      usage: source.toLowerCase().split(`var(--${name}`).length - 1
    }))
    .filter((entry): entry is { name: string; color: string; usage: number } => Boolean(entry.color));

  const stateToken = /(^|[-_])(success|danger|error|warning|info|disabled|visited)([-_]|$)/;
  const componentToken = /(^|[-_])(swiper|slick|owl|recaptcha)([-_]|$)/;
  const frameworkToken =
    /(^|[-_])(bs|bootstrap|wp|wordpress|tw|tailwind|mdc|material|fa|fontawesome|hubspot|hsf)([-_]|$)/;
  const genericSelector =
    /(?:^|[\s>+~,])(?:\.btn(?:[-_:]|\b)|\.alert(?:[-_:]|\b)|\.form-control\b|\.modal(?:[-_:]|\b)|\.dropdown(?:[-_:]|\b)|\.tooltip(?:[-_:]|\b)|\.popover(?:[-_:]|\b)|\.swiper(?:[-_:]|\b)|\.slick(?:[-_:]|\b)|\.owl(?:[-_:]|\b)|\.wp-(?:block|element|site)|\.hs-(?:form|button)|\.fa(?:[-_:]|\b)|\.g-recaptcha\b)/i;
  const stateOnlyColors = new Set(
    variables
      .filter(
        ({ name, color }) =>
          (stateToken.test(name) || componentToken.test(name)) &&
          !variables.some(
            (candidate) =>
              candidate.color === color &&
              !stateToken.test(candidate.name) &&
              !componentToken.test(candidate.name)
          )
      )
      .map(({ color }) => color)
  );
  const frameworkOnlyColors = new Set(
    variables
      .filter(
        ({ name, color }) =>
          frameworkToken.test(name) &&
          !variables.some(
            (candidate) => candidate.color === color && !frameworkToken.test(candidate.name)
          )
      )
      .map(({ color }) => color)
  );

  const ruleCandidates = [...css.matchAll(/([^{}]{1,260})\{([^{}]{0,2400})\}/g)]
    .flatMap((match) => {
      const selector = match[1].trim();
      const body = match[2];
      if (
        !selector ||
        selector.startsWith("@") ||
        genericSelector.test(selector) ||
        /(?:^|[-_])(swiper|slick|owl|recaptcha|bootstrap|fontawesome)(?:$|[-_])/i.test(selector)
      ) return [];
      const declarationBody = body.replace(/--[a-z0-9_-]+\s*:\s*[^;}{]+;?/gi, "");
      const heroOrBrand = /hero|masthead|site[-_ ]?header|brand|identity|headline|heading|navigation|navbar|primary[-_ ]?button|cta/i.test(selector);
      const bodyOrText = /(?:^|[\s>,])(?:html|body|h[1-3]|p)(?:$|[\s.:#\[])/i.test(selector) ||
        /shell|headline|heading|title|copy|text/i.test(selector);
      const gradient = /(?:linear|radial|conic)-gradient\s*\(/i.test(declarationBody);
      return cssColorLiterals(declarationBody)
        .map(normalizeCssColor)
        .filter((color): color is string => Boolean(color))
        .map((color) => ({ color, heroOrBrand, bodyOrText, gradient, selector }));
    });
  const ruleColorSet = new Set(ruleCandidates.map(({ color }) => color));
  const sourceOwnedVariables = variables.filter(
    ({ name }) =>
      !stateToken.test(name) &&
      !componentToken.test(name) &&
      !frameworkToken.test(name)
  );
  const gradientVariableColors = [...rawVariables.entries()]
    .filter(
      ([name, value]) =>
        !frameworkToken.test(name) &&
        !componentToken.test(name) &&
        /gradient|brand|hero|radiant|flame|electric|energy/i.test(name) &&
        /(?:linear|radial|conic)-gradient\s*\(/i.test(value)
    )
    .flatMap(([, value]) =>
      cssColorLiterals(value)
        .map(normalizeCssColor)
        .filter((color): color is string => Boolean(color))
    );
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
  const meaningful = ranked.filter(
    (color) =>
      !["#000000", "#FFFFFF", "#F5F5F5", "#333333"].includes(color) &&
      !stateOnlyColors.has(color) &&
      (!frameworkOnlyColors.has(color) || ruleColorSet.has(color))
  );
  const semanticPrimary = sourceOwnedVariables
    .filter(
      ({ name, color }) =>
        !stateToken.test(name) &&
        !componentToken.test(name) &&
        !/(button|carousel|link)/.test(name) &&
        luminance(color) < 0.32 &&
        (/(^|[-_])(ink|heading|headline)([-_]|$)/.test(name) ||
          /(^|[-_])text[-_](primary|color)([-_]|$)/.test(name) ||
          /brand.*(primary|ink|text)|(primary|ink|text).*brand/.test(name) ||
          /(^|[-_])neutral[-_]?(?:9\d\d)([-_]|$)/.test(name) ||
          (/(^|[-_])ui[-_]background[-_](?:0?[1-9]|dark|inverse)([-_]|$)/.test(name) &&
            luminance(color) < 0.18))
    )
    .sort((a, b) => {
      const score = (name: string) =>
        (/brand.*(primary|ink|text)|(primary|ink|text).*brand/.test(name) ? 140 : 0) +
        (/(^|[-_])(ink|heading|headline)([-_]|$)/.test(name) ? 110 : 0) +
        (/(^|[-_])text[-_](primary|color)([-_]|$)/.test(name) ? 100 : 0) +
        (/(^|[-_])neutral[-_]?(?:9\d\d)([-_]|$)/.test(name) ? 95 : 0) +
        (/(^|[-_])ui[-_]background[-_](?:0?[1-9]|dark|inverse)([-_]|$)/.test(name) ? 75 : 0);
      return score(b.name) + b.usage - score(a.name) - a.usage;
    })[0]?.color;

  const maskIconColor = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => /mask-icon/i.test(attr(tag, "rel") ?? ""))
    .map((tag) => normalizeHex(attr(tag, "color") ?? ""))
    .find((color): color is string => Boolean(color && saturation(color) > 0.25));
  const themeColor = normalizeHex(extractMeta(html, "theme-color") ?? "");
  const accentScore = (name: string, usage: number) => {
    if (/gradient/.test(name)) return 0;
    const shade = /(?:^|[-_])(?:500|600|700)(?:$|[-_])/.test(name) ? 35 : 0;
    if (/(^|[-_])brand([-_]|$)|(^|[-_])brand[-_]?color([-_]|$)|(^|[-_])color[-_]?brand([-_]|$)/.test(name)) {
      return 200 + shade;
    }
    if (/primary[-_]?core/.test(name)) return 190;
    // Design-system semantic primaries (ServiceTitan Anvil, etc.) outrank raw scales.
    if (/background[-_]?(?:color[-_]?)?primary(?:[-_]|$)/.test(name)) return 185;
    if (/(^|[-_])ui[-_]?0?1([-_]|$)/.test(name)) return 180;
    // Named interactive blues used as primary action colors in public design systems.
    if (/(?:^|[-_])(?:color[-_]?)?blue[-_]?(?:500|600|700)(?:[-_]|$)/.test(name)) return 175;
    if (/(^|[-_])accent([-_]|$)/.test(name)) return 155;
    if (/cta|button.*background/.test(name)) return 145;
    if (/(^|[-_])(action|focus|interactive|link)([-_]|$)/.test(name)) return 140;
    if (/(^|[-_])primary([-_]|$)/.test(name)) return 130;
    if (/highlight/.test(name)) return 120;
    if (/radiant|flame|electric|energy|vivid/.test(name)) return 115;
    if (/^palette[-_]/.test(name)) return 90 + Math.min(usage, 12) * 5;
    return 0;
  };
  const semanticAccentEntry = sourceOwnedVariables
    .filter(
      ({ name, color, usage }) =>
        !stateToken.test(name) &&
        !componentToken.test(name) &&
        saturation(color) > 0.28 &&
        luminance(color) > 0.04 &&
        luminance(color) < 0.78 &&
        !/(grey|gray|white|black|text|border|shadow|overlay)/.test(name) &&
        accentScore(name, usage) > 0
    )
    .sort((a, b) => accentScore(b.name, b.usage) - accentScore(a.name, a.usage))[0];

  const rulePrimary = ruleCandidates
    .filter(
      ({ color, bodyOrText }) =>
        bodyOrText &&
        luminance(color) < 0.32 &&
        !stateOnlyColors.has(color) &&
        !frameworkOnlyColors.has(color)
    )
    .sort((a, b) => Number(b.heroOrBrand) - Number(a.heroOrBrand))[0]?.color;
  const ruleAccent = ruleCandidates
    .filter(
      ({ color, heroOrBrand, gradient, selector }) =>
        (heroOrBrand || gradient || /button|link/i.test(selector)) &&
        saturation(color) > 0.34 &&
        luminance(color) > 0.04 &&
        luminance(color) < 0.8 &&
        !stateOnlyColors.has(color) &&
        !frameworkOnlyColors.has(color)
    )
    .sort((a, b) =>
      Number(b.gradient) * 30 + Number(b.heroOrBrand) * 20 -
      Number(a.gradient) * 30 - Number(a.heroOrBrand) * 20
    )[0]?.color;
  const gradientAccent = gradientVariableColors.find(
    (color) =>
      saturation(color) > 0.34 &&
      luminance(color) > 0.04 &&
      luminance(color) < 0.8
  );

  const provisionalPrimary = semanticPrimary ?? rulePrimary ?? "#1C293F";
  const vividCandidates = meaningful.filter(
    (color) =>
      color !== provisionalPrimary &&
      saturation(color) > 0.42 &&
      luminance(color) > 0.06 &&
      luminance(color) < 0.72
  );
  const metadataAccent = maskIconColor ??
    (themeColor && saturation(themeColor) > 0.25 && luminance(themeColor) < 0.78
      ? themeColor
      : undefined);
  const semanticAccent = semanticAccentEntry?.color;
  const semanticAccentStrength = semanticAccentEntry
    ? accentScore(semanticAccentEntry.name, semanticAccentEntry.usage)
    : 0;
  const semanticRoleColor = (
    pattern: RegExp,
    accepts: (color: string) => boolean = () => true
  ) => sourceOwnedVariables
    .filter(({ name, color }) => pattern.test(name) && accepts(color))
    .sort((left, right) => right.usage - left.usage)[0]?.color;
  const semanticSurface = semanticRoleColor(
    /(?:^|[-_])(?:(?:body|page|base|canvas)[-_])?(?:surface|background)(?:[-_](?:default|primary|base|light|white|0?1))?(?:$|[-_])/,
    (color) => luminance(color) > 0.82
  );
  const semanticRoles: StaticSemanticColorRoles = {
    darkSurface: semanticRoleColor(
      /(?:hero|masthead|nav|navbar|header).*(?:background|surface)|(?:background|surface).*(?:dark|inverse|midnight)/,
      (color) => luminance(color) < 0.3
    ),
    softSurface: semanticRoleColor(
      /(?:surface|background).*(?:soft|subtle|secondary|tertiary|muted|light[-_]?(?:gray|grey|pink))|(?:soft|subtle|muted).*(?:surface|background)/,
      (color) => luminance(color) > 0.65
    ),
    supportingAccent: semanticRoleColor(
      /(?:support|secondary)[-_]?(?:accent|brand|color)|(?:accent|brand)[-_]?(?:support|secondary)/
    ),
    lightSurfaceAccent: semanticAccent,
    lightText: semanticRoleColor(
      /(?:text|foreground|content).*(?:inverse|on[-_]?dark|light|white)|(?:inverse|on[-_]?dark).*(?:text|foreground|content)/,
      (color) => luminance(color) > 0.72
    ),
    mutedText: semanticRoleColor(
      /(?:text|foreground|content).*(?:muted|subdued|secondary|tertiary)|(?:muted|subdued).*(?:text|foreground|content)/
    ),
    divider: semanticRoleColor(/(?:^|[-_])(?:divider|separator|border)(?:$|[-_])/),
    focus: semanticRoleColor(/(?:^|[-_])focus(?:$|[-_])/),
    surface: semanticSurface
  };
  const evidencedAccent = (semanticAccentStrength >= 170 ? semanticAccent : undefined) ??
    metadataAccent ??
    semanticAccent ??
    gradientAccent ??
    ruleAccent ??
    (css.trim() ? vividCandidates[0] : metadataAccent ?? vividCandidates[0]) ??
    meaningful.find((color) => color !== provisionalPrimary);
  // Never label a fabricated accent as harvested truth. Incomplete palettes keep
  // a neutral placeholder only under an explicit low-confidence fallback strategy.
  const usedFabricatedAccent = !evidencedAccent;
  const accentColor = evidencedAccent ?? "#5F6368";
  const darkCandidates = meaningful.filter(
    (color) => color !== accentColor && luminance(color) < 0.28 && saturation(color) > 0.08
  );
  const evidencedPrimary = semanticPrimary ??
    rulePrimary ??
    (css.trim() && variables.length === 0 ? darkCandidates[0] : undefined);
  const usedFabricatedPrimary = !evidencedPrimary;
  const primaryColor = evidencedPrimary ?? "#202124";
  const evidencedSurface = semanticSurface ?? ranked.find((color) => luminance(color) > 0.88);
  const surfaceColor = evidencedSurface ?? "#FFFFFF";
  const colors = [
    primaryColor,
    accentColor,
    surfaceColor,
    ...Object.values(semanticRoles).filter((color): color is string => Boolean(color)),
    ...meaningful
  ]
    .filter((color, index, values) => values.indexOf(color) === index)
    .slice(0, 8);
  const semanticColors = new Set([
    ...sourceOwnedVariables.map(({ color }) => color),
    ...gradientVariableColors,
    ...ruleColorSet,
    ...(metadataAccent ? [metadataAccent] : [])
  ]);
  const semanticCandidateCount = semanticColors.size;
  const rejectedCandidateCount = new Set([...stateOnlyColors, ...frameworkOnlyColors]).size;
  const gradientCandidateCount = new Set([
    ...gradientVariableColors,
    ...ruleCandidates.filter(({ gradient }) => gradient).map(({ color }) => color)
  ]).size;
  const hasSemanticRoles = Boolean(
    semanticPrimary || semanticAccent || gradientAccent || rulePrimary || ruleAccent
  );
  const hasUsefulMetadata = Boolean(metadataAccent);
  const confidence = usedFabricatedAccent || usedFabricatedPrimary
    ? "low"
    : hasSemanticRoles && semanticCandidateCount >= 2
      ? "high"
      : hasSemanticRoles
        ? "medium"
        : "low";
  const strategy = usedFabricatedAccent || usedFabricatedPrimary
    ? "fallback"
    : semanticPrimary || semanticAccent || gradientAccent
      ? "semantic-tokens"
      : rulePrimary || ruleAccent
        ? "source-rules"
        : hasUsefulMetadata
          ? "metadata"
          : meaningful.length
            ? "frequency"
            : "fallback";
  return {
    colors,
    primaryColor,
    accentColor,
    surfaceColor,
    semanticRoles,
    diagnostics: {
      strategy,
      confidence,
      candidateCount: counts.size,
      semanticCandidateCount,
      rejectedCandidateCount,
      gradientCandidateCount
    }
  };
}

function cssLengthToPx(value: string): number | undefined {
  const trimmed = value.trim().toLowerCase();
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (pxMatch) return boundedNumber(pxMatch[1], 0, 2000);
  const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const rem = Number.parseFloat(remMatch[1]);
    return Number.isFinite(rem) ? boundedNumber(rem * 16, 0, 2000) : undefined;
  }
  return undefined;
}

/**
 * Derive bounded design DNA from public CSS when a browser harvest is unavailable.
 * Only records roles with direct evidence; never invents radii or motifs.
 */
function extractStaticDesignDna(
  html: string,
  css: string,
  semanticRoles: StaticSemanticColorRoles,
  paletteConfidence: IntelligenceConfidence,
  fonts: Pick<BrandProfile, "displayFontFamily" | "bodyFontFamily">
): BrandDesignDNA | undefined {
  const source = css.trim() || html;
  if (!source.trim()) return undefined;
  const variables = new Map(
    [...source.matchAll(/--([a-z0-9_-]+)\s*:\s*([^;}{]+)/gi)].map((match) => [
      match[1].toLowerCase(),
      match[2].trim()
    ])
  );
  const resolveValue = (value: string | undefined, seen = new Set<string>()): string | undefined => {
    if (!value) return undefined;
    const reference = value.match(/var\(\s*--([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
    if (!reference) return value.trim();
    if (seen.has(reference)) return undefined;
    return resolveValue(variables.get(reference), new Set([...seen, reference]));
  };
  const declaration = (body: string, property: string): string | undefined =>
    resolveValue(body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;}{]+)`, "i"))?.[1]);
  const declarationColor = (body: string, property: string): string | undefined =>
    cssColorLiterals(declaration(body, property) ?? "")
      .map(normalizeCssColor)
      .find((color): color is string => Boolean(color));

  const buttonRule = [...source.matchAll(
    /([^{}]{0,220}(?:\.button|\[class\*="button"\]|\[data-appearance=["']primary["']\]|btn[-_]?primary|primary[-_]?button|cta[-_]?button)[^{}]{0,180})\{([^{}]{0,1200})\}/gi
  )][0];
  const buttonBody = buttonRule?.[2] ?? "";
  const radiusLiteral = buttonBody.match(/border-radius\s*:\s*([^;}{]+)/i)?.[1];
  let radiusPx = cssLengthToPx(resolveValue(radiusLiteral) ?? "");
  if (radiusPx === undefined) {
    const radiusToken = [...source.matchAll(/--([a-z0-9_-]*radius[a-z0-9_-]*)\s*:\s*([^;}{]+)/gi)]
      .map((match) => ({
        name: match[1].toLowerCase(),
        px: cssLengthToPx(match[2].trim())
      }))
      .find((entry) =>
        entry.px !== undefined &&
        entry.px >= 4 &&
        entry.px <= 24 &&
        /(button|btn|control|2$|sm|md|moderate)/.test(entry.name)
      );
    radiusPx = radiusToken?.px;
  }

  const heightMatch = buttonBody.match(/(?:^|;)\s*(?:min-)?height\s*:\s*([^;}{]+)/i)?.[1];
  const heightPx = cssLengthToPx(resolveValue(heightMatch) ?? "");
  const borderWidthMatch = buttonBody.match(/border(?:-width)?\s*:\s*([^;}{]+)/i)?.[1];
  const borderWidthPx = borderWidthMatch
    ? cssLengthToPx(resolveValue(borderWidthMatch)?.split(/\s+/)[0] ?? "")
    : undefined;
  const buttonBackground = declarationColor(buttonBody, "background(?:-color)?");
  const buttonText = declarationColor(buttonBody, "color");
  const buttonBorder = declarationColor(buttonBody, "border(?:-color)?");

  const cardRule = [...source.matchAll(
    /([^{}]{0,160}(?:\.card|\[class\*="card"\])[^{}]{0,120})\{([^{}]{0,800})\}/gi
  )][0];
  const cardBody = cardRule?.[2] ?? "";
  const cardRadius = cssLengthToPx(resolveValue(
    cardBody.match(/border-radius\s*:\s*([^;}{]+)/i)?.[1]
  ) ?? "");
  const cardBorderWidth = cssLengthToPx(resolveValue(
    cardBody.match(/border(?:-width)?\s*:\s*([^;}{]+)/i)?.[1]
  )?.split(/\s+/)[0] ?? "");
  const cardShadowValue = declaration(cardBody, "box-shadow");
  const cardShadowExtent = Math.max(
    0,
    ...(cardShadowValue?.match(/-?\d+(?:\.\d+)?px/gi) ?? [])
      .map((value) => Math.abs(Number.parseFloat(value)))
  );
  const cardShadow: NonNullable<BrandDesignDNA["cards"]>["shadow"] | undefined =
    cardShadowValue === "none"
      ? "none"
      : cardShadowValue
        ? cardShadowExtent >= 48 ? "strong" : "soft"
        : undefined;

  const headingWeight = boundedNumber(
    source.match(/(?:^|[,\s{])h1\s*\{[^}]*font-weight\s*:\s*(\d{3})/i)?.[1],
    300,
    900
  );
  const bodyWeight = boundedNumber(
    source.match(/(?:^|[,\s{])(?:body|p)\s*\{[^}]*font-weight\s*:\s*(\d{3})/i)?.[1],
    300,
    800
  );
  const displayFamily = fonts.displayFontFamily ?? fonts.bodyFontFamily;
  const fontFallback = displayFamily
    ? /serif/i.test(displayFamily) && !/sans/i.test(displayFamily)
      ? "serif" as const
      : "sans" as const
    : undefined;
  const headingRule = source.match(/(?:^|[,\s{])h1\s*\{([^}]*)\}/i)?.[1] ?? "";
  const headingLetterSpacingValue = declaration(headingRule, "letter-spacing");
  const headingLetterSpacingEm = headingLetterSpacingValue?.endsWith("em")
    ? boundedNumber(headingLetterSpacingValue.slice(0, -2), -0.1, 0.12)
    : undefined;
  const headingLineHeightValue = declaration(headingRule, "line-height");
  const headingLineHeight = headingLineHeightValue && /^\d+(?:\.\d+)?$/.test(headingLineHeightValue)
    ? boundedNumber(headingLineHeightValue, 0.85, 1.45)
    : undefined;

  const heroBlock = [...source.matchAll(
    /([^{}]{0,160}(?:\.[a-z0-9_-]*hero[a-z0-9_-]*|\[class\*="hero"\]|\.masthead)[^{}]{0,120})\{([^{}]{0,1000})\}/gi
  )][0]?.[2] ?? "";
  const heroBackgroundValue = declaration(heroBlock, "background(?:-color)?");
  const heroBackground = cssColorLiterals(heroBackgroundValue ?? "")
    .map(normalizeCssColor)
    .find((color): color is string => Boolean(color));
  const hero = heroBackground
    ? luminance(heroBackground) < 0.22 ? "dark" as const : "light" as const
    : undefined;
  const motif: NonNullable<BrandDesignDNA["theme"]>["motif"] | undefined =
    /radial-gradient/i.test(heroBlock) ? "radial-glow"
      : /repeating-linear-gradient|background-size\s*:\s*\d/i.test(heroBlock) ? "technical-grid"
        : /linear-gradient/i.test(heroBlock) ? "soft-gradient"
          : undefined;
  const layoutRule = [...source.matchAll(
    /([^{}]{0,180}(?:nav|navbar|header|hero|masthead|container|layout)[^{}]{0,160})\{([^{}]{0,1000})\}/gi
  )].map((match) => match[2]);
  const contentMaxWidthPx = layoutRule
    .map((body) => cssLengthToPx(resolveValue(
      body.match(/max-width\s*:\s*([^;}{]+)/i)?.[1]
    ) ?? ""))
    .filter((value): value is number => value !== undefined && value >= 960 && value <= 1800)
    .sort((left, right) => right - left)[0];
  const heroPadding = declaration(heroBlock, "padding");
  const sectionBlockPx = cssLengthToPx(heroPadding?.split(/\s+/)[0] ?? "");
  const gridGapPx = layoutRule
    .map((body) => cssLengthToPx(resolveValue(body.match(/(?:^|;)\s*gap\s*:\s*([^;}{]+)/i)?.[1]) ?? ""))
    .find((value): value is number => value !== undefined && value >= 4 && value <= 64);

  const hasButtons = Boolean(
    buttonRule &&
    (buttonBackground || buttonText || buttonBorder || radiusPx !== undefined ||
      heightPx !== undefined || borderWidthPx !== undefined)
  );
  const hasCards = Boolean(
    cardRule &&
    (cardRadius !== undefined || cardBorderWidth !== undefined || cardShadow)
  );
  const hasGeometry = hasButtons || hasCards ||
    contentMaxWidthPx !== undefined || sectionBlockPx !== undefined || gridGapPx !== undefined;
  const hasType = headingWeight !== undefined || bodyWeight !== undefined || fontFallback ||
    headingLetterSpacingEm !== undefined || headingLineHeight !== undefined;
  const colorRoles = Object.fromEntries(
    Object.entries(semanticRoles).filter(([key, value]) => key !== "surface" && Boolean(value))
  ) as NonNullable<BrandDesignDNA["colors"]>;
  const hasColorRoles = Object.keys(colorRoles).length > 0;
  const hasTheme = Boolean(hero && (heroBackground || motif));
  if (!hasGeometry && !hasType && !hasTheme && !hasColorRoles) return undefined;

  const evidenceGroups = [hasColorRoles, hasGeometry, hasType, hasTheme].filter(Boolean).length;
  const confidence: IntelligenceConfidence = paletteConfidence === "high" && evidenceGroups >= 3
    ? "high"
    : evidenceGroups >= 2
      ? "medium"
      : "low";

  return {
    version: 1,
    source: "legacy-presentation",
    confidence,
    ...(hasTheme ? { theme: { hero: hero!, ...(motif ? { motif } : {}) } } : {}),
    ...(hasColorRoles ? { colors: colorRoles } : {}),
    ...(hasType
      ? {
          typography: {
            ...(fontFallback ? { fallback: fontFallback } : {}),
            ...(headingWeight !== undefined ? { headingWeight } : {}),
            ...(bodyWeight !== undefined ? { bodyWeight } : {}),
            ...(headingLetterSpacingEm !== undefined ? { headingLetterSpacingEm } : {}),
            ...(headingLineHeight !== undefined ? { headingLineHeight } : {})
          }
        }
      : {}),
    ...(hasButtons
      ? {
          buttons: {
            ...(buttonBackground ? { primaryBackground: buttonBackground } : {}),
            ...(buttonText ? { primaryText: buttonText } : {}),
            ...(buttonBorder ? { secondaryBorder: buttonBorder } : {}),
            ...(radiusPx !== undefined ? { radiusPx } : {}),
            ...(heightPx !== undefined && heightPx >= 36 && heightPx <= 80 ? { heightPx } : {}),
            ...(borderWidthPx !== undefined ? { borderWidthPx } : {})
          }
        }
      : {}),
    ...(hasCards
      ? {
          cards: {
            ...(cardRadius !== undefined ? { radiusPx: cardRadius } : {}),
            ...(cardBorderWidth !== undefined ? { borderWidthPx: cardBorderWidth } : {}),
            ...(cardShadow ? { shadow: cardShadow } : {})
          }
        }
      : {}),
    ...(contentMaxWidthPx !== undefined || sectionBlockPx !== undefined || gridGapPx !== undefined
      ? {
          spacing: {
            ...(contentMaxWidthPx !== undefined ? { contentMaxWidthPx } : {}),
            ...(sectionBlockPx !== undefined && sectionBlockPx >= 52 && sectionBlockPx <= 160
              ? { sectionBlockPx }
              : {}),
            ...(gridGapPx !== undefined ? { gridGapPx } : {})
          }
        }
      : {})
  };
}

const navigationOnlyPublicTopic = /^(?:(?:explore|view|see|browse)\s+)?(?:(?:all|our|featured|latest)\s+)?(?:products?(?:\s+(?:and|&)\s+services?)?|services?|solutions?|resources?|support|partners?|customers?|customer stories|company|about(?:\s+us)?|contact(?:\s+us)?|news|events?|careers?|industries|use cases?|why\s+[\p{L}\p{N}.&'-]+|take your next steps?|quick links?|resources and legal)$/iu;

function extractPublicTopics(html: string): string[] {
  const topics = (html.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/gi) ?? [])
    .map(stripTags)
    .filter((topic) => topic.length >= 8 && topic.length <= 180)
    .filter((topic) => !navigationOnlyPublicTopic.test(topic.trim()));
  return topics
    .filter(
      (topic, index, values) =>
        values.findIndex((candidate) => candidate.toLocaleLowerCase() === topic.toLocaleLowerCase()) === index
    )
    .slice(0, 12);
}

function extractFontProfile(html: string, css: string): Pick<
  BrandProfile,
  "displayFontFamily" | "bodyFontFamily" | "displayFontUrl" | "bodyFontUrl"
> {
  const source = `${html}\n${css}`;
  const genericFamilies = new Set([
    "inherit",
    "initial",
    "block",
    "flex",
    "grid",
    "inline",
    "inline-block",
    "inline-flex",
    "inline-grid",
    "none",
    "normal",
    "serif",
    "sans-serif",
    "monospace",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "unset"
  ]);
  const cleanFamily = (value: string | undefined): string | undefined => {
    const first = value
      ?.split(",")[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, "")
      .trim();
    if (
      !first ||
      first.length > 80 ||
      genericFamilies.has(first.toLowerCase()) ||
      /^(?:#|rgba?\(|hsla?\(|url\(|calc\(|clamp\(|-?\d)/i.test(first) ||
      /(?:^|[-_ ])(?:icon|icons|symbol|glyph|material|fontawesome)(?:$|[-_ ])/i.test(first)
    ) return undefined;
    return first;
  };
  const rawFontVariables = new Map(
    [...source.matchAll(/--([a-z0-9_-]+)\s*:\s*([^;}{]+)/gi)].map((match) => [
      match[1].toLowerCase(),
      match[2].trim()
    ])
  );
  const resolveFontValue = (value: string | undefined, seen = new Set<string>()): string | undefined => {
    if (!value) return undefined;
    const reference = value.match(/var\(\s*--([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
    if (reference) {
      if (seen.has(reference)) return undefined;
      return resolveFontValue(rawFontVariables.get(reference), new Set([...seen, reference]));
    }
    return cleanFamily(value);
  };
  const fontFaces = [...css.matchAll(/@font-face\s*\{[\s\S]*?\}/gi)]
    .map((match) => {
      const block = match[0];
      const family = resolveFontValue(block.match(/font-family\s*:\s*([^;}{]+)/i)?.[1]);
      const url = block.match(/url\(\s*["']?([^"')]+\.(?:woff2?|ttf|otf)(?:\?[^"')]*)?)["']?\s*\)/i)?.[1];
      return family ? { family, url: url ? decodeHtml(url) : undefined } : null;
    })
    .filter((face): face is { family: string; url: string | undefined } => Boolean(face));

  const known = [
    "HubSpot Serif",
    "HubSpot Sans",
    "Instrument Sans",
    "Helvetica Now",
    "Adobe Clean",
    "Airbnb Cereal",
    "Roboto Slab",
    "Open Sans",
    "DM Sans",
    "Montserrat",
    "Poppins",
    "Circular",
    "Graphik",
    "Texta",
    "Sohne",
    "Futura",
    "Lato",
    "Roboto",
    "Inter"
  ];
  const found = known.filter((font) => {
    const pattern = font
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "[\\s_-]*");
    return new RegExp(`(?:^|["'(:,;\\s])${pattern}(?=$|["'),;\\s])`, "i").test(source);
  });

  const displayScores = new Map<string, number>();
  const bodyScores = new Map<string, number>();
  const addScore = (scores: Map<string, number>, family: string | undefined, score: number) => {
    if (family) scores.set(family, Math.max(score, scores.get(family) ?? Number.NEGATIVE_INFINITY));
  };
  for (const [name, value] of rawFontVariables) {
    if (!/font|type|heading|display|body|copy|text|sans|serif/i.test(name)) continue;
    const family = resolveFontValue(value);
    if (/display|heading|headline|title|serif/i.test(name)) addScore(displayScores, family, 95);
    if (/body|copy|text|base|sans/i.test(name)) addScore(bodyScores, family, 95);
  }
  for (const match of source.matchAll(/([^{}]{1,220})\{([^{}]{0,1800})\}/g)) {
    const selector = match[1].trim();
    if (/font-face/i.test(selector)) continue;
    const family = resolveFontValue(match[2].match(/font-family\s*:\s*([^;}{]+)/i)?.[1]);
    if (!family) continue;
    if (/\bh[1-3]\b|headline|heading|display|hero[-_ ]?(?:title|headline)/i.test(selector)) {
      addScore(displayScores, family, 120);
    }
    if (/\b(?:html|body|p)\b|body[-_ ]?(?:copy|text)|rich[-_ ]?text/i.test(selector)) {
      addScore(bodyScores, family, 120);
    }
  }
  for (const face of fontFaces) {
    addScore(displayScores, face.family, /display|serif|slab|headline|heading/i.test(face.family) ? 55 : 20);
    addScore(bodyScores, face.family, /sans|text|body|book|regular/i.test(face.family) ? 55 : 20);
  }
  for (const family of found) {
    addScore(
      displayScores,
      family,
      /Serif|Slab|Instrument|Helvetica Now|Adobe Clean|Airbnb Cereal|Texta|Sohne|Futura|Circular|Graphik|Montserrat|Poppins/.test(
        family
      ) ? 45 : 25
    );
    addScore(bodyScores, family, /Serif|Slab/.test(family) ? 20 : 40);
  }
  const best = (scores: Map<string, number>) =>
    [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const displayFontFamily = best(displayScores) ?? best(bodyScores);
  const bodyFontFamily = best(bodyScores) ?? displayFontFamily;

  const fontLinks = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => /font/i.test(attr(tag, "as") ?? "") || /preload/i.test(attr(tag, "rel") ?? ""))
    .map((tag) => attr(tag, "href"))
    .filter((href): href is string => Boolean(href));
  const linkedFontUrl = (family: string | undefined): string | undefined => {
    const key = entityKey(family ?? "");
    return key ? fontLinks.find((url) => entityKey(url).includes(key)) : undefined;
  };
  const cssFontUrl = (family: string | undefined) =>
    fontFaces.find((face) => entityKey(face.family) === entityKey(family ?? ""))?.url;
  const displayFontUrl = linkedFontUrl(displayFontFamily) ??
    fontLinks.find((url) => /slab|display|instrument/i.test(url)) ??
    cssFontUrl(displayFontFamily);
  const bodyFontUrl = linkedFontUrl(bodyFontFamily) ??
    fontLinks.find((url) => url !== displayFontUrl && /roboto|inter|sans|font/i.test(url)) ??
    cssFontUrl(bodyFontFamily);
  return {
    displayFontFamily,
    bodyFontFamily,
    displayFontUrl,
    bodyFontUrl
  };
}

function stylesheetUrls(html: string, base: URL): string[] {
  return (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => /stylesheet/i.test(attr(tag, "rel") ?? ""))
    .map((tag) => absoluteHttpsUrl(attr(tag, "href"), base))
    .filter((url): url is string => Boolean(url))
    .filter((url, index, values) => values.indexOf(url) === index)
    .filter(
      (url) =>
        !/(?:\/plugins?\/|\/vendor\/|bootstrap|fontawesome|translatepress|recaptcha|swiper|slick|owl[-_.]|cookie|gravityforms|hubspot)/i.test(
          new URL(url).pathname
        )
    )
    .sort((a, b) => {
      const score = (url: string) =>
        (/app|main|global|base|theme|home|clientlib-react(?:[.-]|$)/i.test(url) ? 50 : 0) -
        (/resources\/fonts?|fonts?(?:[./_-]|$)|language|locale/i.test(url) ? 80 : 0);
      return score(b) - score(a);
    })
    .slice(0, 5);
}

async function fetchPublicText(startUrl: URL, signal?: AbortSignal): Promise<{ text: string; finalUrl: URL }> {
  const response = await fetchPinnedPublicText(startUrl, {
    signal,
    maxBytes: 1_000_000,
    maxRedirects: 3,
    timeoutMs: 12_000
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`The company site returned ${response.status}.`);
  }
  return { text: response.text, finalUrl: response.finalUrl };
}

function retryablePublicFetchFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /returned (?:403|408|425|429|5\d\d)|timed out|ECONNRESET|socket hang up/i.test(message);
}

async function fetchPublicTextWithRetry(
  startUrl: URL,
  signal?: AbortSignal
): Promise<{ text: string; finalUrl: URL; attempts: number }> {
  const maxAttempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { ...(await fetchPublicText(startUrl, signal)), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !retryablePublicFetchFailure(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError;
}

export function extractFastBrandProfile(input: {
  domain: string;
  html: string;
  css?: string;
  finalUrl?: URL;
}): BrandProfile {
  const finalUrl = input.finalUrl ?? new URL(`https://${input.domain}`);
  const submittedDomain = normalizeDomain(input.domain);
  const canonicalDomain = normalizeDomain(finalUrl.hostname);
  const title = stripTags(input.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const ogSiteName = extractMeta(input.html, "og:site_name");
  const description = extractMeta(input.html, "description") ?? extractMeta(input.html, "og:description");
  const companyName = canonicalCompanyName(
    resolvePublicCompanyName({
      domain: input.domain,
      html: input.html,
      ogSiteName: stripTags(ogSiteName ?? ""),
      title
    }),
    input.domain
  );
  const logoDecision = extractLogo(input.html, finalUrl, companyName);
  const logoUrl = logoDecision.logoUrl;
  const imageUrls = extractImageUrls(input.html, input.css ?? "", finalUrl, logoUrl);
  const topics = extractPublicTopics(input.html);
  const cleanDescription = description ? stripTags(description).slice(0, 500) : undefined;
  const publicContext = [cleanDescription, ...topics].filter(Boolean).join(" ").slice(0, 2400) || undefined;
  const {
    diagnostics: paletteDiagnostics,
    semanticRoles,
    ...palette
  } = extractPalette(
    input.html,
    input.css ?? ""
  );
  const fonts = extractFontProfile(input.html, input.css ?? "");
  const fontBase = finalUrl;
  const designDna = extractStaticDesignDna(
    input.html,
    input.css ?? "",
    semanticRoles,
    paletteDiagnostics.confidence,
    fonts
  );
  const profile: BrandProfile = {
    domain: submittedDomain,
    canonicalDomain,
    domainAliases: canonicalDomain !== submittedDomain ? [canonicalDomain] : [],
    companyName,
    title: title || undefined,
    description: cleanDescription,
    publicContext,
    publicTopics: topics,
    logoUrl,
    logoSourceUrl: logoUrl,
    portableLogo: logoDecision.portableLogo,
    imageUrls,
    ...palette,
    ...fonts,
    displayFontUrl: absoluteHttpsUrl(fonts.displayFontUrl, fontBase),
    bodyFontUrl: absoluteHttpsUrl(fonts.bodyFontUrl, fontBase),
    sourceUrl: finalUrl.toString(),
    source: "fast-extractor",
    ...(designDna ? { designDna } : {}),
    diagnostics: {
      logo: logoDecision.receipt,
      palette: paletteDiagnostics
    }
  };
  logoCandidatesByProfile.set(profile, logoDecision.candidates);
  return profile;
}

function strings(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function records(value: unknown, limit: number): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(recordOf).filter((item): item is Record<string, unknown> => Boolean(item)).slice(0, limit)
    : [];
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number
): number | undefined {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? Math.round(parsed * 1000) / 1000
    : undefined;
}

function styleColor(style: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = style?.[key];
  return typeof value === "string" ? normalizeCssColor(value) : undefined;
}

function px(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  if (typeof value === "string" && !/^-?\d+(?:\.\d+)?px$/i.test(text)) return undefined;
  return boundedNumber(text.replace(/px$/i, ""), minimum, maximum);
}

function confidence(value: unknown, fallback: IntelligenceConfidence): IntelligenceConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : fallback;
}

function normalizeDirectDesignDna(value: unknown): BrandDesignDNA | undefined {
  const raw = recordOf(value);
  if (!raw) return undefined;
  const rawTheme = recordOf(raw.theme);
  const rawColors = recordOf(raw.colors);
  const rawTypography = recordOf(raw.typography);
  const rawButtons = recordOf(raw.buttons);
  const rawCards = recordOf(raw.cards);
  const rawSpacing = recordOf(raw.spacing);
  const hero = rawTheme?.hero === "dark" || rawTheme?.hero === "light" ? rawTheme.hero : undefined;
  const motif = ["none", "soft-gradient", "radial-glow", "technical-grid"].includes(String(rawTheme?.motif))
    ? rawTheme?.motif as NonNullable<BrandDesignDNA["theme"]>["motif"]
    : undefined;
  const shadow = ["none", "soft", "strong"].includes(String(rawCards?.shadow))
    ? rawCards?.shadow as NonNullable<BrandDesignDNA["cards"]>["shadow"]
    : undefined;
  const fallback = rawTypography?.fallback === "sans" || rawTypography?.fallback === "serif"
    ? rawTypography.fallback
    : undefined;
  const normalized: BrandDesignDNA = {
    version: 1,
    source: "remote-harvester",
    confidence: confidence(raw.confidence, "medium"),
    ...(hero || motif ? { theme: { hero: hero ?? "light", ...(motif ? { motif } : {}) } } : {}),
    colors: {
      darkSurface: typeof rawColors?.darkSurface === "string" ? normalizeCssColor(rawColors.darkSurface) : undefined,
      softSurface: typeof rawColors?.softSurface === "string" ? normalizeCssColor(rawColors.softSurface) : undefined,
      supportingAccent: typeof rawColors?.supportingAccent === "string" ? normalizeCssColor(rawColors.supportingAccent) : undefined,
      lightSurfaceAccent: typeof rawColors?.lightSurfaceAccent === "string" ? normalizeCssColor(rawColors.lightSurfaceAccent) : undefined,
      lightText: typeof rawColors?.lightText === "string" ? normalizeCssColor(rawColors.lightText) : undefined,
      mutedText: typeof rawColors?.mutedText === "string" ? normalizeCssColor(rawColors.mutedText) : undefined,
      divider: typeof rawColors?.divider === "string" ? normalizeCssColor(rawColors.divider) : undefined,
      focus: typeof rawColors?.focus === "string" ? normalizeCssColor(rawColors.focus) : undefined
    },
    typography: {
      fallback,
      headingWeight: boundedNumber(rawTypography?.headingWeight, 300, 900),
      bodyWeight: boundedNumber(rawTypography?.bodyWeight, 300, 800),
      headingLetterSpacingEm: boundedNumber(rawTypography?.headingLetterSpacingEm, -0.1, 0.12),
      headingLineHeight: boundedNumber(rawTypography?.headingLineHeight, 0.85, 1.45)
    },
    buttons: {
      primaryBackground: typeof rawButtons?.primaryBackground === "string" ? normalizeCssColor(rawButtons.primaryBackground) : undefined,
      primaryText: typeof rawButtons?.primaryText === "string" ? normalizeCssColor(rawButtons.primaryText) : undefined,
      primaryHover: typeof rawButtons?.primaryHover === "string" ? normalizeCssColor(rawButtons.primaryHover) : undefined,
      primaryActive: typeof rawButtons?.primaryActive === "string" ? normalizeCssColor(rawButtons.primaryActive) : undefined,
      secondaryBorder: typeof rawButtons?.secondaryBorder === "string" ? normalizeCssColor(rawButtons.secondaryBorder) : undefined,
      secondaryText: typeof rawButtons?.secondaryText === "string" ? normalizeCssColor(rawButtons.secondaryText) : undefined,
      radiusPx: boundedNumber(rawButtons?.radiusPx, 0, 999),
      heightPx: boundedNumber(rawButtons?.heightPx, 36, 80),
      borderWidthPx: boundedNumber(rawButtons?.borderWidthPx, 0, 4)
    },
    cards: {
      radiusPx: boundedNumber(rawCards?.radiusPx, 0, 64),
      borderWidthPx: boundedNumber(rawCards?.borderWidthPx, 0, 4),
      shadow
    },
    spacing: {
      contentMaxWidthPx: boundedNumber(rawSpacing?.contentMaxWidthPx, 960, 1800),
      sectionBlockPx: boundedNumber(rawSpacing?.sectionBlockPx, 52, 160),
      gridGapPx: boundedNumber(rawSpacing?.gridGapPx, 4, 64)
    }
  };
  const meaningful = JSON.stringify(normalized).match(/#[0-9A-F]{6}|\b(?:dark|light|sans|serif|gradient|grid|glow|soft|strong)\b|\d+(?:\.\d+)?/g)?.length ?? 0;
  return meaningful > 2 ? normalized : undefined;
}

function designDnaFromLegacyPresentation(value: unknown): BrandDesignDNA | undefined {
  const raw = recordOf(value);
  if (!raw) return undefined;
  return normalizeDirectDesignDna({
    confidence: "high",
    theme: { hero: raw.heroTheme },
    colors: {
      darkSurface: raw.darkSurfaceColor,
      softSurface: raw.softSurfaceColor,
      supportingAccent: raw.supportingAccentColor,
      lightSurfaceAccent: raw.lightSurfaceAccentColor,
      lightText: raw.lightTextColor,
      mutedText: raw.mutedTextColor,
      divider: raw.dividerColor,
      focus: raw.focusColor
    },
    typography: { fallback: raw.fontFallback },
    buttons: {
      primaryBackground: raw.primaryButtonBackground,
      primaryText: raw.primaryButtonText,
      primaryHover: raw.primaryButtonHover,
      primaryActive: raw.primaryButtonActive,
      secondaryBorder: raw.secondaryButtonBorder,
      secondaryText: raw.secondaryButtonText,
      radiusPx: raw.buttonRadiusPx,
      heightPx: raw.buttonHeightPx,
      borderWidthPx: raw.buttonBorderWidthPx
    },
    cards: { radiusPx: raw.cardRadiusPx }
  });
}

function designDnaFromBrainPool(
  value: unknown,
  palette: { primary: string; accent: string; surface: string }
): BrandDesignDNA | undefined {
  const pool = recordOf(value);
  const components = recordOf(pool?.component_pool);
  const visual = recordOf(pool?.visual_tokens);
  if (!pool || !components) return undefined;

  const variant = records(components.button_variants, 12).find((item) => {
    const style = recordOf(item.style);
    return Boolean(styleColor(style, "backgroundColor") || px(style?.borderRadius, 0, 999));
  });
  const buttonStyle = recordOf(variant?.style);
  const button = records(components.buttons, 60).find((item) => {
    const rect = recordOf(item.rect);
    const width = boundedNumber(rect?.width, 64, 800);
    const height = boundedNumber(rect?.height, 36, 80);
    return Boolean(width && height && String(item.text ?? "").trim().length > 1);
  });
  const buttonRect = recordOf(button?.rect);

  const card = records(components.cards, 60).find((item) => {
    const rect = recordOf(item.rect);
    return Boolean(boundedNumber(rect?.width, 180, 1800) && boundedNumber(rect?.height, 100, 1400));
  });
  const cardStyle = recordOf(card?.style);
  const rawShadow = typeof cardStyle?.boxShadow === "string" ? cardStyle.boxShadow.trim() : "";
  const shadowExtent = Math.max(
    0,
    ...(rawShadow.match(/-?\d+(?:\.\d+)?px/gi) ?? []).map((value) => Math.abs(Number.parseFloat(value)))
  );
  const cardShadow: NonNullable<BrandDesignDNA["cards"]>["shadow"] | undefined = !rawShadow || rawShadow === "none"
    ? rawShadow === "none" ? "none" : undefined
    : shadowExtent >= 64 ? "strong" : "soft";

  const typography = records(components.typography, 220);
  const heading = typography.find((item) => /^h[1-3]$/i.test(String(item.tag ?? "")));
  const body = typography.find((item) => /^(?:body|p)$/i.test(String(item.tag ?? "")));
  const headingStyle = recordOf(heading?.style);
  const bodyStyle = recordOf(body?.style);
  const headingSize = px(headingStyle?.fontSize, 10, 200);
  const headingTrackingPx = px(headingStyle?.letterSpacing, -20, 20);
  const headingLineHeightPx = px(headingStyle?.lineHeight, 8, 240);
  const fontRoles = recordOf(visual?.font_roles);
  const displayRole = recordOf(fontRoles?.display);
  const displayFamily = String(displayRole?.fontFamily ?? headingStyle?.fontFamily ?? "");

  const layouts = records(components.layout_candidates, 140);
  const sections = records(components.sections, 50);
  const contentWidth = layouts
    .map((item) => boundedNumber(recordOf(item.rect)?.width, 960, 1800))
    .filter((item): item is number => Boolean(item))
    .sort((a, b) => b - a)[0];
  const sectionStyle = sections.map((item) => recordOf(item.style)).find(Boolean);
  const sectionBlock = typeof sectionStyle?.padding === "string"
    ? px(sectionStyle.padding.trim().split(/\s+/)[0], 52, 160)
    : undefined;
  const gridGap = layouts
    .map((item) => px(recordOf(item.style)?.gap, 4, 64))
    .find((item): item is number => item !== undefined);

  const motifEvidence = JSON.stringify({
    backgrounds: records(recordOf(pool.asset_pool)?.background_images, 12),
    pseudos: records(recordOf(pool.asset_pool)?.pseudo_elements, 12)
  }).toLowerCase();
  const motif: NonNullable<BrandDesignDNA["theme"]>["motif"] | undefined = motifEvidence.includes("radial-gradient")
    ? "radial-glow"
    : motifEvidence.includes("linear-gradient") && /background-size|repeat/.test(motifEvidence)
      ? "technical-grid"
      : motifEvidence.includes("linear-gradient")
        ? "soft-gradient"
        : undefined;

  const primaryBackground = styleColor(buttonStyle, "backgroundColor");
  const primaryText = styleColor(buttonStyle, "color");
  const borderColor = styleColor(buttonStyle, "borderColor");
  const hero = luminance(palette.primary) < 0.22 ? "dark" as const : "light" as const;
  const darkSurface = [palette.primary, ...strings(visual?.colors, 12).map((color) => normalizeCssColor(color) ?? "")]
    .filter((color): color is string => Boolean(color))
    .find((color) => luminance(color) < 0.22);
  const extractedGroups = [variant, card, heading, contentWidth, motif].filter(Boolean).length;
  if (extractedGroups === 0) return undefined;
  return {
    version: 1,
    source: "remote-harvester",
    confidence: extractedGroups >= 4 ? "high" : extractedGroups >= 2 ? "medium" : "low",
    theme: { hero, ...(motif ? { motif } : {}) },
    colors: {
      ...(darkSurface ? { darkSurface } : {}),
      lightText: styleColor(bodyStyle, "color") ?? styleColor(headingStyle, "color"),
      lightSurfaceAccent: palette.accent,
      focus: borderColor ?? palette.accent
    },
    typography: {
      fallback: /serif/i.test(displayFamily) && !/sans-serif/i.test(displayFamily) ? "serif" : "sans",
      headingWeight: boundedNumber(headingStyle?.fontWeight, 300, 900),
      bodyWeight: boundedNumber(bodyStyle?.fontWeight, 300, 800),
      headingLetterSpacingEm: headingSize && headingTrackingPx !== undefined
        ? boundedNumber(headingTrackingPx / headingSize, -0.1, 0.12)
        : undefined,
      headingLineHeight: headingSize && headingLineHeightPx
        ? boundedNumber(headingLineHeightPx / headingSize, 0.85, 1.45)
        : undefined
    },
    buttons: {
      primaryBackground,
      primaryText,
      secondaryBorder: borderColor,
      secondaryText: styleColor(buttonStyle, "color"),
      radiusPx: px(buttonStyle?.borderRadius, 0, 999),
      heightPx: boundedNumber(buttonRect?.height, 36, 80),
      borderWidthPx: px(buttonStyle?.borderWidth, 0, 4)
    },
    cards: {
      radiusPx: px(cardStyle?.borderRadius, 0, 64),
      borderWidthPx: px(cardStyle?.borderWidth, 0, 4),
      shadow: cardShadow
    },
    spacing: {
      contentMaxWidthPx: contentWidth,
      sectionBlockPx: sectionBlock,
      gridGapPx: gridGap
    }
  };
}

function firstPixelToken(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim().split(/\s+/).find((part) => /^-?\d+(?:\.\d+)?px$/i.test(part));
  return token ? px(token, minimum, maximum) : undefined;
}

function designDnaFromServiceContract(
  value: unknown,
  readiness: NonNullable<NonNullable<BrandProfile["diagnostics"]>["designFidelity"]> | undefined
): BrandDesignDNA | undefined {
  const raw = recordOf(value);
  if (!raw || raw.schemaVersion !== "brand-design-dna.v1") return undefined;
  const palette = recordOf(raw.palette);
  const roles = recordOf(palette?.roles);
  const typography = recordOf(raw.typography);
  const typeRoles = recordOf(typography?.roles);
  const displayStyle = recordOf(recordOf(typeRoles?.display)?.style ?? typeRoles?.display);
  const bodyStyle = recordOf(recordOf(typeRoles?.body)?.style ?? typeRoles?.body);
  const components = recordOf(raw.components);
  const buttons = records(components?.buttons, 8);
  const button = buttons.find((item) => item.kind === "primary") ?? buttons[0];
  const buttonStyle = recordOf(button?.style);
  const buttonRect = recordOf(button?.rect);
  const card = records(components?.cards, 12)[0];
  const cardStyle = recordOf(card?.style);
  const layouts = records(components?.layouts, 16);
  const layoutStyle = recordOf(layouts[0]?.style);
  const contentWidth = layouts
    .map((item) => boundedNumber(recordOf(item.rect)?.width, 960, 1800))
    .filter((item): item is number => item !== undefined)
    .sort((left, right) => right - left)[0];
  const motif = records(components?.motifs, 12).find((item) =>
    ["radial-gradient", "linear-gradient"].includes(String(item.pattern))
  );
  const motifPattern = typeof motif?.pattern === "string" ? motif.pattern : undefined;
  const surface = typeof roles?.surface === "string" ? normalizeCssColor(roles.surface) : undefined;
  const text = typeof roles?.text === "string" ? normalizeCssColor(roles.text) : undefined;
  const accent = typeof roles?.accent === "string" ? normalizeCssColor(roles.accent) : undefined;
  const support = typeof roles?.support === "string" ? normalizeCssColor(roles.support) : undefined;
  const displaySize = px(displayStyle?.fontSize, 10, 200);
  const displayTracking = px(displayStyle?.letterSpacing, -20, 20);
  const displayLineHeight = px(displayStyle?.lineHeight, 8, 240);
  const displayFamily = String(displayStyle?.fontFamily ?? "");
  const rawShadow = typeof cardStyle?.boxShadow === "string" ? cardStyle.boxShadow.trim() : "";
  const shadowExtent = Math.max(
    0,
    ...(rawShadow.match(/-?\d+(?:\.\d+)?px/gi) ?? []).map((token) => Math.abs(Number.parseFloat(token)))
  );
  const shadow: NonNullable<BrandDesignDNA["cards"]>["shadow"] | undefined = !rawShadow
    ? undefined
    : rawShadow === "none"
      ? "none"
      : shadowExtent >= 48
        ? "strong"
        : "soft";
  const fidelityScore = readiness?.score ?? 0;
  const extractedGroups = [roles, displayStyle, button, card, contentWidth].filter(Boolean).length;
  if (extractedGroups < 2) return undefined;
  return {
    version: 1,
    source: "remote-harvester",
    confidence: readiness?.designReady && fidelityScore >= 85
      ? "high"
      : fidelityScore >= 65
        ? "medium"
        : "low",
    theme: {
      hero: surface && luminance(surface) < 0.3 ? "dark" : "light",
      ...(motifPattern === "radial-gradient"
        ? { motif: "radial-glow" as const }
        : motifPattern === "linear-gradient"
          ? { motif: "soft-gradient" as const }
          : {})
    },
    colors: {
      ...(text && luminance(text) < 0.3 ? { darkSurface: text } : {}),
      ...(surface ? { softSurface: surface } : {}),
      ...(support ? { supportingAccent: support } : {}),
      ...(accent ? { lightSurfaceAccent: accent, focus: accent } : {}),
      ...(text ? { lightText: text } : {})
    },
    typography: {
      fallback: /serif/i.test(displayFamily) && !/sans-serif/i.test(displayFamily) ? "serif" : "sans",
      headingWeight: boundedNumber(displayStyle?.fontWeight, 300, 900),
      bodyWeight: boundedNumber(bodyStyle?.fontWeight, 300, 800),
      headingLetterSpacingEm: displaySize && displayTracking !== undefined
        ? boundedNumber(displayTracking / displaySize, -0.1, 0.12)
        : undefined,
      headingLineHeight: displaySize && displayLineHeight
        ? boundedNumber(displayLineHeight / displaySize, 0.85, 1.45)
        : undefined
    },
    buttons: {
      primaryBackground: styleColor(buttonStyle, "backgroundColor") ?? accent,
      primaryText: styleColor(buttonStyle, "color"),
      secondaryBorder: styleColor(buttonStyle, "borderColor"),
      secondaryText: styleColor(buttonStyle, "color"),
      radiusPx: px(buttonStyle?.borderRadius, 0, 999),
      heightPx: boundedNumber(buttonRect?.height, 36, 80),
      borderWidthPx: px(buttonStyle?.borderWidth, 0, 4)
    },
    cards: {
      radiusPx: px(cardStyle?.borderRadius, 0, 64),
      borderWidthPx: px(cardStyle?.borderWidth, 0, 4),
      shadow
    },
    spacing: {
      contentMaxWidthPx: contentWidth,
      sectionBlockPx: firstPixelToken(layoutStyle?.padding, 52, 160),
      gridGapPx: px(layoutStyle?.gap, 4, 64)
    }
  };
}

function designFidelityFromRemoteReceipt(
  value: unknown
): NonNullable<NonNullable<BrandProfile["diagnostics"]>["designFidelity"]> | undefined {
  const receipt = recordOf(value);
  const readiness = recordOf(receipt?.readiness);
  if (!readiness) return undefined;
  const evidence = recordOf(readiness.evidence);
  const score = boundedNumber(readiness.score, 0, 100);
  if (score === undefined || typeof readiness.designReady !== "boolean") return undefined;
  const harvestRequestId = typeof receipt?.requestId === "string" && /^[a-f0-9-]{16,64}$/i.test(receipt.requestId)
    ? receipt.requestId
    : undefined;
  return {
    designReady: readiness.designReady,
    score,
    missing: strings(readiness.missing, 12)
      .filter((item) => /^[a-z0-9_-]{1,64}$/i.test(item)),
    ...(harvestRequestId ? { harvestRequestId } : {}),
    desktopRendered: typeof evidence?.desktopRendered === "boolean" ? evidence.desktopRendered : undefined,
    mobileRendered: typeof evidence?.mobileRendered === "boolean" ? evidence.mobileRendered : undefined,
    screenshotEvidenceCount: boundedNumber(evidence?.screenshotEvidenceCount, 0, 2),
    buttonVariantCount: boundedNumber(evidence?.buttonVariantCount, 0, 50),
    layoutCandidateCount: boundedNumber(evidence?.layoutCandidateCount, 0, 100)
  };
}

function imageMetadataFromRemoteRecord(
  record: Record<string, unknown>
): BrandProfile["imageMetadata"] | undefined {
  const raw = recordOf(record.designDna ?? record.designDNA);
  const images = records(recordOf(raw?.assets)?.images, 12);
  if (!images.length) return undefined;
  const metadata: Record<string, BrandImageMetadata> = {};
  for (const item of images) {
    const url = typeof item.url === "string" ? item.url.trim() : undefined;
    if (!url) continue;
    const width = boundedNumber(item.width, 96, 10_000);
    const height = boundedNumber(item.height, 96, 10_000);
    const contentHash =
      typeof item.contentHash === "string" && item.contentHash.trim()
        ? item.contentHash.trim().toLowerCase()
        : typeof item.sha256 === "string" && /^[a-f0-9]{64}$/i.test(item.sha256)
          ? item.sha256.toLowerCase()
          : undefined;
    metadata[url] = {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(contentHash ? { contentHash } : {})
    };
  }
  return Object.keys(metadata).length ? metadata : undefined;
}

export function normalizeRemoteBrandProfile(value: unknown, domain: string): BrandProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const profile = (record.profile && typeof record.profile === "object" ? record.profile : record) as Record<string, unknown>;
  const pool = recordOf(record.structured_brain_pool) ?? recordOf(profile.structured_brain_pool);
  const visual = recordOf(pool?.visual_tokens);
  const identity = recordOf(pool?.identity);
  const colors = (strings(profile.colors, 8).length ? strings(profile.colors, 8) : strings(visual?.colors, 8))
    .map((color) => normalizeCssColor(color))
    .filter((color): color is string => Boolean(color));
  const logoUrl = typeof profile.logoUrl === "string" ? profile.logoUrl : undefined;
  const hasDistinctRemotePalette = colors.length >= 3 &&
    !(
      colors[0] === "#1C293F" &&
      colors[1] === "#5B5BFF" &&
      colors[2] === "#FFFFFF"
    );
  const primaryColor = typeof profile.primaryColor === "string" ? normalizeCssColor(profile.primaryColor) ?? "#1C293F" : colors[0] ?? "#1C293F";
  const accentColor = typeof profile.accentColor === "string" ? normalizeCssColor(profile.accentColor) ?? "#5B5BFF" : colors[1] ?? "#5B5BFF";
  const surfaceColor = typeof profile.surfaceColor === "string" ? normalizeCssColor(profile.surfaceColor) ?? "#FFFFFF" : colors.find((color) => luminance(color) > 0.86) ?? "#FFFFFF";
  const serviceDesignDna = record.designDna ?? record.designDNA;
  const designFidelity = designFidelityFromRemoteReceipt(record.receipt);
  const designDna = normalizeDirectDesignDna(serviceDesignDna ?? profile.designDna ?? profile.designDNA)
    ?? designDnaFromServiceContract(serviceDesignDna, designFidelity)
    ?? designDnaFromLegacyPresentation(profile.presentation)
    ?? designDnaFromBrainPool(pool, { primary: primaryColor, accent: accentColor, surface: surfaceColor });
  const imageMetadata = imageMetadataFromRemoteRecord(record);
  return {
    domain,
    companyName: typeof profile.companyName === "string"
      ? profile.companyName
      : typeof identity?.name === "string"
        ? identity.name
        : titleCaseDomain(domain),
    title: typeof profile.title === "string" ? profile.title : undefined,
    description: typeof profile.description === "string" ? profile.description.slice(0, 500) : undefined,
    publicContext: typeof profile.publicContext === "string" ? profile.publicContext.slice(0, 2400) : undefined,
    publicTopics: strings(profile.publicTopics, 12),
    logoUrl,
    logoSourceUrl: logoUrl,
    imageUrls: strings(profile.imageUrls, 6),
    ...(imageMetadata ? { imageMetadata } : {}),
    colors,
    primaryColor,
    accentColor,
    surfaceColor,
    displayFontFamily: typeof profile.displayFontFamily === "string" ? profile.displayFontFamily : undefined,
    bodyFontFamily: typeof profile.bodyFontFamily === "string" ? profile.bodyFontFamily : undefined,
    displayFontUrl: typeof profile.displayFontUrl === "string" ? profile.displayFontUrl : undefined,
    bodyFontUrl: typeof profile.bodyFontUrl === "string" ? profile.bodyFontUrl : undefined,
    sourceUrl: typeof profile.sourceUrl === "string" ? profile.sourceUrl : `https://${domain}`,
    source: "brand-harvester",
    ...(designDna ? { designDna } : {}),
    diagnostics: {
      logo: {
        strategy: typeof profile.logoUrl === "string" ? "remote-profile" : "none",
        imageCandidateCount: 0,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0
      },
      palette: {
        strategy: "remote-profile",
        confidence: hasDistinctRemotePalette ? "medium" : "low",
        candidateCount: colors.length,
        semanticCandidateCount: hasDistinctRemotePalette ? colors.length : 0,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0
      },
      ...(designFidelity ? { designFidelity } : {})
    }
  };
}

function mergeVerifiedDesign(
  profile: BrandProfile,
  verified: PresentedBrandProfile | undefined
): BrandProfile {
  if (!verified) return profile;
  const presentation = brandPresentationFor(verified);
  const designDna = brandDesignDNAFor(verified);
  const useVerifiedLogo = !profile.portableLogo && !profile.logoUrl && Boolean(verified.logoUrl);
  const logoUrl = useVerifiedLogo ? verified.logoUrl : profile.logoUrl;
  return {
    ...profile,
    companyName: verified.companyName,
    logoUrl,
    logoSourceUrl: logoUrl ?? profile.logoSourceUrl,
    portableLogo: useVerifiedLogo ? undefined : profile.portableLogo,
    imageUrls: [...new Set([...verified.imageUrls, ...profile.imageUrls])].slice(0, 6),
    colors: [...verified.colors],
    primaryColor: verified.primaryColor,
    accentColor: verified.accentColor,
    surfaceColor: verified.surfaceColor,
    displayFontFamily: verified.displayFontFamily ?? profile.displayFontFamily,
    bodyFontFamily: verified.bodyFontFamily ?? profile.bodyFontFamily,
    displayFontUrl: verified.displayFontUrl ?? profile.displayFontUrl,
    bodyFontUrl: verified.bodyFontUrl ?? profile.bodyFontUrl,
    sourceUrl: profile.sourceUrl || verified.sourceUrl,
    source: "brand-harvester",
    ...(designDna ? { designDna: structuredClone(designDna) } : {}),
    diagnostics: {
      ...profile.diagnostics,
      logo: useVerifiedLogo
        ? {
            strategy: "verified-profile",
            imageCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
            rejectedImageCount: profile.diagnostics?.logo.rejectedImageCount ?? 0,
            inlineSvgCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
            selectedSource: "verified-profile",
            resolutionComplete: true
          }
        : profile.diagnostics?.logo ?? {
            strategy: "none",
            imageCandidateCount: 0,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          },
      palette: {
        strategy: "verified-profile",
        confidence: "high",
        candidateCount: verified.colors.length,
        semanticCandidateCount: verified.colors.length,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    },
    ...(presentation ? { presentation: { ...presentation } } : {})
  } as PresentedBrandProfile;
}

const brandProfileCache = new Map<string, { expiresAt: number; profile: BrandProfile }>();
const BRAND_PROFILE_CACHE_MS = 15 * 60 * 1000;
const BRAND_PROFILE_CACHE_MAX = 100;

function cachedBrandProfile(domain: string): BrandProfile | undefined {
  if (process.env.NODE_ENV === "test") return undefined;
  const entry = brandProfileCache.get(domain);
  if (!entry || entry.expiresAt <= Date.now()) {
    brandProfileCache.delete(domain);
    return undefined;
  }
  return structuredClone(entry.profile);
}

function cacheBrandProfile(domain: string, profile: BrandProfile): BrandProfile {
  const logoDomain = profile.canonicalDomain ?? domain;
  const completed = withBrandReadiness({
    ...profile,
    logoSourceUrl: isBrandfetchLogoApiUrl(profile.logoUrl, logoDomain)
      ? undefined
      : profile.logoSourceUrl ?? profile.logoUrl,
    diagnostics: {
      ...profile.diagnostics,
      logo: {
        strategy: profile.diagnostics?.logo.strategy ?? (profile.logoUrl ? "remote-profile" : "none"),
        imageCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
        rejectedImageCount: profile.diagnostics?.logo.rejectedImageCount ?? 0,
        inlineSvgCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
        selectedScore: profile.diagnostics?.logo.selectedScore,
        selectedSource: profile.diagnostics?.logo.selectedSource,
        validationAttempted: profile.diagnostics?.logo.validationAttempted,
        validationRejected: profile.diagnostics?.logo.validationRejected,
        resolutionComplete: true
      },
      palette: profile.diagnostics?.palette
        ? { ...profile.diagnostics.palette, resolutionComplete: true }
        : {
            strategy: "fallback",
            confidence: "low",
            candidateCount: profile.colors.length,
            semanticCandidateCount: 0,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0,
            resolutionComplete: true
          }
    }
  });
  if (process.env.NODE_ENV !== "test") {
    if (brandProfileCache.size >= BRAND_PROFILE_CACHE_MAX) {
      const oldest = brandProfileCache.keys().next().value as string | undefined;
      if (oldest) brandProfileCache.delete(oldest);
    }
    brandProfileCache.set(domain, {
      expiresAt: Date.now() + BRAND_PROFILE_CACHE_MS,
      profile: structuredClone(completed)
    });
  }
  return completed;
}

interface BrandfetchColor {
  hex: string;
  type?: string;
}

interface BrandfetchResult {
  canonicalDomain: string;
  companyName?: string;
  description?: string;
  publicContext?: string;
  publicTopics: string[];
  colors: BrandfetchColor[];
  logoUrl?: string;
  logoUrlOnDark?: string;
  displayFontFamily?: string;
  bodyFontFamily?: string;
  imageUrls: string[];
  qualityTier: "high" | "medium" | "low" | "unknown";
  claimed?: boolean;
  logoCandidateCount: number;
  logoValidationAttempted: number;
  logoValidationRejected: number;
  fontCount: number;
  industryCount: number;
}

type BrandfetchBrandApiStatus =
  | "succeeded"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "invalid_response"
  | "failed";

interface BrandfetchLookup {
  result?: BrandfetchResult;
  status: BrandfetchBrandApiStatus;
}

async function validatedPortableRemoteLogo(
  bytes: Uint8Array,
  source: "official-remote-asset" | "brandfetch"
): Promise<NonNullable<BrandProfile["portableLogo"]> | undefined> {
  const portable = portableBrandLogoFromBytes(bytes, source);
  if (!portable) return undefined;
  if (portable.mediaType === "image/svg+xml") return portable;
  try {
    const metadata = await sharp(Buffer.from(bytes), {
      failOn: "warning",
      limitInputPixels: 16_000_000
    }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (
      width < 8 ||
      height < 8 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 16_000_000
    ) return undefined;
    return portable;
  } catch {
    return undefined;
  }
}

function brandfetchHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      (url.hostname === "brandfetch.io" || url.hostname.endsWith(".brandfetch.io"))
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function brandfetchLogoFormats(payload: Record<string, unknown>): Array<{
  src: string;
  theme: string;
  score: number;
}> {
  const logos = Array.isArray(payload.logos) ? payload.logos : [];
  return logos
    .filter((logo): logo is Record<string, unknown> => Boolean(logo && typeof logo === "object"))
    .flatMap((logo) => {
      const logoType = typeof logo.type === "string" ? logo.type.toLowerCase() : "";
      const theme = typeof logo.theme === "string" ? logo.theme.toLowerCase() : "";
      const typeScore = logoType === "logo" ? 200 : logoType === "symbol" ? 80 : 10;
      const formats = Array.isArray(logo.formats) ? logo.formats : [];
      return formats
        .filter((format): format is Record<string, unknown> => Boolean(format && typeof format === "object"))
        .map((format) => ({
          src: brandfetchHttpsUrl(format.src) ?? "",
          theme,
          score:
            typeScore +
            (format.format === "svg" ? 40 : format.format === "webp" ? 30 : format.format === "png" ? 25 : 10) +
            (theme === "light" || theme === "dark" ? 5 : 0) +
            (typeof format.width === "number" && typeof format.height === "number" && format.height > 0
              ? Math.min(20, format.width / format.height > 1.5 ? 20 : 5)
              : 0)
        }));
    })
    .filter(({ src }) => Boolean(src))
    .sort((a, b) => b.score - a.score)
    .filter((candidate, index, values) => values.findIndex(({ src }) => src === candidate.src) === index)
    .slice(0, 6);
}

function brandfetchImageUrls(payload: Record<string, unknown>): string[] {
  const images = Array.isArray(payload.images) ? payload.images : [];
  return images
    .filter((image): image is Record<string, unknown> => Boolean(image && typeof image === "object"))
    .flatMap((image) => {
      const imageType = typeof image.type === "string" ? image.type.toLowerCase() : "";
      const formats = Array.isArray(image.formats) ? image.formats : [];
      return formats
        .filter((format): format is Record<string, unknown> => Boolean(format && typeof format === "object"))
        .map((format) => ({
          src: brandfetchHttpsUrl(format.src),
          score:
            (imageType === "banner" ? 40 : imageType === "background" ? 30 : 10) +
            (format.format === "webp" ? 20 : format.format === "png" ? 15 : format.format === "jpeg" || format.format === "jpg" ? 10 : 0) +
            (typeof format.width === "number" && format.width >= 800 ? 10 : 0)
        }));
    })
    .filter((candidate): candidate is { src: string; score: number } => Boolean(candidate.src))
    .sort((left, right) => right.score - left.score)
    .map(({ src }) => src)
    .filter((src, index, values) => values.indexOf(src) === index)
    .slice(0, 4);
}

function boundedBrandfetchText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = stripTags(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maximum) : undefined;
}

function brandfetchQualityTier(value: unknown): BrandfetchResult["qualityTier"] {
  return typeof value !== "number" || !Number.isFinite(value)
    ? "unknown"
    : value >= 2 / 3
      ? "high"
      : value >= 1 / 3
        ? "medium"
        : "low";
}

function brandfetchFonts(payload: Record<string, unknown>): {
  displayFontFamily?: string;
  bodyFontFamily?: string;
  count: number;
} {
  const fonts = (Array.isArray(payload.fonts) ? payload.fonts : [])
    .filter((font): font is Record<string, unknown> => Boolean(font && typeof font === "object"))
    .map((font) => ({
      name: boundedBrandfetchText(font.name, 80),
      type: typeof font.type === "string" ? font.type.toLowerCase() : ""
    }))
    .filter((font): font is { name: string; type: string } => Boolean(font.name))
    .slice(0, 8);
  return {
    displayFontFamily: fonts.find((font) => font.type === "title")?.name ?? fonts[0]?.name,
    bodyFontFamily: fonts.find((font) => font.type === "body")?.name ?? fonts[1]?.name ?? fonts[0]?.name,
    count: fonts.length
  };
}

async function fetchBrandfetchBrand(
  domain: string,
  signal?: AbortSignal
): Promise<BrandfetchLookup> {
  const token = process.env.BRANDFETCH_API_KEY;
  if (!token || !hasBrandfetchBrandApi) return { status: "failed" };
  try {
    // The authenticated request is fixed to Brandfetch's API and stays
    // server-side. The response contributes only bounded brand metadata;
    // logos are delivered through Brandfetch's required browser hotlink.
    const response = await fetch(
      `https://api.brandfetch.io/v2/brands/domain/${encodeURIComponent(domain)}?allowNsfw=false`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000)
      }
    );
    if (!response.ok) {
      const status: BrandfetchBrandApiStatus =
        response.status === 401 || response.status === 403
          ? "unauthorized"
          : response.status === 404
            ? "not_found"
            : response.status === 429
              ? "rate_limited"
              : "failed";
      logServerError(new Error(`Brandfetch returned HTTP ${response.status}.`), {
        operation: "brandfetch_brand_lookup",
        code: "brandfetch_upstream_failed",
        status: response.status,
        details: { domain }
      });
      return { status };
    }
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      throw new Error("Brandfetch response exceeded the allowed size.");
    }
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      throw new Error("Brandfetch response was not JSON.");
    }
    const rawPayload = await readBoundedResponseText(response, 1_000_000);
    const parsed = JSON.parse(rawPayload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Brandfetch response did not contain a brand object.");
    }
    const payload = parsed as Record<string, unknown>;
    const requestedDomain = normalizeDomain(domain);
    const returnedDomain = typeof payload.domain === "string"
      ? normalizeDomain(payload.domain)
      : undefined;
    if (!returnedDomain) {
      logServerError(new Error("Brandfetch returned a different domain."), {
        operation: "brandfetch_brand_lookup",
        code: "brandfetch_domain_mismatch",
        details: { domain }
      });
      return { status: "invalid_response" };
    }
    if (returnedDomain !== requestedDomain) {
      // Regional hosts are sometimes canonicalized to their registrable parent
      // by Brandfetch. Treat that as an exact-host miss so the caller can retry
      // the parent deliberately, without polluting error telemetry. Unrelated
      // domain mismatches remain a hard provider-contract failure.
      if (sharesRegistrableCompanyDomain(returnedDomain, requestedDomain)) {
        return { status: "not_found" };
      }
      logServerError(new Error("Brandfetch returned a different domain."), {
        operation: "brandfetch_brand_lookup",
        code: "brandfetch_domain_mismatch",
        details: { domain }
      });
      return { status: "invalid_response" };
    }
    if (payload.isNsfw === true) {
      logServerError(new Error("Brandfetch marked the brand as unsafe."), {
        operation: "brandfetch_brand_lookup",
        code: "brandfetch_unsafe_brand",
        details: { domain }
      });
      return { status: "invalid_response" };
    }
    const colors = (Array.isArray(payload.colors) ? payload.colors : [])
      .filter((color): color is Record<string, unknown> => Boolean(color && typeof color === "object"))
      .map((color): BrandfetchColor | undefined => {
        const hex = normalizeHex(typeof color.hex === "string" ? color.hex : "");
        return hex
          ? {
              hex,
              type: typeof color.type === "string" ? color.type.toLowerCase() : undefined
            }
          : undefined;
      })
      .filter((color): color is BrandfetchColor => Boolean(color))
      .filter((color, index, values) => values.findIndex((candidate) => candidate.hex === color.hex) === index)
      .slice(0, 8);
    const logoFormats = brandfetchLogoFormats(payload);
    const lightSurfaceLogo = logoFormats.find((format) => format.theme === "dark")?.src
      ?? logoFormats[0]?.src;
    const darkSurfaceLogo = logoFormats.find((format) => format.theme === "light")?.src
      ?? lightSurfaceLogo;
    const company = payload.company && typeof payload.company === "object"
      ? payload.company as Record<string, unknown>
      : undefined;
    const industries = (Array.isArray(company?.industries) ? company.industries : [])
      .filter((industry): industry is Record<string, unknown> => Boolean(industry && typeof industry === "object"))
      .map((industry) => boundedBrandfetchText(industry.name, 80))
      .filter((name): name is string => Boolean(name))
      .filter((name, index, values) => values.indexOf(name) === index)
      .slice(0, 6);
    const location = company?.location && typeof company.location === "object"
      ? company.location as Record<string, unknown>
      : undefined;
    const locationParts = [location?.city, location?.region, location?.country]
      .map((value) => boundedBrandfetchText(value, 80))
      .filter((value): value is string => Boolean(value));
    const description = boundedBrandfetchText(payload.description, 500) ??
      boundedBrandfetchText(payload.longDescription, 500);
    const contextParts = [
      description,
      industries.length ? `Industries: ${industries.join(", ")}.` : undefined,
      typeof company?.foundedYear === "number" ? `Founded in ${company.foundedYear}.` : undefined,
      typeof company?.employees === "number" ? `${company.employees} employees.` : undefined,
      locationParts.length ? `Location: ${locationParts.join(", ")}.` : undefined
    ].filter((value): value is string => Boolean(value));
    const fonts = brandfetchFonts(payload);
    return {
      status: "succeeded",
      result: {
        canonicalDomain: returnedDomain,
        companyName: boundedBrandfetchText(payload.name, 120),
        description,
        publicContext: contextParts.join(" ").slice(0, 1600) || undefined,
        publicTopics: industries,
        colors,
        logoUrl: lightSurfaceLogo,
        logoUrlOnDark: darkSurfaceLogo,
        displayFontFamily: fonts.displayFontFamily,
        bodyFontFamily: fonts.bodyFontFamily,
        imageUrls: brandfetchImageUrls(payload),
        qualityTier: brandfetchQualityTier(payload.qualityScore),
        claimed: typeof payload.claimed === "boolean" ? payload.claimed : undefined,
        logoCandidateCount: logoFormats.length,
        logoValidationAttempted: 0,
        logoValidationRejected: 0,
        fontCount: fonts.count,
        industryCount: industries.length
      }
    };
  } catch (error) {
    logServerError(error, {
      operation: "brandfetch_brand_lookup",
      code: "brandfetch_lookup_failed",
      details: { domain }
    });
    return { status: error instanceof SyntaxError ? "invalid_response" : "failed" };
  }
}

async function fetchBrandfetchSearchDomain(
  query: string,
  allowedDomains: Array<string | undefined>,
  signal?: AbortSignal
): Promise<string | undefined> {
  const clientId = process.env.BRANDFETCH_CLIENT_ID?.trim();
  if (!hasBrandfetchLogoApi || !clientId) return undefined;
  const allowed = new Set(
    allowedDomains
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => normalizeDomain(value))
  );
  if (!allowed.size) return undefined;
  try {
    const url = new URL(
      `https://api.brandfetch.io/v2/search/${encodeURIComponent(query.slice(0, 120))}`
    );
    url.searchParams.set("c", clientId);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000)
    });
    if (!response.ok) return undefined;
    const parsed = JSON.parse(await readBoundedResponseText(response, 250_000)) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const matches = parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        domain: typeof item.domain === "string" ? normalizeDomain(item.domain) : "",
        name: boundedBrandfetchText(item.name, 120) ?? "",
        claimed: item.claimed === true
      }))
      .filter((item) => Boolean(item.domain));
    const allowedMatches = matches.filter((item) => allowed.has(item.domain));
    if (allowedMatches.length) {
      return allowedMatches.find((item) => item.claimed)?.domain ?? allowedMatches[0]?.domain;
    }
    const identityKey = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const queryKey = identityKey(query.includes(".") ? query.split(".")[0] ?? query : query);
    const lexicalMatches = matches.filter((item) => {
      const domainKey = identityKey(item.domain.split(".")[0] ?? item.domain);
      return identityKey(item.name) === queryKey || domainKey === queryKey;
    });
    // Brand Search is allowed to establish a canonical alias only when there
    // is one exact lexical identity match. Fuzzy or multi-entity results must
    // be confirmed by a person instead of silently selecting the first hit.
    return lexicalMatches.length === 1 ? lexicalMatches[0]?.domain : undefined;
  } catch (error) {
    logServerError(error, {
      operation: "brandfetch_search_lookup",
      code: "brandfetch_search_failed",
      details: { queryKind: query.includes(".") ? "domain" : "company_name" }
    });
    return undefined;
  }
}

async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("Brandfetch response exceeded the allowed size.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

const brandfetchRequests = new Map<string, Promise<BrandfetchLookup>>();

function fetchBrandfetchBrandSingleflight(
  domain: string,
  signal?: AbortSignal
): Promise<BrandfetchLookup> {
  const normalized = normalizeDomain(domain);
  const existing = brandfetchRequests.get(normalized);
  if (existing) return existing;
  const request = fetchBrandfetchBrand(normalized, signal).finally(() => {
    if (brandfetchRequests.get(normalized) === request) brandfetchRequests.delete(normalized);
  });
  brandfetchRequests.set(normalized, request);
  return request;
}

function profileWithBrandfetchEnrichment(
  domain: string,
  profile: BrandProfile | undefined,
  result: BrandfetchResult
): BrandProfile {
  const base = profile ?? fallbackBrand(domain);
  const currentPalette = base.diagnostics?.palette;
  const colorValues = result.colors.map((color) => color.hex);
  const brandfetchSurface = result.colors.find((color) => color.type === "light")?.hex ??
    colorValues.find((color) => luminance(color) > 0.88);
  const brandfetchPrimary = result.colors.find((color) => color.type === "dark")?.hex ??
    [...colorValues]
      .filter((color) => color !== brandfetchSurface)
      .sort((left, right) => luminance(left) - luminance(right))[0];
  const brandfetchAccent = result.colors.find((color) => color.type === "accent")?.hex ??
    [...colorValues]
      .filter((color) => color !== brandfetchSurface && color !== brandfetchPrimary)
      .sort((left, right) => saturation(right) - saturation(left))[0];
  const brandfetchPaletteReady = Boolean(
    brandfetchSurface &&
      brandfetchPrimary &&
      brandfetchAccent &&
      luminance(brandfetchPrimary) < 0.55 &&
      saturation(brandfetchAccent) > 0.2
  );
  const useBrandfetchPalette = brandfetchPaletteReady && Boolean(
    !profile ||
      !currentPalette ||
      currentPalette.strategy === "fallback" ||
      currentPalette.confidence === "low" ||
      base.colors.length < 3
  );
  const colors = useBrandfetchPalette
    ? [brandfetchPrimary, brandfetchAccent, brandfetchSurface, ...colorValues]
        .filter((color): color is string => Boolean(color))
        .filter((color, index, values) => values.indexOf(color) === index)
        .slice(0, 8)
    : base.colors;
  const currentLogoStrategy = base.diagnostics?.logo.strategy ?? "none";
  const useBrandfetchLogo = Boolean(
    result.logoUrl
      && !base.portableLogo
      && ["none", "favicon", "inline-svg-unportable"].includes(currentLogoStrategy)
  );
  return {
    ...base,
    canonicalDomain: result.canonicalDomain,
    domainAliases: [...new Set([
      ...(base.domainAliases ?? []),
      result.canonicalDomain
    ].filter((alias) => alias !== normalizeDomain(domain)))],
    companyName: profile && profile.source !== "fallback"
      ? profile.companyName
      : result.companyName ?? base.companyName,
    description: profile?.description ?? result.description ?? base.description,
    publicContext: profile?.publicContext ?? result.publicContext ?? base.publicContext,
    publicTopics: [...new Set([...base.publicTopics, ...result.publicTopics])].slice(0, 12),
    logoUrl: useBrandfetchLogo ? result.logoUrl : base.logoUrl,
    logoUrlOnDark: useBrandfetchLogo ? result.logoUrlOnDark : base.logoUrlOnDark,
    logoSourceUrl: useBrandfetchLogo ? undefined : base.logoSourceUrl,
    imageUrls: [...new Set([...base.imageUrls, ...result.imageUrls])].slice(0, 6),
    colors,
    primaryColor: useBrandfetchPalette ? brandfetchPrimary ?? colors[0] ?? base.primaryColor : base.primaryColor,
    accentColor: useBrandfetchPalette ? brandfetchAccent ?? colors[1] ?? base.accentColor : base.accentColor,
    surfaceColor: useBrandfetchPalette ? brandfetchSurface ?? base.surfaceColor : base.surfaceColor,
    displayFontFamily: base.displayFontFamily ?? result.displayFontFamily,
    bodyFontFamily: base.bodyFontFamily ?? result.bodyFontFamily,
    source: "brand-harvester",
    diagnostics: {
      ...base.diagnostics,
      logo: useBrandfetchLogo
        ? {
            strategy: "brandfetch-brand-api",
            imageCandidateCount: result.logoCandidateCount,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0,
            selectedScore: 100,
            selectedSource: "brandfetch",
            validationAttempted: 0,
            validationRejected: 0,
            resolutionComplete: true
          }
        : base.diagnostics?.logo ?? {
          strategy: "none",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0
        },
      palette: useBrandfetchPalette
        ? {
            strategy: "brandfetch",
            confidence: "high",
            candidateCount: colorValues.length,
            semanticCandidateCount: colorValues.length,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          }
        : profile?.diagnostics?.palette ?? {
            strategy: "brandfetch",
            confidence: colorValues.length >= 3 ? "high" : colorValues.length >= 2 ? "medium" : "low",
            candidateCount: colorValues.length,
            semanticCandidateCount: colorValues.length,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          },
      brandfetch: {
        qualityTier: result.qualityTier,
        claimed: result.claimed,
        logoCandidateCount: result.logoCandidateCount,
        logoValidationAttempted: result.logoValidationAttempted,
        logoValidationRejected: result.logoValidationRejected,
        colorCount: colorValues.length,
        fontCount: result.fontCount,
        imageCount: result.imageUrls.length,
        industryCount: result.industryCount
      }
    }
  };
}

function profileWithBrandfetchLogoApi(domain: string, profile: BrandProfile): BrandProfile {
  if (profile.portableLogo || isBrandfetchHostedLogoUrl(profile.logoUrl)) return profile;
  const logoDomain = profile.canonicalDomain ?? domain;
  const logoUrl = brandfetchLogoApiUrl(logoDomain, process.env.BRANDFETCH_CLIENT_ID, "dark");
  const logoUrlOnDark = brandfetchLogoApiUrl(logoDomain, process.env.BRANDFETCH_CLIENT_ID, "light");
  if (!hasBrandfetchLogoApi || !logoUrl || !logoUrlOnDark) return profile;
  const receipt = profile.diagnostics?.logo;
  return {
    ...profile,
    logoUrl,
    logoUrlOnDark,
    logoSourceUrl: undefined,
    diagnostics: {
      ...profile.diagnostics,
      logo: {
        strategy: "brandfetch-logo-api",
        imageCandidateCount: receipt?.imageCandidateCount ?? 0,
        rejectedImageCount: receipt?.rejectedImageCount ?? 0,
        inlineSvgCandidateCount: receipt?.inlineSvgCandidateCount ?? 0,
        selectedScore: 100,
        selectedSource: "brandfetch",
        validationAttempted: receipt?.validationAttempted ?? 0,
        validationRejected: receipt?.validationRejected ?? 0,
        resolutionComplete: true
      }
    }
  };
}

function evidenceConfidenceScore(value: "high" | "medium" | "low" | undefined): number {
  return value === "high" ? 3 : value === "medium" ? 2 : value === "low" ? 1 : 0;
}

function logoEvidenceScore(profile: BrandProfile): number {
  if (profile.portableLogo) return 6;
  switch (profile.diagnostics?.logo.strategy) {
    case "verified-profile":
      return 5;
    case "semantic-image":
      return (profile.diagnostics?.logo.selectedScore ?? 0) >= 75 ? 4 : 2;
    case "remote-profile":
      return 3;
    case "favicon":
      return 1;
    default:
      return profile.logoUrl ? 2 : 0;
  }
}

function mergePublicBrandEvidence(
  candidate: BrandProfile,
  extracted: BrandProfile,
  verified: PresentedBrandProfile | undefined
): BrandProfile {
  const useExtractedLogo = logoEvidenceScore(extracted) > logoEvidenceScore(candidate);
  const useExtractedPalette =
    evidenceConfidenceScore(extracted.diagnostics?.palette?.confidence) >=
      evidenceConfidenceScore(candidate.diagnostics?.palette?.confidence) &&
    extracted.diagnostics?.palette?.strategy !== "fallback";
  const merged = {
    ...candidate,
    companyName: extracted.companyName || candidate.companyName,
    title: extracted.title ?? candidate.title,
    description: extracted.description ?? candidate.description,
    publicContext: extracted.publicContext ?? candidate.publicContext,
    publicTopics: extracted.publicTopics.length
      ? extracted.publicTopics
      : candidate.publicTopics,
    logoUrl: useExtractedLogo ? extracted.logoUrl : candidate.logoUrl,
    logoSourceUrl: useExtractedLogo
      ? extracted.logoSourceUrl
      : candidate.logoSourceUrl,
    portableLogo: useExtractedLogo
      ? extracted.portableLogo
      : candidate.portableLogo,
    imageUrls: [...new Set([...extracted.imageUrls, ...candidate.imageUrls])].slice(0, 6),
    colors: useExtractedPalette ? extracted.colors : candidate.colors,
    primaryColor: useExtractedPalette ? extracted.primaryColor : candidate.primaryColor,
    accentColor: useExtractedPalette ? extracted.accentColor : candidate.accentColor,
    surfaceColor: useExtractedPalette ? extracted.surfaceColor : candidate.surfaceColor,
    displayFontFamily: extracted.displayFontFamily ?? candidate.displayFontFamily,
    bodyFontFamily: extracted.bodyFontFamily ?? candidate.bodyFontFamily,
    displayFontUrl: extracted.displayFontUrl ?? candidate.displayFontUrl,
    bodyFontUrl: extracted.bodyFontUrl ?? candidate.bodyFontUrl,
    sourceUrl: extracted.sourceUrl,
    diagnostics: {
      ...candidate.diagnostics,
      logo: useExtractedLogo
        ? extracted.diagnostics!.logo
        : candidate.diagnostics!.logo,
      palette: useExtractedPalette
        ? extracted.diagnostics?.palette
        : candidate.diagnostics?.palette,
      stylesheetAttempted: extracted.diagnostics?.stylesheetAttempted,
      stylesheetSucceeded: extracted.diagnostics?.stylesheetSucceeded
    }
  } satisfies BrandProfile;
  return mergeVerifiedDesign(merged, verified);
}

interface CachedPortableLogo {
  expiresAt: number;
  portableLogo: NonNullable<BrandProfile["portableLogo"]>;
}

const portableLogoCache = new Map<string, CachedPortableLogo>();
const portableLogoInFlight = new Map<
  string,
  Promise<NonNullable<BrandProfile["portableLogo"]> | undefined>
>();
const PORTABLE_LOGO_CACHE_MS = 15 * 60 * 1000;
const PORTABLE_LOGO_CACHE_MAX = 100;

async function validatedOfficialLogoFor(
  source: string,
  signal?: AbortSignal
): Promise<NonNullable<BrandProfile["portableLogo"]> | undefined> {
  const cached = portableLogoCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.portableLogo;
  if (cached) portableLogoCache.delete(source);
  const existing = portableLogoInFlight.get(source);
  if (existing) return existing;
  const request = (async () => {
    try {
      const asset = await fetchPinnedPublicBytes(source, {
        timeoutMs: 5_000,
        maxBytes: 350_000,
        maxRedirects: 2,
        signal,
        headers: {
          Accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/avif,image/gif;q=0.8,*/*;q=0.1"
        }
      });
      if (asset.status !== 200 || asset.truncated) return undefined;
      const portableLogo = await validatedPortableRemoteLogo(asset.bytes, "official-remote-asset");
      if (portableLogo) {
        if (portableLogoCache.size >= PORTABLE_LOGO_CACHE_MAX) {
          const oldest = portableLogoCache.keys().next().value as string | undefined;
          if (oldest) portableLogoCache.delete(oldest);
        }
        portableLogoCache.set(source, {
          expiresAt: Date.now() + PORTABLE_LOGO_CACHE_MS,
          portableLogo
        });
      }
      return portableLogo;
    } catch {
      return undefined;
    }
  })().finally(() => {
    if (portableLogoInFlight.get(source) === request) portableLogoInFlight.delete(source);
  });
  portableLogoInFlight.set(source, request);
  return request;
}

async function copyOfficialRemoteLogo(
  profile: BrandProfile,
  discovered: LogoCandidate[] = [],
  budget?: BrandBudget
): Promise<BrandProfile> {
  const receipt = profile.diagnostics?.logo;
  if (profile.portableLogo) {
    return {
      ...profile,
      diagnostics: {
        ...profile.diagnostics,
        logo: {
          strategy: receipt?.strategy ?? "inline-svg-portable",
          imageCandidateCount: receipt?.imageCandidateCount ?? 0,
          rejectedImageCount: receipt?.rejectedImageCount ?? 0,
          inlineSvgCandidateCount: receipt?.inlineSvgCandidateCount ?? 0,
          selectedScore: receipt?.selectedScore,
          selectedSource: receipt?.selectedSource,
          validationAttempted: receipt?.validationAttempted ?? 0,
          validationRejected: receipt?.validationRejected ?? 0,
          resolutionComplete: true
        }
      }
    };
  }
  if (isBrandfetchHostedLogoUrl(profile.logoUrl)) return profile;
  if (!profile.logoUrl || receipt?.strategy === "favicon") return profile;
  // Reviewed profiles have a compile-time, exact-domain delivery fallback.
  // Keep that emergency cache available even when the public origin blocks
  // server fetches; all non-reviewed candidates must prove their bytes here.
  if (receipt?.strategy === "verified-profile") return profile;

  const candidates = [
    ...discovered,
    {
      source: profile.logoUrl,
      score: receipt?.selectedScore ?? 50,
      sourceKind: receipt?.selectedSource ??
        (receipt?.strategy === "remote-profile" ? "remote-profile" : "semantic-image")
    } satisfies LogoCandidate
  ]
    .filter((candidate) => candidate.score >= 35)
    .sort((left, right) => right.score - left.score)
    .filter(
      (candidate, index, values) =>
        values.findIndex((other) => other.source === candidate.source) === index
    )
    .slice(0, 4);
  // Candidate validation used to be serial, which let four blocked assets add
  // twenty seconds to the first-preview path. Preserve score ordering while
  // validating the bounded candidate set concurrently.
  const validations = await Promise.all(candidates.map(async (candidate) => {
    const portableLogo = await validatedOfficialLogoFor(
      candidate.source,
      budget?.signalFor(5_000)
    );
    return portableLogo ? { candidate, portableLogo } : undefined;
  }));
  const attempted = validations.length;
  const rejected = validations.filter((result) => !result).length;
  const selected = validations.find((result) => result);
  if (selected) {
    return {
      ...profile,
      logoUrl: selected.candidate.source,
      logoSourceUrl: selected.candidate.source,
      portableLogo: selected.portableLogo,
      diagnostics: {
        ...profile.diagnostics,
        logo: {
          strategy: "official-remote-portable",
          imageCandidateCount: receipt?.imageCandidateCount ?? 0,
          rejectedImageCount: receipt?.rejectedImageCount ?? 0,
          inlineSvgCandidateCount: receipt?.inlineSvgCandidateCount ?? 0,
          selectedScore: selected.candidate.score,
          selectedSource: selected.candidate.sourceKind,
          validationAttempted: attempted,
          validationRejected: rejected,
          resolutionComplete: true
        }
      }
    };
  }

  return {
    ...profile,
    logoUrl: undefined,
    logoSourceUrl: undefined,
    diagnostics: {
      ...profile.diagnostics,
      logo: {
        strategy: "none",
        imageCandidateCount: receipt?.imageCandidateCount ?? 0,
        rejectedImageCount: (receipt?.rejectedImageCount ?? 0) + rejected,
        inlineSvgCandidateCount: receipt?.inlineSvgCandidateCount ?? 0,
        validationAttempted: attempted,
        validationRejected: rejected,
        resolutionComplete: true
      }
    }
  };
}

export async function harvestBrand(
  domain: string,
  sourceUrl?: string,
  approvedSourceDomains: readonly string[] = []
): Promise<BrandProfile> {
  const cached = sourceUrl ? undefined : cachedBrandProfile(domain);
  if (cached) return cached;
  const normalizedSourceUrl = sourceUrl
    ? normalizeOfficialBrandSourceUrl(domain, sourceUrl, approvedSourceDomains)
    : `https://${normalizeDomain(domain)}`;
  // This is the synchronous identity budget, not the overall buyer-experience
  // budget. Optional browser/mobile enrichment can continue separately; the
  // initial brand decision must leave time for a useful preview to render.
  const budget = createBrandBudget(15_000);
  const verified = verifiedBrandProfileFor(domain);
  let publicPageStatus: "succeeded" | "failed" = "failed";
  let publicPageAttempts = 0;
  let remoteBrowserStatus: "succeeded" | "failed" | "not_configured" =
    hasRemoteBrandHarvester && process.env.BRAND_HARVESTER_URL
      ? "failed"
      : "not_configured";
  let brandfetchBrandStatus:
    | BrandfetchBrandApiStatus
    | "not_configured"
    | "not_needed" =
    hasBrandfetchBrandApi ? "not_needed" : "not_configured";
  const brandfetchLogoStatus: "configured" | "not_configured" =
    hasBrandfetchLogoApi ? "configured" : "not_configured";
  const submittedBrandfetchDomain = normalizeDomain(domain);
  const parentBrandfetchDomain = registrableCompanyDomain(domain) || submittedBrandfetchDomain;
  const eagerBrandfetchPromise = config.brandfetchMode === "enrich" && hasBrandfetchBrandApi
    ? fetchBrandfetchBrandSingleflight(submittedBrandfetchDomain, budget.signalFor(8_000))
    : undefined;
  // Run the deterministic public-page pass alongside an optional browser
  // harvester. This keeps richer semantic color evidence inside the existing
  // experience-generation window instead of stacking two network budgets.
  const publicEvidencePromise = (async (): Promise<
    { profile: BrandProfile } | { error: unknown }
  > => {
    try {
      const { text: html, finalUrl, attempts } = await fetchPublicTextWithRetry(
        new URL(normalizedSourceUrl),
        budget.signalFor(8_500)
      );
      publicPageAttempts = attempts;
      const styles = await Promise.allSettled(
        stylesheetUrls(html, finalUrl).map(async (url) =>
          (await fetchPublicText(new URL(url), budget.signalFor(2_500))).text
        )
      );
      const css = styles
        .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
        .map((result) => result.value)
        .join("\n");
      const profile = extractFastBrandProfile({ domain, html, css, finalUrl });
      profile.diagnostics = {
        ...profile.diagnostics!,
        stylesheetAttempted: styles.length,
        stylesheetSucceeded: styles.filter((result) => result.status === "fulfilled").length
      };
      return { profile };
    } catch (error) {
      publicPageAttempts = retryablePublicFetchFailure(error) ? 2 : 1;
      return { error };
    }
  })();
  let publicCanonicalDomain: string | undefined;
  let candidate: BrandProfile | undefined;
  if (hasRemoteBrandHarvester && process.env.BRAND_HARVESTER_URL) {
    try {
      const response = await fetch(process.env.BRAND_HARVESTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.BRAND_HARVESTER_TOKEN ? { Authorization: `Bearer ${process.env.BRAND_HARVESTER_TOKEN}` } : {})
        },
        body: JSON.stringify({
          domain,
          sourceUrl: normalizedSourceUrl,
          capture: "progressive"
        }),
        // Browser evidence enriches the same first-preview budget as the
        // concurrent public-page and Brandfetch passes. It cannot consume the
        // complete 60-second promise by itself.
        signal: budget.signalFor(config.brandHarvesterTimeoutMs)
      });
      if (response.ok) {
        const normalized = normalizeRemoteBrandProfile(await response.json(), domain);
        if (normalized) {
          candidate = normalized;
          remoteBrowserStatus = "succeeded";
        }
        else {
          logServerError(new Error("Remote Brand Harvester returned an invalid profile."), {
            operation: "brand_harvest_remote",
            code: "brand_harvest_invalid_profile",
            details: { domain }
          });
        }
      } else {
        logServerError(new Error(`Remote Brand Harvester returned HTTP ${response.status}.`), {
          operation: "brand_harvest_remote",
          code: "brand_harvest_upstream_failed",
          status: response.status,
          details: { domain }
        });
      }
    } catch (error) {
      // A browser-backed remote harvester is preferred, but a temporary remote
      // failure must not discard a reviewed profile or the safe fast extractor.
      logServerError(error, {
        operation: "brand_harvest_remote",
        code: "brand_harvest_remote_error",
        details: { domain }
      });
    }
  }

  let publicFetchError: unknown;
  const publicEvidence = await publicEvidencePromise;
  if ("profile" in publicEvidence) {
    // Public HTML/CSS is useful even when a remote profile already supplied a
    // logo. It supplies source-owned semantic colors and prevents a generic
    // remote palette from overriding the same evidence used by ABM flows.
    publicPageStatus = "succeeded";
    publicCanonicalDomain = publicEvidence.profile.canonicalDomain;
    const extracted = await copyOfficialRemoteLogo(
      publicEvidence.profile,
      logoCandidatesByProfile.get(publicEvidence.profile) ?? [],
      budget
    );
    candidate = candidate
      ? mergePublicBrandEvidence(candidate, extracted, undefined)
      : extracted;
  } else {
    publicFetchError = publicEvidence.error;
    logServerError(publicEvidence.error, {
      operation: "brand_harvest_public_fallback",
      code: "brand_harvest_public_fetch_failed",
      details: {
        domain,
        remoteBrowserConfigured: hasRemoteBrandHarvester,
        brandfetchConfigured: hasBrandfetchBrandApi || hasBrandfetchLogoApi,
        verifiedFallbackAvailable: Boolean(verified)
      }
    });
  }

  if (candidate) candidate = await copyOfficialRemoteLogo(candidate, [], budget);
  const shouldFetchBrandData = hasBrandfetchBrandApi && (
    config.brandfetchMode === "enrich" ||
      !candidate ||
      candidate.diagnostics?.palette?.confidence === "low" ||
      candidate.colors.length < 3
  );
  if (shouldFetchBrandData) {
    let brandfetchLookup = await (
      eagerBrandfetchPromise ?? fetchBrandfetchBrandSingleflight(
        submittedBrandfetchDomain,
        budget.signalFor(8_000)
      )
    );
    // A first-party redirect is the only automatic alias authority. If the
    // submitted hostname redirects to a canonical host, retry Brandfetch with
    // that exact host rather than accepting an unrelated search result.
    if (!brandfetchLookup.result && !budget.exhausted()) {
      // Both alternatives have already been proven safe: the first-party
      // redirect supplies the canonical host and the registrable parent is a
      // bounded identity fallback. Query them concurrently so aliases do not
      // stack two eight-second waits onto the first-preview path.
      const alternatives = [...new Set([
        publicCanonicalDomain,
        parentBrandfetchDomain
      ].filter((candidateDomain): candidateDomain is string => Boolean(
        candidateDomain && candidateDomain !== submittedBrandfetchDomain
      )))];
      const lookups = await Promise.all(
        alternatives.map((candidateDomain) =>
          fetchBrandfetchBrandSingleflight(candidateDomain, budget.signalFor(8_000))
        )
      );
      const resolved = lookups.find((lookup) => lookup.result);
      brandfetchLookup = resolved ?? lookups[0] ?? brandfetchLookup;
    }
    if (!brandfetchLookup.result && !budget.exhausted()) {
      const searchedDomain = await fetchBrandfetchSearchDomain(
        candidate?.companyName ?? domain,
        [domain, parentBrandfetchDomain, publicCanonicalDomain],
        budget.signalFor(5_000)
      );
      if (searchedDomain && searchedDomain !== normalizeDomain(domain)) {
        brandfetchLookup = await fetchBrandfetchBrandSingleflight(
          searchedDomain,
          budget.signalFor(8_000)
        );
      }
    }
    brandfetchBrandStatus = brandfetchLookup.status;
    if (brandfetchLookup.result) {
      candidate = profileWithBrandfetchEnrichment(domain, candidate, brandfetchLookup.result);
    }
  }

  candidate ??= verified;
  if (!candidate && hasBrandfetchLogoApi) candidate = fallbackBrand(domain);
  if (candidate) {
    const mergedCandidate = mergeVerifiedDesign(candidate, verified);
    const resolvedCandidate = await copyOfficialRemoteLogo(mergedCandidate, [], budget);
    const usedVerifiedFallback = resolvedCandidate.diagnostics?.logo.strategy === "verified-profile";
    const logoApiCandidate = profileWithBrandfetchLogoApi(domain, resolvedCandidate);
    const finalLogoReceipt = logoApiCandidate.diagnostics?.logo ?? {
      strategy: logoApiCandidate.logoUrl ? "remote-profile" as const : "none" as const,
      imageCandidateCount: 0,
      rejectedImageCount: 0,
      inlineSvgCandidateCount: 0,
      resolutionComplete: true
    };
    const finalCandidate: BrandProfile = {
      ...logoApiCandidate,
      companyName: normalizeCompanyDisplayName(
        logoApiCandidate.companyName,
        logoApiCandidate.canonicalDomain ?? domain
      ),
      diagnostics: {
        ...logoApiCandidate.diagnostics,
        logo: finalLogoReceipt,
        providers: {
          publicPage: publicPageStatus,
          publicPageAttempts,
          remoteBrowser: remoteBrowserStatus,
          brandfetch: brandfetchLogoStatus === "configured" || brandfetchBrandStatus === "succeeded"
            ? "succeeded"
            : brandfetchBrandStatus === "not_configured" || brandfetchBrandStatus === "not_needed"
              ? brandfetchBrandStatus
              : "failed",
          brandfetchLogoApi: brandfetchLogoStatus,
          brandfetchBrandApi: brandfetchBrandStatus,
          verifiedFallback: usedVerifiedFallback
        }
      }
    };
    return cacheBrandProfile(domain, finalCandidate);
  }
  throw publicFetchError instanceof Error
    ? publicFetchError
    : new Error("The public brand profile could not be resolved.");
}

export async function extractPublicContent(
  sourceUrl: string,
  signal?: AbortSignal
): Promise<{ sourceUrl: string; title?: string; description?: string; excerpt: string }> {
  const { text: html, finalUrl } = await fetchPublicText(
    new URL(sourceUrl),
    signal ?? AbortSignal.timeout(12_000)
  );
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || undefined;
  const description = extractMeta(html, "description") ?? extractMeta(html, "og:description");
  return {
    sourceUrl: finalUrl.toString(),
    title,
    description: description ? stripTags(description).slice(0, 500) : undefined,
    excerpt: extractReadableContent(html)
  };
}

export function fallbackBrand(domain: string): BrandProfile {
  const verified = verifiedBrandProfileFor(domain);
  if (verified) {
    return {
      ...verified,
      diagnostics: {
        logo: {
          strategy: verified.logoUrl ? "verified-profile" : "none",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0
        },
        palette: {
          strategy: "verified-profile",
          confidence: "high",
          candidateCount: verified.colors.length,
          semanticCandidateCount: verified.colors.length,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0,
          resolutionComplete: true
        }
      }
    };
  }
  return {
    domain,
    companyName: titleCaseDomain(domain),
    publicTopics: [],
    imageUrls: [],
    colors: ["#1C293F", "#5B5BFF", "#FFFFFF"],
    primaryColor: "#1C293F",
    accentColor: "#5B5BFF",
    surfaceColor: "#FFFFFF",
    displayFontFamily: "Instrument Sans",
    bodyFontFamily: "Inter",
    sourceUrl: `https://${domain}`,
    source: "fallback",
    diagnostics: {
      logo: {
        strategy: "none",
        imageCandidateCount: 0,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0
      },
      palette: {
        strategy: "fallback",
        confidence: "low",
        candidateCount: 0,
        semanticCandidateCount: 0,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    }
  };
}
