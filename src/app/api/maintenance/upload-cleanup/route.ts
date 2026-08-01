import { del, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { hasBlob } from "@/lib/config";
import { hasValidCronAuthorization } from "@/lib/cron-auth";
import { apiError, HttpError, noStoreHeaders } from "@/lib/http";
import { emitObservabilityLog } from "@/lib/observability";
import {
  selectExpiredUploadArtifacts,
  UPLOAD_PDF_PREFIX,
  UPLOAD_STATUS_PREFIX
} from "@/lib/upload-cleanup";

export const maxDuration = 300;
const DELETE_BATCH_SIZE = 100;

async function sweepPrefix(prefix: string, now: number): Promise<{ scanned: number; deleted: number }> {
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    scanned += page.blobs.length;
    const expired = selectExpiredUploadArtifacts(page.blobs, now);
    for (let index = 0; index < expired.length; index += DELETE_BATCH_SIZE) {
      const batch = expired.slice(index, index + DELETE_BATCH_SIZE);
      await del(batch);
      deleted += batch.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return { scanned, deleted };
}

export async function GET(request: NextRequest) {
  try {
    if (!hasValidCronAuthorization(request)) {
      throw new HttpError(401, "cron_unauthorized", "Unauthorized.");
    }
    if (!hasBlob) {
      throw new HttpError(503, "blob_not_configured", "Upload storage is not configured.");
    }

    const now = Date.now();
    const [uploads, statuses] = await Promise.all([
      sweepPrefix(UPLOAD_PDF_PREFIX, now),
      sweepPrefix(UPLOAD_STATUS_PREFIX, now)
    ]);
    emitObservabilityLog("info", {
      type: "try_me_trace",
      event: "upload_cleanup_completed",
      stage: "maintenance",
      outcome: "success",
      scanned: uploads.scanned + statuses.scanned,
      deleted: uploads.deleted + statuses.deleted,
      pdfsDeleted: uploads.deleted,
      statusRecordsDeleted: statuses.deleted
    });
    return NextResponse.json(
      {
        ok: true,
        scanned: uploads.scanned + statuses.scanned,
        deleted: uploads.deleted + statuses.deleted
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    return apiError(error, {
      route: "/api/maintenance/upload-cleanup",
      method: "GET",
      operation: "pdf_upload_cleanup"
    });
  }
}
