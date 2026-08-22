import type {
  EvidenceValue,
  ProductionArtifact
} from "@/lib/orchestration/worker-types";

export type VisualDensity = "open" | "balanced" | "dense";
export type NavigationStyle =
  | "minimal"
  | "utility"
  | "product-led"
  | "split-action"
  | "overlay";
export type HeroStyle =
  | "type-led"
  | "split-media"
  | "product-led"
  | "image-led"
  | "editorial";
export type TypographyFamilyCue =
  | "neutral-sans"
  | "humanist-sans"
  | "geometric-sans"
  | "serif-editorial"
  | "mixed";
export type TypographyScaleCue = "restrained" | "balanced" | "dramatic";
export type ImageryStyle =
  | "none"
  | "product-ui"
  | "photography"
  | "illustration"
  | "diagram"
  | "mixed";
export type ImageryComposition = "absent" | "contained" | "full-bleed" | "layered";

export interface ObservedCue<T> {
  value: T;
  confidence: number;
}

export interface ObservedColorRatio {
  color: string;
  ratio: number;
  confidence: number;
}

export interface TypographyCue {
  family: TypographyFamilyCue;
  scale: TypographyScaleCue;
  headingWeight?: number;
}

export interface ImageryCue {
  style: ImageryStyle;
  composition: ImageryComposition;
}

export interface DesktopScreenshotObservations {
  colorRatios?: readonly ObservedColorRatio[];
  controlRadiusPx?: ObservedCue<number>;
  cardRadiusPx?: ObservedCue<number>;
  density?: ObservedCue<VisualDensity>;
  navigation?: ObservedCue<NavigationStyle>;
  hero?: ObservedCue<HeroStyle>;
  typography?: ObservedCue<TypographyCue>;
  imagery?: ObservedCue<ImageryCue>;
}

export interface ScreenshotVisualEvidenceInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  sourceRef: string;
  observedAt: string;
  startedAt: string;
  completedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  observations: DesktopScreenshotObservations;
}

export type RejectedVisualCueCode =
  | "invalid-color"
  | "invalid-ratio"
  | "invalid-confidence"
  | "invalid-control-radius"
  | "invalid-card-radius"
  | "invalid-density"
  | "invalid-navigation-style"
  | "invalid-hero-style"
  | "invalid-typography-cue"
  | "invalid-imagery-cue";

export interface RejectedVisualCue {
  path: string;
  code: RejectedVisualCueCode;
}

export interface NormalizedColorRatio {
  color: string;
  ratio: number;
}

export interface NormalizedColorRatioResult {
  value?: readonly NormalizedColorRatio[];
  confidence: number;
  rejectedCues: readonly RejectedVisualCue[];
}

export interface ScreenshotVisualEvidence {
  viewport: {
    kind: "desktop";
    width: number;
    height: number;
  };
  observedColorRatios?: EvidenceValue<readonly NormalizedColorRatio[]>;
  radii: {
    controlPx?: EvidenceValue<number>;
    cardPx?: EvidenceValue<number>;
  };
  density?: EvidenceValue<VisualDensity>;
  navigation?: EvidenceValue<NavigationStyle>;
  hero?: EvidenceValue<HeroStyle>;
  typography?: EvidenceValue<TypographyCue>;
  imagery?: EvidenceValue<ImageryCue>;
  rejectedCues: readonly RejectedVisualCue[];
}

const navigationStyles: readonly NavigationStyle[] = [
  "minimal",
  "utility",
  "product-led",
  "split-action",
  "overlay"
];
const heroStyles: readonly HeroStyle[] = [
  "type-led",
  "split-media",
  "product-led",
  "image-led",
  "editorial"
];
const visualDensities: readonly VisualDensity[] = ["open", "balanced", "dense"];
const typographyFamilies: readonly TypographyFamilyCue[] = [
  "neutral-sans",
  "humanist-sans",
  "geometric-sans",
  "serif-editorial",
  "mixed"
];
const typographyScales: readonly TypographyScaleCue[] = [
  "restrained",
  "balanced",
  "dramatic"
];
const imageryStyles: readonly ImageryStyle[] = [
  "none",
  "product-ui",
  "photography",
  "illustration",
  "diagram",
  "mixed"
];
const imageryCompositions: readonly ImageryComposition[] = [
  "absent",
  "contained",
  "full-bleed",
  "layered"
];

function isConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function canonicalColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (!/^#[0-9a-f]{3}$/i.test(trimmed)) return undefined;
  const [red, green, blue] = trimmed.slice(1);
  return `#${red}${red}${green}${green}${blue}${blue}`.toUpperCase();
}

/**
 * Normalizes observed screenshot proportions to a unit sum. Invalid entries
 * are excluded rather than converted into invented palette evidence.
 */
export function normalizeObservedColorRatios(
  observations: readonly ObservedColorRatio[]
): NormalizedColorRatioResult {
  const rejectedCues: RejectedVisualCue[] = [];
  const aggregates = new Map<string, { ratio: number; weightedConfidence: number }>();

  observations.forEach((observation, index) => {
    const path = `colorRatios[${index}]`;
    const color = canonicalColor(observation.color);
    if (!color) {
      rejectedCues.push({ path, code: "invalid-color" });
      return;
    }
    if (!Number.isFinite(observation.ratio) || observation.ratio <= 0) {
      rejectedCues.push({ path, code: "invalid-ratio" });
      return;
    }
    if (!isConfidence(observation.confidence)) {
      rejectedCues.push({ path, code: "invalid-confidence" });
      return;
    }
    const aggregate = aggregates.get(color) ?? { ratio: 0, weightedConfidence: 0 };
    aggregate.ratio += observation.ratio;
    aggregate.weightedConfidence += observation.ratio * observation.confidence;
    aggregates.set(color, aggregate);
  });

  const total = [...aggregates.values()].reduce((sum, item) => sum + item.ratio, 0);
  if (total === 0) return { confidence: 0, rejectedCues };

  const value = [...aggregates.entries()]
    .map(([color, item]) => ({ color, ratio: item.ratio / total }))
    .sort((left, right) => right.ratio - left.ratio || left.color.localeCompare(right.color));
  const confidence =
    [...aggregates.values()].reduce((sum, item) => sum + item.weightedConfidence, 0) / total;

  return { value, confidence, rejectedCues };
}

function isTypographyCue(value: TypographyCue): boolean {
  return Boolean(
    value &&
      typographyFamilies.includes(value.family) &&
      typographyScales.includes(value.scale) &&
      (value.headingWeight === undefined ||
        (Number.isInteger(value.headingWeight) &&
          value.headingWeight >= 100 &&
          value.headingWeight <= 900))
  );
}

function isImageryCue(value: ImageryCue): boolean {
  return Boolean(
    value &&
      imageryStyles.includes(value.style) &&
      imageryCompositions.includes(value.composition) &&
      ((value.style === "none" && value.composition === "absent") ||
        (value.style !== "none" && value.composition !== "absent"))
  );
}

function isDesktopViewport(viewport: ScreenshotVisualEvidenceInput["viewport"]): boolean {
  return (
    Number.isInteger(viewport.width) &&
    viewport.width >= 1024 &&
    viewport.width <= 10_000 &&
    Number.isInteger(viewport.height) &&
    viewport.height >= 576 &&
    viewport.height <= 20_000
  );
}

function artifactBase(input: ScreenshotVisualEvidenceInput) {
  return {
    worker: "screenshot-analyst" as const,
    sessionId: input.sessionId,
    revision: input.revision,
    startedAt: input.startedAt,
    completedAt: input.completedAt
  };
}

/**
 * Converts caller-supplied observations into typed visual evidence. This
 * function performs no screenshot recognition, network work, or style output.
 */
