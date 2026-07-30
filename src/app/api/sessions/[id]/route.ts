import { after, NextRequest, NextResponse } from "next/server";

import { apiError, noStoreHeaders } from "@/lib/http";
import { canEditSession, patchSessionAnswers, runStoryStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { getSession, toPublicSession } from "@/lib/session-store";
import { answersSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

function editorToken(request: NextRequest, id: string): string | undefined {
  const value = request.cookies.get("tmn_editor")?.value;
  if (!value) return undefined;
  const [cookieId, token] = value.split(".", 2);
  return cookieId === id ? token : undefined;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "This temporary experience has expired.", code: "expired" },
      { status: 410, headers: noStoreHeaders }
    );
  }
  return NextResponse.json({ session: toPublicSession(session) }, { headers: noStoreHeaders });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await enforceRateLimit(`input:${anonymousClientKey(request)}`, 60, 60);
    if (!(await canEditSession(id, editorToken(request, id)))) {
      return NextResponse.json({ error: "This editor session is no longer active." }, { status: 403 });
    }
    const patch = answersSchema.parse(await request.json());
    const updated = await patchSessionAnswers(id, patch);
    if (updated.shouldGenerate) after(() => runStoryStage(id));
    return NextResponse.json({ session: updated.session }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
