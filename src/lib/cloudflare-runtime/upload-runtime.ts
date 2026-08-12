/**
 * Inactive mock-backed Cloudflare upload package.  It deliberately has no
 * Worker bindings, runtime selector, or Vercel route import.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const CAPABILITY_TTL_MS = 10 * 60_000;
export const CALLBACK_LEASE_MS = 5 * 60_000;
export const CALLBACK_MAX_SECONDS = 300;
export const SCHEDULED_HANDLERS = [
  { name: "upload-cleanup", cron: "*/15 * * * *" },
  { name: "lead-reconciliation", cron: "*/5 * * * *" },
  { name: "trace-cleanup", cron: "17 3 * * *" },
] as const;

export type Identity = { sessionId: string; uploadId: string };
export type Capability = Identity & {
  nonce: string; objectKey: string; statusKey: string; mime: "application/pdf";
  maxBytes: number; expiresAt: number; writeOnce: true;
};
export type ObjectHead = { key: string; etag: string; size: number; contentType: string };
export type UploadState = { status: "pending" | "processing" | "complete" | "failed"; version: number; owner?: string; leaseUntil?: number; attempts: number; etag?: string };
export type QueueMessage = Identity & { id: string; deliveries: number };
type VersionedSession = { version: number; value: Record<string, unknown> };

export const objectKey = (sessionId: string, uploadId: string) => `try-me/uploads/${sessionId}/${uploadId}.pdf`;
export const statusKey = (sessionId: string, uploadId: string) => `try-me/upload-status/${sessionId}/${uploadId}.json`;
const sessionKey = (sessionId: string) => `session:${sessionId}`;
const messageId = ({ sessionId, uploadId }: Identity) => `extract:${sessionId}:${uploadId}`;

export class MockRuntime {
  readonly capabilities = new Map<string, Capability>();
  readonly objects = new Map<string, ObjectHead>();
  readonly states = new Map<string, UploadState>();
  readonly sessions = new Map<string, VersionedSession>();
  readonly queue = new Map<string, QueueMessage>();
  readonly outcomes: string[] = [];
  readonly cronDispatches: string[] = [];
  failEnqueue = false;
  private sessionConflicts = 0;

  constructor(public maxPdfBytes = MAX_PDF_BYTES) {}

  seedSession(sessionId: string, value: Record<string, unknown> = {}, version = 1) {
    this.sessions.set(sessionKey(sessionId), { value: { ...value }, version });
  }
  forceSessionConflicts(count: number) { this.sessionConflicts = count; }

  issue(input: Identity & { nonce: string; now: number }): Capability {
    if (this.capabilities.has(input.nonce)) throw new Error("capability_exists");
    if (this.states.has(statusKey(input.sessionId, input.uploadId))) throw new Error("upload_identity_exists");
    const capability: Capability = { ...input, objectKey: objectKey(input.sessionId, input.uploadId), statusKey: statusKey(input.sessionId, input.uploadId), mime: "application/pdf", maxBytes: this.maxPdfBytes, expiresAt: input.now + CAPABILITY_TTL_MS, writeOnce: true };
    this.capabilities.set(capability.nonce, capability);
    this.states.set(capability.statusKey, { status: "pending", version: 1, attempts: 0 });
    return capability;
  }

  putDirect(nonce: string, head: ObjectHead, now: number) {
    const capability = this.requireCapability(nonce, now);
    if (head.key !== capability.objectKey || head.contentType !== capability.mime || head.size < 1 || head.size > capability.maxBytes || !head.etag || this.objects.has(head.key)) throw new Error("invalid_upload_object");
    this.objects.set(head.key, { ...head });
  }

