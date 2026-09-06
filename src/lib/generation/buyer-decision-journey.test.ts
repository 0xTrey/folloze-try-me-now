import { describe, expect, it } from "vitest";
import type { BrandProfile, TryMeSession } from "@/lib/types";
import { assignBuyerJourneySections, deriveBuyerDecisionBrief } from "./buyer-decision-journey";
import { defaultSectionPlanV2 } from "./three-family-contract";
import type { CompilerEvidenceItem } from "./messaging-compiler-contracts";

const seller = { companyName: "Acme", domain: "acme.test", publicTopics: [], imageUrls: [], colors: [], primaryColor: "#000", accentColor: "#111", surfaceColor: "#fff", sourceUrl: "https://acme.test", source: "brand-harvester", publicContext: "Source-backed context" } as BrandProfile;
const session = (revision = 2, id = "s-1") => ({ id, revision, answers: { promotedOffer: "Google", ctaType: "review_evidence" } }) as unknown as TryMeSession;
const evidence = (id: string, evidenceType: CompilerEvidenceItem["evidenceType"], overrides: Partial<CompilerEvidenceItem> = {}): CompilerEvidenceItem => ({ id, kind: "fact", claim: id, sourceAuthority: "Acme source", sourceRef: `https://acme.test/${id}`, confidence: "high", allowedUses: ["credibility"], prohibitedUses: [], evidenceType, entityRole: "seller", ...overrides });

