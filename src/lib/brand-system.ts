import type {
  BrandfetchEvidenceArtifact,
  BrandfetchColorEvidence
} from "@/lib/brandfetch-logo";
import type {
  ScreenshotVisualEvidence,
  TypographyFamilyCue
} from "@/lib/brand-visual-evidence";
import type {
  EvidenceValue,
  ProductionArtifact
} from "@/lib/orchestration/worker-types";
import type { BrandProfile, IntelligenceConfidence } from "@/lib/types";

export type BrandEvidenceKind =
  | "visitor-supplied"
  | "verified-profile"
  | "official-dom"
  | "official-screenshot"
  | "brandfetch"
  | "third-party";

export type BrandColorRole = "ink" | "surface" | "accent" | "action";
export type BrandDensity = "open" | "balanced" | "dense";
export type BrandAssetKind = "photography" | "product-ui" | "illustration" | "diagram" | "image";

export interface FontCandidate {
  family: string;
  ref?: string;
  portable: boolean;
  fallback?: "sans" | "serif";
}

export interface FontEvidence extends EvidenceValue<string> {
  portable: boolean;
  ref?: string;
  requestedFamily?: string;
  substitution?: string;
}

export interface AssetCandidate {
  ref: string;
  kind: BrandAssetKind;
}

export interface AssetEvidence extends EvidenceValue<string> {
  kind: BrandAssetKind;
}

export interface BrandSystemV2 {
  revision: number;
  identity: { name: string; canonicalDomain: string; aliases: string[] };
  logo: {
    ref?: string;
    source?: string;
    confidence: number;
    status: "verified" | "missing";
  };
  colorRoles: {
    ink: EvidenceValue<string>;
    surface: EvidenceValue<string>;
    accent: EvidenceValue<string>;
    action: EvidenceValue<string>;
    support: EvidenceValue<string[]>;
    observedRatios?: Record<string, number>;
  };
  typography: { display: FontEvidence; body: FontEvidence };
  geometry: {
    controlRadius: number;
    cardRadius: number;
    borderWidth: number;
    shadow: string;
  };
  layout: {
    maxWidth: number;
    density: BrandDensity;
    navStyle: string;
    heroStyle: string;
  };
  imagery: { style: string; candidates: AssetEvidence[] };
  motion: { style: string; durationRangeMs: [number, number] };
  confidence: number;
  evidenceRefs: string[];
}

export interface BrandSystemEvidenceSource {
  ref: string;
  kind: BrandEvidenceKind;
  revision: number;
  observedAt: string;
  confidence: number;
  evidenceRefs?: readonly string[];
  logo?: {
    status: "verified" | "missing";
    ref?: string;
    source?: string;
    confidence?: number;
  };
  colorRoles?: Partial<Record<BrandColorRole, EvidenceValue<string>>> & {
    support?: EvidenceValue<readonly string[]>;
    observedRatios?: EvidenceValue<Record<string, number>>;
  };
  colorRoleSpecificity?: Partial<Record<BrandColorRole, "explicit" | "inferred">>;
  typography?: {
    display?: EvidenceValue<FontCandidate>;
    body?: EvidenceValue<FontCandidate>;
  };
  geometry?: {
    controlRadius?: EvidenceValue<number>;
    cardRadius?: EvidenceValue<number>;
    borderWidth?: EvidenceValue<number>;
    shadow?: EvidenceValue<string>;
  };
  layout?: {
    maxWidth?: EvidenceValue<number>;
    density?: EvidenceValue<BrandDensity>;
    navStyle?: EvidenceValue<string>;
    heroStyle?: EvidenceValue<string>;
  };
  imagery?: {
    style?: EvidenceValue<string>;
    candidates?: readonly EvidenceValue<AssetCandidate>[];
  };
  motion?: {
    style?: EvidenceValue<string>;
    durationRangeMs?: EvidenceValue<readonly [number, number]>;
  };
}

export interface CompileBrandSystemInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  identity: {
    name: string;
    canonicalDomain: string;
    aliases?: readonly string[];
  };
  sources: readonly BrandSystemEvidenceSource[];
  startedAt: string;
  completedAt: string;
}

interface RankedCandidate<T> {
  evidence: EvidenceValue<T>;
  source: BrandSystemEvidenceSource;
  specificity: number;
}

