import { afterEach, describe, expect, it, vi } from "vitest";

const integrationMocks = vi.hoisted(() => ({
  harvestBrand: vi.fn(),
  harvestOfferDiscoveryGraph: vi.fn()
}));

vi.mock("@/lib/integrations/brand-harvester", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/brand-harvester")>();
  return { ...actual, harvestBrand: integrationMocks.harvestBrand };
});

vi.mock("@/lib/research/offer-discovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research/offer-discovery")>();
  return {
    ...actual,
    harvestOfferDiscoveryGraph: integrationMocks.harvestOfferDiscoveryGraph
  };
});

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import { patchSessionAnswers, runBrandStage, runTargetBrandStage } from "@/lib/orchestrator";
import { deleteSession, getSession, putSession } from "@/lib/session-store";
import type { BrandProfile, TryMeSession } from "@/lib/types";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";

function profile(
  overrides: Partial<BrandProfile> & Pick<BrandProfile, "domain" | "companyName">
): BrandProfile {
  return {
    publicTopics: [],
    imageUrls: [],
    colors: ["#111827", "#F15A29", "#FFFFFF"],
    primaryColor: "#111827",
    accentColor: "#F15A29",
    surfaceColor: "#FFFFFF",
    sourceUrl: `https://${overrides.domain}`,
    source: "fast-extractor",
    ...overrides
  };
}

afterEach(() => {
  integrationMocks.harvestBrand.mockReset();
  integrationMocks.harvestOfferDiscoveryGraph.mockReset();
});

describe("target-aware ABM audience orchestration", () => {
  it("removes stale seller roles, then replaces them after the target harvest", async () => {
    const id = "target-aware-audience";
    const seller = profile({
      domain: "jitterbit.com",
      companyName: "Jitterbit",
      description: "iPaaS, workflow automation, API management, EDI, and application development."
    });
    const target = profile({
      domain: "cisco.com",
      companyName: "Cisco",
      description: "Networking, security, data center, cloud operations, and digital resilience.",
      publicTopics: ["Networking", "Security", "Data center", "Observability"]
    });
    const sellerOnly = audienceSuggestionsFor(seller);
    const now = new Date().toISOString();
    const session: TryMeSession = {
      id,
      editorTokenHash: "private-editor-hash",
      useCase: "abm",
      companyDomain: seller.domain,
      status: "collecting",
      createdAt: now,
      updatedAt: now,
      temporaryUrl: `https://example.com/e/${id}`,
      revision: 1,
      stages: {
        brand: { status: "complete" },
        audience: { status: "complete", startedAt: now, completedAt: now },
        story: { status: "pending" }
      },
      answers: { audience: sellerOnly[0] },
      brand: seller,
      audienceSuggestions: sellerOnly,
      events: []
    };
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValueOnce(target);

    try {
      const patched = await patchSessionAnswers(id, { targetDomain: target.domain });
      expect(patched.session.audienceSuggestions).toEqual([]);
      expect(patched.session.answers.audience).toBeUndefined();

      await runTargetBrandStage(id);
      const harvested = await getSession(id);
      expect(integrationMocks.harvestBrand).toHaveBeenCalledWith(target.domain);
      expect(harvested?.targetBrand?.companyName).toBe("Cisco");
      expect(harvested?.audienceSuggestions).toEqual(audienceSuggestionsFor(seller, target));
      expect(harvested?.audienceSuggestions).not.toEqual(sellerOnly);
      expect(harvested?.audienceSuggestions.join(" ")).toMatch(
        /network|security|cloud|data center|resilien/i
      );
      expect(harvested?.evidenceItems?.length).toBeGreaterThan(0);
      expect(harvested?.evidenceItems?.every(({ entityRole }) => entityRole === "target")).toBe(
        true
      );
      expect(
        harvested?.audienceRecommendations?.every(
          ({ source, evidenceItemIds }) =>
            source === "seller-target-synthesis" && evidenceItemIds.length > 0
        )
      ).toBe(true);
      expect(harvested?.audienceRecommendations?.[0]?.rationale).toMatch(
        /^Recommended for Cisco because its public .+ context makes .+ relevant: they .+ while evaluating .+\. Jitterbit remains the offer and page authority\.$/
      );
      expect(harvested?.audienceRecommendations?.[0]?.rationale).not.toContain(
        "public public"
      );
    } finally {
      await deleteSession(id);
    }
  });

  it("upgrades a same-domain target fallback when a reviewed profile becomes available", async () => {
    const id = "target-brand-verified-upgrade";
    const seller = profile({
      domain: "medidata.com",
      companyName: "Medidata",
      description: "Clinical trial technology."
    });
    const staleTarget = profile({
      domain: "lilly.com",
      companyName: "Lilly",
      source: "fallback",
      logoUrl: undefined
    });
    const verifiedTarget = verifiedBrandProfileFor("lilly.com")!;
    const now = new Date().toISOString();
    await putSession({
      id,
      editorTokenHash: "private-editor-hash",
      useCase: "abm",
      companyDomain: seller.domain,
      status: "collecting",
      createdAt: now,
      updatedAt: now,
      temporaryUrl: `https://example.com/e/${id}`,
      revision: 1,
      stages: {
        brand: { status: "complete" },
        audience: { status: "running", startedAt: now },
        story: { status: "pending" }
      },
      answers: { targetDomain: "lilly.com" },
      brand: seller,
      targetBrand: staleTarget,
      audienceSuggestions: [],
      events: []
    });
    integrationMocks.harvestBrand.mockResolvedValueOnce(verifiedTarget);

    try {
      await runTargetBrandStage(id);
      const upgraded = await getSession(id);

      expect(integrationMocks.harvestBrand).toHaveBeenCalledWith("lilly.com");
      expect(upgraded?.targetBrand).toMatchObject({
        companyName: "Lilly",
        logoUrl: `/api/sessions/${id}/image/target-logo`,
        logoSourceUrl: expect.stringContaining("LillyLogo_RGB_Red_v3.svg"),
        source: "brand-harvester"
      });
      expect(upgraded?.events.map(({ name }) => name)).toEqual(expect.arrayContaining([
        "target_harvest_started",
        "target_harvest_completed"
      ]));
    } finally {
      await deleteSession(id);
    }
  });
});

