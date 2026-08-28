import { describe, expect, it } from "vitest";

import { buildAudienceRecommendations } from "@/lib/generation/audience-recommendations";
import { recommendObjectiveCtas } from "@/lib/generation/objective-cta-recommendations";
import type { OfferDiscoveryPageGraph } from "@/lib/research/offer-evidence";
import { extractOfferEvidence } from "@/lib/research/offer-evidence";
import { rankOfferRecommendations } from "@/lib/research/offer-recommendations";
import type { BrandProfile, SessionEvidenceItem } from "@/lib/types";

const generatedAt = "2026-08-28T12:00:00.000Z";
const ADVISORY_ORIGIN = "https://seller.example";

function advisoryDiscoveryGraph(includeDetails = true): OfferDiscoveryPageGraph {
  const pages = [
    {
      url: `${ADVISORY_ORIGIN}/`,
      html: `<!doctype html><html><body>
        <nav><a href="/advisory-services/">Services</a><a href="/about/">About</a></nav>
        <h1>Plan for Every Opportunity</h1>
        <h2>The Latest from Our Firm</h2>
        <h2>Account for Anything</h2>
      </body></html>`
    },
    {
      url: `${ADVISORY_ORIGIN}/advisory-services/`,
      html: `<!doctype html><html><body>
        <h1>Advisory Services</h1>
        <a href="/cfo-advisory-services/">Learn more</a>
        <a href="/client-accounting-services/">Explore</a>
      </body></html>`
    }
  ];
  if (includeDetails) {
    pages.push(
      {
        url: `${ADVISORY_ORIGIN}/cfo-advisory-services/`,
        html: `<!doctype html><html><body><h1>CFO Advisory Services</h1></body></html>`
      },
      {
        url: `${ADVISORY_ORIGIN}/client-accounting-services/`,
        html: `<!doctype html><html><body><h1>Client Accounting and Advisory Services</h1></body></html>`
      }
    );
  }
  return { origin: ADVISORY_ORIGIN, pages };
}

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
    source: "brand-harvester",
    ...overrides
  };
}

function evidenceItem(
  overrides: Partial<SessionEvidenceItem> &
    Pick<SessionEvidenceItem, "id" | "text" | "sourceUrl">
): SessionEvidenceItem {
  return {
    type: "public-focus-area",
    label: "Public focus area",
    signals: overrides.text.split(/\s+/).slice(0, 5),
    disposition: "available",
    entityRole: "seller",
    confidence: "high",
    ...overrides
  };
}

