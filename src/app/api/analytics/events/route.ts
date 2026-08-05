import { after, NextRequest, NextResponse } from "next/server";

import {
  parseProductEventBatch,
  productAnalyticsStoreMode,
  recordProductEvents
} from "@/lib/product-analytics";
import { apiError, HttpError, logServerError, noStoreHeaders } from "@/lib/http";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";

function requireSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== request.nextUrl.origin) {
    throw new HttpError(403, "analytics_origin_forbidden", "Analytics origin is not allowed.");
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const events = parseProductEventBatch(await request.json());
    await Promise.all([
      enforceRateLimit(`product-events:client:${anonymousClientKey(request)}`, 360, 60),
      enforceRateLimit(`product-events:browser:${events[0].browserSessionId}`, 300, 60)
    ]);

    const persist = async () => {
      try {
        return await recordProductEvents(events);
      } catch (error) {
        logServerError(error, {
          route: "/api/analytics/events",
          method: "POST",
          operation: "record_product_events",
          code: "product_event_sink_unavailable"
        });
        return 0;
      }
    };

    let inserted = 0;
    let persistence: "stored" | "queued" | "console-only" = "console-only";
    if (productAnalyticsStoreMode === "memory-test") {
      inserted = await persist();
      persistence = "stored";
    } else if (productAnalyticsStoreMode === "neon-postgres") {
      after(persist);
      persistence = "queued";
    } else {
      after(persist);
    }

    return NextResponse.json(
      { accepted: events.length, inserted, persistence },
      { status: 202, headers: noStoreHeaders }
    );
  } catch (error) {
    return apiError(error, { route: "/api/analytics/events", method: "POST" });
  }
}
