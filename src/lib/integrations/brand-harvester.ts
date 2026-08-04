import { hasRemoteBrandHarvester } from "@/lib/config";
import { withBrandReadiness } from "@/lib/brand-readiness";
import { fallbackCompanyName, resolvePublicCompanyName } from "@/lib/company-name";
import { logServerError } from "@/lib/http";
import {
  portableBrandLogoFromBytes,
  portableBrandLogoFromSvg
} from "@/lib/portable-brand-logo";
import { fetchPinnedPublicBytes, fetchPinnedPublicText } from "@/lib/safe-fetch";
import type { BrandProfile } from "@/lib/types";
import {
  brandPresentationFor,
  type PresentedBrandProfile,
  verifiedBrandProfileFor
} from "@/lib/verified-brand-profiles";

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

function canonicalCompanyName(value: string, domain: string): string {
  const cleaned = value.replace(/\.(?:com|net|org)\s*$/i, "").trim();
  const domainKey = entityKey(domain.split(".")[0] ?? "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let length = 1; length <= words.length; length += 1) {
    const prefix = words.slice(0, length).join(" ");
    if (domainKey && entityKey(prefix) === domainKey) return prefix;
  }
  return cleaned;
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim();
}

function absoluteHttpsUrl(value: string | undefined, base: URL): string | undefined {
  if (!value || value.startsWith("data:")) return undefined;
  try {
    const resolved = new URL(decodeHtml(value), base);
    return resolved.protocol === "https:" && !resolved.username && !resolved.password
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

function imageSource(tag: string, base: URL): string | undefined {
  const srcset = attr(tag, "srcset") ?? attr(tag, "data-srcset");
  if (srcset) {
    const candidate = srcset
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .at(-1);
    const srcsetUrl = absoluteHttpsUrl(candidate, base);
    if (srcsetUrl) return srcsetUrl;
  }
  const direct = attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "data-lazy-src");
  return absoluteHttpsUrl(direct, base);
}

function numericAttr(tag: string, name: string): number {
  const value = Number.parseInt(attr(tag, name) ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function extractLogo(
  html: string,
  base: URL,
  companyName: string
): {
  logoUrl?: string;
  portableLogo?: BrandProfile["portableLogo"];
  receipt: NonNullable<BrandProfile["diagnostics"]>["logo"];
} {
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
  const scored = (html.match(/<img\b[^>]*>/gi) ?? [])
    .map((tag) => {
      const source = imageSource(tag, base);
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
      if (/favicon|apple-touch|lang-picker|customer|partner|testimonial/.test(descriptor)) score -= 90;
      if (width && height && width <= 96 && height <= 96 && Math.abs(width - height) < 20) score -= 35;
      if (width > height * 1.6) score += 15;
      return { source, score };
    })
    .filter((candidate): candidate is { source: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 35) {
    return {
      logoUrl: scored[0].source,
      receipt: {
        strategy: "semantic-image",
        imageCandidateCount,
        rejectedImageCount,
        inlineSvgCandidateCount,
        selectedScore: scored[0].score
      }
    };
  }

  // Many official navigation wordmarks (including Cisco's) are authored
  // directly in the page. Preserve only self-contained, inert SVG; the
  // session image route serves the validated bytes from the first-party app.
  const portableLogo = inlineSvgCandidates
    .map((svg) => portableBrandLogoFromSvg(svg))
    .find((candidate): candidate is NonNullable<BrandProfile["portableLogo"]> => Boolean(candidate));
  if (portableLogo) {
    return {
      portableLogo,
      receipt: {
        strategy: "inline-svg-portable",
        imageCandidateCount,
        rejectedImageCount,
        inlineSvgCandidateCount
      }
    };
  }

  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (/apple-touch-icon|icon/.test(rel)) {
      const href = absoluteHttpsUrl(attr(tag, "href"), base);
      if (href) {
        return {
          logoUrl: href,
          receipt: {
            strategy: "favicon",
            imageCandidateCount,
            rejectedImageCount,
            inlineSvgCandidateCount
          }
        };
      }
    }
  }
  return {
    receipt: {
      strategy: inlineSvgCandidateCount > 0 ? "inline-svg-unportable" : "none",
      imageCandidateCount,
      rejectedImageCount,
      inlineSvgCandidateCount
    }
  };
}

function extractImageUrls(html: string, base: URL, logoUrl?: string): string[] {
  const candidates = new Map<string, number>();
  const add = (url: string | undefined, score: number) => {
    const pathname = url ? new URL(url).pathname : "";
    if (
      !url ||
      url === logoUrl ||
      /(?:^|[/_.-])(logos?|wordmark|brandmark|badge|app[-_ ]?store|google[-_ ]?play|favicon|icons?)(?:[/_.?-]|$)/i.test(
        pathname
      )
    ) return;
    const reusableScore =
      score -
      (/(?:^|[/_.-])(event|roadshow|webinar|conference|summit|register|registration|speaker|dates?|regions?|promo(?:tion)?)(?:[/_.?-]|$)/i.test(
        pathname
      )
        ? 90
        : 0);
    candidates.set(url, Math.max(reusableScore, candidates.get(url) ?? Number.NEGATIVE_INFINITY));
  };

  add(absoluteHttpsUrl(extractMeta(html, "og:image"), base), 55);
  add(absoluteHttpsUrl(extractMeta(html, "twitter:image"), base), 50);

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
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
    if (/event|roadshow|webinar|conference|summit|register|registration|speaker|dates?|regions?|promotion/.test(descriptor)) score -= 90;
    if (/logo|icon|avatar|headshot|testimonial|badge|flag|cookie|language|spinner|rating|stars?|review|widget|g2\.com|trustpilot/.test(descriptor)) score -= 100;
    if (width >= 600 || height >= 400) score += 25;
    if (width && height && width * height < 80_000) score -= 45;
    if (/\.svg(?:\?|$)/.test(source) && !/diagram|architecture|platform|workflow/.test(descriptor)) score -= 20;
    add(source, score);
  }

  return [...candidates.entries()]
    .filter(([, score]) => score >= 25)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([url]) => url);
}

function normalizeHex(value: string): string | undefined {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return undefined;
  const raw = match[1];
  return `#${(raw.length === 3 ? raw.split("").map((char) => `${char}${char}`).join("") : raw).toUpperCase()}`;
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

function extractPalette(html: string, css: string): {
  colors: string[];
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  diagnostics: NonNullable<NonNullable<BrandProfile["diagnostics"]>["palette"]>;
} {
  const source = css.trim() || html;
  const counts = new Map<string, number>();
  for (const match of source.matchAll(/#[0-9a-f]{3,6}\b/gi)) {
    const color = normalizeHex(match[0]);
    if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  const rawVariables = new Map(
    [...source.matchAll(/--([a-z0-9_-]+)\s*:\s*([^;}{]+)/gi)].map((match) => [
      match[1].toLowerCase(),
      match[2].trim()
    ])
  );
  const resolveVariableColor = (value: string, seen = new Set<string>()): string | undefined => {
    const direct = value.match(/#[0-9a-f]{3,6}\b/i)?.[0];
    if (direct) return normalizeHex(direct);
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
      return [...declarationBody.matchAll(/#[0-9a-f]{3,6}\b/gi)]
        .map((colorMatch) => normalizeHex(colorMatch[0]))
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
      [...value.matchAll(/#[0-9a-f]{3,6}\b/gi)]
        .map((match) => normalizeHex(match[0]))
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
    if (/(^|[-_])ui[-_]?0?1([-_]|$)/.test(name)) return 180;
    if (/(^|[-_])accent([-_]|$)/.test(name)) return 155;
    if (/cta|button.*background/.test(name)) return 145;
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
        saturation(color) > 0.08 &&
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
  const accentColor = (semanticAccentStrength >= 170 ? semanticAccent : undefined) ??
    metadataAccent ??
    semanticAccent ??
    gradientAccent ??
    ruleAccent ??
    (css.trim() ? vividCandidates[0] : metadataAccent ?? vividCandidates[0]) ??
    meaningful.find((color) => color !== provisionalPrimary) ??
    "#5B5BFF";
  const darkCandidates = meaningful.filter(
    (color) => color !== accentColor && luminance(color) < 0.28 && saturation(color) > 0.08
  );
  const primaryColor = semanticPrimary ??
    rulePrimary ??
    (css.trim() && variables.length === 0 ? darkCandidates[0] : undefined) ??
    "#1C293F";
  const surfaceColor = ranked.find((color) => luminance(color) > 0.88) ?? "#FFFFFF";
  const colors = [primaryColor, accentColor, surfaceColor, ...meaningful]
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
  const confidence = hasSemanticRoles && semanticCandidateCount >= 2
    ? "high"
    : hasSemanticRoles
      ? "medium"
      : "low";
  const strategy = semanticPrimary || semanticAccent || gradientAccent
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

export function extractFastBrandProfile(input: {
  domain: string;
  html: string;
  css?: string;
  finalUrl?: URL;
}): BrandProfile {
  const finalUrl = input.finalUrl ?? new URL(`https://${input.domain}`);
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
  const imageUrls = extractImageUrls(input.html, finalUrl, logoUrl);
  const topics = extractPublicTopics(input.html);
  const cleanDescription = description ? stripTags(description).slice(0, 500) : undefined;
  const publicContext = [cleanDescription, ...topics].filter(Boolean).join(" ").slice(0, 2400) || undefined;
  const { diagnostics: paletteDiagnostics, ...palette } = extractPalette(
    input.html,
    input.css ?? ""
  );
  const fonts = extractFontProfile(input.html, input.css ?? "");
  const fontBase = finalUrl;
  return {
    domain: input.domain,
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
    diagnostics: {
      logo: logoDecision.receipt,
      palette: paletteDiagnostics
    }
  };
}

function strings(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

function normalizeRemoteProfile(value: unknown, domain: string): BrandProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const profile = (record.profile && typeof record.profile === "object" ? record.profile : record) as Record<string, unknown>;
  const colors = strings(profile.colors, 8).map(normalizeHex).filter((color): color is string => Boolean(color));
  const logoUrl = typeof profile.logoUrl === "string" ? profile.logoUrl : undefined;
  const hasDistinctRemotePalette = colors.length >= 3 &&
    !(
      colors[0] === "#1C293F" &&
      colors[1] === "#5B5BFF" &&
      colors[2] === "#FFFFFF"
    );
  return {
    domain,
    companyName: typeof profile.companyName === "string" ? profile.companyName : titleCaseDomain(domain),
    title: typeof profile.title === "string" ? profile.title : undefined,
    description: typeof profile.description === "string" ? profile.description.slice(0, 500) : undefined,
    publicContext: typeof profile.publicContext === "string" ? profile.publicContext.slice(0, 2400) : undefined,
    publicTopics: strings(profile.publicTopics, 12),
    logoUrl,
    logoSourceUrl: logoUrl,
    imageUrls: strings(profile.imageUrls, 6),
    colors,
    primaryColor: typeof profile.primaryColor === "string" ? normalizeHex(profile.primaryColor) ?? "#1C293F" : colors[0] ?? "#1C293F",
    accentColor: typeof profile.accentColor === "string" ? normalizeHex(profile.accentColor) ?? "#5B5BFF" : colors[1] ?? "#5B5BFF",
    surfaceColor: typeof profile.surfaceColor === "string" ? normalizeHex(profile.surfaceColor) ?? "#FFFFFF" : "#FFFFFF",
    displayFontFamily: typeof profile.displayFontFamily === "string" ? profile.displayFontFamily : undefined,
    bodyFontFamily: typeof profile.bodyFontFamily === "string" ? profile.bodyFontFamily : undefined,
    displayFontUrl: typeof profile.displayFontUrl === "string" ? profile.displayFontUrl : undefined,
    bodyFontUrl: typeof profile.bodyFontUrl === "string" ? profile.bodyFontUrl : undefined,
    sourceUrl: typeof profile.sourceUrl === "string" ? profile.sourceUrl : `https://${domain}`,
    source: "brand-harvester",
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
      }
    }
  };
}

function mergeVerifiedDesign(
  profile: BrandProfile,
  verified: PresentedBrandProfile | undefined
): BrandProfile {
  if (!verified) return profile;
  const presentation = brandPresentationFor(verified);
  const logoUrl = verified.logoUrl ?? profile.logoUrl;
  return {
    ...profile,
    companyName: verified.companyName,
    logoUrl,
    logoSourceUrl: logoUrl ?? profile.logoSourceUrl,
    portableLogo: verified.logoUrl ? undefined : profile.portableLogo,
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
    diagnostics: {
      ...profile.diagnostics,
      logo: verified.logoUrl
        ? {
            strategy: "verified-profile",
            imageCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
            rejectedImageCount: profile.diagnostics?.logo.rejectedImageCount ?? 0,
            inlineSvgCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0
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
  const completed = withBrandReadiness({
    ...profile,
    logoSourceUrl: profile.logoSourceUrl ?? profile.logoUrl,
    diagnostics: {
      ...profile.diagnostics,
      logo: {
        strategy: profile.diagnostics?.logo.strategy ?? (profile.logoUrl ? "remote-profile" : "none"),
        imageCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
        rejectedImageCount: profile.diagnostics?.logo.rejectedImageCount ?? 0,
        inlineSvgCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
        selectedScore: profile.diagnostics?.logo.selectedScore,
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

interface BrandfetchLogoResult {
  companyName?: string;
  colors: string[];
  portableLogo: NonNullable<BrandProfile["portableLogo"]>;
}

function brandfetchLogoFormats(payload: Record<string, unknown>): string[] {
  const logos = Array.isArray(payload.logos) ? payload.logos : [];
  return logos
    .filter((logo): logo is Record<string, unknown> => Boolean(logo && typeof logo === "object"))
    .flatMap((logo) => {
      const logoType = typeof logo.type === "string" ? logo.type.toLowerCase() : "";
      const typeScore = logoType === "logo" ? 100 : logoType === "symbol" ? 40 : 0;
      const formats = Array.isArray(logo.formats) ? logo.formats : [];
      return formats
        .filter((format): format is Record<string, unknown> => Boolean(format && typeof format === "object"))
        .map((format) => ({
          src: typeof format.src === "string" ? format.src : "",
          score:
            typeScore +
            (format.format === "svg" ? 30 : format.format === "png" ? 20 : format.format === "webp" ? 10 : 0)
        }));
    })
    .filter(({ src }) => {
      try {
        const url = new URL(src);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ src }) => src)
    .filter((src, index, values) => values.indexOf(src) === index)
    .slice(0, 6);
}

async function fetchBrandfetchLogo(domain: string): Promise<BrandfetchLogoResult | undefined> {
  const token = process.env.BRANDFETCH_API_KEY;
  if (!token) return undefined;
  try {
    // The authenticated request is fixed to Brandfetch's API and stays
    // server-side. Returned CDN assets are fetched anonymously through the
    // pinned public-address boundary, validated, and copied into the session.
    const response = await fetch(
      `https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(8_000)
      }
    );
    if (!response.ok) {
      logServerError(new Error(`Brandfetch returned HTTP ${response.status}.`), {
        operation: "brandfetch_logo_lookup",
        code: "brandfetch_upstream_failed",
        status: response.status,
        details: { domain }
      });
      return undefined;
    }
    const payload = await response.json() as Record<string, unknown>;
    const colors = (Array.isArray(payload.colors) ? payload.colors : [])
      .filter((color): color is Record<string, unknown> => Boolean(color && typeof color === "object"))
      .map((color) => normalizeHex(typeof color.hex === "string" ? color.hex : ""))
      .filter((color): color is string => Boolean(color))
      .filter((color, index, values) => values.indexOf(color) === index)
      .slice(0, 8);
    for (const sourceUrl of brandfetchLogoFormats(payload)) {
      try {
        const asset = await fetchPinnedPublicBytes(sourceUrl, {
          timeoutMs: 5_000,
          maxBytes: 350_000,
          maxRedirects: 2,
          headers: {
            Accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/avif,image/gif;q=0.8,*/*;q=0.1"
          }
        });
        if (asset.status !== 200 || asset.truncated) continue;
        const portableLogo = portableBrandLogoFromBytes(asset.bytes, "brandfetch");
        if (portableLogo) {
          return {
            companyName: typeof payload.name === "string" ? payload.name : undefined,
            colors,
            portableLogo
          };
        }
      } catch {
        // Try the next bounded Brandfetch format without logging its CDN URL.
      }
    }
    return undefined;
  } catch (error) {
    logServerError(error, {
      operation: "brandfetch_logo_lookup",
      code: "brandfetch_lookup_failed",
      details: { domain }
    });
    return undefined;
  }
}

function profileWithBrandfetchLogo(
  domain: string,
  profile: BrandProfile | undefined,
  result: BrandfetchLogoResult
): BrandProfile {
  const base = profile ?? fallbackBrand(domain);
  const colors = profile
    ? base.colors
    : result.colors.length
      ? result.colors
      : base.colors;
  return {
    ...base,
    companyName: profile?.companyName ?? result.companyName ?? base.companyName,
    logoUrl: undefined,
    logoSourceUrl: undefined,
    portableLogo: result.portableLogo,
    colors,
    primaryColor: profile ? base.primaryColor : colors[0] ?? base.primaryColor,
    accentColor: profile ? base.accentColor : colors[1] ?? base.accentColor,
    source: "brand-harvester",
    diagnostics: {
      ...base.diagnostics,
      logo: {
        strategy: "brandfetch-portable",
        imageCandidateCount: base.diagnostics?.logo.imageCandidateCount ?? 0,
        rejectedImageCount: base.diagnostics?.logo.rejectedImageCount ?? 0,
        inlineSvgCandidateCount: base.diagnostics?.logo.inlineSvgCandidateCount ?? 0
      },
      palette: profile?.diagnostics?.palette ?? {
        strategy: "brandfetch",
        confidence: result.colors.length >= 3 ? "high" : result.colors.length >= 2 ? "medium" : "low",
        candidateCount: result.colors.length,
        semanticCandidateCount: result.colors.length,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0
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
      return 4;
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

async function copyOfficialRemoteLogo(profile: BrandProfile): Promise<BrandProfile> {
  if (
    profile.portableLogo ||
    !profile.logoUrl ||
    profile.diagnostics?.logo.strategy === "favicon"
  ) return profile;
  try {
    const asset = await fetchPinnedPublicBytes(profile.logoUrl, {
      timeoutMs: 5_000,
      maxBytes: 350_000,
      maxRedirects: 2,
      headers: {
        Accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/avif,image/gif;q=0.8,*/*;q=0.1"
      }
    });
    if (asset.status !== 200 || asset.truncated) return profile;
    const portableLogo = portableBrandLogoFromBytes(asset.bytes, "official-remote-asset");
    if (!portableLogo) return profile;
    return {
      ...profile,
      logoSourceUrl: profile.logoSourceUrl ?? profile.logoUrl,
      portableLogo,
      diagnostics: {
        ...profile.diagnostics,
        logo: {
          strategy: "official-remote-portable",
          imageCandidateCount: profile.diagnostics?.logo.imageCandidateCount ?? 0,
          rejectedImageCount: profile.diagnostics?.logo.rejectedImageCount ?? 0,
          inlineSvgCandidateCount: profile.diagnostics?.logo.inlineSvgCandidateCount ?? 0,
          selectedScore: profile.diagnostics?.logo.selectedScore
        }
      }
    };
  } catch {
    // The session image route can still proxy the bounded official URL. Do not
    // log or expose the upstream asset URL because it may contain transient CDN data.
    return profile;
  }
}

export async function harvestBrand(domain: string): Promise<BrandProfile> {
  const cached = cachedBrandProfile(domain);
  if (cached) return cached;
  const verified = verifiedBrandProfileFor(domain);
  // Run the deterministic public-page pass alongside an optional browser
  // harvester. This keeps richer semantic color evidence inside the existing
  // experience-generation window instead of stacking two network budgets.
  const publicEvidencePromise = (async (): Promise<
    { profile: BrandProfile } | { error: unknown }
  > => {
    try {
      const { text: html, finalUrl } = await fetchPublicText(
        new URL(`https://${domain}`),
        AbortSignal.timeout(8_500)
      );
      const styles = await Promise.allSettled(
        stylesheetUrls(html, finalUrl).map(async (url) =>
          (await fetchPublicText(new URL(url), AbortSignal.timeout(2_500))).text
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
      return { error };
    }
  })();
  let candidate: BrandProfile | undefined;
  if (hasRemoteBrandHarvester && process.env.BRAND_HARVESTER_URL) {
    try {
      const response = await fetch(process.env.BRAND_HARVESTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.BRAND_HARVESTER_TOKEN ? { Authorization: `Bearer ${process.env.BRAND_HARVESTER_TOKEN}` } : {})
        },
        body: JSON.stringify({ domain, sourceUrl: `https://${domain}`, capture: "progressive" }),
        signal: AbortSignal.timeout(25_000)
      });
      if (response.ok) {
        const normalized = normalizeRemoteProfile(await response.json(), domain);
        if (normalized) candidate = mergeVerifiedDesign(normalized, verified);
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
    const extracted = publicEvidence.profile;
    candidate = candidate
      ? mergePublicBrandEvidence(candidate, extracted, verified)
      : mergeVerifiedDesign(extracted, verified);
  } else {
    publicFetchError = publicEvidence.error;
    logServerError(publicEvidence.error, {
      operation: "brand_harvest_public_fallback",
      code: verified ? "brand_harvest_verified_fallback" : "brand_harvest_failed",
      details: { domain }
    });
    candidate ??= verified;
  }

  if (!candidate?.logoUrl && !candidate?.portableLogo) {
    const brandfetch = await fetchBrandfetchLogo(domain);
    if (brandfetch) candidate = profileWithBrandfetchLogo(domain, candidate, brandfetch);
  }

  if (candidate) {
    candidate = await copyOfficialRemoteLogo(candidate);
    return cacheBrandProfile(domain, candidate);
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
