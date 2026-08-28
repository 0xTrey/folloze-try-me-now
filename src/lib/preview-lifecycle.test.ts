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
import type {
  BuildProgressState,
  PublicExperienceSummary,
  PublicFinalArtifactReceipt,
  PublicTryMeSession
} from "@/lib/types";

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

/**
 * The read-back receipt that turns an internal artifact into a revealable one.
 * Every fixture that expects a reveal has to carry it, because an artifact
 * object alone is no longer enough under the final-only contract.
 */
function finalReceiptFor(
  experience: PublicExperienceSummary
): PublicFinalArtifactReceipt {
  return {
    readiness: "final",
    artifactRevision: experience.artifactRevision,
    structuralGate: "passed",
    truthGate: "passed",
    persistedAt: "2026-08-22T10:00:20.000Z",
    readBackAt: "2026-08-22T10:00:21.000Z"
  };
}

function buildProgress(
  phase: BuildProgressState["phase"]
): BuildProgressState {
  return {
    phase,
    startedAt: "2026-08-22T10:00:01.000Z",
    updatedAt: "2026-08-22T10:00:09.000Z",
    slow: false,
    receipts: phase === "ready" || phase === "failed"
      ? []
      : [{ phase, status: "active", detail: `${phase} is in progress` }]
  };
}

const eligibleAnswers = {
  campaignType: "product" as const,
  promotedOffer: "Harmony",
  audience: "Architects",
  objective: "Generate demand"
};

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

  it("reveals only after the final receipt exists, never mid-build (U11)", () => {
    const experience: PublicExperienceSummary = {
      ready: true,
      title: "Harmony for architects",
      headline: "One governed integration path",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 1
    };
    // Mid-build: the brief is eligible and an internal artifact already exists,
    // but no read-back receipt does. Nothing may be revealed.
    const building = baseSession({
      status: "generating",
      answers: eligibleAnswers,
      experience,
      buildProgress: buildProgress("writing"),
      stages: {
        brand: { status: "complete", detail: "Brand matched" },
        audience: { status: "complete" },
        story: { status: "running", detail: "Composing story" }
      }
    });
    expect(isSessionGenerationEligible(building)).toBe(true);
    expect(canRevealPreview(building)).toBe(false);
    expect(previewLifecyclePhase(building)).toBe("building");

    const revealed = baseSession({
      ...building,
      status: "preview_ready_unclaimed",
      finalArtifact: finalReceiptFor(experience),
      buildProgress: buildProgress("ready"),
      stages: {
        brand: { status: "complete" },
        audience: { status: "complete" },
        story: { status: "complete" }
      }
    });
    expect(canRevealPreview(revealed)).toBe(true);
    expect(previewLifecyclePhase(revealed)).toBe("preview_ready");
  });

  it("blocks reveal when the receipt belongs to a different artifact revision", () => {
    const experience: PublicExperienceSummary = {
      ready: true,
      title: "Harmony for architects",
      headline: "One governed integration path",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 3
    };
    const drifted = baseSession({
      status: "preview_ready_unclaimed",
      answers: eligibleAnswers,
      experience,
      finalArtifact: { ...finalReceiptFor(experience), artifactRevision: 2 }
    });
    expect(canRevealPreview(drifted)).toBe(false);
  });
});

describe("preview lifecycle modal and claim timing", () => {
  it("never offers the claim modal before meaningful preview engagement (U22/U23)", () => {
    const experience: PublicExperienceSummary = {
      ready: true,
      title: "Ready",
      headline: "Ready headline",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 2
    };
    const ready = baseSession({
      status: "preview_ready_unclaimed",
      answers: eligibleAnswers,
      experience,
      finalArtifact: finalReceiptFor(experience),
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

  it("keeps an unreceipted artifact non-claimable even after exploration", () => {
    const unreceipted = baseSession({
      status: "preview_ready_unclaimed",
      answers: eligibleAnswers,
      experience: {
        ready: true,
        title: "Internal draft",
        headline: "Working",
        readiness: "final",
        generationSource: "openai",
        artifactRevision: 1
      }
    });
    expect(canOfferClaimModal(unreceipted, {
      events: [{ action: "preview_viewed" }, { action: "cta_click" }],
      previewOpened: true
    })).toBe(false);
  });

  it("keeps a legacy persisted provisional artifact non-claimable", () => {
    const legacyProvisional = baseSession({
      status: "preview_ready_unclaimed",
      answers: eligibleAnswers,
      experience: {
        ready: true,
        title: "Provisional",
        headline: "Working",
        readiness: "provisional",
        generationSource: "openai",
        artifactRevision: 1
      },
      finalArtifact: {
        readiness: "final",
        artifactRevision: 1,
        structuralGate: "passed",
        truthGate: "passed",
        persistedAt: "2026-08-22T10:00:20.000Z",
        readBackAt: "2026-08-22T10:00:21.000Z"
      }
    });
    expect(canRevealPreview(legacyProvisional)).toBe(false);
    expect(canOfferClaimModal(legacyProvisional, {
      events: [{ action: "preview_viewed" }, { action: "cta_click" }],
      previewOpened: true
    })).toBe(false);
  });
});

describe("preview lifecycle state honesty (U24/U25)", () => {
  it("distinguishes building, preview ready, saved locally, and never invents Folloze publish", () => {
    const experience: PublicExperienceSummary = {
      ready: true,
      title: "A",
      headline: "A",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 1
    };
    // No receipt yet, so the honest phase is `building`, never a visible
    // intermediate artifact.
    const building = baseSession({
      status: "generating",
      answers: eligibleAnswers,
      experience,
      buildProgress: buildProgress("writing"),
      stages: {
        brand: { status: "complete" },
        audience: { status: "complete" },
        story: { status: "running" }
      }
    });
    expect(previewLifecyclePhase(building)).toBe("building");

    const ready = {
      ...building,
      status: "preview_ready_unclaimed" as const,
      finalArtifact: finalReceiptFor(experience),
      buildProgress: buildProgress("ready"),
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

  it("reports a failed build as intake rather than a phantom preview", () => {
    const failed = baseSession({
      status: "generation_failed",
      answers: eligibleAnswers,
      buildProgress: {
        ...buildProgress("failed"),
        failure: {
          code: "final_structural_gate_failed",
          nextAction: "Retry the build, or adjust the offer and audience and retry.",
          retryable: true
        }
      },
      stages: {
        brand: { status: "complete" },
        audience: { status: "complete" },
        story: { status: "failed" }
      }
    });
    expect(canRevealPreview(failed)).toBe(false);
    expect(previewLifecyclePhase(failed)).toBe("intake");
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
    // An artifact without its read-back receipt is reported as unreceipted, not
    // as a passing or provisional quality outcome.
    const unreceipted: PublicExperienceSummary = {
      ready: true,
      title: "x",
      headline: "x",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 1
    };
    expect(analyticsQualityGate({
      experience: unreceipted,
      stages: session.stages
    })).toBe("unreceipted");
    expect(analyticsQualityGate({
      experience: unreceipted,
      finalArtifact: finalReceiptFor(unreceipted),
      stages: session.stages
    })).toBe("pass");
  });
});