describe("buyer decision journey contract", () => {
  it("prefers selected-offer facts over unrelated homepage articles", () => {
    const offer = "Audit & Assurance Solutions";
    const brief = deriveBuyerDecisionBrief({ session: session(), seller, resolvedOffer: offer }, [
      evidence("homepage-article", "positioning", { claim: "A guide to cloud certification" }),
      evidence("other-product", "capability", { subject: "Cloud Services", claim: "Cloud migration support" }),
      evidence("audit-service", "capability", { subject: offer, claim: "The audit team reviews financial records and internal controls." })
    ]);
    expect(brief.knowledge.productOffer).toEqual([]);
    expect(brief.knowledge.supportedCapabilityWorkflowClaims.map(({ id }) => id)).toEqual(["audit-service"]);
  });
  it("asks for validation when no supported mechanism is available", () => {
    const plan = assignBuyerJourneySections(defaultSectionPlanV2("guide"), deriveBuyerDecisionBrief({ session: session(), seller }));
    expect(plan.find(({ id }) => id === "guide-4")).toMatchObject({ role: "solution-mapping", claimType: "instruction", claimRefs: [] });
  });
  it("keeps a generic category distinct from an exact product", () => {
    expect(deriveBuyerDecisionBrief({ session: session(), resolvedOffer: "Computers & Electronics", seller }, []).clarification).toBeTruthy();
    expect(deriveBuyerDecisionBrief({ session: session(), seller }, []).product.status).toBe("exact");
  });
  it("does not treat Google as GCP or invent FAQ answers", () => {
    const brief = deriveBuyerDecisionBrief({ session: session(), seller }, [evidence("faq", "resource", { claim: "FAQ resource" })]);
    expect(brief.product.label).toBe("Google");
    expect(brief.knowledge.proofClaims).toEqual([]);
    expect(brief.cta.expectations).toBe("unknown");
  });
  it("ignores invalid proof types and produces a stable reusable digest", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const first = deriveBuyerDecisionBrief({ session: session(), seller, now }, [evidence("proof", "quantified-outcome", { claim: "Customers improved conversion by 24%" })]);
    const invalid = evidence("invalid", "quantified-outcome", { claim: "Customers improved conversion by 24%", prohibitedUses: ["declarative-claim"], sourceRef: "https://user:pass@example.com/proof" });
    const repeat = deriveBuyerDecisionBrief({ session: session(99, "other"), seller, now: new Date("2027-01-01") }, [evidence("proof", "quantified-outcome", { claim: "Customers improved conversion by 24%" })]);
    expect(first.digest).toBe(repeat.digest);
    expect(first.fetchedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(deriveBuyerDecisionBrief({ session: session(), seller, now }, [invalid]).knowledge.proofClaims).toEqual([]);
    expect(deriveBuyerDecisionBrief({ session: session(), seller, objective: "campaign objective", trafficIntent: undefined }, []).trafficIntent.status).toBe("unknown");
    expect(deriveBuyerDecisionBrief({ session: session(), seller, objective: "campaign objective", trafficIntent: "research" , buyerJob: "validate workflow" }, []).buyerJob).toBe("validate workflow");
    expect(deriveBuyerDecisionBrief({ session: session(), seller, cta: { type: "book-meeting" } }, []).buyingStage.value).toBe("evaluation");
    expect(deriveBuyerDecisionBrief({ session: session(), seller: { ...seller, publicContext: "Changed voice" } }, []).digest).not.toBe(first.digest);
  });
  it("preserves mandatory roles and gives transitions", () => {
    const brief = deriveBuyerDecisionBrief({ session: session(), seller }, []);
    const sections = assignBuyerJourneySections(defaultSectionPlanV2("launch", { includeProofDepth: true, includeResource: true }), brief);
    expect(sections.map((s) => s.role)).not.toContain("proof-depth");
    expect(sections.map((s) => s.role)).toContain("next-move");
    expect(sections.map((s) => s.buyerQuestion).filter((q, i, a) => a.indexOf(q) === i).length).toBeGreaterThan(2);
    expect(sections[0].transition).toContain("Next:");
    const resourceBrief = deriveBuyerDecisionBrief({ session: session(), seller }, [evidence("resource", "resource")]);
    const withResource = assignBuyerJourneySections(defaultSectionPlanV2("guide", { includeResource: true }), resourceBrief);
    expect(withResource.map((s) => s.role)).toContain("resource");
  });
  it("distinguishes a company identity from a confirmed offer", () => {
    const companyOnly = deriveBuyerDecisionBrief({ session: session(), seller, resolvedOffer: "Acme" });
    expect(companyOnly.product.status).toBe("unresolved");
    expect(companyOnly.clarification).toContain("specific product");
  });
  it("plans different cold-outreach and post-demo question sequences before choosing a layout", () => {
    const cold = session(); cold.answers.trafficIntent = "cold-outreach";
    const warm = session(); warm.answers.trafficIntent = "post-demo";
    const context = [evidence("workflow-context", "workflow-context", { claim: "Manual reviews require a second approval handoff." })];
    const coldBrief = deriveBuyerDecisionBrief({ session: cold, seller }, context);
    const warmBrief = deriveBuyerDecisionBrief({ session: warm, seller }, context);
    expect(coldBrief.questions.map((question) => question.key)).not.toEqual(warmBrief.questions.map((question) => question.key));
    const plan = defaultSectionPlanV2("launch");
    expect(assignBuyerJourneySections(plan, coldBrief)[1].role).toBe("current-friction");
    expect(assignBuyerJourneySections(plan, warmBrief)[1].role).toBe("mechanism");
    expect(assignBuyerJourneySections(plan, warmBrief).at(-1)?.role).toBe("next-move");
    expect(coldBrief.digest).not.toBe(warmBrief.digest);
  });
  it("adds sourced purchase questions before the CTA and never fabricates missing answers", () => {
    const known = evidence("pricing", "pricing", { claim: "The Team plan is priced per active user." });
    const brief = deriveBuyerDecisionBrief({ session: session(), seller }, [known]);
    const sections = assignBuyerJourneySections(defaultSectionPlanV2("launch"), brief);
    expect(sections.at(-2)).toMatchObject({ role: "evaluation-criteria", claimRefs: ["pricing"], objection: known.claim });
    const empty = assignBuyerJourneySections(defaultSectionPlanV2("launch"), deriveBuyerDecisionBrief({ session: session(), seller }));
    expect(empty.some((section) => section.role === "evaluation-criteria")).toBe(false);
  });
  it("keeps CTA delivery expectations and unsafe account context out of inference", () => {
    const brief = deriveBuyerDecisionBrief({ session: session(), seller,
      cta: { type: "explore", label: "Explore the page", destination: "#supporting-resources", expectation: "Moves to the page resources." } },
      [evidence("target", "account-context", { entityRole: "target", sourceRef: "javascript:alert(1)" })]);
    expect(brief.cta.expectations).toBe("known");
    expect(brief.knowledge.targetAccountContext).toEqual([]);
    expect(deriveBuyerDecisionBrief({ session: session(), seller, ttlMs: Number.NaN, now: "2026-09-05" }).expiresAt).toBe("2026-09-05T00:00:00.000Z");
  });
});
