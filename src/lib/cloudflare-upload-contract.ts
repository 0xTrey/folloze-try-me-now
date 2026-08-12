/**
 * Provider-neutral proof for the Blob -> R2 direct-upload translation.
 * It is deliberately not selected by runtime configuration: Vercel remains
 * authoritative until an adapter binds these operations to R2/DO/D1.
 */
export type UploadStatus = "pending" | "processing" | "complete" | "failed";
export type Versioned<T> = { value: T; version: string };

export type UploadIntent = { sessionId: string; uploadId: string; pathname: string; origin: string };
export type UploadCallback = { sessionId: string; uploadId: string; pathname: string };

export interface DirectUploadAdapter {
  authorize(intent: UploadIntent): Promise<{ uploadUrl: string; expiresAt: number }>;
  compareAndSet<T>(key: string, expectedVersion: string, value: T): Promise<"applied" | "conflict">;
}

export function uploadObjectKey(sessionId: string, uploadId: string): string {
  return `try-me/uploads/${sessionId}/${uploadId}.pdf`;
}

export function validateAuthorization(intent: UploadIntent, expectedOrigin: string): void {
  if (intent.origin !== expectedOrigin) throw new Error("cross_origin_upload");
  if (intent.pathname !== uploadObjectKey(intent.sessionId, intent.uploadId)) throw new Error("upload_path_mismatch");
}

export function validateCallback(callback: UploadCallback): void {
  if (callback.pathname !== uploadObjectKey(callback.sessionId, callback.uploadId)) {
    throw new Error("upload_path_mismatch");
  }
}

export function claimUploadStatus(
  snapshot: Versioned<{ status: UploadStatus }>,
): { key: string; expectedVersion: string; next: { status: "processing" } } | "replay" | "in-progress" {
  if (snapshot.value.status === "complete" || snapshot.value.status === "failed") return "replay";
  if (snapshot.value.status === "processing") return "in-progress";
  return { key: "status", expectedVersion: snapshot.version, next: { status: "processing" } };
}

export async function reserveSession(
  adapter: DirectUploadAdapter,
  session: Versioned<{ sourceUploadId?: string }>,
  uploadId: string,
): Promise<"reserved" | "conflict"> {
  if (session.value.sourceUploadId && session.value.sourceUploadId !== uploadId) return "conflict";
  return (await adapter.compareAndSet("session", session.version, { sourceUploadId: uploadId })) === "applied"
    ? "reserved"
    : "conflict";
}
