import { describe, expect, it } from "vitest";

import {
  PDF_ORPHAN_RETENTION_MS,
  selectExpiredUploadArtifacts,
  UPLOAD_STATUS_RETENTION_MS
} from "@/lib/upload-cleanup";

describe("upload artifact cleanup selection", () => {
  const now = Date.parse("2026-07-30T20:00:00.000Z");
  const sessionId = "abcdefghijklmnopqrstuvwx12345678";
  const uploadId = "123e4567-e89b-42d3-a456-426614174000";

  it("selects stranded PDFs only after the 30-minute grace window", () => {
    const pathname = `try-me/uploads/${sessionId}/${uploadId}.pdf`;
    expect(
      selectExpiredUploadArtifacts(
        [{ pathname, uploadedAt: new Date(now - PDF_ORPHAN_RETENTION_MS - 1) }],
        now
      )
    ).toEqual([pathname]);
    expect(
      selectExpiredUploadArtifacts(
        [{ pathname, uploadedAt: new Date(now - PDF_ORPHAN_RETENTION_MS + 1) }],
        now
      )
    ).toEqual([]);
  });

  it("retains safe status metadata for one day and then removes it", () => {
    const pathname = `try-me/upload-status/${sessionId}/${uploadId}.json`;
    expect(
      selectExpiredUploadArtifacts(
        [{ pathname, uploadedAt: new Date(now - UPLOAD_STATUS_RETENTION_MS - 1) }],
        now
      )
    ).toEqual([pathname]);
  });

  it("never deletes objects outside the exact upload namespaces", () => {
    expect(
      selectExpiredUploadArtifacts(
        [
          { pathname: `try-me/sessions/${sessionId}.json`, uploadedAt: new Date(0) },
          { pathname: `try-me/uploads/${sessionId}/not-a-uuid.pdf`, uploadedAt: new Date(0) },
          { pathname: `try-me/uploads/${sessionId}/${uploadId}.html`, uploadedAt: new Date(0) }
        ],
        now
      )
    ).toEqual([]);
  });
});
