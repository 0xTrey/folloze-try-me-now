import { afterEach, describe, expect, it } from "vitest";

import {
  clearMemoryLeadsForTest,
  getMemoryLeadCountForTest,
  getMemoryLeadForTest,
  isDurableLeadStoreMode,
  leadStoreMode,
  listLeadsNeedingReconciliation,
  recordLeadCapture,
  updateLeadOutcome
} from "@/lib/lead-store";
import type { TryMeSession } from "@/lib/types";

function readySession(): TryMeSession {
  return {
    id: "lead-session",
    editorTokenHash: "private",
    useCase: "abm",
    companyDomain: "jitterbit.com",
    status: "preview_ready_unclaimed",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    temporaryUrl: "https://example.test/e/lead-session",
    revision: 3,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "complete" }
    },
    answers: {
      targetDomain: "cisco.com",
      audience: "Enterprise architects and platform owners",
      objective: "Book a meeting",
      ctaType: "book-meeting",
      ctaStyle: "outline",
      sourceUrl: "https://www.example.com/private/path?campaign=secret",
      sourceTitle: "Enterprise AI guide buyer@example.com https://private.example/path"
    },
    audienceSuggestions: [],
    experience: {
      title: "Jitterbit for Cisco",
      eyebrow: "Jitterbit for Cisco",
      headline: "Connect systems.",
      subhead: "A focused automation story.",
      thesisHeadline: "Keep control visible.",
      thesisBody: "Connect workflows and governance.",
      primaryCta: "See how it works",
      audienceLabel: "Enterprise architects and platform owners",
      narrativeArc: "What should the team validate?",
      sections: [],
      signalLabels: [],
      closingHeadline: "Start with one workflow.",
      closingBody: "Choose the first path.",
      html: "<!doctype html>",
      generationSource: "deterministic-fallback",
      artifactRevision: 3,
      artifactDigest: "b".repeat(64)
    },
    claim: {
      attemptId: "claim-attempt-1",
      startedAt: "2026-07-30T00:00:01.000Z",
      email: "buyer@example.com",
      emailMasked: "bu•••@example.com",
      publishStatus: "pending",
      emailStatus: "pending"
    },
    events: []
  };
}

