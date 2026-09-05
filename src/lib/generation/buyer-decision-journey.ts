import type { BrandProfile, CtaType, TryMeSession } from "@/lib/types";
import type { CompilerEvidenceItem } from "./messaging-compiler-contracts";
import { compilerDigest } from "./compiler-digest";
import type { SectionRoleV2, SectionSlotV2 } from "./three-family-contract";
import { deriveWireframeEvidenceSignals } from "./wireframe-evidence-signals";
import { isBroadProductCategory, PRODUCT_CLARIFICATION } from "@/lib/product-identity";

export type ProductIdentity = { status: "exact" | "unresolved" | "broad-category"; label?: string; category?: string };
type BuyerStage = "awareness" | "consideration" | "evaluation" | "decision" | "unknown";
type QuestionKey = "understand" | "context" | "mechanism" | "proof" | "risk" | "action";
export type BuyerJourneyInput = {
  session: TryMeSession; seller: BrandProfile;
  resolvedOffer?: string | { label?: string; name?: string; category?: string; product?: string };
  audience?: string; objective?: string; buyerJob?: string; trafficIntent?: string;
  cta?: { type?: CtaType | string; label?: string; destination?: string; expectation?: string };
  now?: Date | string; ttlMs?: number;
};
export type BuyerClaim = { id: string; claim: string; sourceRef: string; sourceAuthority: string; confidence: CompilerEvidenceItem["confidence"] };
export type BuyerDecisionBrief = {
  schemaVersion: "buyer-decision-journey-v1"; product: ProductIdentity; clarification?: string;
  audience: string; buyerJob: string; trafficIntent: { value?: string; status: "known" | "unknown" };
  buyingStage: { value: BuyerStage; source: string };
  primaryBuyerQuestion: string; questions: { key: QuestionKey; question: string }[];
  cta: { action?: string; benefit?: string; destination?: string; expectation?: string; expectations: "known" | "unknown" };
  knowledge: {
    productOffer: BuyerClaim[]; workflowContext: BuyerClaim[]; supportedCapabilityWorkflowClaims: BuyerClaim[]; proofClaims: BuyerClaim[]; resources: BuyerClaim[];
    objections: Record<"pricing" | "security" | "implementation", BuyerClaim[]>;
    targetAccountContext: BuyerClaim[];
    voice: { description?: string; provenance: string; status: "sourced" | "unknown" };
  };
  digest: string; fetchedAt: string; expiresAt: string;
};
export type BuyerSectionAssignment = SectionSlotV2 & {
  buyerQuestion: string; desiredConclusion: string; claimRefs: string[]; objection?: string; transition: string;
};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const claim = (item: CompilerEvidenceItem): BuyerClaim => ({ id: item.id, claim: item.claim, sourceRef: item.sourceRef, sourceAuthority: item.sourceAuthority, confidence: item.confidence });
function safe(item: CompilerEvidenceItem) {
  try {
    const url = new URL(item.sourceRef);
    return item.kind === "fact" && item.confidence !== "low" && url.protocol === "https:" &&
      !url.username && !url.password && !url.port && item.allowedUses.includes("credibility") &&
      !item.prohibitedUses.includes("declarative-claim");
  } catch { return false; }
}
function identity(input: BuyerJourneyInput): ProductIdentity {
  const offer = input.resolvedOffer;
  const label = typeof offer === "string" ? text(offer) : text(offer?.label) ?? text(offer?.name) ?? text(offer?.product);
  const category = typeof offer === "object" ? text(offer?.category) : undefined;
  const value = label ?? text(input.session.answers.promotedOffer);
  if (!value) return { status: "unresolved" };
  if (isBroadProductCategory(value)) return { status: "broad-category", label: value, category: category ?? value };
  // A company identity alone does not identify one product in its portfolio.
  if (value.toLowerCase() === input.seller.companyName.toLowerCase() && !input.session.answers.promotedOfferConfirmed) {
    return { status: "unresolved", label: value };
  }
  return { status: "exact", label: value, ...(category ? { category } : {}) };
}
function stage(input: BuyerJourneyInput, cta?: string): BuyerDecisionBrief["buyingStage"] {
  if (input.session.answers.buyerStage) return { value: input.session.answers.buyerStage, source: "visitor" };
  const traffic = input.trafficIntent ?? input.session.answers.trafficIntent;
  if (traffic === "post-demo" || traffic === "existing-opportunity") return { value: "evaluation", source: "visitor traffic context" };
  if (traffic === "cold-outreach") return { value: "awareness", source: "visitor traffic context" };
  if (cta === "register") return { value: "awareness", source: "inferred from CTA, not verified buyer readiness" };
  if (cta === "explore" || cta === "download") return { value: "consideration", source: "inferred from CTA, not verified buyer readiness" };
  if (cta === "book-meeting" || cta === "contact-sales") return { value: "evaluation", source: "inferred from CTA, not verified buyer readiness" };
  return { value: "unknown", source: "not sourced" };
}

