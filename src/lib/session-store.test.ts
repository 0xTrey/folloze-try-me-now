import { describe, expect, it } from "vitest";

import {
  acquireSessionLease,
  isProductionSafeSessionStoreMode,
  selectSessionStoreMode,
  usesRedisSessionStoreMode
} from "@/lib/session-store";

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
