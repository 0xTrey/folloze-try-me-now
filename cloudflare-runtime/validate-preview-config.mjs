import { access, readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./wrangler.preview.jsonc", import.meta.url), "utf8"));
const receipt = JSON.parse(await readFile(new URL("./preview-resources.json", import.meta.url), "utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(config.vars?.ADAPTER_ENABLED === "disabled", "preview adapter must remain disabled");
assert(config.workers_dev === false && config.preview_urls === false, "preview Worker must not expose an automatic URL");
assert(config.routes === undefined && config.triggers === undefined, "routes and cron triggers are not permitted");
assert(config.queues?.consumers === undefined, "queue consumer is deferred until a handler exists");
assert(config.d1_databases?.length === 1 && config.d1_databases[0].migrations_dir === "d1/migrations", "dedicated D1 migration path is required");
assert(config.d1_databases[0].migrations_table === "cf_upload_adapter_migrations", "dedicated D1 journal table is required");
assert(config.d1_databases[0].database_id === receipt.resources.d1.id, "D1 receipt/config mismatch");
assert(config.r2_buckets?.[0]?.bucket_name === receipt.resources.r2.name, "R2 receipt/config mismatch");
assert(config.queues?.producers?.[0]?.queue === receipt.resources.queue.name, "Queue receipt/config mismatch");
assert(receipt.resources.dead_letter_queue.binding === null, "DLQ must remain unbound");
for (const resource of Object.values(receipt.resources)) assert(resource.name.endsWith("-preview"), `non-preview resource name: ${resource.name}`);
await access(new URL("./d1/migrations/0001_create_cf_upload_adapter.sql", import.meta.url));
process.stdout.write("preview config validated: disabled fetch-only Worker; D1/R2/producer bindings; no routes, crons, or consumer\n");
