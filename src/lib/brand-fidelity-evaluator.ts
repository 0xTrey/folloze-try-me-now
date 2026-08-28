/**
 * Scores how faithfully a compiled experience reflects the brand evidence it
 * was built from.
 *
 * The evaluator is diagnostic, never a gate. A brand with thin evidence should
 * still reach the visitor as an honest provisional experience, so every
 * dimension returns `blocking: false` and reports repair suggestions instead of
 * refusing the render. It also judges behavior rather than companies: nothing
 * here knows a brand name, domain, or literal colour, so a new archetype scores
 * on the same rules as an existing one.
 */

import {
  allocationSourceIdentityKey,
  type AssetAllocationPlan
} from "@/lib/asset-allocation";
import type { BrandSemanticSystem } from "@/lib/brand-semantics";
import { privateAssetAllocationFor, type BrandSystemV2 } from "@/lib/brand-system";
import type { QualityTrace } from "@/lib/build-trace";
import type { SectionCopyCandidate } from "@/lib/generation/section-copy-types";

export const BRAND_FIDELITY_EVALUATOR_VERSION = "brand-fidelity-evaluator-v1";

/** Below this a dimension is worth repairing before the experience is reused. */
export const BRAND_FIDELITY_REPAIR_THRESHOLD = 0.6;

export type BrandFidelityDimension =
  | "identity_and_logo"
  | "semantic_palette"
  | "typography_character"
  | "representative_geometry"
  | "density_and_rhythm"
  | "imagery_quality"
  | "copy_specificity"
  | "evidence_linkage"
  | "accessibility";

export interface BrandFidelityInput {
  brand: BrandSystemV2;
  /**
   * The private allocation plan. Defaults to the one compiled with the brand
   * system; imagery scores 0.5 with a warning when neither is available.
   */
  assetAllocation?: AssetAllocationPlan;
  sections: readonly SectionCopyCandidate[];
  /** Evidence ids the build was allowed to cite. */
  availableEvidenceRefs?: readonly string[];
}

export interface BrandFidelityReport {
  version: typeof BRAND_FIDELITY_EVALUATOR_VERSION;
  /** Mean of the dimension scores, 0..1. Reported, never enforced. */
  score: number;
  blocking: false;
  dimensions: QualityTrace[];
  /** Dimensions scoring under the repair threshold, worst first. */
  repairDimensions: BrandFidelityDimension[];
  warnings: string[];
  violations: string[];
}

interface DimensionResult {
  dimension: BrandFidelityDimension;
  score: number;
  warnings: string[];
  violations: string[];
  evidenceRefs: string[];
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Math.round(value * 10_000) / 10_000));
}

function dimension(
  name: BrandFidelityDimension,
  score: number,
  warnings: string[],
  violations: string[],
  evidenceRefs: readonly string[] = []
): DimensionResult {
  return {
    dimension: name,
    score: clamp(score),
    warnings: [...new Set(warnings)].sort(),
    violations: [...new Set(violations)].sort(),
    evidenceRefs: [...new Set(evidenceRefs)].sort().slice(0, 24)
  };
}

