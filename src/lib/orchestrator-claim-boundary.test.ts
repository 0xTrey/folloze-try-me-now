import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendClaimEmail } from "@/lib/integrations/email";
import { publishClaimedExperience } from "@/lib/integrations/folloze";
import { generateExperienceDraft, SourceFetchError } from "@/lib/integrations/openai";
import { recordLeadCapture, updateLeadOutcome } from "@/lib/lead-store";
import { portableBrandLogoFromSvg } from "@/lib/portable-brand-logo";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import {
  claimSession,
  patchSessionAnswers,
  reconcileLeadSession,
  recoverSessionWork,
  runStoryStage
} from "@/lib/orchestrator";
import {
  BUILD_PHASE_ORDER,
  canRevealFinalExperience,
  isBuildInProgress
} from "@/lib/preview-lifecycle";
import { deleteSession, getSession, putSession, toPublicSession } from "@/lib/session-store";
import type {
  BrandProfile,
  ExperienceModel,
  FinalArtifactReceipt,
  QualityReceipt,
  TryMeSession
} from "@/lib/types";

vi.mock("@/lib/integrations/email", () => ({ sendClaimEmail: vi.fn() }));
vi.mock("@/lib/integrations/folloze", () => ({ publishClaimedExperience: vi.fn() }));
vi.mock("@/lib/integrations/openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/openai")>()),
  generateExperienceDraft: vi.fn()
}));
vi.mock("@/lib/lead-store", () => ({
  leadStoreMode: "memory-test",
  recordLeadCapture: vi.fn(),
  updateLeadOutcome: vi.fn()
}));

const sessionIds = new Set<string>();

