import { describe, expect, it } from "vitest";

import {
  BRAND_FIDELITY_REPAIR_THRESHOLD,
  contrastRatio,
  evaluateBrandFidelity,
  type BrandFidelityDimension,
  type BrandFidelityInput,
  type BrandFidelityReport
} from "@/lib/brand-fidelity-evaluator";
import { compileBrandSemantics } from "@/lib/brand-semantics";
import type { BrandSystemV2 } from "@/lib/brand-system";
import type {
  AssetAllocation,
  AssetAllocationPlan,
  AssetSemanticRole
} from "@/lib/asset-allocation";
import type { SectionCopyCandidate } from "@/lib/generation/section-copy-types";
import {
  BRAND_ARCHETYPE_FIXTURES,
  brandArchetypeFixture,
  type BrandArchetypeId
} from "../../tests/fixtures/brand-fidelity/archetypes";

const observedAt = "2026-08-27T12:00:00.000Z";
const revision = 4;

function role<T>(value: T, source: string, confidence = 0.9) {
  return { value, source, confidence, observedAt, revision };
}

function brandSystem(overrides: Partial<BrandSystemV2> = {}): BrandSystemV2 {
  return {
    revision,
    identity: { name: "Northwind Logistics", canonicalDomain: "northwind.example", aliases: [] },
    logo: { ref: "asset_logo_01", source: "official_dom", confidence: 0.92, status: "verified" },
    colorRoles: {
      ink: role("#101828", "ev_ink"),
      surface: role("#FFFFFF", "ev_surface"),
      accent: role("#2563EB", "ev_accent"),
      action: role("#2563EB", "ev_action"),
      support: role(["#E2E8F0"], "ev_support")
    },
    typography: {
      display: { ...role("Inter", "ev_display"), portable: true },
      body: { ...role("Inter", "ev_body"), portable: true }
    },
    geometry: { controlRadius: 8, cardRadius: 12, borderWidth: 1, shadow: "0 1px 2px rgba(0,0,0,.08)" },
    layout: { maxWidth: 1200, density: "balanced", navStyle: "minimal", heroStyle: "split" },
    imagery: { style: "photographic", candidates: [], selected: [] },
    motion: { style: "subtle", durationRangeMs: [150, 320] },
    readiness: "verified",
    confidence: 0.88,
    evidenceRefs: ["ev_ink", "ev_surface", "ev_accent"],
    ...overrides
  };
}

function allocation(
  sectionId: string,
  semanticRole: AssetSemanticRole,
  assetRef: string
): AssetAllocation {
  return {
    allocationKey: `${sectionId}:${semanticRole}`,
    sectionId,
    semanticRole,
    assetRef,
    evidenceRef: `ev_asset_${semanticRole}`,
    sourceUrlHash: `sh_${semanticRole}`,
    purpose: semanticRole,
    reusable: false,
    required: semanticRole === "hero",
    score: 0.8
  };
}

/** A healthy two-image plan, used wherever imagery is not the subject. */
const HEALTHY_PLAN: AssetAllocationPlan = {
  version: "asset-allocator-v1",
  allocations: [
    allocation("sec_hero", "hero", "asset_hero_01"),
    allocation("sec_proof", "proof", "asset_proof_01")
  ],
  treatments: [],
  rejections: [],
  substantiveCount: 2,
  reusableCount: 0
};

/** Cases that are not about imagery evaluate against a healthy plan. */
function evaluate(input: BrandFidelityInput): BrandFidelityReport {
  return evaluateBrandFidelity({ assetAllocation: HEALTHY_PLAN, ...input });
}

function section(
  sectionId: string,
  overrides: Partial<SectionCopyCandidate> = {}
): SectionCopyCandidate {
  return {
    sectionId,
    role: "hero",
    status: "complete",
    headline: `Cut dwell time at the ${sectionId} dock`,
    body: "Dispatchers see the delay before the driver does, so the reroute happens in the same shift.",
    evidenceRefs: ["ev_claim_01"],
    wordCount: 24,
    ...overrides
  };
}

function scoreFor(
  report: ReturnType<typeof evaluateBrandFidelity>,
  dimension: BrandFidelityDimension
): number {
  const entry = report.dimensions.find((candidate) => candidate.dimension === dimension);
  if (!entry) throw new Error(`Missing dimension: ${dimension}`);
  return entry.score;
}

function warningsFor(
  report: ReturnType<typeof evaluateBrandFidelity>,
  dimension: BrandFidelityDimension
): string[] {
  return report.dimensions.find((candidate) => candidate.dimension === dimension)?.warnings ?? [];
}

function violationsFor(
  report: ReturnType<typeof evaluateBrandFidelity>,
  dimension: BrandFidelityDimension
): string[] {
  return report.dimensions.find((candidate) => candidate.dimension === dimension)?.violations ?? [];
}

