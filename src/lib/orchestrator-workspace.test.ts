import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canEditSession,
  duplicateSession,
  patchSessionWorkspace,
  recordPreviewInteraction,
  runStoryStage
} from "@/lib/orchestrator";
import { generateExperienceDraft } from "@/lib/integrations/openai";
import { deleteSession, getSession, putSession } from "@/lib/session-store";
import type {
  BrandProfile,
  ExperienceModel,
  FinalArtifactReceipt,
  TryMeSession
} from "@/lib/types";

vi.mock("@/lib/integrations/openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/openai")>()),
  generateExperienceDraft: vi.fn()
}));

const editorToken = "workspace-editor-token";
const ids = new Set<string>();

const seller: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Integration, automation, application development, and governed AI.",
  publicTopics: ["Integration", "Workflow automation", "API management"],
  logoUrl: "https://jitterbit.com/logo.svg",
  imageUrls: ["https://jitterbit.com/platform.png"],
  colors: ["#123B4A", "#F4512C", "#FFFFFF"],
  primaryColor: "#123B4A",
  accentColor: "#F4512C",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "Inter",
  bodyFontFamily: "Inter",
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
    buttons: { primaryBackground: "#F4512C", radiusPx: 6, heightPx: 44, borderWidthPx: 0 },
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

const target: BrandProfile = {
  ...seller,
  domain: "cisco.com",
  companyName: "Cisco",
  description: "Networking, security, infrastructure, and observability technology.",
  publicContext: "Cisco spans network infrastructure, security, and observability.",
  publicTopics: ["Networking", "Security", "Infrastructure", "Observability"],
  logoUrl: "https://cisco.com/logo.svg",
  imageUrls: [],
  sourceUrl: "https://cisco.com",
  identity: {
    expectedDomain: "cisco.com",
    canonicalDomain: "cisco.com",
    canonicalName: "Cisco",
    confirmationStatus: "confirmed",
    confidence: "high",
    confirmedBy: "system",
    reasons: [],
    provenance: []
  }
};

/**
 * The read-back receipt that makes an artifact revealable and claimable. A
 * seeded experience without it is only an internal draft under the final-only
 * lifecycle, so every fixture that stands for an already-revealed experience
 * has to carry one.
 */
function finalReceiptFor(experience: ExperienceModel, at: string): FinalArtifactReceipt {
  return {
    readiness: "final",
    artifactRevision: experience.artifactRevision,
    artifactDigest: experience.artifactDigest,
    structuralGate: "passed",
    truthGate: "passed",
    persistedAt: at,
    readBackAt: at
  };
}