export function analyzeDesktopScreenshotObservations(
  input: ScreenshotVisualEvidenceInput
): ProductionArtifact<ScreenshotVisualEvidence> {
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
  if (!isDesktopViewport(input.viewport)) {
    return {
      ...base,
      status: "failed",
      evidenceRefs: [],
      confidence: 0,
      errorCode: "invalid_desktop_viewport"
    };
  }

  const rejectedCues: RejectedVisualCue[] = [];
  const evidenceRefs: string[] = [];
  const confidenceValues: number[] = [];
  const accept = <T>(path: string, value: T, confidence: number): EvidenceValue<T> => {
    evidenceRefs.push(`${input.sourceRef}#${path}`);
    confidenceValues.push(confidence);
    return {
      value,
      source: input.sourceRef,
      confidence,
      observedAt: input.observedAt,
      revision: input.revision
    };
  };
  const reject = (path: string, code: RejectedVisualCueCode) => {
    rejectedCues.push({ path, code });
  };
  const validate = <T>(
    path: string,
    cue: ObservedCue<T> | undefined,
    valueIsValid: (value: T) => boolean,
    invalidValueCode: RejectedVisualCueCode
  ): EvidenceValue<T> | undefined => {
    if (!cue) return undefined;
    if (!valueIsValid(cue.value)) {
      reject(path, invalidValueCode);
      return undefined;
    }
    if (!isConfidence(cue.confidence)) {
      reject(path, "invalid-confidence");
      return undefined;
    }
    return accept(path, cue.value, cue.confidence);
  };

  const colors = normalizeObservedColorRatios(input.observations.colorRatios ?? []);
  rejectedCues.push(...colors.rejectedCues);
  const observedColorRatios = colors.value
    ? accept("observed-color-ratios", colors.value, colors.confidence)
    : undefined;
  const controlRadiusPx = validate(
    "control-radius",
    input.observations.controlRadiusPx,
    (value) => Number.isFinite(value) && value >= 0 && value <= 256,
    "invalid-control-radius"
  );
  const cardRadiusPx = validate(
    "card-radius",
    input.observations.cardRadiusPx,
    (value) => Number.isFinite(value) && value >= 0 && value <= 256,
    "invalid-card-radius"
  );
  const density = validate(
    "density",
    input.observations.density,
    (value) => visualDensities.includes(value),
    "invalid-density"
  );
  const navigation = validate(
    "navigation",
    input.observations.navigation,
    (value) => navigationStyles.includes(value),
    "invalid-navigation-style"
  );
  const hero = validate(
    "hero",
    input.observations.hero,
    (value) => heroStyles.includes(value),
    "invalid-hero-style"
  );
  const typography = validate(
    "typography",
    input.observations.typography,
    isTypographyCue,
    "invalid-typography-cue"
  );
  const imagery = validate(
    "imagery",
    input.observations.imagery,
    isImageryCue,
    "invalid-imagery-cue"
  );

  const value: ScreenshotVisualEvidence = {
    viewport: { kind: "desktop", ...input.viewport },
    ...(observedColorRatios ? { observedColorRatios } : {}),
    radii: {
      ...(controlRadiusPx ? { controlPx: controlRadiusPx } : {}),
      ...(cardRadiusPx ? { cardPx: cardRadiusPx } : {})
    },
    ...(density ? { density } : {}),
    ...(navigation ? { navigation } : {}),
    ...(hero ? { hero } : {}),
    ...(typography ? { typography } : {}),
    ...(imagery ? { imagery } : {}),
    rejectedCues
  };
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, item) => sum + item, 0) / confidenceValues.length
    : 0;

  return {
    ...base,
    status: evidenceRefs.length ? "complete" : "fallback",
    value,
    evidenceRefs,
    confidence,
    ...(evidenceRefs.length ? {} : { fallbackCode: "screenshot_visual_evidence_unavailable" })
  };
}
