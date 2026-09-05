import { describe, expect, it, vi } from "vitest";
import type { neon } from "@neondatabase/serverless";
import { sessionScopedSql } from "@/lib/database-security";

describe("database record scope", () => {
  it("sets transaction-local scope in the same request as a parameterized query", async () => {
    const query = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values }));
    const transaction = vi.fn(async (queries: unknown[]) => [queries[0], [{ session_id: "session-a" }]]);
    const sql = Object.assign(query, { transaction }) as unknown as ReturnType<typeof neon>;
    const scoped = sessionScopedSql(sql, "session-a");
    const untrusted = "' OR 1=1 --";
    const result = await scoped`SELECT session_id FROM try_me_leads WHERE email = ${untrusted}`;
    expect(result).toEqual([{ session_id: "session-a" }]);
    expect(transaction).toHaveBeenCalledOnce();
    expect(query.mock.results[0]?.value).toEqual({ text: "SELECT set_config('tmn.session_id', ?, true)", values: ["session-a"] });
    expect(query.mock.results[1]?.value.text).not.toContain(untrusted);
    expect(query.mock.results[1]?.value.values).toEqual([untrusted]);
  });
  it("rejects an invalid record identity before any database call", () => {
    expect(() => sessionScopedSql(vi.fn() as unknown as ReturnType<typeof neon>, "' OR 1=1 --")).toThrow();
  });
});
