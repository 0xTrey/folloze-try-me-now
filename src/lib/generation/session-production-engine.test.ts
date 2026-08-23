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
    ...(source === "fallback"
      ? {}
      : {
          logoUrl: "https://acme.example/logo.svg",
          displayFontFamily: "Acme Sans",
          bodyFontFamily: "Acme Sans",
          designDna: {
            version: 1 as const,
            source: "verified-profile" as const,
            confidence: "high" as const,
            buttons: { radiusPx: 6, borderWidthPx: 1 },
            cards: { radiusPx: 10, borderWidthPx: 1, shadow: "soft" as const },
            spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 88, gridGapPx: 20 }
          }
        }),
    imageUrls: source === "fallback" ? [] : ["https://acme.example/product.png"],
    colors: source === "fallback" ? [] : ["#111111", "#FFFFFF", "#3B82F6"],
    primaryColor: "#111111",
    accentColor: "#3B82F6",
    surfaceColor: "#FFFFFF",
    sourceUrl: "https://acme.example/",
    source,
    diagnostics: {
      logo: {
        strategy: source === "fallback" ? "none" : "verified-profile",
        imageCandidateCount: source === "fallback" ? 0 : 1,
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

function session(
  profile: BrandProfile,
  family: "launch" | "guide" | "align" = "launch"
): TryMeSession {
  const answers: TryMeSession["answers"] =
    family === "launch"
      ? {
          campaignType: "product",
          promotedOffer: "Acme Workflow Cloud",
          audience: "Operations leaders",
          objective: "Evaluate workflow automation",
          ctaType: "book-meeting",
          ctaStyle: "solid"
        }
      : family === "guide"
        ? {
            campaignType: "demand",
            promotedOffer: "Acme Workflow Governance",
            audience: "Enterprise architecture leaders",
            objective: "Evaluate workflow governance",
            ctaType: "book-meeting",
            ctaStyle: "solid"
          }
        : {
            campaignType: "demand",
            promotedOffer: "Acme Workflow Governance",
            audience: "Revenue operations leaders",
            objective: "Validate the first governed workflow",
            targetDomain: "targetco.example",
            messageBelief: "TargetCo is prioritizing governed workflow ownership",
            ctaType: "book-meeting",
            ctaStyle: "solid"
          };
  return {
    id: "session-production-adapter",
    editorTokenHash: "hash",
    useCase: family === "align" ? "abm" : "campaign",
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
    answers,
    brand: profile,
    audienceSuggestions: [answers.audience!],
    audienceRecommendations: [],
    evidenceItems: [],
    events: []
  };
}

function targetBrand(): BrandProfile {
  return {
    ...brand(),
    domain: "targetco.example",
    canonicalDomain: "targetco.example",
    companyName: "TargetCo",
    title: "TargetCo Operations",
    description: "TargetCo operates distributed revenue workflows.",
    publicContext:
      "TargetCo is prioritizing governed workflow ownership across revenue operations.",
    publicTopics: ["Revenue operations", "Workflow governance"],
    logoUrl: "https://targetco.example/logo.svg",
    imageUrls: [],
    sourceUrl: "https://targetco.example/"
  };
}

function renderPage(
  currentSession: TryMeSession,
  profile: BrandProfile,
  page: NonNullable<
    Extract<
      Awaited<ReturnType<typeof compileSessionProductionPage>>,
      { outcome: "production-page" }
    >["artifact"]["value"]
  >,
  target?: BrandProfile
): string {
  const draft = deterministicDraft({
    brand: profile,
    targetBrand: target,
    useCase: currentSession.useCase,
    answers: currentSession.answers
  });
  const adapted = applyProductionPageToDraft(draft, page);
  const spec = buildExperienceSpec(
    currentSession,
    adapted,
    profile,
    target,
    page
  );
  return renderExperienceHtml({
    draft: adapted,
    brand: profile,
    targetBrand: target,
    useCase: currentSession.useCase,
    answers: currentSession.answers,
    wireframeSelection: spec.wireframeSelection,
    productionSections: spec.production?.sections,
    actions: spec.actions
  });
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
    expect(result.artifact.value?.familyDecision).toMatchObject({
      version: 2,
      family: "launch",
      subtype: "product",
      locked: true
    });
    expect(result.artifact.value?.familyMessageSpine).toMatchObject({
      version: 2,
      family: "launch",
      cta: {
        id: "book_meeting",
        label: "Book a meeting"
      }
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
    expect(html).toContain("Why the current approach creates avoidable friction");
    expect(html).toContain(">Book a meeting</a>");
  });

  it.each([
    {
      family: "launch" as const,
      labels: [
        "Outcome",
        "Why change",
        "How it works",
        "Use cases",
        "Evidence",
        "Next step"
      ],
      sectionIds: [
        "experience-overview",
        "why-change-now",
        "outcome-mechanism",
        "application-paths",
        "credibility-anchor",
        "next-step"
      ],
      copy: [
        "Why the current approach creates avoidable friction",
        "Choose the buyer job that matters most"
      ],
      cta: "Book a meeting"
    },
    {
      family: "guide" as const,
      labels: [
        "What changed",
        "What is at stake",
        "What to evaluate",
        "How it answers",
        "Where it applies",
        "Continue"
      ],
      sectionIds: [
        "experience-overview",
        "why-change-now",
        "starting-points",
        "outcome-mechanism",
        "application-paths",
        "next-step"
      ],
      copy: [
        "Evaluate the solution against observable criteria",
        "How the solution answers each evaluation criterion"
      ],
      cta: "Book a working session"
    },
    {
      family: "align" as const,
      labels: [
        "Shared priority",
        "Why it matters here",
        "Opportunity",
        "Choose a priority",
        "Proof and validation",
        "First decision"
      ],
      sectionIds: [
        "experience-overview",
        "why-change-now",
        "outcome-mechanism",
        "application-paths",
        "credibility-anchor",
        "next-step"
      ],
      copy: [
        "TargetCo and Acme can validate",
        "Turn the shared priority into practical workstreams"
      ],
      cta: "Plan a validation session"
    }
  ])(
    "renders locked $family spine labels, copy, order, and CTA semantics",
    async ({ family, labels, sectionIds, copy, cta }) => {
      const profile = brand();
      const currentSession = session(profile, family);
      const target = family === "align" ? targetBrand() : undefined;
      const result = await compileSessionProductionPage({
        session: currentSession,
        brand: profile,
        targetBrand: target,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000
      });

      expect(result.outcome).toBe("production-page");
      if (result.outcome !== "production-page" || !result.artifact.value) return;
      const page = result.artifact.value;
      expect(page.familyDecision?.family).toBe(family);
      expect(page.familyMessageSpine?.family).toBe(family);
      expect(page.sections.map(({ v2Role }) => v2Role)).toEqual(
        page.familyDecision?.sectionPlan.map(({ role }) => role)
      );
      const html = renderPage(currentSession, profile, page, target);

      let previousLabel = -1;
      for (const label of labels) {
        const index = html.indexOf(`</span>${label}`);
        expect(index, `missing or unordered label: ${label}`).toBeGreaterThan(
          previousLabel
        );
        previousLabel = index;
      }
      let previousSection = -1;
      for (const id of sectionIds) {
        const index = html.indexOf(`data-journey-section="${id}"`);
        expect(index, `missing or unordered section: ${id}`).toBeGreaterThan(
          previousSection
        );
        previousSection = index;
      }
      for (const phrase of copy) expect(html).toContain(phrase);
      expect(html).toContain(`>${cta}</a>`);
      expect(html).not.toMatch(
        /decision path|account thesis|supporting proof|operating outcome|business fit|evidence-bounded|For Buying team|Explore the decision|Review the decision path/i
      );
    }
  );

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
        code: "GPE_BRAND_HELP_REQUIRED",
        action: "request_brand_input",
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
