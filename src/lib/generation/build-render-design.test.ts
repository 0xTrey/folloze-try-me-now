import { describe, expect, it } from "vitest";
import { buildRenderDesign } from "./build-render-design";
import type { BuildExperiencePlan } from "./build-experience-plan";
import type { SectionCopyCandidate } from "./section-copy-types";

const plan = (treatment: "type-led" | "product-led" = "product-led"): BuildExperiencePlan => ({
  version: "build-experience-plan-v1",
  sessionId: "private-session",
  revision: 3,
  digest: "plan-digest",
  evidenceDigest: "evidence-digest",
  brandKit: {
    version: "build-brand-kit-v1", digest: "brand-digest", source: { authority: "brand-harvester", evidenceRefs: ["https://acme.example/private-source"] },
    readiness: "verified", visual: { primary: "#123456", accent: "#456789", surface: "#FFFFFF", displayFont: "Acme Sans", bodyFont: "Acme Sans", density: "open", hero: "dark" },
    voice: { description: "Private voice prose", provenance: "https://acme.example/private-source", status: "sourced" },
    artDirection: { principle: "observed-brand-system", treatment }, assetRoles: [],
    invariants: []
  },
  buyer: { schemaVersion: "buyer-decision-journey-v1", product: { status: "exact", label: "Private product" }, audience: "Private audience", buyerJob: "Private job", trafficIntent: { status: "unknown" }, buyingStage: { value: "evaluation", source: "private" }, primaryBuyerQuestion: "Private question?", questions: [], cta: { expectations: "unknown" }, knowledge: { productOffer: [], workflowContext: [], supportedCapabilityWorkflowClaims: [], proofClaims: [], resources: [], objections: { pricing: [], security: [], implementation: [] }, targetAccountContext: [], voice: { provenance: "private", status: "unknown" } }, digest: "private-brief", fetchedAt: "now", expiresAt: "later" },
  claims: [],
  strategy: { concepts: [], authority: "evidence-bounded-family" },
  composition: { family: "launch", id: "evidence-lead", archetypeId: "product-launch" },
  sections: [
    { id: "hero", role: "buyer-outcome", navigationLabel: "Outcome", buyerJob: "Understand", claimType: "fact", requiredEvidenceKinds: ["offer"], optional: false, wordBudget: { headline: [5, 12], body: [16, 40] }, visualRole: "hero-image-or-type", buyerQuestion: "Private?", desiredConclusion: "Private.", claimRefs: [], transition: "Private.", design: { sectionId: "hero", semantic: { role: "buyer-outcome", question: "Private?", conclusion: "Private.", evidenceRefs: ["private-ref"], transition: "Private." }, visual: { role: "hero-image-or-type", occupancy: { headline: [5, 12], body: [16, 40] }, mobileIntent: "copy-first-stack-visual-second", readingOrder: "semantic-first" } }, dependencyDigest: "private-dependency", evidenceMode: "buyer-question", claimScopes: [], approvedLearningHints: [] },
    { id: "proof", role: "proof", navigationLabel: "Proof", buyerJob: "Validate", claimType: "fact", requiredEvidenceKinds: ["proof"], optional: true, wordBudget: { headline: [4, 10], body: [12, 48] }, visualRole: "proof-artifact", buyerQuestion: "Private proof?", desiredConclusion: "Private.", claimRefs: [], transition: "Private.", design: { sectionId: "proof", semantic: { role: "proof", question: "Private proof?", conclusion: "Private.", evidenceRefs: ["private-ref"], transition: "Private." }, visual: { role: "proof-artifact", occupancy: { headline: [4, 10], body: [12, 48] }, mobileIntent: "evidence-first", readingOrder: "semantic-first" } }, dependencyDigest: "private-proof-dependency", evidenceMode: "omit-if-unearned", claimScopes: [], approvedLearningHints: [] }
  ],
  approvedLearning: { enabled: false, hintCount: 0 },
  readiness: { state: "ready", reasonCodes: [], offerFactCount: 1, proofCount: 0, missing: [], requiresNewInput: false },
  controls: { existingInputsOnly: true, existingInteractionsOnly: true, finalOnly: true, automaticWinnerSelection: true, claimPolicy: "facts-or-useful-question-or-omit", revisionPolicy: "recompute-changed-dependencies", experimentalEnrollment: false }
});

const retained = (sectionId: string): SectionCopyCandidate => ({
  sectionId, role: sectionId === "hero" ? "hero" : "proof", status: "complete", evidenceRefs: ["private-ref"], wordCount: 20, headline: "Private section"
});

describe("buildRenderDesign", () => {
  it("projects only retained section IDs and controlled composition values", () => {
    const result = buildRenderDesign(plan(), [retained("hero")]);
    expect(result).toMatchObject({ artDirection: "product-led", density: "open", sections: [{ id: "hero", target: "hero", visualRole: "hero-image-or-type" }] });
    expect(result.sections).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/Private|https:|private-ref|Acme Sans/);
  });

  it("changes the digest when render-relevant art direction changes", () => {
    expect(buildRenderDesign(plan("type-led"), [retained("hero")]).digest)
      .not.toBe(buildRenderDesign(plan("product-led"), [retained("hero")]).digest);
  });
});
