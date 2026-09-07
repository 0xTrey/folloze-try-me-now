import { describe, expect, it, vi } from "vitest";

import { createSourceArtifact, type SourceArtifact } from "@/lib/content-intelligence";
import { buildFlowBenchmarkFixtures } from "./build-flow-benchmark-fixtures";
import type { SectionModelClient } from "./section-model-writer";
import type { SectionWritingContract } from "./section-writing-contract";
import { compileSessionProductionPage } from "./session-production-engine";

const sourceClaim =
  "The guide explains how teams document approval ownership before changing a workflow.";

function citedContentSource(
  kind: "public-url" | "uploaded-pdf" = "public-url",
  sourceUrl = "https://guides.example/approval-guide"
): SourceArtifact {
  const source = createSourceArtifact({
    source: kind === "uploaded-pdf"
      ? { kind, displayName: "approval-guide.pdf", mediaType: "application/pdf" }
      : { kind, sourceUrl, mediaType: "text/html" },
    extraction: {
      method: kind === "uploaded-pdf" ? "pdf-text" : "html-static",
      status: "complete",
      truncated: false,
      ocr: { status: "not-required", pageNumbers: [], reason: "Fixture source is text based." },
      warnings: []
    },
    content: {
      title: "Approval ownership guide",
      text: sourceClaim,
      sections: [{
        id: "source-section",
        title: "Approval ownership",
        level: 1,
        order: 0,
        text: sourceClaim,
        citationIds: ["source-citation"]
      }],
      links: [],
      assets: [],
      citations: [{
        id: "source-citation",
        locator: kind === "uploaded-pdf"
          ? { kind: "pdf-page", page: 1, label: "Approval ownership" }
          : { kind: "url-block", block: 1, label: "Approval ownership", sourceUrl },
        excerpt: sourceClaim
      }]
    }
  });
  return {
    ...source,
    status: "ready",
    confidence: "high",
    understanding: {
      ...source.understanding,
      claims: [{
        id: "source-claim",
        text: sourceClaim,
        kind: "claim",
        confidence: "high",
        citationIds: ["source-citation"]
      }],
      proof: []
    }
  };
}

function contentFixture() {
  const fixture = buildFlowBenchmarkFixtures.find(
    ({ id }) => id.endsWith("content-report-ai-governance")
  );
  if (!fixture) throw new Error("content_fixture_missing");
  const brief = structuredClone(fixture.brief);
  const source = citedContentSource();
  brief.session.sourceArtifact = source;
  brief.session.answers.sourceUrl = source.source.sourceUrl;
  return brief;
}

async function compileContent(
  client?: SectionModelClient,
  source: SourceArtifact = citedContentSource()
) {
  const brief = contentFixture();
  brief.session.sourceArtifact = source;
  if (source.source.kind === "public-url") {
    brief.session.answers.sourceUrl = source.source.finalUrl ?? source.source.sourceUrl;
  } else {
    brief.session.answers.sourceUrl = undefined;
  }
  return compileSessionProductionPage({
    session: brief.session,
    brand: brief.brand,
    targetBrand: brief.targetBrand,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000,
    ...(client ? { sectionModelClient: client } : {})
  });
}

async function compileSourceLedContent(client: SectionModelClient) {
  const brief = contentFixture();
  // This is deliberately a source-led build. Seller-side guide facts must not
  // be able to fill roles that the plan withholds from the source claim.
  brief.session.evidenceItems = [];
  return compileSessionProductionPage({
    session: brief.session,
    brand: brief.brand,
    targetBrand: brief.targetBrand,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000,
    sectionModelClient: client
  });
}

