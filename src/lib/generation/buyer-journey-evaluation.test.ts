import { describe, expect, it } from "vitest";
import { assignStickyVariant, createBlindedReviewExport, summarizeExperimentOutcomes } from "./buyer-journey-evaluation";
import type { ReviewItem } from "./buyer-journey-evaluation";
describe("buyer journey evaluation", () => {
  it("assigns anonymously and sticks", () => { const a = assignStickyVariant("x", "anon", "v1", [{ id: "a" }, { id: "b" }]); expect(a).toEqual(assignStickyVariant("x", "anon", "v1", [{ id: "a" }, { id: "b" }])); expect(a).not.toHaveProperty("anonymousId"); });
  it("deduplicates, excludes no-exposure conversions, and withholds uncertain winners", () => { const r = summarizeExperimentOutcomes([{ exposureId: "1", variantId: "a", eligible: true, converted: true }, { exposureId: "1", variantId: "a", eligible: true, converted: true }, { exposureId: "2", variantId: "b", eligible: true, converted: true }], 2); expect(r.variants).toHaveLength(2); expect(r.winnerDeclared).toBe(false); });
  it("blinds model and variant labels while preserving source snippets", () => { const r = createBlindedReviewExport({ items: [{ headline: "h", provider: "y", variantId: "a", sourceSnippets: "fact" } as unknown as ReviewItem], reviewerMappings: { a: "private" } }); expect(r.publicExport.items[0]).not.toHaveProperty("provider"); expect(r.publicExport.items[0]).toHaveProperty("sourceSnippets", "fact"); expect(r.privateReviewerMappings).toBeDefined(); });
  it("rejects duplicate variants and empty assignment keys", () => { expect(() => assignStickyVariant("", "a", "v", [{ id: "a" }, { id: "b" }])).toThrow(); expect(() => assignStickyVariant("x", "a", "v", [{ id: "a" }, { id: "a" }])).toThrow(); });
  it("is invariant to variant ordering and delimiter-like keys", () => { const a = assignStickyVariant("x|y", "z", "v", [{ id: "a" }, { id: "b" }]); const b = assignStickyVariant("x|y", "z", "v", [{ id: "b" }, { id: "a" }]); expect(a.variantId).toBe(b.variantId); });
  it("requires every expected arm to be powered", () => { const r = summarizeExperimentOutcomes([{ exposureId: "1", variantId: "a", eligible: true, converted: true }], 1, ["a", "b"]); expect(r.winnerDeclared).toBe(false); });
  it("excludes unknown eligibility and rejects conflicting duplicates", () => { expect(summarizeExperimentOutcomes([{ exposureId: "1", variantId: "a", converted: true }], 1).variants).toHaveLength(0); expect(() => summarizeExperimentOutcomes([{ exposureId: "1", variantId: "a", eligible: true }, { exposureId: "1", variantId: "b", eligible: true }], 1)).toThrow(); });
  it("redacts nested malformed review metadata", () => { const r = createBlindedReviewExport({ items: [{ headline: "h", body: "b", sections: ["secret"], provider: { token: "x" } } as unknown as ReviewItem] }); expect(r.publicExport.items[0].sections).toBeUndefined(); });
  it("does not ignore an unexpected underpowered arm", () => {
    const rows = ["a", "b"].flatMap((variantId) => Array.from({ length: 100 }, (_, index) => ({ exposureId: `${variantId}-${index}`, variantId, eligible: true, converted: variantId === "a" })));
    expect(summarizeExperimentOutcomes([...rows, { exposureId: "c-1", variantId: "c", eligible: true, converted: true }], 30, ["a", "b"]).winnerDeclared).toBe(false);
    expect(summarizeExperimentOutcomes(rows, 30, ["a", "b"]).winner).toBe("a");
  });
});
