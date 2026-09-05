import { z } from "zod";

const id = z.string().trim().min(1).max(120);
const bounded = z.string().trim().min(1).max(2000);
const code = z.enum([
  "unsupported-claim",
  "repeated-argument",
  "unclear-product",
  "unsupported-account-assumption",
  "cta-mismatch"
]);
const severity = z.enum(["blocker", "revision"]);

const issueSchema = z.object({
  sectionIds: z.array(id).min(1).max(12),
  code,
  explanation: bounded,
  severity
});
const summarySchema = z.object({ sectionId: id, summary: bounded });
export const semanticReviewOutputSchema = z.object({
  version: z.string().trim().max(120).optional(),
  issues: z.array(issueSchema).max(40),
  summaries: z.array(summarySchema).max(100)
});

export type SemanticReviewSection = {
  id: string;
  role: string;
  headline: string;
  body: string;
  evidenceRefs: string[];
};
export type SemanticReviewEvidence = { id: string; text: string };
export type SemanticReviewInput = {
  sections: SemanticReviewSection[];
  evidence: SemanticReviewEvidence[];
  buyerBrief: { product: string; audience: string; buyerJob: string; cta: string };
  signal?: AbortSignal;
  version?: string;
};
export type SemanticReviewOutput = z.infer<typeof semanticReviewOutputSchema>;
export type SemanticReviewClient = {
  reviewPage(input: Omit<SemanticReviewInput, "signal"> & { signal: AbortSignal }): Promise<unknown>;
};
export type SemanticReviewReceipt =
  | { status: "reviewed"; issues: SemanticReviewOutput["issues"]; summaries: SemanticReviewOutput["summaries"]; sectionsNeedingRepair: string[] }
  | { status: "unavailable" | "timed-out" | "rejected"; reason: string; sectionsNeedingRepair: [] };

export const SEMANTIC_REVIEW_TIMEOUT_MS = 4_000;

export async function runWholePageSemanticReview(
  input: SemanticReviewInput,
  client: SemanticReviewClient | undefined,
  timeoutMs = SEMANTIC_REVIEW_TIMEOUT_MS
): Promise<SemanticReviewReceipt> {
  if (!client) return { status: "unavailable", reason: "semantic_review_client_missing", sectionsNeedingRepair: [] };
  if (input.signal?.aborted) return { status: "timed-out", reason: "semantic_review_cancelled", sectionsNeedingRepair: [] };
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > SEMANTIC_REVIEW_TIMEOUT_MS) {
    return { status: "rejected", reason: "semantic_review_timeout_invalid", sectionsNeedingRepair: [] };
  }
  const sectionIds = new Set(input.sections.map((section) => section.id));
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  if (sectionIds.size !== input.sections.length || input.sections.some((section) => section.evidenceRefs.some((ref) => !evidenceIds.has(ref)))) {
    return { status: "rejected", reason: "semantic_review_input_invalid", sectionsNeedingRepair: [] };
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  input.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await Promise.race([
      client.reviewPage({ ...input, signal: controller.signal }),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }))
    ]);
    const parsed = semanticReviewOutputSchema.safeParse(result);
    if (!parsed.success) return { status: "rejected", reason: "semantic_review_output_invalid", sectionsNeedingRepair: [] };
    if (input.version !== undefined && parsed.data.version !== input.version) {
      return { status: "rejected", reason: "semantic_review_stale_version", sectionsNeedingRepair: [] };
    }
    const summarizedIds = new Set(parsed.data.summaries.map((summary) => summary.sectionId));
    if (summarizedIds.size !== sectionIds.size || parsed.data.summaries.length !== sectionIds.size || parsed.data.issues.some((issue) => issue.sectionIds.some((id) => !sectionIds.has(id))) || parsed.data.summaries.some((summary) => !sectionIds.has(summary.sectionId))) {
      return { status: "rejected", reason: "semantic_review_dangling_section", sectionsNeedingRepair: [] };
    }
    const sectionsNeedingRepair = [...new Set(parsed.data.issues.flatMap((issue) => issue.sectionIds))].slice(0, 2);
    return { status: "reviewed", issues: parsed.data.issues, summaries: parsed.data.summaries, sectionsNeedingRepair };
  } catch {
    return { status: controller.signal.aborted ? "timed-out" : "rejected", reason: controller.signal.aborted ? "semantic_review_timeout" : "semantic_review_failed", sectionsNeedingRepair: [] };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", cancel);
  }
}
