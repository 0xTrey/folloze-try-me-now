import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the claim-ledger verification.");
}

const baseUrl = new URL(process.env.TRY_ME_QA_BASE_URL ?? "http://127.0.0.1:3011");
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(baseUrl.hostname)) {
  throw new Error("The claim-ledger verification is restricted to a local app server.");
}

const sql = neon(process.env.DATABASE_URL);
let sessionId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Local QA request failed (${response.status}): ${body.code ?? body.error ?? "unknown"}`);
  }
  return { response, body };
}

async function pollSession(cookie, predicate, label) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const { body } = await request(`/api/sessions/${sessionId}`, {
      headers: { Cookie: cookie }
    });
    if (predicate(body.session)) return body.session;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

try {
  const created = await request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useCase: "abm", companyDomain: "jitterbit.com" })
  });
  sessionId = created.body.session.id;
  const cookie = created.response.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, "The local app did not issue an editor cookie.");

  await pollSession(
    cookie,
    (session) => session.brand && session.audienceSuggestions.length > 0,
    "brand and company-specific audiences"
  );

  const patch = async (value) =>
    request(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(value)
    });

  await patch({ targetDomain: "cisco.com" });
  const withAudience = await pollSession(
    cookie,
    (session) => session.targetBrand && session.audienceSuggestions.length > 0,
    "target brand"
  );
  const audience = withAudience.audienceSuggestions[0];
  assert(/integration|architect|automation|application|workflow/i.test(audience), "The audience was not specific to Jitterbit.");
  await patch({ audience });
  await patch({ objective: "Educate the buying group" });
  const ready = await pollSession(
    cookie,
    (session) => session.status === "preview_ready_unclaimed" && session.experience?.ready,
    "the private generated preview"
  );
  assert(ready.targetBrand?.companyName.toLowerCase().includes("cisco"), "The target brand was not preserved.");

  const beforeClaim = await sql`
    SELECT count(*)::int AS count
    FROM try_me_leads
    WHERE session_id = ${sessionId}
  `;
  assert(beforeClaim[0]?.count === 0, "A lead row was written before business-email claim.");

  const claimed = await request(`/api/sessions/${sessionId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ email: "qa-ledger@acme.test" })
  });
  assert(claimed.body.session.status === "claimed", "The local claim did not complete.");

  const rows = await sql`
    SELECT company_domain, target_domain, use_case, audience, objective,
           claim_status, publish_status, email_status, consent_scope,
           artifact_revision, artifact_digest
    FROM try_me_leads
    WHERE session_id = ${sessionId}
  `;
  const lead = rows[0];
  assert(lead, "The business-email claim did not create a durable lead row.");
  assert(lead.company_domain === "jitterbit.com", "The seller domain was not recorded.");
  assert(lead.target_domain === "cisco.com", "The target domain was not recorded.");
  assert(lead.use_case === "abm", "The use case was not recorded.");
  assert(lead.audience === audience, "The selected audience was not recorded.");
  assert(lead.objective === "Educate the buying group", "The objective was not recorded.");
  assert(lead.claim_status === "claimed", "The terminal claim outcome was not recorded.");
  assert(lead.publish_status === "preview-only", "Fixture publication should remain preview-only.");
  assert(lead.email_status === "skipped", "Fixture email should remain skipped.");
  assert(
    lead.consent_scope === "transactional_experience_delivery",
    "The transactional consent scope was not recorded."
  );
  assert(Number.isInteger(lead.artifact_revision), "The artifact revision was not recorded.");
  assert(/^[a-f0-9]{64}$/.test(lead.artifact_digest), "The artifact digest was not recorded.");

  process.stdout.write(
    JSON.stringify({
      ok: true,
      preClaimRows: beforeClaim[0].count,
      postClaimRows: rows.length,
      sellerDomain: lead.company_domain,
      targetDomain: lead.target_domain,
      useCase: lead.use_case,
      claimStatus: lead.claim_status,
      publishStatus: lead.publish_status,
      emailStatus: lead.email_status
    }) + "\n"
  );
} finally {
  if (sessionId) {
    await sql`DELETE FROM try_me_leads WHERE session_id = ${sessionId}`;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(`try-me/sessions/${sessionId}.json`);
    }
  }
}
