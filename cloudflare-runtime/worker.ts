import { SCHEDULES, cloudflareAdapterEnabled, dispatchScheduled } from "../src/lib/cloudflare-runtime/cloudflare-upload-adapter";
import type { RuntimeBindings } from "../src/lib/cloudflare-runtime/types";

/** Isolated entry: disabled is the only supported production state for this slice. */
export default {
  fetch(_request: Request, env: RuntimeBindings) { return cloudflareAdapterEnabled(env) ? new Response("Adapter wiring deferred", { status: 501 }) : new Response("Not found", { status: 404 }); },
  async scheduled(event: { cron: string }, _env: RuntimeBindings) {
    const job = SCHEDULES.find((candidate) => candidate.cron === event.cron);
    if (!job) return;
    await dispatchScheduled(job.name, Object.fromEntries(SCHEDULES.map((candidate) => [candidate.name, async () => {}])) as Record<(typeof SCHEDULES)[number]["name"], () => Promise<void>>);
  },
};
