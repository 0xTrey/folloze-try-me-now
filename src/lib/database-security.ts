import type { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

/** Scope and query travel in ONE transaction, never in pooled session state. */
export function sessionScopedSql(sql: Sql, sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{4,128}$/.test(sessionId)) throw new Error("Invalid database record scope.");
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const [, rows] = await sql.transaction([
      sql`SELECT set_config('tmn.session_id', ${sessionId}, true)`,
      sql(strings, ...values)
    ]);
    return Array.isArray(rows) ? rows : rows.rows;
  };
}
