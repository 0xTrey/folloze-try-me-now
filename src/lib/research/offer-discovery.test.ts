import { describe, expect, it } from "vitest";

import {
  discoverOfferEvidenceFromPages,
  type OfferDiscoveryPageGraph
} from "@/lib/research/offer-discovery";
import { extractOfferEvidence } from "@/lib/research/offer-evidence";
import { rankOfferRecommendations } from "@/lib/research/offer-recommendations";

const ORIGIN = "https://advisory-firm.example";

function page(url: string, body: string): { url: string; html: string } {
  return {
    url: `${ORIGIN}${url}`,
    html: `<!doctype html><html><head><title>Advisory Firm</title></head><body>${body}</body></html>`
  };
}

const homepage = page(
  "/",
  `
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/advisory-services/">Services</a>
      <a href="/about/">About</a>
      <a href="/insights/">Insights</a>
    </nav>
  </header>
  <main>
    <h1>Plan for Every Opportunity</h1>
    <p>A business advisory, tax, and accounting firm serving growing companies.</p>
    <section>
      <h2>The Latest from Advisory Firm</h2>
      <a href="/insights/growth/">Read the latest growth outlook</a>
    </section>
    <section>
      <h2>Account for Anything</h2>
      <p>Tagline content that should not become an offer chip.</p>
    </section>
  </main>
`
);

const advisoryIndex = page(
  "/advisory-services/",
  `
  <nav>
    <a href="/advisory-services/">Services</a>
    <a href="/about/">About</a>
  </nav>
  <main>
    <h1>Advisory Services</h1>
    <p>Strategic, financial, people, technology, and risk focus areas for growing businesses.</p>
    <ul>
      <li><a href="/cfo-advisory-services/">Learn more</a></li>
      <li><a href="/client-accounting-services/">Explore</a></li>
    </ul>
  </main>
`
);

const cfoDetail = page(
  "/cfo-advisory-services/",
  `
  <main>
    <h1>CFO Advisory Services</h1>
    <p>Serves growing companies, owner-led businesses, and companies navigating growth or transition.</p>
  </main>
`
);

const clientAccountingDetail = page(
  "/client-accounting-services/",
  `
  <main>
    <h1>Client Accounting and Advisory Services</h1>
    <p>Includes CFO advisory, outsourced accounting, HR/payroll outsourcing, and industry-specific accounting services.</p>
  </main>
`
);

function fullGraph(): OfferDiscoveryPageGraph {
  return {
    origin: ORIGIN,
    pages: [homepage, advisoryIndex, cfoDetail, clientAccountingDetail]
  };
}

function indexOnlyGraph(): OfferDiscoveryPageGraph {
  return {
    origin: ORIGIN,
    pages: [homepage, advisoryIndex]
  };
}

describe("discoverOfferEvidenceFromPages", () => {
  it("extracts distinct advisory service labels from homepage, index, and detail pages", () => {
    const evidence = discoverOfferEvidenceFromPages({
      motion: "solution",
      graph: fullGraph()
    });
    const ranked = rankOfferRecommendations({
      revision: 31,
      motion: "solution",
      evidence
    });

    const labels = evidence.map(({ label }) => label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Advisory Services",
        "CFO Advisory Services",
        "Client Accounting and Advisory Services"
      ])
    );
    expect(new Set(labels).size).toBeGreaterThanOrEqual(3);
    expect(labels).not.toContain("Plan for Every Opportunity");
    expect(labels).not.toContain("Account for Anything");
    expect(labels.some((label) => /the latest from/i.test(label))).toBe(false);
    expect(ranked.presentation.mode).toBe("recommendations");
    expect(
      ranked.candidates.filter(({ recommendationKind }) => recommendationKind === "evidence-backed")
    ).toHaveLength(3);
  });

  it("falls back to freeform-with-url when detail pages are removed", () => {
    const evidence = discoverOfferEvidenceFromPages({
      motion: "solution",
      graph: indexOnlyGraph()
    });
    const ranked = rankOfferRecommendations({
      revision: 32,
      motion: "solution",
      evidence
    });

    expect(evidence.map(({ label }) => label)).toEqual(["Advisory Services"]);
    expect(ranked.presentation).toEqual({
      mode: "freeform-with-url",
      candidateIds: [],
      showFreeform: true,
      showSourceUrl: true
    });
  });

  it("respects explicit page and link budgets", () => {
    const evidence = discoverOfferEvidenceFromPages({
      motion: "solution",
      graph: fullGraph(),
      maxPages: 2,
      maxLinks: 4
    });

    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.length).toBeLessThanOrEqual(4);
  });

  it("ignores cross-origin pages in the graph", () => {
    const evidence = discoverOfferEvidenceFromPages({
      motion: "solution",
      graph: {
        origin: ORIGIN,
        pages: [
          ...fullGraph().pages,
          {
            url: "https://other.example/services/",
            html: "<main><h1>Foreign Advisory Services</h1></main>"
          }
        ]
      }
    });

    expect(evidence.map(({ label }) => label)).not.toContain("Foreign Advisory Services");
  });

  it("integrates through extractOfferEvidence when discovery pages are supplied", () => {
    const evidence = extractOfferEvidence({
      motion: "solution",
      discoveryPages: fullGraph()
    });

    expect(evidence.length).toBeGreaterThanOrEqual(2);
    expect(evidence.map(({ label }) => label)).toEqual(
      expect.arrayContaining(["Advisory Services", "CFO Advisory Services"])
    );
  });
});

