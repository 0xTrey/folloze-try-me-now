import { neon } from "@neondatabase/serverless";

// Metadata-only audit. Does not create roles, apply migrations, or read leads.
if (!process.env.DATABASE_URL) {
  process.stdout.write("Database security not verified: DATABASE_URL is not available to this process.\n");
  process.exitCode = 2;
} else {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [role] = await sql`SELECT rolsuper, rolbypassrls,
      (SELECT pg_has_role(current_user, oid, 'member') FROM pg_roles WHERE rolname = 'try_me_runtime') AS runtime_member,
      (SELECT pg_has_role(current_user, oid, 'member') FROM pg_roles WHERE rolname = 'try_me_maintenance') AS maintenance_member
      FROM pg_roles WHERE rolname = current_user`;
    const tables = await sql`SELECT c.relname AS name, c.relrowsecurity AS rls,
      c.relforcerowsecurity AS forced, pg_get_userbyid(c.relowner) = current_user AS owned_by_runtime
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('try_me_leads', 'try_me_events', 'try_me_rate_limits',
        'try_me_traces', 'try_me_build_traces', 'try_me_visitors', 'try_me_browser_sessions',
        'try_me_product_sessions', 'try_me_product_events') ORDER BY c.relname`;
    const policies = await sql`SELECT policyname, qual, with_check FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'try_me_leads'`;
    const scoped = policies.find((policy) => policy.policyname === 'try_me_lead_scope');
    const passed = Boolean(role && !role.rolsuper && !role.rolbypassrls && role.runtime_member &&
      !role.maintenance_member && tables.length === 9 && tables.every((table) => table.rls && table.forced && !table.owned_by_runtime) &&
      scoped?.qual?.includes('tmn.session_id') && scoped?.with_check?.includes('tmn.session_id'));
    process.stdout.write(JSON.stringify({ scope: "runtime-role-and-policy-metadata-only", passed,
      role: role ? { superuser: role.rolsuper, bypassRls: role.rolbypassrls, runtimeMember: role.runtime_member, maintenanceMember: role.maintenance_member } : null,
      tables, leadScopePolicyPresent: Boolean(scoped), liveCrossSessionBehavior: "not tested" }, null, 2) + "\n");
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{2,32}$/.test(error.code) ? error.code : "unavailable";
    process.stdout.write(`Database security audit failed (${code}). Check connection access and migration state; credentials were not logged.\n`);
    process.exitCode = 1;
  }
}