function workspaceSession(id: string, status: TryMeSession["status"] = "preview_ready_unclaimed") {
  const now = new Date().toISOString();
  const session: TryMeSession = {
    id,
    editorTokenHash: createHash("sha256").update(editorToken).digest("hex"),
    useCase: "abm",
    companyDomain: seller.domain,
    status,
    createdAt: now,
    updatedAt: now,
    temporaryUrl: `https://example.com/e/${id}`,
    liveUrl: status === "claimed" ? `https://example.com/live/${id}` : undefined,
    claimedAt: status === "claimed" ? now : undefined,
    revision: 8,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "complete", completedAt: now },
      story: { status: "complete", completedAt: now }
    },
    answers: {
      targetDomain: target.domain,
      audience: "Network operations leaders",
      objective: "Book a meeting"
    },
    brand: seller,
    targetBrand: target,
    audienceSuggestions: ["Network operations leaders"],
    audienceRecommendations: [
      {
        id: "audience_cisco_network",
        label: "Network operations leaders",
        rationale: "Connects Jitterbit to Cisco networking and infrastructure context.",
        evidenceItemIds: ["evidence_networking"],
        confidence: "high",
        source: "seller-target-synthesis"
      }
    ],
    evidenceItems: [
      {
        id: "evidence_networking",
        type: "public-focus-area",
        label: "Public focus area",
        text: "Networking",
        sourceUrl: target.sourceUrl,
        signals: ["networking"],
        disposition: "available"
      },
      {
        id: "evidence_security",
        type: "public-focus-area",
        label: "Public focus area",
        text: "Security",
        sourceUrl: target.sourceUrl,
        signals: ["security"],
        disposition: "available"
      },
      {
        id: "evidence_observability",
        type: "public-focus-area",
        label: "Public focus area",
        text: "Observability",
        sourceUrl: target.sourceUrl,
        signals: ["observability"],
        disposition: "available"
      }
    ],
    availableAssets: [
      {
        id: "asset_seller_logo",
        kind: "seller-logo",
        label: "Jitterbit logo",
        url: seller.logoUrl!,
        source: "seller"
      }
    ],
    blockControls: [],
    previewAnalytics: { totalInteractions: 0, counts: {} },
    qualityReceipt: {
      status: "passed",
      checkedAt: now,
      artifactRevision: 8,
      checks: []
    },
    cockpit:
      status === "claimed"
        ? {
            savedAt: now,
            companyDomain: seller.domain,
            targetDomain: target.domain,
            audience: "Network operations leaders",
            objective: "Book a meeting",
            artifactRevision: 8,
            versionNumber: 1,
            previewInteractions: 3
          }
        : undefined,
    lineage: { rootSessionId: id, versionNumber: 1 },
    experience: {
      title: "Jitterbit for Cisco",
      eyebrow: "Jitterbit for Cisco",
      headline: "Make Cisco automation accountable by design.",
      subhead: "A sufficiently detailed account-specific subhead for the generated experience.",
      thesisHeadline: "Connect infrastructure and automation around one operating question.",
      thesisBody: "A sufficiently detailed thesis for Cisco networking and security teams.",
      primaryCta: "Plan the working session",
      audienceLabel: "Network operations leaders",
      narrativeArc: "Which architecture question should Cisco validate first?",
      sections: [],
      signalLabels: [],
      closingHeadline: "Put the first architecture question on the table.",
      closingBody: "Bring the relevant stakeholders into one focused working session.",
      html: "<!doctype html><title>private generated artifact</title>",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 8,
      artifactDigest: "a".repeat(64)
    },
    claim:
      status === "claimed"
        ? {
            attemptId: "claim-private",
            email: "person@example.com",
            emailMasked: "pe••••@example.com",
            emailStatus: "sent",
            publishStatus: "preview-only"
          }
        : undefined,
    events: []
  };
  session.finalArtifact = finalReceiptFor(session.experience!, now);
  return session;
}

beforeEach(() => {
  // A verified brand with resolved fonts and palette reaches real font and
  // asset resolution, which is the only part of this path that touches the
  // network. Failing every fetch keeps these assertions hermetic instead of
  // letting them stall on live requests.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in test"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...ids].map((id) => deleteSession(id)));
  ids.clear();
});

