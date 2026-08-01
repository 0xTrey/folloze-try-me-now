import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  emitObservabilityLog,
  supportRefForTraceId,
  type ObservabilityMeta
} from "@/lib/observability";
import { RateLimitError, RateLimitUnavailableError } from "@/lib/rate-limit";

export const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow"
};

export type ErrorContext = {
  route?: string;
  method?: string;
  sessionId?: string;
  traceId?: string;
  supportRef?: string;
  requestId?: string;
  operation?: string;
  stage?: string;
  status?: number;
  code?: string;
  details?: ObservabilityMeta;
};

export interface ServerOperationTrace {
  readonly requestId: string;
  setSessionId(sessionId: string): void;
  setTraceId(traceId: string): void;
  setSupportRef(supportRef: string): void;
  complete(status: number, details?: ObservabilityMeta): Record<string, string>;
  errorContext(details?: ObservabilityMeta): ErrorContext;
}

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

function fallbackTraceId(sessionId: string | undefined): string | undefined {
  return sessionId
    ? `lookup_${createHash("sha256")
        .update(`try-me-request-trace-v1\u0000${sessionId}`)
        .digest("hex")
        .slice(0, 24)}`
    : undefined;
}

export function logServerError(error: unknown, context: ErrorContext = {}): string {
  const requestId = context.requestId ?? randomUUID();
  const errorName = error instanceof Error ? error.name : "UnknownError";
  emitObservabilityLog("error", {
    type: "try_me_error",
    event: "request_failed",
    requestId,
    traceId: context.traceId ?? fallbackTraceId(context.sessionId),
    supportRef: context.supportRef,
    code: context.code ?? "request_failed",
    status: context.status,
    route: context.route,
    method: context.method,
    operation: context.operation,
    stage: context.stage,
    errorName,
    details: context.details
  });
  return requestId;
}

export function startServerOperation(context: ErrorContext): ServerOperationTrace {
  const requestId = context.requestId ?? randomUUID();
  const startedAt = Date.now();
  let sessionId = context.sessionId;
  let traceId = context.traceId;
  let supportRef = context.supportRef;
  let completed = false;

  emitObservabilityLog("info", {
    type: "try_me_request",
    event: "request_started",
    requestId,
    traceId: traceId ?? fallbackTraceId(sessionId),
    supportRef,
    route: context.route,
    method: context.method,
    operation: context.operation,
    stage: context.stage
  });

  const correlationHeaders = () => {
    const currentTraceId = traceId ?? fallbackTraceId(sessionId);
    const currentSupportRef = supportRef ?? (currentTraceId ? supportRefForTraceId(currentTraceId) : undefined);
    return {
      "X-Request-Id": requestId,
      ...(currentSupportRef ? { "X-Support-Ref": currentSupportRef } : {})
    };
  };

  return {
    requestId,
    setSessionId(nextSessionId) {
      sessionId = nextSessionId;
    },
    setTraceId(nextTraceId) {
      traceId = nextTraceId;
      supportRef = supportRefForTraceId(nextTraceId);
    },
    setSupportRef(nextSupportRef) {
      supportRef = nextSupportRef;
    },
    complete(status, details) {
      if (!completed) {
        completed = true;
        emitObservabilityLog("info", {
          type: "try_me_request",
          event: "request_completed",
          requestId,
          traceId: traceId ?? fallbackTraceId(sessionId),
          supportRef,
          route: context.route,
          method: context.method,
          operation: context.operation,
          stage: context.stage,
          status,
          durationMs: Date.now() - startedAt,
          outcome: "success",
          details
        });
      }
      return correlationHeaders();
    },
    errorContext(details) {
      return {
        ...context,
        requestId,
        sessionId,
        traceId: traceId ?? fallbackTraceId(sessionId),
        supportRef,
        details: { ...context.details, ...details }
      };
    }
  };
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
  } else if (error instanceof RateLimitUnavailableError) {
    status = 503;
    code = "request_protection_unavailable";
    message = error.message;
    responseHeaders["Retry-After"] = "30";
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

  const requestId = context.requestId ?? randomUUID();
  if (status >= 500) {
    logServerError(error, { ...context, requestId, status, code });
  } else {
    emitObservabilityLog("warn", {
      type: "try_me_request",
      event: "request_rejected",
      requestId,
      traceId: context.traceId ?? fallbackTraceId(context.sessionId),
      supportRef: context.supportRef,
      route: context.route,
      method: context.method,
      operation: context.operation,
      stage: context.stage,
      status,
      code,
      outcome: "rejected"
    });
  }
  responseHeaders["X-Request-Id"] = requestId;
  const traceId = context.traceId ?? fallbackTraceId(context.sessionId);
  const supportRef = context.supportRef ?? (traceId ? supportRefForTraceId(traceId) : undefined);
  if (supportRef) responseHeaders["X-Support-Ref"] = supportRef;
  return NextResponse.json({ error: message, code, requestId }, { status, headers: responseHeaders });
}
