import { describe, expect, it } from "vitest";

import {
  analyticsDurationBucket,
  analyticsQualityGate,
  canOfferClaimModal,
  canRevealPreview,
  hasMeaningfulPreviewEngagement,
  isSessionGenerationEligible,
  previewLifecyclePhase,
  receiptBackedStageProgress,
  retryableFailedStages
} from "@/lib/preview-lifecycle";
import type { PublicTryMeSession } from "@/lib/types";

function baseSession(
  overrides: Partial<PublicTryMeSession> = {}
): PublicTryMeSession {
  return {
    id: "lifecycle-session",
    supportRef: "TMN-LIFECYCLE1",
    useCase: "campaign",
    companyDomain: "jitterbit.com",
    status: "collecting",
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:10.000Z",
    temporaryUrl: "https://example.test/e/lifecycle-session",
    revision: 1,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "pending" }
    },
    answers: {},
    audienceSuggestions: [],
    ...overrides
  };
}

describe("preview lifecycle eligibility and reveal", () => {
  it("does not treat domain-only sessions as generation eligible", () => {
    const session = baseSession({
      answers: {},
      status: "collecting"
    });
    expect(isSessionGenerationEligible(session)).toBe(false);
    expect(canRevealPreview(session)).toBe(false);
  });

  it("blocks reveal when an experience exists but the material brief is incomplete (U10)", () => {
    const session = baseSession({
      status: "preview_ready_unclaimed",
      answers: { audience: "Architects" },
      experience: {
        ready: true,
        title: "Premature",
        headline: "Should not show yet",
        readiness: "final",
        generationSource: "openai",
        artifactRevision: 1
      }
    });
    expect(isSessionGenerationEligible(session)).toBe(false);
    expect(canRevealPreview(session)).toBe(false);
  });

  it("allows reveal once the material brief is eligible and an artifact exists (U11)", () => {
    const session = baseSession({
      status: "preview_provisional",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony",
        audience: "Architects",
        objective: "Generate demand"
      },
      experience: {
        ready: true,
        title: "Provisional",
        headline: "First look",
        readiness: "provisional",
        generationSource: "openai",
        artifactRevision: 1
      },
      stages: {
        brand: { status: "complete", detail: "Brand matched" },
        audience: { status: "complete" },
        story: { status: "running", detail: "Composing story" }
      }
    });
    expect(isSessionGenerationEligible(session)).toBe(true);
    expect(canRevealPreview(session)).toBe(true);
    expect(previewLifecyclePhase(session)).toBe("enriching");
  });
});

describe("preview lifecycle modal and claim timing", () => {
  it("never offers the claim modal before meaningful preview engagement (U22/U23)", () => {
    const ready = baseSession({
      status: "preview_ready_unclaimed",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony",
        audience: "Architects",
        objective: "Generate demand"
      },
      experience: {
        ready: true,
        title: "Ready",
        headline: "Ready headline",
        readiness: "final",
        generationSource: "openai",
        artifactRevision: 2
      },
      stages: {
        brand: { status: "complete" },
        audience: { status: "complete" },
        story: { status: "complete" }
      }
    });

    expect(canOfferClaimModal(ready, { events: [], previewOpened: false })).toBe(false);
    expect(canOfferClaimModal(ready, {
      events: [{ action: "preview_viewed" }],
      previewOpened: true
    })).toBe(false);
    expect(hasMeaningfulPreviewEngagement([
      { action: "preview_viewed" },
      { action: "section_view" }
    ])).toBe(true);
    expect(canOfferClaimModal(ready, {
      events: [{ action: "preview_viewed" }, { action: "section_view" }],
      previewOpened: true
    })).toBe(true);
  });

  it("keeps provisional previews non-claimable even after exploration", () => {
    const provisional = baseSession({
      status: "preview_provisional",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony",
        audience: "Architects",
        objective: "Generate demand"
      },
      experience: {
        ready: true,
        title: "Provisional",
        headline: "Working",
        readiness: "provisional",
        generationSource: "openai",
        artifactRevision: 1
      }
    });
    expect(canOfferClaimModal(provisional, {
      events: [{ action: "preview_viewed" }, { action: "cta_click" }],
      previewOpened: true
    })).toBe(false);
  });
});

describe("preview lifecycle state honesty (U24/U25)", () => {
  it("distinguishes enriching, preview ready, saved locally, and never invents Folloze publish", () => {
    const enriching = baseSession({
      status: "preview_provisional",
      answers: {
        campaignType: "product",
        promotedOffer: "Harmony",
        audience: "Architects",
        objective: "Generate demand"
      },
      experience: {
        ready: true,
        title: "A",
        headline: "A",
        readiness: "provisional",
        generationSource: "openai",
        artifactRevision: 1
      },
      stages: {
        brand: { status: "complete" },
        audience: { status: "complete" },
        story: { status: "running" }
      }
    });
    expect(previewLifecyclePhase(enriching)).toBe("enriching");

    const ready = {
      ...enriching,
      status: "preview_ready_unclaimed" as const,
      experience: { ...enriching.experience!, readiness: "final" as const },
      stages: {
        brand: { status: "complete" as const },
        audience: { status: "complete" as const },
        story: { status: "complete" as const }
      }
    };
    expect(previewLifecyclePhase(ready)).toBe("preview_ready");

    const saved = {
      ...ready,
      status: "claimed" as const,
      claim: { publishStatus: "preview-only" as const, emailStatus: "sent" as const }
    };
    expect(previewLifecyclePhase(saved)).toBe("saved_locally");

    const published = {
      ...ready,
      status: "claimed" as const,
      claim: { publishStatus: "published" as const }
    };
    expect(previewLifecyclePhase(published)).toBe("published");
  });

  it("exposes only receipt-backed stage progress and stage-level retries (U14)", () => {
    const session = baseSession({
      stages: {
        brand: { status: "complete", detail: "Matched seller palette" },
        audience: { status: "failed", errorCode: "audience_timeout" },
        story: { status: "running", detail: "Composing path" }
      }
    });
    const rows = receiptBackedStageProgress(session);
    expect(rows.map((row) => row.status)).toEqual(["complete", "failed", "running"]);
    expect(rows.every((row) => !/%|refining theater|quality pass/i.test(row.detail))).toBe(true);
    expect(retryableFailedStages(session)).toEqual(["audience"]);
    expect(analyticsDurationBucket(12_000)).toBe("lt_15s");
    expect(analyticsQualityGate({
      experience: {
        ready: true,
        title: "x",
        headline: "x",
        readiness: "provisional",
        generationSource: "openai",
        artifactRevision: 1
      },
      stages: session.stages
    })).toBe("provisional");
  });
});
