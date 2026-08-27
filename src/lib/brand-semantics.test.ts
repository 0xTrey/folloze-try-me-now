import { describe, expect, it } from "vitest";

import {
  compileBrandSemantics,
  contrastRatio,
  representativeRadius,
  scoreColorObservations,
  type BrandColorObservation,
  type BrandSemanticEvidence,
  type GeometryObservation
} from "@/lib/brand-semantics";

function color(
  overrides: Partial<BrandColorObservation> & Pick<BrandColorObservation, "color" | "componentRole">
): BrandColorObservation {
  return {
    sourceAuthority: "official_dom",
    evidenceRef: `evidence:${overrides.color}:${overrides.componentRole}`,
    areaRatio: 0.1,
    frequency: 4,
    confidence: 0.8,
    ...overrides
  };
}

function radius(
  componentClass: GeometryObservation["componentClass"],
  valuePx: number,
  weight = 1
): GeometryObservation {
  return {
    componentClass,
    valuePx,
    weight,
    sourceAuthority: "official_dom",
    evidenceRef: `evidence:${componentClass}:${valuePx}:${weight}`,
    confidence: 0.8
  };
}

/**
 * Six generalized archetypes. None encodes a real company: each is a shape of
 * evidence the compiler must handle by behaviour alone.
 */
const ARCHETYPES: Record<string, BrandSemanticEvidence> = {
  monochromeWithOneAccent: {
    colors: [
      color({ color: "#FFFFFF", componentRole: "surface", areaRatio: 0.72 }),
      color({ color: "#101014", componentRole: "text", areaRatio: 0.14, contrastUse: true }),
      color({ color: "#00E08A", componentRole: "action", areaRatio: 0.03, frequency: 7 }),
      color({ color: "#E6E6EA", componentRole: "border", areaRatio: 0.05 })
    ],
    radii: [radius("button", 999, 6), radius("card", 24, 4)],
    typography: [
      {
        role: "heading",
        family: "Inter",
        portable: true,
        weight: 700,
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:font:heading"
      }
    ]
  },
  highColorRoundedDisplay: {
    colors: [
      color({ color: "#FFF8F0", componentRole: "surface", areaRatio: 0.6 }),
      color({ color: "#1B1035", componentRole: "text", areaRatio: 0.16, contrastUse: true }),
      color({ color: "#FF3D71", componentRole: "action", areaRatio: 0.08, frequency: 9 }),
      color({ color: "#7B2FF7", componentRole: "decorative", areaRatio: 0.09, frequency: 5 })
    ],
    radii: [radius("button", 20, 5), radius("card", 28, 6)],
    typography: [
      {
        role: "heading",
        family: "Poppins",
        portable: false,
        weight: 800,
        character: "geometric",
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:font:display"
      }
    ]
  },
  conservativeEnterprise: {
    colors: [
      color({ color: "#FFFFFF", componentRole: "surface", areaRatio: 0.78 }),
      color({ color: "#1C293F", componentRole: "text", areaRatio: 0.13, contrastUse: true }),
      color({ color: "#0265DC", componentRole: "action", areaRatio: 0.02, frequency: 6 }),
      color({ color: "#D5D9E0", componentRole: "border", areaRatio: 0.06 })
    ],
    radii: [radius("button", 4, 8), radius("card", 6, 5)],
    borders: [
      {
        componentClass: "button",
        widthPx: 1,
        weight: 8,
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:border:button"
      }
    ],
    density: [
      {
        sectionBlockPx: 64,
        gridGapPx: 12,
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:density"
      }
    ]
  },
  editorialSerif: {
    colors: [
      color({ color: "#FBF9F4", componentRole: "surface", areaRatio: 0.7 }),
      color({ color: "#181510", componentRole: "text", areaRatio: 0.2, contrastUse: true }),
      color({ color: "#8A1B1B", componentRole: "action", areaRatio: 0.01, frequency: 2 })
    ],
    radii: [radius("button", 2, 4), radius("card", 0, 6)],
    typography: [
      {
        role: "heading",
        family: "Playfair Display",
        portable: false,
        weight: 500,
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:font:serif"
      },
      {
        role: "body",
        family: "Georgia",
        portable: true,
        weight: 400,
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:font:body"
      }
    ],
    density: [
      {
        sectionBlockPx: 128,
        gridGapPx: 32,
        sourceAuthority: "official_dom",
        evidenceRef: "evidence:density:editorial"
      }
    ]
  },
  sparseGeometry: {
    colors: [
      color({ color: "#FFFFFF", componentRole: "surface", areaRatio: 0.8 }),
      color({ color: "#222222", componentRole: "text", areaRatio: 0.12, contrastUse: true })
    ]
  },
  contradictoryPalette: {
    colors: [
      color({ color: "#FFFFFF", componentRole: "surface", areaRatio: 0.4 }),
      color({ color: "#000000", componentRole: "surface", areaRatio: 0.39 }),
      color({ color: "#FF0000", componentRole: "action", areaRatio: 0.02, frequency: 1 }),
      color({ color: "#00FF00", componentRole: "action", areaRatio: 0.02, frequency: 1 })
    ]
  }
};

