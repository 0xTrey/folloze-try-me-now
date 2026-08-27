import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findBuildTracePrivacyViolations,
  parseBuildTrace,
  type BuildTraceV1
} from "@/lib/build-trace";
import { compileSessionProductionPage } from "@/lib/generation/session-production-engine";
import { productionTraceIdentity } from "@/lib/generation/production-build-trace";
import type { BrandProfile, TryMeSession } from "@/lib/types";

const NOW = "2026-08-27T10:00:00.000Z";

function brandProfile(): BrandProfile {
  return {
    domain: "northwind-logistics.example",
    canonicalDomain: "northwind-logistics.example",
    companyName: "Northwind Logistics",
    title: "Freight visibility for regional carriers",
    description: "Northwind Logistics coordinates regional freight visibility.",
    publicContext: "Regional carriers lose margin to unplanned dwell time.",
    publicTopics: ["Freight visibility", "Dwell time reduction"],
    imageUrls: [
      "https://northwind-logistics.example/media/dispatch-console.png",
      "https://northwind-logistics.example/media/yard-team.jpg"
    ],
    colors: ["#0B1F3A", "#E4572E", "#FFFFFF"],
    primaryColor: "#0B1F3A",
    accentColor: "#E4572E",
    surfaceColor: "#FFFFFF",
    sourceUrl: "https://northwind-logistics.example/",
    source: "fast-extractor",
    logoUrl: "https://northwind-logistics.example/logo.svg",
    displayFontFamily: "Inter",
    bodyFontFamily: "Inter",
    designDna: {
      version: 1,
      source: "remote-harvester",
      confidence: "high",
      buttons: { primaryBackground: "#E4572E", radiusPx: 6, heightPx: 44 },
      cards: { radiusPx: 12, shadow: "soft" },
      spacing: { sectionBlockPx: 96, gridGapPx: 20, contentMaxWidthPx: 1200 },
      typography: { fallback: "sans", headingWeight: 700, bodyWeight: 400 }
    },
    diagnostics: {
      palette: { strategy: "semantic-tokens", confidence: "high" },
      logo: { strategy: "inline-svg-portable" }
    }
  } as BrandProfile;
}

function session(overrides: Partial<TryMeSession> = {}): TryMeSession {
  return {
    id: "session-build-trace-fixture",
    revision: 4,
    useCase: "campaign",
    companyDomain: "northwind-logistics.example",
    status: "generating",
    createdAt: NOW,
    updatedAt: NOW,
    audienceSuggestions: ["Regional carrier operations leaders"],
    events: [],
    stages: {
      brand: { status: "complete", startedAt: NOW, completedAt: NOW },
      audience: { status: "complete", startedAt: NOW, completedAt: NOW },
      story: { status: "running", startedAt: NOW }
    },
    answers: {
      campaignType: "product",
      promotedOffer: "Dwell Time Control",
      audience: "Regional carrier operations leaders",
      objective: "Book a dwell-time review",
      ctaType: "book-meeting"
    },
    ...overrides
  } as unknown as TryMeSession;
}

async function compile(overrides: Partial<TryMeSession> = {}) {
  return compileSessionProductionPage({
    session: session(overrides),
    brand: brandProfile(),
    providerStartedAtMs: 0,
    currentTimeMs: 5_000
  });
}

