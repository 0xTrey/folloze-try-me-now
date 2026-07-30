import { after, NextResponse } from "next/server";

import { apiError, noStoreHeaders } from "@/lib/http";
import { createSession, runBrandStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(`create:${anonymousClientKey(request)}`, 5, 60);
    const input = createSessionSchema.parse(await request.json());
    const created = await createSession(input);
    after(() => runBrandStage(created.session.id));
    const response = NextResponse.json({ session: created.session }, { status: 201, headers: noStoreHeaders });
    response.cookies.set("tmn_editor", `${created.session.id}.${created.editorToken}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/sessions",
      maxAge: 3600
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
