import { describe, expect, it, afterEach } from "vitest";
import { protectJson, unprotectJson, type StorageEnvelope } from "@/lib/sensitive-storage";

const key = Buffer.alloc(32, 7).toString("base64");
const oldKey = Buffer.alloc(32, 8).toString("base64");
const context = { type: "session", id: "s1" };
afterEach(() => { delete process.env.SENSITIVE_STORAGE_ENCRYPTION_ENABLED; delete process.env.SENSITIVE_STORAGE_ACTIVE_KEY_ID; delete process.env.SENSITIVE_STORAGE_KEYS_JSON; });
function enable(id = "current", value = key) { process.env.SENSITIVE_STORAGE_ENCRYPTION_ENABLED = "true"; process.env.SENSITIVE_STORAGE_ACTIVE_KEY_ID = id; process.env.SENSITIVE_STORAGE_KEYS_JSON = JSON.stringify({ current: key, old: oldKey, [id]: value }); }

describe("sensitive storage", () => {
  it("round trips and uses a fresh nonce", () => {
    enable();
    const a = protectJson({ email: "a@example.com" }, context) as StorageEnvelope;
    const b = protectJson({ email: "a@example.com" }, context) as StorageEnvelope;
    expect(a.nonce).not.toBe(b.nonce);
    expect(unprotectJson(a, context)).toEqual({ email: "a@example.com" });
  });
  it("binds authentication to the logical record", () => {
    enable();
    const value = protectJson({ ok: true }, context);
    expect(() => unprotectJson(value, { type: "session", id: "other" })).toThrow();
  });
  it("rejects changed ciphertext", () => {
    enable();
    const value = protectJson({ ok: true }, context) as StorageEnvelope;
    value.ciphertext = `${value.ciphertext.slice(0, -2)}aa`;
    expect(() => unprotectJson(value, context)).toThrow();
  });
  it("fails closed when the active key is missing", () => {
    process.env.SENSITIVE_STORAGE_ENCRYPTION_ENABLED = "true";
    process.env.SENSITIVE_STORAGE_ACTIVE_KEY_ID = "missing";
    process.env.SENSITIVE_STORAGE_KEYS_JSON = "{}";
    expect(() => protectJson({}, context)).toThrow();
  });
  it("decrypts with an old rotation key", () => {
    enable("old", oldKey);
    const value = protectJson({ rotated: true }, context);
    enable("current");
    expect(unprotectJson(value, context)).toEqual({ rotated: true });
  });
  it("allows explicit plaintext migration readback", () => {
    enable();
    expect(unprotectJson({ legacy: true }, context)).toEqual({ legacy: true });
  });
});
