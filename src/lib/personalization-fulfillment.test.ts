import { beforeEach, describe, expect, it, vi } from "vitest";

import { runPersonalizationFulfillment } from "@/lib/personalization-fulfillment";
import {
  addPersonalizationTargets,
  clearMemoryPersonalizationRequestsForTest,
  createPersonalizationRequest,
  getPersonalizationRequest
} from "@/lib/personalization-request-store";
import type { BrandProfile, PublicTryMeSession, TryMeSession } from "@/lib/types";

const digest = "d".repeat(64);

function baselineSession(id = "baseline-session"): TryMeSession {
  const now = new Date().toISOString();
  return {
    id,
    editorTokenHash: "hash",
    useCase: "campaign",
    companyDomain: "seller.com",
    status: "preview_ready_unclaimed",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: `/e/${id}`,
    revision: 9,
    stages: {
      brand: { status: "complete", detail: "ready" },
      audience: { status: "complete", detail: "ready" },
      story: { status: "complete", detail: "ready" }
    },
    answers: {
      audience: "Finance leaders",
      objective: "Evaluate the offer",
      promotedOffer: "Planning platform"
    },
    audienceSuggestions: [],
    audienceRecommendations: [],
    evidenceItems: [],
    availableAssets: [],
    blockControls: [],
    previewAnalytics: { totalInteractions: 0, counts: {} },
    curatedSections: [],
    finalArtifact: {
      readiness: "final",
      artifactRevision: 4,
      artifactDigest: digest,
      structuralGate: "passed",
      truthGate: "passed",
      persistedAt: now,
      readBackAt: now
    },
    experience: {
      title: "Standard",
      html: "<html>standard</html>",
      readiness: "final",
      generationSource: "openai",
      artifactRevision: 4,
      artifactDigest: digest,
      sections: []
    },
    lineage: { rootSessionId: id, versionNumber: 1 },
    events: []
  } as unknown as TryMeSession;
}

function targetBrand(domain: string): BrandProfile {
  return {
    domain,
    companyName: domain.split(".")[0]!,
    publicTopics: ["Finance operations"],
    imageUrls: [],
    colors: []
  } as unknown as BrandProfile;
}

function dependenciesFor(
  baseline: TryMeSession,
  modes: Record<string, "ready" | "no-evidence" | "throw"> = {}
) {
  const sessions = new Map<string, TryMeSession>([[baseline.id, baseline]]);
  const persistentIds: string[] = [];
  let active = 0;
  let peak = 0;
  const create = vi.fn(async (input, options) => {
    const id = options?.sessionId ?? "random";
    const now = new Date().toISOString();
    sessions.set(id, {
      id,
      editorTokenHash: "child-hash",
      useCase: input.useCase,
      companyDomain: input.companyDomain,
      status: "collecting",
      createdAt: now,
      updatedAt: now,
      temporaryUrl: `/e/${id}`,
      revision: 1,
      stages: {
        brand: { status: "running", detail: "working" },
        audience: { status: "running", detail: "working" },
        story: { status: "pending", detail: "waiting" }
      },
      answers: {},
      audienceSuggestions: [],
      audienceRecommendations: [],
      evidenceItems: [],
      availableAssets: [],
      blockControls: [],
      previewAnalytics: { totalInteractions: 0, counts: {} },
      curatedSections: [],
      lineage: { rootSessionId: id, versionNumber: 1 },
      events: []
    });
    return {
      session: {} as PublicTryMeSession,
      editorToken: "unused",
      traceId: "unused"
    };
  });
  const patch = vi.fn(async (id: string, answers) => {
    const session = sessions.get(id)!;
    session.answers = { ...session.answers, ...answers };
    return {
      session: {} as PublicTryMeSession,
      shouldGenerate: true,
      traceId: "unused"
    };
  });
  const run = vi.fn(async (id: string) => {
    const session = sessions.get(id)!;
    const domain = session.answers.targetDomain!;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    if (modes[domain] === "throw") throw new Error("provider failed");
    session.targetBrand =
      modes[domain] === "no-evidence" ? undefined : targetBrand(domain);
    session.status = "preview_ready_unclaimed";
    session.experience = {
      ...baseline.experience!,
      title: domain,
      artifactDigest: `${domain.charCodeAt(0).toString(16)}`.repeat(64).slice(0, 64)
    };
    session.finalArtifact = {
      ...baseline.finalArtifact!,
      artifactDigest: session.experience.artifactDigest
    };
  });
  const update = vi.fn(async (id: string, updater, options = {}) => {
    const session = sessions.get(id);
    if (!session) return null;
    const next = await updater(structuredClone(session));
    next.revision += 1;
    sessions.set(id, next);
    if (options.persist) persistentIds.push(id);
    return structuredClone(next);
  });
  return {
    dependencies: {
      getSession: async (id: string) => structuredClone(sessions.get(id) ?? null),
      createSession: create,
      patchSessionAnswers: patch,
      runPreviewEnrichmentWave: run,
      updateSession: update,
      canRevealSession: (session: TryMeSession) =>
        session.status === "preview_ready_unclaimed" &&
        session.finalArtifact?.artifactDigest === session.experience?.artifactDigest,
      targetEvidenceCount: (session: TryMeSession) =>
        session.targetBrand ? 2 : 0
    },
    create,
    patch,
    run,
    persistentIds,
    peak: () => peak,
    sessions
  };
}

