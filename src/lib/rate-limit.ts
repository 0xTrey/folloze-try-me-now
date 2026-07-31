import { createHash } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";

import { hasDatabase, hasRedis } from "@/lib/config";

type Bucket = { count: number; resetAt: number };

declare global {
  var __follozeTryMeRateLimits: Map<string, Bucket> | undefined;
}

const buckets = globalThis.__follozeTryMeRateLimits ?? new Map<string, Bucket>();
globalThis.__follozeTryMeRateLimits = buckets;

let redis: Redis | null = null;
const getRedis = () => (redis ??= Redis.fromEnv());
let databaseClient: ReturnType<typeof neon> | null = null;
const getDatabase = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  databaseClient ??= neon(process.env.DATABASE_URL);
  return databaseClient;
};

export type RateLimitStoreMode =
  | "memory-local"
  | "upstash-redis"
  | "neon-postgres"
  | "unavailable";

export function selectRateLimitStoreMode(options: {
  environment: string | undefined;
  redisConfigured: boolean;
  databaseConfigured: boolean;
}): RateLimitStoreMode {
  if (options.environment !== "production") return "memory-local";
  if (options.redisConfigured) return "upstash-redis";
  if (options.databaseConfigured) return "neon-postgres";
  return "unavailable";
}

export const rateLimitStoreMode = selectRateLimitStoreMode({
  environment: process.env.NODE_ENV,
  redisConfigured: hasRedis,
  databaseConfigured: hasDatabase
});

export function isDistributedRateLimitStoreMode(mode: RateLimitStoreMode): boolean {
  return mode === "upstash-redis" || mode === "neon-postgres";
}

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number) {
    super("Too many requests. Try again shortly.");
    this.retryAfter = retryAfter;
  }
}

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("Request protection is temporarily unavailable. Please try again shortly.");
    this.name = "RateLimitUnavailableError";
  }
}

export function anonymousClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

function stableBucketKey(key: string, windowSeconds: number): string {
  const digest = createHash("sha256")
    .update(`${key}:${windowSeconds}`)
    .digest("hex");
  return `try-me:rate:${digest}`;
}

async function enforceMemoryLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const now = Date.now();
  const windowKey = `${bucketKey}:${Math.floor(now / (windowSeconds * 1000))}`;
  const current = buckets.get(windowKey);
  if (!current || current.resetAt <= now) {
    buckets.set(windowKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new RateLimitError(Math.ceil((current.resetAt - now) / 1000));
  }
}

async function enforceRedisLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const redisBucketKey = `${bucketKey}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const client = getRedis();
  const count = await client.incr(redisBucketKey);
  if (count === 1) await client.expire(redisBucketKey, windowSeconds + 2);
  if (count > limit) throw new RateLimitError(windowSeconds);
}

async function enforceNeonLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const sql = getDatabase();
  const rows = await sql`
    WITH stale_buckets AS (
      DELETE FROM try_me_rate_limits
      WHERE reset_at < now() - interval '1 day'
      RETURNING bucket_key
    )
    INSERT INTO try_me_rate_limits (
      bucket_key,
      request_count,
      reset_at,
      updated_at
    ) VALUES (
      ${bucketKey},
      1,
      now() + make_interval(secs => ${windowSeconds}),
      now()
    )
    ON CONFLICT (bucket_key) DO UPDATE SET
      request_count = CASE
        WHEN try_me_rate_limits.reset_at <= now() THEN 1
        ELSE try_me_rate_limits.request_count + 1
      END,
      reset_at = CASE
        WHEN try_me_rate_limits.reset_at <= now()
          THEN now() + make_interval(secs => ${windowSeconds})
        ELSE try_me_rate_limits.reset_at
      END,
      updated_at = now()
    RETURNING
      request_count,
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (reset_at - now())))
      )::integer AS retry_after
  `;
  const returnedRows = Array.isArray(rows) ? rows : rows.rows;
  const result = returnedRows[0];
  if (!result || Array.isArray(result) || typeof result !== "object") {
    throw new Error("The distributed rate-limit counter returned an invalid result.");
  }
  const count = Number(result?.request_count);
  const retryAfter = Number(result?.retry_after);
  if (!Number.isFinite(count) || !Number.isFinite(retryAfter)) {
    throw new Error("The distributed rate-limit counter returned an invalid result.");
  }
  if (count > limit) throw new RateLimitError(Math.max(1, Math.trunc(retryAfter)));
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const bucketKey = stableBucketKey(key, windowSeconds);
  if (rateLimitStoreMode === "memory-local") {
    await enforceMemoryLimit(bucketKey, limit, windowSeconds);
    return;
  }
  if (rateLimitStoreMode === "neon-postgres") {
    try {
      await enforceNeonLimit(bucketKey, limit, windowSeconds);
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      throw new RateLimitUnavailableError();
    }
    return;
  }
  if (rateLimitStoreMode === "upstash-redis") {
    try {
      await enforceRedisLimit(bucketKey, limit, windowSeconds);
      return;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      if (hasDatabase) {
        try {
          await enforceNeonLimit(bucketKey, limit, windowSeconds);
          return;
        } catch (fallbackError) {
          if (fallbackError instanceof RateLimitError) throw fallbackError;
        }
      }
    }
  }
  throw new RateLimitUnavailableError();
}
