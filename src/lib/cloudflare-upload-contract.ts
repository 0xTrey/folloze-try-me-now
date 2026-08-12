/** Inactive, provider-neutral proof. Vercel remains the selected runtime. */
export type UploadStatus = "pending" | "processing" | "complete" | "failed";
export type Versioned<T> = { value: T; version: string };
export type UploadIdentity = { sessionId: string; uploadId: string };
export const CALLBACK_MAX_SECONDS = 300;
export const scheduledJobs = [
  { name: "upload-cleanup", cron: "*/15 * * * *" },
  { name: "lead-reconciliation", cron: "*/5 * * * *" },
  { name: "trace-cleanup", cron: "17 3 * * *" }
] as const;

export interface DirectUploadAdapter {
  authorizeUpload(input: UploadIdentity & { pathname: string }): Promise<{ uploadUrl: string; expiresAt: number }>;
  compareAndSet<T>(key: string, expectedVersion: string, value: T): Promise<"applied" | "conflict">;
  enqueueExtraction(input: UploadIdentity): Promise<void>;
}
export interface UploadAuthorizer { canEdit(sessionId: string): Promise<boolean>; getSession(sessionId: string): Promise<{ id: string; acceptsPdf: boolean } | null>; }
export const uploadObjectKey = (sessionId: string, uploadId: string) => `try-me/uploads/${sessionId}/${uploadId}.pdf`;
export const statusObjectKey = (sessionId: string, uploadId: string) => `try-me/upload-status/${sessionId}/${uploadId}.json`;
const sessionKey = (sessionId: string) => `session:${sessionId}`;
const statusKey = (sessionId: string, uploadId: string) => `upload-status:${sessionId}:${uploadId}`;

export async function beginUpload(adapter: DirectUploadAdapter, authorizer: UploadAuthorizer, input: UploadIdentity & { origin: string; expectedOrigin: string; pathname: string; statusPath: string }) {
  if (input.origin !== input.expectedOrigin) throw new Error("cross_origin_upload");
  if (!(await authorizer.canEdit(input.sessionId))) throw new Error("editor_inactive");
  const session = await authorizer.getSession(input.sessionId);
  if (!session || session.id !== input.sessionId || !session.acceptsPdf) throw new Error("invalid_upload_session");
  if (input.pathname !== uploadObjectKey(input.sessionId, input.uploadId) || input.statusPath !== statusObjectKey(input.sessionId, input.uploadId)) throw new Error("upload_path_mismatch");
  return adapter.authorizeUpload({ sessionId: input.sessionId, uploadId: input.uploadId, pathname: input.pathname });
}

export function validateCallback(expected: UploadIdentity, callback: UploadIdentity & { pathname: string }) {
  if (callback.sessionId !== expected.sessionId || callback.uploadId !== expected.uploadId || callback.pathname !== uploadObjectKey(expected.sessionId, expected.uploadId)) throw new Error("upload_path_mismatch");
}

export async function claimUploadStatus(adapter: DirectUploadAdapter, identity: UploadIdentity, snapshot: Versioned<{ status: UploadStatus }>) {
  if (snapshot.value.status === "complete" || snapshot.value.status === "failed") return "replay" as const;
  if (snapshot.value.status === "processing") return "in-progress" as const;
  return (await adapter.compareAndSet(statusKey(identity.sessionId, identity.uploadId), snapshot.version, { status: "processing" })) === "applied" ? "claimed" as const : "conflict" as const;
}
export async function reserveSession(adapter: DirectUploadAdapter, sessionId: string, session: Versioned<{ sourceUploadId?: string }>, uploadId: string) {
  if (session.value.sourceUploadId && session.value.sourceUploadId !== uploadId) return "conflict" as const;
  return (await adapter.compareAndSet(sessionKey(sessionId), session.version, { sourceUploadId: uploadId })) === "applied" ? "reserved" as const : "conflict" as const;
}
export async function handoffAfterClaim(adapter: DirectUploadAdapter, identity: UploadIdentity, elapsedSeconds: number) {
  if (elapsedSeconds > CALLBACK_MAX_SECONDS) throw new Error("callback_duration_exceeded");
  await adapter.enqueueExtraction(identity);
}