  async reserveSession(identity: Identity, maxRetries = 3): Promise<"reserved" | "conflict"> {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = this.sessions.get(sessionKey(identity.sessionId));
      if (!current) throw new Error("session_missing");
      const currentUpload = current.value.sourceUploadId;
      if (typeof currentUpload === "string" && currentUpload !== identity.uploadId) return "conflict";
      const next = { ...current.value, sourceUploadId: identity.uploadId };
      if (this.compareAndSetSession(identity.sessionId, current.version, next)) return "reserved";
    }
    return "conflict";
  }

  async callback(nonce: string, owner: string, now: number): Promise<"claimed" | "replay" | "in-progress" | "conflict"> {
    const capability = this.requireCapability(nonce, now);
    const head = this.objects.get(capability.objectKey);
    if (!head || head.key !== capability.objectKey || !head.etag || head.contentType !== capability.mime || head.size < 1 || head.size > capability.maxBytes) throw new Error("invalid_callback");
    const key = capability.statusKey;
    const state = this.states.get(key);
    if (!state) throw new Error("status_missing");
    if (state.status === "complete" || state.status === "failed") return "replay";
    if (state.status === "processing" && (state.leaseUntil ?? 0) > now) return "in-progress";
    this.states.set(key, { ...state, status: "processing", owner, leaseUntil: now + CALLBACK_LEASE_MS, attempts: state.attempts + 1, etag: head.etag, version: state.version + 1 });
    return "claimed";
  }

  async claimReserveAndEnqueue(nonce: string, owner: string, now: number) {
    const claimed = await this.callback(nonce, owner, now);
    if (claimed !== "claimed") return claimed;
    const capability = this.requireCapability(nonce, now);
    if ((await this.reserveSession(capability)) !== "reserved") { this.failOwned(capability.statusKey, owner); return "conflict" as const; }
    try { this.enqueue(capability); } catch (error) { this.releaseOwned(capability.statusKey, owner); this.releaseSession(capability); throw error; }
    return "claimed" as const;
  }

  enqueue(identity: Identity) {
    if (this.failEnqueue) throw new Error("enqueue_failed");
    const id = messageId(identity);
    if (!this.queue.has(id)) this.queue.set(id, { ...identity, id, deliveries: 0 });
  }
  processQueue(id: string, result: "success" | "retry", owner: string, maxDeliveries = 3) {
    const message = this.queue.get(id); if (!message) return "duplicate" as const;
    const key = statusKey(message.sessionId, message.uploadId); const state = this.states.get(key);
    if (!state || state.status === "complete" || state.status === "failed") { this.queue.delete(id); return "duplicate" as const; }
    if (state.owner !== owner) throw new Error("owner_lost");
    if (result === "success") { this.completeOwned(key, owner); this.queue.delete(id); return "complete" as const; }
    message.deliveries += 1;
    if (message.deliveries >= maxDeliveries) { this.failOwned(key, owner); this.queue.delete(id); return "dlq" as const; }
    return "retry" as const;
  }

  completeOwned(key: string, owner: string) { const state = this.owned(key, owner); this.states.set(key, { ...state, status: "complete", owner: undefined, leaseUntil: undefined, version: state.version + 1 }); this.outcomes.push(`d1:complete:${key}`); }
  failOwned(key: string, owner: string) { const state = this.owned(key, owner); this.states.set(key, { ...state, status: "failed", owner: undefined, leaseUntil: undefined, version: state.version + 1 }); this.outcomes.push(`d1:failed:${key}`); }
  releaseOwned(key: string, owner: string) { const state = this.owned(key, owner); this.states.set(key, { ...state, status: "pending", owner: undefined, leaseUntil: undefined, version: state.version + 1 }); }
  dispatchScheduled(name: (typeof SCHEDULED_HANDLERS)[number]["name"]) { if (!SCHEDULED_HANDLERS.some((job) => job.name === name)) throw new Error("unknown_schedule"); this.cronDispatches.push(name); }

  private requireCapability(nonce: string, now: number) { const capability = this.capabilities.get(nonce); if (!capability || capability.expiresAt <= now) throw new Error("capability_expired"); return capability; }
  private compareAndSetSession(id: string, expected: number, value: Record<string, unknown>) { if (this.sessionConflicts > 0) { this.sessionConflicts -= 1; return false; } const key = sessionKey(id), current = this.sessions.get(key); if (!current || current.version !== expected) return false; this.sessions.set(key, { value, version: current.version + 1 }); return true; }
  private releaseSession(identity: Identity) { const current = this.sessions.get(sessionKey(identity.sessionId)); if (current?.value.sourceUploadId === identity.uploadId) this.sessions.set(sessionKey(identity.sessionId), { version: current.version + 1, value: Object.fromEntries(Object.entries(current.value).filter(([key]) => key !== "sourceUploadId")) }); }
  private owned(key: string, owner: string) { const state = this.states.get(key); if (!state || state.status !== "processing" || state.owner !== owner) throw new Error("owner_lost"); return state; }
}
