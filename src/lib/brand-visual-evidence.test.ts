import { describe, expect, it } from "vitest";

import {
  analyzeDesktopScreenshotObservations,
  normalizeObservedColorRatios,
  type DesktopScreenshotObservations,
  type ScreenshotVisualEvidenceInput
} from "@/lib/brand-visual-evidence";

const baseInput: Omit<ScreenshotVisualEvidenceInput, "observations"> = {
  sessionId: "session-visual-evidence",
  revision: 4,
  activeRevision: 4,
  sourceRef: "screenshot:desktop-home",
  observedAt: "2026-08-22T16:00:00.000Z",
  startedAt: "2026-08-22T16:00:01.000Z",
  completedAt: "2026-08-22T16:00:02.000Z",
  viewport: { width: 1440, height: 1200 }
};

function analyze(
  observations: DesktopScreenshotObservations,
  overrides: Partial<Omit<ScreenshotVisualEvidenceInput, "observations">> = {}
) {
  return analyzeDesktopScreenshotObservations({
    ...baseInput,
    ...overrides,
    observations
  });
}

const goldenFixtures = [
  {
    name: "Apple-like",
    observations: {
      colorRatios: [
        { color: "#fff", ratio: 86, confidence: 0.98 },
        { color: "#1d1d1f", ratio: 12, confidence: 0.97 },
        { color: "#0071e3", ratio: 2, confidence: 0.94 }
      ],
      controlRadiusPx: { value: 20, confidence: 0.9 },
      cardRadiusPx: { value: 0, confidence: 0.86 },
      density: { value: "open", confidence: 0.95 },
      navigation: { value: "minimal", confidence: 0.96 },
      hero: { value: "type-led", confidence: 0.91 },
      typography: {
        value: { family: "neutral-sans", scale: "dramatic", headingWeight: 600 },
        confidence: 0.9
      },
      imagery: {
        value: { style: "photography", composition: "full-bleed" },
        confidence: 0.84
      }
    } satisfies DesktopScreenshotObservations,
    expected: {
      dominant: "#FFFFFF",
      dominantRatio: 0.86,
      accent: "#0071E3",
      accentRatio: 0.02,
      controlRadius: 20,
      cardRadius: 0,
      density: "open",
      navigation: "minimal",
      hero: "type-led"
    }
  },
  {
    name: "ADP-like",
    observations: {
      colorRatios: [
        { color: "#FFFFFF", ratio: 0.68, confidence: 0.96 },
        { color: "#202020", ratio: 0.17, confidence: 0.92 },
        { color: "#D0271D", ratio: 0.15, confidence: 0.95 }
      ],
      controlRadiusPx: { value: 4, confidence: 0.91 },
      cardRadiusPx: { value: 2, confidence: 0.82 },
      density: { value: "balanced", confidence: 0.88 },
      navigation: { value: "utility", confidence: 0.9 },
      hero: { value: "split-media", confidence: 0.89 },
      typography: {
        value: { family: "humanist-sans", scale: "balanced", headingWeight: 700 },
        confidence: 0.84
      },
      imagery: {
        value: { style: "photography", composition: "contained" },
        confidence: 0.87
      }
    } satisfies DesktopScreenshotObservations,
    expected: {
      dominant: "#FFFFFF",
      dominantRatio: 0.68,
      accent: "#D0271D",
      accentRatio: 0.15,
      controlRadius: 4,
      cardRadius: 2,
      density: "balanced",
      navigation: "utility",
      hero: "split-media"
    }
  },
  {
    name: "6sense-like",
    observations: {
      colorRatios: [
        { color: "#FFFFFF", ratio: 55, confidence: 0.94 },
        { color: "#6F2C91", ratio: 25, confidence: 0.91 },
        { color: "#21162B", ratio: 20, confidence: 0.9 }
      ],
      controlRadiusPx: { value: 24, confidence: 0.88 },
      cardRadiusPx: { value: 16, confidence: 0.9 },
      density: { value: "dense", confidence: 0.85 },
      navigation: { value: "product-led", confidence: 0.86 },
      hero: { value: "product-led", confidence: 0.89 },
      typography: {
        value: { family: "geometric-sans", scale: "dramatic", headingWeight: 700 },
        confidence: 0.87
      },
      imagery: {
        value: { style: "product-ui", composition: "layered" },
        confidence: 0.92
      }
    } satisfies DesktopScreenshotObservations,
    expected: {
      dominant: "#FFFFFF",
      dominantRatio: 0.55,
      accent: "#6F2C91",
      accentRatio: 0.25,
      controlRadius: 24,
      cardRadius: 16,
      density: "dense",
      navigation: "product-led",
      hero: "product-led"
    }
  }
] as const;

