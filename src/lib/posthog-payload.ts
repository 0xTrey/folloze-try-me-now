/**
 * The last gate before a property reaches PostHog.
 *
 * PostHog is a behavior sink, not a content store. The first-party queue keeps
 * everything an operator needs; what leaves for a third party is limited to
 * bounded codes, enums, counts, and buckets. Two independent rules apply, so a
 * new property has to pass both: the key must not name an identity or a piece
 * of content, and the value must read as a code rather than as prose.
 */

type PostHogProperty = string | number | boolean | null;

export interface PostHogEventMeta {
  /** Per-event random ID for provider-side deduplication. Never stable. */
  insertId: string;
  category?: string;
  outcome?: string;
  durationMs?: number;
}

/**
 * Identity and content keys. `correlation_key` is deliberately absent: it is
 * the approved one-way join, and it is derived server-side from a trace ID
 * that cannot be recovered from the digest.
 */
const FORBIDDEN_KEY =
  /^(?:try_me_)?(?:visitor|browser_session|product_session|session|trace|support_ref|user|person|distinct)(?:_id)?$|(?:^|_)(?:title|label|message|copy|text|headline|body|dek|eyebrow|prompt|evidence|email|domain|url|query|content|snippet)$/;

/** A code, enum, bucket, digest, or timestamp. Never a sentence. */
const SEMANTIC_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.:+-]{0,63}$/;
const HOSTNAME_LIKE = /\.[A-Za-z]{2,}$/;
const SUPPORT_REF = /^TMN-[A-Z0-9]{8,16}$/;

const MAX_PROPERTIES = 24;

function keepsValue(value: PostHogProperty): boolean {
  if (value === null) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (!SEMANTIC_VALUE.test(value)) return false;
  if (HOSTNAME_LIKE.test(value)) return false;
  return !SUPPORT_REF.test(value);
}

export function isPostHogSafeKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,39}$/.test(key) && !FORBIDDEN_KEY.test(key);
}

/**
 * Filters event properties down to what a third-party behavior sink may hold.
 * Rejected properties are dropped, never truncated or masked, so a partial
 * match cannot survive as a recognizable fragment.
 */
export function postHogSafeProperties(
  properties: Record<string, PostHogProperty> | undefined
): Record<string, PostHogProperty> {
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => isPostHogSafeKey(key))
      .filter(([, value]) => keepsValue(value))
      .slice(0, MAX_PROPERTIES)
  );
}

/** The complete payload for one capture call. Nothing else is ever added. */
export function postHogEventPayload(
  properties: Record<string, PostHogProperty> | undefined,
  meta: PostHogEventMeta
): Record<string, PostHogProperty> {
  const durationMs =
    typeof meta.durationMs === "number" && Number.isFinite(meta.durationMs)
      ? Math.min(300_000, Math.max(0, Math.round(meta.durationMs)))
      : undefined;
  return {
    ...postHogSafeProperties(properties),
    $insert_id: meta.insertId,
    ...(meta.category && SEMANTIC_VALUE.test(meta.category)
      ? { event_category: meta.category }
      : {}),
    ...(meta.outcome && SEMANTIC_VALUE.test(meta.outcome)
      ? { event_outcome: meta.outcome }
      : {}),
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {})
  };
}
