import { after, NextRequest, NextResponse } from "next/server";

import {
  apiError,
  HttpError,
  noStoreHeaders,
  startServerOperation
} from "@/lib/http";
import {
  canEditSession,
  duplicateSession,
  patchSessionAnswers,
  patchSessionWorkspace,
  recordPreviewInteraction,
  recoverSessionWork,
  runSourceIntelligenceStage,
  runStoryStage,
  runTargetBrandStage
} from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { getSession, toPublicSession } from "@/lib/session-store";
import { traceIdForSession } from "@/lib/trace-store";
import {
  answersSchema,
  sessionOperationSchema,
  sessionWorkspacePatchSchema
} from "@/lib/validation";

import { readEditorToken, setEditorTokenCookie } from "../editor-cookie";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const trace = startServerOperation({
    route: "/api/sessions/[id]",
    method: "GET",
    sessionId: id,
    operation: "read_session"
  });
  try {
    const session = await getSession(id);
    if (!session) {
      throw new HttpError(410, "expired", "This temporary experience has expired.");
    }
    trace.setTraceId(traceIdForSession(session));
    after(() => recoverSessionWork(id));
    return NextResponse.json(
      { session: toPublicSession(session) },
      { headers: { ...noStoreHeaders, ...trace.complete(200) } }
    );
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const trace = startServerOperation({
    route: "/api/sessions/[id]",
    method: "PATCH",
    sessionId: id,
    operation: "update_session"
  });
  try {
    await enforceRateLimit(`input:${anonymousClientKey(request)}`, 60, 60);
    if (!(await canEditSession(id, readEditorToken(request, id)))) {
      throw new HttpError(403, "editor_forbidden", "This editor session is no longer active.");
    }
    const body: unknown = await request.json();
    const workspaceParse = sessionWorkspacePatchSchema.safeParse(body);
    let updated;
    let targetDomain: string | undefined;
    let sourceUrl: string | undefined;
    if (workspaceParse.success) {
      updated = await patchSessionWorkspace(id, workspaceParse.data);
      targetDomain = workspaceParse.data.answers?.targetDomain;
      sourceUrl = workspaceParse.data.answers?.sourceUrl;
    } else {
      const patch = answersSchema.parse(body);
      updated = await patchSessionAnswers(id, patch);
      targetDomain = patch.targetDomain;
      sourceUrl = patch.sourceUrl;
    }
    if (targetDomain) after(() => runTargetBrandStage(id));
    if (sourceUrl) after(() => runSourceIntelligenceStage(id));
    if (updated.shouldGenerate) after(() => runStoryStage(id));
    trace.setTraceId(updated.traceId);
    return NextResponse.json(
      { session: updated.session },
      { headers: { ...noStoreHeaders, ...trace.complete(200) } }
    );
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const trace = startServerOperation({
    route: "/api/sessions/[id]",
    method: "POST",
    sessionId: id,
    operation: "session_operation"
  });
  try {
    // Preview interactions are session-scoped. Including the session ID prevents
    // one completed preview (or multiple prospects behind one corporate NAT) from
    // exhausting the interaction allowance for every other active experience.
    await enforceRateLimit(`operation:${id}:${anonymousClientKey(request)}`, 120, 3600);
    if (!(await canEditSession(id, readEditorToken(request, id)))) {
      throw new HttpError(403, "editor_forbidden", "This editor session is no longer active.");
    }
    const operation = sessionOperationSchema.parse(await request.json());
    if (operation.operation === "preview-interaction") {
      const session = await recordPreviewInteraction(id, operation);
      const internal = await getSession(id);
      if (internal) trace.setTraceId(traceIdForSession(internal));
      return NextResponse.json(
        { session },
        { headers: { ...noStoreHeaders, ...trace.complete(200, { mode: operation.operation }) } }
      );
    }

    const duplicated = await duplicateSession(id, operation);
    after(() => recoverSessionWork(duplicated.session.id));
    trace.setTraceId(duplicated.traceId);
    const response = NextResponse.json(
      { session: duplicated.session, mode: operation.mode },
      {
        status: 201,
        headers: { ...noStoreHeaders, ...trace.complete(201, { mode: operation.mode }) }
      }
    );
    setEditorTokenCookie(
      request,
      response,
      duplicated.session.id,
      duplicated.editorToken
    );
    return response;
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}
