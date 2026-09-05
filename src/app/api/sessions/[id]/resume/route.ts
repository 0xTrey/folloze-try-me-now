import { NextRequest, NextResponse } from "next/server";
import { canEditSession } from "@/lib/orchestrator";
import { getPersonalizationRequest, toPublicPersonalizationRequest } from "@/lib/personalization-request-store";
import { getSession, toPublicSession } from "@/lib/session-store";
import { apiError, HttpError, noStoreHeaders } from "@/lib/http";
import { readEditorToken } from "../../editor-cookie";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const session = await getSession(id);
    if (!session) throw new HttpError(410, "session_expired", "This experience has expired. Start a new build to continue.");
    if (!(await canEditSession(id, readEditorToken(request, id)))) throw new HttpError(403, "editor_forbidden", "Open this link in the browser where you created the experience.");
    const personalization = await getPersonalizationRequest(id);
    return NextResponse.json({ session: toPublicSession(session), ...(personalization ? { request: toPublicPersonalizationRequest(personalization) } : {}) }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error, { route: "/api/sessions/[id]/resume", method: "GET", sessionId: id });
  }
}