function semanticsFor(id: BrandArchetypeId) {
  return compileBrandSemantics(brandArchetypeFixture(id).evidence);
}

describe("brand fidelity evaluator", () => {
  const sections = [section("sec_hero"), section("sec_proof", { role: "proof" })];

  it("never blocks a render, whatever the evidence looks like", () => {
    const healthy = evaluate({ brand: brandSystem(), sections });
    const broken = evaluate({
      brand: brandSystem({
        logo: { confidence: 0, status: "missing" },
        colorRoles: {
          ink: role("#FFFFFF", "ev_ink", 0.2),
          surface: role("#FFFFFF", "ev_surface", 0.2),
          accent: role("#FFFFFF", "ev_accent", 0.2),
          action: role("#FFFFFF", "ev_action", 0.2),
          support: role([], "ev_support", 0.2)
        },
        readiness: "needs_input"
      }),
      sections: []
    });

    expect(healthy.blocking).toBe(false);
    expect(broken.blocking).toBe(false);
    expect(healthy.dimensions.every(({ blocking }) => blocking === false)).toBe(true);
    expect(broken.dimensions.every(({ blocking }) => blocking === false)).toBe(true);
    expect(broken.violations.length).toBeGreaterThan(0);
  });

  it("names the weakest dimensions as repair targets, worst first", () => {
    const report = evaluate({
      brand: brandSystem({
        logo: { confidence: 0, status: "missing" },
        colorRoles: {
          ink: role("#D9D9D9", "ev_ink", 0.3),
          surface: role("#FFFFFF", "ev_surface", 0.3),
          accent: role("#EFEFEF", "ev_accent", 0.3),
          action: role("#F2F2F2", "ev_action", 0.3),
          support: role([], "ev_support", 0.3)
        }
      }),
      sections
    });

    expect(report.repairDimensions).toContain("accessibility");
    expect(report.repairDimensions).toContain("semantic_palette");
    for (const [index, name] of report.repairDimensions.entries()) {
      if (index === 0) continue;
      expect(scoreFor(report, name)).toBeGreaterThanOrEqual(
        scoreFor(report, report.repairDimensions[index - 1]!)
      );
      expect(scoreFor(report, name)).toBeLessThan(BRAND_FIDELITY_REPAIR_THRESHOLD);
    }
  });

  it("fails body text that cannot meet AA contrast and passes text that can", () => {
    expect(contrastRatio("#101828", "#FFFFFF")).toBeGreaterThan(7);
    expect(contrastRatio("#BFBFBF", "#FFFFFF")).toBeLessThan(4.5);

    const failing = evaluate({
      brand: brandSystem({
        colorRoles: {
          ink: role("#BFBFBF", "ev_ink"),
          surface: role("#FFFFFF", "ev_surface"),
          accent: role("#2563EB", "ev_accent"),
          action: role("#2563EB", "ev_action"),
          support: role([], "ev_support")
        }
      }),
      sections
    });

    expect(violationsFor(failing, "accessibility")).toContain("body_text_below_wcag_aa");
    expect(violationsFor(evaluate({ brand: brandSystem(), sections }), "accessibility")).toEqual(
      []
    );
  });

  it("treats a repeated substantive image as a violation and a designed treatment as honest", () => {
    const repeated = evaluate({
      brand: brandSystem(),
      assetAllocation: {
        version: "asset-allocator-v1",
        allocations: [
          allocation("sec_hero", "hero", "asset_hero_01"),
          allocation("sec_proof", "proof", "asset_hero_01")
        ],
        treatments: [],
        rejections: [],
        substantiveCount: 2,
        reusableCount: 0
      },
      sections
    });
    const designed = evaluate({
      brand: brandSystem({ imagery: { style: "type-led", candidates: [], selected: [] } }),
      assetAllocation: {
        version: "asset-allocator-v1",
        allocations: [],
        treatments: [
          {
            sectionId: "sec_hero",
            semanticRole: "hero",
            treatment: "designed_non_image",
            reason: "no_credible_asset_available"
          }
        ],
        rejections: [],
        substantiveCount: 0,
        reusableCount: 0
      },
      sections
    });

    expect(violationsFor(repeated, "imagery_quality")).toContain("substantive_asset_repeated");
    expect(violationsFor(designed, "imagery_quality")).toEqual([]);
    expect(warningsFor(designed, "imagery_quality")).toContain("all_slots_designed_non_image");
  });

  it("separates generic vendor language from copy that names a specific situation", () => {
    const generic = evaluate({
      brand: brandSystem(),
      sections: [
        section("sec_hero", {
          headline: "Unlock value with our best-in-class platform",
          body: "A seamless, industry-leading, end-to-end solution that empowers your team."
        }),
        section("sec_proof", {
          headline: "Next-generation, world-class results",
          body: "Cutting-edge and state-of-the-art capabilities that unlock potential."
        })
      ]
    });
    const specific = evaluate({ brand: brandSystem(), sections });

    expect(warningsFor(generic, "copy_specificity")).toContain("generic_vendor_language");
    expect(scoreFor(specific, "copy_specificity")).toBeGreaterThan(
      scoreFor(generic, "copy_specificity")
    );
  });

  it("flags a citation the build was never given evidence for", () => {
    const invented = evaluate({
      brand: brandSystem(),
      sections: [section("sec_hero", { evidenceRefs: ["ev_not_supplied"] })],
      availableEvidenceRefs: ["ev_claim_01", "ev_claim_02"]
    });
    const honest = evaluate({
      brand: brandSystem(),
      sections: [section("sec_hero", { evidenceRefs: ["ev_claim_01"] })],
      availableEvidenceRefs: ["ev_claim_01", "ev_claim_02"]
    });

    expect(violationsFor(invented, "evidence_linkage")).toContain(
      "evidence_ref_outside_supplied_set"
    );
    expect(violationsFor(honest, "evidence_linkage")).toEqual([]);
    expect(warningsFor(
      evaluate({
        brand: brandSystem(),
        sections: [section("sec_hero", { evidenceRefs: [] })]
      }),
      "evidence_linkage"
    )).toContain("section_without_evidence_citation");
  });

  it("scores an omitted section without counting it as missing copy", () => {
    const report = evaluate({
      brand: brandSystem(),
      sections: [
        section("sec_hero"),
        section("sec_proof", {
          status: "omitted",
          headline: undefined,
          body: undefined,
          evidenceRefs: [],
          wordCount: 0,
          omissionReason: "unsupported_optional_slot"
        })
      ]
    });

    expect(violationsFor(report, "copy_specificity")).toEqual([]);
    expect(violationsFor(report, "evidence_linkage")).toEqual([]);
  });
});

