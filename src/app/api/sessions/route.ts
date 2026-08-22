import { after, NextRequest, NextResponse } from "next/server";

import { apiError, noStoreHeaders, startServerOperation } from "@/lib/http";
import { createSession, runPreviewEnrichmentWave } from "@/lib/orchestrator";
import { analyticsIdentityWithAttributionFromRequest } from "@/lib/product-analytics";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/validation";

import { setEditorTokenCookie } from "./editor-cookie";

export async function POST(request: NextRequest) {
  const trace = startServerOperation({
    route: "/api/sessions",
    method: "POST",
    operation: "create_session",
    stage: "submission"
  });
  try {
    await enforceRateLimit(`create:${anonymousClientKey(request)}`, 5, 60);
    const input = createSessionSchema.parse(await request.json());
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