describe("session workspace foundation", () => {
  it("applies controls while keeping the current preview visible until replacement succeeds", async () => {
    const id = `workspace-${Date.now()}`;
    ids.add(id);
    await putSession(workspaceSession(id));

    const result = await patchSessionWorkspace(id, {
      answers: {
        messageBelief: "Cisco can govern automation across connected infrastructure.",
        messageAction: "Plan the first architecture workshop",
        ctaType: "book-meeting",
        ctaStyle: "outline",
        styleVariant: "brand-led",
        toneVariant: "technical",
        layoutVariant: "narrative",
        selectedAssetIds: ["asset_seller_logo"]
      },
      selectedAudienceRecommendationId: "audience_cisco_network",
      evidenceDecisions: [
        { id: "evidence_networking", disposition: "pinned" },
        { id: "evidence_observability", disposition: "excluded" }
      ],
      sourceConfirmation: "confirmed",
      blockControls: [
        {
          id: "hero",
          locked: true,
          headline: "Make Cisco automation accountable by design."
        }
      ]
    });
    const stored = await getSession(id);

    expect(result.shouldGenerate).toBe(true);
    expect(result.session).toMatchObject({
      status: "collecting",
      selectedAudienceRecommendationId: "audience_cisco_network",
      sourceConfirmation: { status: "confirmed", sourceKind: "public-account" },
      answers: {
        audience: "Network operations leaders",
        messageAction: "Plan the first architecture workshop",
        ctaType: "book-meeting",
        ctaStyle: "outline",
        styleVariant: "brand-led",
        toneVariant: "technical",
        layoutVariant: "narrative",
        selectedAssetIds: ["asset_seller_logo"]
      }
    });
    expect(result.session.experience).toMatchObject({
      ready: true,
      title: "Jitterbit for Cisco",
      artifactRevision: 8
    });
    expect(result.session.qualityReceipt).toMatchObject({
      status: "passed",
      artifactRevision: 8
    });
    expect(stored?.evidenceItems?.find((item) => item.id === "evidence_networking")?.disposition).toBe(
      "pinned"
    );
    expect(
      stored?.evidenceItems?.find((item) => item.id === "evidence_observability")?.disposition
    ).toBe("excluded");
    expect(stored?.blockControls).toEqual([
      expect.objectContaining({ id: "hero", locked: true })
    ]);
    expect(JSON.stringify(result.session)).not.toContain("private generated artifact");
    expect(JSON.stringify(result.session)).not.toContain("editorTokenHash");
  });

  it("keeps the canonical core wireframe visible while preserving legacy and API copy controls", async () => {
    const id = `fixed-core-${Date.now()}`;
    ids.add(id);
    const seeded = workspaceSession(id);
    seeded.blockControls = [
      {
        id: "thesis",
        visible: false,
        locked: true,
        eyebrow: "Account imperative",
        headline: "Keep the operating case intact."
      }
    ];
    await putSession(seeded);

    const result = await patchSessionWorkspace(id, {
      blockControls: [
        {
          id: "guided-questions",
          visible: false,
          locked: true,
          body: "Use these questions to focus the first architecture conversation."
        }
      ]
    });
    const stored = await getSession(id);

    expect(result.session.blockControls).toEqual([
      {
        id: "thesis",
        visible: true,
        locked: true,
        eyebrow: "Account imperative",
        headline: "Keep the operating case intact."
      },
      {
        id: "guided-questions",
        visible: true,
        locked: true,
        body: "Use these questions to focus the first architecture conversation."
      }
    ]);
    expect(stored?.blockControls).toEqual(result.session.blockControls);
  });

  it("normalizes legacy hidden controls before generation without removing core sections", async () => {
    const id = `fixed-core-generation-${Date.now()}`;
    ids.add(id);
    const seeded = workspaceSession(id);
    seeded.status = "collecting";
    seeded.stages.story = { status: "pending" };
    seeded.experience = undefined;
    seeded.qualityReceipt = undefined;
    seeded.blockControls = [
      {
        id: "thesis",
        visible: false,
        locked: true,
        headline: "A controlled operating thesis."
      },
      {
        id: "decision-lenses",
        visible: false,
        eyebrow: "Account decisions"
      },
      {
        id: "guided-questions",
        visible: false,
        body: "Use these questions to align platform and architecture owners."
      }
    ];
    await putSession(seeded);
    vi.mocked(generateExperienceDraft).mockResolvedValueOnce({
      draft: {
        campaignRegister: "one-to-one-abm",
        designRegister: "source-brand-technical",
        wireframeName: "abm-account-microsite",
        experienceShape: "narrative-workflow",
        sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
        sectionLabels: {
          thesis: "Why now",
          lenses: "Decision lenses",
          journey: "Guided questions",
          close: "Next step"
        },
        title: "Jitterbit for Cisco",
        eyebrow: "Jitterbit for Cisco",
        headline: "Connect Cisco workflows through one governed automation layer.",
        subhead: "A focused path for network and platform leaders evaluating connected automation.",
        thesisHeadline: "Move from disconnected workflows to accountable automation.",
        thesisBody: "Connect integration, automation, and governance decisions in one operating model.",
        primaryCta: "Plan the architecture session",
        audienceLabel: "Network operations leaders",
        narrativeArc: "Choose the architecture question that deserves the first working session.",
        sections: [
          {
            eyebrow: "Control",
            headline: "Govern the automation surface",
            body: "Make ownership and policy visible across connected systems and workflows.",
            proof: "Which policy boundary must stay consistent?"
          },
          {
            eyebrow: "Speed",
            headline: "Remove integration drag",
            body: "Reuse connection patterns for the workflows that slow delivery today.",
            proof: "Where does integration repeatedly delay the roadmap?"
          },
          {
            eyebrow: "Scale",
            headline: "Turn patterns into leverage",
            body: "Give teams autonomy without losing platform-level governance.",
            proof: "Which teams need more autonomy first?"
          }
        ],
        signalLabels: ["Control", "Speed", "Scale"],
        closingHeadline: "Put the first architecture decision on the table.",
        closingBody: "Bring the platform and integration owners into one focused working session."
      },
      source: "deterministic-fallback",
      durationMs: 1,
      fallbackReason: "openai_not_configured"
    });

    await runStoryStage(id);

    const stored = await getSession(id);
    expect(stored?.blockControls).toEqual([
      expect.objectContaining({ id: "thesis", visible: true, locked: true }),
      expect.objectContaining({ id: "decision-lenses", visible: true }),
      expect.objectContaining({ id: "guided-questions", visible: true })
    ]);
    expect(stored?.experienceSpec?.draft.sectionSequence).toEqual([
      "thesis",
      "decision-lenses",
      "guided-questions"
    ]);
    expect(stored?.experience).toMatchObject({
      thesisHeadline: "A controlled operating thesis.",
      narrativeArc: "Use these questions to align platform and architecture owners."
    });
    expect(stored?.experience?.html).toContain('id="experience-thesis"');
    expect(stored?.experience?.html).toContain('id="decision-path"');
    expect(stored?.experience?.html).toContain('id="supporting-resources"');
  });

  it("leaves revision N intact when replacement generation fails", async () => {
    const id = `atomic-replacement-failure-${Date.now()}`;
    ids.add(id);
    const original = workspaceSession(id);
    original.experienceSpecRevision = 8;
    original.experienceSpec = {
      schemaVersion: "1.0",
      revision: 8,
      sourceBriefRevision: 3,
      sourceBriefFingerprint: "brief-v3",
      createdAt: original.updatedAt,
      artifactDigest: "spec-v8",
      grounding: {
        seller: { source: seller.source, sourceUrl: seller.sourceUrl },
        target: { source: target.source, sourceUrl: target.sourceUrl },
        audience: { status: "ready", findingIds: ["evidence_networking"] }
      },
      identities: {
        seller: { domain: seller.domain, name: seller.companyName },
        target: { domain: target.domain, name: target.companyName }
      },
      brandTokens: {
        primaryColor: seller.primaryColor,
        accentColor: seller.accentColor,
        surfaceColor: seller.surfaceColor
      },
      draft: {},
      cta: { intent: "explore", style: "solid", label: "Continue" },
      selectedAssetIds: [],
      evidenceItemIds: ["evidence_networking"],
      curatedSections: [],
      analytics: { events: ["preview-opened"] },
      renderers: { web: { status: "ready" }, folloze: { status: "not-requested" } }
    };
    const originalDigest = original.experience?.artifactDigest;
    const originalSpec = structuredClone(original.experienceSpec);
    const originalReceipt = structuredClone(original.qualityReceipt);
    const originalFinalArtifact = structuredClone(original.finalArtifact);
    await putSession(original);

    await patchSessionWorkspace(id, {
      answers: { objective: "Accelerate an opportunity" }
    });
    vi.mocked(generateExperienceDraft).mockRejectedValueOnce(new Error("generation unavailable"));

    await runStoryStage(id);

    const stored = await getSession(id);
    expect(stored).toMatchObject({
      status: "preview_ready_unclaimed",
      experience: { artifactRevision: 8, artifactDigest: originalDigest },
      stages: {
        story: {
          status: "failed",
          detail: expect.stringMatching(/finished experience.*safe/i)
        }
      }
    });
    expect(stored?.experienceSpec).toEqual(originalSpec);
    expect(stored?.qualityReceipt).toEqual(originalReceipt);
    // Revision N stays revealable only because it kept its own read-back
    // receipt. The fallback must never point at an artifact the gate rejects.
    expect(stored?.finalArtifact).toEqual(originalFinalArtifact);
    expect(stored?.finalArtifact?.artifactDigest).toBe(stored?.experience?.artifactDigest);
  });

  it("fails closed instead of falling back to an unreceipted revision N", async () => {
    const id = `unreceipted-replacement-failure-${Date.now()}`;
    ids.add(id);
    const original = workspaceSession(id);
    // A session persisted before the final-only lifecycle: an artifact with no
    // read-back receipt. It was never revealable, so it is not a legal fallback.
    original.finalArtifact = undefined;
    await putSession(original);

    await patchSessionWorkspace(id, {
      answers: { objective: "Accelerate an opportunity" }
    });
    vi.mocked(generateExperienceDraft).mockRejectedValueOnce(new Error("generation unavailable"));

    await runStoryStage(id);

    const stored = await getSession(id);
    expect(stored?.status).toBe("generation_failed");
    expect(stored?.experience).toBeUndefined();
    expect(stored?.finalArtifact).toBeUndefined();
    expect(stored?.buildProgress?.phase).toBe("failed");
    expect(stored?.buildProgress?.failure).toMatchObject({
      code: "generation_failed",
      retryable: true
    });
  });

  it("replaces source provenance atomically and binds confirmation to the newly submitted source", async () => {
    const id = `source-replacement-${Date.now()}`;
    ids.add(id);
    const original = workspaceSession(id);
    original.useCase = "content";
    original.answers = {
      sourceName: "old-source.pdf",
      sourceTitle: "Old source",
      sourceUploadId: "old-upload",
      sourceOpenAIFileId: "old-file",
      sourceConfirmed: true,
      audience: "Operations leaders",
      objective: "Increase content engagement"
    };
    original.sourceConfirmation = {
      status: "confirmed",
      sourceKind: "uploaded-pdf",
      provenance: "user-confirmed"
    };
    original.sourceFingerprint = "old-source-fingerprint";
    await putSession(original);

    await patchSessionWorkspace(id, {
      answers: { sourceUrl: "https://example.org/new-report" }
    });

    const stored = await getSession(id);
    expect(stored?.answers).toMatchObject({
      sourceUrl: "https://example.org/new-report",
      audience: "Operations leaders"
    });
    expect(stored?.answers.sourceName).toBeUndefined();
    expect(stored?.answers.sourceTitle).toBe("New Report");
    expect(stored?.answers.sourceUploadId).toBeUndefined();
    expect(stored?.answers.sourceOpenAIFileId).toBeUndefined();
    expect(stored?.answers.sourceConfirmed).toBeUndefined();
    expect(stored?.sourceConfirmation).toMatchObject({
      status: "unconfirmed",
      sourceKind: "public-url",
      provenance: "user-submitted"
    });
    expect(stored?.sourceFingerprint).toEqual(expect.any(String));
    expect(stored?.sourceFingerprint).not.toBe("old-source-fingerprint");
    expect(stored?.experience?.artifactRevision).toBe(8);
  });

  it.each([
    { useCase: "abm" as const, requiredAnswers: { targetDomain: target.domain } },
    { useCase: "campaign" as const, requiredAnswers: { campaignType: "demand" as const } },
    { useCase: "content" as const, requiredAnswers: {} }
  ])(
    "attaches an approved public URL to $useCase without changing the selected path",
    async ({ useCase, requiredAnswers }) => {
      const id = `optional-url-${useCase}-${Date.now()}`;
      ids.add(id);
      const original = workspaceSession(id);
      original.useCase = useCase;
      original.answers = {
        ...original.answers,
        ...requiredAnswers,
        promotedOffer: "Folloze Buyer Experience Platform"
      };
      await putSession(original);

      const result = await patchSessionWorkspace(id, {
        answers: {
          sourceUrl: "https://example.org/approved-context",
          sourceConfirmed: true
        }
      });
      const stored = await getSession(id);

      expect(result.shouldGenerate).toBe(true);
      expect(stored).toMatchObject({
        useCase,
        companyDomain: seller.domain,
        answers: {
          ...requiredAnswers,
          promotedOffer: "Folloze Buyer Experience Platform",
          sourceUrl: "https://example.org/approved-context",
          sourceConfirmed: true
        },
        sourceConfirmation: {
          status: "confirmed",
          sourceKind: "public-url",
          provenance: "user-confirmed"
        }
      });
    }
  );

  it("records bounded preview interaction aggregates without exposing internal events", async () => {
    const id = `preview-${Date.now()}`;
    ids.add(id);
    await putSession(workspaceSession(id));

    await recordPreviewInteraction(id, {
      event: "preview-opened",
      elementId: "experience-frame"
    });
    const publicSession = await recordPreviewInteraction(id, {
      event: "lens-selected",
      elementId: "decision-lens-2",
      value: "Automation control"
    });
    const completedSession = await recordPreviewInteraction(id, {
      event: "journey-complete",
      elementId: "next-step"
    });
    const stored = await getSession(id);

    expect(publicSession.previewAnalytics).toMatchObject({
      totalInteractions: 2,
      counts: { "preview-opened": 1, "lens-selected": 1 }
    });
    expect(completedSession.previewAnalytics).toEqual({
      totalInteractions: 3,
      lastInteractionAt: expect.any(String),
      lastElementId: "next-step",
      counts: { "preview-opened": 1, "lens-selected": 1, "journey-complete": 1 }
    });
    expect(publicSession).not.toHaveProperty("events");
    expect(stored?.events.map((event) => event.name)).toEqual([
      "preview_preview_opened",
      "preview_lens_selected",
      "preview_journey_complete"
    ]);
    expect(JSON.stringify(stored?.events)).not.toContain("Automation control");
  });

  it("clears dependent account context explicitly", async () => {
    const id = `clear-workspace-${Date.now()}`;
    ids.add(id);
    const seeded = workspaceSession(id);
    await putSession(seeded);

    const result = await patchSessionWorkspace(id, {
      answers: { targetDomain: "" }
    });

    expect(result.shouldGenerate).toBe(false);
    expect(result.session.answers.targetDomain).toBeUndefined();
    expect(result.session.answers.audience).toBeUndefined();
    expect(result.session.targetBrand).toBeUndefined();
    expect(result.session.evidenceItems).toEqual([]);
    expect(result.session.audienceRecommendations).toEqual([]);
  });

  it("creates isolated duplicates and linear versions with fresh editor credentials", async () => {
    const id = `claimed-${Date.now()}`;
    ids.add(id);
    await putSession(workspaceSession(id, "claimed"), { persist: true });

    const version = await duplicateSession(id, { mode: "version", label: "Executive option" });
    ids.add(version.session.id);
    const duplicate = await duplicateSession(id, { mode: "duplicate", label: "New account copy" });
    ids.add(duplicate.session.id);

    expect(version.session).toMatchObject({
      status: "collecting",
      lineage: {
        rootSessionId: id,
        parentSessionId: id,
        versionNumber: 2,
        label: "Executive option"
      }
    });
    expect(version.session.claim).toBeUndefined();
    expect(version.session.cockpit).toBeUndefined();
    expect(version.session.experience).toBeUndefined();
    // A copied workspace has not built anything yet, so it must not inherit a
    // receipt claiming a passed final artifact or a stale build phase.
    expect(version.session.finalArtifact).toBeUndefined();
    expect(version.session.buildProgress).toBeUndefined();
    expect(duplicate.session.finalArtifact).toBeUndefined();
    expect(duplicate.session.buildProgress).toBeUndefined();
    expect(await canEditSession(version.session.id, version.editorToken)).toBe(true);
    expect(await canEditSession(version.session.id, editorToken)).toBe(false);
    expect(duplicate.session.lineage).toMatchObject({
      rootSessionId: duplicate.session.id,
      duplicatedFromSessionId: id,
      versionNumber: 1,
      label: "New account copy"
    });
  });

  it("requires a new version before changing a claimed workspace", async () => {
    const id = `locked-${Date.now()}`;
    ids.add(id);
    await putSession(workspaceSession(id, "claimed"), { persist: true });

    await expect(
      patchSessionWorkspace(id, {
        answers: { messageAction: "Use a different CTA" }
      })
    ).rejects.toMatchObject({ code: "claimed_session_locked", status: 409 });
  });

  it("keeps claimed records immutable during preview tracking", async () => {
    const id = `claimed-preview-${Date.now()}`;
    ids.add(id);
    await putSession(workspaceSession(id, "claimed"), { persist: true });

    await expect(
      recordPreviewInteraction(id, { event: "preview-opened" })
    ).rejects.toMatchObject({ code: "claimed_session_locked", status: 409 });
    expect((await getSession(id))?.status).toBe("claimed");
  });
});
