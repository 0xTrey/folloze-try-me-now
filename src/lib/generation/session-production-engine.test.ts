import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sectionSelection from "@/lib/generation/section-candidate-review";
import { sectionCopyWordCount } from "@/lib/generation/section-copy-types";

import { config } from "@/lib/config";
import { normalizePublicHtmlSource } from "@/lib/content-url";
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
import type { BrandProfile, SessionEvidenceItem, TryMeSession } from "@/lib/types";

import { compileSessionProductionPage } from "./session-production-engine";
import { syntheticOfferEvidence } from "../../../tests/fixtures/offer-evidence";

const now = "2026-08-22T18:00:00.000Z";
const originalCtaUrl = config.demoCtaUrl;
beforeEach(() => { config.demoCtaUrl = "https://acme.example/contact"; });
afterEach(() => { config.demoCtaUrl = originalCtaUrl; });

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
    evidenceItems: syntheticOfferEvidence(answers.promotedOffer!, profile.domain),
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

function namedTarget(input: {
  domain: string;
  name: string;
  description: string;
  publicContext: string;
  publicTopics: string[];
}): BrandProfile {
  return {
    ...targetBrand(),
    domain: input.domain,
    canonicalDomain: input.domain,
    companyName: input.name,
    title: `${input.name} public company profile`,
    description: input.description,
    publicContext: input.publicContext,
    publicTopics: input.publicTopics,
    logoUrl: `https://${input.domain}/logo.svg`,
    sourceUrl: `https://${input.domain}/`
  };
}

