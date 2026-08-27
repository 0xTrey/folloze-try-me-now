/**
 * Brand archetypes expressed as evidence, not as companies.
 *
 * Each fixture describes a shape a real site can take — a monochrome brand with
 * one action accent, an editorial brand with serif display type, a site whose
 * evidence is genuinely incomplete — so the compiler and evaluator are tested
 * on behaviour they must generalize to, rather than on a named brand whose
 * output could be special-cased into passing.
 */

import type {
  BrandColorObservation,
  BrandSemanticEvidence,
  BrandSourceAuthority
} from "@/lib/brand-semantics";

export type BrandArchetypeId =
  | "monochrome-pill"
  | "high-color-rounded"
  | "conservative-enterprise"
  | "editorial-serif"
  | "sparse-logo-only"
  | "contradictory-evidence";

export interface BrandArchetypeFixture {
  id: BrandArchetypeId;
  /** What the evidence looks like, in the terms the compiler reasons about. */
  description: string;
  evidence: BrandSemanticEvidence;
  /** Behaviour the compiler must exhibit, independent of exact values. */
  expectation: {
    /** A durable action colour is recoverable from the observations. */
    resolvesActionColor: boolean;
    /** Geometry is representative of a distribution, not a single sample. */
    resolvesGeometry: boolean;
    /** Typography character is classifiable from the observed families. */
    resolvesTypography: boolean;
    /** The compiler should say so rather than invent a confident answer. */
    expectsWarnings: boolean;
  };
}

function color(
  value: string,
  componentRole: BrandColorObservation["componentRole"],
  evidenceRef: string,
  extra: Partial<BrandColorObservation> = {}
): BrandColorObservation {
  return {
    color: value,
    componentRole,
    sourceAuthority: "official_dom",
    evidenceRef,
    ...extra
  };
}

function radius(
  componentClass: "button" | "card" | "input" | "container" | "media",
  valuePx: number,
  evidenceRef: string,
  weight = 1,
  sourceAuthority: BrandSourceAuthority = "official_dom"
) {
  return { componentClass, valuePx, evidenceRef, weight, sourceAuthority } as const;
}

