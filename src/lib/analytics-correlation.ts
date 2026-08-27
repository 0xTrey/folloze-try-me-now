import { createHash } from "node:crypto";

import { ANALYTICS_CORRELATION_KEY_DOMAIN } from "@/lib/product-analytics-contracts";

/**
 * Derives the key PostHog carries so a behavior funnel can be joined to a
 * private build trace. The join is deliberately one-way: the key is a salted
 * digest of the trace ID, so an analytics reader can match a session they
 * already hold a trace for but cannot recover the trace ID from PostHog.
 *
 * Server-only. It lives apart from the event contracts because the browser
 * client imports those, and only the server ever holds a trace ID to hash.
 */
export function analyticsCorrelationKey(traceId: string): string {
  return `ck_${createHash("sha256")
    .update(ANALYTICS_CORRELATION_KEY_DOMAIN)
    .update("\u0000")
    .update(traceId)
    .digest("hex")
    .slice(0, 16)}`;
}
