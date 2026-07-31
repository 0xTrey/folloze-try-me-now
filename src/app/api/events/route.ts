import { NextResponse } from "next/server";

import {
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

    let persisted = false;
    try {
      persisted = await recordEngagementEvent(payload);
    } catch (error) {
      // Telemetry is intentionally best-effort and must never interrupt the experience.
      logServerError(error, {
        route: "/api/events",
        method: "POST",
        sessionId: payload.sessionId,
        operation: "record_engagement_event",
        code: "event_sink_unavailable"
      });
    }

    return withEventCors(NextResponse.json(
      { accepted: true, persisted },
      { status: 202, headers: noStoreHeaders }
    ));
  } catch (error) {
    return withEventCors(apiError(error, { route: "/api/events", method: "POST" }));
  }
}
