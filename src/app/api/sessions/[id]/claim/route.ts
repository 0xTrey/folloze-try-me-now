import { NextRequest, NextResponse } from "next/server";

import { apiError, noStoreHeaders } from "@/lib/http";
import { canEditSession, claimSession } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { claimSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

function editorToken(request: NextRequest, id: string): string | undefined {
  const value = request.cookies.get("tmn_editor")?.value;
  if (!value) return undefined;
  const [cookieId, token] = value.split(".", 2);
  return cookieId === id ? token : undefined;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await enforceRateLimit(`claim:${anonymousClientKey(request)}`, 5, 3600);
    if (!(await canEditSession(id, editorToken(request, id)))) {
      return NextResponse.json({ error: "This editor session is no longer active." }, { status: 403 });
    }
    const { email } = claimSchema.parse(await request.json());
    const result = await claimSession(id, email);
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
