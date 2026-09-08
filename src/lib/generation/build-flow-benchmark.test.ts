import { describe, expect, it } from "vitest";

import { buildFlowBenchmarkFixtures } from "./build-flow-benchmark-fixtures";
import { runBuildFlowBenchmark } from "./build-flow-benchmark";

describe("build-flow benchmark", () => {
  it("defines thirty explicit, non-cycling scenarios across real build contexts", () => {
    expect(buildFlowBenchmarkFixtures).toHaveLength(30);
    expect(new Set(buildFlowBenchmarkFixtures.map(({ id }) => id)).size).toBe(30);
    expect(new Set(buildFlowBenchmarkFixtures.map(({ scenario }) => scenario)).size).toBe(30);
    expect(new Set(buildFlowBenchmarkFixtures.map(({ family, profile, scenario }) => `${family}:${profile}:${scenario}`)).size).toBe(30);
    expect(new Set(buildFlowBenchmarkFixtures.map(({ family }) => family))).toEqual(
      new Set(["launch", "guide", "align"])
    );
    expect(buildFlowBenchmarkFixtures.some(({ profile }) => profile === "off-offer")).toBe(true);
    expect(buildFlowBenchmarkFixtures.some(({ profile }) => profile === "injection")).toBe(true);
    expect(buildFlowBenchmarkFixtures.some(({ expectedOutcome }) => expectedOutcome === "safe-deterministic-fallback")).toBe(true);
    for (const fixture of buildFlowBenchmarkFixtures) {
      expect(fixture.expectation.prohibitedOutput.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.brief.session.answers.promotedOffer, fixture.id).toBeTruthy();
    }
    const sourced = buildFlowBenchmarkFixtures.filter(({ brief }) => brief.session.sourceArtifact);
    expect(sourced.length).toBeGreaterThan(3);
    expect(sourced.every(({ brief }) => brief.session.sourceArtifact?.understanding.claims.every(
      ({ citationIds }) => citationIds.length > 0
    ))).toBe(true);
    const rich = buildFlowBenchmarkFixtures.filter(({ profile }) => profile === "rich");
    expect(rich.every(({ brief }) => {
      const evidence = brief.session.evidenceItems ?? [];
      const offer = brief.session.answers.promotedOffer;
      const sellerOfferEvidence = evidence.filter(({ entityRole }) => entityRole !== "target");
      return evidence.length >= 5 &&
        sellerOfferEvidence.every((item) => item.subject === offer && item.sourceUrl.startsWith("https://")) &&
        evidence.some(({ evidenceType }) => evidenceType === "implementation");
    })).toBe(true);
    const events = rich.filter(({ id }) => id.includes("event-"));
    expect(events.every(({ brief }) => brief.session.answers.ctaType === "register")).toBe(true);
    expect(events.every(({ brief }) => (brief.session.evidenceItems ?? []).some(
      ({ evidenceType }) => evidenceType === "resource"
    ))).toBe(true);
    const guides = rich.filter(({ family }) => family === "guide");
    expect(guides.every(({ brief }) => (brief.session.evidenceItems ?? []).some(
      ({ evidenceType }) => evidenceType === "workflow-context"
    ))).toBe(true);
    const accounts = rich.filter(({ family }) => family === "align");
    expect(accounts.every(({ brief }) => (brief.session.evidenceItems ?? []).some(
      ({ entityRole, evidenceType, subject }) =>
        entityRole === "target" && evidenceType === "account-context" && subject === brief.session.answers.audience?.split(" ")[0]
    ))).toBe(true);
    const hostile = buildFlowBenchmarkFixtures.filter(({ profile }) =>
      profile === "injection" || profile === "unsupported-metric"
    );
    expect(hostile).toHaveLength(2);
    expect(hostile.every(({ brief }) => (brief.session.evidenceItems ?? []).some(
      ({ disposition, text }) => disposition === "available" && /ignore all previous|97% reduction/i.test(text)
    ))).toBe(true);
    // The thin fixtures contain an identity statement and one useful detail.
    // Generic validation paragraphs must not turn them into four-section pages.
    expect(buildFlowBenchmarkFixtures.filter(({ profile }) => profile === "thin")
      .every(({ expectedOutcome }) => expectedOutcome === "safe-deterministic-fallback")).toBe(true);
  });

  it("runs the compiler and renderer, captures real trace modes, and keeps human review unclaimed", async () => {
    const result = await runBuildFlowBenchmark();
    expect(result.version).toBe("build-flow-benchmark-v2");
    expect(result.cases).toHaveLength(30);
    expect(result.blindReview.items).toHaveLength(30);
    expect(Object.keys(result.privateReviewMappings)).toHaveLength(30);
    expect(result.blindReview).not.toHaveProperty("scores");
    const contractFailures: string[] = [];
    for (const run of result.cases) {
      const fixture = buildFlowBenchmarkFixtures.find(({ id }) => id === run.id);
      expect(fixture, `missing fixture for ${run.id}`).toBeTruthy();
      if (!run.outcomeMatchesExpectation) {
        const rejected = run.sectionDiagnostics
          .filter(({ rejectionCodes }) => rejectionCodes.length > 0)
          .map(({ sectionId, rejectionCodes }) => `${sectionId}:${rejectionCodes.join("|")}`)
          .join(",");
        contractFailures.push(
          `${run.id}: outcome ${run.outcome}; quality=${run.qualityBlockers.join(",") || "none"}; fallbacks=${run.fallbackReasons.join(",") || "none"}; rejected=${rejected || "none"}`
        );
      }
      if (!run.prohibitedOutputAbsent) contractFailures.push(`${run.id}: prohibited output`);
      expect(run.timing).toMatchObject({ mode: "deterministic-only", cold: null });
      expect(run.humanReview).toEqual({ comprehension: null, brand: null, usefulness: null, visual: null });
      expect(run.sectionModes.every(({ mode }) => mode !== "model"), run.id).toBe(true);
      expect(run.inputEvidenceRefs.length, run.id).toBeGreaterThan(0);
      if (fixture?.brief.session.sourceArtifact) {
        expect(run.sourceArtifact, run.id).toMatchObject({
          artifactId: fixture.brief.session.sourceArtifact.artifactId,
          digest: fixture.brief.session.sourceArtifact.digest
        });
      }
      if (run.outcome === "production-page") {
        expect(run.renderedHtml?.toLowerCase(), run.id).toContain("<!doctype html>");
        expect(run.renderedHtml, run.id).toContain('data-build-design="v1"');
        expect(run.sectionCount, run.id).toBeGreaterThanOrEqual(fixture?.expectation.minimumSections ?? 1);
        expect(run.evidenceRefs.length, run.id).toBeGreaterThan(0);
      } else {
        expect(run.fallbackReasons.length, run.id).toBeGreaterThan(0);
        expect(run.renderedHtml, run.id).toBeUndefined();
      }
      if (fixture?.expectation.requiredEvidenceRefs?.length) {
        if (!run.requiredEvidenceSatisfied) contractFailures.push(`${run.id}: required evidence missing`);
      }
      if (fixture?.profile === "injection" || fixture?.profile === "unsupported-metric") {
        expect(run.inputEvidenceRefs.some((ref) => ref.endsWith("-hostile") || ref.endsWith("-metric")), run.id).toBe(true);
        expect(run.prohibitedOutputAbsent, run.id).toBe(true);
      }
    }
    expect(contractFailures).toEqual([]);
  }, 65_000);
});
