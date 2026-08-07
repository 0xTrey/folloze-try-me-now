import { describe, expect, it } from "vitest";

import { compileCampaignContext } from "@/lib/generation/campaign-context";
import { experienceTemplateFor } from "@/lib/generation/experience-renderers";
import {
  accountArchetypeIds,
  archetypeForLegacyWireframe,
  campaignArchetypeIds,
  contentArchetypeIds,
  getWireframeArchetype,
  listWireframeArchetypes,
  selectWireframe,
  selectWireframeForCampaignContext,
  selectWireframeForExperienceSpec,
  wireframeArchetypeIds,
  wireframeLibrary
} from "@/lib/generation/wireframe-library";
import type { BrandProfile, ExperienceSpecV1 } from "@/lib/types";

const seller: BrandProfile = {
  domain: "folloze.com",
  companyName: "Folloze",
  description: "Personalized digital buyer experiences for enterprise go-to-market teams.",
  publicContext: "Folloze helps revenue teams build and measure guided buyer experiences.",
  publicTopics: ["Buyer experience", "Account-based marketing"],
  imageUrls: [],
  colors: ["#111827", "#5B5BFF", "#FFFFFF"],
  primaryColor: "#111827",
  accentColor: "#5B5BFF",
  surfaceColor: "#FFFFFF",
  sourceUrl: "https://folloze.com",
  source: "brand-harvester"
};

function minimalSpec(overrides: Partial<ExperienceSpecV1> = {}): ExperienceSpecV1 {
  return {
    schemaVersion: "1.0",
    revision: 1,
    sourceBriefRevision: 1,
    sourceBriefFingerprint: "brief",
    createdAt: "2026-08-07T12:00:00.000Z",
    artifactDigest: "artifact",
    grounding: {
      seller: { source: "brand-harvester", sourceUrl: "https://folloze.com" },
      audience: { status: "ready", findingIds: [] }
    },
    identities: { seller: { domain: "folloze.com", name: "Folloze" } },
    brandTokens: {
      primaryColor: "#111827",
      accentColor: "#5B5BFF",
      surfaceColor: "#FFFFFF"
    },
    draft: {},
    cta: { intent: "explore", style: "solid", label: "Explore" },
    selectedAssetIds: [],
    evidenceItemIds: [],
    curatedSections: [],
    analytics: { events: [] },
    renderers: { web: { status: "ready" }, folloze: { status: "not-requested" } },
    ...overrides
  };
}

describe("wireframe library", () => {
  it("registers all 17 archetypes with complete, plain-language metadata", () => {
    expect(wireframeLibrary).toHaveLength(17);
    expect(accountArchetypeIds).toHaveLength(5);
    expect(campaignArchetypeIds).toHaveLength(6);
    expect(contentArchetypeIds).toHaveLength(6);
    expect(new Set(wireframeLibrary.map(({ id }) => id)).size).toBe(17);
    expect(wireframeLibrary.map(({ id }) => id)).toEqual([...wireframeArchetypeIds]);

    for (const wireframe of wireframeLibrary) {
      expect(wireframe.sectionLabels).toHaveLength(7);
      expect(wireframe.navigationLabels.length).toBeGreaterThanOrEqual(6);
      expect(wireframe.compatibleAlternativeIds.length).toBeLessThanOrEqual(2);
      expect(wireframe.compatibleAlternativeIds).not.toContain(wireframe.id);
      expect(wireframe.ctaRule.length).toBeGreaterThan(20);
      expect(JSON.stringify(wireframe)).not.toMatch(
        /account thesis|decision (?:path|lens)|supporting proof|narrative arc|stakeholder map|buying committee/i
      );
      for (const alternativeId of wireframe.compatibleAlternativeIds) {
        expect(getWireframeArchetype(alternativeId).family).toBe(wireframe.family);
      }
    }
  });

  it("keeps every content archetype source-preserving and separate from campaign alternatives", () => {
    const content = listWireframeArchetypes("content");
    expect(content).toHaveLength(6);
    expect(content.every(({ contentPolicy }) => contentPolicy === "source-preserving")).toBe(true);
    expect(
      content.every(({ compatibleAlternativeIds }) =>
        compatibleAlternativeIds.every((id) => id.startsWith("content-"))
      )
    ).toBe(true);
  });

  it("maps every archetype to its backend-selected renderer composition", () => {
    for (const wireframe of wireframeLibrary) {
      const selection = selectWireframe(
        { family: wireframe.family },
        { requestedArchetypeId: wireframe.id, locked: true }
      );
      const campaignRegister = wireframe.family === "account"
        ? "one-to-one-abm"
        : wireframe.family === "content"
          ? "content-magic"
          : "campaign-product";
      const template = experienceTemplateFor(
        {
          campaignRegister,
          wireframeName: "canonical-desktop-experience"
        },
        { ...selection, selectedBy: "system" }
      );

      expect(template).toMatchObject({
        archetypeId: wireframe.id,
        compositionId: wireframe.primaryCompositionId,
        journeyNavigation: wireframe.navigationLabels
      });
      expect(template.fingerprint).toBe(
        `v5-${wireframe.id}-${wireframe.primaryCompositionId}`
      );
    }
  });
});