export function deriveBuyerDecisionBrief(input: BuyerJourneyInput, ledger: readonly CompilerEvidenceItem[] = []): BuyerDecisionBrief {
  const product = identity(input);
  const audience = text(input.audience) ?? text(input.session.answers.audience) ?? text(input.session.answers.customAudience) ?? "unknown";
  const buyerJob = text(input.buyerJob) ?? "unknown";
  const ctaType = input.cta?.type ?? input.session.answers.ctaType;
  const eligible = ledger.filter((item) => safe(item) && (item.entityRole === "seller" || item.entityRole === "source"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const proofIds = new Set(deriveWireframeEvidenceSignals(ledger).approvedProofRefs);
  const ofType = (...types: string[]) => eligible.filter((item) => types.includes(item.evidenceType ?? "")).map(claim);
  const voiceSourced = input.seller.source !== "fallback" && /^https:\/\//.test(input.seller.sourceUrl);
  const knowledge: BuyerDecisionBrief["knowledge"] = {
    productOffer: ofType("positioning"), workflowContext: ofType("workflow-context"), supportedCapabilityWorkflowClaims: ofType("capability", "workflow"),
    proofClaims: eligible.filter((item) => proofIds.has(item.id)).map(claim), resources: ofType("resource"),
    objections: { pricing: ofType("pricing"), security: ofType("security"), implementation: ofType("implementation") },
    targetAccountContext: ledger.filter((item) => safe(item) && item.entityRole === "target")
      .sort((a, b) => a.id.localeCompare(b.id)).map(claim),
    voice: { ...(voiceSourced ? { description: text(input.seller.publicContext) ?? text(input.seller.description) } : {}),
      provenance: input.seller.sourceUrl, status: voiceSourced ? "sourced" : "unknown" }
  };
  const traffic = text(input.trafficIntent) ?? input.session.answers.trafficIntent;
  const buyingStage = stage(input, ctaType);
  const primaryBuyerQuestion = product.status !== "exact" ? PRODUCT_CLARIFICATION
    : buyerJob !== "unknown" ? `How does ${product.label} support this job: ${buyerJob}?`
    : `What does ${product.label} do, and where would it be useful?`;
  const late = buyingStage.source.startsWith("visitor") && ["evaluation", "decision"].includes(buyingStage.value);
  const order: QuestionKey[] = late
    ? ["understand", "mechanism", "proof", "context", "risk", "action"]
    : ["understand", "context", "mechanism", "proof", "risk", "action"];
  const questionsByKey: Record<QuestionKey, string> = {
    understand: primaryBuyerQuestion, context: "Which situation or priority makes this relevant?",
    mechanism: "What goes in, what does the product do, and what comes out?",
    proof: knowledge.proofClaims.length ? "What comparable result has been demonstrated, and under what conditions?" : "What should a product walkthrough demonstrate?",
    risk: "What are the known implementation, security, or cost requirements?", action: "What happens after clicking?"
  };
  const now = input.now ? new Date(input.now) : new Date();
  const validNow = Number.isNaN(now.getTime()) ? new Date(0) : now;
  const requestedTtl = input.ttlMs ?? 86400000;
  const ttl = Number.isFinite(requestedTtl) ? Math.max(0, Math.min(requestedTtl, 7 * 86400000)) : 0;
  const cta: BuyerDecisionBrief["cta"] = {
    action: ctaType, benefit: input.cta?.label, destination: input.cta?.destination,
    expectation: input.cta?.expectation,
    expectations: input.cta?.destination && input.cta.expectation ? "known" : "unknown"
  };
  const stable = { product, seller: { companyName: input.seller.companyName, domain: input.seller.domain },
    audience, buyerJob, traffic, buyingStage, cta, knowledge, questions: order.map((key) => ({ key, question: questionsByKey[key] })) };
  return { schemaVersion: "buyer-decision-journey-v1", product,
    ...(product.status !== "exact" ? { clarification: PRODUCT_CLARIFICATION } : {}), audience, buyerJob,
    trafficIntent: traffic ? { value: traffic, status: "known" } : { status: "unknown" },
    buyingStage, primaryBuyerQuestion, questions: stable.questions, cta, knowledge,
    digest: compilerDigest("buyer-decision-journey-v2", stable), fetchedAt: validNow.toISOString(),
    expiresAt: new Date(validNow.getTime() + ttl).toISOString() };
}

const roleQuestion: Partial<Record<SectionRoleV2, QuestionKey>> = {
  "buyer-outcome": "understand", "market-change": "understand", "shared-priority": "understand",
  "current-friction": "context", stakes: "context", "account-relevance": "context", "use-cases": "context",
  "priority-paths": "context", applications: "context", mechanism: "mechanism", "solution-mapping": "mechanism",
  "shared-opportunity": "mechanism", proof: "proof", "proof-depth": "proof", "validation-plan": "proof",
  "evaluation-criteria": "risk", "next-move": "action", "evaluation-close": "action", "first-decision": "action"
};

export function assignBuyerJourneySections(plan: readonly SectionSlotV2[], brief: BuyerDecisionBrief): BuyerSectionAssignment[] {
  const objections = Object.values(brief.knowledge.objections).flat();
  let earnedPlan = plan.filter((slot) => !(slot.optional && slot.role === "proof-depth" && !brief.knowledge.proofClaims.length) &&
    !(slot.role === "current-friction" && !brief.knowledge.workflowContext.length && !brief.knowledge.targetAccountContext.length) &&
    !(slot.optional && slot.role === "resource" && !brief.knowledge.resources.length))
    .map((slot): SectionSlotV2 => slot.role === "proof" && !brief.knowledge.proofClaims.length
      ? { ...slot, role: "validation-plan", claimType: "instruction", requiredEvidenceKinds: [], navigationLabel: "Validate fit", buyerJob: "Choose what to verify before taking the next step" } : slot);
  if (objections.length && !earnedPlan.some((slot) => slot.role === "evaluation-criteria") && earnedPlan.length < 8) {
    earnedPlan.splice(Math.max(1, earnedPlan.length - 1), 0, {
      id: "buyer-purchase-questions", role: "evaluation-criteria", navigationLabel: "Purchase questions",
      buyerJob: "Understand known requirements before choosing the next step", claimType: "fact",
      requiredEvidenceKinds: ["seller_fact"], optional: true, visualRole: "criteria",
      wordBudget: { headline: [0, 10], body: [0, 70] }
    });
  }
  if (brief.buyingStage.source.startsWith("visitor") && ["evaluation", "decision"].includes(brief.buyingStage.value)) {
    const priority = (slot: SectionSlotV2) => brief.questions.findIndex(({ key }) => key === roleQuestion[slot.role]);
    earnedPlan = earnedPlan.map((slot, index) => ({ slot, index })).sort((a, b) => {
      const score = (value: typeof a) => value.index === 0 ? -1 : roleQuestion[value.slot.role] === "action" ? 99 :
        value.slot.role === "resource" ? 80 : priority(value.slot);
      return score(a) - score(b) || a.index - b.index;
    }).map(({ slot }) => slot);
  }
  return earnedPlan.map((slot, index, all) => {
    const key = roleQuestion[slot.role];
    const pool = key === "proof" ? brief.knowledge.proofClaims : key === "risk" ? objections
      : slot.role === "current-friction" ? brief.knowledge.workflowContext
      : slot.role === "account-relevance" ? brief.knowledge.targetAccountContext
      : slot.role === "resource" ? brief.knowledge.resources : brief.knowledge.supportedCapabilityWorkflowClaims;
    return { ...slot, buyerQuestion: brief.questions.find((item) => item.key === key)?.question ?? slot.buyerJob,
      desiredConclusion: slot.buyerJob, claimRefs: pool.map((item) => item.id),
      ...(key === "risk" ? { objection: objections.length ? objections.map((item) => item.claim).join(" ") : "Requirements are unknown; ask what must be established." } : {}),
      transition: index < all.length - 1 ? `Next: ${all[index + 1].navigationLabel}` : brief.cta.expectation ?? "Next: take the bounded next step" };
  });
}
