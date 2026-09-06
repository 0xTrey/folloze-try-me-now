import { afterEach, describe, expect, it, vi } from "vitest";

const sourceMocks = vi.hoisted(() => ({
  fetchPublicUrlSourceArtifact: vi.fn()
}));

vi.mock("@/lib/content-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-url")>()),
  fetchPublicUrlSourceArtifact: sourceMocks.fetchPublicUrlSourceArtifact
}));

import { normalizePublicHtmlSource } from "@/lib/content-url";
import { planEarlyResearch } from "@/lib/orchestration/research-plan";
import {
  inferCampaignOfferTitle,
  patchSessionAnswers,
  runSourceIntelligenceStage
} from "@/lib/orchestrator";
import { deleteSession, getSession, putSession, toPublicSession } from "@/lib/session-store";
import type { BrandProfile, TryMeSession } from "@/lib/types";

const ids = new Set<string>();

function campaignSession(id: string): TryMeSession {
  const now = "2026-08-05T12:00:00.000Z";
  return {
    id,
    editorTokenHash: "private-editor-hash",
    useCase: "campaign",
    companyDomain: "6sense.com",
    status: "collecting",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: `https://example.test/e/${id}`,
    revision: 1,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "running" },
      story: { status: "pending" }
    },
    answers: { campaignType: "product" },
    audienceSuggestions: [],
    events: []
  };
}

function adpBrand(): BrandProfile {
  return {
    domain: "adp.com",
    canonicalDomain: "adp.com",
    companyName: "ADP",
    title: "ADP",
    description: "Payroll, HR, tax, benefits, and workforce management solutions.",
    publicContext: "Unlimited AI potential, unlocked by the human experts at ADP.",
    publicTopics: ["Artificial intelligence", "Payroll", "Human resources"],
    sourceUrl: "https://www.adp.com/",
    source: "fast-extractor",
    colors: ["#D0272D", "#FFFFFF", "#101820"],
    primaryColor: "#D0272D",
    accentColor: "#101820",
    surfaceColor: "#FFFFFF",
    imageUrls: []
  };
}

function abmSession(id: string): TryMeSession {
  return {
    ...campaignSession(id),
    useCase: "abm",
    companyDomain: "folloze.com",
    answers: {
      targetDomain: "nvidia.com",
      audience: "AI platform leaders"
    }
  };
}

function artifact(sourceUrl: string, title: string) {
  return normalizePublicHtmlSource({
    sourceUrl,
    finalUrl: sourceUrl,
    createdAt: "2026-08-05T12:00:01.000Z",
    html: `<!doctype html><html><head><meta property="og:title" content="${title}"><meta name="description" content="A complete product platform for revenue teams."></head><body><main><h1>${title}</h1><p>Use account intelligence and orchestration to identify buying signals, engage the right audience, and coordinate revenue programs across teams.</p><p>Connect reliable data to campaign decisions and measurable pipeline outcomes.</p></main></body></html>`
  });
}

afterEach(async () => {
  sourceMocks.fetchPublicUrlSourceArtifact.mockReset();
  await Promise.all([...ids].map((id) => deleteSession(id)));
  ids.clear();
});

