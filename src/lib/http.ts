import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { RateLimitError } from "@/lib/rate-limit";

export function apiError(error: unknown): NextResponse {
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(error.retryAfter) } }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Check the information and try again.", code: "invalid_input" },
      { status: 400 }
    );
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = /expired|not found/i.test(message) ? 410 : /already been claimed/i.test(message) ? 409 : 400;
  return NextResponse.json({ error: message, code: "request_failed" }, { status });
}

export const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow"
};
