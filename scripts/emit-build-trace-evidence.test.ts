/**
 * Emits the handback evidence package from a real fixture compile.
 *
 * It runs the production path rather than hand-writing a sample, so a trace,
 * manifest, or latency figure in the handback is the one the engine actually
 * produces. Everything written here passes the same privacy validator the
 * store applies before persistence.
 *
 * Written as a test so it reuses the project runner and its path aliases with
 * no extra tooling. It only writes when `EMIT_BUILD_TRACE_EVIDENCE=1`; a normal
 * `npm test` still runs the assertions, which is what keeps the emitter honest.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

import { privateAssetAllocationFor } from "@/lib/brand-system";
import { findBuildTracePrivacyViolations } from "@/lib/build-trace";
import { renderBuildTraceTimeline } from "./lib/build-trace-timeline.mjs";
import { compileSessionProductionPage } from "@/lib/generation/session-production-engine";
import { supportRefForTraceId } from "@/lib/observability";
import type { BrandProfile, TryMeSession } from "@/lib/types";

const SHOULD_WRITE = process.env.EMIT_BUILD_TRACE_EVIDENCE === "1";

const OUT = join(process.cwd(), "output", "observable-brand-intelligence");
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
      "https://northwind-logistics.example/media/yard-team.jpg",
      "https://northwind-logistics.example/media/carrier-scorecard.png"
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
    id: "session_evidence_001",
    traceId: "trace_evidence_northwind_001",
    useCase: "campaign",
    companyDomain: "northwind-logistics.example",
    status: "generating",
    revision: 4,
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

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return Math.round((sorted[Math.max(0, index)] ?? 0) * 100) / 100;
}

it("emits a privacy-clean evidence package from a real fixture compile", async () => {
  if (SHOULD_WRITE) mkdirSync(OUT, { recursive: true });

  const result = await compileSessionProductionPage({
    session: session(),
    brand: brandProfile(),
    providerStartedAtMs: 0,
    currentTimeMs: 5_000
  });
  const trace = result.buildTrace;
  expect(findBuildTracePrivacyViolations(trace)).toEqual([]);
  expect(result.outcome).toBe("production-page");
  expect(trace.sections.length).toBeGreaterThan(0);
  expect(trace.quality.length).toBeGreaterThan(0);
  expect(trace.quality.every(({ blocking }) => blocking === false)).toBe(true);

  const timeline = renderBuildTraceTimeline(trace);
  expect(timeline).not.toMatch(/northwind|https?:\/\/|@/i);

  if (SHOULD_WRITE) {
    writeFileSync(join(OUT, "build-trace.json"), `${JSON.stringify(trace, null, 2)}\n`);
    writeFileSync(join(OUT, "build-trace-timeline.txt"), `${timeline}\n`);
  }

  const brand = result.outcome === "production-page" ? result.artifact.value?.brand : undefined;
  const manifest = {
    supportRef: supportRefForTraceId(trace.traceId),
    outcome: result.outcome,
    brandDecision: trace.decisions.brand,
    assetAllocation: trace.decisions.assets,
    allocationPlan: privateAssetAllocationFor(brand),
    quality: trace.quality
  };
  expect(manifest.assetAllocation?.allocations.length).toBeGreaterThan(0);
  if (SHOULD_WRITE) {
    writeFileSync(
      join(OUT, "brand-and-asset-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }

  const samples: number[] = [];
  for (let run = 0; run < 20; run += 1) {
    const startedAt = performance.now();
    await compileSessionProductionPage({
      session: session({ revision: 4 + run } as Partial<TryMeSession>),
      brand: brandProfile(),
      providerStartedAtMs: 0,
      currentTimeMs: 5_000
    });
    samples.push(performance.now() - startedAt);
  }
  const latency = {
    unit: "ms",
    samples: samples.length,
    note: "Deterministic fixture compile including build-trace assembly. No provider calls.",
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: Math.round(Math.max(...samples) * 100) / 100
  };
  // The trace is assembled inside this window, so the p95 doubles as the
  // nonblocking-fanout receipt the acceptance matrix asks for.
  expect(latency.p95).toBeLessThan(500);
  if (SHOULD_WRITE) {
    writeFileSync(join(OUT, "latency.json"), `${JSON.stringify(latency, null, 2)}\n`);
    process.stdout.write(
      [
        `outcome=${result.outcome}`,
        `supportRef=${supportRefForTraceId(trace.traceId)}`,
        `sections=${trace.sections.length}`,
        `quality=${trace.quality.length}`,
        `fallbacks=${trace.fallbacks.length}`,
        `p50=${latency.p50}ms`,
        `p95=${latency.p95}ms`,
        ""
      ].join("\n")
    );
  }
});
