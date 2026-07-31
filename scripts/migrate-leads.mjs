import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to migrate the Try Me Now lead ledger.");
}

const sql = neon(process.env.DATABASE_URL);
const migrationsUrl = new URL("../db/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationsUrl))
  .filter((file) => /^\d+.*\.sql$/.test(file))
  .sort();

await sql`
  CREATE TABLE IF NOT EXISTS try_me_schema_migrations (
    filename text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const appliedRows = await sql`
  SELECT filename, checksum
  FROM try_me_schema_migrations
`;
const applied = new Map(appliedRows.map((row) => [row.filename, row.checksum]));

for (const file of migrationFiles) {
  const migration = await readFile(new URL(file, migrationsUrl), "utf8");
  const checksum = createHash("sha256").update(migration).digest("hex");
  const priorChecksum = applied.get(file);
  if (priorChecksum) {
    if (priorChecksum !== checksum) {
      throw new Error(`Applied migration ${file} no longer matches its recorded checksum.`);
    }
    continue;
  }
  const statements = migration
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  await sql.transaction((transaction) => [
    ...statements.map((statement) => transaction.query(statement)),
    transaction`
      INSERT INTO try_me_schema_migrations (filename, checksum)
      VALUES (${file}, ${checksum})
    `
  ]);
}

process.stdout.write("Try Me Now lead ledger is ready.\n");
