import { describe, expect, it } from "vitest";

import type { ProductionArtifact } from "../orchestration/worker-types";
import {
  buildCompanyResearchArtifact,
  type CompanyResearchBrief,
  type CompanyResearchField,
  type CompanyResearchSourceAuthority,
  type NormalizedCompanyEvidence
} from "./company-research";

const NOW = new Date("2026-08-22T18:00:00.000Z");
const STARTED_AT = "2026-08-22T17:59:50.000Z";

function evidence(
  id: string,
  field: CompanyResearchField,
  value: string,
  options: {
    revision?: number;
    confidence?: number;
    authority?: CompanyResearchSourceAuthority;
    observedAt?: string;
  } = {}
): NormalizedCompanyEvidence {
  return {
    id,
    revision: options.revision ?? 7,
    field,
    value,
    confidence: options.confidence ?? 0.9,
    source: {
      authority: options.authority ?? "company-official-site",
      url: `https://example.com/evidence/${id}`,
      title: `Official source ${id}`,
      observedAt: options.observedAt ?? "2026-08-20T12:00:00.000Z"
    }
  };
}

function build(
  items: readonly NormalizedCompanyEvidence[],
  overrides: Partial<Parameters<typeof buildCompanyResearchArtifact>[0]> = {}
) {
  return buildCompanyResearchArtifact({
    sessionId: "session-1",
    revision: 7,
    activeRevision: 7,
    evidence: items,
    startedAt: STARTED_AT,
    now: () => NOW,
    ...overrides
  });
}

