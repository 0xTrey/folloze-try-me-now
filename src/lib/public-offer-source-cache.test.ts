import { describe, expect, it } from "vitest";
import type { SourceArtifact } from "@/lib/content-intelligence";
import { getPublicOfferSourceCache, putPublicOfferSourceCache, type PublicOfferSourceCacheBackend } from "./public-offer-source-cache";

const now = new Date("2026-09-07T12:00:00.000Z");
const artifact = (): SourceArtifact => ({ version: 1, artifactId: "src_aaaaaaaaaaaaaaaaaaaaaaaa", digest: "a".repeat(64), createdAt: now.toISOString(), status: "ready", confidence: "high", source: { kind: "public-url", sourceUrl: "https://acme.example/offer", finalUrl: "https://acme.example/offer", mediaType: "text/html" }, extraction: { method: "html-static", status: "complete", truncated: false, ocr: { status: "not-required", pageNumbers: [], reason: "none" }, warnings: [] }, content: { title: "Acme Offer", text: "Acme Offer routes reviews.", sections: [{ id: "s1", title: "Offer", level: 2, order: 1, text: "Acme Offer routes reviews.", citationIds: ["c1"] }], links: [], assets: [], citations: [{ id: "c1", locator: { kind: "url-block", block: 1, label: "Offer", sourceUrl: "https://acme.example/offer" }, excerpt: "Acme Offer routes reviews." }] }, understanding: { topics: [], claims: [], proof: [], audiences: [], plannedAssets: [], experiencePlan: { pattern: "guided-brief", modules: [{ id: "m1", kind: "summary", title: "Summary", sourceCitationIds: ["c1"] }] } }, diagnostics: { textLength: 25, sectionCount: 1, citationCount: 1, claimCount: 0, assetCount: 0, warnings: [] } });
const input = () => ({ sellerDomain: "acme.example", offer: "Acme Offer", sourceUrl: "https://acme.example/offer", artifact: artifact(), now });
const encrypted = (value: unknown) => ({ version: 1, algorithm: "AES-256-GCM", ciphertext: JSON.stringify(value) });
const decrypt = <T>(value: unknown) => JSON.parse((value as { ciphertext: string }).ciphertext) as T;
type CachedRecord = { createdAt: string; expiresAt: string };
function backend(): { store: Map<string, unknown>; value: PublicOfferSourceCacheBackend } { const store = new Map<string, unknown>(); return { store, value: { read: async (path) => store.get(path) ?? null, write: async (path, value) => { store.set(path, value); } } }; }
const deps = (value: PublicOfferSourceCacheBackend) => ({ blobConfigured: true, backend: value, now: () => now, protect: encrypted, unprotect: decrypt });

describe("public offer source cache", () => {
  it("returns a fresh encrypted hit as a clone", async () => {
    const cache = backend(); expect((await putPublicOfferSourceCache(input(), deps(cache.value))).status).toBe("stored");
    const hit = await getPublicOfferSourceCache(input(), deps(cache.value)); expect(hit.status).toBe("hit"); expect(hit.artifact).toEqual(artifact());
    hit.artifact!.content.title = "mutated"; expect((await getPublicOfferSourceCache(input(), deps(cache.value))).artifact?.content.title).toBe("Acme Offer");
  });
  it("isolates seller, offer, and URL keys", async () => {
    const cache = backend(); await putPublicOfferSourceCache(input(), deps(cache.value));
    expect((await getPublicOfferSourceCache({ ...input(), offer: "Other" }, deps(cache.value))).status).toBe("miss");
    expect((await getPublicOfferSourceCache({ ...input(), sellerDomain: "other.example", sourceUrl: "https://other.example/offer" }, deps(cache.value))).status).toBe("miss");
  });
  it("rejects expired, future, unsafe, and malformed payloads", async () => {
    const cache = backend(); await putPublicOfferSourceCache(input(), deps(cache.value)); const [path] = [...cache.store.keys()];
    const value = decrypt<CachedRecord>(cache.store.get(path)); value.createdAt = "2026-09-06T11:00:00.000Z"; value.expiresAt = "2026-09-07T11:00:00.000Z"; cache.store.set(path, encrypted(value));
    expect((await getPublicOfferSourceCache(input(), deps(cache.value))).status).toBe("expired");
    value.createdAt = "2026-09-08T12:00:00.000Z"; value.expiresAt = "2026-09-09T12:00:00.000Z"; cache.store.set(path, encrypted(value));
    expect((await getPublicOfferSourceCache(input(), deps(cache.value))).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), sourceUrl: "https://127.0.0.1/offer" }, deps(cache.value))).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), sourceUrl: "https://acme.example/offer?utm=x" }, deps(cache.value))).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), artifact: { ...artifact(), source: { ...artifact().source, sourceUrl: "https://acme.example/offer?token=x" } } }, deps(cache.value))).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), artifact: { ...artifact(), source: { ...artifact().source, displayName: "customer-upload.pdf" } } }, deps(cache.value))).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), artifact: { ...artifact(), understanding: { ...artifact().understanding, nextAction: { label: "Continue", url: "https://outside.example/private", citationIds: ["c1"] } } } }, deps(cache.value))).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), artifact: { ...artifact(), privateSession: "no" } as SourceArtifact }, deps(cache.value))).status).toBe("rejected");
  });
  it("fails closed for unavailable backend, deadline, or missing configuration/encryption", async () => {
    const failing: PublicOfferSourceCacheBackend = { read: async () => { throw new Error("no"); }, write: async () => { throw new Error("no"); } };
    expect((await putPublicOfferSourceCache(input(), deps(failing))).status).toBe("unavailable");
    const slow: PublicOfferSourceCacheBackend = { read: async () => new Promise(() => {}), write: async () => new Promise(() => {}) };
    expect((await getPublicOfferSourceCache(input(), deps(slow))).status).toBe("timed_out");
    expect((await putPublicOfferSourceCache(input(), { ...deps(backend().value), blobConfigured: false })).status).toBe("skipped");
    expect((await putPublicOfferSourceCache(input(), { ...deps(backend().value), protect: (value) => value })).status).toBe("skipped");
    const noClock = { blobConfigured: true, backend: backend().value, protect: encrypted, unprotect: decrypt };
    expect((await getPublicOfferSourceCache({ ...input(), now: new Date("invalid") }, noClock)).status).toBe("rejected");
    expect((await putPublicOfferSourceCache({ ...input(), now: new Date("invalid") }, noClock)).status).toBe("rejected");
  });
});