describe("build flow contract hardening", () => {
  it("keeps cited content in content-insight scope and never grants it capability or proof roles", async () => {
    const observed: SectionWritingContract[] = [];
    const result = await compileContent({
      writeSection: async (contract) => {
        observed.push(contract);
        return { sectionId: contract.sectionId, candidates: [] };
      }
    });

    expect(result.outcome).toBe("production-page");
    expect(result.buildPlan?.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "content-insight", claim: sourceClaim })
    ]));
    const contentRef = result.buildPlan?.claims.find(({ scope, claim }) =>
      scope === "content-insight" && claim === sourceClaim
    )?.id;
    expect(contentRef).toMatch(/^content:/);
    expect(observed).not.toHaveLength(0);
    for (const contract of observed) {
      expect(contract.buildDesign).toBeDefined();
      if (["proof", "proof-depth", "mechanism", "solution-mapping", "use-cases", "applications"].includes(contract.slot.role)) {
        expect(contract.evidenceRefs).not.toContain(contentRef);
      }
    }
  });

  it("blocks an incomplete content source before a writer can be called", async () => {
    const incomplete = citedContentSource();
    incomplete.extraction = { ...incomplete.extraction, truncated: true };
    const writeSection = vi.fn(async () => ({ sectionId: "unexpected", candidates: [] }));
    const writer = { writeSection } satisfies SectionModelClient;

    const result = await compileContent(writer, incomplete);

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_BUILD_QUALITY_REJECTED", allowProviderWork: false }
    });
    expect(writeSection).not.toHaveBeenCalled();
    expect(result.buildPlan?.readiness.reasonCodes).toContain("content_source_incomplete");
  });

  it("blocks a complete cited artifact when it belongs to a different selected source", async () => {
    const brief = contentFixture();
    brief.session.sourceArtifact = citedContentSource(
      "public-url",
      "https://other-guides.example/approval-guide"
    );
    const writeSection = vi.fn(async () => ({ sectionId: "unexpected", candidates: [] }));
    const result = await compileSessionProductionPage({
      session: brief.session,
      brand: brief.brand,
      targetBrand: brief.targetBrand,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: { writeSection }
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_BUILD_QUALITY_REJECTED", allowProviderWork: false }
    });
    expect(writeSection).not.toHaveBeenCalled();
    expect(result.buildPlan?.readiness.reasonCodes).toContain("content_source_incomplete");
    expect(result.buildPlan?.claims.some(({ id }) => id.startsWith("content:"))).toBe(false);
  });

  it("does not let off-offer corporate facts explain the selected product", async () => {
    const fixture = buildFlowBenchmarkFixtures.find(
      ({ id }) => id.endsWith("off-offer-corporate-positioning")
    );
    if (!fixture) throw new Error("off_offer_fixture_missing");
    const brief = structuredClone(fixture.brief);
    const writeSection = vi.fn(async () => ({ sectionId: "unexpected", candidates: [] }));
    const result = await compileSessionProductionPage({
      session: brief.session,
      brand: brief.brand,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: { writeSection }
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_BUILD_QUALITY_REJECTED", allowProviderWork: false }
    });
    expect(writeSection).not.toHaveBeenCalled();
    expect(result.buildPlan?.readiness.reasonCodes).toContain("offer_explanation_not_sourced");
  });

  it("keeps each writer contract plan-scoped, including empty scopes, and attaches its design dependency", async () => {
    const observed: SectionWritingContract[] = [];
    const result = await compileSourceLedContent({
      writeSection: async (contract) => {
        observed.push(contract);
        return { sectionId: contract.sectionId, candidates: [] };
      }
    });
    const planned = new Map(result.buildPlan?.sections.map((section) => [section.id, section]));

    for (const contract of observed) {
      const section = planned.get(contract.sectionId);
      expect(section).toBeDefined();
      expect(contract.evidenceRefs).toEqual(section?.claimRefs);
      expect(contract.buyerAssignment?.claimRefs).toEqual(section?.claimRefs);
      expect(contract.buildDesign?.dependencyDigest).toBe(section?.dependencyDigest);
    }
    expect(observed.some((contract) => contract.evidenceRefs.length === 0)).toBe(true);
  });

  it("never admits a page whose final quality policy fails", async () => {
    const baseline = await compileContent();
    if (baseline.outcome !== "production-page") throw new Error("baseline_page_missing");
    const originals = new Map(
      baseline.artifact.value!.sections.map((section) => [section.sectionId, section])
    );
    let changed = false;
    const result = await compileContent({
      writeSection: async (contract) => {
        const original = originals.get(contract.sectionId);
        if (!original) return { sectionId: contract.sectionId, candidates: [] };
        const eyebrow = !changed ? "Prohibited kicker" : original.eyebrow;
        changed = true;
        return {
          sectionId: contract.sectionId,
          candidates: [{
            headline: original.headline,
            body: original.body,
            ...(original.choices ? { choices: original.choices } : {}),
            ...(original.cta ? { cta: original.cta } : {}),
            ...(eyebrow ? { eyebrow } : {}),
            evidenceRefs: [...original.evidenceRefs]
          }]
        };
      }
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_BUILD_QUALITY_REJECTED" },
      buildQuality: { accepted: false, blockers: expect.arrayContaining(["prohibited_eyebrow"]) }
    });
  });

  it("uses a private uploaded-PDF source reference in the plan and nowhere in public output", async () => {
    const uploaded = citedContentSource("uploaded-pdf");
    const result = await compileContent(undefined, uploaded);
    const privateRef = `source-artifact:${uploaded.digest}`;

    expect(result.outcome).toBe("production-page");
    expect(result.buildPlan?.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRef: privateRef, scope: "content-insight" })
    ]));
    expect(JSON.stringify(result.buildPlanReceipt)).not.toContain(privateRef);
    if (result.outcome === "production-page") {
      expect(JSON.stringify(result.artifact.value)).not.toContain(privateRef);
    }
  });
});