const brand: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Enterprise integration and workflow automation.",
  publicTopics: ["Integration", "Workflow automation", "API management"],
  logoUrl: "https://jitterbit.com/logo.svg",
  imageUrls: [],
  colors: ["#1B3E51", "#F44414", "#FFFFFF"],
  primaryColor: "#1B3E51",
  accentColor: "#F44414",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "Roboto Slab",
  bodyFontFamily: "Inter",
  displayFontUrl: "https://cdn.jitterbit.example/fonts/roboto-slab.woff2",
  sourceUrl: "https://jitterbit.com",
  source: "fast-extractor",
  identity: {
    expectedDomain: "jitterbit.com",
    canonicalDomain: "jitterbit.com",
    canonicalName: "Jitterbit",
    confirmationStatus: "confirmed",
    confidence: "high",
    confirmedBy: "system",
    reasons: [],
    provenance: []
  },
  designDna: {
    version: 1,
    source: "verified-profile",
    confidence: "high",
    typography: { fallback: "sans", headingWeight: 700, bodyWeight: 400 },
    buttons: { primaryBackground: "#F44414", radiusPx: 6, heightPx: 44, borderWidthPx: 0 },
    cards: { radiusPx: 8, borderWidthPx: 1, shadow: "soft" },
    spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 88, gridGapPx: 24 }
  },
  diagnostics: {
    logo: {
      strategy: "official-remote-portable",
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

const draft: ExperienceDraft = {
  campaignRegister: "campaign-product",
  designRegister: "source-brand-technical",
  wireframeName: "product-launch-landing-page",
  experienceShape: "interactive-workbench",
  sectionSequence: ["decision-lenses", "guided-questions", "thesis"],
  sectionLabels: {
    thesis: "The operating shift",
    lenses: "Explore what changes",
    journey: "Questions for the first use case",
    close: "Choose the first use case"
  },
  title: "Jitterbit enterprise automation",
  eyebrow: "Jitterbit",
  headline: "Connect systems. Automate workflows.",
  subhead: "Help enterprise architects connect workflows while keeping control visible.",
  thesisHeadline: "Move faster without making governance an afterthought.",
  thesisBody: "Bring integration, automation, and API management into one operating path.",
  primaryCta: "See how it works",
  audienceLabel: "Enterprise architects and platform owners",
  narrativeArc: "What should enterprise architecture teams validate next?",
  sections: [
    {
      eyebrow: "Connect",
      headline: "Unify the integration path",
      body: "Connect applications and data across the workflows that matter first.",
      proof: "Which systems need a governed connection first?"
    },
    {
      eyebrow: "Automate",
      headline: "Turn repeatable work into workflows",
      body: "Coordinate people, systems, and approvals without hiding the operating logic.",
      proof: "Where can automation remove the most manual handoffs?"
    },
    {
      eyebrow: "Govern",
      headline: "Keep control visible",
      body: "Make API and automation governance part of the path from the beginning.",
      proof: "What controls must stay visible as automation expands?"
    }
  ],
  signalLabels: ["Integration", "Automation", "Governance"],
  closingHeadline: "Start with one workflow worth proving.",
  closingBody: "Choose a bounded path, connect it, and validate how it operates before expanding."
};

function experience(): ExperienceModel {
  return {
    ...draft,
    sections: draft.sections.map((section) => ({ ...section })),
    signalLabels: [...draft.signalLabels],
    html: "<!doctype html><title>Jitterbit enterprise automation</title>",
    readiness: "final",
    generationSource: "deterministic-fallback",
    artifactRevision: 2,
    artifactDigest: "a".repeat(64)
  };
}

/**
 * Under the final-only lifecycle an artifact is not claimable on its own. Save
 * reuses the reveal gate, so a fixture that stands for an already-revealed
 * experience needs the read-back receipt. The asynchronous quality receipt is
 * useful operational evidence, but it cannot block an email capture after the
 * visitor has already received the final artifact.
 */
function finalReceiptFor(model: ExperienceModel): FinalArtifactReceipt {
  return {
    readiness: "final",
    artifactRevision: model.artifactRevision,
    artifactDigest: model.artifactDigest,
    structuralGate: "passed",
    truthGate: "passed",
    persistedAt: "2026-07-30T00:00:01.000Z",
    readBackAt: "2026-07-30T00:00:02.000Z"
  };
}

function qualityReceiptFor(model: ExperienceModel): QualityReceipt {
  return {
    status: "passed",
    checkedAt: "2026-07-30T00:00:01.000Z",
    artifactRevision: model.artifactRevision,
    checks: []
  };
}

function session(input: {
  id: string;
  status?: TryMeSession["status"];
  includeExperience?: boolean;
}): TryMeSession {
  sessionIds.add(input.id);
  const model = input.includeExperience ? experience() : undefined;
  return {
    id: input.id,
    editorTokenHash: "private-editor-token-hash",
    useCase: "campaign",
    companyDomain: "jitterbit.com",
    status: input.status ?? "collecting",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    temporaryUrl: `https://preview.example/e/${input.id}`,
    revision: 1,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: input.includeExperience ? "complete" : "pending" }
    },
    answers: {
      audience: "Enterprise architects and platform owners",
      objective: "Book a meeting",
      campaignType: "product",
      promotedOffer: "Jitterbit Harmony"
    },
    brand,
    audienceSuggestions: [],
    experience: model,
    finalArtifact: model ? finalReceiptFor(model) : undefined,
    qualityReceipt: model ? qualityReceiptFor(model) : undefined,
    events: []
  };
}