describe("semantic colour voting", () => {
  it("selects roles by weighted presence rather than the first candidate", () => {
    const scored = scoreColorObservations([
      color({ color: "#123456", componentRole: "action", areaRatio: 0.001, frequency: 1 }),
      color({ color: "#ABCDEF", componentRole: "action", areaRatio: 0.09, frequency: 8 })
    ]);

    expect(scored[0]?.color).toBe("#ABCDEF");
    expect(scored[0]?.reasons).toContain("area_weighted");
    expect(scored[0]?.reasons).toContain("frequency_weighted");
  });

  it("weights a higher-authority source above a weaker one", () => {
    const scored = scoreColorObservations([
      color({
        color: "#111111",
        componentRole: "action",
        sourceAuthority: "third_party",
        areaRatio: 0.2
      }),
      color({
        color: "#222222",
        componentRole: "action",
        sourceAuthority: "official_dom",
        areaRatio: 0.2
      })
    ]);

    expect(scored[0]?.color).toBe("#222222");
    expect(scored[0]?.reasons).toContain("authority_official_dom");
  });

  it.each([
    ["promotional", "promotional"],
    ["consent layer", "consent"],
    ["modal overlay", "modal"],
    ["disabled control", "disabled"],
    ["navigation utility", "navigation_utility"]
  ] as const)(
    "excludes a %s surface from dominant classification without corroboration",
    (_label, surfaceKind) => {
      const scored = scoreColorObservations([
        color({ color: "#FFFFFF", componentRole: "surface", areaRatio: 0.7 }),
        color({
          color: "#FF0000",
          componentRole: "action",
          areaRatio: 0.5,
          frequency: 12,
          surfaceKind
        })
      ]);

      expect(scored.map(({ color: value }) => value)).not.toContain("#FF0000");
    }
  );

  it("admits a transient colour once a persistent surface corroborates it", () => {
    const scored = scoreColorObservations([
      color({
        color: "#FF0000",
        componentRole: "action",
        areaRatio: 0.4,
        surfaceKind: "promotional"
      }),
      color({
        color: "#FF0000",
        componentRole: "action",
        areaRatio: 0.04,
        surfaceKind: "persistent"
      })
    ]);

    expect(scored.map(({ color: value }) => value)).toContain("#FF0000");
    expect(scored[0]?.reasons).toContain("persistent_surface");
  });

  it("keeps a promotional banner out of the compiled cta role", () => {
    const system = compileBrandSemantics({
      colors: [
        color({ color: "#FFFFFF", componentRole: "surface", areaRatio: 0.7 }),
        color({ color: "#101010", componentRole: "text", areaRatio: 0.15, contrastUse: true }),
        color({ color: "#0265DC", componentRole: "action", areaRatio: 0.03, frequency: 6 }),
        color({
          color: "#FF6B00",
          componentRole: "action",
          areaRatio: 0.42,
          frequency: 14,
          surfaceKind: "promotional"
        })
      ]
    });

    expect(system.colors.ctaBackground.value).toBe("#0265DC");
    expect(system.colors.ctaBackground.value).not.toBe("#FF6B00");
  });
});

describe("representative geometry", () => {
  it("prefers the dominant band over an outlier pill radius", () => {
    const geometry = representativeRadius(
      [
        radius("button", 6, 9),
        radius("button", 8, 7),
        radius("button", 6, 8),
        radius("button", 999, 1)
      ],
      "button"
    );

    expect(geometry.value).toBe(6);
    expect(geometry.method).toBe("weighted_mode_then_median");
    expect(geometry.reasons).toContain("dominant_band_moderate");
    expect(geometry.reasons).toContain("mixed_band_distribution");
  });

  it("does not let a single zero capture a mostly rounded class", () => {
    const geometry = representativeRadius(
      [radius("card", 0, 1), radius("card", 16, 6), radius("card", 18, 5)],
      "card"
    );

    expect(geometry.value).toBeGreaterThanOrEqual(16);
    expect(geometry.reasons).toContain("representative_over_first_observed");
  });

  it("resolves a genuinely sharp class to zero", () => {
    const geometry = representativeRadius(
      [radius("button", 0, 8), radius("button", 0, 6), radius("button", 12, 1)],
      "button"
    );

    expect(geometry.value).toBe(0);
    expect(geometry.reasons).toContain("dominant_band_sharp");
  });

  it("resolves a genuinely pill class to its representative value", () => {
    const geometry = representativeRadius(
      [radius("button", 999, 6), radius("button", 40, 4), radius("button", 4, 1)],
      "button"
    );

    expect(geometry.value).toBeGreaterThanOrEqual(40);
    expect(geometry.reasons).toContain("dominant_band_pill");
  });

  it("reports unavailable geometry rather than inventing a default", () => {
    const geometry = representativeRadius([], "container");

    expect(geometry.method).toBe("unavailable");
    expect(geometry.confidence).toBe(0);
    expect(geometry.reasons).toContain("no_current_evidence");
  });

  it("ignores radii observed only on transient chrome", () => {
    const geometry = representativeRadius(
      [{ ...radius("button", 999, 9), surfaceKind: "promotional" }, radius("button", 4, 2)],
      "button"
    );

    expect(geometry.value).toBe(4);
  });
});

