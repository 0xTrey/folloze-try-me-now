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

import { fallbackBrand } from "@/lib/integrations/brand-harvester";
import { patchSessionAnswers, runBrandStage } from "@/lib/orchestrator";
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
  integrationMocks.harvestOfferDiscoveryGraph.mockReset();
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
      logoUrl: `/api/sessions/${id}/image/seller-logo`,
      logoSourceUrl: expect.stringContaining("servicenow-header-logo"),
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

  it("upgrades a Folloze no-logo fallback while keeping design readiness incomplete", async () => {
    const id = `folloze-brand-upgrade-${Date.now()}`;
    const verified = verifiedBrandProfileFor("folloze.com");
    expect(verified).toBeDefined();
    const session = fallbackSession(id, "folloze.com");
    session.brand = {
      ...session.brand!,
      companyName: "Folloze",
      diagnostics: {
        logo: {
          strategy: "none",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          resolutionComplete: true
        },
        palette: {
          strategy: "frequency",
          confidence: "low",
          candidateCount: 3,
          semanticCandidateCount: 0,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0,
          resolutionComplete: true
        }
      }
    };
    ids.add(id);
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValue(verified!);
    const discoveryGraph = {
      origin: verified!.sourceUrl,
      pages: [
        {
          url: `${verified!.sourceUrl.replace(/\/$/, "")}/solutions/`,
          html: "<h2>Account Experience Platform</h2>"
        }
      ]
    };
    integrationMocks.harvestOfferDiscoveryGraph.mockResolvedValue(discoveryGraph);

    await runBrandStage(id);

    const stored = await getSession(id);
    expect(integrationMocks.harvestBrand).toHaveBeenCalledWith("folloze.com");
    expect(stored?.brand).toMatchObject({
      companyName: "Folloze",
      logoUrl: `/api/sessions/${id}/image/seller-logo`,
      logoSourceUrl: expect.stringContaining("_folloze-logo.svg"),
      primaryColor: "#1C293F",
      accentColor: "#5B5BFF",
      source: "brand-harvester",
      readiness: {
        status: "incomplete",
        logoReady: true,
        paletteReady: true,
        designReady: false,
        sourceEvidenceReady: true
      }
    });
    expect(stored?.stages.brand.status).toBe("fallback");
    expect(integrationMocks.harvestOfferDiscoveryGraph).toHaveBeenCalledWith({
      origin: verified!.sourceUrl
    });
    expect(stored?.offerDiscoveryGraph).toEqual(discoveryGraph);
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

  it("refreshes a legacy fast-extractor profile that found colors but no deliverable logo", async () => {
    const id = `brand-logo-refresh-${Date.now()}`;
    const session = fallbackSession(id, "cisco.com");
    session.brand = {
      ...session.brand!,
      companyName: "Cisco",
      colors: ["#07182D", "#02C8FF", "#FFFFFF"],
      primaryColor: "#07182D",
      accentColor: "#02C8FF",
      source: "fast-extractor",
      diagnostics: {
        logo: {
          strategy: "inline-svg-unportable",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 1
        }
      }
    };
    ids.add(id);
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValue({
      ...session.brand,
      logoUrl: "https://www.cisco.com/cisco-logo.svg",
      logoSourceUrl: "https://www.cisco.com/cisco-logo.svg",
      diagnostics: {
        logo: {
          strategy: "semantic-image",
          imageCandidateCount: 1,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 1,
          resolutionComplete: true
        }
      }
    });

    await runBrandStage(id);

    const stored = await getSession(id);
    expect(integrationMocks.harvestBrand).toHaveBeenCalledWith("cisco.com");
    expect(stored?.brand).toMatchObject({
      logoUrl: `/api/sessions/${id}/image/seller-logo`,
      logoSourceUrl: "https://www.cisco.com/cisco-logo.svg",
      source: "fast-extractor"
    });
    expect(stored?.events.map(({ name }) => name)).toContain("brand_logo_refresh_started");
  });

  it("keeps the brand stage in review when a logo resolves but semantic palette evidence does not", async () => {
    const id = `brand-evidence-incomplete-${Date.now()}`;
    const session = fallbackSession(id, "jitterbit.com");
    session.brand = {
      ...session.brand!,
      companyName: "Jitterbit",
      source: "fast-extractor",
      diagnostics: {
        logo: {
          strategy: "none",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0
        }
      }
    };
    ids.add(id);
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValue({
      ...session.brand,
      logoUrl: "https://www.jitterbit.com/Jitterbit-logo-2.svg",
      logoSourceUrl: "https://www.jitterbit.com/Jitterbit-logo-2.svg",
      diagnostics: {
        logo: {
          strategy: "semantic-image",
          imageCandidateCount: 1,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          resolutionComplete: true
        },
        palette: {
          strategy: "frequency",
          confidence: "low",
          candidateCount: 20,
          semanticCandidateCount: 0,
          rejectedCandidateCount: 12,
          gradientCandidateCount: 0,
          resolutionComplete: true
        }
      }
    });

    await runBrandStage(id);

    const stored = await getSession(id);
    expect(stored?.stages.brand).toMatchObject({
      status: "fallback",
      artifact: "Jitterbit · review brand evidence"
    });
    expect(stored?.stages.brand.detail).toContain("semantic colors are incomplete");
    expect(stored?.brand?.readiness).toMatchObject({
      status: "incomplete",
      logoReady: true,
      paletteReady: false
    });
  });

  it("uses the same verified logo, palette, and readiness contract for content experiences", async () => {
    const id = `content-brand-upgrade-${Date.now()}`;
    const session = fallbackSession(id, "servicenow.com");
    session.useCase = "content";
    const verified = verifiedBrandProfileFor("servicenow.com")!;
    ids.add(id);
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValue(verified);

    await runBrandStage(id);

    const stored = await getSession(id);
    expect(stored?.brand).toMatchObject({
      logoUrl: `/api/sessions/${id}/image/seller-logo`,
      primaryColor: "#032D42",
      accentColor: "#63DF4E",
      readiness: {
        status: "ready",
        identityReady: true,
        logoReady: true,
        paletteReady: true,
        sourceEvidenceReady: true
      }
    });
    expect(stored?.stages.brand.status).toBe("complete");
  });

  it("does not repeatedly refresh a no-logo profile after all configured resolvers completed", async () => {
    const id = `brand-logo-complete-${Date.now()}`;
    const session = fallbackSession(id, "no-logo-example.test");
    session.brand = {
      ...session.brand!,
      source: "fast-extractor",
      diagnostics: {
        logo: {
          strategy: "none",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          resolutionComplete: true
        },
        palette: {
          strategy: "frequency",
          confidence: "low",
          candidateCount: 3,
          semanticCandidateCount: 0,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0,
          resolutionComplete: true
        }
      }
    };
    ids.add(id);
    await putSession(session);

    await runBrandStage(id);

    expect(integrationMocks.harvestBrand).not.toHaveBeenCalled();
    expect((await getSession(id))?.brand?.source).toBe("fast-extractor");
  });

  it("preserves the harvested provider and logo evidence when identity is rejected", async () => {
    const id = `brand-rejection-trace-${Date.now()}`;
    const session = fallbackSession(id, "hellopebble.com");
    session.brand = {
      ...session.brand!,
      source: "fast-extractor"
    };
    ids.add(id);
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValue({
      ...session.brand!,
      domain: "hellopebble.com",
      canonicalDomain: "hellopebble.com",
      companyName: "PitchBook",
      sourceUrl: "https://hellopebble.com/",
      logoUrl: "https://cdn.example.com/assets/pitchbook-logo.svg",
      logoSourceUrl: "https://cdn.example.com/assets/pitchbook-logo.svg",
      source: "brand-harvester",
      diagnostics: {
        logo: {
          strategy: "semantic-image",
          imageCandidateCount: 4,
          rejectedImageCount: 2,
          inlineSvgCandidateCount: 0,
          selectedSource: "json-ld",
          validationAttempted: 3,
          validationRejected: 2,
          resolutionComplete: true
        },
        palette: {
          strategy: "semantic-tokens",
          confidence: "high",
          candidateCount: 8,
          semanticCandidateCount: 5,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0,
          resolutionComplete: true
        },
        providers: {
          publicPage: "succeeded",
          publicPageAttempts: 1,
          remoteBrowser: "not_configured",
          brandfetch: "failed",
          brandfetchLogoApi: "configured",
          brandfetchBrandApi: "not_found",
          verifiedFallback: false
        }
      }
    });

    await runBrandStage(id);

    const stored = await getSession(id);
    const completion = stored?.events.find(({ name }) => name === "brand_harvest_completed");
    const rejection = stored?.events.find(({ name }) => name === "brand_identity_rejected");
    expect(stored?.brand?.source).toBe("fallback");
    expect(completion?.meta).toMatchObject({
      identityFallback: true,
      harvestedSource: "brand-harvester",
      logoStrategy: "semantic-image",
      logoSelectedSource: "json-ld",
      logoAssetPath: "/assets/pitchbook-logo.svg",
      brandPublicPageProvider: "succeeded",
      brandfetchBrandApiProvider: "not_found"
    });
    expect(rejection?.meta).toMatchObject({
      harvestedSource: "brand-harvester",
      logoStrategy: "semantic-image",
      logoSelectedSource: "json-ld",
      logoAssetPath: "/assets/pitchbook-logo.svg"
    });
    expect(rejection?.meta?.identityRejectionReason).toContain(
      "public company name could not be reconciled"
    );
  });

  it("accepts a verified canonical brand source and passes its authority to harvesters", async () => {
    const id = `brand-source-canonical-${Date.now()}`;
    const session = fallbackSession(id, "datadoghq.com");
    session.brand = {
      ...session.brand!,
      domain: "datadoghq.com",
      canonicalDomain: "datadog.com",
      domainAliases: ["datadog.com"],
      companyName: "Datadog",
      sourceUrl: "https://datadoghq.com/",
      source: "fast-extractor",
      identity: {
        expectedDomain: "datadoghq.com",
        canonicalDomain: "datadoghq.com",
        canonicalName: "Datadog",
        confidence: "high",
        confirmationStatus: "confirmed",
        confirmedBy: "system",
        reasons: [],
        provenance: []
      },
      diagnostics: {
        ...session.brand!.diagnostics!,
        logo: {
          strategy: "none",
          imageCandidateCount: 0,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          resolutionComplete: false
        }
      }
    };
    ids.add(id);
    await putSession(session);
    integrationMocks.harvestBrand.mockResolvedValue({
      ...session.brand,
      sourceUrl: "https://www.datadog.com/product/",
      source: "brand-harvester"
    });

    await patchSessionAnswers(id, {
      brandSourceUrl: " https://WWW.Datadog.com/product/#overview "
    });
    expect((await getSession(id))?.answers.brandSourceUrl).toBe(
      "https://www.datadog.com/product/"
    );

    await runBrandStage(id, { resumeStory: false });

    expect(integrationMocks.harvestBrand).toHaveBeenCalledWith(
      "datadoghq.com",
      "https://www.datadog.com/product/",
      ["datadog.com", "datadoghq.com"]
    );
  });

  it("accepts a seller regional host without treating it as a cross-brand alias", async () => {
    const id = `brand-source-regional-${Date.now()}`;
    const session = fallbackSession(id, "philips.com");
    ids.add(id);
    await putSession(session);

    await patchSessionAnswers(id, {
      brandSourceUrl: "https://www.usa.philips.com/healthcare/solutions"
    });

    expect((await getSession(id))?.answers.brandSourceUrl).toBe(
      "https://www.usa.philips.com/healthcare/solutions"
    );
  });

  it("uses a same-seller Content Magic URL as brand authority while preserving source research", async () => {
    const id = `content-brand-source-${Date.now()}`;
    const session = fallbackSession(id, "servicenow.com");
    session.useCase = "content";
    session.answers.sourceUrl = "https://servicenow.com/platform/ai";
    ids.add(id);
    await putSession(session);

    await patchSessionAnswers(id, { sourceUrl: session.answers.sourceUrl });
    const stored = await getSession(id);
    expect(stored?.answers.sourceUrl).toBe("https://servicenow.com/platform/ai");
    expect(stored?.answers.brandSourceUrl).toBe("https://servicenow.com/platform/ai");
  });

  it("keeps a third-party Content Magic URL as content evidence only", async () => {
    const id = `content-third-party-source-${Date.now()}`;
    const session = fallbackSession(id, "servicenow.com");
    session.useCase = "content";
    ids.add(id);
    await putSession(session);

    await patchSessionAnswers(id, { sourceUrl: "https://reports.example.com/servicenow.pdf" });
    const stored = await getSession(id);
    expect(stored?.answers.sourceUrl).toBe("https://reports.example.com/servicenow.pdf");
    expect(stored?.answers.brandSourceUrl).toBeUndefined();
  });

  it("rejects a cross-domain canonical candidate until seller identity verifies it", async () => {
    const id = `brand-source-unverified-alias-${Date.now()}`;
    const session = fallbackSession(id, "datadoghq.com");
    session.brand = {
      ...session.brand!,
      canonicalDomain: "datadog.com",
      domainAliases: ["datadog.com"],
      identity: {
        expectedDomain: "datadoghq.com",
        canonicalDomain: "datadoghq.com",
        canonicalName: "Datadog",
        confidence: "low",
        confirmationStatus: "needs-confirmation",
        reasons: ["Canonical alias still needs confirmation."],
        provenance: []
      }
    };
    ids.add(id);
    await putSession(session);

    await expect(
      patchSessionAnswers(id, {
        brandSourceUrl: "https://www.datadog.com/product/"
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "brand_source_domain_mismatch"
    });
  });

  it.each([
    "https://attacker.example/brand",
    "http://datadoghq.com/brand",
    "https://user:password@datadoghq.com/brand",
    "https://datadoghq.com:8443/brand",
    "https://127.0.0.1/brand"
  ])("rejects an unsafe or cross-brand recovery URL: %s", async (brandSourceUrl) => {
    const id = `brand-source-rejected-${Date.now()}-${ids.size}`;
    const session = fallbackSession(id, "datadoghq.com");
    ids.add(id);
    await putSession(session);

    await expect(
      patchSessionAnswers(id, { brandSourceUrl })
    ).rejects.toMatchObject({
      status: 400,
      code: "brand_source_domain_mismatch"
    });
    expect((await getSession(id))?.answers.brandSourceUrl).toBeUndefined();
  });
});
