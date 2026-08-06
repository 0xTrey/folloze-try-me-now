import { harvestBrand } from "../src/harvest-browser.mjs";
import { buildPublicPayload } from "../src/contract.mjs";
import { assertPublicUrl } from "../src/security.mjs";

const source = await assertPublicUrl(process.env.HARVESTER_SMOKE_URL ?? "https://example.com");
const domain = source.hostname.replace(/^www\./, "");
const controller = new AbortController();
const raw = await harvestBrand({ domain, sourceUrl: source.toString(), signal: controller.signal });
const payload = buildPublicPayload(raw, { domain, sourceUrl: source.toString(), requestId: "smoke", durationMs: 0 });
process.stdout.write(`${JSON.stringify({ readiness: payload.receipt.readiness, evidence: payload.designDna.evidence }, null, 2)}\n`);
