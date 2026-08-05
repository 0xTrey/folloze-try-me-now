import { describe, expect, it } from "vitest";

import {
  createSourceArtifact,
  sourceArtifactSchema,
  sourceArtifactToPublicContentEvidence
} from "@/lib/content-intelligence";

function citedArtifact() {
  return createSourceArtifact({
    source: {
      kind: "public-url",
      mediaType: "text/html",
      sourceUrl: "https://example.com/guide",
      finalUrl: "https://example.com/guide"
    },
    extraction: {
      method: "html-static",
      status: "complete",
      truncated: false,
      ocr: {
        status: "not-required",
        pageNumbers: [],
        reason: "OCR does not apply to HTML sources."
      },
      warnings: []
    },
    content: {
      title: "AI Workflow Governance Guide",
      description: "Data and AI leaders need governed workflows that connect models to measurable operating outcomes.",
      text: [
        "Data and AI leaders need governed workflows that connect models to measurable operating outcomes.",
        "Research found that 68 percent of teams cannot trace an AI recommendation into a governed action.",
        "Teams should connect model evidence, workflow decisions, and outcome measurement in one operating path."
      ].join(" "),
      sections: [
        {
          id: "section_1",
          title: "The governance gap",
          level: 1,
          order: 0,
          text: "Data and AI leaders need governed workflows that connect models to measurable operating outcomes. Research found that 68 percent of teams cannot trace an AI recommendation into a governed action.",
          citationIds: ["citation_1"]
        },
        {
          id: "section_2",
          title: "An operating path",
          level: 2,
          order: 1,
          text: "Teams should connect model evidence, workflow decisions, and outcome measurement in one operating path.",
          citationIds: ["citation_2"]
        }
      ],
      links: [],
      assets: [],
      citations: [
        {
          id: "citation_1",
          locator: {
            kind: "url-block",
            block: 1,
            label: "The governance gap",
            sourceUrl: "https://example.com/guide"
          },
          excerpt: "Research found that 68 percent of teams cannot trace an AI recommendation into a governed action."
        },
        {
          id: "citation_2",
          locator: {
            kind: "url-block",
            block: 2,
            label: "An operating path",
            sourceUrl: "https://example.com/guide"
          },
          excerpt: "Teams should connect model evidence, workflow decisions, and outcome measurement."
        }
      ]
    },
    createdAt: "2026-08-04T12:00:00.000Z"
  });
}

describe("source artifact contract", () => {
  it("is versioned, deterministic, and validates the complete understanding receipt", () => {
    const first = citedArtifact();
    const second = citedArtifact();

    expect(sourceArtifactSchema.parse(first)).toEqual(first);
    expect(first.version).toBe(1);
    expect(first.artifactId).toBe(second.artifactId);
    expect(first.digest).toBe(second.digest);
    expect(first.understanding.claims.some((claim) => claim.kind === "metric")).toBe(true);
    expect(first.understanding.audiences.map((audience) => audience.name)).toEqual(
      expect.arrayContaining(["Data and AI leaders"])
    );
    expect(first.understanding.claims.every((claim) => claim.citationIds.length > 0)).toBe(true);
  });

  it("adapts into the current PublicContentEvidence shape without changing generation callers", () => {
    const artifact = citedArtifact();
    const evidence = sourceArtifactToPublicContentEvidence(artifact);

    expect(evidence).toEqual(expect.objectContaining({
      sourceUrl: "https://example.com/guide",
      title: "AI Workflow Governance Guide",
      description: expect.stringContaining("governed workflows"),
      excerpt: expect.stringContaining("68 percent")
    }));
  });
});

