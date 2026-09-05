import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const VERSION = 1;
const ALGORITHM = "AES-256-GCM";
export type StorageContext = { type: string; id: string };
export type StorageEnvelope = { version: 1; algorithm: "AES-256-GCM"; keyId: string; nonce: string; ciphertext: string; tag: string };

function keys(): Map<string, Buffer> {
  const raw = process.env.SENSITIVE_STORAGE_KEYS_JSON;
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return new Map(Object.entries(parsed).flatMap(([id, value]) => {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return [];
      const key = Buffer.from(value, "base64");
      return key.length === 32 && key.toString("base64") === value ? [[id, key] as const] : [];
    }));
  } catch { return new Map(); }
}

function enabledKey(): { id: string; key: Buffer } | null {
  if (process.env.SENSITIVE_STORAGE_ENCRYPTION_ENABLED !== "true") return null;
  const id = process.env.SENSITIVE_STORAGE_ACTIVE_KEY_ID?.trim();
  const key = id ? keys().get(id) : undefined;
  if (!id || !key) throw new Error("Sensitive storage encryption is enabled but the active key is missing or invalid.");
  return { id, key };
}
function aad(context: StorageContext): Buffer {
  if (!context.type || !context.id || context.type.length > 80 || context.id.length > 256) throw new Error("Invalid sensitive storage context.");
  return Buffer.from(JSON.stringify([context.type, context.id]), "utf8");
}
function jsonBytes(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error("Sensitive storage payload is too large.");
  return bytes;
}
function isEnvelope(value: unknown): value is StorageEnvelope {
  return Boolean(value && typeof value === "object" && (value as StorageEnvelope).version === 1 && (value as StorageEnvelope).algorithm === ALGORITHM);
}

// The nonce is generated separately so it is never reused, and is included in the envelope.
export function protectJson(value: unknown, context: StorageContext): unknown {
  const active = enabledKey();
  if (!active) return value;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", active.key, nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(jsonBytes(value)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { version: VERSION, algorithm: ALGORITHM, keyId: active.id, nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: tag.toString("base64") } satisfies StorageEnvelope;
}

export function unprotectJson<T>(value: unknown, context: StorageContext): T {
  if (!isEnvelope(value)) {
    if (value && typeof value === "object" && ("ciphertext" in value || "nonce" in value || "keyId" in value)) {
      throw new Error("Invalid sensitive storage envelope.");
    }
    if (process.env.SENSITIVE_STORAGE_ENCRYPTION_ENABLED === "true" && process.env.SENSITIVE_STORAGE_ALLOW_LEGACY_PLAINTEXT === "false") {
      throw new Error("Unencrypted sensitive storage requires migration.");
    }
    return value as T;
  }
  if (typeof value.keyId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.keyId) ||
      typeof value.nonce !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(value.nonce) ||
      typeof value.tag !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(value.tag) ||
      typeof value.ciphertext !== "string" || value.ciphertext.length > Math.ceil(MAX_PAYLOAD_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.ciphertext)) throw new Error("Invalid sensitive storage envelope.");
  const key = keys().get(value.keyId);
  if (!key) throw new Error("Encrypted sensitive storage key is unavailable.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.nonce, "base64"));
    decipher.setAAD(aad(context));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]);
    if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error("Sensitive storage payload is too large.");
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch { throw new Error("Sensitive storage authentication failed."); }
}
