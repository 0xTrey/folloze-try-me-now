import { afterEach, describe, expect, it, vi } from "vitest";

const integrationMocks = vi.hoisted(() => ({
  harvestBrand: vi.fn()
}));

vi.mock("@/lib/integrations/brand-harvester", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/brand-harvester")>();
  return { ...actual, harvestBrand: integrationMocks.harvestBrand };
});

import { fallbackBrand } from "@/lib/integrations/brand-harvester";
import { runBrandStage } from "@/lib/orchestrator";
import { deleteSession, getSession, putSession } from "@/lib/session-store";
import type { TryMeSession } from "@/lib/types";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";

const ids = new Set<string>();

function fallbackSession(id: string, domain: string): TryMeSession {
  const now = new Date().toISOString();
  const genericFallback = fallbackBrand("unverified-example.test");
  return {
    id,
    editorTokenHash: "private-editor-hash",
    useCase: "campaign",
    companyDomain: domain,
    status: "collecting",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: `https://example.test/e/${id}`,
    revision: 1,
    stages: {
      brand: { status: "complete", completedAt: now, detail: "Brand fallback ready." },
      audience: { status: "running" },
      story: { status: "pending" }
    },
    answers: {},
    brand: {
      ...genericFallback,
      domain,
      companyName: domain === "servicenow.com" ? "ServiceNow" : genericFallback.companyName,
      sourceUrl: `https://${domain}`
    },
    audienceSuggestions: [],
    events: []
  };
}

afterEach(async () => {
  integrationMocks.harvestBrand.mockReset();
  await Promise.all([...ids].map((id) => deleteSession(id)));
  ids.clear();
});

describe("verified fallback brand recovery", () => {
  it("upgrades an in-progress ServiceNow fallback session to its reviewed Brand Harvester profile", async () => {
    const id = `brand-upgrade-${Date.now()}`;
    const verified = verifiedBrandProfileFor("servicenow.com");
    expect(verified).toBeDefined();
    ids.add(id);
    await putSession(fallbackSession(id, "servicenow.com"));
    integrationMocks.harvestBrand.mockResolvedValue(verified!);

    await runBrandStage(id);

    const stored = await getSession(id);
    expect(integrationMocks.harvestBrand).toHaveBeenCalledWith("servicenow.com");
    expect(stored?.brand).toMatchObject({
      companyName: "ServiceNow",
      logoUrl: expect.stringContaining("servicenow-header-logo"),
      colors: ["#032D42", "#63DF4E", "#FFFFFF", "#00718F", "#D7E0E6", "#E0F7DC"],
      primaryColor: "#032D42",
      accentColor: "#63DF4E",
      surfaceColor: "#FFFFFF",
      source: "brand-harvester"
    });
    expect(stored?.stages.brand.status).toBe("complete");
    expect(stored?.events.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "brand_harvest_verified_upgrade_started",
      "brand_harvest_started",
      "brand_harvest_completed"
    ]));
  });

  it("does not relabel an unknown fallback profile as verified evidence", async () => {
    const id = `brand-fallback-${Date.now()}`;
    ids.add(id);
    await putSession(fallbackSession(id, "unknown-example.test"));

    await runBrandStage(id);

    const stored = await getSession(id);
    expect(integrationMocks.harvestBrand).not.toHaveBeenCalled();
    expect(stored?.brand?.source).toBe("fallback");
    expect(stored?.brand?.logoUrl).toBeUndefined();
  });
});
