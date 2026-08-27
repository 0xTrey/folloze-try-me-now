import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const supportRef = valueFor("--support-ref")?.trim().toUpperCase();
const traceId = valueFor("--trace-id")?.trim();
const asJson = args.includes("--json");

if (args.includes("--help") || (!supportRef && !traceId)) {
  process.stdout.write(
    "Usage: npm run build-trace:inspect -- --support-ref TMN-XXXXXXXXXXXX\n" +
      "   or: npm run build-trace:inspect -- --trace-id <server-trace-id>\n" +
      "Options: --json  print the raw retained trace instead of a timeline\n"
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
  throw new Error("DATABASE_URL is required for operator build-trace inspection.");
}

const { renderBuildTraceReport } = await import("./lib/build-trace-timeline.mjs");

const sql = neon(process.env.DATABASE_URL);
const rows = supportRef
  ? await sql`
      SELECT trace FROM try_me_build_traces
      WHERE support_ref = ${supportRef} AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 20
    `
  : await sql`
      SELECT trace FROM try_me_build_traces
      WHERE trace_id = ${traceId} AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 20
    `;

const traces = rows
  .map((row) => (typeof row.trace === "string" ? JSON.parse(row.trace) : row.trace))
  .filter((trace) => trace && typeof trace === "object");

if (asJson) {
  process.stdout.write(`${JSON.stringify(traces, null, 2)}\n`);
} else {
  process.stdout.write(`${renderBuildTraceReport(supportRef ?? traceId, traces)}\n`);
}
