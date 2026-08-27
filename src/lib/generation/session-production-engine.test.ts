import { describe, expect, it } from "vitest";

import { buildExperienceSpec } from "@/lib/experience-contract";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { applyProductionPageToDraft } from "@/lib/generation/production-draft-adapter";
import { deterministicDraft } from "@/lib/integrations/openai";
import type { SectionModelClient } from "@/lib/generation/section-model-writer";
import type { SectionWritingContract } from "@/lib/generation/section-writing-contract";
import {
  copySimilarity,
  NEAR_DUPLICATE_THRESHOLD
} from "@/lib/generation/section-candidate-review";
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

describe("dedicated section writers reach the rendered page", () => {
  const MODEL_HEADLINE = "Approvals close before the shift handover";
  /** Long enough to separate one section's work from the rest of the build. */
  const SLOW_SECTION_MS = 40;
  /** A setTimeout may fire a hair early, and durations are rounded to the ms. */
  const TIMER_TOLERANCE_MS = 3;
  const MODEL_BODY =
    "Every approval step routes to the named owner, so the queue clears before the next shift begins.";

  /** Copy sized to the slot the contract asks for, so review judges the content. */
  function sizedBody(contract: SectionWritingContract): string {
    const filler = "Owners confirm each step in the shared queue.";
    const words = (value: string) => value.trim().split(/\s+/).length;
    const target = contract.slot.wordBudget.min - words(MODEL_HEADLINE);
    let body = MODEL_BODY;
    while (words(body) < target) body = `${body} ${filler}`;
    return body;
  }

  /** Answers only the first planned section, leaving the rest deterministic. */
  function singleSectionClient(overrides: {
    delayMs?: number;
    candidate?: Record<string, unknown>;
  } = {}): { client: SectionModelClient; answered: string[] } {
    const answered: string[] = [];
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (answered.length) return { sectionId: contract.sectionId, candidates: [] };
        answered.push(contract.sectionId);
        if (overrides.delayMs) {
          await new Promise((resolve) => {
            setTimeout(resolve, overrides.delayMs).unref?.();
          });
        }
        return {
          sectionId: contract.sectionId,
          candidates: [
            overrides.candidate ?? {
              headline: MODEL_HEADLINE,
              body: sizedBody(contract),
              evidenceRefs: contract.evidenceRefs.slice(0, 1)
            }
          ]
        };
      }
    };
    return { client, answered };
  }

  /**
   * Compiles once deterministically, then answers for the first section with
   * the same copy under a distinctive headline. Only the headline differs, so
   * an accepted candidate is observable without the rest of the section moving.
   */
  async function modelAssistedCompile(profile: BrandProfile, delayMs = 0) {
    const baseline = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });
    if (baseline.outcome !== "production-page") throw new Error("baseline_not_compiled");
    const target = baseline.artifact.value!.sections[0]!;
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (contract.sectionId !== target.sectionId) {
          return { sectionId: contract.sectionId, candidates: [] };
        }
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return {
          sectionId: contract.sectionId,
          candidates: [
            {
              headline: MODEL_HEADLINE,
              body: target.body,
              evidenceRefs: [...target.evidenceRefs]
            }
          ]
        };
      }
    };
    return {
      target,
      result: await compileSessionProductionPage({
        session: session(profile),
        brand: profile,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000,
        sectionModelClient: client
      })
    };
  }

  it("renders accepted model copy and records it in the private section receipt", async () => {
    const profile = brand();
    const { target, result } = await modelAssistedCompile(profile);

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const page = result.artifact.value!;
    const written = page.sections.find(
      ({ sectionId }) => sectionId === target.sectionId
    );

    expect(written?.headline).toBe(MODEL_HEADLINE);
    expect(renderPage(session(profile), profile, page)).toContain(MODEL_HEADLINE);
    expect(
      result.compileReceipts.find(({ stage }) => stage === "section-writers")
    ).toMatchObject({ sessionId: session(profile).id, revision: 7 });
  });

  it("keeps deterministic copy when the provider answers after the deadline", async () => {
    const profile = brand();
    const { client, answered } = singleSectionClient({ delayMs: 30_000 });
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: client,
      sectionWriterDeadlineMs: 25
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const page = result.artifact.value!;
    const html = renderPage(session(profile), profile, page);

    expect(answered).toHaveLength(1);
    expect(html).not.toContain(MODEL_HEADLINE);
    expect(page.sections.every(({ headline }) => (headline ?? "").trim().length > 0)).toBe(
      true
    );
    expect(
      result.compileReceipts.find(({ stage }) => stage === "section-writers")?.detailCode
    ).toBe("section_writers_deadline_exceeded");
  });

  it("keeps deterministic copy when the provider returns copy the contract rejects", async () => {
    const profile = brand();
    const { client } = singleSectionClient({
      candidate: {
        headline: "Cut operating costs by 94 percent in week one",
        body:
          "An unsourced figure no evidence claim supports, offered to the buyer as settled fact "
          + "about savings the seller has never measured on any comparable deployment anywhere.",
        evidenceRefs: []
      }
    });
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: client
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const html = renderPage(session(profile), profile, result.artifact.value!);

    expect(html).not.toContain("94 percent");
    expect(html).not.toContain("Cut operating costs");
  });

  it("names the writer that actually produced each section", async () => {
    const profile = brand();
    const { target, result } = await modelAssistedCompile(profile);

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const receipts = new Map(
      result.buildTrace.sections.map((section) => [section.sectionId, section])
    );

    expect(receipts.get(target.sectionId)?.writerMode).toBe("model");
    const deterministic = [...receipts.values()].filter(
      ({ sectionId }) => sectionId !== target.sectionId
    );
    expect(deterministic.length).toBeGreaterThan(0);
    for (const receipt of deterministic) {
      expect(receipt.writerMode).toBe("deterministic");
    }
  });

  it("marks a thinned model field as model copy and says the field was thinned", async () => {
    const profile = brand();
    const baseline = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });
    if (baseline.outcome !== "production-page") throw new Error("baseline_not_compiled");
    const target = baseline.artifact.value!.sections[0]!;
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (contract.sectionId !== target.sectionId) {
          return { sectionId: contract.sectionId, candidates: [] };
        }
        const usable = {
          headline: MODEL_HEADLINE,
          body: target.body,
          evidenceRefs: [...target.evidenceRefs]
        };
        return {
          sectionId: contract.sectionId,
          // The second candidate leaves the evidence contract, so the field the
          // selector chooses from is thinner than the provider offered.
          candidates: [usable, { ...usable, evidenceRefs: ["ev-outside-the-contract"] }]
        };
      }
    };
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: client
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const receipt = result.buildTrace.sections.find(
      ({ sectionId }) => sectionId === target.sectionId
    );
    const serialized = JSON.stringify(result.buildTrace);
    const html = renderPage(session(profile), profile, result.artifact.value!);

    expect(receipt?.writerMode).toBe("model");
    expect(receipt?.selectionReasons).toContain("model_candidates_thinned");
    expect(serialized).not.toContain("ev-outside-the-contract");
    expect(html).not.toContain("ev-outside-the-contract");
  });

  it("keeps a section whose only candidate leaves its evidence contract deterministic", async () => {
    const profile = brand();
    const baseline = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });
    if (baseline.outcome !== "production-page") throw new Error("baseline_not_compiled");
    const target = baseline.artifact.value!.sections[0]!;
    const { client } = singleSectionClient({
      candidate: {
        headline: MODEL_HEADLINE,
        body: target.body,
        evidenceRefs: [...target.evidenceRefs, "ev-outside-the-contract"]
      }
    });
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: client
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const html = renderPage(session(profile), profile, result.artifact.value!);
    const receipt = result.buildTrace.sections.find(
      ({ sectionId }) => sectionId === target.sectionId
    );

    expect(html).not.toContain(MODEL_HEADLINE);
    expect(html).not.toContain("ev-outside-the-contract");
    expect(receipt?.writerMode).toBe("deterministic");
    expect(JSON.stringify(result.buildTrace)).not.toContain("ev-outside-the-contract");
  });

  it("keeps an unknown omission reason out of the page and the private trace", async () => {
    const profile = brand();
    const { client } = singleSectionClient({
      candidate: { omit: true, omissionReason: "provider_felt_like_it" }
    });
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: client
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const html = renderPage(session(profile), profile, result.artifact.value!);

    expect(html).not.toContain("provider_felt_like_it");
    expect(JSON.stringify(result.buildTrace)).not.toContain("provider_felt_like_it");
    expect(
      result.buildTrace.sections.every(({ writerMode }) => writerMode === "deterministic")
    ).toBe(true);
  });

  it("times each section receipt to its own work, not the whole session", async () => {
    const profile = brand();
    const { target, result } = await modelAssistedCompile(profile, SLOW_SECTION_MS);

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const trace = result.buildTrace;
    const sessionSpanMs = Date.parse(trace.completedAt ?? "") - Date.parse(trace.startedAt);
    const receipts = trace.sections;

    expect(sessionSpanMs).toBeGreaterThan(SLOW_SECTION_MS);
    expect(receipts.length).toBeGreaterThan(0);
    const spans = new Map(
      receipts.map((receipt) => [
        receipt.sectionId,
        Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt)
      ])
    );
    for (const [, spanMs] of spans) {
      expect(spanMs).toBeGreaterThanOrEqual(0);
      expect(spanMs).toBeLessThan(sessionSpanMs);
    }
    // Timer granularity can shave a millisecond off a deliberate delay, so the
    // claim is that the slow section is clearly slower, not exact to the tick.
    const slowSpanMs = spans.get(target.sectionId)!;
    expect(slowSpanMs).toBeGreaterThanOrEqual(SLOW_SECTION_MS - TIMER_TOLERANCE_MS);
    const untouched = receipts.filter(({ sectionId }) => sectionId !== target.sectionId);
    expect(untouched.length).toBeGreaterThan(0);
    for (const receipt of untouched) {
      expect(spans.get(receipt.sectionId)).toBeLessThan(slowSpanMs);
    }
  });

  it("keeps the rendered page inside the copy constitution with a model in the loop", async () => {
    const profile = brand();
    const { result } = await modelAssistedCompile(profile);

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const currentSession = session(profile);
    const page = result.artifact.value!;
    const html = renderPage(currentSession, profile, page);

    expect(html).not.toMatch(/Decision Lens\s*\d/i);
    expect(html).not.toMatch(/\bSection\s+\d\b/);
    expect(html).not.toMatch(/lorem ipsum|\bTBD\b|coming soon|\{\{|\[insert/i);
    expect(html).toContain(currentSession.answers.audience!);
    expect(html).toMatch(/>Book a meeting</);
    expect(html).not.toMatch(
      /<p class="eyebrow">[\s\S]{0,200}?<h2>[\s\S]{0,200}?<p class="dek">/
    );

    const headlines = page.sections.map(({ headline }) => (headline ?? "").trim());
    expect(new Set(headlines).size).toBe(headlines.length);
    const bodies = page.sections.map(({ body }) => (body ?? "").trim());
    expect(new Set(bodies).size).toBe(bodies.length);
    for (const [index, body] of bodies.entries()) {
      for (const other of bodies.slice(index + 1)) {
        expect(copySimilarity(body, other)).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
      }
    }
  });

  it("compiles identically to the deterministic path when no provider is configured", async () => {
    const profile = brand();
    const withoutClient = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });
    const withSilentClient = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: {
        async writeSection(contract) {
          return { sectionId: contract.sectionId, candidates: [] };
        }
      }
    });

    expect(withoutClient.outcome).toBe("production-page");
    expect(withSilentClient.outcome).toBe("production-page");
    if (withoutClient.outcome !== "production-page") return;
    if (withSilentClient.outcome !== "production-page") return;
    expect(
      withSilentClient.artifact.value?.sections.map(({ headline }) => headline)
    ).toEqual(withoutClient.artifact.value?.sections.map(({ headline }) => headline));
  });
});
