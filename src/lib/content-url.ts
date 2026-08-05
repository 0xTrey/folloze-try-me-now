import {
  cleanSourceText,
  createFailedSourceArtifact,
  createSourceArtifact,
  type SourceArtifact,
  type SourceAssetCandidate,
  type SourceCitation,
  type SourceLink,
  type SourceSection
} from "@/lib/content-intelligence";
import { fetchPinnedPublicText } from "@/lib/safe-fetch";

const htmlEntityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

function decodeHtml(value: string): string {
  let result = value;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const decoded = result.replace(/&(?:#(x[0-9a-f]+|\d+)|([a-z]+));/gi, (entity, numeric: string | undefined, named: string | undefined) => {
      if (named) return htmlEntityMap[named.toLocaleLowerCase()] ?? entity;
      if (!numeric) return entity;
      const radix = numeric.toLocaleLowerCase().startsWith("x") ? 16 : 10;
      const value = Number.parseInt(radix === 16 ? numeric.slice(1) : numeric, radix);
      return Number.isSafeInteger(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : entity;
    });
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
  return cleanSourceText(
    decodeHtml(
      value
        .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n")
        .replace(/<\/li\s*>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
    ),
    30_000
  );
}

function absolutePublicUrl(value: string | undefined, base: URL): string | undefined {
  if (!value || /^(?:data|javascript|mailto|tel):/i.test(value)) return undefined;
  try {
    const url = new URL(decodeHtml(value), base);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function extractMeta(html: string, key: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attr(tag, "name") ?? attr(tag, "property");
    if (name?.toLocaleLowerCase() !== key.toLocaleLowerCase()) continue;
    const value = stripTags(attr(tag, "content") ?? "");
    if (value) return value;
  }
  return undefined;
}

function canonicalUrl(html: string, base: URL): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/(?:^|\s)canonical(?:\s|$)/i.test(attr(tag, "rel") ?? "")) continue;
    const resolved = absolutePublicUrl(attr(tag, "href"), base);
    if (resolved) return resolved;
  }
  return undefined;
}

function contentRegion(html: string): { html: string; usedFallback: boolean } {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|template|svg|noscript)\b[\s\S]*?<\/(?:script|style|template|svg|noscript)>/gi, " ")
    .replace(/<(?:nav|header|footer|aside|form)\b[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, " ");
  const candidates = ["article", "main"]
    .flatMap((tag) => [...withoutNoise.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))])
    .map((match) => match[1] ?? "")
    .filter((candidate) => stripTags(candidate).length >= 200)
    .sort((left, right) => stripTags(right).length - stripTags(left).length);
  return candidates[0]
    ? { html: candidates[0], usedFallback: false }
    : { html: withoutNoise, usedFallback: true };
}

interface HtmlBlock {
  tag: string;
  level: number;
  text: string;
  order: number;
}

