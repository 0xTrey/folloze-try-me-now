import { NextRequest, NextResponse } from "next/server";

import { hasValidCronAuthorization } from "@/lib/cron-auth";
import {
  apiError,
  HttpError,
  noStoreHeaders,
  startServerOperation
} from "@/lib/http";
import { buildTraceStoreMode, purgeExpiredBuildTraces } from "@/lib/build-trace-store";
import { purgeExpiredTraceEvents, traceStoreMode } from "@/lib/trace-store";
import {
  productAnalyticsStoreMode,
  purgeExpiredProductAnalytics
} from "@/lib/product-analytics";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const trace = startServerOperation({
    route: "/api/maintenance/trace-cleanup",
    method: "GET",
    operation: "trace_retention_cleanup",
    stage: "maintenance"
  });
  try {
    if (!hasValidCronAuthorization(request)) {
      throw new HttpError(401, "cron_unauthorized", "Unauthorized.");
    }
    if (traceStoreMode === "console-only") {
      throw new HttpError(503, "trace_store_unavailable", "Trace storage is not configured.");
    }

    const deleted = await purgeExpiredTraceEvents();
    const analytics = productAnalyticsStoreMode === "neon-postgres"
      ? await purgeExpiredProductAnalytics()
      : { eventsDeleted: 0, sessionsDeleted: 0, browserSessionsDeleted: 0, visitorsDeleted: 0 };
    // Expired build traces are purged on the same schedule. A failure here is
    // reported as a count of zero rather than failing the whole sweep.
    const buildTracesDeleted = buildTraceStoreMode === "neon-postgres"
      ? await purgeExpiredBuildTraces().catch(() => 0)
      : 0;
    const totalDeleted = deleted
      + buildTracesDeleted
      + analytics.eventsDeleted
      + analytics.sessionsDeleted
      + analytics.browserSessionsDeleted
      + analytics.visitorsDeleted;
    return NextResponse.json(
      { ok: true, deleted, buildTracesDeleted },
      { headers: { ...noStoreHeaders, ...trace.complete(200, { deleted: totalDeleted }) } }
    );
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}
