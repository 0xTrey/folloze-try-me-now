import { afterEach, describe, expect, it, vi } from "vitest";

const integrationMocks = vi.hoisted(() => ({
  harvestBrand: vi.fn()
}));

vi.mock("@/lib/integrations/brand-harvester", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/brand-harvester")>();
  return { ...actual, harvestBrand: integrationMocks.harvestBrand };
});

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import { patchSessionAnswers, runTargetBrandStage } from "@/lib/orchestrator";
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

afterEach(() => integrationMocks.harvestBrand.mockReset());

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
      expect(harvested?.audienceRecommendations?.[0]?.rationale).toContain(
        "Cisco's public focus:"
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
