import { after, NextRequest, NextResponse } from "next/server";

import { apiError, noStoreHeaders } from "@/lib/http";
import { createSession, runBrandStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/validation";

import { setEditorTokenCookie } from "./editor-cookie";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(`create:${anonymousClientKey(request)}`, 5, 60);
    const input = createSessionSchema.parse(await request.json());
    const created = await createSession(input);
    after(() => runBrandStage(created.session.id));
    const response = NextResponse.json({ session: created.session }, { status: 201, headers: noStoreHeaders });
    setEditorTokenCookie(request, response, created.session.id, created.editorToken);
    return response;
  } catch (error) {
    return apiError(error, {
      route: "/api/sessions",
      method: "POST",
      operation: "create_session"
    });
  }
}