describe("harvestOfferDiscoveryGraph", () => {
  it("builds a bounded graph from homepage and offer-path detail pages", async () => {
    const { harvestOfferDiscoveryGraph } = await import("@/lib/research/offer-discovery");
    const pages = new Map(
      fullGraph().pages.map((entry) => [entry.url, entry])
    );

    const graph = await harvestOfferDiscoveryGraph({
      origin: ORIGIN,
      budget: { maxPages: 4, maxLinks: 8, maxLabels: 12 },
      fetchPage: async (url) => pages.get(url)
    });

    expect(graph?.pages.length).toBeGreaterThanOrEqual(3);
    const evidence = extractOfferEvidence({
      motion: "solution",
      discoveryPages: graph
    });
    expect(evidence.map(({ label }) => label)).toEqual(
      expect.arrayContaining([
        "Advisory Services",
        "CFO Advisory Services",
        "Client Accounting and Advisory Services"
      ])
    );
  });

  it("rejects an off-host redirect result before it enters the discovery graph", async () => {
    const { harvestOfferDiscoveryGraph } = await import("@/lib/research/offer-discovery");
    const graph = await harvestOfferDiscoveryGraph({
      origin: ORIGIN,
      fetchPage: async () => ({
        url: "https://other.example/advisory-services/",
        html: "<main><h1>Foreign Advisory Services</h1></main>"
      })
    });

    expect(graph).toBeUndefined();
  });

  it("rejects same-host protocol downgrade and alternate-port results", async () => {
    const { harvestOfferDiscoveryGraph } = await import("@/lib/research/offer-discovery");
    for (const redirectedUrl of [
      "http://advisory-firm.example/advisory-services/",
      "https://advisory-firm.example:8443/advisory-services/"
    ]) {
      const graph = await harvestOfferDiscoveryGraph({
        origin: ORIGIN,
        fetchPage: async () => ({
          url: redirectedUrl,
          html: "<main><h1>Untrusted Advisory Services</h1></main>"
        })
      });
      expect(graph).toBeUndefined();
    }
  });

  it("allows an explicitly submitted official subdomain but fences discovery to that host", async () => {
    const { harvestOfferDiscoveryGraph } = await import("@/lib/research/offer-discovery");
    const sourceUrl = "https://services.advisory-firm.example/cfo-advisory-services/";
    const graph = await harvestOfferDiscoveryGraph({
      origin: ORIGIN,
      sourceUrl,
      fetchPage: async (url) =>
        url === sourceUrl
          ? {
              url,
              html: '<main><h1>CFO Advisory Services</h1><a href="https://other.example/services/">Other</a></main>'
            }
          : undefined
    });

    expect(graph?.origin).toBe(sourceUrl);
    expect(graph?.pages.map(({ url }) => url)).toEqual([sourceUrl]);
  });
});
