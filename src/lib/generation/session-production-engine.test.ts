import { describe, expect, it } from "vitest";

import { buildExperienceSpec } from "@/lib/experience-contract";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { applyProductionPageToDraft } from "@/lib/generation/production-draft-adapter";
import { deterministicDraft } from "@/lib/integrations/openai";
import type { BrandProfile, TryMeSession } from "@/lib/types";

import { compileSessionProductionPage } from "./session-production-engine";

const now = "2026-08-22T18:00:00.000Z";

function brand(source: BrandProfile["source"] = "brand-harvester"): BrandProfile {
  return {
    domain: "acme.example",
    canonicalDomain: "acme.example",
    domainAliases: [],
    companyName: "Acme",
    title: "Acme Workflow Cloud",
    description: "Acme provides governed workflow automation.",
    publicContext: "Teams connect approved workflow steps across operations.",
    publicTopics: ["Workflow automation", "Governed operations"],
    imageUrls: source === "fallback" ? [] : ["https://acme.example/product.png"],
    colors: source === "fallback" ? [] : ["#111111", "#FFFFFF", "#3B82F6"],
    primaryColor: "#111111",
    accentColor: "#3B82F6",
    surfaceColor: "#FFFFFF",
    sourceUrl: "https://acme.example/",
    source,
    diagnostics: {
      logo: {
        strategy: "none",
        imageCandidateCount: 0,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0,
        resolutionComplete: true
      },
      palette: {
        strategy: source === "fallback" ? "fallback" : "semantic-tokens",
        confidence: source === "fallback" ? "low" : "high",
        candidateCount: source === "fallback" ? 0 : 3,
        semanticCandidateCount: source === "fallback" ? 0 : 3,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    }
  };
}

function session(profile: BrandProfile): TryMeSession {
  return {
    id: "session-production-adapter",
    editorTokenHash: "hash",
    useCase: "campaign",
    companyDomain: profile.domain,
    status: "generating",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: "https://example.test/e/session-production-adapter",
    revision: 7,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "complete", completedAt: now },
      story: { status: "running", startedAt: now }
    },
    answers: {
      campaignType: "product",
      promotedOffer: "Acme Workflow Cloud",
      audience: "Operations leaders",
      objective: "Evaluate workflow automation",
      ctaType: "book-meeting",
      ctaStyle: "solid"
    },
    brand: profile,
    audienceSuggestions: ["Operations leaders"],
    audienceRecommendations: [],
    evidenceItems: [],
    events: []
  };
}

describe("compileSessionProductionPage", () => {
  it("adapts a current material session into a bounded production page", async () => {
    const profile = brand();
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.artifact.value?.sections.length).toBeGreaterThanOrEqual(4);
    expect(result.artifact.value?.sections.length).toBeLessThanOrEqual(8);
    expect(result.artifact.value?.reveal).toEqual({
      state: "final",
      revision: 7,
      currentRevisionOnly: true
    });
    const page = result.artifact.value!;
    const currentSession = session(profile);
    const draft = deterministicDraft({
      brand: profile,
      useCase: currentSession.useCase,
      answers: currentSession.answers
    });
    const adapted = applyProductionPageToDraft(draft, page);
    const spec = buildExperienceSpec(currentSession, adapted, profile, undefined, page);
    const html = renderExperienceHtml({
      draft: adapted,
      brand: profile,
      useCase: currentSession.useCase,
      answers: currentSession.answers,
      wireframeSelection: spec.wireframeSelection,
      productionSections: spec.production?.sections,
      actions: spec.actions
    });
    expect(spec.schemaVersion).toBe("2.0");
    expect(spec.production?.sections).toHaveLength(page.sections.length);
    expect(html.match(/data-journey-section=/g)).toHaveLength(page.sections.length);
    expect(html).not.toContain("why-change-now");
  });

  it("requests a safe deterministic page when sparse evidence cannot sustain four sections", async () => {
    const profile = brand("fallback");
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: {
        code: "GPE_DEPENDENCY_UNAVAILABLE",
        action: "compile_safe_deterministic_experience_spec",
        allowProviderWork: false
      }
    });
  });

  it("starts no writer work at the hard deadline", async () => {
    const profile = brand();
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 60_000
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: {
        code: "GPE_PROVIDER_DEADLINE_REACHED",
        allowProviderWork: false
      }
    });
  });
});