describe("buildCompanyResearchArtifact", () => {
  it("returns a typed company, category, and positioning brief with official provenance", () => {
    const artifact: ProductionArtifact<CompanyResearchBrief> = build([
      evidence("company-1", "company", "Builds buyer experience software."),
      evidence("category-1", "category", "Buyer experience platform", {
        confidence: 0.88,
        authority: "company-official-resource"
      }),
      evidence("positioning-1", "positioning", "Helps revenue teams engage buying groups.", {
        confidence: 0.84,
        authority: "visitor-supplied-official"
      })
    ]);

    expect(artifact.status).toBe("complete");
    expect(artifact.worker).toBe("company-researcher");
    expect(artifact.evidenceRefs).toEqual(["company-1", "category-1", "positioning-1"]);
    expect(artifact.value?.claims.category).toEqual({
      value: "Buyer experience platform",
      evidenceRef: "category-1",
      confidence: 0.88,
      revision: 7,
      provenance: {
        authority: "company-official-resource",
        url: "https://example.com/evidence/category-1",
        title: "Official source category-1",
        observedAt: "2026-08-20T12:00:00.000Z",
        official: true
      }
    });
    expect(Object.values(artifact.value?.claims ?? {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidenceRef: "company-1", confidence: 0.9, revision: 7 }),
        expect.objectContaining({ evidenceRef: "category-1", confidence: 0.88, revision: 7 }),
        expect.objectContaining({ evidenceRef: "positioning-1", confidence: 0.84, revision: 7 })
      ])
    );
    expect(artifact.confidence).toBeCloseTo((0.9 + 0.88 + 0.84) / 3);
  });

  it("omits unsupported, malformed, and wrong-revision claims", () => {
    const artifact = build([
      evidence("unsupported-positioning", "positioning", "Market leader", {
        authority: "third-party"
      }),
      evidence("stale-company", "company", "Old description", { revision: 6 }),
      evidence("empty-category", "category", "   "),
      evidence("invalid-confidence", "company", "Unbounded confidence", { confidence: 1.1 })
    ]);

    expect(artifact.status).toBe("fallback");
    expect(artifact.value?.claims).toEqual({});
    expect(artifact.evidenceRefs).toEqual([]);
    expect(artifact.fallbackCode).toBe("NO_SUPPORTED_OFFICIAL_COMPANY_EVIDENCE");
  });

  it("resolves official-source conflicts by authority, freshness, and confidence", () => {
    const artifact = build([
      evidence("company-low", "company", "Company statement B", { confidence: 0.7 }),
      evidence("company-high", "company", "Company statement A", { confidence: 0.95 }),
      evidence("category-new-site", "category", "New site category", {
        confidence: 0.99,
        observedAt: "2026-08-22T00:00:00.000Z"
      }),
      evidence("category-visitor", "category", "Supplied official category", {
        confidence: 0.6,
        authority: "visitor-supplied-official",
        observedAt: "2026-08-01T00:00:00.000Z"
      }),
      evidence("positioning-old", "positioning", "Older position", {
        confidence: 0.99,
        observedAt: "2026-08-01T00:00:00.000Z"
      }),
      evidence("positioning-new", "positioning", "Current position", {
        confidence: 0.6,
        authority: "company-official-resource",
        observedAt: "2026-08-21T00:00:00.000Z"
      })
    ]);

    expect(artifact.value?.claims.company?.evidenceRef).toBe("company-high");
    expect(artifact.value?.claims.category?.evidenceRef).toBe("category-visitor");
    expect(artifact.value?.claims.positioning?.evidenceRef).toBe("positioning-new");
    expect(artifact.value?.conflicts).toEqual([
      expect.objectContaining({ field: "company", resolution: "confidence" }),
      expect.objectContaining({ field: "category", resolution: "authority" }),
      expect.objectContaining({ field: "positioning", resolution: "freshness" })
    ]);
  });

  it("uses evidence IDs as a stable final conflict tie-breaker", () => {
    const artifact = build([
      evidence("category-b", "category", "Category B"),
      evidence("category-a", "category", "Category A")
    ]);

    expect(artifact.value?.claims.category?.evidenceRef).toBe("category-a");
    expect(artifact.value?.conflicts).toEqual([
      {
        field: "category",
        selectedEvidenceRef: "category-a",
        supersededEvidenceRefs: ["category-b"],
        resolution: "stable_order"
      }
    ]);
  });

  it("returns current official evidence as a typed timeout fallback without filler", () => {
    const artifact = build(
      [evidence("category-before-timeout", "category", "Revenue orchestration")],
      { deadlineAt: NOW.getTime() }
    );

    expect(artifact.status).toBe("timed_out");
    expect(artifact.fallbackCode).toBe("COMPANY_RESEARCH_TIMEOUT_OFFICIAL_EVIDENCE");
    expect(artifact.value?.claims).toEqual({
      category: expect.objectContaining({
        value: "Revenue orchestration",
        evidenceRef: "category-before-timeout",
        revision: 7
      })
    });
    expect(artifact.value?.claims.company).toBeUndefined();
    expect(artifact.value?.claims.positioning).toBeUndefined();
  });

  it("returns an empty timeout fallback when no official evidence is supported", () => {
    const artifact = build(
      [evidence("third-party-only", "company", "Generic company copy", {
        authority: "third-party"
      })],
      { timedOut: true }
    );

    expect(artifact.status).toBe("timed_out");
    expect(artifact.value?.claims).toEqual({});
    expect(artifact.confidence).toBe(0);
    expect(artifact.fallbackCode).toBe("COMPANY_RESEARCH_TIMEOUT_NO_OFFICIAL_EVIDENCE");
  });

  it("marks a superseded request stale and exposes no value or evidence", () => {
    const artifact = build(
      [evidence("old-positioning", "positioning", "Old positioning")],
      { revision: 7, activeRevision: 8 }
    );

    expect(artifact).toEqual({
      worker: "company-researcher",
      sessionId: "session-1",
      revision: 7,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      startedAt: STARTED_AT,
      completedAt: NOW.toISOString(),
      errorCode: "STALE_COMPANY_RESEARCH_REVISION"
    });
    expect(artifact.value).toBeUndefined();
  });
});
