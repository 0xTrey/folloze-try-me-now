import { NextRequest, NextResponse } from "next/server";

import {
  apiError,
  HttpError,
  noStoreHeaders,
  startServerOperation
} from "@/lib/http";
import { canEditSession, claimSession } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { assertBusinessEmail, claimSchema } from "@/lib/validation";

import { readEditorToken } from "../../editor-cookie";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const trace = startServerOperation({
    route: "/api/sessions/[id]/claim",
    method: "POST",
    sessionId: id,
    operation: "claim_session",
    stage: "claim"
  });
  try {
    await enforceRateLimit(`claim:${anonymousClientKey(request)}`, 5, 3600);
    if (!(await canEditSession(id, readEditorToken(request, id)))) {
      throw new HttpError(403, "editor_forbidden", "This editor session is no longer active.");
    }
    const { email: submittedEmail } = claimSchema.parse(await request.json());
    const email = assertBusinessEmail(submittedEmail);
    const { traceId, ...result } = await claimSession(id, email);
    trace.setTraceId(traceId);
    return NextResponse.json(result, {
      headers: { ...noStoreHeaders, ...trace.complete(200, { publishMode: result.publishMode }) }
    });
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}
