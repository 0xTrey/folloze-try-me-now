import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

const safeFetchMocks = vi.hoisted(() => ({
  fetchPinnedPublicText: vi.fn()
}));

vi.mock("@/lib/safe-fetch", () => safeFetchMocks);

import {
  fetchPublicUrlSourceArtifact,
  normalizePublicHtmlSource
} from "@/lib/content-url";

interface ExpectedArticleFixture {
  title: string;
  description: string;
  status: string;
  confidence: string;
  sectionTitles: string[];
  audiences: string[];
  nextAction: string;
  moduleKinds: string[];
}

async function articleFixture(): Promise<{ html: string; expected: ExpectedArticleFixture }> {
  const fixtureRoot = new URL("../../tests/fixtures/content-intelligence/", import.meta.url);
  const [html, expected] = await Promise.all([
    readFile(new URL("revenue-marketing-brief.html", fixtureRoot), "utf8"),
    readFile(new URL("revenue-marketing-expected.json", fixtureRoot), "utf8")
  ]);
  return { html, expected: JSON.parse(expected) as ExpectedArticleFixture };
}

afterEach(() => {
  safeFetchMocks.fetchPinnedPublicText.mockReset();
});

describe("public source content normalization", () => {
  it("turns a golden HTML article into a cited source artifact", async () => {
    const { html, expected } = await articleFixture();
    const artifact = normalizePublicHtmlSource({
      html,
      sourceUrl: "https://example.com/download?id=42",
      finalUrl: "https://example.com/research/revenue-marketing-gap",
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.content.title).toBe(expected.title);
    expect(artifact.content.description).toBe(expected.description);
    expect(artifact.status).toBe(expected.status);
    expect(artifact.confidence).toBe(expected.confidence);
    expect(artifact.source.finalUrl).toBe("https://example.com/research/revenue-marketing-gap");
    expect(artifact.content.sections.map((section) => section.title)).toEqual(expected.sectionTitles);
    expect(artifact.understanding.audiences.map((audience) => audience.name)).toEqual(
      expect.arrayContaining(expected.audiences)
    );
    expect(artifact.understanding.nextAction?.label).toBe(expected.nextAction);
    expect(artifact.understanding.experiencePlan.modules.map((module) => module.kind)).toEqual(
      expected.moduleKinds
    );
    expect(artifact.understanding.premise).toBe(expected.description);
    expect(artifact.understanding.claims.length).toBeGreaterThanOrEqual(3);
    expect(artifact.understanding.claims.every((claim) => claim.citationIds.length > 0)).toBe(true);
    expect(artifact.understanding.proof.some((proof) => /42 percent/i.test(proof.text))).toBe(true);
    expect(artifact.content.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "chart", confidence: "high" }),
      expect.objectContaining({ kind: "table", confidence: "high" })
    ]));
    expect(artifact.content.links.map((link) => link.url)).toContain("https://example.com/request-demo");
    expect(artifact.content.text).not.toMatch(/Copyright|Products Privacy/);
  });

  it("marks a byte-limited HTML extraction for review without losing its citations", async () => {
    const { html } = await articleFixture();
    const artifact = normalizePublicHtmlSource({
      html,
      sourceUrl: "https://example.com/research/revenue-marketing-gap",
      truncated: true,
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.status).toBe("needs-review");
    expect(artifact.extraction.status).toBe("partial");
    expect(artifact.extraction.truncated).toBe(true);
    expect(artifact.content.citations.length).toBeGreaterThan(2);
  });

  it("keeps invalid or private URLs behind the protected fetch boundary", async () => {
    safeFetchMocks.fetchPinnedPublicText.mockRejectedValue(new Error("Private URL rejected"));
    const artifact = await fetchPublicUrlSourceArtifact("http://127.0.0.1/internal", {
      timeoutMs: 20,
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.status).toBe("failed");
    expect(artifact.diagnostics.failureCode).toBe("public_source_fetch_failed");
    expect(artifact.content.text).toBe("");
    expect(artifact.source.sourceUrl).toBeUndefined();
  });

  it("preserves a submitted source URL separately from its canonical redirect", async () => {
    safeFetchMocks.fetchPinnedPublicText.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      text: "<main><h1>Product overview</h1><p>A detailed product overview for buyers evaluating the platform and its operating model.</p></main>",
      finalUrl: new URL("https://example.com/platform/overview"),
      truncated: false
    });

    const artifact = await fetchPublicUrlSourceArtifact("https://example.com/platform");

    expect(artifact.source.sourceUrl).toBe("https://example.com/platform");
    expect(artifact.source.finalUrl).toBe("https://example.com/platform/overview");
  });
});