describe("desktop screenshot visual evidence", () => {
  it.each(goldenFixtures)(
    "compiles bounded $name observations without creating style output",
    ({ observations, expected }) => {
      const artifact = analyze(observations);
      const colors = artifact.value?.observedColorRatios?.value;

      expect(artifact).toMatchObject({
        worker: "screenshot-analyst",
        status: "complete",
        revision: 4,
        sessionId: "session-visual-evidence"
      });
      expect(artifact.confidence).toBeGreaterThanOrEqual(0);
      expect(artifact.confidence).toBeLessThanOrEqual(1);
      expect(colors?.[0]).toEqual({ color: expected.dominant, ratio: expected.dominantRatio });
      expect(colors?.find(({ color }) => color === expected.accent)?.ratio).toBeCloseTo(
        expected.accentRatio
      );
      expect(artifact.value?.radii.controlPx?.value).toBe(expected.controlRadius);
      expect(artifact.value?.radii.cardPx?.value).toBe(expected.cardRadius);
      expect(artifact.value?.density?.value).toBe(expected.density);
      expect(artifact.value?.navigation?.value).toBe(expected.navigation);
      expect(artifact.value?.hero?.value).toBe(expected.hero);
      expect(artifact.value?.rejectedCues).toEqual([]);
      expect(JSON.stringify(artifact.value).toLowerCase()).not.toContain("css");
    }
  );

  it("normalizes valid observed weights, merges duplicate colors, and rejects invalid entries", () => {
    const normalized = normalizeObservedColorRatios([
      { color: "#fff", ratio: 30, confidence: 0.8 },
      { color: "#FFFFFF", ratio: 20, confidence: 1 },
      { color: "#111111", ratio: 50, confidence: 0.9 },
      { color: "transparent", ratio: 10, confidence: 0.9 },
      { color: "#FF0000", ratio: -1, confidence: 0.9 },
      { color: "#00FF00", ratio: 1, confidence: 1.1 }
    ]);

    expect(normalized.value).toEqual([
      { color: "#111111", ratio: 0.5 },
      { color: "#FFFFFF", ratio: 0.5 }
    ]);
    expect(normalized.value?.reduce((sum, item) => sum + item.ratio, 0)).toBeCloseTo(1);
    expect(normalized.confidence).toBeCloseTo(0.89);
    expect(normalized.rejectedCues).toEqual([
      { path: "colorRatios[3]", code: "invalid-color" },
      { path: "colorRatios[4]", code: "invalid-ratio" },
      { path: "colorRatios[5]", code: "invalid-confidence" }
    ]);
  });

  it("rejects out-of-vocabulary, contradictory, and out-of-bound cues", () => {
    const artifact = analyze({
      controlRadiusPx: { value: -4, confidence: 0.9 },
      cardRadiusPx: { value: 12, confidence: 1.01 },
      density: { value: "chaotic" as never, confidence: 0.8 },
      navigation: { value: "mega-menu" as never, confidence: 0.8 },
      hero: { value: "editorial", confidence: 0.75 },
      typography: {
        value: { family: "neutral-sans", scale: "dramatic", headingWeight: 950 },
        confidence: 0.8
      },
      imagery: {
        value: { style: "none", composition: "full-bleed" },
        confidence: 0.9
      }
    });

    expect(artifact.status).toBe("complete");
    expect(artifact.value?.hero?.value).toBe("editorial");
    expect(artifact.evidenceRefs).toEqual(["screenshot:desktop-home#hero"]);
    expect(artifact.value?.rejectedCues.map(({ code }) => code)).toEqual([
      "invalid-control-radius",
      "invalid-confidence",
      "invalid-density",
      "invalid-navigation-style",
      "invalid-typography-cue",
      "invalid-imagery-cue"
    ]);
  });

  it("marks stale revisions before accepting any screenshot cue", () => {
    const artifact = analyze(
      {
        hero: { value: "image-led", confidence: 0.95 },
        density: { value: "open", confidence: 0.9 }
      },
      { revision: 3, activeRevision: 4 }
    );

    expect(artifact).toMatchObject({
      status: "stale",
      revision: 3,
      confidence: 0,
      errorCode: "stale_revision",
      evidenceRefs: []
    });
    expect(artifact.value).toBeUndefined();
  });

  it("returns a typed fallback when no observation survives validation", () => {
    const artifact = analyze({
      colorRatios: [{ color: "not-a-color", ratio: 1, confidence: 0.9 }],
      imagery: {
        value: { style: "none", composition: "contained" },
        confidence: 0.9
      }
    });

    expect(artifact).toMatchObject({
      status: "fallback",
      confidence: 0,
      fallbackCode: "screenshot_visual_evidence_unavailable",
      evidenceRefs: []
    });
    expect(artifact.value?.rejectedCues).toHaveLength(2);
  });

  it("is deterministic for the same bounded observation input", () => {
    const observations = goldenFixtures[1].observations;
    const first = analyze(observations);
    const second = analyze(observations);

    expect(second).toEqual(first);
    expect(first.value?.hero?.observedAt).toBe(baseInput.observedAt);
    expect(first.startedAt).toBe(baseInput.startedAt);
    expect(first.completedAt).toBe(baseInput.completedAt);
  });
});
