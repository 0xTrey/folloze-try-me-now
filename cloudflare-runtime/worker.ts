import { cloudflareAdapterEnabled } from "../src/lib/cloudflare-runtime/cloudflare-upload-adapter";
import type { RuntimeBindings } from "../src/lib/cloudflare-runtime/types";

/** Isolated entry: disabled is the only supported production state for this slice. */
const worker = {
  fetch(_request: Request, env: RuntimeBindings) { return cloudflareAdapterEnabled(env) ? new Response("Adapter wiring deferred", { status: 501 }) : new Response("Not found", { status: 404 }); },
};

export default worker;
