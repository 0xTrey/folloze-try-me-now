import type { SessionEvent, TryMeSession } from "@/lib/types";

const privateKeyPattern = /(email|html|content|copy|token|secret|sourceurl|offeresourceurl)$/i;

function safeTelemetryText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(?:sk_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{12,})\b/g, "[redacted-secret]")
    .slice(0, 160);
}

function sanitize(meta: SessionEvent["meta"]): SessionEvent["meta"] {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => !privateKeyPattern.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? safeTelemetryText(value) : value])
  );
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