export const BRAND_ARCHETYPE_FIXTURES: readonly BrandArchetypeFixture[] = [
  {
    id: "monochrome-pill",
    description: "Near-black ink on white with a single saturated action colour and pill controls.",
    evidence: {
      colors: [
        color("#0A0A0A", "text", "ev_mono_ink", { areaRatio: 0.18, frequency: 42, contrastUse: true }),
        color("#FFFFFF", "surface", "ev_mono_surface", { areaRatio: 0.74, frequency: 30 }),
        color("#FF3B00", "action", "ev_mono_action", { frequency: 9, contrastUse: true }),
        color("#F4F4F5", "surface", "ev_mono_alt_surface", { areaRatio: 0.08, frequency: 6 })
      ],
      radii: [
        radius("button", 999, "ev_mono_btn_a", 6),
        radius("button", 999, "ev_mono_btn_b", 4),
        radius("card", 12, "ev_mono_card_a", 5),
        radius("input", 999, "ev_mono_input", 3)
      ],
      borders: [
        { componentClass: "card", widthPx: 1, evidenceRef: "ev_mono_border", weight: 5, sourceAuthority: "official_dom" }
      ],
      shadows: [
        { character: "none", evidenceRef: "ev_mono_shadow_a", weight: 8, sourceAuthority: "official_dom" }
      ],
      typography: [
        {
          role: "heading",
          family: "Inter",
          portable: true,
          weight: 700,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_mono_heading"
        },
        {
          role: "body",
          family: "Inter",
          portable: true,
          weight: 400,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_mono_body"
        }
      ],
      density: [
        { sectionBlockPx: 120, gridGapPx: 32, sourceAuthority: "official_dom", evidenceRef: "ev_mono_density" }
      ]
    },
    expectation: {
      resolvesActionColor: true,
      resolvesGeometry: true,
      resolvesTypography: true,
      expectsWarnings: false
    }
  },
  {
    id: "high-color-rounded",
    description: "Multiple saturated brand colours, generously rounded cards, bold display type.",
    evidence: {
      colors: [
        color("#1B0B3B", "text", "ev_hc_ink", { areaRatio: 0.2, frequency: 35, contrastUse: true }),
        color("#FFF7ED", "surface", "ev_hc_surface", { areaRatio: 0.6, frequency: 24 }),
        color("#7C3AED", "action", "ev_hc_action", { frequency: 14, contrastUse: true }),
        color("#EC4899", "decorative", "ev_hc_decor_a", { areaRatio: 0.06, frequency: 8 }),
        color("#22D3EE", "decorative", "ev_hc_decor_b", { areaRatio: 0.05, frequency: 7 }),
        color("#FACC15", "decorative", "ev_hc_decor_c", { areaRatio: 0.04, frequency: 5 })
      ],
      radii: [
        radius("button", 24, "ev_hc_btn_a", 7),
        radius("card", 28, "ev_hc_card_a", 9),
        radius("card", 24, "ev_hc_card_b", 4),
        radius("media", 24, "ev_hc_media", 3)
      ],
      borders: [
        { componentClass: "card", widthPx: 0, evidenceRef: "ev_hc_border", weight: 9, sourceAuthority: "official_dom" }
      ],
      shadows: [
        { character: "elevated", evidenceRef: "ev_hc_shadow_a", weight: 7, sourceAuthority: "official_dom" },
        { character: "soft", evidenceRef: "ev_hc_shadow_b", weight: 3, sourceAuthority: "official_dom" }
      ],
      typography: [
        {
          role: "heading",
          family: "Poppins",
          portable: true,
          weight: 800,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_hc_heading"
        },
        {
          role: "body",
          family: "Poppins",
          portable: true,
          weight: 400,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_hc_body"
        }
      ],
      density: [
        { sectionBlockPx: 160, gridGapPx: 40, sourceAuthority: "official_dom", evidenceRef: "ev_hc_density" }
      ]
    },
    expectation: {
      resolvesActionColor: true,
      resolvesGeometry: true,
      resolvesTypography: true,
      expectsWarnings: false
    }
  },
  {
    id: "conservative-enterprise",
    description: "Navy and grey, compact spacing, modest radius, restrained single accent.",
    evidence: {
      colors: [
        color("#0F2440", "text", "ev_ent_ink", { areaRatio: 0.22, frequency: 55, contrastUse: true }),
        color("#FFFFFF", "surface", "ev_ent_surface", { areaRatio: 0.68, frequency: 40 }),
        color("#005EB8", "action", "ev_ent_action", { frequency: 18, contrastUse: true }),
        color("#E2E8F0", "border", "ev_ent_border_color", { areaRatio: 0.05, frequency: 22 })
      ],
      radii: [
        radius("button", 4, "ev_ent_btn_a", 12),
        radius("card", 4, "ev_ent_card_a", 14),
        radius("input", 4, "ev_ent_input", 9),
        radius("container", 0, "ev_ent_container", 6)
      ],
      borders: [
        { componentClass: "card", widthPx: 1, evidenceRef: "ev_ent_border_a", weight: 14, sourceAuthority: "official_dom" },
        { componentClass: "input", widthPx: 1, evidenceRef: "ev_ent_border_b", weight: 9, sourceAuthority: "official_dom" }
      ],
      shadows: [
        { character: "hairline", evidenceRef: "ev_ent_shadow", weight: 12, sourceAuthority: "official_dom" }
      ],
      typography: [
        {
          role: "heading",
          family: "Source Sans Pro",
          portable: true,
          weight: 600,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_ent_heading"
        },
        {
          role: "body",
          family: "Source Sans Pro",
          portable: true,
          weight: 400,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_ent_body"
        }
      ],
      density: [
        { sectionBlockPx: 72, gridGapPx: 20, sourceAuthority: "official_dom", evidenceRef: "ev_ent_density" }
      ]
    },
    expectation: {
      resolvesActionColor: true,
      resolvesGeometry: true,
      resolvesTypography: true,
      expectsWarnings: false
    }
  },
  {
    id: "editorial-serif",
    description: "Serif display, warm paper surface, quiet actions carried by type rather than fills.",
    evidence: {
      colors: [
        color("#1A1614", "text", "ev_ed_ink", { areaRatio: 0.26, frequency: 60, contrastUse: true }),
        color("#FBF7F0", "surface", "ev_ed_surface", { areaRatio: 0.66, frequency: 28 }),
        color("#8C2F1E", "action", "ev_ed_action", { frequency: 6, contrastUse: true })
      ],
      radii: [
        radius("button", 0, "ev_ed_btn_a", 5),
        radius("card", 0, "ev_ed_card_a", 8),
        radius("media", 2, "ev_ed_media", 3)
      ],
      borders: [
        { componentClass: "card", widthPx: 1, evidenceRef: "ev_ed_border", weight: 8, sourceAuthority: "official_dom" }
      ],
      shadows: [
        { character: "none", evidenceRef: "ev_ed_shadow", weight: 10, sourceAuthority: "official_dom" }
      ],
      typography: [
        {
          role: "heading",
          family: "Playfair Display",
          portable: true,
          character: "serif",
          weight: 500,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_ed_heading"
        },
        {
          role: "body",
          family: "Georgia",
          portable: true,
          character: "serif",
          weight: 400,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_ed_body"
        }
      ],
      density: [
        { sectionBlockPx: 140, gridGapPx: 48, sourceAuthority: "official_dom", evidenceRef: "ev_ed_density" }
      ]
    },
    expectation: {
      resolvesActionColor: true,
      resolvesGeometry: true,
      resolvesTypography: true,
      expectsWarnings: false
    }
  },
  {
    id: "sparse-logo-only",
    description: "A logo and two colours were recoverable; geometry and type were not observed.",
    evidence: {
      colors: [
        color("#222222", "text", "ev_sparse_ink", { frequency: 3 }),
        color("#FFFFFF", "surface", "ev_sparse_surface", { areaRatio: 0.9, frequency: 2 })
      ]
    },
    expectation: {
      resolvesActionColor: false,
      resolvesGeometry: false,
      resolvesTypography: false,
      expectsWarnings: true
    }
  },
  {
    id: "contradictory-evidence",
    description:
      "A third-party directory and a promotional overlay disagree with the site's own surface.",
    evidence: {
      colors: [
        color("#111827", "text", "ev_conflict_ink", { areaRatio: 0.15, frequency: 20, contrastUse: true }),
        color("#FFFFFF", "surface", "ev_conflict_surface", { areaRatio: 0.7, frequency: 18 }),
        color("#FF0090", "surface", "ev_conflict_promo", {
          areaRatio: 0.35,
          frequency: 1,
          surfaceKind: "promotional"
        }),
        color("#00A3A3", "action", "ev_conflict_directory", {
          sourceAuthority: "third_party",
          frequency: 2
        }),
        color("#2563EB", "action", "ev_conflict_action", { frequency: 7, contrastUse: true })
      ],
      radii: [
        radius("button", 8, "ev_conflict_btn_a", 3),
        radius("button", 40, "ev_conflict_btn_b", 3, "third_party")
      ],
      typography: [
        {
          role: "heading",
          family: "Helvetica Neue",
          portable: true,
          weight: 600,
          sourceAuthority: "official_dom",
          evidenceRef: "ev_conflict_heading"
        },
        {
          role: "heading",
          family: "Comic Sans MS",
          portable: true,
          weight: 400,
          sourceAuthority: "third_party",
          evidenceRef: "ev_conflict_heading_alt"
        }
      ]
    },
    expectation: {
      resolvesActionColor: true,
      resolvesGeometry: true,
      resolvesTypography: true,
      expectsWarnings: true
    }
  }
];

export function brandArchetypeFixture(id: BrandArchetypeId): BrandArchetypeFixture {
  const fixture = BRAND_ARCHETYPE_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown brand archetype fixture: ${id}`);
  return fixture;
}
