import { after, NextRequest, NextResponse } from "next/server";

import { apiError, HttpError, noStoreHeaders, startServerOperation } from "@/lib/http";
import { verifyBotToken } from "@/lib/bot-protection";
import { createSession, runPreviewEnrichmentWave } from "@/lib/orchestrator";
import { analyticsIdentityWithAttributionFromRequest } from "@/lib/product-analytics";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/validation";

import { setEditorTokenCookie } from "./editor-cookie";
import { readJsonBody, requireSameOriginJson } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const trace = startServerOperation({
    route: "/api/sessions",
    method: "POST",
    operation: "create_session",
    stage: "submission"
  });
  try {
    requireSameOriginJson(request);
    await enforceRateLimit(`create:${anonymousClientKey(request)}`, 5, 60);
    const { botToken, ...input } = createSessionSchema.parse(await readJsonBody(request));
    const botCheck = await verifyBotToken(botToken, "session_create");
    if (botCheck.status !== "disabled" && botCheck.status !== "verified") {
      throw new HttpError(botCheck.status === "misconfigured" ? 503 : 403,
        "bot_check_failed", "The security check could not be completed. Please try again.");
    }
    const created = await createSession({
      ...input,
      analytics: analyticsIdentityWithAttributionFromRequest(request)
    });
    trace.setSessionId(created.session.id);
    trace.setTraceId(created.traceId);
    after(() => runPreviewEnrichmentWave(created.session.id, { includeStory: false }));
    const response = NextResponse.json(
      { session: created.session },
      {
        status: 201,
        headers: {
          ...noStoreHeaders,
          ...trace.complete(201, { useCase: input.useCase })
        }
      }
    );
    setEditorTokenCookie(request, response, created.session.id, created.editorToken);
    return response;
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}
