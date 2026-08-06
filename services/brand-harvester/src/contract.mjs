import { publicUrlWithoutQuery } from "./security.mjs";

const STYLE_KEYS = [
  "color", "backgroundColor", "borderColor", "borderWidth", "borderRadius", "boxShadow",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textTransform",
  "padding", "margin", "display", "position", "gap", "maxWidth", "gridTemplateColumns"
];

const cap = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
const finite = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : undefined;

function compactRect(rect) {
  if (!rect || typeof rect !== "object") return undefined;
  const value = { width: finite(rect.width), height: finite(rect.height) };
  return value.width && value.height ? value : undefined;
}

function compactStyle(style) {
  if (!style || typeof style !== "object") return {};
  return Object.fromEntries(STYLE_KEYS.flatMap((key) => {
    const value = style[key];
    return typeof value === "string" && value.length <= 240 && value !== "none" && value !== "normal"
      ? [[key, value]]
      : [];
  }));
}

function rgbToHex(value) {
  if (typeof value !== "string") return undefined;
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].toUpperCase()}`;
  const rgb = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?\s*\)$/i);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 0.15)) return undefined;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

const uniq = (items) => [...new Set(items.filter(Boolean))];
const neutral = (color) => {
  const hex = rgbToHex(color);
  if (!hex) return true;
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 18;
};

function paletteFor(raw, brandfetch) {
  const desktop = raw.desktop ?? {};
  const heading = cap(desktop.typography, 80).find((item) => item.role === "display" || item.tag === "h1");
  const body = cap(desktop.typography, 80).find((item) => item.role === "body" || item.tag === "p");
  const button = cap(desktop.buttons, 40).find((item) => !neutral(item.style?.backgroundColor));
  const link = cap(desktop.buttons, 40).find((item) => !neutral(item.style?.color));
  const surface = rgbToHex(desktop.metrics?.bodyBackground) ?? "#FFFFFF";
  const text = rgbToHex(heading?.style?.color) ?? rgbToHex(body?.style?.color);
  const accent = rgbToHex(button?.style?.backgroundColor) ?? rgbToHex(link?.style?.color);
  const observed = cap(desktop.colors, 16).map((item) => rgbToHex(item.value ?? item));
  const provider = cap(brandfetch?.colors, 12).map((item) => rgbToHex(item));
  const colors = uniq([text, accent, surface, ...observed, ...provider]).slice(0, 12);
  return {
    colors,
    roles: {
      text: text ?? colors.find((color) => neutral(color)),
      accent: accent ?? colors.find((color) => !neutral(color)),
      surface,
      support: colors.find((color) => color !== text && color !== accent && color !== surface)
    }
  };
}

function rankedAssets(raw, brandfetch) {
  const logos = [...cap(raw.desktop?.logos, 20), ...cap(brandfetch?.logos, 10)]
    .map((item) => ({
      url: publicUrlWithoutQuery(item.url ?? item.src),
      score: finite(item.score ?? item.logoScore) ?? 0,
      source: item.source === "brandfetch" ? "brandfetch" : "rendered-page",
      reasons: cap(item.reasons ?? item.logoReasons, 4).filter((reason) => typeof reason === "string").map((reason) => reason.slice(0, 100))
    }))
    .filter((item) => item.url)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, 8);
  const images = cap(raw.desktop?.images, 30)
    .map((item) => ({
      url: publicUrlWithoutQuery(item.url ?? item.src),
      width: finite(item.width ?? item.rect?.width),
      height: finite(item.height ?? item.rect?.height),
      role: typeof item.role === "string" ? item.role.slice(0, 40) : "editorial"
    }))
    .filter((item) => item.url && item.width >= 160 && item.height >= 90)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))
    .slice(0, 10);
  return { logos, images };
}

function component(item, kind) {
  const pattern = ["radial-gradient", "linear-gradient", "image", "solid"].includes(item.pattern)
    ? item.pattern
    : undefined;
  return {
    kind: typeof item.kind === "string" && ["primary", "secondary", "navigation", "button"].includes(item.kind)
      ? item.kind
      : kind,
    rect: compactRect(item.rect),
    style: compactStyle(item.style),
    ...(pattern ? { pattern } : {}),
    confidence: item.confidence === "high" ? "high" : "medium",
    evidence: item.evidence === "mobile" ? "mobile" : "desktop"
  };
}

function screenshotReceipt(value) {
  if (!value || typeof value !== "object" || !/^[a-f0-9]{64}$/i.test(value.sha256 ?? "")) return undefined;
  return {
    sha256: value.sha256,
    bytes: finite(value.bytes),
    width: finite(value.width),
    height: finite(value.height),
    clipped: Boolean(value.clipped)
  };
}

function fidelityReceipt(raw, dna) {
  const desktop = raw.desktop ?? {};
  const mobile = raw.mobile ?? {};
  const evidence = {
    desktopRendered: desktop.status === "ok",
    mobileRendered: mobile.status === "ok",
    desktopLazyLoadPrepared: Boolean(desktop.lazyLoad?.completed),
    mobileLazyLoadPrepared: Boolean(mobile.lazyLoad?.completed),
    excludedSignalCount: Number(desktop.excludedSignals?.count ?? 0) + Number(mobile.excludedSignals?.count ?? 0),
    colorCount: dna.palette.colors.length,
    typographyRoleCount: Object.values(dna.typography.roles).filter(Boolean).length,
    buttonVariantCount: dna.components.buttons.length,
    layoutCandidateCount: dna.components.layouts.length,
    motifCount: dna.components.motifs.length,
    reusableLogoCount: dna.assets.logos.length,
    screenshotEvidenceCount: Object.values(dna.evidence.screenshots).filter(Boolean).length
  };
  const points = [
    [evidence.desktopRendered, 15], [evidence.mobileRendered, 10],
    [evidence.desktopLazyLoadPrepared, 8], [evidence.mobileLazyLoadPrepared, 7],
    [evidence.colorCount >= 2, 12], [evidence.typographyRoleCount >= 2, 10],
    [evidence.buttonVariantCount >= 1, 10], [evidence.layoutCandidateCount >= 2, 10],
    [evidence.reusableLogoCount >= 1, 10], [evidence.screenshotEvidenceCount === 2, 8]
  ];
  const score = points.reduce((sum, [condition, value]) => sum + (condition ? value : 0), 0);
  const missing = [];
  if (!evidence.desktopRendered) missing.push("desktop_render");
  if (!evidence.desktopLazyLoadPrepared) missing.push("lazy_load_preparation");
  if (evidence.colorCount < 2) missing.push("observed_palette");
  if (evidence.typographyRoleCount < 2) missing.push("computed_typography");
  if (!evidence.buttonVariantCount) missing.push("button_geometry");
  if (evidence.layoutCandidateCount < 2) missing.push("layout_geometry");
  if (!evidence.reusableLogoCount) missing.push("reusable_logo");
  if (evidence.screenshotEvidenceCount < 1) missing.push("screenshot_evidence");
  const requiredEvidenceReady = evidence.desktopRendered &&
    evidence.desktopLazyLoadPrepared &&
    evidence.colorCount >= 2 &&
    evidence.typographyRoleCount >= 2 &&
    evidence.buttonVariantCount >= 1 &&
    evidence.layoutCandidateCount >= 2 &&
    evidence.reusableLogoCount >= 1 &&
    evidence.screenshotEvidenceCount >= 1;
  return {
    designReady: score >= 75 && requiredEvidenceReady,
    score,
    missing,
    evidence
  };
}

export function buildPublicPayload(raw, context = {}) {
  const palette = paletteFor(raw, raw.brandfetch);
  const assets = rankedAssets(raw, raw.brandfetch);
  const display = cap(raw.desktop?.typography, 100).find((item) => item.role === "display" || item.tag === "h1");
  const body = cap(raw.desktop?.typography, 100).find((item) => item.role === "body" || item.tag === "p");
  const buttonRank = { primary: 4, secondary: 3, button: 2, navigation: 1 };
  const buttons = cap(raw.desktop?.buttons, 30)
    .map((item) => component(item, "button"))
    .filter((item, index, items) => items.findIndex((candidate) => JSON.stringify(candidate.style) === JSON.stringify(item.style)) === index)
    .sort((left, right) => (buttonRank[right.kind] ?? 0) - (buttonRank[left.kind] ?? 0))
    .slice(0, 8);
  const dna = {
    schemaVersion: "brand-design-dna.v1",
    identity: {
      companyName: raw.brandfetch?.name ?? raw.identity?.siteName ?? raw.identity?.companyName ?? context.domain,
      domain: context.domain,
      sourceUrl: publicUrlWithoutQuery(context.sourceUrl)
    },
    palette,
    typography: {
      roles: {
        display: display ? compactStyle(display.style) : undefined,
        body: body ? compactStyle(body.style) : undefined,
        navigation: raw.desktop?.header?.style ? compactStyle(raw.desktop.header.style) : undefined
      },
      families: uniq([
        display?.style?.fontFamily,
        body?.style?.fontFamily,
        ...cap(raw.brandfetch?.fonts, 6)
      ]).slice(0, 6)
    },
    components: {
      buttons,
      cards: cap(raw.desktop?.cards, 12).map((item) => component(item, "card")),
      layouts: cap(raw.desktop?.layouts, 16).map((item) => component(item, "layout")),
      navigation: raw.desktop?.header ? component(raw.desktop.header, "navigation") : undefined,
      motifs: cap(raw.desktop?.pseudoElements, 12).map((item) => component(item, "pseudo-element"))
    },
    responsive: {
      desktop: raw.desktop?.metrics,
      mobile: raw.mobile?.metrics,
      mobileButtons: cap(raw.mobile?.buttons, 5).map((item) => component(item, "button")),
      mobileTypography: cap(raw.mobile?.typography, 8).map((item) => component(item, "typography"))
    },
    assets,
    evidence: {
      lazyLoad: {
        desktop: raw.desktop?.lazyLoad,
        mobile: raw.mobile?.lazyLoad
      },
      excludedSignals: {
        desktop: raw.desktop?.excludedSignals,
        mobile: raw.mobile?.excludedSignals
      },
      screenshots: {
        desktop: screenshotReceipt(raw.screenshots?.desktop),
        mobile: screenshotReceipt(raw.screenshots?.mobile)
      },
      providers: {
        browser: raw.browserStatus ?? "unknown",
        brandfetch: raw.brandfetch?.status ?? "not_configured"
      }
    }
  };
  const readiness = fidelityReceipt(raw, dna);
  const companyName = dna.identity.companyName;
  const profile = {
    domain: context.domain,
    companyName,
    logoUrl: assets.logos[0]?.url,
    imageUrls: assets.images.map((item) => item.url).slice(0, 6),
    colors: palette.colors.slice(0, 8),
    primaryColor: palette.roles.text ?? palette.colors[0],
    accentColor: palette.roles.accent ?? palette.colors[1],
    surfaceColor: palette.roles.surface,
    displayFontFamily: display?.style?.fontFamily,
    bodyFontFamily: body?.style?.fontFamily,
    sourceUrl: dna.identity.sourceUrl
  };
  return {
    profile,
    designDna: dna,
    receipt: {
      schemaVersion: "brand-harvest-receipt.v1",
      requestId: context.requestId,
      durationMs: finite(context.durationMs),
      source: { domain: context.domain },
      readiness,
      skillContract: "brand-harvester/0.2"
    }
  };
}