describe("campaign offer source intelligence", () => {
  const offerLabel = "Audit & Assurance Solutions";
  const officialOfferUrl = "https://www.aprio.com/audit-assurance/";
  function discoveredCampaign(id: string): TryMeSession {
    return {
      ...campaignSession(id), companyDomain: "aprio.com",
      answers: { campaignType: "demand" },
      brand: { ...adpBrand(), domain: "aprio.com", canonicalDomain: "aprio.com", companyName: "Aprio",
        sourceUrl: "https://www.aprio.com/", publicTopics: [offerLabel],
        identity: { expectedDomain: "aprio.com", canonicalDomain: "aprio.com", canonicalName: "Aprio",
          confidence: "high", confirmationStatus: "confirmed", reasons: [], provenance: [] } },
      offerDiscoveryGraph: { origin: "https://www.aprio.com/", pages: [{ url: "https://www.aprio.com/",
        html: `<main><h2>${offerLabel}</h2><nav><a href="${officialOfferUrl}">${offerLabel}</a></nav></main>` }] }
    };
  }

  it("carries a suggested offer's official page into source research instead of homepage snippets", async () => {
    const id = `discovered-offer-source-${Date.now()}`; ids.add(id);
    await putSession(discoveredCampaign(id));
    sourceMocks.fetchPublicUrlSourceArtifact.mockResolvedValue(artifact(officialOfferUrl, offerLabel));
    await patchSessionAnswers(id, { promotedOffer: offerLabel, promotedOfferConfirmed: true });
    const selected = (await getSession(id))!;
    expect(selected.answers.offerSourceUrl).toBe(officialOfferUrl);
    expect(selected.discoveredOfferSource).toEqual({ label: offerLabel, sourceUrl: officialOfferUrl });
    expect(planEarlyResearch({ useCase: "campaign", companyDomain: selected.companyDomain, answers: selected.answers }).jobs)
      .toEqual(expect.arrayContaining([expect.objectContaining({ worker: "source-intelligence", key: officialOfferUrl, reason: "offer_source_url_stabilized" })]));
    await runSourceIntelligenceStage(id, { resumeStory: false });
    expect((await getSession(id))?.sourceArtifact?.source.finalUrl).toBe(officialOfferUrl);
    expect(sourceMocks.fetchPublicUrlSourceArtifact).toHaveBeenCalledWith(officialOfferUrl, expect.any(Object));
    expect(toPublicSession((await getSession(id))!)).not.toHaveProperty("discoveredOfferSource");
  });

  it("recovers old label-only sessions and removes inferred evidence when the offer changes", async () => {
    const id = `old-discovered-offer-${Date.now()}`; ids.add(id);
    const old = discoveredCampaign(id); old.answers.promotedOffer = offerLabel;
    await putSession(old);
    sourceMocks.fetchPublicUrlSourceArtifact.mockResolvedValue(artifact(officialOfferUrl, offerLabel));
    await runSourceIntelligenceStage(id, { resumeStory: false });
    expect((await getSession(id))?.answers.offerSourceUrl).toBe(officialOfferUrl);
    await patchSessionAnswers(id, { promotedOffer: "An unrelated advisory offer" });
    const changed = (await getSession(id))!;
    expect(changed.answers.offerSourceUrl).toBeUndefined();
    expect(changed.sourceArtifact).toBeUndefined();
    expect(changed.discoveredOfferSource).toBeUndefined();
  });

  it("preserves an explicit source and respects an explicit removal", async () => {
    const id = `explicit-discovered-offer-${Date.now()}`; ids.add(id);
    const explicit = discoveredCampaign(id);
    explicit.answers.offerSourceUrl = "https://www.aprio.com/selected-source/";
    await putSession(explicit);
    await patchSessionAnswers(id, { promotedOffer: offerLabel });
    expect((await getSession(id))?.answers.offerSourceUrl).toBe(explicit.answers.offerSourceUrl);
    await patchSessionAnswers(id, { promotedOffer: offerLabel, offerSourceUrl: "" });
    expect((await getSession(id))?.answers.offerSourceUrl).toBeUndefined();
  });

  it("refreshes the next audience suggestion from the selected offer in the same patch", async () => {
    const id = `offer-audience-refresh-${Date.now()}`;
    ids.add(id);
    await putSession({
      ...campaignSession(id),
      companyDomain: "adp.com",
      brand: adpBrand(),
      audienceSuggestions: ["Data and AI platform leaders"]
    });

    const patched = await patchSessionAnswers(id, {
      promotedOffer: "Payroll, HR and Tax Services",
      campaignType: "product"
    });

    expect(patched.session.audienceSuggestions[0]).toMatch(/people operations/i);
    expect(patched.session.audienceSuggestions.join(" ")).not.toMatch(/data and ai leaders/i);
  });

  it("reduces SEO page titles to a buyer-friendly offer name", () => {
    expect(
      inferCampaignOfferTitle(
        "RevvyAI: AI for Sales Prospecting & B2B Marketing | 6sense",
        "6sense"
      )
    ).toBe("RevvyAI");
    expect(
      inferCampaignOfferTitle("Ford Pro Intelligence | Ford Pro", "Ford")
    ).toBe("Ford Pro Intelligence");
    expect(
      inferCampaignOfferTitle("Buyer Experience Platform", "Folloze")
    ).toBe("Buyer Experience Platform");
  });

  it("derives an initial offer from the URL, then replaces it with extracted product context", async () => {
    const id = `offer-intelligence-${Date.now()}`;
    const sourceUrl = "https://6sense.com/platform/revvyai/";
    ids.add(id);
    await putSession(campaignSession(id));
    sourceMocks.fetchPublicUrlSourceArtifact.mockResolvedValue(
      artifact(sourceUrl, "RevvyAI Revenue Intelligence Platform")
    );

    const patched = await patchSessionAnswers(id, { offerSourceUrl: sourceUrl });
    expect(patched.session.answers).toMatchObject({
      promotedOffer: "RevvyAI",
      offerSourceTitle: "RevvyAI"
    });
    expect(patched.session.campaignOfferSource).toMatchObject({
      sourceHost: "6sense.com",
      intelligenceStatus: "pending"
    });

    await runSourceIntelligenceStage(id);
    const stored = await getSession(id);
    expect(sourceMocks.fetchPublicUrlSourceArtifact).toHaveBeenCalledWith(
      sourceUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 12_000 })
    );
    expect(stored?.answers).toMatchObject({
      promotedOffer: "RevvyAI Revenue Intelligence Platform",
      offerSourceTitle: "RevvyAI Revenue Intelligence Platform"
    });
    expect(stored?.sourceArtifact?.understanding.premise).toContain(
      "complete product platform"
    );
    expect(stored?.campaignOfferSource).toMatchObject({
      sourceHost: "6sense.com",
      intelligenceStatus: "ready"
    });
    expect(stored?.events.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "offer_source_intelligence_started",
      "offer_source_intelligence_completed"
    ]));
    expect(
      stored?.events.find(({ name }) => name === "offer_source_intelligence_completed")?.meta
    ).toEqual(expect.objectContaining({ durationMs: expect.any(Number) }));

    const projected = toPublicSession(stored!);
    expect(projected.campaignOfferSource).toMatchObject({
      title: "RevvyAI Revenue Intelligence Platform",
      sourceHost: "6sense.com",
      intelligenceStatus: "ready"
    });
    expect(projected.campaignOfferSource).not.toHaveProperty("sourceUrl");
    expect(projected.sourceInsight?.premise).toContain("complete product platform");
  });

  it("records the first moment a brief becomes eligible for generation", async () => {
    const id = `generation-eligible-${Date.now()}`;
    ids.add(id);
    await putSession(campaignSession(id));

    await patchSessionAnswers(id, {
      promotedOffer: "Revenue Intelligence Platform",
      audience: "Revenue operations leaders",
      objective: "Launch or announce"
    });
    await patchSessionAnswers(id, { customAudience: "Revenue systems leaders" });

    const stored = await getSession(id);
    const eligibilityEvents = stored?.events.filter(({ name }) => name === "generation_eligible");
    expect(eligibilityEvents).toHaveLength(2);
    expect(eligibilityEvents?.[0]?.meta).toEqual(expect.objectContaining({
      trigger: "answers",
      revision: 2
    }));
    expect(eligibilityEvents?.[1]?.meta).toEqual(expect.objectContaining({
      trigger: "answers",
      revision: 3,
      remainingMs: expect.any(Number)
    }));
  });

  it("discards a superseded extraction and keeps only intelligence for the latest URL", async () => {
    const id = `offer-intelligence-stale-${Date.now()}`;
    const firstUrl = "https://example.com/products/old-offer";
    const secondUrl = "https://example.com/products/new-offer";
    ids.add(id);
    await putSession(campaignSession(id));
    await patchSessionAnswers(id, { offerSourceUrl: firstUrl });

    let resolveFirst!: (value: ReturnType<typeof artifact>) => void;
    const firstResult = new Promise<ReturnType<typeof artifact>>((resolve) => {
      resolveFirst = resolve;
    });
    sourceMocks.fetchPublicUrlSourceArtifact.mockImplementation((url: string) =>
      url === firstUrl
        ? firstResult
        : Promise.resolve(artifact(secondUrl, "New Offer Platform"))
    );

    const firstRun = runSourceIntelligenceStage(id);
    await vi.waitFor(async () => {
      expect((await getSession(id))?.campaignOfferSource?.intelligenceStatus).toBe("researching");
    });
    await patchSessionAnswers(id, { offerSourceUrl: secondUrl });
    await runSourceIntelligenceStage(id);
    resolveFirst(artifact(firstUrl, "Old Offer Platform"));
    await firstRun;

    const stored = await getSession(id);
    expect(stored?.answers.offerSourceUrl).toBe(secondUrl);
    expect(stored?.answers.offerSourceTitle).toBe("New Offer Platform");
    expect(stored?.answers.promotedOffer).toBe("New Offer Platform");
    expect(stored?.sourceArtifact?.source.sourceUrl).toBe(secondUrl);
    expect(stored?.campaignOfferSource?.intelligenceStatus).toBe("ready");
  });

  it("extracts an ABM product page before the product objective is committed", async () => {
    const id = `abm-product-intelligence-${Date.now()}`;
    const sourceUrl = "https://example.com/products/governed-platform";
    ids.add(id);
    await putSession(abmSession(id));
    await patchSessionAnswers(id, { sourceUrl });
    sourceMocks.fetchPublicUrlSourceArtifact.mockResolvedValue(
      artifact(sourceUrl, "Governed Platform")
    );

    await runSourceIntelligenceStage(id);

    const stored = await getSession(id);
    expect(stored?.sourceArtifact?.content.title).toBe("Governed Platform");
    expect(stored?.answers.sourceTitle).toBe("Governed Platform");
    expect(stored?.sourceConfirmation).toMatchObject({
      status: "confirmed",
      sourceKind: "public-url",
      provenance: "system-extracted"
    });
    expect(stored?.events.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "source_intelligence_started",
      "source_intelligence_completed"
    ]));
    expect(stored?.stages.story.status).toBe("pending");
  });
});