function accountEvidence(
  domain: string,
  name: string,
  focus: string,
  operatingContext: string
): SessionEvidenceItem[] {
  return [
    {
      id: `${domain}:focus`,
      type: "public-focus-area",
      label: "Public focus area",
      text: focus,
      sourceUrl: `https://${domain}/`,
      signals: [focus.split(/\s+/).slice(0, 5).join(" ")],
      disposition: "available",
      entityRole: "target",
      confidence: "high",
      evidenceType: "account-context",
      subject: name
    },
    {
      id: `${domain}:operations`,
      type: "public-operating-context",
      label: "Public operating context",
      text: operatingContext,
      sourceUrl: `https://${domain}/company`,
      signals: [operatingContext.split(/\s+/).slice(0, 5).join(" ")],
      disposition: "available",
      entityRole: "target",
      confidence: "high",
      evidenceType: "account-context",
      subject: name
    }
  ];
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
  it("keeps a numeric product identity when its cited capabilities omit the model number", async () => {
    const profile = brand();
    const currentSession = session(profile);
    currentSession.answers.promotedOffer = "Acme Workflow Cloud Series 3";
    currentSession.evidenceItems = currentSession.evidenceItems!.map((item) => ({
      ...item, subject: currentSession.answers.promotedOffer
    }));
    const observed: SectionWritingContract[] = [];
    const result = await compileSessionProductionPage({ session: currentSession, brand: profile,
      providerStartedAtMs: 0, currentTimeMs: 10_000,
      sectionModelClient: { writeSection: async (contract) => { observed.push(contract); return { sectionId: contract.sectionId, candidates: [] }; } }
    });
    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") throw new Error("numeric_product_page_missing");
    expect(result.artifact.value?.sections.some((section) => section.role === "hero" && section.headline?.includes("Series 3"))).toBe(true);
    expect(result.compileReceipts.some((receipt) => receipt.detailCode === "copy_unsupported_numeric_claim")).toBe(false);
    const mechanism = observed.find((contract) => contract.role === "mechanism");
    expect(mechanism?.evidenceRefs).toContain("fixture-offer-capability");
    expect(mechanism?.evidenceRefs).not.toContain("fixture-offer-positioning");
    expect(mechanism?.evidenceRefs).not.toContain("fixture-offer-workflow");
  });
  it("renders sourced purchase answers and scopes the purchase writer to those claims", async () => {
    const profile = brand();
    const currentSession = session(profile);
    currentSession.evidenceItems = [...currentSession.evidenceItems!, {
      id: "price-approved", type: "public-positioning", label: "Published pricing",
      text: "Acme Workflow Cloud costs $49 per user monthly.", sourceUrl: "https://acme.example/pricing",
      signals: [], disposition: "available", entityRole: "seller", confidence: "high",
      evidenceType: "pricing", subject: "Acme Workflow Cloud"
    }];
    const observed: SectionWritingContract[] = [];
    const result = await compileSessionProductionPage({ session: currentSession, brand: profile,
      providerStartedAtMs: 0, currentTimeMs: 10_000,
      sectionModelClient: { writeSection: async (contract) => { observed.push(contract); return { sectionId: contract.sectionId, candidates: [] }; } }
    });
    expect(result.outcome, result.outcome === "production-page" ? "" : JSON.stringify(result.instruction)).toBe("production-page");
    if (result.outcome !== "production-page") throw new Error("purchase_page_missing");
    expect(observed.find((contract) => contract.sectionId === "buyer-purchase-questions")?.evidenceRefs).toEqual(["price-approved"]);
    expect(renderPage(currentSession, profile, result.artifact.value!)).toContain("Acme Workflow Cloud costs $49 per user monthly.");
  });

  it("does not promote another product's outcome into the selected buyer journey", async () => {
    const profile = brand();
    const currentSession = session(profile);
    currentSession.evidenceItems = [...currentSession.evidenceItems!, {
      id: "crm-outcome", type: "public-positioning", label: "CRM customer result",
      text: "A customer reduced processing time by 24%.", sourceUrl: "https://acme.example/crm/customer",
      signals: [], disposition: "available", entityRole: "seller", confidence: "high",
      evidenceType: "quantified-outcome", subject: "Acme CRM"
    }];
    const result = await compileSessionProductionPage({ session: currentSession, brand: profile,
      providerStartedAtMs: 0, currentTimeMs: 10_000 });
    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") throw new Error("scoped_proof_page_missing");
    expect(result.buyerDecisionBrief?.knowledge.proofClaims).toEqual([]);
    expect(renderPage(currentSession, profile, result.artifact.value!)).not.toContain("A customer reduced processing time by 24%.");
  });

  it.each([
    {
      objective: "Explore a product use case",
      ctaType: "explore" as const,
      ctaLabel: "Explore the first use case",
      expectedId: "explore_use_case",
      expectedLabel: "Explore the use case"
    },
    {
      objective: "Evaluate the product",
      ctaType: "book-meeting" as const,
      ctaLabel: "Book a product walkthrough",
      expectedId: "book_meeting",
      expectedLabel: "Book a meeting"
    },
    {
      objective: "Compare product details",
      ctaType: "download" as const,
      ctaLabel: "Download the product brief",
      expectedId: "download_resource",
      expectedLabel: "Download the resource"
    }
  ])(
    "carries the selected $ctaType action into the compiled spine and final HTML",
    async ({ objective, ctaType, ctaLabel, expectedId, expectedLabel }) => {
      const profile = brand();
      const currentSession = session(profile);
      currentSession.answers.objective = objective;
      currentSession.answers.ctaType = ctaType;
      currentSession.objectiveRecommendations = [
        {
          id: `selected-${ctaType}`,
          label: objective,
          rationale: "Selected visitor action",
          recommended: true,
          evidenceItemIds: ["visitor:objective"],
          confidence: "high",
          recommendationKind: "evidence-backed",
          revision: currentSession.revision,
          cta: { type: ctaType, label: ctaLabel }
        }
      ];

      const result = await compileSessionProductionPage({
        session: currentSession,
        brand: profile,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000
      });

      expect(result.outcome, result.outcome === "production-page" ? "" : JSON.stringify(result.instruction)).toBe("production-page");
      if (result.outcome !== "production-page") return;
      expect(result.artifact.value?.familyMessageSpine?.cta).toMatchObject({
        id: expectedId,
        label: expectedLabel,
        type: ctaType
      });
      const html = renderPage(currentSession, profile, result.artifact.value!);
      const renderedLabel = ctaType === "explore" || ctaType === "download" ? "Explore the page" : expectedLabel;
      const tag = ctaType === "explore" || ctaType === "download" ? "button" : "a";
      expect(html.includes(`>${renderedLabel}</${tag}>`)).toBe(true);
    }
  );

  it("builds account variants from distinct cited target signals instead of name substitution", async () => {
    const profile = brand();
    const cisco = namedTarget({
      domain: "cisco.example",
      name: "Cisco",
      description: "Cisco connects and protects distributed organizations.",
      publicContext: "Cisco describes secure networking and observability across hybrid infrastructure.",
      publicTopics: ["Secure networking", "Hybrid infrastructure"]
    });
    const google = namedTarget({
      domain: "google.example",
      name: "Google",
      description: "Google develops cloud and AI platforms.",
      publicContext: "Google describes responsible AI and cloud security for enterprise platforms.",
      publicTopics: ["Responsible AI", "Cloud security"]
    });
    const compileFor = async (
      target: BrandProfile,
      evidenceItems: SessionEvidenceItem[]
    ) => {
      const currentSession = session(profile, "align");
      currentSession.answers.targetDomain = target.domain;
      currentSession.answers.messageBelief = undefined;
      currentSession.evidenceItems = [...currentSession.evidenceItems!, ...evidenceItems];
      currentSession.evidenceItems.push({
        ...syntheticOfferEvidence(currentSession.answers.promotedOffer!, profile.domain)[1]!,
        id: "fixture-offer-account-escalation",
        text: "The escalation dashboard displays unresolved exceptions and their assigned policy owners."
      });
      const result = await compileSessionProductionPage({
        session: currentSession,
        brand: profile,
        targetBrand: target,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000
      });
      expect(result.outcome).toBe("production-page");
      if (result.outcome !== "production-page" || !result.artifact.value) {
        throw new Error("account_variant_not_compiled");
      }
      return result.artifact.value;
    };

    const ciscoPage = await compileFor(
      cisco,
      accountEvidence(
        cisco.domain,
        cisco.companyName,
        "Secure networking across hybrid infrastructure",
        "Observability programs connect network, security, and operations teams"
      )
    );
    const googlePage = await compileFor(
      google,
      accountEvidence(
        google.domain,
        google.companyName,
        "Responsible AI across enterprise platforms",
        "Cloud security programs connect governance, models, and data teams"
      )
    );
    const byRole = (page: typeof ciscoPage) =>
      new Map(
        page.sections.map((section) => [
          section.v2Role,
          `${section.headline ?? ""} ${section.body ?? ""}`.replace(/\s+/g, " ").trim()
        ])
      );
    const ciscoCopy = byRole(ciscoPage);
    const googleCopy = byRole(googlePage);
    const differingRoles = [...ciscoCopy].filter(
      ([role, copy]) => copy !== googleCopy.get(role)
    );

    expect([...ciscoCopy.keys()], JSON.stringify([...ciscoCopy.keys()])).toEqual([
      "shared-priority",
      "account-relevance",
      "shared-opportunity",
      "priority-paths",
      "validation-plan",
      "first-decision"
    ]);
    expect([...googleCopy.keys()]).toEqual([...ciscoCopy.keys()]);
    expect(differingRoles.length).toBeGreaterThanOrEqual(5);
    expect([...ciscoCopy.values()].join(" ")).toMatch(/secure networking|hybrid infrastructure/i);
    expect([...googleCopy.values()].join(" ")).toMatch(/responsible AI|cloud security/i);
    expect(JSON.stringify(ciscoPage)).not.toMatch(/has a current priority/i);
    expect(JSON.stringify(googlePage)).not.toMatch(/has a current priority/i);
    const adaptedCisco = applyProductionPageToDraft(
      deterministicDraft({
        brand: profile,
        targetBrand: cisco,
        useCase: "abm",
        answers: {
          ...session(profile, "align").answers,
          targetDomain: cisco.domain
        }
      }),
      ciscoPage
    );
    expect(adaptedCisco.persuasionFramework?.urgency.change).toMatch(
      /Cisco|secure networking/i
    );
    expect(
      ciscoPage.sections
        .filter(({ v2Role }) =>
          ["account-relevance", "shared-opportunity", "priority-paths"].includes(v2Role ?? "")
        )
        .some(({ evidenceRefs }) =>
          evidenceRefs.some((ref) => ref.startsWith("cisco.example:"))
        )
    ).toBe(true);
    expect(
      googlePage.sections
        .filter(({ v2Role }) =>
          ["account-relevance", "shared-opportunity", "priority-paths"].includes(v2Role ?? "")
        )
        .some(({ evidenceRefs }) =>
          evidenceRefs.some((ref) => ref.startsWith("google.example:"))
        )
    ).toBe(true);
  });

  it("keeps event campaigns on the Launch argument when a target domain is present", async () => {
    const profile = brand();
    const target = namedTarget({
      domain: "cisco.example",
      name: "Cisco",
      description: "Cisco connects and protects distributed organizations.",
      publicContext: "Cisco describes secure networking across hybrid infrastructure.",
      publicTopics: ["Secure networking", "Hybrid infrastructure"]
    });
    const currentSession = session(profile, "launch");
    currentSession.answers.targetDomain = target.domain;
    currentSession.answers.campaignType = "event";
    currentSession.answers.promotedOffer = "Acme Operations Summit";
    currentSession.answers.objective = "Register for the summit";
    currentSession.answers.ctaType = "register";
    currentSession.evidenceItems = [
      ...syntheticOfferEvidence("Acme Operations Summit", profile.domain),
      {
        id: "summit-agenda",
        type: "public-positioning",
        label: "Summit agenda",
        text: "Acme Operations Summit provides an agenda for approval workflow leaders.",
        sourceUrl: "https://acme.example/summit",
        signals: ["approval workflow leaders"],
        disposition: "available",
        entityRole: "seller",
        confidence: "high",
        evidenceType: "resource",
        subject: "Acme Operations Summit"
      },
      ...accountEvidence(
        target.domain,
        target.companyName,
        "Secure networking across hybrid infrastructure",
        "Observability programs connect network, security, and operations teams"
      )
    ];

    const result = await compileSessionProductionPage({
      session: currentSession,
      brand: profile,
      targetBrand: target,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page" || !result.artifact.value) return;
    expect(result.artifact.value.familyDecision?.family).toBe("launch");
    expect(
      result.artifact.value.sections.flatMap(({ evidenceRefs }) => evidenceRefs)
    ).not.toContain("cisco.example:focus");
    expect(JSON.stringify(result.artifact.value.sections)).not.toMatch(/secure networking/i);
  });

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
    expect(html).toContain("Acme Workflow Cloud");
    expect(html).toContain(">Book a meeting</a>");
  });

  it("uses the evidence-permitted Product/Solution thesis to bind live writer jobs", async () => {
    const profile = brand();
    const observed: SectionWritingContract[] = [];
    const result = await compileSessionProductionPage({
      session: session(profile),
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000,
      sectionModelClient: {
        async writeSection(contract) {
          observed.push(contract);
          return { sectionId: contract.sectionId, candidates: [] };
        }
      }
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;

    const plan = result.artifact.value!.familyDecision!.sectionPlan;
    expect(plan.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "recognize-buyer-outcome", role: "buyer-outcome" },
      { id: "name-constraint", role: "current-friction" },
      { id: "distinct-mechanism", role: "mechanism" },
      { id: "relevant-use-cases", role: "use-cases" },
      { id: "next-action", role: "next-move" }
    ]);
    expect(observed.map(({ sectionId, role }) => ({ id: sectionId, role }))).toEqual(
      plan.map(({ id, role }) => ({ id, role }))
    );
    expect(observed.map(({ sectionBrief }) => sectionBrief.semanticJob)).toEqual([
      "recognize the buyer and the promised outcome",
      "name the current constraint in the buyer's language",
      "explain the seller's distinct mechanism",
      "show the most relevant use cases or workflow",
      "make the next action the logical continuation"
    ]);
    expect(observed.every(({ strategyJobs }) => strategyJobs.length > 0)).toBe(true);
  });

  it("changes rendered copy with supported thesis inputs while keeping raw brief text out of diagnostics", async () => {
    const leftProfile = brand();
    const rightProfile: BrandProfile = {
      ...brand(),
      companyName: "Beacon Systems",
      title: "Signal Router",
      description: "Beacon Systems provides Signal Router.",
      publicContext: "Revenue teams route high-intent signals into named account work.",
      publicTopics: ["Signal Router", "Revenue orchestration"]
    };
    const leftSession = session(leftProfile);
    const rightSession = session(rightProfile);
    rightSession.answers = {
      ...rightSession.answers,
      promotedOffer: "Signal Router",
      audience: "Revenue orchestration leaders",
      objective: "route high-intent signals into named account work"
    };
    rightSession.evidenceItems = syntheticOfferEvidence("Signal Router", rightProfile.domain);
    const privateOnlyInput = "unpublished-free-form-brief-phrase-493";
    rightSession.answers.messageBelief = privateOnlyInput;

    const [left, right] = await Promise.all([
      compileSessionProductionPage({
        session: leftSession,
        brand: leftProfile,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000
      }),
      compileSessionProductionPage({
        session: rightSession,
        brand: rightProfile,
        providerStartedAtMs: 0,
        currentTimeMs: 10_000
      })
    ]);

    expect(left.outcome).toBe("production-page");
    expect(right.outcome).toBe("production-page");
    if (left.outcome !== "production-page" || right.outcome !== "production-page") return;

    const leftHtml = renderPage(leftSession, leftProfile, left.artifact.value!);
    const rightHtml = renderPage(rightSession, rightProfile, right.artifact.value!);
    expect(leftHtml).toContain("Acme Workflow Cloud");
    expect(rightHtml).toContain("Signal Router");
    expect(rightHtml).not.toEqual(leftHtml);
    expect(JSON.stringify(right.buildTrace.diagnostics)).not.toContain(privateOnlyInput);
    expect(JSON.stringify(right.buildTrace.diagnostics)).not.toContain("Signal Router");
  });

  it.each([
    {
      family: "launch" as const,
      labels: [
        "Outcome",
        "How it works",
        "Use cases",
        "Validate fit",
        "Next step"
      ],
      sectionIds: [
        "experience-overview",
        "outcome-mechanism",
        "application-paths",
        "credibility-anchor",
        "next-step"
      ],
      copy: [
        "Acme Workflow Cloud assigns request reviewers",
        "Acme Workflow Cloud gives operations leaders a governed way"
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
        "Acme Workflow Governance assigns request reviewers",
        "Acme Workflow Governance gives operations leaders a governed way"
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
        "TargetCo is prioritizing governed workflow ownership",
        "Acme Workflow Governance assigns request reviewers"
      ],
      cta: "Plan a validation session"
    }
  ])(
    "renders locked $family spine labels, copy, order, and CTA semantics",
    async ({ family, labels, sectionIds, copy, cta }) => {
      const profile = brand();
      const currentSession = session(profile, family);
      currentSession.evidenceItems!.push({
        ...syntheticOfferEvidence(currentSession.answers.promotedOffer!, profile.domain)[1]!,
        id: "fixture-offer-capability-escalation",
        text: "The escalation dashboard displays unresolved exceptions and their assigned policy owners."
      });
      const target = family === "align" ? targetBrand() : undefined;
      if (target) {
        currentSession.evidenceItems = [
          ...currentSession.evidenceItems!,
          ...accountEvidence(
            target.domain,
            target.companyName,
            "TargetCo is prioritizing governed workflow ownership",
            "TargetCo operates distributed revenue workflows"
          )
        ];
      }
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

  it("shortens a thin Guide plan before writing instead of repeating two facts across three sections", async () => {
    const profile = brand();
    const result = await compileSessionProductionPage({ session: session(profile, "guide"), brand: profile,
      providerStartedAtMs: 0, currentTimeMs: 10_000 });
    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const page = result.artifact.value!;
    expect(page.sections.map(({ v2Role }) => v2Role)).toEqual([
      "market-change", "stakes", "evaluation-criteria", "solution-mapping", "evaluation-close"
    ]);
    expect(page.familyDecision?.sectionPlan.map(({ role }) => role)).toEqual(page.sections.map(({ v2Role }) => v2Role));
    const explanations = page.sections.filter(({ v2Role }) => ["evaluation-criteria", "solution-mapping"].includes(v2Role ?? ""));
    expect(explanations.every(({ evidenceRefs }) => evidenceRefs.length === 1)).toBe(true);
    expect(new Set(explanations.flatMap(({ evidenceRefs }) => evidenceRefs)).size).toBe(2);
    expect(explanations.every(({ body, choices }) => Boolean(body) && !choices)).toBe(true);
  });

  it("omits an unsupported validation section instead of filling it with generic homework", async () => {
    const profile = brand();
    const result = await compileSessionProductionPage({ session: session(profile), brand: profile,
      providerStartedAtMs: 0, currentTimeMs: 10_000 });
    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const page = result.artifact.value!;
    expect(page.familyDecision?.sectionPlan.map(({ role }) => role)).not.toContain("validation-plan");
    expect(page.sections.map(({ v2Role }) => v2Role)).toEqual(page.familyDecision?.sectionPlan.map(({ role }) => role));
    expect(renderPage(session(profile), profile, page)).not.toContain("What to check in a product walkthrough");
  });

  it("builds the Dynatrace product page when the selected offer is a promise on the canonical source", async () => {
    const profile = brand();
    profile.domain = "dynatrace.example";
    profile.canonicalDomain = "dynatrace.example";
    profile.companyName = "Dynatrace";
    profile.sourceUrl = "https://dynatrace.example/";
    profile.logoUrl = "https://dynatrace.example/logo.svg";
    profile.imageUrls = ["https://dynatrace.example/product.png"];
    const currentSession = session(profile);
    currentSession.answers = {
      campaignType: "product",
      promotedOffer: "Automate the path from finding to fix",
      promotedOfferConfirmed: true,
      offerSourceUrl: "https://dynatrace.example/solutions/runtime-vulnerability-analytics/",
      offerSourceTitle: "Runtime Vulnerability Analytics",
      offerSourceConfirmed: true,
      messageBelief: "Automate the path from finding to fix",
      audience: "all teams",
      objective: "Evaluate the product",
      ctaType: "book-meeting"
    };
    currentSession.evidenceItems = [];
    currentSession.sourceArtifact = normalizePublicHtmlSource({
      sourceUrl: currentSession.answers.offerSourceUrl!,
      html: `<main>
        <h1>Runtime Vulnerability Analytics</h1><p>Continuously detect and reprioritize vulnerabilities using real-time runtime context.</p>
        <h2>Cut through vulnerability noise with runtime context</h2><p>Dynatrace continuously analyzes runtime behavior to surface only vulnerabilities that are active and reachable.</p>
        <h3>Immediate risk visibility</h3><p>Detect and prioritize runtime risks that directly impact production services.</p>
        <h3>Faster remediation</h3><p>Accelerate fixes with precise recommendations and agentic workflows that close the loop from detection to resolution.</p>
        <h2>Automate the path from finding to fix</h2><p>Dynatrace automatically prioritizes findings using runtime risk, guides developers with precise fix recommendations, and validates the fix.</p>
      </main>`
    });

    const result = await compileSessionProductionPage({
      session: currentSession,
      brand: profile,
      providerStartedAtMs: 0,
      currentTimeMs: 10_000
    });

    expect(
      result.outcome,
      result.outcome === "production-page"
        ? ""
        : JSON.stringify({
            instruction: result.instruction,
            quality: result.buildQuality,
            plan: result.buildPlanReceipt,
            sections: result.buildPlan?.sections.map(({ id, role, optional, claimRefs }) => ({ id, role, optional, claimRefs })),
            workers: result.workerReceipts
          })
    ).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.buildPlanReceipt?.offerFactCount).toBeGreaterThanOrEqual(4);
    expect(result.artifact.value?.sections.slice(1, -1).some(({ evidenceRefs }) =>
      evidenceRefs.some((ref) => ref.startsWith("source:"))
    )).toBe(true);
    const page = result.artifact.value!;
    const mechanism = page.sections.find(({ role }) => role === "mechanism")!;
    expect(mechanism.headline).not.toContain(currentSession.answers.promotedOffer!);
    const html = renderPage(currentSession, profile, page);
    const mechanismHtml = html.match(
      /<section class="framework-section mechanism-section"[\s\S]*?<\/section>/
    )?.[0];
    expect(mechanismHtml).toBeDefined();
    expect(mechanismHtml).toContain('<div class="mechanism-steps">');
    expect(mechanismHtml?.match(/<article\b/g)).toHaveLength(3);
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
  it.each(["clean", "timed-out"] as const)("repairs at most two sections and preserves blocker state after %s rereview", async (mode) => {
    const profile = brand();
    const baseline = await compileSessionProductionPage({ session: session(profile), brand: profile,
      providerStartedAtMs: 0, currentTimeMs: 10_000 });
    if (baseline.outcome !== "production-page") throw new Error("baseline_not_compiled");
    const originals = new Map(baseline.artifact.value!.sections.map((section) => [section.sectionId, section]));
    const repairs: string[] = [];
    let reviews = 0;
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (!contract.repairFeedback?.length) return { sectionId: contract.sectionId, candidates: [] };
        repairs.push(contract.sectionId);
        const original = originals.get(contract.sectionId)!;
        return { sectionId: contract.sectionId, candidates: [{
          headline: original.headline, body: original.body,
          ...(original.choices ? { choices: original.choices } : {}),
          ...(original.cta ? { cta: original.cta } : {}), evidenceRefs: [...original.evidenceRefs]
        }] };
      },
      async reviewPage(input) {
        reviews += 1;
        if (reviews > 1 && mode === "timed-out") {
          return new Promise<never>((_, reject) => input.signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true }));
        }
        return { version: input.version,
          issues: reviews === 1 ? [{ sectionIds: input.sections.slice(0, 4).map(({ id }) => id),
            code: "unsupported-claim", explanation: "Fixture editorial blocker", severity: "blocker" }] : [],
          summaries: input.sections.map(({ id }) => ({ sectionId: id, summary: "Fixture section reviewed" })) };
      }
    };
    const started = Date.now();
    const result = await compileSessionProductionPage({ session: session(profile), brand: profile,
      providerStartedAtMs: started, currentTimeMs: started, sectionModelClient: client });
    expect(repairs).toHaveLength(2);
    expect(reviews).toBe(2);
    expect(result.semanticReview?.status).toBe("reviewed");
    if (result.semanticReview?.status !== "reviewed") throw new Error("missing review receipt");
    if (mode === "clean") {
      expect(result.semanticReview.issues).toEqual([]);
      expect(result.outcome).toBe("production-page");
    } else {
      expect(result.semanticReview.issues[0]?.severity).toBe("blocker");
      expect(result).toMatchObject({ outcome: "safe-deterministic-fallback", instruction: { code: "GPE_FACTUALITY_REJECTED" } });
    }
  }, 10_000);

  const MODEL_HEADLINE = "Operations leaders use Acme Workflow Cloud";
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

  it("restores only rejected model copy before the final page gates", async () => {
    const select = sectionSelection.selectSectionCopy;
    const spy = vi.spyOn(sectionSelection, "selectSectionCopy").mockImplementation((entries) =>
      select(entries).map((selection) => {
        if (selection.candidate?.role !== "hero") return selection;
        // Inject a failure after the earlier selector to exercise the separate
        // final factuality boundary, rather than testing that selector again.
        const candidate = { ...selection.candidate, body: "This service cuts operating costs by 94 percent." };
        candidate.wordCount = sectionCopyWordCount(candidate);
        return { ...selection, candidate };
      }));
    try {
      const profile = brand();
      const { target, result } = await modelAssistedCompile(profile);
      expect(result.outcome).toBe("production-page");
      expect(result.compileReceipts).toEqual(expect.arrayContaining([expect.objectContaining({ detailCode: "rejected_model_sections_restored", artifactCount: 1 })]));
      if (result.outcome !== "production-page") throw new Error("page_not_compiled");
      expect(result.artifact.value?.sections.find(({ sectionId }) => sectionId === target.sectionId)?.body).toBe(target.body);
      expect(renderPage(session(profile), profile, result.artifact.value!)).not.toContain("94 percent");
      expect(result.buildTrace.sections.find(({ sectionId }) => sectionId === target.sectionId)?.writerMode).toBe("deterministic");
      expect(result.buyerReadyPerformance).toMatchObject({ modelSections: 0,
        fallbackSections: result.artifact.value!.sections.length });
    } finally { spy.mockRestore(); }
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
    expect(html).not.toContain('<p class="eyebrow"');
    expect(html).not.toMatch(
      /<p class="eyebrow">[\s\S]{0,200}?<h2>[\s\S]{0,200}?<p class="dek">/
    );

    const headlines = page.sections.map(({ headline }) => (headline ?? "").trim());
    expect(new Set(headlines).size).toBe(headlines.length);
    const bodies = page.sections.map(({ body }) => (body ?? "").trim());
    expect(new Set(bodies).size).toBe(bodies.length);
    for (const [index, body] of bodies.entries()) {
      for (const other of bodies.slice(index + 1)) {
        expect(copySimilarity(body, other), `Repeated bodies: ${body} / ${other}`).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
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
