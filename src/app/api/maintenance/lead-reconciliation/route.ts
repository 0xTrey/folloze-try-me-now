import { NextRequest, NextResponse } from "next/server";

import { hasValidCronAuthorization } from "@/lib/cron-auth";
import { apiError, HttpError, logServerError, noStoreHeaders } from "@/lib/http";
import { leadStoreMode, listLeadsNeedingReconciliation } from "@/lib/lead-store";
import { reconcileLeadSession, type LeadReconciliationResult } from "@/lib/orchestrator";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    if (!hasValidCronAuthorization(request)) {
      throw new HttpError(401, "cron_unauthorized", "Unauthorized.");
    }
    if (leadStoreMode === "memory-demo") {
      throw new HttpError(503, "lead_ledger_not_durable", "The lead ledger is not durable.");
    }

    const sessionIds = await listLeadsNeedingReconciliation(100);
    const settled = await Promise.allSettled(sessionIds.map((id) => reconcileLeadSession(id)));
    const counts: Record<LeadReconciliationResult | "failed", number> = {
      reconciled: 0,
      resumed: 0,
      pending: 0,
      missing: 0,
      stale: 0,
      failed: 0
    };

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        counts[result.value] += 1;
        return;
      }
      counts.failed += 1;
      logServerError(result.reason, {
        route: "/api/maintenance/lead-reconciliation",
        method: "GET",
        sessionId: sessionIds[index],
        operation: "scheduled_lead_reconciliation",
        code: "scheduled_lead_reconciliation_failed"
      });
    });

    console.info(
      JSON.stringify({
        type: "try_me_lead_reconciliation_completed",
        at: new Date().toISOString(),
        scanned: sessionIds.length,
        ...counts
      })
    );
    return NextResponse.json({ ok: true, scanned: sessionIds.length, ...counts }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error, {
      route: "/api/maintenance/lead-reconciliation",
      method: "GET",
      operation: "scheduled_lead_reconciliation"
    });
  }
}