describe("production build trace population", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T10:00:05.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits a decodable trace from a real session compile", async () => {
    const result = await compile();
    const trace = result.buildTrace;

    expect(parseBuildTrace(trace)).toEqual(trace);
    expect(trace.schemaVersion).toBe(1);
    expect(trace.revision).toBe(4);
    expect(trace.evidenceRefs.length).toBeGreaterThan(0);
    expect(trace.timings.map(({ stage }) => stage)).toContain("artifact-validation");
  });

  it("records framework, wireframe, and brand decisions with reasons", async () => {
    const { buildTrace } = await compile();

    expect(buildTrace.decisions.framework?.selectedCandidateId).toBeTruthy();
    expect(buildTrace.decisions.framework?.reasonCodes.length).toBeGreaterThan(0);
    expect(buildTrace.decisions.wireframe?.candidates).toHaveLength(3);
    expect(
      buildTrace.decisions.wireframe?.candidates.filter(({ selected }) => selected)
    ).toHaveLength(1);
    expect(buildTrace.decisions.brand?.roles.map(({ role }) => role)).toEqual(
      expect.arrayContaining([
        "accent",
        "bodyfont",
        "buttonradius",
        "cardradius",
        "ctabackground",
        "density",
        "headingfont",
        "surface",
        "text"
      ])
    );
    for (const role of buildTrace.decisions.brand?.roles ?? []) {
      expect(role.valueDigest).toMatch(/^dg_[a-f0-9]{32}$/);
      expect(role.selectionReasons.length).toBeGreaterThan(0);
    }
  });

  it("gives every rendered section a provenance receipt", async () => {
    const result = await compile();
    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;

    const rendered = result.artifact.value?.sections ?? [];
    const traced = new Map(
      result.buildTrace.sections.map((section) => [section.sectionId, section])
    );

    expect(rendered.length).toBeGreaterThanOrEqual(4);
    for (const section of rendered) {
      const provenance = traced.get(section.sectionId);
      expect(provenance).toBeDefined();
      expect(provenance?.promptVersion).toBeTruthy();
      expect(provenance?.templateVersion).toBeTruthy();
      expect(provenance?.inputDigest).toMatch(/^dg_[a-f0-9]{32}$/);
      expect(provenance?.outputDigest).toMatch(/^dg_[a-f0-9]{32}$/);
      expect(provenance?.selectionReasons.length).toBeGreaterThan(0);
    }
  });

  it("maps every rendered section to one versioned writing contract", async () => {
    const result = await compile();
    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;

    const rendered = result.artifact.value?.sections ?? [];
    const traced = new Map(
      result.buildTrace.sections.map((section) => [section.sectionId, section])
    );
    const promptVersions = new Set<string>();

    for (const section of rendered) {
      const provenance = traced.get(section.sectionId);
      expect(provenance?.selectionReasons.some((reason) => reason.startsWith("contract_"))).toBe(
        true
      );
      if (provenance?.promptVersion) promptVersions.add(provenance.promptVersion);
    }

    expect(promptVersions.size).toBeGreaterThan(0);
    expect(
      result.buildTrace.sections.every(
        (section) => section.promptVersion && section.templateVersion
      )
    ).toBe(true);
  });

  it("keeps every field of a real trace inside the privacy boundary", async () => {
    const { buildTrace } = await compile();
    const serialized = JSON.stringify(buildTrace);

    expect(findBuildTracePrivacyViolations(buildTrace)).toEqual([]);
    expect(serialized).not.toContain("northwind-logistics.example");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("Dwell Time Control");
    expect(serialized).not.toContain("Northwind");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("<");
  });

  it("is idempotent across retries of the same revision", async () => {
    const first = await compile();
    const second = await compile();

    expect(second.buildTrace).toEqual(first.buildTrace);
    expect(second.buildTrace.traceId).toBe(first.buildTrace.traceId);
    expect(second.buildTrace.attemptId).toBe(first.buildTrace.attemptId);
  });

  it("separates traces for different revisions of the same session", async () => {
    const first = await compile({ revision: 4 } as Partial<TryMeSession>);
    const second = await compile({ revision: 5 } as Partial<TryMeSession>);

    expect(second.buildTrace.attemptId).not.toBe(first.buildTrace.attemptId);
    expect(second.buildTrace.revision).toBe(5);
  });

  it("scores brand fidelity on the delivered experience without gating it", async () => {
    const result = await compile();
    const { buildTrace } = result;
    const scored = new Set(buildTrace.quality.map(({ dimension }) => dimension));

    expect(result.outcome).toBe("production-page");
    expect(buildTrace.quality.length).toBeGreaterThan(0);
    expect(buildTrace.quality.every(({ blocking }) => blocking === false)).toBe(true);
    for (const dimension of [
      "identity_and_logo",
      "semantic_palette",
      "representative_geometry",
      "imagery_quality",
      "copy_specificity",
      "evidence_linkage",
      "accessibility"
    ]) {
      expect(scored).toContain(dimension);
    }
    for (const entry of buildTrace.quality) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(1);
    }
  });

  it("still emits a terminal trace when the attempt falls back", async () => {
    const result = await compileSessionProductionPage({
      session: session(),
      brand: brandProfile(),
      providerStartedAtMs: 0,
      currentTimeMs: 10 * 60_000
    });

    expect(result.outcome).toBe("safe-deterministic-fallback");
    const trace: BuildTraceV1 = result.buildTrace;
    expect(["fallback", "failed", "stale", "needs_input"]).toContain(trace.terminalStatus);
    expect(trace.fallbacks.length).toBeGreaterThan(0);
    expect(findBuildTracePrivacyViolations(trace)).toEqual([]);
    expect(parseBuildTrace(trace)).toEqual(trace);
  });
});

describe("production trace identity", () => {
  it("derives a stable identity when the session has no trace id", () => {
    const first = productionTraceIdentity({ sessionId: "session-abc", revision: 2 });
    const second = productionTraceIdentity({ sessionId: "session-abc", revision: 2 });

    expect(first).toEqual(second);
    expect(first.traceId).toMatch(/^[a-z0-9][a-z0-9_-]{7,63}$/i);
  });

  it("keeps a supplied opaque trace id intact", () => {
    const identity = productionTraceIdentity({
      sessionId: "session-abc",
      revision: 2,
      traceId: "kR8vQm2xLp4TzN6yWc9bHd3F"
    });

    expect(identity.traceId).toBe("kR8vQm2xLp4TzN6yWc9bHd3F");
  });
});
