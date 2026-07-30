import { hasRemoteBrandHarvester } from "@/lib/config";
import { assertSafePublicUrl } from "@/lib/validation";
import type { BrandProfile } from "@/lib/types";

const htmlEntityMap: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">"
};

const decodeHtml = (value: string) =>
  value.replace(/&(amp|quot|#39|lt|gt);/g, (entity) => htmlEntityMap[entity] ?? entity);

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const titleCaseDomain = (domain: string) =>
  domain
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim();
}

function absoluteHttpsUrl(value: string | undefined, base: URL): string | undefined {
  if (!value || value.startsWith("data:")) return undefined;
  try {
    const resolved = new URL(value, base);
    return resolved.protocol === "https:" ? resolved.toString() : undefined;
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

function extractLogo(html: string, base: URL): string | undefined {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (/apple-touch-icon|icon/.test(rel)) {
      const href = absoluteHttpsUrl(attr(tag, "href"), base);
      if (href) return href;
    }
  }

  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of images) {
    const descriptor = `${attr(tag, "alt") ?? ""} ${attr(tag, "class") ?? ""}`.toLowerCase();
    if (descriptor.includes("logo")) {
      const src = absoluteHttpsUrl(attr(tag, "src") ?? attr(tag, "data-src"), base);
      if (src) return src;
    }
  }
  return undefined;
}

function colorCandidates(html: string): string[] {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/#[0-9a-f]{6}\b/gi)) {
    const color = match[0].toUpperCase();
    if (["#FFFFFF", "#000000", "#F5F5F5", "#333333"].includes(color)) continue;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([color]) => color);
}

async function fetchHtml(startUrl: URL, signal?: AbortSignal): Promise<{ html: string; finalUrl: URL }> {
  let current = startUrl;
  for (let hop = 0; hop < 4; hop += 1) {
    current = await assertSafePublicUrl(current.toString());
    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "Folloze-Try-Me-Now/1.0 (+https://www.folloze.com/)"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The company site redirected without a destination.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`The company site returned ${response.status}.`);

    const reader = response.body?.getReader();
    if (!reader) return { html: "", finalUrl: current };
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < 1_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      chunks.push(value);
    }
    await reader.cancel().catch(() => undefined);
    const html = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, 1_000_000));
    return { html, finalUrl: current };
  }
  throw new Error("The company site redirected too many times.");
}

function normalizeRemoteProfile(value: unknown, domain: string): BrandProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const profile = (record.profile && typeof record.profile === "object" ? record.profile : record) as Record<
    string,
    unknown
  >;
  const colors = Array.isArray(profile.colors)
    ? profile.colors.filter((color): color is string => typeof color === "string").slice(0, 6)
    : [];
  return {
    domain,
    companyName: typeof profile.companyName === "string" ? profile.companyName : titleCaseDomain(domain),
    title: typeof profile.title === "string" ? profile.title : undefined,
    description: typeof profile.description === "string" ? profile.description : undefined,
    logoUrl: typeof profile.logoUrl === "string" ? profile.logoUrl : undefined,
    colors,
    primaryColor: typeof profile.primaryColor === "string" ? profile.primaryColor : colors[0] ?? "#1C293F",
    accentColor: typeof profile.accentColor === "string" ? profile.accentColor : colors[1] ?? "#5B5BFF",
    sourceUrl: typeof profile.sourceUrl === "string" ? profile.sourceUrl : `https://${domain}`,
    source: "brand-harvester"
  };
}

export async function harvestBrand(domain: string): Promise<BrandProfile> {
  if (hasRemoteBrandHarvester && process.env.BRAND_HARVESTER_URL) {
    const response = await fetch(process.env.BRAND_HARVESTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.BRAND_HARVESTER_TOKEN
          ? { Authorization: `Bearer ${process.env.BRAND_HARVESTER_TOKEN}` }
          : {})
      },
      body: JSON.stringify({ domain, sourceUrl: `https://${domain}`, capture: "progressive" }),
      signal: AbortSignal.timeout(25_000)
    });
    if (!response.ok) throw new Error(`Brand Harvester returned ${response.status}.`);
    const normalized = normalizeRemoteProfile(await response.json(), domain);
    if (normalized) return normalized;
  }

  const { html, finalUrl } = await fetchHtml(
    await assertSafePublicUrl(`https://${domain}`),
    AbortSignal.timeout(9_000)
  );
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const ogSiteName = extractMeta(html, "og:site_name");
  const description = extractMeta(html, "description") ?? extractMeta(html, "og:description");
  const colors = colorCandidates(html);
  const titleName = title.split(/[|–—-]/)[0]?.trim();
  const companyName =
    stripTags(ogSiteName ?? "") ||
    (titleName && titleName.length <= 48 && !titleName.includes(":") ? titleName : titleCaseDomain(domain));

  return {
    domain,
    companyName,
    title: title || undefined,
    description: description ? stripTags(description).slice(0, 360) : undefined,
    logoUrl: extractLogo(html, finalUrl),
    colors,
    primaryColor: colors[0] ?? "#1C293F",
    accentColor: colors[1] ?? "#5B5BFF",
    sourceUrl: finalUrl.toString(),
    source: "fast-extractor"
  };
}

export async function extractPublicContent(sourceUrl: string): Promise<{
  sourceUrl: string;
  title?: string;
  description?: string;
  excerpt: string;
}> {
  const { html, finalUrl } = await fetchHtml(
    await assertSafePublicUrl(sourceUrl),
    AbortSignal.timeout(12_000)
  );
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || undefined;
  const description = extractMeta(html, "description") ?? extractMeta(html, "og:description");
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
  return {
    sourceUrl: finalUrl.toString(),
    title,
    description: description ? stripTags(description).slice(0, 500) : undefined,
    excerpt: stripTags(cleaned).slice(0, 7000)
  };
}

export function fallbackBrand(domain: string): BrandProfile {
  return {
    domain,
    companyName: titleCaseDomain(domain),
    colors: ["#1C293F", "#5B5BFF", "#11D175"],
    primaryColor: "#1C293F",
    accentColor: "#5B5BFF",
    sourceUrl: `https://${domain}`,
    source: "fallback"
  };
}
