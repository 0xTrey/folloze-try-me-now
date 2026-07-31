import { after, NextRequest, NextResponse } from "next/server";

import { apiError, noStoreHeaders } from "@/lib/http";
import {
  canEditSession,
  duplicateSession,
  patchSessionAnswers,
  patchSessionWorkspace,
  recordPreviewInteraction,
  recoverSessionWork,
  runStoryStage,
  runTargetBrandStage
} from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { getSession, toPublicSession } from "@/lib/session-store";
import {
  answersSchema,
  sessionOperationSchema,
  sessionWorkspacePatchSchema
} from "@/lib/validation";

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
  after(() => recoverSessionWork(id));
  return NextResponse.json({ session: toPublicSession(session) }, { headers: noStoreHeaders });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await enforceRateLimit(`input:${anonymousClientKey(request)}`, 60, 60);
    if (!(await canEditSession(id, editorToken(request, id)))) {
      return NextResponse.json({ error: "This editor session is no longer active." }, { status: 403 });
    }
    const body: unknown = await request.json();
    const workspaceParse = sessionWorkspacePatchSchema.safeParse(body);
    let updated;
    let targetDomain: string | undefined;
    if (workspaceParse.success) {
      updated = await patchSessionWorkspace(id, workspaceParse.data);
      targetDomain = workspaceParse.data.answers?.targetDomain;
    } else {
      const patch = answersSchema.parse(body);
      updated = await patchSessionAnswers(id, patch);
      targetDomain = patch.targetDomain;
    }
    if (targetDomain) after(() => runTargetBrandStage(id));
    if (updated.shouldGenerate) after(() => runStoryStage(id));
    return NextResponse.json({ session: updated.session }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    // Preview interactions are session-scoped. Including the session ID prevents
    // one completed preview (or multiple prospects behind one corporate NAT) from
    // exhausting the interaction allowance for every other active experience.
    await enforceRateLimit(`operation:${id}:${anonymousClientKey(request)}`, 120, 3600);
    if (!(await canEditSession(id, editorToken(request, id)))) {
      return NextResponse.json(
        { error: "This editor session is no longer active." },
        { status: 403, headers: noStoreHeaders }
      );
    }
    const operation = sessionOperationSchema.parse(await request.json());
    if (operation.operation === "preview-interaction") {
      const session = await recordPreviewInteraction(id, operation);
      return NextResponse.json({ session }, { headers: noStoreHeaders });
    }

    const duplicated = await duplicateSession(id, operation);
    after(() => recoverSessionWork(duplicated.session.id));
    const response = NextResponse.json(
      { session: duplicated.session, mode: operation.mode },
      { status: 201, headers: noStoreHeaders }
    );
    response.cookies.set(
      "tmn_editor",
      `${duplicated.session.id}.${duplicated.editorToken}`,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/sessions",
        maxAge: 3600
      }
    );
    return response;
  } catch (error) {
    return apiError(error);
  }
}
