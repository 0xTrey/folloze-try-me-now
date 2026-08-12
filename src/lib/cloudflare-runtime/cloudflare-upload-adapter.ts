import type { D1Database, ExtractionMessage, Queue, R2Bucket, RuntimeBindings } from "@/lib/cloudflare-runtime/types";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const CAPABILITY_TTL_MS = 10 * 60_000;
export const LEASE_MS = 5 * 60_000;
export const MAX_CAS_RETRIES = 3;
export const SCHEDULES = [
  { name: "upload-cleanup", cron: "*/15 * * * *" },
  { name: "lead-reconciliation", cron: "*/5 * * * *" },
  { name: "trace-cleanup", cron: "17 3 * * *" },
] as const;
export type Identity = { sessionId: string; uploadId: string };
export type Capability = Identity & { nonce: string; expiresAt: number; objectKey: string; statusKey: string; mime: "application/pdf"; maxBytes: number; writeOnce: true };
export type Claim = "claimed" | "replay" | "in-progress" | "conflict";
export type QueueDisposition = "complete" | "retry" | "dlq" | "duplicate";
export const objectKey = (sessionId: string, uploadId: string) => `try-me/uploads/${sessionId}/${uploadId}.pdf`;
export const statusKey = (sessionId: string, uploadId: string) => `try-me/upload-status/${sessionId}/${uploadId}.json`;
const messageId = ({ sessionId, uploadId }: Identity) => `extract:${sessionId}:${uploadId}`;

/** A real-binding adapter. It is inert until the isolated Worker opts in. */
export class CloudflareUploadAdapter {
  constructor(private readonly db: D1Database, private readonly r2: R2Bucket, private readonly queue: Queue<ExtractionMessage>, private readonly now: () => number = Date.now) {}

  async issue(identity: Identity, nonce: string): Promise<Capability> {
    const capability: Capability = { ...identity, nonce, objectKey: objectKey(identity.sessionId, identity.uploadId), statusKey: statusKey(identity.sessionId, identity.uploadId), expiresAt: this.now() + CAPABILITY_TTL_MS, mime: "application/pdf", maxBytes: MAX_PDF_BYTES, writeOnce: true };
    const result = await this.db.prepare("INSERT INTO cf_upload_capabilities (nonce, session_id, upload_id, object_key, status_key, expires_at, mime, max_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(nonce, capability.sessionId, capability.uploadId, capability.objectKey, capability.statusKey, capability.expiresAt, capability.mime, capability.maxBytes).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new Error("upload_identity_exists");
    await this.db.prepare("INSERT INTO cf_upload_status (status_key, status, version, attempts) VALUES (?, 'pending', 1, 0)").bind(capability.statusKey).run();
    return capability;
  }

  async authorize(identity: Identity, nonce: string) {
    const cap = await this.capability(identity, nonce);
    if (cap.expiresAt <= this.now()) throw new Error("capability_expired");
    return { capability: cap, multipart: await this.r2.createMultipartUpload(cap.objectKey, { httpMetadata: { contentType: cap.mime } }) };
  }

  async claimCallback(identity: Identity, nonce: string, owner: string): Promise<Claim> {
    const cap = await this.capability(identity, nonce);
    if (cap.expiresAt <= this.now()) throw new Error("capability_expired");
    const head = await this.r2.head(cap.objectKey);
    if (!head || head.key !== cap.objectKey || !head.etag || head.httpMetadata?.contentType !== cap.mime || head.size < 1 || head.size > cap.maxBytes) throw new Error("invalid_upload_object");
    const current = await this.db.prepare("SELECT status, version, lease_until FROM cf_upload_status WHERE status_key = ?").bind(cap.statusKey).first<{ status: string; version: number; lease_until: number | null }>();
    if (!current) throw new Error("status_missing");
    if (current.status === "complete" || current.status === "failed") return "replay";
    if (current.status === "processing" && (current.lease_until ?? 0) > this.now()) return "in-progress";
    const result = await this.db.prepare("UPDATE cf_upload_status SET status = 'processing', owner = ?, lease_until = ?, attempts = attempts + 1, etag = ?, version = version + 1 WHERE status_key = ? AND version = ?")
      .bind(owner, this.now() + LEASE_MS, head.etag, cap.statusKey, current.version).run();
    return (result.meta?.changes ?? 0) === 1 ? "claimed" : "conflict";
  }

  async patchSessionAfterUpload(identity: Identity) {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
      const current = await this.db.prepare("SELECT version, data_json FROM cf_upload_sessions WHERE session_id = ?").bind(identity.sessionId).first<{ version: number; data_json: string }>();
      if (!current) throw new Error("session_missing");
      const data = JSON.parse(current.data_json) as Record<string, unknown>;
      if (typeof data.sourceUploadId === "string" && data.sourceUploadId !== identity.uploadId) return "conflict" as const;
      const result = await this.db.prepare("UPDATE cf_upload_sessions SET data_json = ?, version = version + 1 WHERE session_id = ? AND version = ?")
        .bind(JSON.stringify({ ...data, sourceUploadId: identity.uploadId }), identity.sessionId, current.version).run();
      if ((result.meta?.changes ?? 0) === 1) return "patched" as const;
    }
    return "conflict" as const;
  }