describe("deterministic wireframe selection", () => {
  it.each([
    [
      { family: "account" as const, audience: "Platform architects and security leaders" },
      "account-technical",
      "account-technical-audience"
    ],
    [
      { family: "account" as const, approvedQuantifiedProof: true },
      "account-proof",
      "account-approved-proof"
    ],
    [
      { family: "account" as const, audience: "Marketing, sales, finance, and operations leaders" },
      "account-team",
      "account-multi-role"
    ],
    [
      { family: "account" as const, objective: "Run an innovation discovery workshop" },
      "account-workshop",
      "account-workshop-objective"
    ],
    [{ family: "account" as const }, "account-executive", "account-default"]
  ])("selects account archetypes in documented priority", (signals, id, reasonCode) => {
    expect(selectWireframe(signals)).toMatchObject({ archetypeId: id, reasonCode });
  });

  it("gives technical account signals priority over approved proof", () => {
    expect(
      selectWireframe({
        family: "account",
        audience: "Security architects",
        approvedQuantifiedProof: true
      }).archetypeId
    ).toBe("account-technical");
  });

  it.each([
    [{ family: "campaign" as const, campaignType: "event" as const }, "campaign-event"],
    [{ family: "campaign" as const, approvedCustomerStory: true }, "campaign-proof"],
    [{ family: "campaign" as const, objective: "Post-launch nurture" }, "campaign-nurture"],
    [{ family: "campaign" as const, objective: "Map a claims workflow" }, "campaign-use-case"],
    [{ family: "campaign" as const, sourceUrl: "https://example.com/product" }, "campaign-product"],
    [{ family: "campaign" as const, objective: "Create awareness" }, "campaign-demand"]
  ])("selects the expected campaign archetype", (signals, id) => {
    expect(selectWireframe(signals).archetypeId).toBe(id);
  });

  it.each([
    [{ family: "content" as const, sourceTitle: "Annual webinar transcript" }, "content-webinar"],
    [{ family: "content" as const, experiencePattern: "assessment" }, "content-assessment"],
    [{ family: "content" as const, sourceTitle: "2026 buyer benchmark survey" }, "content-research"],
    [{ family: "content" as const, sourceTitle: "API implementation reference guide" }, "content-technical"],
    [{ family: "content" as const, sourceTitle: "Demand generation playbook" }, "content-guide"],
    [{ family: "content" as const, sourceTitle: "Executive outlook" }, "content-report"]
  ])("selects the expected content archetype without crossing families", (signals, id) => {
    const selection = selectWireframe(signals);
    expect(selection.archetypeId).toBe(id);
    expect(selection.alternativeIds).toHaveLength(2);
    expect(selection.alternativeIds.every((alternative) => alternative.startsWith("content-"))).toBe(true);
  });

  it("returns an explainable receipt with at most two compatible alternatives", () => {
    const selection = selectWireframe({
      family: "account",
      audience: "Data and platform architects"
    });

    expect(selection).toMatchObject({
      version: 1,
      family: "account",
      archetypeId: "account-technical",
      compositionId: "workflow-spine",
      selectedBy: "system",
      locked: false
    });
    expect(selection.reason).toMatch(/technical evaluation layout/i);
    expect(selection.alternativeIds).toHaveLength(2);
    expect(
      selection.alternativeIds.every(
        (id) => getWireframeArchetype(id).family === selection.family
      )
    ).toBe(true);
  });

  it("allows only a compatible post-preview selection", () => {
    expect(
      selectWireframe(
        { family: "campaign" },
        { requestedArchetypeId: "campaign-use-case", locked: true }
      )
    ).toMatchObject({
      archetypeId: "campaign-use-case",
      selectedBy: "visitor",
      reasonCode: "visitor-selected",
      locked: true
    });

    expect(() =>
      selectWireframe(
        { family: "content" },
        { requestedArchetypeId: "campaign-product" }
      )
    ).toThrow(/belongs to campaign, not content/);
  });
});

describe("existing contract adapters", () => {
  it("selects from the current CampaignGenerationContext without changing it", () => {
    const answers = {
      campaignType: "product" as const,
      audience: "Revenue marketing leaders",
      objective: "Launch a product",
      promotedOffer: "Folloze Campaign Builder",
      offerSourceUrl: "https://folloze.com/campaign-builder"
    };
    const context = compileCampaignContext({
      brand: seller,
      useCase: "campaign",
      answers
    });

    expect(
      selectWireframeForCampaignContext({ useCase: "campaign", answers, context })
    ).toMatchObject({
      family: "campaign",
      archetypeId: "campaign-product",
      reasonCode: "campaign-product-source"
    });
  });

  it("uses source intelligence on ExperienceSpec to select content independently", () => {
    const spec = minimalSpec({
      grounding: {
        seller: { source: "brand-harvester", sourceUrl: "https://folloze.com" },
        source: {
          kind: "uploaded-pdf",
          status: "confirmed",
          title: "Integration readiness assessment"
        },
        audience: { status: "ready", findingIds: [] }
      },
      sourceIntelligence: {
        artifactId: "source-1",
        digest: "digest",
        status: "ready",
        confidence: "high",
        title: "Integration readiness assessment",
        claimIds: ["claim-1"],
        citationCount: 4,
        experiencePattern: "assessment"
      }
    });

    expect(selectWireframeForExperienceSpec({ useCase: "content", spec })).toMatchObject({
      family: "content",
      archetypeId: "content-assessment",
      compositionId: "data-story",
      reasonCode: "content-assessment"
    });
  });
});

describe("legacy wireframe compatibility", () => {
  it("maps saved legacy names without conflating the canonical family", () => {
    expect(archetypeForLegacyWireframe("abm-account-microsite")).toBe("account-executive");
    expect(archetypeForLegacyWireframe("product-launch-landing-page")).toBe("campaign-product");
    expect(archetypeForLegacyWireframe("content-assessment-workbench")).toBe("content-assessment");
    expect(archetypeForLegacyWireframe("canonical-desktop-experience")).toBeNull();
    expect(archetypeForLegacyWireframe("canonical-desktop-experience", "content")).toBe(
      "content-report"
    );
    expect(archetypeForLegacyWireframe("product-launch-landing-page", "content")).toBe(
      "content-report"
    );
  });
});
