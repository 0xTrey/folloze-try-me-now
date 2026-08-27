/**
 * Evidence-backed semantic brand compilation.
 *
 * The compiler answers "what does this brand actually do" rather than "what
 * colour appeared first". Colours are classified by component role and voted
 * on by visible area, frequency, contrast use, and source authority. Geometry
 * comes from the representative shape of a component class, not the first
 * observed radius. Every applied role carries its evidence, confidence,
 * authority, and the reason it was selected.
 *
 * Nothing here is company-specific. All behaviour derives from the supplied
 * observations.
 */

export type BrandSourceAuthority =
  | "visitor_supplied"
  | "verified_profile"
  | "official_dom"
  | "official_screenshot"
  | "brandfetch"
  | "third_party";

export type BrandComponentRole =
  | "text"
  | "surface"
  | "action"
  | "border"
  | "decorative";

/**
 * Where a colour was observed. Anything other than `persistent` is treated as
 * transient chrome and cannot define the brand on its own.
 */
export type BrandSurfaceKind =
  | "persistent"
  | "promotional"
  | "overlay"
  | "consent"
  | "modal"
  | "disabled"
  | "navigation_utility"
  | "unknown";

export type BrandSemanticColorRole =
  | "primary"
  | "accent"
  | "surface"
  | "surfaceAlt"
  | "text"
  | "textMuted"
  | "border"
  | "ctaBackground"
  | "ctaText"
  | "link"
  | "focus";

export type BrandSemanticTypographyRole =
  | "headingFont"
  | "bodyFont"
  | "fontCharacter"
  | "weightCharacter";

export type BrandSemanticGeometryRole =
  | "buttonRadius"
  | "cardRadius"
  | "containerRadius"
  | "borderWidth"
  | "shadowCharacter"
  | "density";

export type BrandSemanticRole =
  | BrandSemanticColorRole
  | BrandSemanticTypographyRole
  | BrandSemanticGeometryRole;

export type GeometryComponentClass =
  | "button"
  | "input"
  | "card"
  | "container"
  | "media"
  | "chip";

export type ShadowCharacter = "none" | "hairline" | "soft" | "elevated";
export type FontCharacter = "geometric" | "humanist" | "neutral" | "serif" | "mixed";
export type WeightCharacter = "light" | "regular" | "medium" | "bold" | "heavy";
export type BrandDensityCharacter = "open" | "balanced" | "dense";

export interface BrandColorObservation {
  color: string;
  componentRole: BrandComponentRole;
  sourceAuthority: BrandSourceAuthority;
  evidenceRef: string;
  /** Share of the visible viewport this colour occupies, 0..1. */
  areaRatio?: number;
  /** How many distinct components used the colour. */
  frequency?: number;
  /** True when the colour was used as a foreground against a surface. */
  contrastUse?: boolean;
  surfaceKind?: BrandSurfaceKind;
  confidence?: number;
}

export interface GeometryObservation {
  componentClass: GeometryComponentClass;
  valuePx: number;
  sourceAuthority: BrandSourceAuthority;
  evidenceRef: string;
  /** Relative importance, typically the observed component count. */
  weight?: number;
  confidence?: number;
  surfaceKind?: BrandSurfaceKind;
}

export interface BorderObservation {
  componentClass: GeometryComponentClass;
  widthPx: number;
  sourceAuthority: BrandSourceAuthority;
  evidenceRef: string;
  weight?: number;
  confidence?: number;
}

export interface ShadowObservation {
  character: ShadowCharacter;
  sourceAuthority: BrandSourceAuthority;
  evidenceRef: string;
  weight?: number;
  confidence?: number;
}

export interface TypographyObservation {
  role: "heading" | "body";
  family: string;
  portable: boolean;
  character?: FontCharacter;
  weight?: number;
  sourceAuthority: BrandSourceAuthority;
  evidenceRef: string;
  confidence?: number;
}

export interface DensityObservation {
  sectionBlockPx?: number;
  gridGapPx?: number;
  sourceAuthority: BrandSourceAuthority;
  evidenceRef: string;
  confidence?: number;
}

export interface BrandSemanticEvidence {
  colors?: readonly BrandColorObservation[];
  radii?: readonly GeometryObservation[];
  borders?: readonly BorderObservation[];
  shadows?: readonly ShadowObservation[];
  typography?: readonly TypographyObservation[];
  density?: readonly DensityObservation[];
}

