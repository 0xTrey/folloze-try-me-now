import { randomUUID } from "node:crypto";

import { sanitizeObservabilityText } from "@/lib/observability";
import type { SessionEvent, TryMeSession } from "@/lib/types";

const privateSessionEventKey =
  /(email|html|content|copy|token|secret|sourceurl|offeresourceurl|prompt|response|filename|filepath)$/i;

function sanitizeSessionEventMeta(meta: SessionEvent["meta"]): SessionEvent["meta"] {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => !privateSessionEventKey.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeObservabilityText(value, 160) : value
      ])
  );
}

export function appendEvent(
  session: TryMeSession,
  name: string,
  meta?: SessionEvent["meta"]
): TryMeSession {
  const event = {
    id: randomUUID(),
    name,
    at: new Date().toISOString(),
    meta: sanitizeSessionEventMeta(meta)
  };
  session.events = [...session.events.slice(-79), event];
  return session;
}
