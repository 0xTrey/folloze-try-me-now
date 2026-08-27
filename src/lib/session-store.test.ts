import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireSessionLease,
  deleteSession,
  getSession,
  isProductionSafeSessionStoreMode,
  putSession,
  selectSessionStoreMode,
  toPublicSession,
  usesRedisSessionStoreMode
} from "@/lib/session-store";
import type { TryMeSession } from "@/lib/types";

function anonymousPreview(overrides: Partial<TryMeSession> = {}): TryMeSession {
  return {
    id: "anonymous-lifecycle-session",
    editorTokenHash: "private",
    useCase: "campaign",
    companyDomain: "folloze.com",
    status: "preview_ready_unclaimed",
    createdAt: "2026-07-31T12:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
    expiresAt: "2026-07-31T12:30:00.000Z",
    temporaryUrl: "https://preview.example/e/anonymous-lifecycle-session",
    revision: 2,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "complete" }
    },
    answers: {},
    audienceSuggestions: [],
    events: [],
    ...overrides
  };
}

afterEach(async () => {
  vi.useRealTimers();
  await deleteSession("anonymous-lifecycle-session");
  await deleteSession("legacy-session-shape");
});

describe("session store selection", () => {
  it("prefers Blob when Blob and Redis are both configured", () => {
    const mode = selectSessionStoreMode({ blobConfigured: true, redisConfigured: true });
    expect(mode).toBe("vercel-blob");
    expect(usesRedisSessionStoreMode(mode)).toBe(false);
  });

  it("supports Redis-only without labeling it production-safe", () => {
    const mode = selectSessionStoreMode({ blobConfigured: false, redisConfigured: true });
    expect(mode).toBe("upstash-redis");
    expect(isProductionSafeSessionStoreMode(mode)).toBe(false);
    expect(usesRedisSessionStoreMode(mode)).toBe(true);
  });

  it("falls back to process memory only when no durable store is configured", () => {
    expect(selectSessionStoreMode({ blobConfigured: false, redisConfigured: false })).toBe(
      "memory-demo"
    );
  });
});

describe("session operation leases", () => {
  it("allows only one in-process owner and releases by token", async () => {
    const first = await acquireSessionLease("lease-session", "claim", 30);
    expect(first).not.toBeNull();
    await expect(acquireSessionLease("lease-session", "claim", 30)).resolves.toBeNull();

    await first?.release();
    const next = await acquireSessionLease("lease-session", "claim", 30);
    expect(next).not.toBeNull();
    await next?.release();
  });
});

