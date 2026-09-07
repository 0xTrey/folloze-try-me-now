import { describe, expect, it } from "vitest";
import { compileBuildBrandKit, planSectionDesign } from "./build-brand-kit";
import type { BrandProfile, BrandReadiness } from "@/lib/types";
import type { BuyerDecisionBrief, BuyerSectionAssignment } from "./buyer-decision-journey";

const ready: BrandReadiness = { status: "ready", identityReady: true, logoReady: true, paletteReady: true, designReady: true, sourceEvidenceReady: true, reasons: [] };
const brand = (overrides: Partial<BrandProfile> = {}): BrandProfile => ({
  domain: "acme.example",
  canonicalDomain: "acme.example",
  companyName: "Acme",
  publicTopics: [],
  imageUrls: ["https://cdn.acme.example/dashboard.png", "https://cdn.acme.example/diagram.png"],
  imageMetadata: {
    "https://cdn.acme.example/dashboard.png": { contentHash: "dashboard-hash", width: 1200, height: 800 },
    "https://cdn.acme.example/diagram.png": { contentHash: "diagram-hash", width: 1200, height: 800 }
  },
  colors: ["#111111", "#336699", "#FFFFFF"],
  primaryColor: "#123456",
  accentColor: "#336699",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "Acme Sans",
  bodyFontFamily: "Acme Sans",
  sourceUrl: "https://acme.example/brand",
  source: "brand-harvester",
  designDna: { version: 1, source: "verified-profile", confidence: "high", theme: { hero: "dark", motif: "technical-grid" }, spacing: { sectionBlockPx: 128, gridGapPx: 28 } },
  readiness: ready,
  ...overrides
});
const brief = (overrides: Partial<BuyerDecisionBrief["knowledge"]["voice"]> = {}): BuyerDecisionBrief => ({
  schemaVersion: "buyer-decision-journey-v1", product: { status: "exact", label: "Acme Flow" }, audience: "Operators", buyerJob: "Evaluate", trafficIntent: { value: "search", status: "known" }, buyingStage: { value: "evaluation", source: "visitor" }, primaryBuyerQuestion: "Can this fit?", questions: [], cta: { expectations: "known" },
  knowledge: { productOffer: [], workflowContext: [], supportedCapabilityWorkflowClaims: [], proofClaims: [], resources: [], objections: { pricing: [], security: [], implementation: [] }, targetAccountContext: [], voice: { description: "Clear and direct", provenance: "https://acme.example/brand", status: "sourced", ...overrides } }, digest: "brief", fetchedAt: "now", expiresAt: "later"
});
const assignment: BuyerSectionAssignment = { id: "hero", role: "buyer-outcome", navigationLabel: "Outcome", buyerJob: "Understand", claimType: "fact", requiredEvidenceKinds: ["offer"], optional: false, wordBudget: { headline: [6, 24], body: [16, 90] }, visualRole: "hero-image-or-type", buyerQuestion: "What changes?", desiredConclusion: "This fits.", claimRefs: ["offer-1"], transition: "Next, see how." };

describe("build brand kit", () => {
  it("is stable for the same brand inputs and invalidates for brand or voice changes, not a brief digest", () => {
    const first = compileBuildBrandKit({ brand: brand(), brief: brief() });
    const same = compileBuildBrandKit({ brand: brand(), brief: { ...brief(), digest: "different-brief-digest", audience: "Different audience", cta: { expectations: "unknown" } } });
    const changedVisual = compileBuildBrandKit({ brand: brand({ primaryColor: "#654321" }), brief: brief() });
    const changedGeometry = compileBuildBrandKit({ brand: brand({ designDna: { ...brand().designDna!, cards: { radiusPx: 24 } } }), brief: brief() });
    const changedVoice = compileBuildBrandKit({ brand: brand(), brief: brief({ description: "Precise and calm" }) });
    expect(same.digest).toBe(first.digest);
    expect(changedVisual.digest).not.toBe(first.digest);
    expect(changedGeometry.digest).not.toBe(first.digest);
    expect(changedVoice.digest).not.toBe(first.digest);
  });

  it("uses assessed readiness when no receipt is stored and preserves independently verified partial tokens", () => {
    const noStoredReceipt = brand({ readiness: undefined });
    const assessed = compileBuildBrandKit({ brand: noStoredReceipt, brief: brief() });
    const partial = compileBuildBrandKit({ brand: brand({ readiness: { ...ready, status: "incomplete", designReady: false, reasons: ["geometry missing"] } }), brief: brief() });
    const fallback = compileBuildBrandKit({ brand: brand({ source: "fallback", readiness: ready }), brief: brief() });
    expect(assessed.readiness).toBe("partial");
    expect(partial.visual.primary).toBe("#123456");
    expect(partial.visual.displayFont).toBe("Acme Sans");
    expect(fallback.readiness).toBe("unknown");
    expect(fallback.visual.primary).toBe("unknown");
    expect(fallback.visual.density).toBe("unknown");
    expect(fallback.visual).not.toHaveProperty("motif");
  });

  it("keeps only first-party public sources and safe, unique assets without treating filenames as proof", () => {
    const kit = compileBuildBrandKit({
      brand: brand({
        sourceUrl: "https://acme.example/brand?token=secret",
        imageUrls: [
          "https://cdn.acme.example/dashboard.png",
          "https://cdn.acme.example/dashboard-mobile.png",
          "https://localhost/private.png",
          "https://cdn.acme.example/customer-results.png?signature=secret",
          "https://cdn.acme.example/diagram.png"
        ],
        imageMetadata: {
          "https://cdn.acme.example/dashboard.png": { contentHash: "same", width: 1200, height: 800 },
          "https://cdn.acme.example/dashboard-mobile.png": { contentHash: "same", width: 600, height: 400 },
          "https://cdn.acme.example/diagram.png": { contentHash: "diagram", width: 1200, height: 800 }
        }
      }),
      brief: brief({ provenance: "https://other.example/voice" })
    });
    expect(kit.source.evidenceRefs).toEqual([]);
    expect(kit.readiness).toBe("partial");
    expect(kit.visual.primary).toBe("unknown");
    expect(kit.voice).not.toHaveProperty("description");
    expect(kit.assetRoles.map(({ ref }) => ref)).toEqual([
      "https://cdn.acme.example/dashboard.png",
      "https://cdn.acme.example/diagram.png"
    ]);
    expect(kit.assetRoles[0]).toMatchObject({ purpose: "product", customerResultEvidence: "not-proven", metadata: { contentHash: "same" } });
    expect(kit.assetRoles.every(({ observedPurpose }) => observedPurpose !== "evidence")).toBe(true);
  });

  it("uses allowed roles, safe occupancy ceilings, and semantic-first mobile reading order", () => {
    const kit = compileBuildBrandKit({ brand: brand(), brief: brief() });
    const plan = planSectionDesign({ kit, assignment: { ...assignment, interaction: "anchor-navigation" } });
    expect(plan.visual.role).toBe("hero-image-or-type");
    expect(plan.visual.interaction).toBe("anchor-navigation");
    expect(plan.visual.occupancy).toEqual({ headline: [6, 13], body: [16, 44] });
    expect(plan.visual.mobileIntent).toBe("copy-first-stack-visual-second");
    expect(plan.visual.readingOrder).toBe("semantic-first");
    expect(plan.semantic.evidenceRefs).toEqual(["offer-1"]);
  });
});
