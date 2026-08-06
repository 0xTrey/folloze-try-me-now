import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/server.mjs";

async function withServer(run) {
  const previous = process.env.HARVESTER_BEARER_TOKEN;
  process.env.HARVESTER_BEARER_TOKEN = "unit-test-token";
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.HARVESTER_BEARER_TOKEN;
    else process.env.HARVESTER_BEARER_TOKEN = previous;
  }
}

test("health exposes only readiness metadata", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/health`);
    const body = await response.json();
    assert.ok(new Set([200, 503]).has(response.status));
    assert.equal(body.tokenConfigured, true);
    assert.equal(body.contract, "brand-design-dna.v1");
    assert.equal(JSON.stringify(body).includes("unit-test-token"), false);
  });
});

test("harvest endpoint requires bearer authentication before reading input", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" })
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});
