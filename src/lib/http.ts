import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { RateLimitError } from "@/lib/rate-limit";

export const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow"
};

type LogValue = string | number | boolean | null | undefined;

export type ErrorContext = {
  route?: string;
  method?: string;
  sessionId?: string;
  operation?: string;
  status?: number;
  code?: string;
  details?: Record<string, LogValue>;
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function safeLogText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b[^\s/\\]+\.pdf\b/gi, "[redacted-pdf]")
    .replace(/\bfile-[A-Za-z0-9_-]{8,}\b/g, "[redacted-file-id]")
    .replace(
      /\b(?:sk_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{12,}|vercel_blob_[A-Za-z0-9_-]{12,})\b/g,
      "[redacted-secret]"
    )
    .slice(0, 240);
}

function safeDetails(details: ErrorContext["details"]): Record<string, LogValue> | undefined {
  if (!details) return undefined;
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, typeof value === "string" ? safeLogText(value) : value])
  );
}

export function logServerError(error: unknown, context: ErrorContext = {}): string {
  const requestId = randomUUID();
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown server error";
  console.error(
    JSON.stringify({
      type: "try_me_error",
      at: new Date().toISOString(),
      requestId,
      code: context.code ?? "request_failed",
      status: context.status,
      route: context.route,
      method: context.method,
      sessionId: context.sessionId,
      operation: context.operation,
      errorName,
      message: safeLogText(message),
      details: safeDetails(context.details)
    })
  );
  return requestId;
}

export function apiError(error: unknown, context: ErrorContext = {}): NextResponse {
  let status: number;
  let code: string;
  let message: string;
  const responseHeaders: Record<string, string> = { ...noStoreHeaders };

  if (error instanceof RateLimitError) {
    status = 429;
    code = "rate_limited";
    message = error.message;
    responseHeaders["Retry-After"] = String(error.retryAfter);
  } else if (error instanceof ZodError) {
    status = 400;
    code = "invalid_input";
    message = error.issues[0]?.message ?? "Check the information and try again.";
  } else if (error instanceof HttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else {
    const rawMessage = error instanceof Error ? error.message : "Something went wrong.";
    const isExpectedInputError = /^(Enter |Use your business email|Only public HTTPS URLs|That domain cannot be fetched safely)/i.test(
      rawMessage
    );
    if (/expired|not found/i.test(rawMessage)) {
      status = 410;
      code = "expired";
      message = rawMessage;
    } else if (/already been claimed/i.test(rawMessage)) {
      status = 409;
      code = "already_claimed";
      message = rawMessage;
    } else if (isExpectedInputError) {
      status = 400;
      code = "invalid_input";
      message = rawMessage;
    } else {
      status = 500;
      code = "internal_error";
      message = "We could not complete that request. Please try again.";
    }
  }

  const requestId = logServerError(error, { ...context, status, code });
  responseHeaders["X-Request-Id"] = requestId;
  return NextResponse.json({ error: message, code, requestId }, { status, headers: responseHeaders });
}