async function queuedRequest(sessionId = "baseline-session") {
  await createPersonalizationRequest({
    sessionId,
    email: "buyer@example.com",
    artifactRevision: 4,
    artifactDigest: digest
  });
  return addPersonalizationTargets(
    sessionId,
    [
      { domain: "alpha.com", role: "CFO" },
      { domain: "beta.com" },
      { domain: "gamma.com", role: "COO" }
    ],
    "seller.com"
  );
}

describe("personalization fulfillment", () => {
  beforeEach(() => clearMemoryPersonalizationRequestsForTest());

  it("builds three isolated final-gated child sessions concurrently", async () => {
    const baseline = baselineSession();
    await queuedRequest();
    const harness = dependenciesFor(baseline);
    const result = await runPersonalizationFulfillment(
      baseline.id,
      harness.dependencies as never
    );

    expect(result?.status).toBe("completed");
    expect(harness.create).toHaveBeenCalledTimes(3);
    expect(harness.patch).toHaveBeenCalledTimes(3);
    expect(harness.run).toHaveBeenCalledTimes(3);
    expect(harness.peak()).toBe(3);
    expect(new Set(harness.persistentIds).size).toBe(3);
    expect(result?.targets.every((target) => target.link === `/e/${target.generatedSessionId}`)).toBe(true);
    expect(result?.targets.every((target) => target.evidenceCount === 2)).toBe(true);
  });

  it("keeps evidence-free and failed targets from exposing links", async () => {
    const baseline = baselineSession();
    await queuedRequest();
    const harness = dependenciesFor(baseline, {
      "beta.com": "no-evidence",
      "gamma.com": "throw"
    });
    const result = await runPersonalizationFulfillment(
      baseline.id,
      harness.dependencies as never
    );

    expect(result?.status).toBe("partial");
    expect(result?.targets.map((target) => target.status)).toEqual([
      "ready",
      "needs_review",
      "failed"
    ]);
    expect(result?.targets.map((target) => target.link)).toEqual([
      expect.stringMatching(/^\/e\//),
      undefined,
      undefined
    ]);
    const evidenceFree = harness.sessions.get(result!.targets[1]!.generatedSessionId)!;
    expect(evidenceFree.finalArtifact).toBeUndefined();
    expect(evidenceFree.status).toBe("generation_failed");

    await runPersonalizationFulfillment(baseline.id, harness.dependencies as never);
    expect(harness.create).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the standard artifact no longer matches", async () => {
    const baseline = baselineSession();
    baseline.experience!.artifactDigest = "e".repeat(64);
    await queuedRequest();
    const harness = dependenciesFor(baseline);
    const result = await runPersonalizationFulfillment(
      baseline.id,
      harness.dependencies as never
    );
    expect(result?.status).toBe("failed");
    expect(result?.targets.every((target) => target.errorCode === "personalization_baseline_changed")).toBe(true);
    expect(harness.create).not.toHaveBeenCalled();
    expect((await getPersonalizationRequest(baseline.id))?.status).toBe("failed");
  });
});
