import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() : undefined;
};
const sessionId = valueFor("--session-id");
const visitorId = valueFor("--visitor-id");
const email = valueFor("--email")?.toLowerCase();
const supplied = [sessionId, visitorId, email].filter(Boolean);

if (args.includes("--help") || supplied.length !== 1) {
  process.stdout.write(
    "Usage: npm run analytics:inspect -- --session-id <experience-session-id>\n" +
      "   or: npm run analytics:inspect -- --visitor-id tmv_<id>\n" +
      "   or: npm run analytics:inspect -- --email buyer@company.com\n"
  );
  process.exit(args.includes("--help") ? 0 : 1);
}
if (sessionId && !/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) throw new Error("Invalid session ID.");
if (visitorId && !/^tmv_[A-Za-z0-9_-]{16,128}$/.test(visitorId)) throw new Error("Invalid visitor ID.");
if (email && (!email.includes("@") || email.length > 320)) throw new Error("Invalid email.");
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for operator analytics inspection.");
}

const sql = neon(process.env.DATABASE_URL);
const sessions = sessionId
  ? await sql`SELECT * FROM try_me_product_sessions WHERE session_id = ${sessionId} LIMIT 20`
  : visitorId
    ? await sql`
        SELECT * FROM try_me_product_sessions
        WHERE visitor_id = ${visitorId}
        ORDER BY last_activity_at DESC LIMIT 20
      `
    : await sql`
        SELECT * FROM try_me_product_sessions
        WHERE lower(business_email) = ${email}
        ORDER BY last_activity_at DESC LIMIT 20
      `;

const sessionIds = sessions.map((row) => String(row.session_id));
const visitorIds = [...new Set(sessions.map((row) => row.visitor_id ? String(row.visitor_id) : undefined).filter(Boolean))];
if (visitorId && !visitorIds.includes(visitorId)) visitorIds.push(visitorId);

const productEvents = sessionIds.length || visitorIds.length
  ? await sql`
      SELECT event_id, visitor_id, browser_session_id, session_id, event_name,
             category, source, path, outcome, duration_ms, properties, created_at
      FROM try_me_product_events
      WHERE session_id = ANY(${sessionIds}) OR visitor_id = ANY(${visitorIds})
      ORDER BY created_at ASC
      LIMIT 1000
    `
  : [];
const experienceEvents = sessionIds.length
  ? await sql`
      SELECT event_id, session_id, event_name, context, created_at
      FROM try_me_events
      WHERE session_id = ANY(${sessionIds})
      ORDER BY created_at ASC
      LIMIT 1000
    `
  : [];
const traceIds = [...new Set(sessions.map((row) => row.trace_id ? String(row.trace_id) : undefined).filter(Boolean))];
const traceEvents = traceIds.length
  ? await sql`
      SELECT trace_id, support_ref, event_name, stage, outcome, request_id,
             span_id, duration_ms, metadata, created_at
      FROM try_me_traces
      WHERE trace_id = ANY(${traceIds}) AND expires_at > now()
      ORDER BY created_at ASC
      LIMIT 1000
    `
  : [];

const timeline = [
  ...productEvents.map((row) => ({
    at: new Date(String(row.created_at)).toISOString(), stream: "product",
    event: String(row.event_name), sessionId: row.session_id ? String(row.session_id) : undefined,
    category: String(row.category), outcome: row.outcome ? String(row.outcome) : undefined,
    durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms), details: row.properties
  })),
  ...experienceEvents.map((row) => ({
    at: new Date(String(row.created_at)).toISOString(), stream: "experience",
    event: String(row.event_name), sessionId: String(row.session_id), details: row.context
  })),
  ...traceEvents.map((row) => ({
    at: new Date(String(row.created_at)).toISOString(), stream: "operations",
    event: String(row.event_name), supportRef: String(row.support_ref), stage: String(row.stage),
    outcome: String(row.outcome), requestId: row.request_id ? String(row.request_id) : undefined,
    durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms), details: row.metadata
  }))
].sort((left, right) => left.at.localeCompare(right.at));

process.stdout.write(`${JSON.stringify({
  locator: sessionId ? { sessionId } : visitorId ? { visitorId } : { email },
  sessions,
  counts: { sessions: sessions.length, productEvents: productEvents.length,
    experienceEvents: experienceEvents.length, operationalEvents: traceEvents.length },
  timeline
}, null, 2)}\n`);
