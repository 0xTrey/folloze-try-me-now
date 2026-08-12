import { access, readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./wrangler.preview.jsonc", import.meta.url), "utf8"));
const receipt = JSON.parse(await readFile(new URL("./preview-resources.json", import.meta.url), "utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(config.vars?.ADAPTER_ENABLED === "disabled", "preview adapter must remain disabled");
assert(config.workers_dev === false && config.preview_urls === false, "preview Worker must not expose an automatic URL");
assert(config.routes === undefined && config.triggers === undefined, "routes and cron triggers are not permitted");
assert(config.queues?.consumers === undefined, "queue consumer is deferred until a handler exists");
assert(receipt.source === "root operator Cloudflare API verification", "receipt source must identify the root operator verification");
assert(receipt.live_verification_performed === true && receipt.observed_at === "2026-08-12T15:32:00Z", "receipt must timestamp the live verification");
assert(receipt.verification_writes_performed === false, "verification must remain read-only");
assert(config.d1_databases?.length === 1 && config.d1_databases[0].migrations_dir === "d1/migrations", "dedicated D1 migration path is required");
assert(config.d1_databases[0].migrations_table === "cf_upload_adapter_migrations", "dedicated D1 journal table is required");
assert(config.d1_databases[0].binding === receipt.resources.d1.binding && config.d1_databases[0].database_name === receipt.resources.d1.name && config.d1_databases[0].database_id === receipt.resources.d1.id, "D1 receipt/config mismatch");
assert(receipt.resources.d1.exists === true && receipt.resources.d1.num_tables === 0, "verified D1 table metadata is required");
assert(receipt.resources.d1.file_size_bytes === 12288 && receipt.resources.d1.file_size_note.includes("not a claim"), "D1 platform file-size metadata must not be represented as empty bytes");
assert(config.r2_buckets?.[0]?.binding === receipt.resources.r2.binding && config.r2_buckets[0].bucket_name === receipt.resources.r2.name, "R2 receipt/config mismatch");
assert(receipt.resources.r2.exists === true && receipt.resources.r2.location === "WNAM" && receipt.resources.r2.storage_class === "Standard", "verified R2 metadata is required");
assert(receipt.resources.r2.object_count_queried === false && !("object_count" in receipt.resources.r2), "unqueried R2 object count must not be claimed");
assert(config.queues?.producers?.[0]?.binding === receipt.resources.queue.binding && config.queues.producers[0].queue === receipt.resources.queue.name, "Queue receipt/config mismatch");
assert(receipt.resources.queue.id === "09ced95b4e8f4966909e5a56ae06f6f6" && receipt.resources.queue.producers === 0 && receipt.resources.queue.consumers === 0, "verified main Queue metadata is required");
assert(receipt.resources.dead_letter_queue.id === "5f23c07419764acab5963ad02145d491" && receipt.resources.dead_letter_queue.producers === 0 && receipt.resources.dead_letter_queue.consumers === 0, "verified DLQ metadata is required");
assert(receipt.resources.dead_letter_queue.binding === null, "DLQ must remain unbound in config");
for (const resource of Object.values(receipt.resources)) assert(resource.name.endsWith("-preview"), `non-preview resource name: ${resource.name}`);
await access(new URL("./d1/migrations/0001_create_cf_upload_adapter.sql", import.meta.url));
process.stdout.write("preview config validated: disabled fetch-only Worker; verified resource receipt; no routes, crons, or consumer\n");