export interface SemanticRoleSelection<T> {
  role: BrandSemanticRole;
  value: T;
  applied: boolean;
  confidence: number;
  sourceAuthority: BrandSourceAuthority | "derived";
  evidenceRefs: string[];
  candidateCount: number;
  selectionReasons: string[];
}

export interface BrandSemanticSystem {
  version: "brand-semantics-v1";
  colors: Record<BrandSemanticColorRole, SemanticRoleSelection<string>>;
  typography: {
    headingFont: SemanticRoleSelection<string>;
    bodyFont: SemanticRoleSelection<string>;
    fontCharacter: SemanticRoleSelection<FontCharacter>;
    weightCharacter: SemanticRoleSelection<WeightCharacter>;
  };
  geometry: {
    buttonRadius: SemanticRoleSelection<number>;
    cardRadius: SemanticRoleSelection<number>;
    containerRadius: SemanticRoleSelection<number>;
    borderWidth: SemanticRoleSelection<number>;
    shadowCharacter: SemanticRoleSelection<ShadowCharacter>;
    density: SemanticRoleSelection<BrandDensityCharacter>;
  };
  warnings: string[];
  /** Provisional 0..1 quality score. It never gates a render. */
  score: number;
  evidenceRefs: string[];
}

const AUTHORITY_WEIGHT: Record<BrandSourceAuthority, number> = {
  visitor_supplied: 1,
  verified_profile: 0.92,
  official_dom: 0.85,
  official_screenshot: 0.78,
  brandfetch: 0.55,
  third_party: 0.2
};

/** Surfaces that cannot define the brand unless a persistent surface agrees. */
const TRANSIENT_SURFACES = new Set<BrandSurfaceKind>([
  "promotional",
  "overlay",
  "consent",
  "modal",
  "disabled",
  "navigation_utility"
]);

const HEX = /^#[0-9A-F]{6}$/;

function canonicalColor(value: string): string | undefined {
  const trimmed = value.trim().toUpperCase();
  if (HEX.test(trimmed)) return trimmed;
  if (!/^#[0-9A-F]{3}$/.test(trimmed)) return undefined;
  const [red, green, blue] = trimmed.slice(1);
  return `#${red}${red}${green}${green}${blue}${blue}`;
}

function channels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}

