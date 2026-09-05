import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// Creates two synthetic records, checks isolation, then removes only those records.
// No credentials, existing records, or personally identifying values are printed.
async function verify() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_MAINTENANCE_URL || !process.env.EXPECTED_DATABASE_HOST) {
    throw new Error("configuration_missing");
  }
  const runtimeUrl = new URL(process.env.DATABASE_URL);
  const maintenanceUrl = new URL(process.env.DATABASE_MAINTENANCE_URL);
  assert.equal(runtimeUrl.hostname, process.env.EXPECTED_DATABASE_HOST);
  assert.equal(maintenanceUrl.hostname, runtimeUrl.hostname);
  assert.equal(maintenanceUrl.pathname, runtimeUrl.pathname);
  assert.notEqual(runtimeUrl.username, maintenanceUrl.username);
  const runtime = neon(runtimeUrl.toString());
  const maintenance = neon(maintenanceUrl.toString());
  const [role] = await runtime`SELECT rolsuper, rolbypassrls,
    pg_has_role(current_user, 'try_me_runtime', 'member') AS runtime_member,
    pg_has_role(current_user, 'try_me_maintenance', 'member') AS maintenance_member
    FROM pg_roles WHERE rolname = current_user`;
  assert.equal(role.rolsuper, false);
  assert.equal(role.rolbypassrls, false);
  assert.equal(role.runtime_member, true);
  assert.equal(role.maintenance_member, false);
  const [maintenanceRole] = await maintenance`SELECT rolsuper, rolbypassrls,
    pg_has_role(current_user, 'try_me_maintenance', 'member') AS maintenance_member
    FROM pg_roles WHERE rolname = current_user`;
  assert.equal(maintenanceRole.rolsuper, false);
  assert.equal(maintenanceRole.rolbypassrls, false);
  assert.equal(maintenanceRole.maintenance_member, true);
  const sessions = [`tmn_security_a_${randomUUID()}`, `tmn_security_b_${randomUUID()}`];
  const scoped = async (sessionId, query) => (await runtime.transaction([
    runtime`SELECT set_config('tmn.session_id', ${sessionId}, true)`, query
  ]))[1];
  const insert = (sessionId) => runtime`INSERT INTO try_me_leads (
    session_id, claim_attempt_id, claim_attempt_started_at, email, email_domain,
    company_domain, use_case, source_kind, experience_url, artifact_revision,
    artifact_digest, claim_status, publish_status, email_status, captured_at, updated_at
  ) VALUES (${sessionId}, ${randomUUID()}, now(), 'security-test@example.invalid',
    'example.invalid', 'example.invalid', 'campaign', 'none',
    'https://example.invalid/security-test', 0, ${"0".repeat(64)}, 'captured',
    'not-attempted', 'not-attempted', now(), now()) RETURNING session_id`;
  const denied = async (operation) => {
    try { await operation(); } catch (error) {
      assert.equal(error.code, "42501");
      return;
    }
    throw new Error("expected_permission_denial");
  };
  try {
    for (const id of sessions) assert.equal((await scoped(id, insert(id))).length, 1);
    for (const id of sessions) {
      const rows = await scoped(id, runtime`SELECT session_id FROM try_me_leads
        WHERE session_id = ANY(${sessions})`);
      assert.deepEqual(rows.map((row) => row.session_id), [id]);
    }
    assert.equal((await runtime`SELECT session_id FROM try_me_leads
      WHERE session_id = ANY(${sessions})`).length, 0);
    assert.equal((await scoped(sessions[0], runtime`UPDATE try_me_leads SET audience = 'cross-session-denied'
      WHERE session_id = ${sessions[1]} RETURNING session_id`)).length, 0);
    await denied(() => scoped(sessions[0], runtime`UPDATE try_me_leads SET session_id = ${sessions[0] + "_moved"}
      WHERE session_id = ${sessions[0]} RETURNING session_id`));
    await denied(() => scoped(sessions[0], insert(sessions[1] + "_denied")));
    await denied(() => scoped(sessions[0], runtime`DELETE FROM try_me_leads
      WHERE session_id = ${sessions[0]} RETURNING session_id`));
    assert.equal((await maintenance`SELECT session_id FROM try_me_leads
      WHERE session_id = ANY(${sessions})`).length, 2);
    process.stdout.write(JSON.stringify({ passed: true, permittedOwnRecords: 2,
      crossSessionReadDenied: true, unscopedReadDenied: true, crossSessionWriteDenied: true,
      scopeMutationDenied: true, crossSessionInsertDenied: true, runtimeDeleteDenied: true,
      maintenanceReadVerified: true }) + "\n");
  } finally {
    await maintenance`DELETE FROM try_me_leads WHERE session_id = ANY(${sessions})`;
    assert.equal((await maintenance`SELECT session_id FROM try_me_leads
      WHERE session_id = ANY(${sessions})`).length, 0);
    process.stdout.write("Synthetic security records removed and absence verified.\n");
  }
}

verify().catch((error) => {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{2,32}$/.test(error.code)
    ? error.code : "verification_failed";
  process.stderr.write(`Cross-session verification failed (${code}); no credentials or records were logged.\n`);
  process.exitCode = 1;
});