describe("brand archetype compilation", () => {
  it.each(Object.keys(ARCHETYPES))("compiles the %s archetype without blocking", (name) => {
    const system = compileBrandSemantics(ARCHETYPES[name]!);

    expect(system.version).toBe("brand-semantics-v1");
    expect(system.score).toBeGreaterThanOrEqual(0);
    expect(system.score).toBeLessThanOrEqual(1);
    for (const role of Object.values(system.colors)) {
      expect(role.value).toMatch(/^#[0-9A-F]{6}$/);
      expect(role.selectionReasons.length).toBeGreaterThan(0);
    }
  });

  it("produces different palettes and geometry across archetypes", () => {
    const monochrome = compileBrandSemantics(ARCHETYPES.monochromeWithOneAccent!);
    const highColor = compileBrandSemantics(ARCHETYPES.highColorRoundedDisplay!);
    const enterprise = compileBrandSemantics(ARCHETYPES.conservativeEnterprise!);
    const editorial = compileBrandSemantics(ARCHETYPES.editorialSerif!);

    const accents = [
      monochrome.colors.ctaBackground.value,
      highColor.colors.ctaBackground.value,
      enterprise.colors.ctaBackground.value,
      editorial.colors.ctaBackground.value
    ];
    expect(new Set(accents).size).toBe(4);

    expect(monochrome.geometry.buttonRadius.value).toBeGreaterThan(
      enterprise.geometry.buttonRadius.value
    );
    expect(editorial.geometry.cardRadius.value).toBeLessThan(
      highColor.geometry.cardRadius.value
    );
    expect(enterprise.geometry.density.value).toBe("dense");
    expect(editorial.geometry.density.value).toBe("open");
    expect(editorial.typography.fontCharacter.value).toBe("serif");
  });

  it("keeps sparse evidence explicit instead of claiming customer branding", () => {
    const system = compileBrandSemantics(ARCHETYPES.sparseGeometry!);

    expect(system.warnings).toContain("button_radius_unresolved");
    expect(system.warnings).toContain("card_radius_unresolved");
    expect(system.geometry.buttonRadius.applied).toBe(false);
    expect(system.colors.ctaBackground.applied).toBe(false);
    expect(system.colors.ctaBackground.selectionReasons).toContain("no_current_evidence");
    expect(system.score).toBeLessThan(0.7);
  });

  it("still returns a provisional system for contradictory palette evidence", () => {
    const system = compileBrandSemantics(ARCHETYPES.contradictoryPalette!);

    expect(system.colors.surface.value).toMatch(/^#[0-9A-F]{6}$/);
    expect(system.colors.text.value).toMatch(/^#[0-9A-F]{6}$/);
    expect(system.score).toBeGreaterThan(0);
  });

  it("chooses a cta foreground that is readable on the cta background", () => {
    for (const name of Object.keys(ARCHETYPES)) {
      const system = compileBrandSemantics(ARCHETYPES[name]!);
      expect(
        contrastRatio(system.colors.ctaText.value, system.colors.ctaBackground.value)
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("records evidence, authority, and reasons for every applied role", () => {
    const system = compileBrandSemantics(ARCHETYPES.conservativeEnterprise!);
    const applied = [
      system.colors.surface,
      system.colors.text,
      system.colors.ctaBackground,
      system.geometry.buttonRadius,
      system.geometry.cardRadius
    ];

    for (const role of applied) {
      expect(role.applied).toBe(true);
      expect(role.evidenceRefs.length).toBeGreaterThan(0);
      expect(role.sourceAuthority).not.toBe("derived");
      expect(role.selectionReasons.length).toBeGreaterThan(0);
      expect(role.confidence).toBeGreaterThan(0);
    }
  });

  it("derives supporting roles from resolved neutrals and says so", () => {
    const system = compileBrandSemantics(ARCHETYPES.conservativeEnterprise!);

    expect(system.colors.surfaceAlt.selectionReasons).toContain("derived_from_surface");
    expect(system.colors.textMuted.selectionReasons).toContain("derived_from_text");
    expect(system.colors.surfaceAlt.value).not.toBe(system.colors.surface.value);
    expect(system.colors.textMuted.value).not.toBe(system.colors.text.value);
  });
});
