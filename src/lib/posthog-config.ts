import type { CaptureResult, PostHogConfig } from "posthog-js";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const privateKeyPattern = /\b(?:phx_|sk-)[A-Za-z0-9_-]{16,}\b/g;
const absoluteUrlPattern = /https?:\/\/[^\s"'<>]+/gi;
const hostnamePattern = /\b[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,24}\b/gi;
const supportRefPattern = /\bTMN-[A-Z0-9]{6,24}\b/gi;
const maxPostHogStringLength = 8_000;

/**
 * What a person profile may carry. Identification exists to join a claimed
 * visitor to their own funnel, which the opaque distinct ID already does; a
 * profile property is only allowed to say how that identification happened.
 */
const IDENTITY_PROPERTY_KEYS = new Set(["identity_source"]);

/**
 * The last line of defence before anything leaves the browser.
 *
 * Product events are already projected to allowlisted, token-shaped values.
 * This exists for everything else PostHog attaches on its own, and it redacts
 * rather than trusts: an address, a host, a link, or a support reference is
 * removed wherever it appears, including on an identify call. There is no
 * property that may keep a raw email, because a claim is recorded server-side
 * and the analytics side only needs to know that one happened.
 */
function sanitizeString(value: string): string {
  return value
    .replace(absoluteUrlPattern, "[url]")
    .replace(bearerPattern, "Bearer [redacted]")
    .replace(privateKeyPattern, "[redacted-key]")
    .replace(emailPattern, "[email]")
    .replace(supportRefPattern, "[support-ref]")
    .replace(hostnamePattern, "[domain]")
    .slice(0, maxPostHogStringLength);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 160)
        .map(([key, entry]) => [key, sanitizeValue(entry, depth + 1)])
    );
  }
  return value;
}

function boundedIdentityProperties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => IDENTITY_PROPERTY_KEYS.has(key))
      .map(([key, entry]) => [key, sanitizeValue(entry)])
  );
}

export function sanitizePostHogCapture(capture: CaptureResult | null): CaptureResult | null {
  if (!capture) return null;
  const sanitized = sanitizeValue(capture) as CaptureResult;
  const properties = sanitized.properties as Record<string, unknown> | undefined;
  if (!properties) return sanitized;
  for (const key of ["$set", "$set_once"]) {
    if (key in properties) properties[key] = boundedIdentityProperties(properties[key]);
  }
  return sanitized;
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
