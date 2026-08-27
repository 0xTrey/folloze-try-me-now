/**
 * Integration cover for the messaging compiler in the real production path.
 *
 * The unit tests around the compiler prove it picks a strategy. What they
 * cannot prove is that the pick matters, so everything here goes through
 * `compileSessionProductionPage` and reads the rendered HTML: the same session
 * compiled with and without one piece of researched evidence has to select a
 * different tension and say something different on the page, and a session
 * where no candidate clears its gates has to still ship a page.
 */

import { describe, expect, it } from "vitest";

import { buildExperienceSpec } from "@/lib/experience-contract";
import { renderExperienceHtml } from "@/lib/generation/experience-template";
import { validateMessagingCompilerArtifact } from "@/lib/generation/messaging-compiler-contracts";
import { applyProductionPageToDraft } from "@/lib/generation/production-draft-adapter";
import { deterministicDraft } from "@/lib/integrations/openai";
import type { BrandProfile, SessionEvidenceItem, TryMeSession } from "@/lib/types";

import { compileSessionProductionPage } from "./session-production-engine";

const now = "2026-08-22T18:00:00.000Z";

/** The one researched fact that separates the two compiles below. */
const APPROVAL_QUEUE_CLAIM =
  "Acme published that operations teams wait three days for a workflow approval decision.";

/** What the route says about the status quo when no research supplies one. */
const ROUTE_TENSION = "Teams connect approved workflow steps across operations.";

function brand(): BrandProfile {
  return {
    domain: "acme.example",
    canonicalDomain: "acme.example",
    domainAliases: [],
    companyName: "Acme",
    title: "Acme Workflow Cloud",
    description: "Acme provides governed workflow automation.",
    publicContext: ROUTE_TENSION,
    publicTopics: ["Workflow automation", "Governed operations"],
    logoUrl: "https://acme.example/logo.svg",
    displayFontFamily: "Acme Sans",
    bodyFontFamily: "Acme Sans",
    designDna: {
      version: 1,
      source: "verified-profile",
      confidence: "high",
      buttons: { radiusPx: 6, borderWidthPx: 1 },
      cards: { radiusPx: 10, borderWidthPx: 1, shadow: "soft" },
      spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 88, gridGapPx: 20 }
    },
    imageUrls: ["https://acme.example/product.png"],
    colors: ["#111111", "#FFFFFF", "#3B82F6"],
    primaryColor: "#111111",
    accentColor: "#3B82F6",
    surfaceColor: "#FFFFFF",
    sourceUrl: "https://acme.example/",
    source: "brand-harvester",
    diagnostics: {
      logo: {
        strategy: "verified-profile",
        imageCandidateCount: 1,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0,
        resolutionComplete: true
      },
      palette: {
        strategy: "semantic-tokens",
        confidence: "high",
        candidateCount: 3,
        semanticCandidateCount: 3,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    }
  };
}

const approvalQueueEvidence: SessionEvidenceItem = {
  id: "ev-approval-queue",
  type: "public-operating-context",
  label: "Approval queue backlog",
  text: APPROVAL_QUEUE_CLAIM,
  sourceUrl: "https://acme.example/operations",
  signals: ["approval queue"],
  disposition: "available",
  entityRole: "seller",
  confidence: "high"
};

function session(options: {
  evidenceItems?: SessionEvidenceItem[];
  offer?: string;
} = {}): TryMeSession {
  return {
    id: "session-messaging-compiler",
    editorTokenHash: "hash",
    useCase: "campaign",
    companyDomain: "acme.example",
    status: "generating",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: "https://example.test/e/session-messaging-compiler",
    revision: 7,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "complete", completedAt: now },
      story: { status: "running", startedAt: now }
    },
    answers: {
      campaignType: "product",
      promotedOffer: options.offer ?? "Acme Workflow Cloud",
      audience: "Operations leaders",
      objective: "Evaluate workflow automation",
      ctaType: "book-meeting",
      ctaStyle: "solid"
    },
    brand: brand(),
    audienceSuggestions: ["Operations leaders"],
    audienceRecommendations: [],
    evidenceItems: options.evidenceItems ?? [],
    events: []
  };
}

async function compile(options: Parameters<typeof session>[0] = {}) {
  const profile = brand();
  const current = session(options);
  const result = await compileSessionProductionPage({
    session: current,
    brand: profile,
    providerStartedAtMs: 0,
    currentTimeMs: 10_000
  });
  if (result.outcome !== "production-page") {
    throw new Error(`expected a production page, compiled ${result.outcome}`);
  }
  const page = result.artifact.value!;
  const draft = applyProductionPageToDraft(
    deterministicDraft({
      brand: profile,
      useCase: current.useCase,
      answers: current.answers
    }),
    page
  );
  const spec = buildExperienceSpec(current, draft, profile, undefined, page);
  const html = renderExperienceHtml({
    draft,
    brand: profile,
    useCase: current.useCase,
    answers: current.answers,
    wireframeSelection: spec.wireframeSelection,
    productionSections: spec.production?.sections,
    actions: spec.actions
  });
  return { result, page, html };
}

/** The section the compiled page plan put the tension job on. */
function tensionSectionId(
  receipt: NonNullable<Awaited<ReturnType<typeof compile>>["result"]["messagingCompiler"]>
): string {
  const owner = receipt.artifact.pagePlan.sectionPlan.find(({ strategyJobs }) =>
    strategyJobs.includes("tension")
  );
  if (!owner) throw new Error("no section owns the tension job");
  return owner.id;
}

