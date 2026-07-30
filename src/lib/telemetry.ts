import type { SessionEvent, TryMeSession } from "@/lib/types";

const privateKeys = new Set(["email", "html", "sourceContent", "generatedCopy"]);

function sanitize(meta: SessionEvent["meta"]): SessionEvent["meta"] {
  if (!meta) return undefined;
  return Object.fromEntries(Object.entries(meta).filter(([key]) => !privateKeys.has(key)));
}

export function appendEvent(
  session: TryMeSession,
  name: string,
  meta?: SessionEvent["meta"]
): TryMeSession {
  const event = { name, at: new Date().toISOString(), meta: sanitize(meta) };
  session.events = [...session.events.slice(-79), event];
  console.info(JSON.stringify({ type: "try_me_event", sessionId: session.id, ...event }));
  return session;
}