/** Relative luminance per WCAG 2.1, from a `#rrggbb` value. */
function luminance(hex: string): number | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const channels = [0, 2, 4].map((offset) => {
    const part = Number.parseInt(match[1]!.slice(offset, offset + 2), 16) / 255;
    return part <= 0.039_28 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(foreground: string, background: string): number | undefined {
  const first = luminance(foreground);
  const second = luminance(background);
  if (first === undefined || second === undefined) return undefined;
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function distinct(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim().toLowerCase());
  return new Set(normalized).size === normalized.length;
}

function scoreIdentity(brand: BrandSystemV2): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  let score = 1;

  if (!brand.identity.name.trim()) {
    violations.push("identity_name_missing");
    score -= 0.5;
  }
  if (!brand.identity.canonicalDomain.trim()) {
    violations.push("canonical_domain_missing");
    score -= 0.2;
  }
  if (brand.logo.status === "missing") {
    // A missing logo is an honest state with a type-led treatment behind it,
    // so it costs confidence rather than counting as a defect.
    warnings.push("logo_missing_type_led_treatment");
    score -= 0.3;
  } else if (brand.logo.confidence < 0.6) {
    warnings.push("logo_low_confidence");
    score -= 0.15;
  }

  return dimension("identity_and_logo", score, warnings, violations, brand.evidenceRefs);
}

function scorePalette(brand: BrandSystemV2, semantics?: BrandSemanticSystem): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  const roles = brand.colorRoles;
  const values = [roles.ink.value, roles.surface.value, roles.accent.value, roles.action.value];
  let score = 1;

  if (values.some((value) => !/^#[0-9a-f]{6}$/i.test(value))) {
    violations.push("color_role_not_resolved");
    score -= 0.4;
  }
  if (!distinct([roles.ink.value, roles.surface.value])) {
    violations.push("ink_equals_surface");
    score -= 0.4;
  }
  // An accent a few percent off the surface is technically a different colour
  // and visually absent, so distinctness is measured rather than compared.
  for (const [name, value] of [
    ["accent", roles.accent.value],
    ["action", roles.action.value]
  ] as const) {
    const separation = contrastRatio(value, roles.surface.value);
    if (separation !== undefined && separation < 1.3) {
      warnings.push(`${name}_indistinct_from_surface`);
      score -= 0.2;
    }
  }

  const roleConfidence =
    [roles.ink, roles.surface, roles.accent, roles.action].reduce(
      (total, role) => total + clamp(role.confidence),
      0
    ) / 4;
  score -= (1 - roleConfidence) * 0.3;

  if (semantics) {
    const applied = Object.values(semantics.colors).filter((role) => role.applied);
    if (!applied.length) {
      warnings.push("no_semantic_color_role_applied");
      score -= 0.2;
    }
    // A transient promotional band should never win a durable role. The
    // compiler already excludes it, so a surviving warning is worth surfacing.
    for (const warning of semantics.warnings) {
      if (warning.includes("transient")) warnings.push("transient_surface_influenced_palette");
    }
  } else {
    warnings.push("scalar_palette_without_observations");
    score -= 0.15;
  }

  const evidenceRefs = [
    roles.ink.source,
    roles.surface.source,
    roles.accent.source,
    roles.action.source
  ].filter((value): value is string => Boolean(value));
  return dimension("semantic_palette", score, warnings, violations, evidenceRefs);
}

function scoreTypography(brand: BrandSystemV2, semantics?: BrandSemanticSystem): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  let score = 1;

  const display = brand.typography.display.value?.trim();
  const body = brand.typography.body.value?.trim();
  if (!display || !body) {
    violations.push("font_role_unresolved");
    score -= 0.4;
  }

  const confidence =
    (clamp(brand.typography.display.confidence) + clamp(brand.typography.body.confidence)) / 2;
  score -= (1 - confidence) * 0.3;

  if (semantics) {
    if (!semantics.typography.fontCharacter.applied) {
      warnings.push("font_character_unclassified");
      score -= 0.2;
    }
    if (!semantics.typography.weightCharacter.applied) {
      warnings.push("weight_character_unclassified");
      score -= 0.1;
    }
  } else {
    warnings.push("typography_without_observations");
    score -= 0.15;
  }

  return dimension("typography_character", score, warnings, violations, [
    brand.typography.display.source,
    brand.typography.body.source
  ]);
}

function scoreGeometry(brand: BrandSystemV2, semantics?: BrandSemanticSystem): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  let score = 1;

  const { controlRadius, cardRadius, borderWidth } = brand.geometry;
  if ([controlRadius, cardRadius, borderWidth].some((value) => !Number.isFinite(value) || value < 0)) {
    violations.push("geometry_value_invalid");
    score -= 0.5;
  }
  if (cardRadius > 0 && controlRadius > 0) {
    // Radii drawn from one design language track together. A card an order of
    // magnitude off its controls usually means two sources were merged.
    const ratio = Math.max(controlRadius, cardRadius) / Math.min(controlRadius, cardRadius);
    if (ratio > 8) {
      warnings.push("control_and_card_radius_diverge");
      score -= 0.2;
    }
  }

  if (semantics) {
    const roles = [
      semantics.geometry.buttonRadius,
      semantics.geometry.cardRadius,
      semantics.geometry.borderWidth,
      semantics.geometry.shadowCharacter
    ];
    const applied = roles.filter((role) => role.applied);
    // Geometry nobody observed is the product's default, not the brand's, so a
    // fully defaulted system scores as half-credible however valid its numbers.
    score = Math.min(score, 0.5 + 0.5 * (applied.length / roles.length));
    if (applied.length < 2) warnings.push("geometry_mostly_defaulted");
    for (const role of applied) {
      if (role.selectionReasons.some((reason) => reason.includes("mixed"))) {
        warnings.push("mixed_geometry_distribution");
      }
    }
  } else {
    warnings.push("geometry_without_observations");
    score -= 0.25;
  }

  return dimension(
    "representative_geometry",
    score,
    warnings,
    violations,
    semantics?.evidenceRefs ?? []
  );
}

