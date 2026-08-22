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