function htmlBlocks(region: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const expression = /<(h[1-6]|p|li|blockquote|figcaption|caption|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let order = 0;
  for (const match of region.matchAll(expression)) {
    const tag = (match[1] ?? "p").toLocaleLowerCase();
    const body = match[2] ?? "";
    const text = tag === "tr"
      ? [...body.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
          .map((cell) => stripTags(cell[1] ?? ""))
          .filter(Boolean)
          .join(" | ")
      : stripTags(body);
    if (text.length < (tag.startsWith("h") ? 2 : 12)) continue;
    blocks.push({
      tag,
      level: tag.startsWith("h") ? Number.parseInt(tag.slice(1), 10) : 2,
      text: text.slice(0, tag === "tr" ? 2_000 : 12_000),
      order: order++
    });
  }
  if (blocks.some((block) => !block.tag.startsWith("h"))) return blocks;
  const fallback = stripTags(region);
  return fallback.length >= 12
    ? [{ tag: "p", level: 2, text: fallback, order: 0 }]
    : [];
}

function buildSections(input: {
  blocks: HtmlBlock[];
  sourceUrl: string;
  documentTitle?: string;
}): { sections: SourceSection[]; citations: SourceCitation[]; text: string } {
  const sections: SourceSection[] = [];
  const citations: SourceCitation[] = [];
  let current: SourceSection | undefined;
  let citationIndex = 0;

  const ensureSection = (title: string, level: number, order: number): SourceSection => {
    const section: SourceSection = {
      id: `web_section_${sections.length + 1}`,
      title: title.slice(0, 180),
      level: Math.max(1, Math.min(6, level)),
      order,
      text: "",
      citationIds: []
    };
    sections.push(section);
    current = section;
    return section;
  };

  for (const block of input.blocks) {
    if (block.tag.startsWith("h")) {
      ensureSection(block.text, block.level, sections.length);
      continue;
    }
    const section = current ?? ensureSection(input.documentTitle ?? "Overview", 1, 0);
    const citationId = `web_citation_${++citationIndex}`;
    citations.push({
      id: citationId,
      locator: {
        kind: "url-block",
        block: citationIndex,
        label: `${section.title}, block ${citationIndex}`.slice(0, 180),
        sourceUrl: input.sourceUrl
      },
      excerpt: block.text.replace(/\s+/g, " ").slice(0, 320)
    });
    section.text = cleanSourceText(`${section.text}\n${block.text}`, 30_000);
    section.citationIds.push(citationId);
  }

  return {
    sections: sections.filter((section) => section.text.length > 0),
    citations,
    text: cleanSourceText(sections.map((section) => section.text).join("\n\n"))
  };
}

function extractLinks(region: string, base: URL, citations: SourceCitation[]): SourceLink[] {
  const links: SourceLink[] = [];
  const seen = new Set<string>();
  for (const match of region.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = `<a${match[1] ?? ""}>`;
    const url = absolutePublicUrl(attr(tag, "href"), base);
    const label = stripTags(match[2] ?? "").replace(/\s+/g, " ").slice(0, 180);
    if (!url || label.length < 2 || seen.has(`${label.toLocaleLowerCase()}|${url}`)) continue;
    seen.add(`${label.toLocaleLowerCase()}|${url}`);
    const citation = citations.find((candidate) => candidate.excerpt.toLocaleLowerCase().includes(label.toLocaleLowerCase().slice(0, 36)))
      ?? citations[0];
    links.push({
      id: `web_link_${links.length + 1}`,
      label,
      url,
      citationIds: citation ? [citation.id] : []
    });
    if (links.length >= 200) break;
  }
  return links;
}

function assetKind(descriptor: string): SourceAssetCandidate["kind"] {
  if (/\bchart|graph|benchmark|metric|results?\b/i.test(descriptor)) return "chart";
  if (/\bdiagram|architecture|framework|workflow|process\b/i.test(descriptor)) return "diagram";
  return "image";
}

function extractAssets(region: string, base: URL, citations: SourceCitation[]): SourceAssetCandidate[] {
  const assets: SourceAssetCandidate[] = [];
  const seen = new Set<string>();
  for (const match of region.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const srcset = attr(tag, "srcset") ?? attr(tag, "data-srcset");
    const srcsetCandidate = srcset
      ?.split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .at(-1);
    const url = absolutePublicUrl(srcsetCandidate ?? attr(tag, "src") ?? attr(tag, "data-src"), base);
    const alt = stripTags(attr(tag, "alt") ?? "").slice(0, 240) || undefined;
    const width = Number.parseInt(attr(tag, "width") ?? "", 10);
    const height = Number.parseInt(attr(tag, "height") ?? "", 10);
    if (!url || seen.has(url) || ((width > 0 && width < 100) && (height > 0 && height < 100))) continue;
    if (/pixel|spacer|tracking|favicon|avatar|icon/i.test(`${url} ${alt ?? ""}`)) continue;
    seen.add(url);
    const citation = alt
      ? citations.find((candidate) => candidate.excerpt.toLocaleLowerCase().includes(alt.toLocaleLowerCase().slice(0, 32)))
      : undefined;
    assets.push({
      id: `web_asset_${assets.length + 1}`,
      kind: assetKind(alt ?? url),
      sourceUrl: url,
      ...(alt ? { alt } : {}),
      confidence: alt && alt.length >= 8 ? "high" : "medium",
      citationIds: citation ? [citation.id] : []
    });
    if (assets.length >= 120) break;
  }

  let tableIndex = 0;
  for (const table of region.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const text = stripTags(table[1] ?? "").replace(/\s+/g, " ");
    if (text.length < 24) continue;
    const citation = citations.find((candidate) => text.includes(candidate.excerpt.slice(0, 32)));
    assets.push({
      id: `web_table_${++tableIndex}`,
      kind: "table",
      caption: text.slice(0, 320),
      confidence: "high",
      citationIds: citation ? [citation.id] : []
    });
  }
  return assets;
}

export interface NormalizePublicHtmlSourceInput {
  html: string;
  sourceUrl: string;
  finalUrl?: string;
  truncated?: boolean;
  createdAt?: string;
}

export function normalizePublicHtmlSource(input: NormalizePublicHtmlSourceInput): SourceArtifact {
  const base = new URL(input.finalUrl ?? input.sourceUrl);
  const region = contentRegion(input.html);
  const blocks = htmlBlocks(region.html);
  const htmlTitle = stripTags(input.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const openGraphTitle = extractMeta(input.html, "og:title");
  const headingTitle = blocks.find((block) => block.tag === "h1")?.text;
  const title = (openGraphTitle ?? headingTitle ?? htmlTitle).slice(0, 240) || undefined;
  const description = (extractMeta(input.html, "description") ?? extractMeta(input.html, "og:description"))?.slice(0, 1_000);
  const finalUrl = canonicalUrl(input.html, base) ?? base.toString();
  const structured = buildSections({ blocks, sourceUrl: finalUrl, documentTitle: title });
  const warnings = [
    ...(region.usedFallback ? ["No substantive article or main region was found; visible page copy was used."] : []),
    ...(input.truncated ? ["The source response reached the bounded fetch limit and may be incomplete."] : []),
    ...(!title ? ["The source did not expose a reliable document title."] : []),
    ...(structured.text.length < 120 ? ["Very little readable source copy was extracted."] : [])
  ];
  return createSourceArtifact({
    source: {
      kind: "public-url",
      sourceUrl: input.sourceUrl,
      finalUrl,
      mediaType: "text/html"
    },
    extraction: {
      method: "html-static",
      status: input.truncated ? "partial" : "complete",
      truncated: Boolean(input.truncated),
      ocr: {
        status: "not-required",
        pageNumbers: [],
        reason: "OCR does not apply to HTML sources."
      },
      warnings
    },
    content: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      text: structured.text,
      sections: structured.sections,
      links: extractLinks(region.html, base, structured.citations),
      assets: extractAssets(region.html, base, structured.citations),
      citations: structured.citations
    },
    createdAt: input.createdAt
  });
}

function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPublicUrlSourceArtifact(
  sourceUrl: string,
  options: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; createdAt?: string } = {}
): Promise<SourceArtifact> {
  const sanitizedUrl = safeSourceUrl(sourceUrl);
  try {
    const response = await fetchPinnedPublicText(sourceUrl, {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 12_000,
      maxBytes: options.maxBytes ?? 2_000_000,
      maxRedirects: 3
    });
    const contentTypeValue = response.headers["content-type"];
    const contentType = (Array.isArray(contentTypeValue) ? contentTypeValue[0] : contentTypeValue)?.toLocaleLowerCase();
    if (response.status < 200 || response.status >= 300) {
      return createFailedSourceArtifact({
        kind: "public-url",
        ...(sanitizedUrl ? { sourceUrl: sanitizedUrl } : {}),
        mediaType: "text/html",
        method: "html-static",
        failureCode: "public_source_http_status",
        warning: "The public source did not return a successful response.",
        createdAt: options.createdAt
      });
    }
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return createFailedSourceArtifact({
        kind: "public-url",
        ...(sanitizedUrl ? { sourceUrl: sanitizedUrl } : {}),
        mediaType: "text/html",
        method: "html-static",
        failureCode: "public_source_not_html",
        warning: "The submitted URL did not return an HTML document.",
        createdAt: options.createdAt
      });
    }
    return normalizePublicHtmlSource({
      html: response.text,
      sourceUrl: sanitizedUrl ?? sourceUrl,
      finalUrl: response.finalUrl.toString(),
      truncated: response.truncated,
      createdAt: options.createdAt
    });
  } catch {
    return createFailedSourceArtifact({
      kind: "public-url",
      ...(sanitizedUrl ? { sourceUrl: sanitizedUrl } : {}),
      mediaType: "text/html",
      method: "html-static",
      failureCode: "public_source_fetch_failed",
      warning: "The public source could not be read through the protected fetch boundary.",
      createdAt: options.createdAt
    });
  }
}
