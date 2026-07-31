import { after, NextResponse } from "next/server";

import {
  engagementEventStoreMode,
  parseEngagementEventPayload,
  recordEngagementEvent
} from "@/lib/engagement-events";
import { apiError, logServerError, noStoreHeaders } from "@/lib/http";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function withEventCors(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(corsHeaders)) response.headers.set(name, value);
  return response;
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...noStoreHeaders, ...corsHeaders }
  });
}

export async function POST(request: Request) {
  try {
    const payload = parseEngagementEventPayload(await request.json());
    await Promise.all([
      enforceRateLimit(`events:client:${anonymousClientKey(request)}`, 240, 60),
      enforceRateLimit(`events:session:${payload.sessionId}`, 180, 60)
    ]);

    const persist = async () => {
      try {
        return await recordEngagementEvent(payload);
      } catch (error) {
        // Telemetry is intentionally best-effort and must never interrupt the experience.
        logServerError(error, {
          route: "/api/events",
          method: "POST",
          sessionId: payload.sessionId,
          operation: "record_engagement_event",
          code: "event_sink_unavailable"
        });
        return false;
      }
    };

    let persisted = false;
    let persistence: "stored" | "duplicate" | "queued" | "disabled" = "disabled";
    if (engagementEventStoreMode === "memory-test") {
      persisted = await persist();
      persistence = persisted ? "stored" : "duplicate";
    } else if (engagementEventStoreMode === "neon-postgres") {
      // The generated experience uses keepalive telemetry. Schedule the durable
      // write after the 202 response so analytics can never delay the prospect.
      after(persist);
      persistence = "queued";
    }

    return withEventCors(NextResponse.json(
      { accepted: true, persisted, persistence },
      { status: 202, headers: noStoreHeaders }
    ));
  } catch (error) {
    return withEventCors(apiError(error, { route: "/api/events", method: "POST" }));
  }
}
