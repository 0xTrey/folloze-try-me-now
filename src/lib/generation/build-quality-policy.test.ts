import { describe, expect, it } from "vitest";
import { buildQualityReceipt, evaluateBuildQuality } from "./build-quality-policy";
import type { BuildExperiencePlan } from "./build-experience-plan";
import type { BrandSystemV2 } from "@/lib/brand-system";
import type { SectionCopyCandidate, SectionEvidenceClaim } from "./section-copy-types";

const evidence: SectionEvidenceClaim[] = [
  { id: "offer-1", text: "Governed approvals stay traceable through each review.", confidence: 0.9, revision: 1, sourceRole: "offer" },
  { id: "proof-1", text: "Teams can compare approval ownership before a rollout.", confidence: 0.9, revision: 1, sourceRole: "source" },
  { id: "other-1", text: "An unrelated fact.", confidence: 0.9, revision: 1, sourceRole: "source" }
];

const role = <T,>(value: T, source: string) => ({ value, source, confidence: 0.9, observedAt: "2026-09-07", revision: 1 });
const brand = (overrides: Partial<BrandSystemV2> = {}): BrandSystemV2 => ({
  revision: 1,
  identity: { name: "Acme", canonicalDomain: "acme.example", aliases: [] },
  logo: { status: "verified", confidence: 0.9 },
  colorRoles: { ink: role("#101828", "ink"), surface: role("#FFFFFF", "surface"), accent: role("#2563EB", "accent"), action: role("#2563EB", "action"), support: role(["#E2E8F0"], "support") },
  typography: { display: { ...role("Inter", "display"), portable: true }, body: { ...role("Inter", "body"), portable: true } },
  geometry: { controlRadius: 8, cardRadius: 12, borderWidth: 1, shadow: "none" },
  layout: { maxWidth: 1200, density: "balanced", navStyle: "minimal", heroStyle: "split" },
  imagery: { style: "type-led", candidates: [], selected: [] },
  motion: { style: "none", durationRangeMs: [0, 0] },
  readiness: "verified", confidence: 0.9, evidenceRefs: ["ink", "surface", "accent"],
  ...overrides
});

const plan = (): BuildExperiencePlan => ({
  digest: "plan-digest",
  buyer: { product: { label: "Acme approvals" } },
  readiness: { offerFactCount: 1 },
  sections: [
    { id: "mechanism", role: "mechanism", claimRefs: ["offer-1"], evidenceMode: "supported-facts" },
    { id: "proof", role: "proof", claimRefs: ["proof-1"], evidenceMode: "supported-facts" }
  ]
} as unknown as BuildExperiencePlan);

const section = (overrides: Partial<SectionCopyCandidate> = {}): SectionCopyCandidate => ({
  sectionId: "mechanism", role: "mechanism", v2Role: "mechanism", claimType: "fact", status: "complete",
  headline: "Make approval ownership visible", body: "Governed approvals stay traceable through each review.",
  evidenceRefs: ["offer-1"], wordCount: 8, ...overrides
});

const evaluate = (sections: readonly SectionCopyCandidate[], options: { plan?: BuildExperiencePlan; brand?: BrandSystemV2; factualityPassed?: boolean } = {}) =>
  evaluateBuildQuality({ plan: options.plan ?? plan(), brand: options.brand ?? brand(), sections, evidence, factualityPassed: options.factualityPassed ?? true });

describe("build quality policy", () => {
  it("accepts legitimately thin but substantive, safe copy", () => {
    const report = evaluate([section()]);
    expect(report.accepted).toBe(true);
    expect(report.dimensions).toMatchObject({ factualSafety: "passed-existing-editor", buyerUsefulness: "pass" });
    expect(report.sections[0]).toMatchObject({ substantive: true, validationOnly: false });
  });

  it("blocks a page made entirely of validation homework even with valid citations", () => {
    const report = evaluate([section({
      headline: "Verify the first approval path",
      body: "Verify governed approvals stay traceable through each review.",
      evidenceRefs: ["offer-1"]
    })]);
    expect(report.blockers).toContain("all_sections_validation_only");
    expect(report.dimensions.buyerUsefulness).toBe("fail");
  });

  it("blocks off-plan facts, internal instructions, eyebrows, and em dashes", () => {
    const report = evaluate([
      section({ evidenceRefs: ["other-1"], body: "This page uses the supplied evidence." }),
      section({ sectionId: "proof", role: "proof", v2Role: "proof", evidenceRefs: ["proof-1"], eyebrow: "Evidence", body: "Teams can compare approval ownership before a rollout — then decide." })
    ]);
    expect(report.blockers).toEqual(expect.arrayContaining([
      "evidence_outside_plan", "internal_narration", "prohibited_eyebrow", "prohibited_em_dash"
    ]));
    expect(report.dimensions.factualSafety).toBe("failed");
    expect(report.dimensions.buyerUsefulness).toBe("fail");
  });

  it("blocks an unplanned section and repeated middle argument", () => {
    const repeated = "Governed approvals stay traceable through each review for every owner.";
    const report = evaluate([
      section({ body: repeated }),
      section({ sectionId: "proof", role: "proof", v2Role: "proof", body: repeated, evidenceRefs: ["proof-1"] }),
      section({ sectionId: "unplanned", role: "proof", body: "Teams can compare approval ownership before a rollout.", evidenceRefs: ["proof-1"] })
    ]);
    expect(report.blockers).toEqual(expect.arrayContaining(["repeated_section_argument", "section_not_in_plan"]));
  });

  it("uses confirmed brand evaluator violations and keeps the public receipt code and count only", () => {
    const report = evaluate([section()], { brand: brand({ identity: { name: "", canonicalDomain: "", aliases: [] } }) });
    const receipt = buildQualityReceipt(report);
    expect(report.blockers).toEqual(expect.arrayContaining(["identity_name_missing", "canonical_domain_missing"]));
    expect(report.dimensions.brandFidelity).toBe("fail");
    expect(JSON.stringify(receipt)).not.toMatch(/traceable|Acme approvals|offer-1/);
    expect(receipt).toMatchObject({ substantiveSections: 1, validationOnlySections: 0, humanApproval: "not-performed" });
  });

  it("blocks a middle section repeating the opening even under a new headline", () => {
    const value = plan();
    value.sections.unshift({ ...value.sections[0]!, id: "opening", role: "buyer-outcome" });
    const report = evaluate([
      section({ sectionId: "opening", role: "hero", headline: "Explore the approval workflow" }),
      section()
    ], { plan: value });
    expect(report.blockers).toContain("repeated_section_argument");
  });
});
