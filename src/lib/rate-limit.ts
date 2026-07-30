import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";

import { hasRedis } from "@/lib/config";

type Bucket = { count: number; resetAt: number };

declare global {
  var __follozeTryMeRateLimits: Map<string, Bucket> | undefined;
}

const buckets = globalThis.__follozeTryMeRateLimits ?? new Map<string, Bucket>();
globalThis.__follozeTryMeRateLimits = buckets;

let redis: Redis | null = null;
const getRedis = () => (redis ??= Redis.fromEnv());

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number) {
    super("Too many requests. Try again shortly.");
    this.retryAfter = retryAfter;
  }
}

export function anonymousClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const bucketKey = `try-me:rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  if (hasRedis) {
    const count = await getRedis().incr(bucketKey);
    if (count === 1) await getRedis().expire(bucketKey, windowSeconds + 2);
    if (count > limit) throw new RateLimitError(windowSeconds);
    return;
  }

  const now = Date.now();
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new RateLimitError(Math.ceil((current.resetAt - now) / 1000));
}
