import { describe, expect, it } from "vitest";
import { runWholePageSemanticReview, type SemanticReviewInput } from "@/lib/generation/whole-page-semantic-review";

const input: SemanticReviewInput = {
  sections: [
    { id: "hero", role: "hero", headline: "Make buying clearer", body: "A useful claim.", evidenceRefs: ["proof"] },
    { id: "close", role: "cta", headline: "See it in action", body: "Start here.", evidenceRefs: [] }
  ],
  evidence: [{ id: "proof", text: "A useful claim." }],
  buyerBrief: { product: "A buyer experience", audience: "Revenue teams", buyerJob: "Help buyers decide", cta: "Request access" },
  version: "v1"
};

describe("runWholePageSemanticReview", () => {
  it("returns meaning-based findings from a client, including paraphrased repetition", async () => {
    const result = await runWholePageSemanticReview(input, {
      reviewPage: async () => ({ version: "v1", issues: [{ sectionIds: ["hero", "close"], code: "repeated-argument", explanation: "Both sections make the same decision-readiness argument in different words.", severity: "revision" }], summaries: [{ sectionId: "hero", summary: "Frames the buyer problem." }, { sectionId: "close", summary: "Offers the next action." }] })
    });
    expect(result.status).toBe("reviewed");
    if (result.status === "reviewed") expect(result.sectionsNeedingRepair).toEqual(["hero", "close"]);
  });

  it("is explicit when no client is available", async () => {
    expect((await runWholePageSemanticReview(input, undefined)).status).toBe("unavailable");
  });

  it("times out a client that ignores abort", async () => {
    const result = await runWholePageSemanticReview(input, { reviewPage: () => new Promise(() => {}) }, 10);
    expect(result).toMatchObject({ status: "timed-out", reason: "semantic_review_timeout" });
  });

  it("rejects malformed and dangling output without accepting it", async () => {
    const malformed = await runWholePageSemanticReview(input, { reviewPage: async () => ({ issues: [{ sectionIds: ["missing"], code: "made-up", explanation: "x", severity: "blocker" }], summaries: [] }) });
    expect(malformed).toMatchObject({ status: "rejected", reason: "semantic_review_output_invalid" });
    const dangling = await runWholePageSemanticReview(input, { reviewPage: async () => ({ version: "v1", issues: [{ sectionIds: ["missing"], code: "unclear-product", explanation: "Needs clarity.", severity: "blocker" }], summaries: [] }) });
    expect(dangling).toMatchObject({ status: "rejected", reason: "semantic_review_dangling_section" });
  });
});