describe("brand fidelity across archetypes", () => {
  const sections = [section("sec_hero"), section("sec_proof", { role: "proof" })];

  it("compiles every archetype to a usable system without company-specific rules", () => {
    for (const fixture of BRAND_ARCHETYPE_FIXTURES) {
      const semantics = compileBrandSemantics(fixture.evidence);
      expect(semantics.version).toBe("brand-semantics-v1");
      expect(semantics.colors.ctaBackground.applied).toBe(fixture.expectation.resolvesActionColor);
      expect(semantics.geometry.buttonRadius.applied).toBe(fixture.expectation.resolvesGeometry);
      expect(semantics.typography.headingFont.applied).toBe(
        fixture.expectation.resolvesTypography
      );
      expect(semantics.warnings.length > 0).toBe(fixture.expectation.expectsWarnings);
    }
  });

  it("scores a well-evidenced archetype above one with sparse evidence", () => {
    const strong = evaluate({
      brand: brandSystem({ semantics: semanticsFor("conservative-enterprise") }),
      sections
    });
    const sparse = evaluate({
      brand: brandSystem({
        semantics: semanticsFor("sparse-logo-only"),
        readiness: "partial",
        confidence: 0.4
      }),
      sections
    });

    expect(strong.score).toBeGreaterThan(sparse.score);
    expect(sparse.blocking).toBe(false);
    expect(sparse.repairDimensions).toContain("representative_geometry");
  });

  it("gives distinct archetypes distinct compiled geometry rather than one house style", () => {
    const pill = semanticsFor("monochrome-pill").geometry.buttonRadius.value;
    const rounded = semanticsFor("high-color-rounded").geometry.buttonRadius.value;
    const enterprise = semanticsFor("conservative-enterprise").geometry.buttonRadius.value;
    const editorial = semanticsFor("editorial-serif").geometry.buttonRadius.value;

    expect(pill).toBeGreaterThan(rounded);
    expect(rounded).toBeGreaterThan(enterprise);
    expect(enterprise).toBeGreaterThanOrEqual(editorial);
    expect(new Set([pill, rounded, enterprise]).size).toBe(3);
  });

  it("keeps a promotional overlay and a third-party directory out of the durable roles", () => {
    const semantics = semanticsFor("contradictory-evidence");

    expect(semantics.colors.surface.value.toUpperCase()).not.toBe("#FF0090");
    expect(semantics.colors.ctaBackground.value.toUpperCase()).toBe("#2563EB");
    expect(semantics.typography.headingFont.value).toBe("Helvetica Neue");
  });

  it("reports the same result twice for the same evidence", () => {
    const brand = brandSystem({ semantics: semanticsFor("editorial-serif") });
    const first = evaluate({ brand, sections });
    const second = evaluate({ brand, sections });

    expect(second).toEqual(first);
  });
});