describe("anonymous session lifecycle", () => {
  it("projects only bounded provider availability for development diagnostics", () => {
    const projected = toPublicSession(anonymousPreview({
      brand: {
        domain: "example.com",
        companyName: "Example",
        publicTopics: [],
        imageUrls: [],
        colors: ["#202124", "#5F6368", "#FFFFFF"],
        primaryColor: "#202124",
        accentColor: "#5F6368",
        surfaceColor: "#FFFFFF",
        sourceUrl: "https://example.com",
        source: "fallback",
        diagnostics: {
          logo: {
            strategy: "none",
            imageCandidateCount: 0,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          },
          providers: {
            publicPage: "failed",
            publicPageAttempts: 1,
            remoteBrowser: "not_configured",
            brandfetch: "not_configured",
            brandfetchLogoApi: "not_configured",
            brandfetchBrandApi: "not_configured",
            verifiedFallback: false
          },
          designFidelity: {
            designReady: false,
            score: 0,
            missing: ["Private server detail must remain private."]
          }
        }
      }
    }));

    expect(projected.brand?.providerAvailability).toEqual({
      remoteHarvester: "not_configured",
      brandfetch: "not_configured"
    });
    expect(projected.brand).not.toHaveProperty("diagnostics");
    expect(JSON.stringify(projected.brand)).not.toContain("Private server detail");
  });

  it("projects only credible recommendation sets into the public composer contract", () => {
    const projected = toPublicSession(anonymousPreview({
      audienceRecommendations: [{
        id: "fallback-audience",
        label: "Operations teams",
        rationale: "Deterministic fallback",
        evidenceItemIds: [],
        confidence: "hypothesis",
        recommendationKind: "fallback",
        source: "seller-category-fallback"
      }],
      offerRecommendations: [
        "Solution overview",
        "Solution use cases",
        "Solution evaluation questions"
      ].map((label, index) => ({
        id: `fallback-offer-${index}`,
        label,
        rationale: "weak evidence fallback",
        recommended: index === 0,
        evidenceItemIds: [],
        confidence: "low" as const,
        recommendationKind: "fallback" as const,
        revision: 2
      }))
    }));

    expect(projected.audienceRecommendations).toEqual([]);
    expect(projected.offerRecommendations).toEqual([]);
    expect(JSON.stringify(projected)).not.toMatch(
      /Solution overview|Solution use cases|Solution evaluation questions/
    );
  });

  it("expires exactly 30 minutes after preview readiness even when storage lives longer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
    await putSession(anonymousPreview(), { ttlSeconds: 3600 });

    vi.advanceTimersByTime(30 * 60_000 - 1);
    await expect(getSession("anonymous-lifecycle-session")).resolves.not.toBeNull();

    vi.advanceTimersByTime(1);
    await expect(getSession("anonymous-lifecycle-session")).resolves.toBeNull();
  });

  it("normalizes additive collection fields when reading a stored legacy session", async () => {
    const legacy = anonymousPreview({
      id: "legacy-session-shape",
      status: "collecting",
      expiresAt: undefined
    }) as unknown as Record<string, unknown>;
    delete legacy.revision;
    delete legacy.audienceSuggestions;
    delete legacy.events;
    await putSession(legacy as unknown as TryMeSession);

    await expect(getSession("legacy-session-shape")).resolves.toMatchObject({
      revision: 1,
      audienceSuggestions: [],
      events: []
    });
  });
});

describe("private provenance never reaches a public session", () => {
  /**
   * Everything a session may hold that belongs to the private trace. The
   * projection is an allowlist, so this proves the allowlist has not quietly
   * grown a hole rather than proving any one field was remembered.
   */
  function sessionWithPrivateProvenance(): TryMeSession {
    return anonymousPreview({
      traceId: "trace_0123456789abcdef",
      brand: {
        domain: "example.com",
        companyName: "Example",
        publicTopics: [],
        imageUrls: ["https://cdn.example.com/console.png"],
        colors: ["#202124"],
        primaryColor: "#202124",
        accentColor: "#5F6368",
        surfaceColor: "#FFFFFF",
        sourceUrl: "https://example.com",
        source: "fallback",
        diagnostics: {
          logo: {
            strategy: "favicon",
            imageCandidateCount: 3,
            rejectedImageCount: 1,
            inlineSvgCandidateCount: 0
          }
        }
      }
    });
  }

  it("omits the trace id, prompt versions, evidence refs, digests, and allocation data", () => {
    const projected = toPublicSession(sessionWithPrivateProvenance());
    const serialized = JSON.stringify(projected);

    expect("traceId" in projected).toBe(false);
    for (const field of [
      "traceId",
      "buildTrace",
      "promptVersion",
      "templateVersion",
      "evidenceRef",
      "evidenceRefs",
      "outputDigest",
      "inputDigest",
      "candidateDigests",
      "allocationKey",
      "sourceUrlHash",
      "assetDigest",
      "allocation",
      "assetPlan",
      "placements",
      "semanticRole",
      "treatments",
      "rejections",
      "correlationKey",
      "supportRefHash"
    ]) {
      expect(serialized).not.toContain(field);
    }
    for (const pattern of [/dg_[a-f0-9]{32}/, /ev_[a-f0-9]{20}/, /sh_[a-f0-9]{20}/, /sr_[a-f0-9]{20}/]) {
      expect(serialized).not.toMatch(pattern);
    }
  });

  it("exposes a support reference without exposing the trace it resolves to", () => {
    const session = sessionWithPrivateProvenance();
    const projected = toPublicSession(session);

    expect(projected.supportRef).toBeTruthy();
    expect(projected.supportRef).not.toContain(session.traceId!);
    expect(JSON.stringify(projected)).not.toContain(session.traceId!);
  });
});
