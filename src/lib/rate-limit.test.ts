import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

type LoadOptions = {
  environment?: string;
  redisConfigured?: boolean;
  databaseConfigured?: boolean;
  databaseResult?: Array<{ request_count: number; retry_after: number }>;
  databaseError?: Error;
  redisError?: Error;
};

async function loadRateLimiter(options: LoadOptions = {}) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", options.environment ?? "production");

  const databaseQuery = vi.fn(async () => {
    if (options.databaseError) throw options.databaseError;
    return options.databaseResult ?? [{ request_count: 1, retry_after: 60 }];
  });
  const redisIncrement = vi.fn(async () => {
    if (options.redisError) throw options.redisError;
    return 1;
  });
  const redisExpire = vi.fn(async () => 1);

  vi.doMock("@/lib/config", () => ({
    hasDatabase: options.databaseConfigured ?? false,
    hasRedis: options.redisConfigured ?? false
  }));
  vi.doMock("@neondatabase/serverless", () => ({
    neon: vi.fn(() => databaseQuery)
  }));
  vi.doMock("@upstash/redis", () => ({
    Redis: {
      fromEnv: vi.fn(() => ({ incr: redisIncrement, expire: redisExpire }))
    }
  }));

  const limiter = await import("./rate-limit");
  return { limiter, databaseQuery, redisIncrement, redisExpire };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/config");
  vi.doUnmock("@neondatabase/serverless");
  vi.doUnmock("@upstash/redis");
  vi.resetModules();
});

describe("distributed rate limiting", () => {
  it("ships an additive, idempotent rate-limit schema migration", async () => {
    const migration = await readFile(
      new URL("../../db/migrations/007_create_try_me_rate_limits.sql", import.meta.url),
      "utf8"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS try_me_rate_limits");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS try_me_rate_limits_reset_at_idx");
    expect(migration).not.toMatch(/\bDROP\b/i);
  });

  it("keeps test and development requests in isolated process memory", async () => {
    const { limiter, databaseQuery, redisIncrement } = await loadRateLimiter({
      environment: "test",
      redisConfigured: true,
      databaseConfigured: true
    });

    expect(limiter.rateLimitStoreMode).toBe("memory-local");
    await limiter.enforceRateLimit("test-memory", 1, 60);
    await expect(limiter.enforceRateLimit("test-memory", 1, 60)).rejects.toBeInstanceOf(
      limiter.RateLimitError
    );
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(redisIncrement).not.toHaveBeenCalled();
  });

  it("uses one atomic Neon counter when production has no Upstash binding", async () => {
    const { limiter, databaseQuery } = await loadRateLimiter({
      databaseConfigured: true,
      databaseResult: [{ request_count: 1, retry_after: 60 }]
    });

    expect(limiter.rateLimitStoreMode).toBe("neon-postgres");
    await expect(limiter.enforceRateLimit("create:client", 5, 60)).resolves.toBeUndefined();
    expect(databaseQuery).toHaveBeenCalledTimes(1);
  });

  it("returns the distributed counter's retry window after the limit", async () => {
    const { limiter } = await loadRateLimiter({
      databaseConfigured: true,
      databaseResult: [{ request_count: 6, retry_after: 42 }]
    });

    await expect(limiter.enforceRateLimit("create:client", 5, 60)).rejects.toMatchObject({
      name: "Error",
      retryAfter: 42
    });
  });

  it("falls back from an unavailable Upstash service to Neon", async () => {
    const { limiter, databaseQuery, redisIncrement } = await loadRateLimiter({
      redisConfigured: true,
      databaseConfigured: true,
      redisError: new Error("Redis unavailable")
    });

    expect(limiter.rateLimitStoreMode).toBe("upstash-redis");
    await expect(limiter.enforceRateLimit("claim:client", 5, 3600)).resolves.toBeUndefined();
    expect(redisIncrement).toHaveBeenCalledTimes(1);
    expect(databaseQuery).toHaveBeenCalledTimes(1);
  });

  it("fails closed in production when no distributed backend is configured", async () => {
    const { limiter } = await loadRateLimiter();

    expect(limiter.rateLimitStoreMode).toBe("unavailable");
    await expect(limiter.enforceRateLimit("upload:client", 8, 3600)).rejects.toBeInstanceOf(
      limiter.RateLimitUnavailableError
    );
  });

  it("fails closed rather than using memory when the Neon counter is unavailable", async () => {
    const { limiter } = await loadRateLimiter({
      databaseConfigured: true,
      databaseError: new Error("Database unavailable")
    });

    await expect(limiter.enforceRateLimit("operation:session", 120, 3600)).rejects.toBeInstanceOf(
      limiter.RateLimitUnavailableError
    );
  });
});
