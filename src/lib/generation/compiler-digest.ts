/**
 * One canonical digest for compiler decisions.
 *
 * A receipt is only worth keeping if a re-run can be checked against it, which
 * requires that key order, absent optional keys, and array order all hash the
 * same way every time. `JSON.stringify` guarantees none of that, so the value is
 * serialized here with sorted keys and dropped `undefined` members first.
 *
 * Digest sources must already be source-free. This module hashes whatever it is
 * handed; it does not decide what is safe to persist.
 */

import { createHash } from "node:crypto";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
    .join(",")}}`;
}

/** Namespaced so digests from different compiler layers cannot collide. */
export function compilerDigest(namespace: string, value: unknown): string {
  return createHash("sha256")
    .update(`${namespace}\u0000${canonicalJson(value)}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Hash of a private text value, for digest sources that must react to a wording
 * change without carrying the wording.
 */
export function compilerTextDigest(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