function luminance(color: string): number {
  const linear = channels(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function chroma(color: string): number {
  const values = channels(color);
  return Math.max(...values) - Math.min(...values);
}

export function contrastRatio(left: string, right: string): number {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function mix(left: string, right: string, weight: number): string {
  const a = channels(left);
  const b = channels(right);
  const blend = a.map((channel, index) =>
    Math.round(channel * (1 - weight) + b[index]! * weight)
  );
  return `#${blend.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function clamp01(value: number | undefined, fallback = 0.5): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/* -------------------------------------------------------------------------- */
/* Colour voting                                                               */
/* -------------------------------------------------------------------------- */

interface ScoredColor {
  color: string;
  componentRole: BrandComponentRole;
  score: number;
  confidence: number;
  authority: BrandSourceAuthority;
  evidenceRefs: string[];
  persistent: boolean;
  reasons: string[];
}

/**
 * Scores each observed colour by component role, visible area, frequency,
 * contrast use, and source authority. Transient chrome only survives when a
 * persistent observation corroborates the same colour in the same role.
 */
export function scoreColorObservations(
  observations: readonly BrandColorObservation[]
): ScoredColor[] {
  const persistentByRole = new Set<string>();
  const normalized = observations.flatMap((observation) => {
    const color = canonicalColor(observation.color);
    if (!color) return [];
    const surfaceKind = observation.surfaceKind ?? "unknown";
    const persistent = !TRANSIENT_SURFACES.has(surfaceKind);
    if (persistent) persistentByRole.add(`${observation.componentRole}\u0000${color}`);
    return [{ ...observation, color, surfaceKind, persistent }];
  });

  const aggregates = new Map<string, ScoredColor>();
  for (const observation of normalized) {
    const key = `${observation.componentRole}\u0000${observation.color}`;
    const corroborated = persistentByRole.has(key);
    if (!observation.persistent && !corroborated) continue;

    const authorityWeight = AUTHORITY_WEIGHT[observation.sourceAuthority];
    const area = clamp01(observation.areaRatio, 0);
    const frequency = Math.min(1, Math.max(0, (observation.frequency ?? 0) / 12));
    const contrast = observation.contrastUse ? 1 : 0;
    const presence = area * 0.5 + frequency * 0.3 + contrast * 0.2;
    const score = authorityWeight * Math.max(presence, 0.05);

    const reasons = [
      `component_role_${observation.componentRole}`,
      `authority_${observation.sourceAuthority}`,
      ...(area > 0 ? ["area_weighted"] : []),
      ...(observation.frequency ? ["frequency_weighted"] : []),
      ...(observation.contrastUse ? ["contrast_use"] : []),
      ...(observation.persistent
        ? ["persistent_surface"]
        : [`corroborated_${observation.surfaceKind}`])
    ];

    const existing = aggregates.get(key);
    if (existing) {
      existing.score += score;
      existing.confidence = Math.max(
        existing.confidence,
        clamp01(observation.confidence, authorityWeight)
      );
      existing.evidenceRefs = [
        ...new Set([...existing.evidenceRefs, observation.evidenceRef])
      ];
      existing.reasons = [...new Set([...existing.reasons, ...reasons])];
      existing.persistent = existing.persistent || observation.persistent;
      if (
        AUTHORITY_WEIGHT[observation.sourceAuthority] > AUTHORITY_WEIGHT[existing.authority]
      ) {
        existing.authority = observation.sourceAuthority;
      }
      continue;
    }
    aggregates.set(key, {
      color: observation.color,
      componentRole: observation.componentRole,
      score,
      confidence: clamp01(observation.confidence, authorityWeight),
      authority: observation.sourceAuthority,
      evidenceRefs: [observation.evidenceRef],
      persistent: observation.persistent,
      reasons
    });
  }

  return [...aggregates.values()].sort(
    (left, right) => right.score - left.score || left.color.localeCompare(right.color)
  );
}

/* -------------------------------------------------------------------------- */
/* Representative geometry                                                     */
/* -------------------------------------------------------------------------- */

export type GeometryMethod =
  | "weighted_mode_then_median"
  | "weighted_median"
  | "single_observation"
  | "unavailable";

export interface RepresentativeGeometry {
  value: number;
  method: GeometryMethod;
  sampleCount: number;
  /** Difference between the largest and smallest observed value. */
  spread: number;
  confidence: number;
  evidenceRefs: string[];
  authority: BrandSourceAuthority | "derived";
  reasons: string[];
}

/** Matches the radius bound already enforced by the brand system contract. */
export const GEOMETRY_MAX_PX = 256;

/** Radius bands. A brand rarely mixes bands intentionally in one component class. */
function radiusBand(value: number): "sharp" | "moderate" | "rounded" | "pill" {
  if (value <= 2) return "sharp";
  if (value <= 12) return "moderate";
  if (value < 24) return "rounded";
  return "pill";
}

function weightedMedian(
  samples: readonly { value: number; weight: number }[]
): number {
  const sorted = [...samples].sort((left, right) => left.value - right.value);
  const total = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  if (total <= 0) return sorted[Math.floor(sorted.length / 2)]?.value ?? 0;
  let running = 0;
  for (const sample of sorted) {
    running += sample.weight;
    if (running >= total / 2) return sample.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

/**
 * Chooses the radius that represents a component class. The dominant band wins
 * on total weight, then the weighted median inside that band supplies the
 * value. A single outlier pill or a stray zero cannot capture the class.
 */
export function representativeRadius(
  observations: readonly GeometryObservation[],
  componentClass: GeometryComponentClass
): RepresentativeGeometry {
  const samples = observations
    .filter(
      (observation) =>
        observation.componentClass === componentClass
        && Number.isFinite(observation.valuePx)
        && observation.valuePx >= 0
        && !TRANSIENT_SURFACES.has(observation.surfaceKind ?? "unknown")
    )
    // `border-radius: 999px` is the common pill idiom. Clamp it to the
    // contract maximum so the intent survives instead of being discarded.
    .map((observation) => ({
      ...observation,
      valuePx: Math.min(GEOMETRY_MAX_PX, observation.valuePx)
    }));
  if (!samples.length) {
    return {
      value: 0,
      method: "unavailable",
      sampleCount: 0,
      spread: 0,
      confidence: 0,
      evidenceRefs: [],
      authority: "derived",
      reasons: ["no_current_evidence"]
    };
  }

  const weighted = samples.map((sample) => ({
    value: sample.valuePx,
    weight:
      Math.max(1, sample.weight ?? 1)
      * AUTHORITY_WEIGHT[sample.sourceAuthority]
      * clamp01(sample.confidence, 0.7),
    sample
  }));
  const values = weighted.map(({ value }) => value);
  const spread = Math.max(...values) - Math.min(...values);
  const evidenceRefs = [...new Set(samples.map(({ evidenceRef }) => evidenceRef))].sort();
  const authority = samples
    .map(({ sourceAuthority }) => sourceAuthority)
    .sort((left, right) => AUTHORITY_WEIGHT[right] - AUTHORITY_WEIGHT[left])[0]!;
  const confidence =
    weighted.reduce(
      (sum, item) => sum + clamp01(item.sample.confidence, 0.7) * item.weight,
      0
    ) / Math.max(1e-6, weighted.reduce((sum, item) => sum + item.weight, 0));

  if (weighted.length === 1) {
    return {
      value: Math.round(weighted[0]!.value),
      method: "single_observation",
      sampleCount: 1,
      spread: 0,
      confidence: clamp01(confidence, 0.5),
      evidenceRefs,
      authority,
      reasons: [`component_class_${componentClass}`, "single_observation"]
    };
  }

  const bands = new Map<string, { weight: number; samples: typeof weighted }>();
  for (const item of weighted) {
    const band = radiusBand(item.value);
    const entry = bands.get(band) ?? { weight: 0, samples: [] };
    entry.weight += item.weight;
    entry.samples.push(item);
    bands.set(band, entry);
  }
  const dominant = [...bands.entries()].sort(
    (left, right) => right[1].weight - left[1].weight || left[0].localeCompare(right[0])
  )[0]!;
  const value = Math.round(weightedMedian(dominant[1].samples));

  return {
    value,
    method: bands.size > 1 ? "weighted_mode_then_median" : "weighted_median",
    sampleCount: weighted.length,
    spread,
    confidence: clamp01(confidence, 0.5),
    evidenceRefs,
    authority,
    reasons: [
      `component_class_${componentClass}`,
      `dominant_band_${dominant[0]}`,
      ...(bands.size > 1 ? ["mixed_band_distribution"] : ["uniform_band"]),
      ...(spread > 0 ? ["representative_over_first_observed"] : [])
    ]
  };
}

export function representativeBorderWidth(
  observations: readonly BorderObservation[]
): RepresentativeGeometry {
  return representativeRadius(
    observations.map((observation) => ({
      componentClass: observation.componentClass,
      valuePx: observation.widthPx,
      sourceAuthority: observation.sourceAuthority,
      evidenceRef: observation.evidenceRef,
      ...(observation.weight !== undefined ? { weight: observation.weight } : {}),
      ...(observation.confidence !== undefined ? { confidence: observation.confidence } : {})
    })),
    observations[0]?.componentClass ?? "button"
  );
}

/* -------------------------------------------------------------------------- */
/* Role selection                                                              */
/* -------------------------------------------------------------------------- */

function selection<T>(input: {
  role: BrandSemanticRole;
  value: T;
  applied: boolean;
  confidence: number;
  authority: BrandSourceAuthority | "derived";
  evidenceRefs?: readonly string[];
  candidateCount?: number;
  reasons: readonly string[];
}): SemanticRoleSelection<T> {
  return {
    role: input.role,
    value: input.value,
    applied: input.applied,
    confidence: clamp01(input.confidence, 0),
    sourceAuthority: input.authority,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    candidateCount: input.candidateCount ?? 0,
    selectionReasons: [...new Set(input.reasons)]
  };
}

function pick(
  scored: readonly ScoredColor[],
  role: BrandComponentRole,
  predicate: (candidate: ScoredColor) => boolean = () => true
): ScoredColor | undefined {
  return scored.find(
    (candidate) => candidate.componentRole === role && predicate(candidate)
  );
}

function fontCharacterFor(
  observations: readonly TypographyObservation[]
): FontCharacter {
  const explicit = observations.find(({ character }) => character)?.character;
  if (explicit) return explicit;
  const families = observations.map(({ family }) => family.toLowerCase());
  if (families.some((family) => /serif|georgia|times|garamond|playfair/.test(family))) {
    return "serif";
  }
  if (new Set(families).size > 1) return "mixed";
  return "neutral";
}

function weightCharacterFor(observations: readonly TypographyObservation[]): WeightCharacter {
  const weights = observations
    .map(({ weight }) => weight)
    .filter((weight): weight is number => Number.isFinite(weight));
  if (!weights.length) return "regular";
  const heaviest = Math.max(...weights);
  if (heaviest >= 800) return "heavy";
  if (heaviest >= 700) return "bold";
  if (heaviest >= 600) return "medium";
  if (heaviest <= 300) return "light";
  return "regular";
}

function densityFor(
  observations: readonly DensityObservation[]
): { value: BrandDensityCharacter; confidence: number; refs: string[]; reasons: string[] } {
  const usable = observations.filter(
    (observation) =>
      observation.sectionBlockPx !== undefined || observation.gridGapPx !== undefined
  );
  if (!usable.length) {
    return {
      value: "balanced",
      confidence: 0,
      refs: [],
      reasons: ["no_current_evidence", "default_balanced"]
    };
  }
  const sections = usable
    .map(({ sectionBlockPx }) => sectionBlockPx)
    .filter((value): value is number => Number.isFinite(value));
  const gaps = usable
    .map(({ gridGapPx }) => gridGapPx)
    .filter((value): value is number => Number.isFinite(value));
  const section = sections.length
    ? weightedMedian(sections.map((value) => ({ value, weight: 1 })))
    : 80;
  const gap = gaps.length ? weightedMedian(gaps.map((value) => ({ value, weight: 1 }))) : 20;
  const value: BrandDensityCharacter =
    section >= 112 && gap >= 24 ? "open" : section <= 72 && gap <= 16 ? "dense" : "balanced";
  return {
    value,
    confidence:
      usable.reduce((sum, item) => sum + clamp01(item.confidence, 0.7), 0) / usable.length,
    refs: [...new Set(usable.map(({ evidenceRef }) => evidenceRef))].sort(),
    reasons: ["representative_spacing_median", `density_${value}`]
  };
}

/**
 * Compiles observations into one canonical semantic system. Incomplete
 * evidence stays explicit: an unapplied role records why it fell back rather
 * than presenting a generic default as customer branding.
 */
export function compileBrandSemantics(
  evidence: BrandSemanticEvidence
): BrandSemanticSystem {
  const warnings: string[] = [];
  const scored = scoreColorObservations(evidence.colors ?? []);
  const candidateCount = scored.length;

  const surfaceCandidate =
    pick(scored, "surface", (candidate) => luminance(candidate.color) > 0.5)
    ?? pick(scored, "surface");
  const surfaceValue = surfaceCandidate?.color ?? "#FFFFFF";
  if (!surfaceCandidate) warnings.push("surface_unresolved");

  const textCandidate =
    pick(
      scored,
      "text",
      (candidate) => contrastRatio(candidate.color, surfaceValue) >= 4.5
    ) ?? pick(scored, "text");
  const textValue = textCandidate?.color ?? "#111111";
  if (!textCandidate) warnings.push("text_unresolved");

  const actionCandidates = scored.filter(
    (candidate) => candidate.componentRole === "action"
  );
  const ctaCandidate =
    actionCandidates.find((candidate) => chroma(candidate.color) >= 24)
    ?? actionCandidates[0];
  if (!ctaCandidate) warnings.push("action_unresolved");

  const decorativeCandidate = scored.find(
    (candidate) =>
      candidate.componentRole === "decorative"
      && candidate.color !== surfaceValue
      && candidate.color !== textValue
  );
  const accentCandidate = ctaCandidate ?? decorativeCandidate;
  const borderCandidate = pick(scored, "border");

  const primaryCandidate =
    actionCandidates.find((candidate) => chroma(candidate.color) >= 24)
    ?? decorativeCandidate
    ?? textCandidate;

  const ctaBackgroundValue = ctaCandidate?.color ?? textValue;
  const ctaTextValue =
    contrastRatio("#FFFFFF", ctaBackgroundValue)
      >= contrastRatio("#111111", ctaBackgroundValue)
      ? "#FFFFFF"
      : "#111111";

  const buttonRadius = representativeRadius(evidence.radii ?? [], "button");
  const cardRadius = representativeRadius(evidence.radii ?? [], "card");
  const containerRadius = representativeRadius(evidence.radii ?? [], "container");
  const borderWidth = representativeBorderWidth(evidence.borders ?? []);
  if (buttonRadius.method === "unavailable") warnings.push("button_radius_unresolved");
  if (cardRadius.method === "unavailable") warnings.push("card_radius_unresolved");

  const shadows = evidence.shadows ?? [];
  const shadowTotals = new Map<ShadowCharacter, number>();
  for (const shadow of shadows) {
    shadowTotals.set(
      shadow.character,
      (shadowTotals.get(shadow.character) ?? 0)
        + Math.max(1, shadow.weight ?? 1) * AUTHORITY_WEIGHT[shadow.sourceAuthority]
    );
  }
  const shadowCharacter =
    [...shadowTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "none";

  const headings = (evidence.typography ?? []).filter(({ role }) => role === "heading");
  const bodies = (evidence.typography ?? []).filter(({ role }) => role === "body");
  const heading = headings[0] ?? bodies[0];
  const body = bodies[0] ?? headings[0];
  if (!heading) warnings.push("typography_unresolved");

  const density = densityFor(evidence.density ?? []);
  if (!density.refs.length) warnings.push("density_unresolved");

  const colorSelection = (
    role: BrandSemanticColorRole,
    candidate: ScoredColor | undefined,
    value: string,
    extraReasons: readonly string[] = []
  ) =>
    selection<string>({
      role,
      value,
      applied: Boolean(candidate),
      confidence: candidate?.confidence ?? 0,
      authority: candidate?.authority ?? "derived",
      evidenceRefs: candidate?.evidenceRefs ?? [],
      candidateCount,
      reasons: candidate
        ? [...candidate.reasons, `semantic_role_${role.toLowerCase()}`, ...extraReasons]
        : ["no_current_evidence", `derived_${role.toLowerCase()}`, ...extraReasons]
    });

  const geometrySelection = (
    role: BrandSemanticGeometryRole,
    geometry: RepresentativeGeometry
  ) =>
    selection<number>({
      role,
      value: geometry.value,
      applied: geometry.method !== "unavailable",
      confidence: geometry.confidence,
      authority: geometry.authority,
      evidenceRefs: geometry.evidenceRefs,
      candidateCount: geometry.sampleCount,
      reasons: [...geometry.reasons, `method_${geometry.method}`]
    });

  const applied = [
    surfaceCandidate,
    textCandidate,
    ctaCandidate,
    accentCandidate,
    borderCandidate,
    heading,
    body
  ].filter(Boolean).length;
  const geometryApplied = [buttonRadius, cardRadius, containerRadius, borderWidth].filter(
    (geometry) => geometry.method !== "unavailable"
  ).length;
  const score = clamp01((applied / 7) * 0.6 + (geometryApplied / 4) * 0.25
    + (density.refs.length ? 0.15 : 0), 0);

  const evidenceRefs = [
    ...new Set([
      ...scored.flatMap(({ evidenceRefs: refs }) => refs),
      ...buttonRadius.evidenceRefs,
      ...cardRadius.evidenceRefs,
      ...containerRadius.evidenceRefs,
      ...borderWidth.evidenceRefs,
      ...shadows.map(({ evidenceRef }) => evidenceRef),
      ...(evidence.typography ?? []).map(({ evidenceRef }) => evidenceRef),
      ...density.refs
    ])
  ].sort();

  return {
    version: "brand-semantics-v1",
    colors: {
      primary: colorSelection("primary", primaryCandidate, primaryCandidate?.color ?? textValue),
      accent: colorSelection("accent", accentCandidate, accentCandidate?.color ?? textValue),
      surface: colorSelection("surface", surfaceCandidate, surfaceValue),
      surfaceAlt: colorSelection(
        "surfaceAlt",
        surfaceCandidate,
        mix(surfaceValue, textValue, 0.04),
        ["derived_from_surface"]
      ),
      text: colorSelection("text", textCandidate, textValue),
      textMuted: colorSelection(
        "textMuted",
        textCandidate,
        mix(textValue, surfaceValue, 0.38),
        ["derived_from_text"]
      ),
      border: colorSelection(
        "border",
        borderCandidate,
        borderCandidate?.color ?? mix(surfaceValue, textValue, 0.16),
        borderCandidate ? [] : ["derived_from_surface_and_text"]
      ),
      ctaBackground: colorSelection("ctaBackground", ctaCandidate, ctaBackgroundValue),
      ctaText: colorSelection("ctaText", ctaCandidate, ctaTextValue, [
        "contrast_selected_foreground"
      ]),
      link: colorSelection(
        "link",
        accentCandidate,
        accentCandidate?.color ?? textValue,
        contrastRatio(accentCandidate?.color ?? textValue, surfaceValue) >= 4.5
          ? ["accessible_against_surface"]
          : ["low_contrast_against_surface"]
      ),
      focus: colorSelection(
        "focus",
        accentCandidate,
        accentCandidate?.color ?? textValue,
        ["shares_accent_role"]
      )
    },
    typography: {
      headingFont: selection<string>({
        role: "headingFont",
        value: heading?.family ?? "Arial",
        applied: Boolean(heading),
        confidence: clamp01(heading?.confidence, heading ? 0.7 : 0),
        authority: heading?.sourceAuthority ?? "derived",
        evidenceRefs: heading ? [heading.evidenceRef] : [],
        candidateCount: (evidence.typography ?? []).length,
        reasons: heading
          ? [heading.portable ? "font_portable" : "font_substituted", "role_heading"]
          : ["no_current_evidence", "safe_font_fallback"]
      }),
      bodyFont: selection<string>({
        role: "bodyFont",
        value: body?.family ?? "Arial",
        applied: Boolean(body),
        confidence: clamp01(body?.confidence, body ? 0.7 : 0),
        authority: body?.sourceAuthority ?? "derived",
        evidenceRefs: body ? [body.evidenceRef] : [],
        candidateCount: (evidence.typography ?? []).length,
        reasons: body
          ? [body.portable ? "font_portable" : "font_substituted", "role_body"]
          : ["no_current_evidence", "safe_font_fallback"]
      }),
      fontCharacter: selection<FontCharacter>({
        role: "fontCharacter",
        value: fontCharacterFor(evidence.typography ?? []),
        applied: Boolean(evidence.typography?.length),
        confidence: heading ? clamp01(heading.confidence, 0.7) : 0,
        authority: heading?.sourceAuthority ?? "derived",
        evidenceRefs: (evidence.typography ?? []).map(({ evidenceRef }) => evidenceRef),
        candidateCount: (evidence.typography ?? []).length,
        reasons: ["family_character_classified"]
      }),
      weightCharacter: selection<WeightCharacter>({
        role: "weightCharacter",
        value: weightCharacterFor(evidence.typography ?? []),
        applied: (evidence.typography ?? []).some(({ weight }) => Number.isFinite(weight)),
        confidence: heading ? clamp01(heading.confidence, 0.7) : 0,
        authority: heading?.sourceAuthority ?? "derived",
        evidenceRefs: (evidence.typography ?? []).map(({ evidenceRef }) => evidenceRef),
        candidateCount: (evidence.typography ?? []).length,
        reasons: ["heaviest_observed_weight"]
      })
    },
    geometry: {
      buttonRadius: geometrySelection("buttonRadius", buttonRadius),
      cardRadius: geometrySelection("cardRadius", cardRadius),
      containerRadius: geometrySelection("containerRadius", containerRadius),
      borderWidth: geometrySelection("borderWidth", borderWidth),
      shadowCharacter: selection<ShadowCharacter>({
        role: "shadowCharacter",
        value: shadowCharacter,
        applied: shadows.length > 0,
        confidence: shadows.length
          ? shadows.reduce((sum, item) => sum + clamp01(item.confidence, 0.7), 0)
            / shadows.length
          : 0,
        authority: shadows[0]?.sourceAuthority ?? "derived",
        evidenceRefs: shadows.map(({ evidenceRef }) => evidenceRef),
        candidateCount: shadowTotals.size,
        reasons: shadows.length
          ? ["weighted_mode_by_component"]
          : ["no_current_evidence", "default_none"]
      }),
      density: selection<BrandDensityCharacter>({
        role: "density",
        value: density.value,
        applied: density.refs.length > 0,
        confidence: density.confidence,
        authority: (evidence.density ?? [])[0]?.sourceAuthority ?? "derived",
        evidenceRefs: density.refs,
        candidateCount: (evidence.density ?? []).length,
        reasons: density.reasons
      })
    },
    warnings: [...new Set(warnings)].sort(),
    score,
    evidenceRefs
  };
}
