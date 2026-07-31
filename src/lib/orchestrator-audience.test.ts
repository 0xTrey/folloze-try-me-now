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
    } finally {
      await deleteSession(id);
    }
  });
});