function scoreDensity(brand: BrandSystemV2, semantics?: BrandSemanticSystem): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  let score = 1;

  if (brand.layout.maxWidth < 640 || brand.layout.maxWidth > 1800) {
    warnings.push("layout_max_width_outside_readable_range");
    score -= 0.25;
  }
  if (semantics && !semantics.geometry.density.applied) {
    warnings.push("density_defaulted");
    score -= 0.25;
  }
  if (!brand.layout.heroStyle.trim() || !brand.layout.navStyle.trim()) {
    violations.push("layout_role_unresolved");
    score -= 0.3;
  }

  return dimension("density_and_rhythm", score, warnings, violations);
}

function scoreImagery(plan: AssetAllocationPlan | undefined): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  let score = 1;

  if (!plan) {
    warnings.push("no_allocation_plan");
    return dimension("imagery_quality", 0.5, warnings, violations);
  }

  const substantive = plan.allocations.filter((allocation) => !allocation.reusable);
  if (
    !distinct(substantive.map((allocation) => allocationSourceIdentityKey(allocation)))
  ) {
    // Repeating one photograph across sections is the clearest signal that the
    // experience is padding rather than showing evidence.
    violations.push("substantive_asset_repeated");
    score -= 0.5;
  }
  if (!plan.allocations.length) {
    warnings.push("no_asset_allocated");
    score -= 0.3;
  }
  if (plan.treatments.length && !plan.allocations.length) {
    warnings.push("all_slots_designed_non_image");
  }
  if (plan.rejections.length > plan.allocations.length) {
    warnings.push("most_candidates_rejected");
    score -= 0.15;
  }

  const weak = plan.allocations.filter((allocation) => allocation.score < 0.4);
  if (weak.length) {
    warnings.push("low_scoring_asset_allocated");
    score -= Math.min(0.2, weak.length * 0.05);
  }

  return dimension(
    "imagery_quality",
    score,
    warnings,
    violations,
    plan.allocations.map((allocation) => allocation.evidenceRef)
  );
}

/**
 * Filler that could sit on any vendor's page. It is measured rather than
 * banned: some is tolerable, a section built from it is not.
 */
const GENERIC_COPY_PATTERNS: readonly RegExp[] = [
  /\bbest[- ]in[- ]class\b/i,
  /\bcutting[- ]edge\b/i,
  /\bempower(?:s|ing)?\b/i,
  /\bend[- ]to[- ]end\b/i,
  /\bindustry[- ]leading\b/i,
  /\bnext[- ]generation\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\bunlock(?:s|ing)? (?:value|potential)\b/i,
  /\bworld[- ]class\b/i
];

