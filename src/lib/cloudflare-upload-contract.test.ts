import { describe, expect, it } from "vitest";
import { claimUploadStatus, reserveSession, uploadObjectKey, validateAuthorization, validateCallback, type DirectUploadAdapter } from "@/lib/cloudflare-upload-contract";

const sessionId = "abcdefghijklmnopqrst";
const uploadId = "11111111-1111-4111-8111-111111111111";
const pathname = uploadObjectKey(sessionId, uploadId);
const adapter = (outcome: "applied" | "conflict"): DirectUploadAdapter => ({
  authorize: async () => ({ uploadUrl: "https://example.invalid", expiresAt: 1 }),
  compareAndSet: async () => outcome
});

describe("Cloudflare direct-upload parity contract", () => {
  it("authorizes only the browser origin and exact session-scoped object key", () => {
    expect(() => validateAuthorization({ sessionId, uploadId, pathname, origin: "https://app.example" }, "https://app.example")).not.toThrow();
    expect(() => validateAuthorization({ sessionId, uploadId, pathname, origin: "https://evil.example" }, "https://app.example")).toThrow("cross_origin_upload");
  });
  it("rejects callback path substitution", () => {
    expect(() => validateCallback({ sessionId, uploadId, pathname: `${pathname}.other` })).toThrow("upload_path_mismatch");
  });
  it("treats terminal callbacks as replay and processing callbacks as in-progress", () => {
    expect(claimUploadStatus({ value: { status: "complete" }, version: "1" })).toBe("replay");
    expect(claimUploadStatus({ value: { status: "processing" }, version: "1" })).toBe("in-progress");
  });
  it("requires CAS for session reservation and surfaces conflicts", async () => {
    await expect(reserveSession(adapter("applied"), { value: {}, version: "1" }, uploadId)).resolves.toBe("reserved");
    await expect(reserveSession(adapter("conflict"), { value: {}, version: "1" }, uploadId)).resolves.toBe("conflict");
    await expect(reserveSession(adapter("applied"), { value: { sourceUploadId: "other" }, version: "1" }, uploadId)).resolves.toBe("conflict");
  });
});
