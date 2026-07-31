export const UPLOAD_PDF_PREFIX = "try-me/uploads/";
export const UPLOAD_STATUS_PREFIX = "try-me/upload-status/";

export const PDF_ORPHAN_RETENTION_MS = 30 * 60 * 1000;
export const UPLOAD_STATUS_RETENTION_MS = 24 * 60 * 60 * 1000;

type CleanupCandidate = {
  pathname: string;
  uploadedAt: Date;
};

const sessionPart = "[A-Za-z0-9_-]{20,64}";
const uploadPart = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const pdfPathPattern = new RegExp(`^${UPLOAD_PDF_PREFIX}${sessionPart}/${uploadPart}\\.pdf$`, "i");
const statusPathPattern = new RegExp(`^${UPLOAD_STATUS_PREFIX}${sessionPart}/${uploadPart}\\.json$`, "i");

export function selectExpiredUploadArtifacts(
  blobs: CleanupCandidate[],
  now = Date.now()
): string[] {
  return blobs.flatMap((blob) => {
    const age = now - blob.uploadedAt.getTime();
    if (pdfPathPattern.test(blob.pathname) && age >= PDF_ORPHAN_RETENTION_MS) {
      return [blob.pathname];
    }
    if (statusPathPattern.test(blob.pathname) && age >= UPLOAD_STATUS_RETENTION_MS) {
      return [blob.pathname];
    }
    return [];
  });
}
