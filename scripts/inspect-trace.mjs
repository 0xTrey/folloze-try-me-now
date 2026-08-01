import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const supportRef = valueFor("--support-ref")?.trim().toUpperCase();
const traceId = valueFor("--trace-id")?.trim();

if (args.includes("--help") || (!supportRef && !traceId)) {
  process.stdout.write(
    "Usage: npm run trace:inspect -- --support-ref TMN-XXXXXXXXXXXX\n" +
      "   or: npm run trace:inspect -- --trace-id <server-trace-id>\n"
  );
  process.exit(args.includes("--help") ? 0 : 1);
}
if (supportRef && traceId) {
  throw new Error("Choose either --support-ref or --trace-id, not both.");
}
if (supportRef && !/^TMN-[A-Z0-9]{8,16}$/.test(supportRef)) {
  throw new Error("The support reference format is invalid.");
}
if (traceId && !/^[A-Za-z0-9_-]{8,128}$/.test(traceId)) {
  throw new Error("The trace ID format is invalid.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for operator trace inspection.");
}

const sql = neon(process.env.DATABASE_URL);
const rows = supportRef
  ? await sql`
      SELECT * FROM (
        SELECT support_ref, event_name, stage, outcome, request_id, span_id,
               duration_ms, metadata, created_at
        FROM try_me_traces
        WHERE support_ref = ${supportRef} AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 200
      ) AS recent_events
      ORDER BY created_at ASC
    `
  : await sql`
      SELECT * FROM (
        SELECT support_ref, event_name, stage, outcome, request_id, span_id,
               duration_ms, metadata, created_at
        FROM try_me_traces
        WHERE trace_id = ${traceId} AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 200
      ) AS recent_events
      ORDER BY created_at ASC
    `;

const timeline = rows.map((row, index) => ({
  sequence: index + 1,
  at: new Date(String(row.created_at)).toISOString(),
  event: String(row.event_name),
  stage: String(row.stage),
  outcome: String(row.outcome),
  requestId: row.request_id ? String(row.request_id) : undefined,
  spanId: row.span_id ? String(row.span_id) : undefined,
  durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
  meta: row.metadata && typeof row.metadata === "object" ? row.metadata : undefined
}));

process.stdout.write(
  `${JSON.stringify(
    {
      supportRef: rows[0]?.support_ref ?? supportRef ?? "not-found",
      eventCount: timeline.length,
      timeline
    },
    null,
    2
  )}\n`
);