const HEX_COLOR = /^#[0-9A-F]{6}$/;
const SOURCE_AUTHORITY: Record<BrandEvidenceKind, number> = {
  "visitor-supplied": 600,
  "verified-profile": 500,
  "official-dom": 450,
  "official-screenshot": 400,
  brandfetch: 300,
  "third-party": 100
};

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function canonicalColor(value: string): string | undefined {
  const trimmed = value.trim().toUpperCase();
  if (HEX_COLOR.test(trimmed)) return trimmed;
  if (!/^#[0-9A-F]{3}$/.test(trimmed)) return undefined;
  const [red, green, blue] = trimmed.slice(1);
  return `#${red}${red}${green}${green}${blue}${blue}`;
}

function colorChannels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}

function colorLuminance(color: string): number {
  const channels = colorChannels(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorChroma(color: string): number {
  const channels = colorChannels(color);
  return Math.max(...channels) - Math.min(...channels);
}

function contrastRatio(left: string, right: string): number {
  const [lighter, darker] = [colorLuminance(left), colorLuminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function validDateScore(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function authorityFor(kind: BrandEvidenceKind, field: string): number {
  if (field === "logo") {
    if (kind === "visitor-supplied") return 700;
    if (kind === "brandfetch") return 650;
    if (kind === "verified-profile") return 600;
  }
  if (["layout", "geometry", "imagery"].includes(field) && kind === "official-screenshot") {
    return 550;
  }
  return SOURCE_AUTHORITY[kind];
}

function compareCandidates<T>(left: RankedCandidate<T>, right: RankedCandidate<T>, field: string): number {
  return (
    authorityFor(right.source.kind, field) - authorityFor(left.source.kind, field) ||
    validDateScore(right.evidence.observedAt) - validDateScore(left.evidence.observedAt) ||
    right.specificity - left.specificity ||
    right.evidence.confidence - left.evidence.confidence ||
    left.source.ref.localeCompare(right.source.ref)
  );
}

function selectCandidate<T>(
  candidates: readonly RankedCandidate<T>[],
  field: string,
  isValid: (value: T) => boolean
): RankedCandidate<T> | undefined {
  return candidates
    .filter(({ evidence }) =>
      isValid(evidence.value) &&
      clampConfidence(evidence.confidence) === evidence.confidence
    )
    .sort((left, right) => compareCandidates(left, right, field))[0];
}

function evidence<T>(
  value: T,
  source: string,
  confidence: number,
  observedAt: string,
  revision: number
): EvidenceValue<T> {
  return { value, source, confidence: clampConfidence(confidence), observedAt, revision };
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] ?? "";
}

function confidenceNumber(value: IntelligenceConfidence | undefined): number {
  return value === "high" ? 0.9 : value === "medium" ? 0.7 : 0.4;
}

function safeFontFor(candidate: FontCandidate | undefined): { family: string; fallback: "sans" | "serif" } {
  const serif = candidate?.fallback === "serif" || /\bserif\b/i.test(candidate?.family ?? "");
  return serif
    ? { family: "Georgia", fallback: "serif" }
    : { family: "Arial", fallback: "sans" };
}

function compileFont(
  selected: RankedCandidate<FontCandidate> | undefined,
  role: "display" | "body",
  input: CompileBrandSystemInput
): FontEvidence {
  if (!selected) {
    const safe = safeFontFor(undefined);
    return {
      ...evidence(
        safe.family,
        "brand-compiler:safe-font-fallback",
        0,
        input.completedAt,
        input.revision
      ),
      portable: true,
      substitution: `missing ${role} font -> ${safe.family}`
    };
  }
  const candidate = selected.evidence.value;
  if (candidate.portable) {
    return {
      ...evidence(
        candidate.family,
        selected.evidence.source,
        selected.evidence.confidence,
        selected.evidence.observedAt,
        input.revision
      ),
      portable: true,
      ...(candidate.ref ? { ref: candidate.ref } : {})
    };
  }
  const safe = safeFontFor(candidate);
  return {
    ...evidence(
      safe.family,
      selected.evidence.source,
      selected.evidence.confidence * 0.75,
      selected.evidence.observedAt,
      input.revision
    ),
    portable: true,
    requestedFamily: candidate.family,
    substitution: `${candidate.family} -> ${safe.family}`
  };
}

function observedRatioColorCandidates(
  source: BrandSystemEvidenceSource
): Partial<Record<BrandColorRole, EvidenceValue<string>>> {
  const ratios = source.colorRoles?.observedRatios;
  if (!ratios || ratios.revision !== source.revision) return {};
  const colors = Object.entries(ratios.value)
    .map(([rawColor, ratio]) => ({ color: canonicalColor(rawColor), ratio }))
    .filter(
      (item): item is { color: string; ratio: number } =>
        Boolean(item.color) && Number.isFinite(item.ratio) && item.ratio > 0
    )
    .sort((left, right) => right.ratio - left.ratio || left.color.localeCompare(right.color));
  const surface = colors[0]?.color;
  if (!surface) return {};
  const ink = colors
    .filter(({ color }) => color !== surface)
    .sort((left, right) =>
      contrastRatio(right.color, surface) - contrastRatio(left.color, surface)
    )[0]?.color;
  const accent = colors
    .filter(({ color }) => color !== surface && color !== ink && colorChroma(color) >= 28)
    .sort((left, right) => colorChroma(right.color) - colorChroma(left.color))[0]?.color;
  const make = (value: string | undefined, confidenceFactor: number) =>
    value
      ? evidence(
          value,
          ratios.source,
          ratios.confidence * confidenceFactor,
          ratios.observedAt,
          ratios.revision
        )
      : undefined;
  return {
    surface: make(surface, 0.85),
    ink: make(ink, 0.75),
    accent: make(accent, 0.65),
    action: make(accent, 0.55)
  };
}

function currentSources(input: CompileBrandSystemInput): BrandSystemEvidenceSource[] {
  return input.sources.filter(
    (source) =>
      source.revision === input.revision &&
      clampConfidence(source.confidence) === source.confidence
  );
}

function collectCandidates<T>(
  sources: readonly BrandSystemEvidenceSource[],
  getValue: (source: BrandSystemEvidenceSource) => EvidenceValue<T> | undefined,
  specificity: (source: BrandSystemEvidenceSource) => number = () => 2
): RankedCandidate<T>[] {
  return sources.flatMap((source) => {
    const value = getValue(source);
    if (!value || value.revision !== source.revision) return [];
    return [{ evidence: value, source, specificity: specificity(source) }];
  });
}

function selectedEvidence<T>(
  selected: RankedCandidate<T>,
  revision: number
): EvidenceValue<T> {
  return {
    ...selected.evidence,
    confidence: clampConfidence(selected.evidence.confidence),
    revision
  };
}

function profilePaletteIsEvidence(profile: BrandProfile): boolean {
  const palette = profile.diagnostics?.palette;
  return Boolean(
    palette &&
    palette.strategy !== "fallback" &&
    palette.confidence !== "low"
  );
}

function profileLogoIsVerified(profile: BrandProfile): boolean {
  const strategy = profile.diagnostics?.logo.strategy;
  if (profile.identity?.confirmationStatus === "rejected") return false;
  if (profile.portableLogo) return true;
  return Boolean(
    profile.logoUrl &&
    strategy &&
    [
      "brandfetch-brand-api",
      "brandfetch-logo-api",
      "brandfetch-portable",
      "inline-svg-portable",
      "official-remote-portable",
      "verified-profile"
    ].includes(strategy)
  );
}

function profileDensity(profile: BrandProfile): BrandDensity | undefined {
  const section = profile.designDna?.spacing?.sectionBlockPx;
  const gap = profile.designDna?.spacing?.gridGapPx;
  if (section === undefined && gap === undefined) return undefined;
  if ((section ?? 80) >= 112 && (gap ?? 24) >= 24) return "open";
  if ((section ?? 80) <= 72 && (gap ?? 16) <= 12) return "dense";
  return "balanced";
}

function profileShadow(profile: BrandProfile): string | undefined {
  return profile.designDna?.cards?.shadow;
}

export function brandProfileToBrandSystemEvidence(
  profile: BrandProfile,
  metadata: {
    revision: number;
    observedAt: string;
    ref?: string;
    confidence?: number;
  }
): BrandSystemEvidenceSource {
  const ref = metadata.ref ?? `official:${normalizeDomain(profile.sourceUrl || profile.domain)}`;
  const sourceConfidence = metadata.confidence ??
    confidenceNumber(profile.designDna?.confidence ?? profile.diagnostics?.palette?.confidence);
  const make = <T>(value: T, confidence = sourceConfidence): EvidenceValue<T> =>
    evidence(value, profile.sourceUrl || ref, confidence, metadata.observedAt, metadata.revision);
  const paletteVerified = profilePaletteIsEvidence(profile);
  const ink = paletteVerified ? canonicalColor(profile.primaryColor) : undefined;
  const surface = paletteVerified ? canonicalColor(profile.surfaceColor) : undefined;
  const accent = paletteVerified ? canonicalColor(profile.accentColor) : undefined;
  const action = paletteVerified
    ? canonicalColor(profile.designDna?.buttons?.primaryBackground ?? profile.accentColor)
    : undefined;
  const support = paletteVerified
    ? [
        ...profile.colors,
        ...Object.values(profile.designDna?.colors ?? {})
      ]
        .map(canonicalColor)
        .filter((color): color is string => Boolean(color))
        .filter((color, index, colors) =>
          ![ink, surface, accent, action].includes(color) && colors.indexOf(color) === index
        )
    : [];
  const logoRef = profile.portableLogo
    ? `portable-logo:${profile.portableLogo.sha256}`
    : profile.logoUrl;
  const logoVerified = profileLogoIsVerified(profile);
  const kind: BrandEvidenceKind =
    profile.diagnostics?.palette?.strategy === "verified-profile" ||
    profile.diagnostics?.logo.strategy === "verified-profile"
      ? "verified-profile"
      : "official-dom";
  const fallback = profile.designDna?.typography?.fallback;
  const displayFont = profile.displayFontFamily
    ? make<FontCandidate>({
        family: profile.displayFontFamily,
        ref: profile.displayFontUrl,
        portable: false,
        fallback
      })
    : undefined;
  const bodyFont = profile.bodyFontFamily
    ? make<FontCandidate>({
        family: profile.bodyFontFamily,
        ref: profile.bodyFontUrl,
        portable: false,
        fallback
      })
    : undefined;
  const density = profileDensity(profile);
  const assets = profile.imageUrls.map((imageRef) =>
    make<AssetCandidate>({ ref: imageRef, kind: "image" }, sourceConfidence * 0.85)
  );

  return {
    ref,
    kind,
    revision: metadata.revision,
    observedAt: metadata.observedAt,
    confidence: clampConfidence(sourceConfidence),
    evidenceRefs: [profile.sourceUrl],
    logo: {
      status: logoVerified ? "verified" : "missing",
      ...(logoVerified && logoRef ? { ref: logoRef } : {}),
      ...(logoVerified && (profile.logoSourceUrl ?? profile.logoUrl)
        ? { source: profile.logoSourceUrl ?? profile.logoUrl }
        : {}),
      confidence: logoVerified ? confidenceNumber(profile.identity?.confidence) : 0
    },
    colorRoles: {
      ...(ink ? { ink: make(ink) } : {}),
      ...(surface ? { surface: make(surface) } : {}),
      ...(accent ? { accent: make(accent) } : {}),
      ...(action ? { action: make(action) } : {}),
      ...(paletteVerified ? { support: make<readonly string[]>(support) } : {})
    },
    colorRoleSpecificity: {
      ink: "explicit",
      surface: "explicit",
      accent: "explicit",
      action: profile.designDna?.buttons?.primaryBackground ? "explicit" : "inferred"
    },
    typography: {
      ...(displayFont ? { display: displayFont } : {}),
      ...(bodyFont ? { body: bodyFont } : {})
    },
    geometry: {
      ...(profile.designDna?.buttons?.radiusPx !== undefined
        ? { controlRadius: make(profile.designDna.buttons.radiusPx) }
        : {}),
      ...(profile.designDna?.cards?.radiusPx !== undefined
        ? { cardRadius: make(profile.designDna.cards.radiusPx) }
        : {}),
      ...(profile.designDna?.buttons?.borderWidthPx !== undefined
        ? { borderWidth: make(profile.designDna.buttons.borderWidthPx) }
        : {}),
      ...(profileShadow(profile) ? { shadow: make(profileShadow(profile)!) } : {})
    },
    layout: {
      ...(profile.designDna?.spacing?.contentMaxWidthPx !== undefined
        ? { maxWidth: make(profile.designDna.spacing.contentMaxWidthPx) }
        : {}),
      ...(density ? { density: make(density) } : {})
    },
    imagery: {
      style: make(assets.length ? "image-led" : profile.designDna?.theme?.motif === "technical-grid"
        ? "diagram-led"
        : "type-led"),
      candidates: assets
    }
  };
}

function brandfetchColorRoles(
  colors: readonly BrandfetchColorEvidence[],
  make: <T>(value: T, confidence?: number) => EvidenceValue<T>
): BrandSystemEvidenceSource["colorRoles"] {
  const normalized = colors
    .map((color) => ({ color: canonicalColor(color.hex), type: color.type?.toLowerCase() ?? "" }))
    .filter((item): item is { color: string; type: string } => Boolean(item.color));
  const explicitSurface = normalized.find(({ type }) => /background|surface/.test(type))?.color;
  const explicitInk = normalized.find(({ type }) => /text|foreground|ink/.test(type))?.color;
  const explicitAccent = normalized.find(({ type }) => /accent|brand|primary/.test(type))?.color;
  const byLightness = [...normalized].sort(
    (left, right) => colorLuminance(left.color) - colorLuminance(right.color)
  );
  const surface = explicitSurface ?? byLightness.at(-1)?.color;
  const ink = explicitInk ?? byLightness[0]?.color;
  const accent = explicitAccent ?? normalized
    .filter(({ color }) => color !== surface && color !== ink)
    .sort((left, right) => colorChroma(right.color) - colorChroma(left.color))[0]?.color;
  const support = normalized
    .map(({ color }) => color)
    .filter((color, index, values) =>
      ![surface, ink, accent].includes(color) && values.indexOf(color) === index
    );
  return {
    ...(ink ? { ink: make(ink, explicitInk ? 0.8 : 0.55) } : {}),
    ...(surface ? { surface: make(surface, explicitSurface ? 0.8 : 0.55) } : {}),
    ...(accent ? { accent: make(accent, explicitAccent ? 0.75 : 0.5) } : {}),
    ...(accent ? { action: make(accent, explicitAccent ? 0.65 : 0.4) } : {}),
    support: make<readonly string[]>(support, 0.5)
  };
}

export function brandfetchArtifactToBrandSystemEvidence(
  artifact: BrandfetchEvidenceArtifact
): BrandSystemEvidenceSource | undefined {
  if (!artifact.value || !["complete", "fallback"].includes(artifact.status)) return undefined;
  const value = artifact.value;
  const observedAt = artifact.completedAt;
  const make = <T>(candidate: T, factor = 1): EvidenceValue<T> =>
    evidence(
      candidate,
      `brandfetch:${value.matchedDomain}`,
      artifact.confidence * factor,
      observedAt,
      artifact.revision
    );
  const logoRef = value.logo.url ??
    (value.logo.portable ? `portable-logo:${value.logo.portable.sha256}` : undefined);
  return {
    ref: `brandfetch:${value.matchedDomain}`,
    kind: "brandfetch",
    revision: artifact.revision,
    observedAt,
    confidence: clampConfidence(artifact.confidence),
    evidenceRefs: artifact.evidenceRefs,
    logo: {
      status: value.logo.status === "verified" && logoRef ? "verified" : "missing",
      ...(value.logo.status === "verified" && logoRef ? { ref: logoRef } : {}),
      ...(value.logo.url ? { source: value.logo.url } : {}),
      confidence: value.logo.status === "verified" ? artifact.confidence : 0
    },
    colorRoles: brandfetchColorRoles(value.colors, make),
    colorRoleSpecificity: {
      ink: "inferred",
      surface: "inferred",
      accent: "inferred",
      action: "inferred"
    },
    typography: {
      ...(value.fonts[0]
        ? {
            display: make<FontCandidate>({
              family: value.fonts[0].name,
              portable: false
            }, 0.7)
          }
        : {}),
      ...(value.fonts[1] ?? value.fonts[0]
        ? {
            body: make<FontCandidate>({
              family: (value.fonts[1] ?? value.fonts[0])!.name,
              portable: false
            }, 0.7)
          }
        : {})
    }
  };
}

function familyCueFallback(family: TypographyFamilyCue): "sans" | "serif" {
  return family === "serif-editorial" ? "serif" : "sans";
}

function familyCueName(family: TypographyFamilyCue): string {
  return family === "serif-editorial" ? "evidence-serif" : "evidence-sans";
}

export function screenshotArtifactToBrandSystemEvidence(
  artifact: ProductionArtifact<ScreenshotVisualEvidence>
): BrandSystemEvidenceSource | undefined {
  if (!artifact.value || !["complete", "fallback"].includes(artifact.status)) return undefined;
  const value = artifact.value;
  const observedRatios = value.observedColorRatios
    ? {
        ...value.observedColorRatios,
        value: Object.fromEntries(
          value.observedColorRatios.value.map(({ color, ratio }) => [color, ratio])
        )
      }
    : undefined;
  const typography = value.typography
    ? {
        ...value.typography,
        value: {
          family: familyCueName(value.typography.value.family),
          portable: false,
          fallback: familyCueFallback(value.typography.value.family)
        }
      }
    : undefined;
  const source: BrandSystemEvidenceSource = {
    ref: artifact.evidenceRefs[0]?.split("#")[0] ?? "screenshot:desktop",
    kind: "official-screenshot",
    revision: artifact.revision,
    observedAt: artifact.completedAt,
    confidence: clampConfidence(artifact.confidence),
    evidenceRefs: artifact.evidenceRefs,
    colorRoles: {
      ...(observedRatios ? { observedRatios } : {})
    },
    colorRoleSpecificity: {
      ink: "inferred",
      surface: "inferred",
      accent: "inferred",
      action: "inferred"
    },
    typography: {
      ...(typography ? { display: typography, body: typography } : {})
    },
    geometry: {
      ...(value.radii.controlPx ? { controlRadius: value.radii.controlPx } : {}),
      ...(value.radii.cardPx ? { cardRadius: value.radii.cardPx } : {})
    },
    layout: {
      ...(value.density ? { density: value.density } : {}),
      ...(value.navigation ? { navStyle: value.navigation } : {}),
      ...(value.hero ? { heroStyle: value.hero } : {})
    },
    imagery: {
      ...(value.imagery
        ? {
            style: {
              ...value.imagery,
              value: value.imagery.value.style
            }
          }
        : {}),
      candidates: []
    }
  };
  const inferred = observedRatioColorCandidates(source);
  source.colorRoles = { ...source.colorRoles, ...inferred };
  return source;
}

function artifactBase(input: CompileBrandSystemInput) {
  return {
    worker: "brand-compiler" as const,
    sessionId: input.sessionId,
    revision: input.revision,
    startedAt: input.startedAt,
    completedAt: input.completedAt
  };
}

function selectedOrDefault<T>(
  selected: RankedCandidate<T> | undefined,
  fallback: T
): T {
  return selected?.evidence.value ?? fallback;
}

export function compileBrandSystemV2(
  input: CompileBrandSystemInput
): ProductionArtifact<BrandSystemV2> {
  const base = artifactBase(input);
  if (
    !Number.isInteger(input.revision) ||
    input.revision < 0 ||
    !Number.isInteger(input.activeRevision) ||
    input.activeRevision < 0
  ) {
    return {
      ...base,
      status: "failed",
      evidenceRefs: [],
      confidence: 0,
      errorCode: "invalid_revision"
    };
  }
  if (input.revision !== input.activeRevision) {
    return {
      ...base,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      errorCode: "stale_revision"
    };
  }

  const sources = currentSources(input);
  const colorCandidates = (role: BrandColorRole) =>
    collectCandidates(
      sources,
      (source) => source.colorRoles?.[role],
      (source) => source.colorRoleSpecificity?.[role] === "explicit" ? 2 : 1
    );
  const selectedInk = selectCandidate(colorCandidates("ink"), "color", (value) =>
    Boolean(canonicalColor(value))
  );
  const selectedSurface = selectCandidate(colorCandidates("surface"), "color", (value) =>
    Boolean(canonicalColor(value))
  );
  if (!selectedInk || !selectedSurface) {
    return {
      ...base,
      status: "failed",
      evidenceRefs: [],
      confidence: 0,
      errorCode: "verified_neutral_colors_unavailable"
    };
  }

  const normalizedColorEvidence = (
    selected: RankedCandidate<string>
  ): EvidenceValue<string> => ({
    ...selectedEvidence(selected, input.revision),
    value: canonicalColor(selected.evidence.value)!
  });
  const ink = normalizedColorEvidence(selectedInk);
  const surface = normalizedColorEvidence(selectedSurface);
  const selectedAccent = selectCandidate(colorCandidates("accent"), "color", (value) =>
    Boolean(canonicalColor(value))
  );
  const accent = selectedAccent
    ? normalizedColorEvidence(selectedAccent)
    : { ...ink, confidence: ink.confidence * 0.7 };
  const selectedAction = selectCandidate(colorCandidates("action"), "color", (value) =>
    Boolean(canonicalColor(value))
  );
  const action = selectedAction
    ? normalizedColorEvidence(selectedAction)
    : { ...accent, confidence: accent.confidence * 0.8 };
  const selectedSupport = selectCandidate(
    collectCandidates(sources, (source) => source.colorRoles?.support),
    "color",
    (values) => values.every((value) => Boolean(canonicalColor(value)))
  );
  const supportValues = selectedSupport?.evidence.value
    .map(canonicalColor)
    .filter((color): color is string => Boolean(color))
    .filter((color, index, values) =>
      ![ink.value, surface.value, accent.value, action.value].includes(color) &&
      values.indexOf(color) === index
    ) ?? [];
  const support = selectedSupport
    ? {
        ...selectedEvidence(selectedSupport, input.revision),
        value: supportValues
      }
    : evidence<readonly string[]>(
        [],
        ink.source,
        Math.min(ink.confidence, surface.confidence) * 0.6,
        ink.observedAt,
        input.revision
      );
  const selectedRatios = selectCandidate(
    collectCandidates(sources, (source) => source.colorRoles?.observedRatios),
    "color",
    (ratios) =>
      Object.entries(ratios).every(([color, ratio]) =>
        Boolean(canonicalColor(color)) && Number.isFinite(ratio) && ratio > 0
      )
  );
  const observedRatios = selectedRatios
    ? Object.fromEntries(
        Object.entries(selectedRatios.evidence.value).map(([color, ratio]) => [
          canonicalColor(color)!,
          ratio
        ])
      )
    : undefined;

  const selectedLogo = sources
    .filter((source) => source.logo?.status === "verified" && source.logo.ref)
    .map((source): RankedCandidate<string> => ({
      evidence: evidence(
        source.logo!.ref!,
        source.logo!.source ?? source.ref,
        source.logo!.confidence ?? source.confidence,
        source.observedAt,
        source.revision
      ),
      source,
      specificity: 2
    }))
    .sort((left, right) => compareCandidates(left, right, "logo"))[0];
  const logo = selectedLogo
    ? {
        ref: selectedLogo.evidence.value,
        source: selectedLogo.evidence.source,
        confidence: selectedLogo.evidence.confidence,
        status: "verified" as const
      }
    : { confidence: 0, status: "missing" as const };

  const selectedDisplay = selectCandidate(
    collectCandidates(sources, (source) => source.typography?.display),
    "typography",
    (value) => Boolean(value.family.trim())
  );
  const selectedBody = selectCandidate(
    collectCandidates(sources, (source) => source.typography?.body),
    "typography",
    (value) => Boolean(value.family.trim())
  );
  const display = compileFont(selectedDisplay ?? selectedBody, "display", input);
  const body = compileFont(selectedBody ?? selectedDisplay, "body", input);

  const numeric = (
    getter: (source: BrandSystemEvidenceSource) => EvidenceValue<number> | undefined,
    field: string,
    maximum: number
  ) => selectCandidate(
    collectCandidates(sources, getter),
    field,
    (value) => Number.isFinite(value) && value >= 0 && value <= maximum
  );
  const controlRadius = numeric((source) => source.geometry?.controlRadius, "geometry", 256);
  const cardRadius = numeric((source) => source.geometry?.cardRadius, "geometry", 256);
  const borderWidth = numeric((source) => source.geometry?.borderWidth, "geometry", 16);
  const shadow = selectCandidate(
    collectCandidates(sources, (source) => source.geometry?.shadow),
    "geometry",
    (value) => value.trim().length > 0 && value.length <= 120
  );
  const maxWidth = selectCandidate(
    collectCandidates(sources, (source) => source.layout?.maxWidth),
    "layout",
    (value) => Number.isFinite(value) && value >= 640 && value <= 2400
  );
  const density = selectCandidate(
    collectCandidates(sources, (source) => source.layout?.density),
    "layout",
    (value) => ["open", "balanced", "dense"].includes(value)
  );
  const navStyle = selectCandidate(
    collectCandidates(sources, (source) => source.layout?.navStyle),
    "layout",
    (value) => value.trim().length > 0 && value.length <= 48
  );
  const heroStyle = selectCandidate(
    collectCandidates(sources, (source) => source.layout?.heroStyle),
    "layout",
    (value) => value.trim().length > 0 && value.length <= 48
  );
  const imageryStyle = selectCandidate(
    collectCandidates(sources, (source) => source.imagery?.style),
    "imagery",
    (value) => value.trim().length > 0 && value.length <= 48
  );
  const assets = sources
    .flatMap((source) =>
      (source.imagery?.candidates ?? [])
        .filter((candidate) => candidate.revision === source.revision && candidate.value.ref.trim())
        .map((candidate) => ({ candidate, source }))
    )
    .sort((left, right) =>
      compareCandidates(
        { evidence: left.candidate, source: left.source, specificity: 2 },
        { evidence: right.candidate, source: right.source, specificity: 2 },
        "imagery"
      )
    )
    .filter(
      ({ candidate }, index, values) =>
        values.findIndex((other) => other.candidate.value.ref === candidate.value.ref) === index
    )
    .slice(0, 6)
    .map(({ candidate }): AssetEvidence => ({
      ...evidence(
        candidate.value.ref,
        candidate.source,
        candidate.confidence,
        candidate.observedAt,
        input.revision
      ),
      kind: candidate.value.kind
    }));
  const compiledImageryStyle = assets.length
    ? selectedOrDefault(imageryStyle, "image-led")
    : selectedOrDefault(imageryStyle, "type-led") === "diagram-led" ||
        selectedOrDefault(imageryStyle, "type-led") === "diagram"
      ? "diagram-led"
      : "type-led";
  const motionStyle = selectCandidate(
    collectCandidates(sources, (source) => source.motion?.style),
    "motion",
    (value) => value.trim().length > 0 && value.length <= 48
  );
  const motionRange = selectCandidate(
    collectCandidates(sources, (source) => source.motion?.durationRangeMs),
    "motion",
    (value) =>
      value.length === 2 &&
      value.every((item) => Number.isFinite(item) && item >= 0 && item <= 5000) &&
      value[0] <= value[1]
  );

  const aliases = [
    ...new Set(
      (input.identity.aliases ?? [])
        .map(normalizeDomain)
        .filter(Boolean)
        .filter((alias) => alias !== normalizeDomain(input.identity.canonicalDomain))
    )
  ].sort();
  const selected = [
    selectedInk,
    selectedSurface,
    selectedAccent,
    selectedAction,
    selectedSupport,
    selectedRatios,
    selectedLogo,
    selectedDisplay,
    selectedBody,
    controlRadius,
    cardRadius,
    borderWidth,
    shadow,
    maxWidth,
    density,
    navStyle,
    heroStyle,
    imageryStyle,
    motionStyle,
    motionRange
  ];
  const selectedRefs: string[] = [];
  for (const item of selected) {
    if (!item) continue;
    selectedRefs.push(item.source.ref, item.evidence.source, ...(item.source.evidenceRefs ?? []));
  }
  const evidenceRefs = [
    ...new Set(selectedRefs)
  ].filter(Boolean).sort();
  const confidenceValues = [
    ink.confidence,
    surface.confidence,
    accent.confidence,
    action.confidence,
    display.confidence,
    body.confidence,
    ...(selectedLogo ? [selectedLogo.evidence.confidence] : []),
    ...assets.map((asset) => asset.confidence)
  ];
  const confidence = clampConfidence(
    confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
  );
  const fallbackReasons = [
    !selectedAccent && "neutral-accent",
    !selectedAction && "neutral-action",
    !selectedLogo && "missing-logo",
    !selectedDisplay && !selectedBody && "safe-font",
    !controlRadius && "control-radius",
    !cardRadius && "card-radius",
    !assets.length && "missing-imagery",
    !motionStyle && "motion"
  ].filter(Boolean);
  const system: BrandSystemV2 = {
    revision: input.revision,
    identity: {
      name: input.identity.name.trim(),
      canonicalDomain: normalizeDomain(input.identity.canonicalDomain),
      aliases
    },
    logo,
    colorRoles: {
      ink,
      surface,
      accent,
      action,
      support: { ...support, value: [...support.value] },
      ...(observedRatios ? { observedRatios } : {})
    },
    typography: { display, body },
    geometry: {
      controlRadius: selectedOrDefault(controlRadius, 0),
      cardRadius: selectedOrDefault(cardRadius, 0),
      borderWidth: selectedOrDefault(borderWidth, 0),
      shadow: selectedOrDefault(shadow, "none")
    },
    layout: {
      maxWidth: selectedOrDefault(maxWidth, 1200),
      density: selectedOrDefault(density, "balanced"),
      navStyle: selectedOrDefault(navStyle, "minimal"),
      heroStyle: selectedOrDefault(heroStyle, assets.length ? "image-led" : "type-led")
    },
    imagery: {
      style: compiledImageryStyle,
      candidates: assets
    },
    motion: {
      style: selectedOrDefault(motionStyle, "none"),
      durationRangeMs: motionRange
        ? [motionRange.evidence.value[0], motionRange.evidence.value[1]]
        : [0, 0]
    },
    confidence,
    evidenceRefs
  };

  return {
    ...base,
    status: fallbackReasons.length ? "fallback" : "complete",
    value: system,
    evidenceRefs,
    confidence,
    ...(fallbackReasons.length
      ? { fallbackCode: `brand_system_partial:${fallbackReasons.join(",")}` }
      : {})
  };
}
