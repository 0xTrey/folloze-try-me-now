import { after, NextRequest, NextResponse } from "next/server";

import { apiError, HttpError, noStoreHeaders, startServerOperation } from "@/lib/http";
import { canEditSession } from "@/lib/orchestrator";
import {
  recoverPersonalizationFulfillment,
  runPersonalizationFulfillment
} from "@/lib/personalization-fulfillment";
import { recoverPersonalizationDelivery } from "@/lib/personalization-delivery";
import {
  addPersonalizationTargets,
  createPersonalizationRequest,
  getPersonalizationRequest,
  toPublicPersonalizationRequest
} from "@/lib/personalization-request-store";
import { selectDefaultPersonalizationTargets } from "@/lib/personalization-default-targets";
import { canRevealFinalExperience } from "@/lib/preview-lifecycle";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { getSession, toPublicSession, updateSession } from "@/lib/session-store";

import { readEditorToken } from "../../editor-cookie";

type RouteContext = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest, id: string): Promise<void> {
  if (!(await canEditSession(id, readEditorToken(request, id)))) {
    throw new HttpError(
      403,
      "editor_forbidden",
      "This editor session is no longer active."
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const operation = startServerOperation({
    route: "/api/sessions/[id]/personalization-request",
    method: "POST",
    sessionId: id,
    operation: "capture_personalization_request"
  });
  try {
    await enforceRateLimit(
      `personalization:${anonymousClientKey(request)}`,
      10,
      3600
    );
    await authorize(request, id);
    const session = await getSession(id);
    if (
      !session?.experience ||
      !session.finalArtifact ||
      !canRevealFinalExperience(toPublicSession(session)) ||
      session.finalArtifact.artifactDigest !== session.experience.artifactDigest ||
      session.finalArtifact.artifactRevision !== session.experience.artifactRevision
    ) {
      throw new HttpError(
        409,
        "personalization_not_ready",
        "The finished experience is not ready yet."
      );
    }

    const body = (await request.json()) as { email?: string };
    const personalizationRequest = await createPersonalizationRequest({
      sessionId: id,
      email: body.email ?? "",
      artifactRevision: session.experience.artifactRevision,
      artifactDigest: session.experience.artifactDigest
    });

    const persisted = await updateSession(
      id,
      (current) => {
        delete current.expiresAt;
        return current;
      },
      { persist: true }
    );
    const readBack = await getSession(id);
    if (
      !persisted ||
      !readBack ||
      readBack.experience?.artifactDigest !== personalizationRequest.baselineArtifactDigest ||
      !canRevealFinalExperience(toPublicSession(readBack))
    ) {
      throw new HttpError(
        500,
        "personalization_baseline_persistence_failed",
        "The standard experience could not be saved for personalization."
      );
    }

    return NextResponse.json(
      { request: toPublicPersonalizationRequest(personalizationRequest) },
      {
        status: 201,
        headers: { ...noStoreHeaders, ...operation.complete(201) }
      }
    );
  } catch (error) {
    return apiError(error, operation.errorContext());
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const operation = startServerOperation({
    route: "/api/sessions/[id]/personalization-request",
    method: "PATCH",
    sessionId: id,
    operation: "add_personalization_targets"
  });
  try {
    await enforceRateLimit(
      `personalization-targets:${anonymousClientKey(request)}`,
      10,
      3600
    );
    await authorize(request, id);
    const baseline = await getSession(id);
    if (!baseline) {
      throw new HttpError(
        410,
        "personalization_baseline_missing",
        "The standard experience is no longer available."
      );
    }
    const existingRequest = await getPersonalizationRequest(id);
    if (!existingRequest) {
      throw new HttpError(
        409,
        "personalization_request_missing",
        "Enter a business email before choosing target accounts."
      );
    }
    if (
      !baseline.experience ||
      !baseline.finalArtifact ||
      !canRevealFinalExperience(toPublicSession(baseline)) ||
      baseline.experience.artifactRevision !== existingRequest.baselineArtifactRevision ||
      baseline.experience.artifactDigest !== existingRequest.baselineArtifactDigest ||
      baseline.finalArtifact.artifactDigest !== existingRequest.baselineArtifactDigest
    ) {
      throw new HttpError(
        409,
        "personalization_baseline_changed",
        "The standard experience changed after this request started. Start a new request."
      );
    }
    const body = (await request.json()) as { targets?: unknown; autoSelect?: boolean };
    // Auto-selection is explicit and uses bounded demo accounts. It does not
    // infer visitor intent from private data or imply account qualification.
    const targets = body.autoSelect === true
      ? selectDefaultPersonalizationTargets({
          requestId: existingRequest.id,
          sellerDomain: baseline.companyDomain,
          audience: baseline.answers.customAudience || baseline.answers.audience
        })
      : body.targets;
    const personalizationRequest = await addPersonalizationTargets(
      id,
      targets,
      baseline.companyDomain,
      { selectionMode: body.autoSelect === true ? "representative" : "manual" }
    );
    after(() => runPersonalizationFulfillment(id));
    return NextResponse.json(
      { request: toPublicPersonalizationRequest(personalizationRequest) },
      {
        status: 202,
        headers: { ...noStoreHeaders, ...operation.complete(202) }
      }
    );
  } catch (error) {
    return apiError(error, operation.errorContext());
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const operation = startServerOperation({
    route: "/api/sessions/[id]/personalization-request",
    method: "GET",
    sessionId: id,
    operation: "read_personalization_request"
  });
  try {
    await authorize(request, id);
    const personalizationRequest = await getPersonalizationRequest(id);
    if (!personalizationRequest) {
      throw new HttpError(
        404,
        "personalization_request_not_found",
        "No personalization request exists for this experience."
      );
    }
    if (["queued", "generating"].includes(personalizationRequest.status)) {
      after(() => recoverPersonalizationFulfillment(id));
    } else if (
      ["pending", "not_configured", "sending"].includes(
        personalizationRequest.delivery?.status ?? "pending"
      )
    ) {
      after(() => recoverPersonalizationDelivery(id));
    }
    return NextResponse.json(
      { request: toPublicPersonalizationRequest(personalizationRequest) },
      { headers: { ...noStoreHeaders, ...operation.complete(200) } }
    );
  } catch (error) {
    return apiError(error, operation.errorContext());
  }
}