describe("ten-point regression fixtures", () => {
  it("extracts distinct accounting advisory offers without company-specific branches", () => {
    const seller = profile({
      domain: "seller.example",
      companyName: "Fixture Seller",
      description:
        "A business advisory, tax, and accounting firm serving growing companies and owner-led businesses.",
      publicTopics: []
    });
    const extracted = extractOfferEvidence({
      brand: seller,
      motion: "solution",
      discoveryPages: advisoryDiscoveryGraph(true)
    });
    const ranked = rankOfferRecommendations({
      revision: 21,
      motion: "solution",
      evidence: extracted
    });

    expect(ranked.presentation.mode).toBe("recommendations");
    expect(
      ranked.candidates.filter(({ recommendationKind }) => recommendationKind === "evidence-backed")
    ).toHaveLength(3);
    expect(new Set(ranked.candidates.map(({ label }) => label)).size).toBe(3);
    expect(ranked.candidates.map(({ label }) => label)).toEqual(
      expect.arrayContaining([
        "Advisory Services",
        "Client Accounting and Advisory Services",
        "CFO Advisory Services"
      ])
    );
  });

  it("recommends finance buyers for accounting advisory offers, not generic AI defaults", () => {
    const seller = profile({
      domain: "seller.example",
      companyName: "Fixture Seller",
      description:
        "A business advisory, tax, and accounting firm serving growing companies and owner-led businesses.",
      publicTopics: ["Advisory Services", "CFO Advisory Services"]
    });
    const artifact = buildAudienceRecommendations({
      sessionId: "accounting-advisory",
      revision: 22,
      activeRevision: 22,
      route: "generic-campaign",
      seller,
      offerLabel: "CFO Advisory Services",
      evidenceItems: [
        evidenceItem({
          id: "cfo-advisory",
          text: "CFO Advisory Services serves growing companies, owner-led businesses, and companies navigating growth or transition.",
          sourceUrl: "https://seller.example/cfo-advisory-services/"
        }),
        evidenceItem({
          id: "finance-leaders",
          text: "Finance leaders and controllers evaluating outsourced accounting and CFO advisory support",
          sourceUrl: "https://seller.example/client-accounting-services/"
        }),
        evidenceItem({
          id: "business-owners",
          text: "Business owners navigating growth, transition, and financial reporting decisions",
          sourceUrl: "https://seller.example/about/"
        })
      ],
      generatedAt
    });

    expect(artifact.status).toBe("complete");
    expect(artifact.value?.presentation.mode).toBe("recommendations");
    const buyerRoles = artifact.value?.candidates.map(({ buyerRole }) => buyerRole) ?? [];
    expect(buyerRoles.some((role) => /finance|accounting|cfo|controller|business owner/i.test(role))).toBe(
      true
    );
    expect(buyerRoles).not.toContain("Data and AI leaders");
    expect(buyerRoles).not.toContain("Platform and architecture leaders");
    expect(
      artifact.value?.candidates.every(({ buyerJob }) => buyerJob.includes("CFO Advisory Services"))
    ).toBe(true);
  });

  it("keeps ADP-like payroll evidence on HR and payroll buyers", () => {
    const seller = profile({
      domain: "seller.example",
      companyName: "Fixture Seller",
      description: "Payroll, HR, and workforce management for employers.",
      publicTopics: ["RUN Powered Payroll", "Workforce Now", "HR compliance"]
    });
    const offerRanked = rankOfferRecommendations({
      revision: 23,
      motion: "product",
      evidence: extractOfferEvidence({
        brand: seller,
        motion: "product",
        evidenceItems: [
          evidenceItem({
            id: "run-payroll",
            text: "RUN Powered Payroll helps small businesses manage payroll and tax compliance.",
            sourceUrl: "https://seller.example/payroll/run/"
          }),
          evidenceItem({
            id: "workforce-now",
            text: "Workforce Now supports mid-market HR, payroll, and talent decisions.",
            sourceUrl: "https://seller.example/workforce-now/"
          })
        ]
      })
    });
    const audience = buildAudienceRecommendations({
      sessionId: "adp-like",
      revision: 23,
      activeRevision: 23,
      route: "generic-campaign",
      seller,
      offerLabel: "RUN Powered Payroll",
      evidenceItems: [
        evidenceItem({
          id: "payroll-admin",
          text: "Payroll administrators managing multi-state payroll compliance",
          sourceUrl: "https://seller.example/payroll/"
        }),
        evidenceItem({
          id: "hr-leaders",
          text: "HR leaders improving workforce planning and talent decisions",
          sourceUrl: "https://seller.example/hr/"
        })
      ],
      generatedAt
    });

    expect(offerRanked.presentation.mode).toBe("recommendations");
    expect(offerRanked.candidates.map(({ label }) => label)).toEqual(
      expect.arrayContaining(["RUN Powered Payroll", "Workforce Now"])
    );
    expect(audience.value?.candidates.map(({ buyerRole }) => buyerRole)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/payroll administrators/i),
        expect.stringMatching(/hr leaders/i)
      ])
    );
  });

  it("keeps Jabra-like product evidence on product buyers", () => {
    const seller = profile({
      domain: "seller.example",
      companyName: "Fixture Seller",
      description: "Professional headsets, speakerphones, and video conferencing devices.",
      publicTopics: ["Evolve2 75", "Panacast 50", "Speak 750"]
    });
    const offers = rankOfferRecommendations({
      revision: 24,
      motion: "product",
      evidence: extractOfferEvidence({
        brand: seller,
        motion: "product",
        evidenceItems: [
          evidenceItem({
            id: "evolve",
            text: "Evolve2 75 wireless headset for hybrid work and open offices",
            sourceUrl: "https://seller.example/headsets/evolve2-75/"
          }),
          evidenceItem({
            id: "panacast",
            text: "Panacast 50 video bar for meeting room collaboration",
            sourceUrl: "https://seller.example/video/panacast-50/"
          })
        ]
      })
    });
    const audience = buildAudienceRecommendations({
      sessionId: "jabra-like",
      revision: 24,
      activeRevision: 24,
      route: "generic-campaign",
      seller,
      offerLabel: "Evolve2 75",
      evidenceItems: [
        evidenceItem({
          id: "it-buyers",
          text: "IT and collaboration leaders evaluating headset and video device standards",
          sourceUrl: "https://seller.example/business/"
        }),
        evidenceItem({
          id: "workplace",
          text: "Workplace experience managers improving hybrid meeting quality",
          sourceUrl: "https://seller.example/workplace/"
        })
      ],
      generatedAt
    });

    expect(offers.presentation.mode).toBe("recommendations");
    expect(offers.candidates.map(({ label }) => label)).toEqual(
      expect.arrayContaining(["Evolve2 75", "Panacast 50"])
    );
    expect(audience.value?.presentation.mode).toBe("recommendations");
    expect(audience.value?.candidates.map(({ buyerRole }) => buyerRole)).not.toContain(
      "Data and AI leaders"
    );
  });

  it("falls back to freeform-with-url when evidence is sparse", () => {
    const sparseSeller = profile({
      domain: "sparse.example",
      companyName: "Sparse Seller",
      source: "fallback",
      description: undefined,
      publicContext: undefined,
      publicTopics: []
    });
    const offers = rankOfferRecommendations({
      revision: 25,
      motion: "solution",
      evidence: extractOfferEvidence({
        brand: sparseSeller,
        motion: "solution"
      })
    });
    const audience = buildAudienceRecommendations({
      sessionId: "sparse",
      revision: 25,
      activeRevision: 25,
      route: "generic-campaign",
      seller: sparseSeller,
      generatedAt
    });

    expect(offers.presentation).toEqual({
      mode: "freeform-with-url",
      candidateIds: [],
      showFreeform: true,
      showSourceUrl: true
    });
    expect(audience.value?.presentation).toEqual({
      mode: "freeform-with-url",
      candidateIds: [],
      showFreeform: true,
      showSourceUrl: true
    });
  });

  it("keeps three distinct objective action families per motion", () => {
    const artifact = recommendObjectiveCtas({
      sessionId: "objective-families",
      revision: 26,
      activeRevision: 26,
      motion: "campaign",
      startedAt: generatedAt,
      completedAt: generatedAt
    });
    const families = artifact.value?.candidates.map(({ actionFamily }) => actionFamily) ?? [];

    expect(new Set(families)).toEqual(new Set(["evaluate", "engage", "offer-specific"]));
    expect(artifact.value?.candidates.map(({ cta }) => cta.type)).toEqual([
      "explore",
      "book-meeting",
      "download"
    ]);
  });
});
