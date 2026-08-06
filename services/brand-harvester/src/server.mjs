import crypto from "node:crypto";
import http from "node:http";
import { buildPublicPayload } from "./contract.mjs";
import { browserReadiness, harvestBrand } from "./harvest-browser.mjs";
import { assertPublicUrl } from "./security.mjs";

const MAX_BODY_BYTES = 8_192;
const maxConcurrency = Math.min(4, Math.max(1, Number(process.env.HARVEST_MAX_CONCURRENCY ?? 1)));
let inFlight = 0;

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function authorized(request) {
  const expected = process.env.HARVESTER_BEARER_TOKEN ?? process.env.BRAND_HARVESTER_TOKEN;
  if (!expected) return false;
  const received = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

function normalizeDomain(value) {
  if (typeof value !== "string") throw new Error("invalid_domain");
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").replace(/\.$/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("invalid_domain");
  return domain;
}

function requestErrorCode(error) {
  const code = error instanceof Error ? error.message : "harvest_failed";
  return /^[a-z0-9_]{3,80}$/.test(code) ? code : "harvest_failed";
}

export function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const browser = browserReadiness();
      const tokenConfigured = Boolean(process.env.HARVESTER_BEARER_TOKEN ?? process.env.BRAND_HARVESTER_TOKEN);
      return json(response, browser.available && tokenConfigured ? 200 : 503, {
        status: browser.available && tokenConfigured ? "ready" : "not_ready",
        browserAvailable: browser.available,
        tokenConfigured,
        inFlight,
        maxConcurrency,
        contract: "brand-design-dna.v1"
      });
    }
    if (request.method !== "POST" || request.url !== "/harvest") return json(response, 404, { error: "not_found" });
    if (!authorized(request)) return json(response, 401, { error: "unauthorized" });
    if (inFlight >= maxConcurrency) return json(response, 429, { error: "harvester_busy", retryAfterSeconds: 4 });

    const requestId = crypto.randomUUID();
    const started = Date.now();
    inFlight += 1;
    try {
      const body = await readBody(request);
      const domain = normalizeDomain(body.domain);
      const sourceCandidate = typeof body.sourceUrl === "string" ? body.sourceUrl : `https://${domain}`;
      const sourceUrl = await assertPublicUrl(sourceCandidate);
      const sourceHost = sourceUrl.hostname.toLowerCase().replace(/^www\./, "");
      if (sourceHost !== domain && !sourceHost.endsWith(`.${domain}`)) throw new Error("domain_source_mismatch");
      if (body.capture && !new Set(["progressive", "full"]).has(body.capture)) throw new Error("unsupported_capture_mode");

      const timeoutMs = Math.min(90_000, Math.max(20_000, Number(process.env.HARVEST_TIMEOUT_MS ?? 55_000)));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("harvest_timeout")), timeoutMs);
      try {
        const raw = await harvestBrand({ domain, sourceUrl: sourceUrl.toString(), signal: controller.signal });
        const result = buildPublicPayload(raw, {
          domain,
          sourceUrl: sourceUrl.toString(),
          requestId,
          durationMs: Date.now() - started
        });
        process.stdout.write(`${JSON.stringify({ event: "brand_harvest_complete", requestId, durationMs: Date.now() - started, readiness: result.receipt.readiness.score })}\n`);
        return json(response, 200, result);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const code = requestErrorCode(error);
      const status = code.startsWith("invalid_") || code.startsWith("source_url_") || code === "domain_source_mismatch" || code === "unsupported_capture_mode" ? 400 : 502;
      process.stderr.write(`${JSON.stringify({ event: "brand_harvest_failed", requestId, code, durationMs: Date.now() - started })}\n`);
      return json(response, status, { error: code, requestId });
    } finally {
      inFlight -= 1;
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT ?? 8080);
  const server = createServer();
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`${JSON.stringify({ event: "brand_harvester_started", port, maxConcurrency })}\n`);
  });
}