describe("messaging compiler in the production path", () => {
  it("compiles a strategy artifact that survives its own validation", async () => {
    const { result } = await compile({ evidenceItems: [approvalQueueEvidence] });
    const receipt = result.messagingCompiler;

    expect(receipt).toBeDefined();
    expect(validateMessagingCompilerArtifact(receipt!.artifact)).toEqual([]);
    expect(receipt!.artifact.strategies).toHaveLength(4);
    expect(receipt!.evaluations).toHaveLength(4);
    expect(receipt!.artifact.selectedStrategyId).toBe("strategy-upside");
    expect(
      receipt!.artifact.strategies.map(({ id }) => id)
    ).toContain(receipt!.artifact.selectedStrategyId);
  });

  it("gives every rendered section exactly one job no other section holds", async () => {
    const { result, page } = await compile({ evidenceItems: [approvalQueueEvidence] });
    const plan = result.messagingCompiler!.artifact.pagePlan.sectionPlan;
    const jobs = plan.flatMap(({ strategyJobs }) => strategyJobs);
    const planned = new Set(plan.map(({ id }) => id));

    expect(plan.map(({ strategyJobs }) => strategyJobs.length)).toEqual(plan.map(() => 1));
    expect(new Set(jobs).size).toBe(jobs.length);
    for (const section of page.sections) {
      expect(planned, `${section.sectionId} is missing from the page plan`).toContain(
        section.sectionId
      );
    }
  });

  it("renders the tension the selected strategy took from researched evidence", async () => {
    const { result, page, html } = await compile({ evidenceItems: [approvalQueueEvidence] });
    const receipt = result.messagingCompiler!;
    const selected = receipt.artifact.strategies.find(
      ({ id }) => id === receipt.artifact.selectedStrategyId
    )!;
    const owner = page.sections.find(
      ({ sectionId }) => sectionId === tensionSectionId(receipt)
    )!;

    expect(selected.tension).toBe(APPROVAL_QUEUE_CLAIM);
    expect(owner.body).toContain(APPROVAL_QUEUE_CLAIM);
    expect(html).toContain(APPROVAL_QUEUE_CLAIM);
  });

  it("says something different on that section when the evidence is not there", async () => {
    const researched = await compile({ evidenceItems: [approvalQueueEvidence] });
    const bare = await compile();

    const researchedOwner = researched.page.sections.find(
      ({ sectionId }) => sectionId === tensionSectionId(researched.result.messagingCompiler!)
    )!;
    const bareOwner = bare.page.sections.find(
      ({ sectionId }) => sectionId === tensionSectionId(bare.result.messagingCompiler!)
    )!;

    // Same route, same section, same slot. Only the compiled tension moved.
    expect(bareOwner.sectionId).toBe(researchedOwner.sectionId);
    expect(bareOwner.headline).toBe(researchedOwner.headline);
    expect(bareOwner.body).not.toBe(researchedOwner.body);
    expect(bareOwner.body).toContain(ROUTE_TENSION);
    expect(bareOwner.body).not.toContain(APPROVAL_QUEUE_CLAIM);
    expect(bare.html).not.toContain(APPROVAL_QUEUE_CLAIM);
  });

  it("binds the compiled tension only to the evidence that stated it", async () => {
    const { result } = await compile({ evidenceItems: [approvalQueueEvidence] });
    const receipt = result.messagingCompiler!;
    const selected = receipt.artifact.strategies.find(
      ({ id }) => id === receipt.artifact.selectedStrategyId
    )!;

    expect(selected.evidenceRefs).toContain("ev-approval-queue");
    expect(receipt.artifact.evidenceLedger.map(({ id }) => id)).toContain("ev-approval-queue");
  });

  it("records the messaging decision in the private trace without publishing it", async () => {
    const { result, page } = await compile({ evidenceItems: [approvalQueueEvidence] });
    const messaging = result.buildTrace.decisions.messaging;

    expect(messaging?.selectedCandidateId).toBe("strategy-upside");
    expect(messaging?.candidates.length).toBeGreaterThan(1);
    // The receipt carries ledger claim text, so none of it may reach the page.
    expect(JSON.stringify(page)).not.toContain("Approval queue backlog");
    expect(JSON.stringify(result.buildTrace)).not.toContain(APPROVAL_QUEUE_CLAIM);
  });

  it("still ships a page when no candidate clears its gates", async () => {
    // "our platform" names nothing, so every candidate fails to identify the
    // offer it is arguing for and the compiler returns no artifact at all.
    const { result, page, html } = await compile({ offer: "our platform" });

    expect(result.messagingCompiler).toBeUndefined();
    expect(result.buildTrace.decisions.messaging).toBeUndefined();
    expect(result.outcome).toBe("production-page");
    expect(page.sections.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("data-journey-section=");
  });

  it("falls back to the route's own argument rather than a half-applied strategy", async () => {
    const compiled = await compile();
    const fallback = await compile({ offer: "our platform" });

    expect(compiled.result.messagingCompiler).toBeDefined();
    expect(fallback.result.messagingCompiler).toBeUndefined();

    const compiledRoles = compiled.page.sections.map(({ v2Role }) => v2Role);
    const fallbackRoles = fallback.page.sections.map(({ v2Role }) => v2Role);

    // The route contract is untouched by the compiler's absence; only the
    // argument inside those sections comes from somewhere else.
    expect(fallbackRoles).toEqual(compiledRoles);
    expect(fallback.page.sections.every(({ body }) => (body ?? "").trim().length > 0)).toBe(true);
  });
});
