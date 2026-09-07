import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { get as blobGet, put as blobPut } from "@vercel/blob";
import { sourceArtifactSchema, type SourceArtifact } from "@/lib/content-intelligence";
import { hasBlob } from "@/lib/config";
import { protectJson, unprotectJson, type StorageContext } from "@/lib/sensitive-storage";
import { isPrivateHost } from "@/lib/asset-allocation";

export const PUBLIC_OFFER_SOURCE_CACHE_VERSION = "public-offer-source-v1";
export const PUBLIC_OFFER_SOURCE_CACHE_TTL_MS = 24 * 60 * 60_000;
const MAX_RECORD_BYTES = 512 * 1024;
const DEADLINE_MS = 250;

type CacheStatus = "hit" | "miss" | "stored" | "expired" | "rejected" | "unavailable" | "timed_out" | "skipped";
type CacheRecord = { version: typeof PUBLIC_OFFER_SOURCE_CACHE_VERSION; key: string; createdAt: string; expiresAt: string; artifact: SourceArtifact };
export type PublicOfferSourceCacheResult = { status: CacheStatus; artifact?: SourceArtifact; key?: string };
export type PublicOfferSourceCacheInput = { sellerDomain: string; offer: string; sourceUrl: string; artifact?: SourceArtifact; now?: Date };
export type PublicOfferSourceCacheBackend = { read(path: string): Promise<unknown | null>; write(path: string, value: unknown): Promise<void> };
export type PublicOfferSourceCacheDependencies = { blobConfigured?: boolean; backend?: PublicOfferSourceCacheBackend; now?: () => Date; protect?: (value: unknown, context: StorageContext) => unknown; unprotect?: <T>(value: unknown, context: StorageContext) => T };

function validText(value: unknown, max = 400): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validPublicUrl(value: unknown, sellerDomain: string): string | undefined {
  if (!validText(value, 1_000) || !validText(sellerDomain, 253)) return undefined;
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const seller = sellerDomain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash || !host || isIP(host) !== 0 || isPrivateHost(host) || !(host === seller || host.endsWith(`.${seller}`))) return undefined;
    return url.toString();
  } catch { return undefined; }
}
function sameShape(input: unknown, output: unknown): boolean {
  if (Array.isArray(input) || Array.isArray(output)) return Array.isArray(input) && Array.isArray(output) && input.length === output.length && input.every((item, index) => sameShape(item, output[index]));
  if (input && output && typeof input === "object" && typeof output === "object") {
    const left = Object.keys(input as Record<string, unknown>).sort(), right = Object.keys(output as Record<string, unknown>).sort();
    return left.length === right.length && left.every((key, index) => key === right[index] && sameShape((input as Record<string, unknown>)[key], (output as Record<string, unknown>)[key]));
  }
  return input === output;
}
function safeArtifact(input: PublicOfferSourceCacheInput): SourceArtifact | undefined {
  if (!input.artifact || !validPublicUrl(input.sourceUrl, input.sellerDomain)) return undefined;
  const parsed = sourceArtifactSchema.safeParse(input.artifact);
  if (!parsed.success || !sameShape(input.artifact, parsed.data)) return undefined;
  const artifact = parsed.data;
  const sourceKeys = Object.keys(artifact.source).sort();
  if (sourceKeys.length !== 4 || sourceKeys.some((key, index) => key !== ["finalUrl", "kind", "mediaType", "sourceUrl"][index])) return undefined;
  if (artifact.source.kind !== "public-url" || artifact.status !== "ready" || artifact.extraction.status !== "complete" || artifact.extraction.truncated || !artifact.source.sourceUrl || !artifact.source.finalUrl) return undefined;
  const refs = [artifact.source.sourceUrl, artifact.source.finalUrl, ...artifact.content.links.map((link) => link.url), ...artifact.content.assets.flatMap((asset) => asset.sourceUrl ? [asset.sourceUrl] : []), ...artifact.content.citations.flatMap((citation) => citation.locator.kind === "url-block" ? [citation.locator.sourceUrl] : []), ...(artifact.understanding.nextAction?.url ? [artifact.understanding.nextAction.url] : [])];
  if (!refs.every((url) => Boolean(validPublicUrl(url, input.sellerDomain)))) return undefined;
  if (validPublicUrl(artifact.source.sourceUrl, input.sellerDomain) !== validPublicUrl(input.sourceUrl, input.sellerDomain)) return undefined;
  try { if (Buffer.byteLength(JSON.stringify(artifact), "utf8") > MAX_RECORD_BYTES) return undefined; } catch { return undefined; }
  return artifact;
}
function cacheIdentity(input: Pick<PublicOfferSourceCacheInput, "sellerDomain" | "offer" | "sourceUrl">): { key: string; path: string } | undefined {
  const sourceUrl = validPublicUrl(input.sourceUrl, input.sellerDomain), offer = validText(input.offer, 200) ? input.offer.trim().replace(/\s+/g, " ").toLocaleLowerCase() : undefined;
  if (!sourceUrl || !offer) return undefined;
  const seller = input.sellerDomain.trim().toLocaleLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const key = createHash("sha256").update(JSON.stringify({ version: PUBLIC_OFFER_SOURCE_CACHE_VERSION, seller, offer, sourceUrl })).digest("hex");
  return { key, path: `try-me/public-offer-source/${PUBLIC_OFFER_SOURCE_CACHE_VERSION}/${key}.json` };
}
function encryptedEnvelope(value: unknown): boolean { return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).version === 1 && (value as Record<string, unknown>).algorithm === "AES-256-GCM" && typeof (value as Record<string, unknown>).ciphertext === "string"); }
function deadline<T>(operation: Promise<T>): Promise<T> { let timer: ReturnType<typeof setTimeout> | undefined; const timeout = new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("cache_timeout")), DEADLINE_MS); }); return Promise.race([operation, timeout]).finally(() => { if (timer) clearTimeout(timer); }); }
const defaultBackend: PublicOfferSourceCacheBackend = {
  async read(path) { const result = await blobGet(path, { access: "private", useCache: false }); return result?.statusCode === 200 ? new Response(result.stream).json() : null; },
  async write(path, value) { await blobPut(path, JSON.stringify(value), { access: "private", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0, contentType: "application/json" }); }
};
function runtime(input: Pick<PublicOfferSourceCacheInput, "now">, dependencies: PublicOfferSourceCacheDependencies) { return { configured: dependencies.blobConfigured ?? hasBlob, now: dependencies.now?.() ?? input.now ?? new Date(), backend: dependencies.backend ?? defaultBackend, protect: dependencies.protect ?? protectJson, unprotect: dependencies.unprotect ?? unprotectJson }; }