describe("lead store", () => {
  afterEach(() => clearMemoryLeadsForTest());

  it("uses an isolated memory ledger in tests", () => {
    expect(leadStoreMode).toBe("memory-test");
    expect(isDurableLeadStoreMode("neon-postgres")).toBe(true);
    expect(isDurableLeadStoreMode("vercel-blob")).toBe(true);
    expect(isDurableLeadStoreMode("memory-demo")).toBe(false);
  });

  it.each(["", "person@gmail.com", "person@mailinator.com"])(
    "rejects invalid business email %s without creating a lead",
    async (email) => {
      await expect(recordLeadCapture(readySession(), email)).rejects.toThrow();
      expect(getMemoryLeadCountForTest()).toBe(0);
    }
  );

  it("captures business-email and qualification context without generated content", async () => {
    const session = readySession();
    const record = await recordLeadCapture(session, "buyer@example.com");

    expect(record).toMatchObject({
      sessionId: session.id,
      claimAttemptId: "claim-attempt-1",
      email: "buyer@example.com",
      emailDomain: "example.com",
      companyDomain: "jitterbit.com",
      targetDomain: "cisco.com",
      useCase: "abm",
      audience: "Enterprise architects and platform owners",
      objective: "Book a meeting",
      ctaType: "book-meeting",
      ctaStyle: "outline",
      sourceKind: "url",
      sourceHost: "example.com",
      sourceTitle: "Enterprise AI guide [redacted] [link]",
      previewUrl: "https://example.test/e/lead-session",
      previewStatus: "ready",
      saveStatus: "pending",
      consentScope: "transactional_experience_delivery",
      claimStatus: "captured"
    });
    expect(JSON.stringify(record)).not.toContain("<!doctype html>");
    expect(JSON.stringify(record)).not.toContain("private/path");
    expect(record.artifactRevision).toBe(3);
    expect(record.artifactDigest).toBe("b".repeat(64));
    expect(getMemoryLeadCountForTest()).toBe(1);
  });

  it("updates delivery and publication outcomes idempotently", async () => {
    await recordLeadCapture(readySession(), "buyer@example.com");
    await expect(updateLeadOutcome({
      sessionId: "lead-session",
      claimAttemptId: "claim-attempt-1",
      experienceUrl: "https://experience.example/lead-session",
      claimStatus: "claimed",
      publishStatus: "published",
      emailStatus: "sent",
      claimedAt: "2026-07-30T01:00:00.000Z"
    })).resolves.toBe(true);

    expect(getMemoryLeadForTest("lead-session")).toMatchObject({
      experienceUrl: "https://experience.example/lead-session",
      claimStatus: "claimed",
      saveStatus: "saved",
      savedExperienceUrl: "https://experience.example/lead-session",
      publishStatus: "published",
      emailStatus: "sent"
    });
  });

  it("does not downgrade a terminal outcome when the same capture is replayed", async () => {
    const session = readySession();
    await recordLeadCapture(session, "buyer@example.com");
    await updateLeadOutcome({
      sessionId: session.id,
      claimAttemptId: "claim-attempt-1",
      experienceUrl: "https://experience.example/lead-session",
      claimStatus: "claimed",
      publishStatus: "published",
      emailStatus: "sent",
      claimedAt: "2026-07-30T01:00:00.000Z"
    });

    await recordLeadCapture(session, "buyer@example.com");

    expect(getMemoryLeadForTest(session.id)).toMatchObject({
      claimAttemptId: "claim-attempt-1",
      claimStatus: "claimed",
      publishStatus: "published",
      emailStatus: "sent",
      claimedAt: "2026-07-30T01:00:00.000Z"
    });
    expect(getMemoryLeadCountForTest()).toBe(1);
  });

  it("does not let a late failure downgrade a saved, published, emailed outcome", async () => {
    await recordLeadCapture(readySession(), "buyer@example.com");
    await updateLeadOutcome({
      sessionId: "lead-session",
      claimAttemptId: "claim-attempt-1",
      experienceUrl: "https://experience.example/lead-session",
      claimStatus: "claimed",
      publishStatus: "published",
      emailStatus: "sent",
      claimedAt: "2026-07-30T01:00:00.000Z"
    });

    await updateLeadOutcome({
      sessionId: "lead-session",
      claimAttemptId: "claim-attempt-1",
      experienceUrl: "https://example.test/e/lead-session",
      claimStatus: "failed",
      publishStatus: "failed",
      emailStatus: "failed"
    });

    expect(getMemoryLeadForTest("lead-session")).toMatchObject({
      experienceUrl: "https://experience.example/lead-session",
      savedExperienceUrl: "https://experience.example/lead-session",
      claimStatus: "claimed",
      saveStatus: "saved",
      publishStatus: "published",
      emailStatus: "sent",
      claimedAt: "2026-07-30T01:00:00.000Z"
    });
  });

  it("fails loudly when an outcome is written before the lead capture", async () => {
    await expect(
      updateLeadOutcome({
        sessionId: "missing-lead-session",
        claimAttemptId: "missing-attempt",
        experienceUrl: "https://experience.example/missing-lead-session",
        claimStatus: "failed",
        publishStatus: "not-attempted",
        emailStatus: "not-attempted"
      })
    ).rejects.toThrow("before capture");
  });

  it("does not let an older claim attempt overwrite a newer lead outcome", async () => {
    const first = readySession();
    await recordLeadCapture(first, "buyer@example.com");

    const newer = readySession();
    newer.claim = {
      ...newer.claim,
      attemptId: "claim-attempt-2",
      startedAt: "2026-07-30T00:05:01.000Z"
    };
    await recordLeadCapture(newer, "buyer@example.com");

    await expect(
      updateLeadOutcome({
        sessionId: newer.id,
        claimAttemptId: "claim-attempt-1",
        experienceUrl: newer.temporaryUrl,
        claimStatus: "failed",
        publishStatus: "failed",
        emailStatus: "not-attempted"
      })
    ).resolves.toBe(false);
    expect(getMemoryLeadForTest(newer.id)).toMatchObject({
      claimAttemptId: "claim-attempt-2",
      claimStatus: "captured",
      publishStatus: "pending",
      emailStatus: "pending"
    });
  });

  it("lists captured leads until their terminal outcome is recorded", async () => {
    await recordLeadCapture(readySession(), "buyer@example.com");
    await expect(listLeadsNeedingReconciliation()).resolves.toEqual(["lead-session"]);

    await updateLeadOutcome({
      sessionId: "lead-session",
      claimAttemptId: "claim-attempt-1",
      experienceUrl: "https://experience.example/lead-session",
      claimStatus: "claimed",
      publishStatus: "preview-only",
      emailStatus: "skipped"
    });
    await expect(listLeadsNeedingReconciliation()).resolves.toEqual([]);
  });
});