describe("anonymous preview and claim publication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // The verified brand fixture reaches real font and asset resolution, the
    // only part of this path that touches the network. Failing every fetch
    // keeps the claim-boundary assertions hermetic rather than letting them
    // stall on live requests.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in test"));
    vi.mocked(generateExperienceDraft).mockResolvedValue({
      draft: {
        ...draft,
        sections: draft.sections.map((section) => ({ ...section })),
        signalLabels: [...draft.signalLabels]
      },
      source: "deterministic-fallback",
      durationMs: 25,
      fallbackReason: "openai_not_configured"
    });
    vi.mocked(recordLeadCapture).mockResolvedValue({} as never);
    vi.mocked(publishClaimedExperience).mockResolvedValue({
      mode: "preview-only",
      publicUrl: undefined,
      warnings: []
    });
    vi.mocked(sendClaimEmail).mockResolvedValue("skipped");
    vi.mocked(updateLeadOutcome).mockResolvedValue(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([...sessionIds].map((id) => deleteSession(id)));
    sessionIds.clear();
  });

  // Regression: unclaimed generation must remain cache-only and never publish to Folloze.
  it("finishes an anonymous preview without publishing or recording a lead", async () => {
    const pending = session({ id: "anonymous-preview-boundary" });
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored).toMatchObject({
      status: "preview_ready_unclaimed",
      experience: { generationSource: "deterministic-fallback" },
      qualityReceipt: {
        status: "passed",
        artifactRevision: expect.any(Number),
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "copy", status: "passed" }),
          expect.objectContaining({
            id: "cta",
            status: "passed",
            detail: "The explore intent and solid treatment are ready."
          })
        ])
      }
    });
    expect(stored?.experience?.html).toContain(
      `/api/sessions/${pending.id}/font/display`
    );
    expect(stored?.experience?.html).not.toContain(
      "cdn.jitterbit.example/fonts/roboto-slab.woff2"
    );
    expect(generateExperienceDraft).toHaveBeenCalledOnce();
    expect(publishClaimedExperience).not.toHaveBeenCalled();
    expect(recordLeadCapture).not.toHaveBeenCalled();
    expect(updateLeadOutcome).not.toHaveBeenCalled();
    expect(sendClaimEmail).not.toHaveBeenCalled();
  });

  it("uses the deterministic final when a model pass would consume the finalization reserve", async () => {
    const pending = session({ id: "anonymous-preview-budget-reserve" });
    // Past the writing-phase handover, so the shared budget leaves the section
    // writer no window at all and the reserve stays intact for render, persist,
    // and read-back.
    pending.events.push({
      name: "generation_eligible",
      at: new Date(Date.now() - 44_500).toISOString(),
      meta: { trigger: "answers" }
    });
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(generateExperienceDraft).not.toHaveBeenCalled();
    expect(stored).toMatchObject({
      status: "preview_ready_unclaimed",
      experience: { generationSource: "deterministic-fallback", readiness: "final" }
    });
    expect(stored?.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "generation_refinement_skipped",
        meta: expect.objectContaining({
          reason: "generation_budget_reserved_finalization",
          budgetMs: 60_000,
          finalizationReserveMs: 5_000
        })
      })
    ]));
    // Skipping the model pass is only correct if it buys a real final artifact:
    // the reserve was still unspent and the deterministic result was read back.
    const skipped = stored?.events.find(
      (event) => event.name === "generation_refinement_skipped"
    );
    expect(Number(skipped?.meta?.remainingBeforeFinalizationMs)).toBeGreaterThan(0);
    expect(stored?.finalArtifact).toMatchObject({
      readiness: "final",
      structuralGate: "passed",
      truthGate: "passed",
      artifactRevision: stored?.experience?.artifactRevision,
      artifactDigest: stored?.experience?.artifactDigest
    });
    expect(canRevealFinalExperience(toPublicSession(stored!))).toBe(true);
  });

  it("reveals nothing while slow model refinement runs, then only the receipted final", async () => {
    const pending = session({ id: "build-in-progress-before-model" });
    pending.events.push({
      name: "generation_eligible",
      at: new Date().toISOString(),
      meta: { trigger: "answers", revision: pending.revision }
    });
    await putSession(pending);

    let resolveGeneration!: (value: Awaited<ReturnType<typeof generateExperienceDraft>>) => void;
    vi.mocked(generateExperienceDraft).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );

    const completion = runStoryStage(pending.id);
    await vi.waitFor(async () => {
      expect(await getSession(pending.id)).toMatchObject({
        status: "generating",
        stages: { story: { status: "running" } }
      });
    });

    // The former provisional artifact is gone: mid-build there is no artifact,
    // no receipt, and nothing the reveal gate will serve.
    const building = await getSession(pending.id);
    expect(building?.experience).toBeUndefined();
    expect(building?.finalArtifact).toBeUndefined();
    expect(isBuildInProgress(toPublicSession(building!))).toBe(true);
    expect(BUILD_PHASE_ORDER).toContain(building?.buildProgress?.phase);
    expect(canRevealFinalExperience(toPublicSession(building!))).toBe(false);
    expect(building?.events.map(({ name }) => name)).not.toContain("preview_provisional_ready");
    await expect(claimSession(pending.id, "buyer@example.com")).rejects.toThrow(
      /not ready|still being built/i
    );
    expect(recordLeadCapture).not.toHaveBeenCalled();

    resolveGeneration({
      draft: {
        ...draft,
        headline: "A refined buyer-ready campaign",
        sections: draft.sections.map((section) => ({ ...section })),
        signalLabels: [...draft.signalLabels]
      },
      source: "openai",
      durationMs: 18_000
    });
    await completion;

    const final = await getSession(pending.id);
    // The slow model pass, not a deterministic fallback, is what produced the
    // one revealed artifact. Its global draft hero deliberately does not win the
    // headline; production section copy owns that.
    expect(final).toMatchObject({
      status: "preview_ready_unclaimed",
      experience: {
        readiness: "final",
        generationSource: "openai"
      },
      stages: { story: { status: "complete" } },
      buildProgress: { phase: "ready" }
    });
    expect(final?.experience?.html).not.toContain("A refined buyer-ready campaign");
    expect(final?.finalArtifact).toMatchObject({
      readiness: "final",
      structuralGate: "passed",
      truthGate: "passed",
      artifactRevision: final?.experience?.artifactRevision,
      artifactDigest: final?.experience?.artifactDigest
    });
    expect(final?.buildProgress?.receipts.map(({ phase, status }) => ({ phase, status }))).toEqual(
      BUILD_PHASE_ORDER.map((phase) => ({ phase, status: "complete" }))
    );
    expect(final?.buildProgress?.receipts.find(({ phase }) => phase === "writing")?.evidenceNote).toMatch(
      /Writing section \d+ of \d+|sections? written/i
    );
    expect(final?.buildProgress?.receipts.find(({ phase }) => phase === "checking")?.evidenceNote).toMatch(
      /sections? checked/i
    );
    expect(canRevealFinalExperience(toPublicSession(final!))).toBe(true);
    expect(final!.experience!.artifactRevision).toBeGreaterThan(pending.revision);

    // The reveal latency receipt the provisional event used to carry now lives
    // on the one event that marks a revealable artifact.
    const readyEvent = final?.events.find((event) => event.name === "preview_ready");
    expect(readyEvent?.meta).toMatchObject({
      artifactRevision: final?.experience?.artifactRevision,
      eligibleToFinalMs: expect.any(Number)
    });
    expect(Number(readyEvent?.meta?.eligibleToFinalMs)).toBeLessThan(10_000);
  });

  it("refuses to claim a persisted final artifact that has not been read back", async () => {
    const persisted = session({
      id: "claim-before-readback",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    // The window between the final write and the read-back confirmation: the
    // artifact exists and says `final`, but nothing has proved it is readable.
    persisted.finalArtifact = undefined;
    await putSession(persisted);

    await expect(claimSession(persisted.id, "buyer@example.com")).rejects.toMatchObject({
      code: "claim_not_ready"
    });
    expect(canRevealFinalExperience(toPublicSession(persisted))).toBe(false);
    expect(recordLeadCapture).not.toHaveBeenCalled();
  });

  it("captures the email after final read-back while the quality receipt is pending", async () => {
    const ready = session({
      id: "claim-before-quality-receipt",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    ready.qualityReceipt = undefined;
    await putSession(ready);

    const result = await claimSession(ready.id, "buyer@acme.test");

    expect(recordLeadCapture).toHaveBeenCalledWith(
      expect.objectContaining({ id: ready.id }),
      "buyer@acme.test"
    );
    expect(result).toMatchObject({
      publishMode: "preview-only",
      emailDelivery: "skipped",
      session: { status: "claimed" }
    });
  });

  it("keeps a verified brand with incomplete design DNA on the build path", async () => {
    const pending = session({ id: "build-incomplete-design-dna" });
    pending.brand = {
      ...brand,
      portableLogo: portableBrandLogoFromSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" aria-label="Jitterbit logo"><path fill="#F44414" d="M0 0h20v10H0z"/></svg>',
        "official-remote-asset"
      ),
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "low",
        theme: { hero: "light" },
        typography: {},
        buttons: {},
        cards: {},
        spacing: {}
      }
    };
    let resolveGeneration!: (value: Awaited<ReturnType<typeof generateExperienceDraft>>) => void;
    vi.mocked(generateExperienceDraft).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );
    await putSession(pending);

    const completion = runStoryStage(pending.id);
    await vi.waitFor(async () => {
      expect(await getSession(pending.id)).toMatchObject({
        status: "generating",
        stages: { story: { status: "running" } }
      });
    });
    const building = await getSession(pending.id);
    // Incomplete design DNA must not make the build ask the buyer for brand
    // help, and it must not produce a visible intermediate artifact either.
    expect(building?.events).not.toContainEqual(
      expect.objectContaining({ name: "brand_help_required" })
    );
    expect(building?.experience).toBeUndefined();

    resolveGeneration({
      draft: { ...draft, sections: draft.sections.map((section) => ({ ...section })) },
      source: "openai",
      durationMs: 18_000
    });
    await completion;

    const final = await getSession(pending.id);
    expect(final).toMatchObject({
      status: "preview_ready_unclaimed",
      experience: { readiness: "final" }
    });
    expect(final?.events).not.toContainEqual(
      expect.objectContaining({ name: "brand_help_required" })
    );
    expect(canRevealFinalExperience(toPublicSession(final!))).toBe(true);
  });

  it("does not start generation before the material brief is eligible", async () => {
    const pending = session({ id: "domain-ready-brief-incomplete" });
    delete pending.answers.audience;
    delete pending.answers.objective;
    pending.brand = {
      ...brand,
      identity: {
        expectedDomain: "jitterbit.com",
        canonicalDomain: "jitterbit.com",
        canonicalName: "Jitterbit",
        confirmationStatus: "confirmed",
        confidence: "high",
        reasons: [],
        provenance: []
      }
    };
    pending.audienceSuggestions = ["Integration and automation leaders"];
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored?.experience).toBeUndefined();
    expect(stored?.status).toBe("collecting");
    expect(generateExperienceDraft).not.toHaveBeenCalled();
  });

  it("discards a late refinement after the buyer brief changes", async () => {
    const pending = session({ id: "build-stale-refinement" });
    await putSession(pending);

    let resolveGeneration!: (value: Awaited<ReturnType<typeof generateExperienceDraft>>) => void;
    vi.mocked(generateExperienceDraft).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );

    const completion = runStoryStage(pending.id);
    await vi.waitFor(async () => {
      expect((await getSession(pending.id))?.stages.story.status).toBe("running");
    });
    const building = await getSession(pending.id);
    const supersededAttemptId = building?.stages.story.attemptId;
    expect(supersededAttemptId).toBeTruthy();

    await patchSessionAnswers(pending.id, { objective: "Drive product evaluation" });
    resolveGeneration({
      draft: {
        ...draft,
        headline: "Stale model output must never replace the page",
        sections: draft.sections.map((section) => ({ ...section })),
        signalLabels: [...draft.signalLabels]
      },
      source: "openai",
      durationMs: 20_000
    });
    await completion;

    const stored = await getSession(pending.id);
    expect(stored?.answers.objective).toBe("Drive product evaluation");
    expect(stored?.events).toContainEqual(
      expect.objectContaining({
        name: "generation_discarded",
        meta: expect.objectContaining({
          reason: "input_changed",
          attemptId: supersededAttemptId
        })
      })
    );
    // The superseded attempt's copy may never become the revealed page.
    // Restarting against the newer brief is correct, so any artifact that
    // survives has to belong to the attempt that actually finished and carry
    // its own matching receipt.
    expect(stored?.experience?.headline).not.toBe(
      "Stale model output must never replace the page"
    );
    expect(JSON.stringify(stored?.experience ?? {})).not.toContain("Stale model output");
    expect(stored?.stages.story.attemptId).not.toBe(supersededAttemptId);
    if (stored?.finalArtifact) {
      expect(stored.finalArtifact.artifactRevision).toBe(stored.experience?.artifactRevision);
      expect(stored.finalArtifact.artifactDigest).toBe(stored.experience?.artifactDigest);
      expect(canRevealFinalExperience(toPublicSession(stored))).toBe(true);
    } else {
      expect(canRevealFinalExperience(toPublicSession(stored!))).toBe(false);
    }
  });

  it("passes CTA readiness from intent and style without requiring a destination URL", async () => {
    const pending = session({ id: "cta-style-only-preview" });
    pending.answers.ctaType = "book-meeting";
    pending.answers.ctaStyle = "outline";
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect("ctaDestination" in (stored?.answers ?? {})).toBe(false);
    expect(stored?.qualityReceipt?.checks).toContainEqual(
      expect.objectContaining({
        id: "cta",
        status: "passed",
        detail: "The book-meeting intent and outline treatment are ready."
      })
    );
    expect(stored?.experienceSpec?.cta).toEqual({
      intent: "book-meeting",
      style: "outline",
      label: "Book a meeting",
      actionId: "primary-conversion"
    });
    expect(stored?.experience?.html).toContain('data-cta-style="outline"');
  });

  it("renders selected assets and block overrides inside the selected campaign template without buyer-facing QA chrome", async () => {
    const pending = session({ id: "workspace-render-controls" });
    pending.answers = {
      ...pending.answers,
      ctaType: "explore",
      selectedAssetIds: ["asset_selected_visual"],
      layoutVariant: "immersive",
      styleVariant: "brand-led"
    };
    pending.availableAssets = [{
      id: "asset_selected_visual",
      kind: "seller-image",
      label: "Selected platform visual",
      url: "https://jitterbit.com/selected-platform-visual.jpg",
      source: "seller"
    }];
    pending.blockControls = [
      {
        id: "hero",
        locked: true,
        headline: "A controlled headline that survives regeneration.",
        body: "This supporting message is persisted as an explicit workspace override."
      },
      {
        id: "closing",
        ctaLabel: "Explore the architecture"
      }
    ];
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored?.experience).toMatchObject({
      headline: "A controlled headline that survives regeneration.",
      subhead: "This supporting message is persisted as an explicit workspace override.",
      primaryCta: "Explore the architecture"
    });
    expect(stored?.experience?.html).toMatch(
      /\/api\/sessions\/workspace-render-controls\/image\/seller-image-0\?v=\d+/
    );
    expect(stored?.experience?.html).not.toContain(
      "https://jitterbit.com/selected-platform-visual.jpg"
    );
    expect(stored?.experience?.html).not.toContain("data-quality-receipt");
    expect(stored?.experience?.html).toContain('data-layout-variant="standard"');
    expect(stored?.experience?.html).toContain('data-wireframe="product-launch-landing-page"');
    expect(stored?.qualityReceipt?.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "cta", status: "passed" })])
    );
  });

  it("does not start a second generation while the story stage is already running", async () => {
    const running = session({ id: "generation-lease-boundary" });
    running.status = "generating";
    running.stages.story = { status: "running", startedAt: new Date().toISOString() };
    await putSession(running);

    await runStoryStage(running.id);

    expect(generateExperienceDraft).not.toHaveBeenCalled();
    expect(await getSession(running.id)).toMatchObject({
      status: "generating",
      stages: { story: { status: "running" } }
    });
  });

  it("fails closed when a content source cannot be read", async () => {
    const unreadable = session({ id: "content-source-failure" });
    unreadable.useCase = "content";
    unreadable.answers = {
      audience: "Enterprise architects and platform owners",
      objective: "Educate buyers",
      sourceUrl: "https://example.test/unreadable"
    };
    await putSession(unreadable);
    vi.mocked(generateExperienceDraft).mockRejectedValueOnce(
      new SourceFetchError(new Error("upstream denied the request"))
    );

    await runStoryStage(unreadable.id);

    expect(await getSession(unreadable.id)).toMatchObject({
      status: "generation_failed",
      stages: { story: { status: "failed", errorCode: "source_fetch_failed" } }
    });
    expect(publishClaimedExperience).not.toHaveBeenCalled();
  });

  // Regression: an email must be durably captured before any Folloze publication attempt.
  it("records the lead and saves the app URL without publishing to Folloze", async () => {
    const trace: string[] = [];
    const ready = session({
      id: "claim-success-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    await putSession(ready);
    vi.mocked(recordLeadCapture).mockImplementation(async () => {
      trace.push("lead:capture");
      return {} as never;
    });
    vi.mocked(publishClaimedExperience).mockImplementation(async () => {
      trace.push("folloze:publish");
      return {
        mode: "folloze",
        publicUrl: "https://experience.example/claim-success-boundary",
        boardId: "248999",
        warnings: []
      };
    });
    vi.mocked(sendClaimEmail).mockImplementation(async () => {
      trace.push("email:send");
      return "sent";
    });
    vi.mocked(updateLeadOutcome).mockImplementation(async (outcome) => {
      trace.push(`lead:outcome:${outcome.claimStatus}`);
      return true;
    });

    const result = await claimSession(ready.id, "buyer@acme.test");

    expect(trace).toEqual(["lead:capture", "email:send", "lead:outcome:claimed"]);
    expect(publishClaimedExperience).not.toHaveBeenCalled();
    expect(recordLeadCapture).toHaveBeenCalledWith(
      expect.objectContaining({ id: ready.id, status: "claim_pending" }),
      "buyer@acme.test"
    );
    expect(updateLeadOutcome).toHaveBeenCalledWith({
      sessionId: ready.id,
      claimAttemptId: expect.any(String),
      experienceUrl: ready.temporaryUrl,
      claimStatus: "claimed",
      publishStatus: "preview-only",
      emailStatus: "sent",
      claimedAt: expect.any(String)
    });
    expect(result).toMatchObject({ publishMode: "preview-only", emailDelivery: "sent" });
    expect(await getSession(ready.id)).toMatchObject({
      status: "claimed",
      liveUrl: ready.temporaryUrl,
      claim: { publishStatus: "preview-only", emailStatus: "sent" },
      cockpit: {
        companyDomain: "jitterbit.com",
        audience: "Enterprise architects and platform owners",
        objective: "Book a meeting",
        artifactRevision: 2,
        versionNumber: 1,
        previewInteractions: 0
      }
    });
  });

  it("rejects a duplicate claim while the first claim is still in progress", async () => {
    const pending = session({
      id: "claim-in-progress-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    pending.status = "claim_pending";
    pending.claim = {
      attemptId: "active-claim-attempt",
      startedAt: new Date().toISOString(),
      email: "first@acme.test",
      emailMasked: "fi•••@acme.test",
      emailStatus: "pending",
      publishStatus: "pending"
    };
    await putSession(pending);

    await expect(claimSession(pending.id, "first@acme.test")).rejects.toThrow(
      "already being claimed"
    );

    expect(recordLeadCapture).not.toHaveBeenCalled();
    expect(publishClaimedExperience).not.toHaveBeenCalled();
    expect(sendClaimEmail).not.toHaveBeenCalled();
  });

  it("recovers a stale pending claim with the originally bound email", async () => {
    const pending = session({
      id: "stale-claim-recovery-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    pending.status = "claim_pending";
    pending.claim = {
      attemptId: "orphaned-claim-attempt",
      startedAt: "2026-07-30T00:00:00.000Z",
      email: "first@acme.test",
      emailMasked: "fi•••@acme.test",
      emailStatus: "pending",
      publishStatus: "pending"
    };
    await putSession(pending);

    await recoverSessionWork(pending.id);

    expect(recordLeadCapture).toHaveBeenCalledWith(
      expect.objectContaining({ id: pending.id, status: "claim_pending" }),
      "first@acme.test"
    );
    expect(publishClaimedExperience).not.toHaveBeenCalled();
    expect(await getSession(pending.id)).toMatchObject({
      status: "claimed",
      claim: { email: "first@acme.test", publishStatus: "preview-only" }
    });
    expect((await getSession(pending.id))?.events.map((event) => event.name)).toContain(
      "claim_recovered"
    );
  });

  it("does not let a failed claim be taken over by a different email", async () => {
    const failed = session({
      id: "claim-email-binding",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    failed.status = "claim_failed";
    failed.claim = {
      email: "first@acme.test",
      emailMasked: "fi•••@acme.test",
      emailStatus: "failed",
      publishStatus: "failed"
    };
    await putSession(failed);

    await expect(claimSession(failed.id, "second@acme.test")).rejects.toThrow(
      "different business email"
    );

    expect(recordLeadCapture).not.toHaveBeenCalled();
    expect(publishClaimedExperience).not.toHaveBeenCalled();
  });

  it("keeps a successfully saved preview claimed when email delivery throws", async () => {
    const ready = session({
      id: "claim-email-failure-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    await putSession(ready);
    vi.mocked(publishClaimedExperience).mockResolvedValue({
      mode: "folloze",
      publicUrl: "https://experience.example/claim-email-failure-boundary",
      boardId: "249111",
      warnings: []
    });
    vi.mocked(sendClaimEmail).mockRejectedValue(new Error("email transport unavailable"));

    const result = await claimSession(ready.id, "buyer@acme.test");

    expect(result).toMatchObject({ publishMode: "preview-only", emailDelivery: "failed" });
    expect(publishClaimedExperience).not.toHaveBeenCalled();
    expect(updateLeadOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: ready.id,
        claimStatus: "claimed",
        publishStatus: "preview-only",
        emailStatus: "failed"
      })
    );
    expect(await getSession(ready.id)).toMatchObject({
      status: "claimed",
      claim: { publishStatus: "preview-only", emailStatus: "failed" }
    });
  });

  it("retries a transient lead-outcome write before completing the claim", async () => {
    const ready = session({
      id: "claim-ledger-retry-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    await putSession(ready);
    vi.mocked(updateLeadOutcome)
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockResolvedValueOnce(true);

    const result = await claimSession(ready.id, "buyer@acme.test");

    expect(result.session.status).toBe("claimed");
    expect(updateLeadOutcome).toHaveBeenCalledTimes(3);
    expect((await getSession(ready.id))?.events.map((event) => event.name)).not.toContain(
      "lead_outcome_sync_failed"
    );
  });

  it("reconciles a claimed lead outcome from the scheduled repair path", async () => {
    const ready = session({
      id: "claim-ledger-recovery-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    await putSession(ready);
    vi.mocked(updateLeadOutcome).mockRejectedValue(new Error("database unavailable"));

    const result = await claimSession(ready.id, "buyer@acme.test");

    expect(result.session.status).toBe("claimed");
    expect((await getSession(ready.id))?.events.map((event) => event.name)).toContain(
      "lead_outcome_sync_failed"
    );

    vi.mocked(updateLeadOutcome).mockResolvedValue(true);
    await expect(reconcileLeadSession(ready.id)).resolves.toBe("reconciled");

    expect((await getSession(ready.id))?.events.map((event) => event.name)).toContain(
      "lead_outcome_reconciled"
    );
    expect(updateLeadOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: ready.id,
        claimStatus: "claimed",
        publishStatus: "preview-only"
      })
    );
  });

  it("ignores Folloze publication wiring because V1 save is preview-only", async () => {
    const trace: string[] = [];
    const ready = session({
      id: "claim-failure-boundary",
      status: "preview_ready_unclaimed",
      includeExperience: true
    });
    await putSession(ready);
    vi.mocked(recordLeadCapture).mockImplementation(async () => {
      trace.push("lead:capture");
      return {} as never;
    });
    vi.mocked(publishClaimedExperience).mockImplementation(async () => {
      trace.push("folloze:publish");
      throw new Error("Folloze unavailable");
    });
    vi.mocked(updateLeadOutcome).mockImplementation(async (outcome) => {
      trace.push(`lead:outcome:${outcome.claimStatus}`);
      return true;
    });

    const result = await claimSession(ready.id, "buyer@acme.test");

    expect(result.publishMode).toBe("preview-only");
    expect(trace).toEqual(["lead:capture", "lead:outcome:claimed"]);
    expect(publishClaimedExperience).not.toHaveBeenCalled();
    expect(await getSession(ready.id)).toMatchObject({
      status: "claimed",
      liveUrl: ready.temporaryUrl,
      claim: { publishStatus: "preview-only", emailStatus: "skipped" }
    });
  });
});
