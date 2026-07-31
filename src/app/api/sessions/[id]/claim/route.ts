import { NextRequest, NextResponse } from "next/server";

import { apiError, HttpError, noStoreHeaders } from "@/lib/http";
import { canEditSession, claimSession } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { assertBusinessEmail, claimSchema } from "@/lib/validation";

import { readEditorToken } from "../../editor-cookie";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await enforceRateLimit(`claim:${anonymousClientKey(request)}`, 5, 3600);
    if (!(await canEditSession(id, readEditorToken(request, id)))) {
      throw new HttpError(403, "editor_forbidden", "This editor session is no longer active.");
    }
    const { email: submittedEmail } = claimSchema.parse(await request.json());
    const email = assertBusinessEmail(submittedEmail);
    const result = await claimSession(id, email);
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error, {
      route: "/api/sessions/[id]/claim",
      method: "POST",
      sessionId: (await context.params).id,
      operation: "claim_session"
    });
  }
}
