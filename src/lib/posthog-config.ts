import type { CaptureResult, PostHogConfig } from "posthog-js";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const privateKeyPattern = /\b(?:phx_|sk-)[A-Za-z0-9_-]{16,}\b/g;
const absoluteUrlPattern = /https?:\/\/[^\s"'<>]+/gi;
const maxPostHogStringLength = 8_000;

function stripUrlDetails(value: string): string {
  return value.replace(absoluteUrlPattern, (candidate) => {
    try {
      const parsed = new URL(candidate);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "[url]";
    }
  });
}

function sanitizeString(value: string, preserveClaimEmail: boolean): string {
  const withoutCredentials = stripUrlDetails(value)
    .replace(bearerPattern, "Bearer [redacted]")
    .replace(privateKeyPattern, "[redacted-key]");
  const sanitized = preserveClaimEmail
    ? withoutCredentials
    : withoutCredentials.replace(emailPattern, "[email]");
  return sanitized.slice(0, maxPostHogStringLength);
}

function sanitizeValue(
  value: unknown,
  path: string[],
  identifyEvent: boolean,
  depth = 0
): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    const preserveClaimEmail = identifyEvent
      && path.length === 2
      && path[0] === "$set"
      && path[1] === "email";
    return sanitizeString(value, preserveClaimEmail);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry, index) =>
      sanitizeValue(entry, [...path, String(index)], identifyEvent, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 160).map(([key, entry]) => [
        key,
        sanitizeValue(entry, [...path, key], identifyEvent, depth + 1)
      ])
    );
  }
  return value;
}

export function sanitizePostHogCapture(capture: CaptureResult | null): CaptureResult | null {
  if (!capture) return null;
  const identifyEvent = capture.event === "$identify";
  return sanitizeValue(capture, [], identifyEvent) as CaptureResult;
}

export function postHogBrowserConfig(options: {
  apiHost: string;
  replayEnabled: boolean;
}): Partial<PostHogConfig> {
  return {
    api_host: options.apiHost,
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    // Native capture would send arbitrary error text and stack frames. Errors
    // reach analytics as bounded typed codes through the product event path.
    capture_exceptions: false,
    respect_dnt: true,
    before_send: sanitizePostHogCapture,
    disable_session_recording: !options.replayEnabled,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskCapturedNetworkRequestFn: (request) => {
        if (request.name) request.name = request.name.split("?")[0];
        return request;
      }
    }
  };
}