function sectionText(section: SectionCopyCandidate): string {
  return [
    section.eyebrow,
    section.headline,
    section.body,
    ...(section.choices ?? []).flatMap((choice) => [choice.label, choice.body])
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

function scoreCopySpecificity(sections: readonly SectionCopyCandidate[]): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  const rendered = sections.filter((section) => section.status === "complete");
  if (!rendered.length) {
    return dimension("copy_specificity", 0, warnings, ["no_rendered_section"]);
  }

  let genericSections = 0;
  let emptySections = 0;
  for (const section of rendered) {
    const text = sectionText(section);
    if (!text.trim()) {
      emptySections += 1;
      continue;
    }
    const hits = GENERIC_COPY_PATTERNS.filter((pattern) => pattern.test(text)).length;
    if (hits >= 2) genericSections += 1;
  }

  if (emptySections) {
    violations.push("rendered_section_without_copy");
  }
  if (genericSections) {
    warnings.push("generic_vendor_language");
  }

  const headlines = rendered
    .map((section) => section.headline?.trim())
    .filter((value): value is string => Boolean(value));
  if (headlines.length > 1 && !distinct(headlines)) {
    violations.push("duplicate_headline");
  }

  const score =
    1
    - genericSections / rendered.length
    - emptySections / rendered.length
    - (headlines.length > 1 && !distinct(headlines) ? 0.2 : 0);
  return dimension("copy_specificity", score, warnings, violations);
}

function scoreEvidenceLinkage(input: BrandFidelityInput): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  const rendered = input.sections.filter((section) => section.status === "complete");
  if (!rendered.length) {
    return dimension("evidence_linkage", 0, warnings, ["no_rendered_section"]);
  }

  const available = new Set(input.availableEvidenceRefs ?? []);
  const cited = new Set<string>();
  let uncitedSections = 0;
  let unknownRefs = 0;

  for (const section of rendered) {
    if (!section.evidenceRefs.length) {
      uncitedSections += 1;
      continue;
    }
    for (const ref of section.evidenceRefs) {
      cited.add(ref);
      if (available.size && !available.has(ref)) unknownRefs += 1;
    }
  }

  if (unknownRefs) {
    // A ref outside the supplied set means copy cites something the build was
    // never given, which is the shape an invented claim takes.
    violations.push("evidence_ref_outside_supplied_set");
  }
  if (uncitedSections) {
    warnings.push("section_without_evidence_citation");
  }

  const coverage = (rendered.length - uncitedSections) / rendered.length;
  const breadth = available.size ? Math.min(1, cited.size / available.size) : 1;
  const score = coverage * 0.7 + breadth * 0.3 - (unknownRefs ? 0.4 : 0);
  return dimension("evidence_linkage", score, warnings, violations, [...cited]);
}

function scoreAccessibility(brand: BrandSystemV2): DimensionResult {
  const warnings: string[] = [];
  const violations: string[] = [];
  let score = 1;

  const bodyContrast = contrastRatio(brand.colorRoles.ink.value, brand.colorRoles.surface.value);
  if (bodyContrast === undefined) {
    warnings.push("body_contrast_unmeasurable");
    score -= 0.3;
  } else if (bodyContrast < 4.5) {
    violations.push("body_text_below_wcag_aa");
    score -= 0.5;
  } else if (bodyContrast < 7) {
    warnings.push("body_text_below_wcag_aaa");
    score -= 0.1;
  }

  const actionContrast = contrastRatio(
    brand.colorRoles.action.value,
    brand.colorRoles.surface.value
  );
  if (actionContrast !== undefined && actionContrast < 3) {
    violations.push("action_color_below_ui_contrast");
    score -= 0.3;
  }

  return dimension("accessibility", score, warnings, violations);
}

/**
 * Scores a compiled experience across every fidelity dimension. Failures are
 * reported, never thrown: an evaluator that can break a build is a gate, and
 * this one exists to describe quality rather than withhold an experience.
 */
export function evaluateBrandFidelity(input: BrandFidelityInput): BrandFidelityReport {
  const { brand } = input;
  const semantics = brand.semantics;
  const results = [
    scoreIdentity(brand),
    scorePalette(brand, semantics),
    scoreTypography(brand, semantics),
    scoreGeometry(brand, semantics),
    scoreDensity(brand, semantics),
    scoreImagery(input.assetAllocation ?? privateAssetAllocationFor(brand)),
    scoreCopySpecificity(input.sections),
    scoreEvidenceLinkage(input),
    scoreAccessibility(brand)
  ];

  const dimensions = results.map(
    (result): QualityTrace => ({
      dimension: result.dimension,
      score: result.score,
      blocking: false,
      warnings: result.warnings,
      violations: result.violations,
      evidenceRefs: result.evidenceRefs
    })
  );

  const repairDimensions = results
    .filter((result) => result.score < BRAND_FIDELITY_REPAIR_THRESHOLD)
    .sort((left, right) => left.score - right.score || left.dimension.localeCompare(right.dimension))
    .map((result) => result.dimension);

  return {
    version: BRAND_FIDELITY_EVALUATOR_VERSION,
    score: clamp(results.reduce((total, result) => total + result.score, 0) / results.length),
    blocking: false,
    dimensions,
    repairDimensions,
    warnings: [...new Set(results.flatMap((result) => result.warnings))].sort(),
    violations: [...new Set(results.flatMap((result) => result.violations))].sort()
  };
}