  async enqueueAfterClaim(identity: Identity, owner: string) {
    const key = statusKey(identity.sessionId, identity.uploadId);
    try { await this.queue.send({ id: messageId(identity), ...identity, statusKey: key, attempt: 0 }); }
    catch (error) { await this.releaseOwned(key, owner); throw error; }
  }
  /** Queue consumer policy: a terminal state wins over duplicate delivery. */
  async consume(message: ExtractionMessage, owner: string, retryableFailure: boolean, maxDeliveries = 3): Promise<QueueDisposition> {
    if (message.id !== messageId(message) || message.statusKey !== statusKey(message.sessionId, message.uploadId)) throw new Error("queue_message_invalid");
    const current = await this.db.prepare("SELECT status, owner FROM cf_upload_status WHERE status_key = ?").bind(message.statusKey).first<{ status: string; owner: string | null }>();
    if (!current || current.status === "complete" || current.status === "failed") return "duplicate";
    if (current.status !== "processing" || current.owner !== owner) throw new Error("owner_lost");
    if (!retryableFailure) { await this.completeOwned(message, owner); return "complete"; }
    if (message.attempt + 1 < maxDeliveries) return "retry";
    await this.failOwned(message, owner);
    return "dlq";
  }
  async completeOwned(identity: Identity, owner: string) { await this.terminal(identity, owner, "complete"); }
  async failOwned(identity: Identity, owner: string) { await this.terminal(identity, owner, "failed"); }
  async releaseOwned(key: string, owner: string) { await this.db.prepare("UPDATE cf_upload_status SET status = 'pending', owner = NULL, lease_until = NULL, version = version + 1 WHERE status_key = ? AND status = 'processing' AND owner = ?").bind(key, owner).run(); }
  async recordOutcomeAfterCompletion(identity: Identity) { await this.db.prepare("INSERT OR IGNORE INTO cf_upload_outcomes (status_key, session_id, upload_id, outcome) VALUES (?, ?, ?, 'complete')").bind(statusKey(identity.sessionId, identity.uploadId), identity.sessionId, identity.uploadId).run(); }

  private async terminal(identity: Identity, owner: string, status: "complete" | "failed") {
    const result = await this.db.prepare("UPDATE cf_upload_status SET status = ?, owner = NULL, lease_until = NULL, version = version + 1 WHERE status_key = ? AND status = 'processing' AND owner = ?").bind(status, statusKey(identity.sessionId, identity.uploadId), owner).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new Error("owner_lost");
    if (status === "complete") await this.recordOutcomeAfterCompletion(identity);
  }
  private async capability(identity: Identity, nonce: string): Promise<Capability> {
    const row = await this.db.prepare("SELECT nonce, session_id, upload_id, object_key, status_key, expires_at, mime, max_bytes FROM cf_upload_capabilities WHERE nonce = ? AND session_id = ? AND upload_id = ?").bind(nonce, identity.sessionId, identity.uploadId).first<{ nonce: string; session_id: string; upload_id: string; object_key: string; status_key: string; expires_at: number; mime: "application/pdf"; max_bytes: number }>();
    if (!row) throw new Error("capability_invalid");
    return { nonce: row.nonce, sessionId: row.session_id, uploadId: row.upload_id, objectKey: row.object_key, statusKey: row.status_key, expiresAt: row.expires_at, mime: row.mime, maxBytes: row.max_bytes, writeOnce: true };
  }
}

export function dispatchScheduled(name: (typeof SCHEDULES)[number]["name"], handlers: Record<(typeof SCHEDULES)[number]["name"], () => Promise<void>>) { return handlers[name](); }

/** Explicitly fail closed. No existing route calls this selector. */
export const cloudflareAdapterEnabled = (env: Pick<RuntimeBindings, "ADAPTER_ENABLED">) => env.ADAPTER_ENABLED === "enabled";
