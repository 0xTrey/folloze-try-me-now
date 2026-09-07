import { describe, expect, it } from "vitest";

import { createSourceArtifact, type SourceArtifact } from "@/lib/content-intelligence";
import {
  createSectionModelClient,
  type SectionWriterProvider,
  type SectionWriterRequest
} from "@/lib/integrations/openai-section-writer";
import { buildFlowBenchmarkFixtures } from "./build-flow-benchmark-fixtures";
import { compileSessionProductionPage } from "./session-production-engine";

type ProviderCall = { request: SectionWriterRequest; input: Record<string, unknown> };

function recordingProvider(calls: ProviderCall[]): SectionWriterProvider {
  return {
    async parse(request) {
      calls.push({ request, input: JSON.parse(request.input) as Record<string, unknown> });
      // The production candidate boundary deliberately returns to its
      // deterministic writer. This fixture exercises the actual request cache
      // without teaching the transport to generate unsupported copy.
      return { output_parsed: {
        candidates: [{
          eyebrow: null, headline: null, body: null, choices: null, ctaId: null,
          evidenceRefs: [], omit: true, omissionReason: "no_current_evidence"
        }]
      } };
    }
  };
}

function productFixture(sessionId: string) {
  const fixture = buildFlowBenchmarkFixtures.find(({ id }) =>
    id.endsWith("saas-product-governed-approvals")
  );
  if (!fixture) throw new Error("product_cache_fixture_missing");
  const brief = structuredClone(fixture.brief);
  brief.session.id = sessionId;
  brief.session.revision = 1;
  brief.session.temporaryUrl = `https://example.test/e/${sessionId}`;
  return brief;
}

function productSource(input: { domain: string; offer: string; detail: string }): SourceArtifact {
  const claim = `${input.offer} ${input.detail}`;
  const sourceUrl = `https://${input.domain}/offers/governed-approvals`;
  const artifact = createSourceArtifact({
    source: { kind: "public-url", sourceUrl, finalUrl: sourceUrl, mediaType: "text/html" },
    extraction: {
      method: "html-static", status: "complete", truncated: false,
      ocr: { status: "not-required", pageNumbers: [], reason: "HTML fixture." }, warnings: []
    },
    content: {
      title: input.offer,
      text: claim,
      sections: [{ id: "capabilities", title: "Capabilities", level: 1, order: 0, text: claim, citationIds: ["capability-citation"] }],
      links: [], assets: [],
      citations: [{ id: "capability-citation", locator: { kind: "url-block", block: 1, label: "Capabilities", sourceUrl }, excerpt: claim }]
    }
  });
  return {
    ...artifact,
    status: "ready",
    confidence: "high",
    understanding: {
      ...artifact.understanding,
      claims: [{ id: "capability-claim", text: claim, kind: "claim", confidence: "high", citationIds: ["capability-citation"] }],
      proof: []
    }
  };
}

async function compile(brief: ReturnType<typeof productFixture>, client: ReturnType<typeof createSectionModelClient>, currentTimeMs = 10_000) {
  return compileSessionProductionPage({
    session: brief.session,
    brand: brief.brand,
    targetBrand: brief.targetBrand,
    providerStartedAtMs: 0,
    currentTimeMs,
    sectionModelClient: { writeSection: client.writeSection }
  });
}

function sectionIds(calls: readonly ProviderCall[]): string[] {
  return calls.map(({ input }) => String(input.sectionId));
}

describe("production section cache isolation", () => {
  it("reuses unchanged same-session sections, invalidates CTA owners, and keeps middle evidence cached", async () => {
    const calls: ProviderCall[] = [];
    const client = createSectionModelClient({ provider: recordingProvider(calls), cacheResponses: true });
    const brief = productFixture("cache-flow-cta");

    const first = await compile(brief, client);
    expect(first.outcome).toBe("production-page");
    const firstCalls = [...calls];
    expect(firstCalls.length).toBeGreaterThan(3);

    brief.session.revision += 1;
    brief.session.answers.ctaType = "download";
    const second = await compile(brief, client);
    const ctaMisses = calls.slice(firstCalls.length);

    expect(second.outcome).toBe("production-page");
    expect(second.buyerReadyPerformance?.cachedSections).toBeGreaterThan(0);
    expect(ctaMisses.length).toBeGreaterThan(0);
    const actionOwners = new Set(firstCalls
      .filter(({ input }) => input.ctaOffer !== undefined)
      .map(({ input }) => String(input.sectionId)));
    expect(actionOwners.size).toBeGreaterThan(0);
    expect(sectionIds(ctaMisses).every((id) => actionOwners.has(id))).toBe(true);
    expect(sectionIds(firstCalls).some((id) => !actionOwners.has(id))).toBe(true);
  });

  it("invalidates source-detail owners while retaining unrelated same-session cached sections", async () => {
    const calls: ProviderCall[] = [];
    const client = createSectionModelClient({ provider: recordingProvider(calls), cacheResponses: true });
    const brief = productFixture("cache-flow-source");
    const offer = brief.session.answers.promotedOffer!;
    brief.session.sourceArtifact = productSource({
      domain: brief.brand.domain,
      offer,
      detail: "routes exceptions to a named reviewer and records the decision."
    });
    const first = await compile(brief, client);
    expect(first.outcome).toBe("production-page");
    const firstCalls = [...calls];

    brief.session.revision += 1;
    brief.session.sourceArtifact = productSource({
      domain: brief.brand.domain,
      offer,
      detail: "routes exceptions to a named escalation owner and records the review decision."
    });
    const second = await compile(brief, client);
    const sourceMisses = calls.slice(firstCalls.length);

    expect(second.outcome).toBe("production-page");
    expect(second.buyerReadyPerformance?.cachedSections).toBeGreaterThan(0);
    expect(sourceMisses.length).toBeGreaterThan(0);
    expect(sourceMisses.length).toBeLessThan(firstCalls.length);
    expect(sourceMisses.some(({ input }) =>
      (input.evidence as Array<{ id: string }>).some(({ id }) => id.startsWith("source:"))
    )).toBe(true);
  });

  it("never reuses a private section response across sessions", async () => {
    const calls: ProviderCall[] = [];
    const client = createSectionModelClient({ provider: recordingProvider(calls), cacheResponses: true });
    const first = productFixture("cache-flow-private-a");
    const second = productFixture("cache-flow-private-b");

    await compile(first, client);
    const afterFirst = calls.length;
    const result = await compile(second, client);

    expect(result.outcome).toBe("production-page");
    expect(calls.length).toBeGreaterThan(afterFirst);
    expect(result.buyerReadyPerformance?.cachedSections).toBe(0);
  });

  it("does not call a provider when the shared hard deadline is already closed", async () => {
    const calls: ProviderCall[] = [];
    const client = createSectionModelClient({ provider: recordingProvider(calls), cacheResponses: true });

    const result = await compile(productFixture("cache-flow-deadline"), client, 60_000);

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_PROVIDER_DEADLINE_REACHED", allowProviderWork: false }
    });
    expect(calls).toEqual([]);
  });
});