/** Reads only encrypted, public, first-party offer artifacts. Any uncertainty is a cache miss. */
export async function getPublicOfferSourceCache(input: Pick<PublicOfferSourceCacheInput, "sellerDomain" | "offer" | "sourceUrl" | "now">, dependencies: PublicOfferSourceCacheDependencies = {}): Promise<PublicOfferSourceCacheResult> {
  const identity = cacheIdentity(input), services = runtime(input, dependencies);
  if (!Number.isFinite(services.now.getTime())) return { status: "rejected" };
  if (!identity) return { status: "rejected" }; if (!services.configured) return { status: "skipped" };
  const context = { type: "public-offer-source", id: identity.key } as const;
  try {
    const envelope = await deadline(services.backend.read(identity.path)); if (!envelope) return { status: "miss", key: identity.key };
    if (!encryptedEnvelope(envelope)) return { status: "rejected", key: identity.key };
    const record = services.unprotect<CacheRecord>(envelope, context);
    if (!record || record.version !== PUBLIC_OFFER_SOURCE_CACHE_VERSION || record.key !== identity.key || !validText(record.createdAt, 64) || !validText(record.expiresAt, 64) || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.createdAt) > services.now.getTime() || Date.parse(record.expiresAt) !== Date.parse(record.createdAt) + PUBLIC_OFFER_SOURCE_CACHE_TTL_MS) return { status: "rejected", key: identity.key };
    if (Date.parse(record.expiresAt) <= services.now.getTime()) return { status: "expired", key: identity.key };
    const artifact = safeArtifact({ ...input, artifact: record.artifact });
    return artifact ? { status: "hit", artifact: structuredClone(artifact), key: identity.key } : { status: "rejected", key: identity.key };
  } catch (error) { return { status: error instanceof Error && error.message === "cache_timeout" ? "timed_out" : "unavailable", key: identity.key }; }
}

/** Writes an encrypted, bounded public-only artifact. It never persists session or user state. */
export async function putPublicOfferSourceCache(input: PublicOfferSourceCacheInput, dependencies: PublicOfferSourceCacheDependencies = {}): Promise<PublicOfferSourceCacheResult> {
  const identity = cacheIdentity(input), artifact = safeArtifact(input), services = runtime(input, dependencies);
  if (!Number.isFinite(services.now.getTime())) return { status: "rejected" };
  if (!identity || !artifact) return { status: "rejected" }; if (!services.configured) return { status: "skipped" };
  const context = { type: "public-offer-source", id: identity.key } as const;
  try {
    const createdAt = services.now.toISOString(), record: CacheRecord = { version: PUBLIC_OFFER_SOURCE_CACHE_VERSION, key: identity.key, createdAt, expiresAt: new Date(services.now.getTime() + PUBLIC_OFFER_SOURCE_CACHE_TTL_MS).toISOString(), artifact };
    const envelope = services.protect(record, context); if (!encryptedEnvelope(envelope)) return { status: "skipped", key: identity.key };
    if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > MAX_RECORD_BYTES) return { status: "rejected", key: identity.key };
    await deadline(services.backend.write(identity.path, envelope));
    return { status: "stored", key: identity.key };
  } catch (error) { return { status: error instanceof Error && error.message === "cache_timeout" ? "timed_out" : "unavailable", key: identity.key }; }
}
