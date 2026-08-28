/**
 * WO0 invariant suite for the final-only base experience.
 *
 * Two kinds of assertion live here. Some lock behavior that already holds and
 * must survive the lifecycle rewrite (public payload shape, revision fencing,
 * trace privacy). The rest describe the approved deltas: no customer-visible
 * provisional artifact, one persisted-and-read-back final artifact, and the
 * production section writer as the copy authority.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as experienceDocument } from "@/app/e/[id]/route";
import { generateExperienceDraft } from "@/lib/integrations/openai";
import { runStoryStage } from "@/lib/orchestrator";
import { canRevealFinalExperience } from "@/lib/preview-lifecycle";
import { deleteSession, getSession, putSession, toPublicSession } from "@/lib/session-store";
import type { BrandProfile, TryMeSession } from "@/lib/types";

vi.mock("@/lib/integrations/openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/openai")>()),
  generateExperienceDraft: vi.fn()
}));

const sessionIds = new Set<string>();

const brand: BrandProfile = {
  domain: "northwind-signals.com",
  canonicalDomain: "northwind-signals.com",
  domainAliases: [],
  companyName: "Northwind Signals",
  title: "Northwind Signal Graph",
  displayFontFamily: "Northwind Sans",
  bodyFontFamily: "Northwind Sans",
  description: "Revenue signal instrumentation for enterprise go-to-market teams.",
  publicContext: "Northwind Signals instruments pipeline and account signals.",
  publicTopics: ["Signal instrumentation", "Pipeline analytics", "Account scoring"],
  logoUrl: "https://northwind-signals.com/logo.svg",
  imageUrls: [],
  colors: ["#101A2C", "#2F6BFF", "#FFFFFF"],
  primaryColor: "#101A2C",
  accentColor: "#2F6BFF",
  surfaceColor: "#FFFFFF",
  sourceUrl: "https://northwind-signals.com/",
  source: "fast-extractor",
  identity: {
    expectedDomain: "northwind-signals.com",
    canonicalDomain: "northwind-signals.com",
    canonicalName: "Northwind Signals",
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
    buttons: { primaryBackground: "#2F6BFF", radiusPx: 8, heightPx: 48, borderWidthPx: 0 },
    cards: { radiusPx: 12, borderWidthPx: 1, shadow: "soft" },
    spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 96, gridGapPx: 24 }
  },
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

function session(id: string): TryMeSession {
  sessionIds.add(id);
  return {
    id,
    traceId: "trace_final_only_invariants",
    editorTokenHash: "private-editor-token-hash",
    useCase: "campaign",
    companyDomain: "northwind-signals.com",
    status: "collecting",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    temporaryUrl: `https://preview.example/e/${id}`,
    revision: 1,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "pending" }
    },
    answers: {
      audience: "Revenue operations leaders",
      objective: "Book a meeting",
      campaignType: "product",
      promotedOffer: "Northwind Signal Graph"
    },
    brand,
    audienceSuggestions: [],
    evidenceItems: [
      {
        id: "evidence:signal-graph",
        type: "public-positioning",
        label: "Signal graph",
        text: "Northwind Signals unifies pipeline and account signals into one graph.",
        sourceUrl: "https://northwind-signals.com/product",
        signals: ["Signal instrumentation"],
        disposition: "available",
        entityRole: "seller",
        confidence: "high"
      },
      {
        id: "evidence:revops-owner",
        type: "public-focus-area",
        label: "Revenue operations",
        text: "Revenue operations leaders own forecast accuracy and territory coverage.",
        sourceUrl: "https://northwind-signals.com/solutions/revenue-operations",
        signals: ["Account scoring"],
        disposition: "available",
        entityRole: "seller",
        confidence: "high"
      }
    ],
    events: []
  };
}

describe("final-only lifecycle invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // A verified brand reaches asset and font resolution, which is the only
    // part of this path that would otherwise touch the network. Failing every
    // fetch keeps the lifecycle assertions hermetic and exercises the same
    // degraded-enrichment branch a blocked egress would.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in test"));
    vi.mocked(generateExperienceDraft).mockResolvedValue({
      draft: {
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
        title: "Northwind Signal Graph",
        eyebrow: "Northwind Signals",
        headline: "GLOBAL DRAFT HEADLINE THAT MUST NOT WIN",
        subhead: "GLOBAL DRAFT SUBHEAD THAT MUST NOT WIN",
        thesisHeadline: "Signals become one governed graph.",
        thesisBody: "Bring pipeline and account signals into one operating view.",
        primaryCta: "GLOBAL DRAFT CTA",
        audienceLabel: "Revenue operations leaders",
        narrativeArc: "What should revenue operations validate next?",
        sections: [
          {
            eyebrow: "Unify",
            headline: "Unify the signal path",
            body: "Bring pipeline and account signals into one governed graph.",
            proof: "Which signals need governance first?"
          },
          {
            eyebrow: "Score",
            headline: "Score accounts on observable behavior",
            body: "Rank accounts on activity your team can inspect and explain.",
            proof: "Where is coverage weakest today?"
          },
          {
            eyebrow: "Forecast",
            headline: "Forecast from evidence",
            body: "Replace roll-up guesswork with signals that already exist.",
            proof: "What forecast gap costs the most?"
          }
        ],
        signalLabels: ["Signals", "Scoring", "Forecast"],
        closingHeadline: "Start with one territory worth proving.",
        closingBody: "Pick a bounded territory, instrument it, and inspect the result."
      },
      source: "openai",
      durationMs: 1_200
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([...sessionIds].map((id) => deleteSession(id)));
    sessionIds.clear();
  });

  it("never serves HTML for an artifact that has not passed the final receipt", async () => {
    const pending = session("final-only-no-provisional-html");
    await putSession(pending);

    // A stored artifact from a superseded lifecycle, with no final receipt.
    await putSession({
      ...pending,
      status: "preview_provisional",
      experience: {
        title: "Northwind Signal Graph",
        eyebrow: "Northwind Signals",
        headline: "Provisional headline",
        subhead: "Provisional subhead",
        thesisHeadline: "Provisional thesis",
        thesisBody: "Provisional thesis body",
        primaryCta: "Book a meeting",
        audienceLabel: "Revenue operations leaders",
        narrativeArc: "Provisional arc",
        sections: [],
        signalLabels: [],
        closingHeadline: "Provisional close",
        closingBody: "Provisional close body",
        html: "<!doctype html><title>PROVISIONAL LEAK</title>",
        readiness: "provisional",
        generationSource: "deterministic-fallback",
        artifactRevision: 2,
        artifactDigest: "b".repeat(64)
      }
    });

    const response = await experienceDocument(new Request("https://preview.example/e/x"), {
      params: Promise.resolve({ id: pending.id })
    });
    const body = await response.text();

    expect(response.status).not.toBe(200);
    expect(body).not.toContain("PROVISIONAL LEAK");
  });

  it("reveals only a persisted, read-back final artifact", async () => {
    const pending = session("final-only-reveal-after-readback");
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored?.experience?.readiness).toBe("final");
    expect(stored?.finalArtifact).toMatchObject({
      readiness: "final",
      structuralGate: "passed",
      truthGate: "passed",
      artifactRevision: stored?.experience?.artifactRevision,
      artifactDigest: stored?.experience?.artifactDigest
    });
    expect(Date.parse(stored!.finalArtifact!.readBackAt)).toBeGreaterThanOrEqual(
      Date.parse(stored!.finalArtifact!.persistedAt)
    );

    const response = await experienceDocument(new Request("https://preview.example/e/x"), {
      params: Promise.resolve({ id: pending.id })
    });
    expect(response.status).toBe(200);
  });

  it("never assigns a provisional status or artifact on the current path", async () => {
    const pending = session("final-only-no-provisional-status");
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored?.status).not.toBe("preview_provisional");
    expect(stored?.experience?.readiness).not.toBe("provisional");
    expect(stored?.events.map(({ name }) => name)).not.toContain("preview_provisional_ready");
  });

  it("publishes honest build phase receipts without fake progress", async () => {
    const pending = session("final-only-build-receipts");
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored?.buildProgress?.phase).toBe("ready");
    const phases = stored!.buildProgress!.receipts.map(({ phase }) => phase);
    expect(phases).toEqual([
      "queued",
      "researching",
      "planning",
      "writing",
      "checking",
      "finalizing"
    ]);
    expect(stored!.buildProgress!.receipts.every(({ status }) => status === "complete")).toBe(true);
    for (const receipt of stored!.buildProgress!.receipts) {
      expect(receipt.detail).not.toMatch(/\d+\s?%/);
    }
  });

  it("keeps production section copy authoritative over the global draft hero", async () => {
    const pending = session("final-only-production-authority");
    await putSession(pending);

    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(stored?.experience?.headline).not.toBe("GLOBAL DRAFT HEADLINE THAT MUST NOT WIN");
    expect(stored?.experience?.subhead).not.toBe("GLOBAL DRAFT SUBHEAD THAT MUST NOT WIN");
    expect(stored?.experience?.html).not.toContain("GLOBAL DRAFT HEADLINE THAT MUST NOT WIN");
  });

  it("keeps the final receipt and build progress out of the public payload's private fields", async () => {
    const pending = session("final-only-public-payload");
    await putSession(pending);
    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    const publicSession = toPublicSession(stored!);
    const serialized = JSON.stringify(publicSession);

    expect(serialized).not.toContain("<!doctype");
    expect(serialized).not.toContain(stored!.experience!.artifactDigest);
    expect(publicSession.finalArtifact).toMatchObject({
      readiness: "final",
      structuralGate: "passed",
      truthGate: "passed"
    });
    expect(publicSession.finalArtifact as Record<string, unknown>).not.toHaveProperty(
      "artifactDigest"
    );
  });

  it("discards a late artifact when the revision moved under it", async () => {
    const pending = session("final-only-stale-revision");
    await putSession(pending);

    let releaseGeneration!: () => void;
    vi.mocked(generateExperienceDraft).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });
      throw new Error("unreachable");
    });

    const completion = runStoryStage(pending.id);
    await vi.waitFor(async () => {
      expect((await getSession(pending.id))?.stages.story.status).toBe("running");
    });

    // Move the brief under the in-flight attempt.
    const current = await getSession(pending.id);
    await putSession({
      ...current!,
      revision: current!.revision + 5,
      answers: { ...current!.answers, promotedOffer: "A different offer entirely" }
    });

    releaseGeneration();
    await completion;

    const stored = await getSession(pending.id);
    const discarded = stored!.events.filter(({ name }) => name === "generation_discarded");
    expect(discarded).toHaveLength(1);

    // Restarting against the newer brief is correct. What must never happen is
    // the superseded attempt's artifact becoming the revealed one, so any
    // artifact present has to belong to the attempt that actually finished.
    const supersededAttemptId = discarded[0]!.meta?.attemptId;
    expect(supersededAttemptId).toBeTruthy();
    expect(stored?.stages.story.attemptId).not.toBe(supersededAttemptId);
    if (stored?.finalArtifact) {
      expect(stored.finalArtifact.artifactRevision).toBe(stored.experience?.artifactRevision);
      expect(stored.finalArtifact.artifactDigest).toBe(stored.experience?.artifactDigest);
      expect(canRevealFinalExperience(toPublicSession(stored))).toBe(true);
    }
  });

  it("never reveals an artifact whose receipt belongs to a different revision", async () => {
    const pending = session("final-only-receipt-revision-mismatch");
    await putSession(pending);
    await runStoryStage(pending.id);

    const stored = await getSession(pending.id);
    expect(canRevealFinalExperience(toPublicSession(stored!))).toBe(true);

    await putSession({
      ...stored!,
      finalArtifact: {
        ...stored!.finalArtifact!,
        artifactRevision: stored!.finalArtifact!.artifactRevision + 1
      }
    });

    const drifted = await getSession(pending.id);
    expect(canRevealFinalExperience(toPublicSession(drifted!))).toBe(false);

    const response = await experienceDocument(new Request("https://preview.example/e/x"), {
      params: Promise.resolve({ id: pending.id })
    });
    expect(response.status).not.toBe(200);
  });
});
