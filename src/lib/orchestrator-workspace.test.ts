import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canEditSession,
  duplicateSession,
  patchSessionWorkspace,
  recordPreviewInteraction
} from "@/lib/orchestrator";
import { deleteSession, getSession, putSession } from "@/lib/session-store";
import type { BrandProfile, TryMeSession } from "@/lib/types";

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
  sourceUrl: "https://jitterbit.com",
  source: "fast-extractor"
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
  sourceUrl: "https://cisco.com"
};

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
  return session;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...ids].map((id) => deleteSession(id)));
  ids.clear();
});

describe("session workspace foundation", () => {
  it("applies all creative controls atomically and invalidates an obsolete preview", async () => {
    const id = `workspace-${Date.now()}`;
    ids.add(id);
    await putSession(workspaceSession(id));

    const result = await patchSessionWorkspace(id, {
      answers: {
        messageBelief: "Cisco can govern automation across connected infrastructure.",
        messageAction: "Plan the first architecture workshop",
        ctaType: "book-meeting",
        ctaDestination: "https://jitterbit.com/contact",
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
        ctaDestination: "https://jitterbit.com/contact",
        styleVariant: "brand-led",
        toneVariant: "technical",
        layoutVariant: "narrative",
        selectedAssetIds: ["asset_seller_logo"]
      }
    });
    expect(result.session.experience).toBeUndefined();
    expect(result.session.qualityReceipt).toBeUndefined();
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
    const stored = await getSession(id);

    expect(publicSession.previewAnalytics).toEqual({
      totalInteractions: 2,
      lastInteractionAt: expect.any(String),
      lastElementId: "decision-lens-2",
      counts: { "preview-opened": 1, "lens-selected": 1 }
    });
    expect(publicSession).not.toHaveProperty("events");
    expect(stored?.events.map((event) => event.name)).toEqual([
      "preview_preview_opened",
      "preview_lens_selected"
    ]);
    expect(JSON.stringify(stored?.events)).not.toContain("Automation control");
  });

  it("clears dependent account context and optional CTA destinations explicitly", async () => {
    const id = `clear-workspace-${Date.now()}`;
    ids.add(id);
    const seeded = workspaceSession(id);
    seeded.answers.ctaDestination = "https://jitterbit.com/contact";
    await putSession(seeded);

    const result = await patchSessionWorkspace(id, {
      answers: { targetDomain: "", ctaDestination: "" }
    });

    expect(result.shouldGenerate).toBe(false);
    expect(result.session.answers.targetDomain).toBeUndefined();
    expect(result.session.answers.ctaDestination).toBeUndefined();
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
