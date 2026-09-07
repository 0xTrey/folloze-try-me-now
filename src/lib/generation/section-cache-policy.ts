import { compilerDigest } from "@/lib/generation/compiler-digest";
import type { SectionWritingContract } from "@/lib/generation/section-writing-contract";

/**
 * Cache only within a private session. Revision and slot identity are runtime
 * metadata, not model dependencies, so callers can rebind a warm response to
 * the current section while evidence, voice, CTA, model, and schema inputs
 * remain part of the digest.
 */
function dependencyOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dependencyOnly);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "revision" && key !== "sectionId")
      .map(([key, member]) => [key, dependencyOnly(member)])
  );
}

export function sectionCacheKey(input: {
  contract: SectionWritingContract;
  model: string;
  schemaVersion: string;
  instructions: string;
  requestInput: string;
}): string | undefined {
  let payload: unknown;
  try {
    payload = dependencyOnly(JSON.parse(input.requestInput));
  } catch {
    // Never reuse a cache entry when the dependency envelope is malformed.
    return undefined;
  }
  return compilerDigest("section-cache-v2", {
    sessionId: input.contract.sessionId,
    model: input.model,
    schemaVersion: input.schemaVersion,
    instructions: input.instructions,
    input: payload
  });
}
