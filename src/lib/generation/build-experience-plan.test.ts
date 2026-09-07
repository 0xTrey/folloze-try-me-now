import { describe, expect, it } from "vitest";
import type { BrandProfile, BrandReadiness } from "@/lib/types";
import type { BuyerDecisionBrief, BuyerSectionAssignment } from "./buyer-decision-journey";
import { buildExperiencePlanReceipt, claimAllowedForBuildSection, compareBuildPlanDependencies, compileBuildExperiencePlan } from "./build-experience-plan";
import { APPROVED_BUILD_LEARNING_VERSION, type ApprovedBuildLearningArtifact, type BuildLearningScope } from "./approved-build-learning";

const readiness: BrandReadiness = { status: "ready", identityReady: true, logoReady: true, paletteReady: true, designReady: true, sourceEvidenceReady: true, reasons: [] };
const brand = (overrides: Partial<BrandProfile> = {}): BrandProfile => ({ domain: "acme.example", canonicalDomain: "acme.example", companyName: "Acme", publicTopics: [], imageUrls: [], imageMetadata: {}, colors: ["#111111", "#FFFFFF"], primaryColor: "#111111", accentColor: "#333333", surfaceColor: "#FFFFFF", displayFontFamily: "Acme Sans", bodyFontFamily: "Acme Sans", sourceUrl: "https://acme.example/brand?private=secret", source: "brand-harvester", readiness, ...overrides });
const claim = (id: string, text: string) => ({ id, claim: text, sourceRef: `https://acme.example/${id}?secret=1`, sourceAuthority: "official", confidence: "high" as const });
const brief = (overrides: Partial<BuyerDecisionBrief> = {}): BuyerDecisionBrief => ({ schemaVersion: "buyer-decision-journey-v1", product: { status: "exact", label: "Acme Flow" }, audience: "Operators", buyerJob: "Evaluate", trafficIntent: { value: "search", status: "known" }, buyingStage: { value: "evaluation", source: "visitor" }, primaryBuyerQuestion: "Can this fit?", questions: [], cta: { action: "book-meeting", destination: "https://acme.example/demo", expectation: "Schedule a demo", expectations: "known" }, knowledge: { productOffer: [claim("offer-1", "Acme Flow records review ownership.")], workflowContext: [], supportedCapabilityWorkflowClaims: [claim("capability-1", "Acme Flow routes exceptions to a named reviewer.")], proofClaims: [claim("proof-1", "A customer documented review ownership.")], resources: [], objections: { pricing: [], security: [], implementation: [] }, targetAccountContext: [], voice: { description: "Clear", provenance: "https://acme.example/voice", status: "sourced" } }, digest: "brief", fetchedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-02T00:00:00Z", ...overrides });
const section = (id: string, role: BuyerSectionAssignment["role"], refs: string[]): BuyerSectionAssignment => ({ id, role, navigationLabel: id, buyerJob: "Evaluate", claimType: "fact", requiredEvidenceKinds: ["seller_fact"], optional: false, wordBudget: { headline: [5, 12], body: [25, 60] }, visualRole: role === "next-move" ? "cta-panel" : "workflow", buyerQuestion: "What matters?", desiredConclusion: "This fits.", claimRefs: refs, transition: "Next." });
const assignments = () => [section("capability", "mechanism", ["capability-1"]), section("proof", "proof", ["proof-1"]), section("action", "next-move", ["offer-1"])];
const decision = { family: "launch" } as Parameters<typeof compileBuildExperiencePlan>[0]["decision"];
const composition = { compositionId: "workflow-spine", archetypeId: "campaign-product" } as unknown as Parameters<typeof compileBuildExperiencePlan>[0]["composition"];
const trustedEntry = { brandScope: "acme", offerScope: "flow", evidenceDigest: "sha256:abc", evidenceVersion: "e1", sourceBuild: "build-1", sourceVersion: "v1", artifactVersion: APPROVED_BUILD_LEARNING_VERSION };
const approvedLearning = (): { artifact: ApprovedBuildLearningArtifact; scope: BuildLearningScope } => ({ artifact: { version: APPROVED_BUILD_LEARNING_VERSION, trustedCallerLedgerVersion: "ledger-1", rules: [{ id: "approved-1", approval: { reviewer: "reviewer", approvedAt: "2026-01-01T00:00:00Z" }, sourceBuild: "build-1", sourceVersion: "v1", brandScope: "acme", offerScope: "flow", evidenceDigest: "sha256:abc", evidenceVersion: "e1", evidenceRefs: ["capability-1"], beforeText: "Acme Flow routes exceptions.", afterText: "Acme Flow routes exceptions to a named reviewer.", reason: "clarity" }] }, scope: { brandScope: "acme", offerScope: "flow", evidenceDigest: "sha256:abc", evidenceVersion: "e1", trustedCallerLedgerVersion: "ledger-1", trustedEntries: [trustedEntry] } });
const plan = (options: { sessionId?: string; revision?: number; brief?: BuyerDecisionBrief; brand?: BrandProfile; learning?: boolean } = {}) => compileBuildExperiencePlan({ sessionId: options.sessionId ?? "session-1", revision: options.revision ?? 1, brand: options.brand ?? brand(), brief: options.brief ?? brief(), assignments: assignments(), decision, composition, ...(options.learning === false ? {} : { approvedLearning: approvedLearning() }) });

describe("build experience plan", () => {
  it("enforces the role claim matrix", () => {
    expect(claimAllowedForBuildSection("proof", "proof")).toBe(true);
    expect(claimAllowedForBuildSection("account-context", "proof")).toBe(false);
    expect(claimAllowedForBuildSection("resource", "resource")).toBe(true);
    expect(claimAllowedForBuildSection("offer", "resource")).toBe(false);
    expect(claimAllowedForBuildSection("capability", "mechanism")).toBe(true);
  });
  it("keeps exact-scope approved feedback private and writer-section scoped", () => {
    const value = plan();
    expect(value.approvedLearning).toEqual({ enabled: true, hintCount: 1 });
    expect(value.sections.find((item) => item.id === "capability")?.approvedLearningHints).toHaveLength(1);
    expect(value.sections.find((item) => item.id === "proof")?.approvedLearningHints).toEqual([]);
    const receipt = JSON.stringify(buildExperiencePlanReceipt(value));
    expect(receipt).not.toContain("https://"); expect(receipt).not.toContain("named reviewer");
    const mismatched = compileBuildExperiencePlan({ sessionId: "session-1", revision: 1, brand: brand(), brief: brief(), assignments: assignments(), decision, composition, approvedLearning: { ...approvedLearning(), scope: { ...approvedLearning().scope, evidenceDigest: "other" } } });
    expect(mismatched.approvedLearning).toEqual({ enabled: false, hintCount: 0 });
  });
  it("keeps unchanged revision dependencies stable, isolates sessions, and limits CTA changes", () => {
    const first = plan({ revision: 1 }), same = plan({ revision: 2 });
    expect(same.digest).toBe(first.digest);
    expect(compareBuildPlanDependencies(first, same).changedSectionIds).toEqual([]);
    expect(compareBuildPlanDependencies(first, plan({ sessionId: "other" })).reason).toBe("session_isolation");
    const changedCta = plan({ brief: brief({ cta: { action: "book-meeting", destination: "https://acme.example/other", expectation: "Schedule a demo", expectations: "known" } }) });
    expect(compareBuildPlanDependencies(first, changedCta).changedSectionIds).toEqual(["action"]);
  });
  it("invalidates only dependent claims and reports partial readiness without a new input request", () => {
    const first = plan();
    const changedBrief = brief(); changedBrief.knowledge.supportedCapabilityWorkflowClaims[0] = claim("capability-1", "Acme Flow routes exceptions through a reviewed queue.");
    expect(compareBuildPlanDependencies(first, plan({ brief: changedBrief })).changedSectionIds).toEqual(["capability"]);
    const partial = plan({ brand: brand({ readiness: { ...readiness, status: "incomplete", designReady: false, reasons: ["design pending"] } }) });
    expect(partial.readiness).toMatchObject({ state: "limited", requiresNewInput: false });
  });
});