describe("seller-evidence audience orchestration", () => {
  it.each(["campaign", "content"] as const)(
    "grounds %s audiences in seller public evidence without inventing a target",
    async (useCase) => {
      const id = `seller-evidence-${useCase}`;
      const seller = profile({
        domain: "jitterbit.com",
        companyName: "Jitterbit",
        description:
          "An integration, automation, API management, EDI, and application development platform.",
        publicContext:
          "Jitterbit helps organizations connect applications and automate business workflows.",
        publicTopics: ["Application integration", "Workflow automation", "API management"]
      });
      const now = new Date().toISOString();
      await putSession({
        id,
        editorTokenHash: "private-editor-hash",
        useCase,
        companyDomain: seller.domain,
        status: "collecting",
        createdAt: now,
        updatedAt: now,
        temporaryUrl: `https://example.com/e/${id}`,
        revision: 1,
        stages: {
          brand: { status: "running", startedAt: now },
          audience: { status: "running", startedAt: now },
          story: { status: "pending" }
        },
        answers: {},
        audienceSuggestions: [],
        events: []
      });
      integrationMocks.harvestBrand.mockResolvedValueOnce(seller);

      try {
        await runBrandStage(id);
        const harvested = await getSession(id);
        const evidenceIds = new Set(harvested?.evidenceItems?.map(({ id }) => id));

        expect(harvested?.targetBrand).toBeUndefined();
        expect(harvested?.evidenceItems?.length).toBeGreaterThan(0);
        expect(
          harvested?.evidenceItems?.every(({ entityRole }) => entityRole === "seller")
        ).toBe(true);
        expect(
          harvested?.evidenceItems?.every(
            ({ sourceUrl }) => new URL(sourceUrl).hostname === seller.domain
          )
        ).toBe(true);
        // Integration-platform evidence should surface technical buyer roles, not
        // generic category fallbacks presented as research-backed chips.
        expect(harvested?.audienceRecommendations?.length).toBeGreaterThanOrEqual(2);
        expect(
          harvested?.audienceRecommendations?.every(
            ({ recommendationKind, source }) =>
              recommendationKind === "evidence-backed" && source === "seller-public-evidence"
          )
        ).toBe(true);
        expect(
          harvested?.audienceRecommendations?.some(({ label }) =>
            /architect|operations|platform/i.test(label)
          )
        ).toBe(true);
        expect([...evidenceIds].length).toBeGreaterThan(0);
        expect(harvested?.offerRecommendations?.length).toBeGreaterThanOrEqual(2);
        expect(harvested?.objectiveRecommendations).toHaveLength(3);
        expect(
          harvested?.offerRecommendations?.filter(({ recommended }) => recommended)
        ).toHaveLength(1);
        expect(
          harvested?.objectiveRecommendations?.filter(({ recommended }) => recommended)
        ).toHaveLength(1);
        expect(
          harvested?.offerRecommendations?.every(
            ({ revision }) => revision === harvested.revision
          )
        ).toBe(true);
      } finally {
        await deleteSession(id);
      }
    }
  );

  it("projects Aprio audit evidence into finance audiences and service-specific objectives", async () => {
    const id = "aprio-audit-assurance-integration";
    const seller = profile({
      domain: "aprio.com",
      companyName: "Aprio",
      description:
        "Aprio is a business advisory and accounting firm providing audit, assurance, tax, and advisory services.",
      publicContext:
        "Aprio helps organizations with audit and assurance, tax, and business advisory decisions.",
      publicTopics: ["Audit & Assurance Solutions", "Accounting", "Finance leaders", "Business Advisory"]
    });
    const now = new Date().toISOString();
    await putSession({
      id,
      editorTokenHash: "private-editor-hash",
      useCase: "campaign",
      companyDomain: seller.domain,
      status: "collecting",
      createdAt: now,
      updatedAt: now,
      temporaryUrl: `https://example.com/e/${id}`,
      revision: 1,
      stages: {
        brand: { status: "running", startedAt: now },
        audience: { status: "pending" },
        story: { status: "pending" }
      },
      answers: { promotedOffer: "Audit & Assurance Solutions", promotedOfferConfirmed: true },
      audienceSuggestions: [],
      events: []
    });
    integrationMocks.harvestBrand.mockResolvedValueOnce(seller);
    integrationMocks.harvestOfferDiscoveryGraph.mockResolvedValueOnce({
      origin: "https://aprio.com",
      pages: [
        {
          url: "https://aprio.com/",
          html: "<html><body><h1>Aprio</h1><p>Business advisory and accounting firm.</p><a href=\"/services/audit-assurance/\">Audit &amp; Assurance Solutions</a><a href=\"/services/business-tax/\">Business Tax Services</a><a href=\"/services/risk-compliance/\">Risk &amp; Compliance Solutions</a></body></html>"
        },
        {
          url: "https://aprio.com/services/audit-assurance/",
          html: "<html><body><h1>Audit &amp; Assurance Solutions</h1><p>Independent audit and assurance services for finance leaders, controllers, and business owners.</p></body></html>"
        },
        {
          url: "https://aprio.com/services/business-tax/",
          html: "<html><body><h1>Business Tax Services</h1><p>Tax planning and compliance services for growing businesses.</p></body></html>"
        },
        {
          url: "https://aprio.com/services/risk-compliance/",
          html: "<html><body><h1>Risk &amp; Compliance Solutions</h1><p>Risk and compliance advisory services.</p></body></html>"
        }
      ]
    });

    try {
      await runBrandStage(id);
      const projected = await getSession(id);
      expect(integrationMocks.harvestOfferDiscoveryGraph).toHaveBeenCalledWith({
        origin: "https://aprio.com"
      });
      expect(projected?.offerRecommendations?.some(({ label, recommendationKind }) =>
        /Audit.*Assurance/i.test(label) && recommendationKind === "evidence-backed"
      )).toBe(true);
      const audienceLabels = projected?.audienceRecommendations?.map(({ label }) => label) ?? [];
      expect(audienceLabels.length).toBeGreaterThanOrEqual(2);
      expect(audienceLabels.join(" ")).toMatch(/finance|accounting|controller|business owner/i);
      expect(audienceLabels.join(" ")).not.toMatch(/data and ai|platform and architecture|it leaders/i);
      expect(projected?.audienceRecommendations?.some(({ evidenceItemIds, evidenceSummary }) =>
        evidenceItemIds.length > 0 && /Audit.*Assurance/i.test(evidenceSummary ?? "")
      )).toBe(true);
      expect(projected?.objectiveRecommendations).toHaveLength(3);
      expect(projected?.objectiveRecommendations?.map(({ cta }) => cta?.type)).toEqual(
        expect.arrayContaining(["explore", "book-meeting", "download"])
      );
      expect(projected?.objectiveRecommendations?.filter(({ recommended }) => recommended)).toHaveLength(1);
      expect(projected?.objectiveRecommendations?.find(({ recommended }) => recommended)?.evidenceItemIds.length).toBeGreaterThan(0);
    } finally {
      await deleteSession(id);
    }
  });
});
