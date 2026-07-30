import { Redis } from "@upstash/redis";
import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";

import { config, hasBlob, hasRedis } from "@/lib/config";
import type { PublicTryMeSession, TryMeSession } from "@/lib/types";

type StoredEntry = { value: TryMeSession; expiresAt?: number };
type BlobSnapshot = { entry: StoredEntry; etag: string };

declare global {
  var __follozeTryMeSessions: Map<string, StoredEntry> | undefined;
}

const memory = globalThis.__follozeTryMeSessions ?? new Map<string, StoredEntry>();
globalThis.__follozeTryMeSessions = memory;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

const keyFor = (id: string) => `try-me:session:${id}`;
const blobPathFor = (id: string) => `try-me/sessions/${id}.json`;
const strongEtag = (etag: string) => etag.replace(/^W\//, "");

function storedEntry(
  session: TryMeSession,
  options: { persist?: boolean; ttlSeconds?: number }
): StoredEntry {
  const ttlSeconds = options.ttlSeconds ?? config.sessionTtlSeconds;
  return {
    value: structuredClone(session),
    expiresAt: options.persist ? undefined : Date.now() + ttlSeconds * 1000
  };
}

async function readBlobSnapshot(id: string): Promise<BlobSnapshot | null> {
  const result = await get(blobPathFor(id), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const entry = (await new Response(result.stream).json()) as StoredEntry;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    try {
      await del(blobPathFor(id), { ifMatch: strongEtag(result.blob.etag) });
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
    return null;
  }
  // JSON responses can be compressed in transit, which prefixes the HTTP ETag with W/.
  // Blob conditional writes expect the underlying strong object ETag.
  return { entry, etag: strongEtag(result.blob.etag) };
}

async function writeBlobEntry(
  id: string,
  entry: StoredEntry,
  options: { ifMatch?: string } = {}
): Promise<void> {
  await put(blobPathFor(id), JSON.stringify(entry), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    ifMatch: options.ifMatch
  });
}

export async function putSession(
  session: TryMeSession,
  options: { persist?: boolean; ttlSeconds?: number } = {}
): Promise<void> {
  const ttlSeconds = options.ttlSeconds ?? config.sessionTtlSeconds;
  if (hasRedis) {
    const client = getRedis();
    if (options.persist) {
      await client.set(keyFor(session.id), session);
      await client.persist(keyFor(session.id));
    } else {
      await client.set(keyFor(session.id), session, { ex: ttlSeconds });
    }
    return;
  }

  if (hasBlob) {
    await writeBlobEntry(session.id, storedEntry(session, options));
    return;
  }

  memory.set(session.id, storedEntry(session, { ...options, ttlSeconds }));
}

export async function getSession(id: string): Promise<TryMeSession | null> {
  if (hasRedis) {
    return (await getRedis().get<TryMeSession>(keyFor(id))) ?? null;
  }

  if (hasBlob) {
    const snapshot = await readBlobSnapshot(id);
    return snapshot ? structuredClone(snapshot.entry.value) : null;
  }

  const entry = memory.get(id);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memory.delete(id);
    return null;
  }
  return structuredClone(entry.value);
}

export async function updateSession(
  id: string,
  updater: (session: TryMeSession) => TryMeSession | Promise<TryMeSession>,
  options: { persist?: boolean; ttlSeconds?: number } = {}
): Promise<TryMeSession | null> {
  if (hasBlob && !hasRedis) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await readBlobSnapshot(id);
      if (!snapshot) return null;
      const next = await updater(structuredClone(snapshot.entry.value));
      next.updatedAt = new Date().toISOString();
      next.revision += 1;
      try {
        await writeBlobEntry(id, storedEntry(next, options), { ifMatch: snapshot.etag });
        return next;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) continue;
        throw error;
      }
    }
    throw new Error("The experience changed while it was being updated. Please retry.");
  }

  const current = await getSession(id);
  if (!current) return null;
  const next = await updater(current);
  next.updatedAt = new Date().toISOString();
  next.revision += 1;
  await putSession(next, options);
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  if (hasRedis) {
    await getRedis().del(keyFor(id));
    return;
  }
  if (hasBlob) {
    await del(blobPathFor(id));
    return;
  }
  memory.delete(id);
}

export function toPublicSession(session: TryMeSession): PublicTryMeSession {
  const safeSession = Object.fromEntries(
    Object.entries(session).filter(([key]) => key !== "editorTokenHash")
  ) as Omit<TryMeSession, "editorTokenHash">;
  const claim = session.claim
    ? {
        emailMasked: session.claim.emailMasked,
        emailStatus: session.claim.emailStatus,
        publishStatus: session.claim.publishStatus,
        follozeBoardId: session.claim.follozeBoardId,
        designerUrl: session.claim.designerUrl
      }
    : undefined;
  return { ...safeSession, claim };
}

export const sessionStoreMode = hasRedis
  ? "upstash-redis"
  : hasBlob
    ? "vercel-blob"
    : "memory-demo";
