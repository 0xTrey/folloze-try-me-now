import { neon } from "@neondatabase/serverless";

import { csvCell } from "./csv-cell.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to export Try Me Now leads.");
}

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const requestedLimit = Number.parseInt(limitArgument?.split("=", 2)[1] ?? "500", 10);
if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
  throw new Error("--limit must be a positive integer.");
}
const limit = Math.min(requestedLimit, 10_000);
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT
    session_id,
    email,
    email_domain,
    company_domain,
    target_domain,
    use_case,
    audience,
    objective,
    campaign_type,
    source_kind,
    experience_url,
    claim_status,
    publish_status,
    email_status,
    consent_scope,
    captured_at,
    claimed_at,
    updated_at
  FROM try_me_leads
  ORDER BY captured_at DESC
  LIMIT ${limit}
`;

const columns = [
  "session_id",
  "email",
  "email_domain",
  "company_domain",
  "target_domain",
  "use_case",
  "audience",
  "objective",
  "campaign_type",
  "source_kind",
  "experience_url",
  "claim_status",
  "publish_status",
  "email_status",
  "consent_scope",
  "captured_at",
  "claimed_at",
  "updated_at"
];

process.stdout.write(`${columns.join(",")}\n`);
for (const row of rows) {
  process.stdout.write(`${columns.map((column) => csvCell(row[column])).join(",")}\n`);
}
