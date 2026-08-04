import { randomUUID } from "node:crypto";

import OpenAI, { toFile } from "openai";
import { BlobPreconditionFailedError, del, get, head, put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { config, hasOpenAI } from "@/lib/config";
import {
  apiError,
  type ErrorContext,
  HttpError,
  logServerError,
  noStoreHeaders,
  startServerOperation
} from "@/lib/http";
import { canEditSession, finalizePdfSource, runStoryStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { extractPdfDocumentTitle, pdfTitleFallback } from "@/lib/pdf-title";
import { getSession, sessionStoreMode, updateSession } from "@/lib/session-store";
import { appendEvent } from "@/lib/telemetry";
import { traceIdForSession } from "@/lib/trace-store";
import type { SessionEvent } from "@/lib/types";

import { readEditorToken } from "../../editor-cookie";

type RouteContext = { params: Promise<{ id: string }> };

const clientPayloadSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  uploadId: z.uuid(),
  originalName: z.string().trim().min(1).max(255).refine((name) => name.toLowerCase().endsWith(".pdf"))
});

const clientErrorSchema = z.object({
  type: z.literal("try-me.client-upload-error"),
  status: z.number().int().min(0).max(599).optional(),
  code: z.string().regex(/^[a-z0-9_]{1,64}$/),
  fileSize: z.number().int().nonnegative().max(1024 * 1024 * 1024)
});

const uploadStatusSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  uploadId: z.uuid(),
  status: z.enum(["pending", "processing", "complete", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  leaseUntil: z.string().optional(),
  leaseOwner: z.uuid().optional(),
  attemptCount: z.number().int().nonnegative(),
  openAIFileId: z.string().min(5).max(100).optional(),
  errorCode: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(),
  requestId: z.string().uuid().optional()
});

type UploadStatus = z.infer<typeof uploadStatusSchema>;

const CALLBACK_LEASE_MS = 6 * 60_000;

function uploadPath(sessionId: string, uploadId: string): string {
  return `try-me/uploads/${sessionId}/${uploadId}.pdf`;
}

function uploadStatusPath(sessionId: string, uploadId: string): string {
  return `try-me/upload-status/${sessionId}/${uploadId}.json`;
}

function parseClientPayload(value: string | null | undefined) {
  if (!value) throw new HttpError(400, "missing_upload_context", "The upload context is missing.");
  try {
    return clientPayloadSchema.parse(JSON.parse(value) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HttpError(400, "invalid_upload_context", "The upload context is invalid.");
    }
    throw error;
  }
}

async function createUploadStatus(status: UploadStatus): Promise<void> {
  await put(uploadStatusPath(status.sessionId, status.uploadId), JSON.stringify(status), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
    contentType: "application/json"
  });
}

async function readUploadStatus(sessionId: string, uploadId: string): Promise<{ value: UploadStatus; etag: string } | null> {
  const stored = await get(uploadStatusPath(sessionId, uploadId), { access: "private", useCache: false });
  if (!stored || stored.statusCode !== 200) return null;
  const value = uploadStatusSchema.parse(await new Response(stored.stream).json());
  return { value, etag: stored.blob.etag.replace(/^W\//, "") };
}

async function writeUploadStatus(status: UploadStatus, ifMatch?: string): Promise<void> {
  await put(uploadStatusPath(status.sessionId, status.uploadId), JSON.stringify(status), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    ifMatch
  });
}

async function writeOwnedUploadStatus(status: UploadStatus, leaseOwner: string): Promise<void> {
  const current = await readUploadStatus(status.sessionId, status.uploadId);
  if (
    !current ||
    current.value.status !== "processing" ||
    current.value.leaseOwner !== leaseOwner
  ) {
    throw new HttpError(503, "upload_claim_lost", "The upload callback ownership changed.");
  }
  try {
    await writeUploadStatus(status, current.etag);
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      throw new HttpError(503, "upload_claim_conflict", "The upload callback is already processing.");
    }
    throw error;
  }
}

async function reserveSessionUpload(id: string, uploadId: string): Promise<boolean> {
  if (sessionStoreMode === "upstash-redis") {
    throw new HttpError(
      503,
      "pdf_upload_store_unsupported",
      "PDF uploads are temporarily unavailable while storage is being upgraded."
    );
  }
  const now = Date.now();
  const reservedAt = new Date(now).toISOString();
  const updated = await updateSession(id, (session) => {
    if (session.answers.sourceUrl) return session;

    const currentUploadId = session.answers.sourceUploadId;
    if (session.answers.sourceName && currentUploadId !== uploadId) return session;
    if (currentUploadId === uploadId) return session;

    const currentReservedAt = Date.parse(session.answers.sourceUploadReservedAt ?? "");
    const currentReservationIsActive =
      Boolean(currentUploadId) &&
      (!Number.isFinite(currentReservedAt) || now - currentReservedAt < CALLBACK_LEASE_MS);
    if (currentReservationIsActive) return session;

    session.answers.sourceUploadId = uploadId;
    session.answers.sourceUploadReservedAt = reservedAt;
    return session;
  });
  return updated?.answers.sourceUploadId === uploadId;
}

async function releaseSessionUpload(id: string, uploadId: string): Promise<void> {
  await updateSession(id, (session) => {
    if (session.answers.sourceUploadId === uploadId && !session.answers.sourceName) {
      delete session.answers.sourceUploadId;
      delete session.answers.sourceUploadReservedAt;
    }
    return session;
  });
}

async function recordUploadLifecycleEvent(
  id: string,
  name: string,
  meta: SessionEvent["meta"],
  context: ErrorContext
): Promise<void> {
  try {
    await updateSession(id, (session) => {
      appendEvent(session, name, meta);
      return session;
    });
  } catch (error) {
    logServerError(error, {
      ...context,
      operation: "pdf_upload_trace_commit",
      code: "upload_trace_commit_failed"
    });
  }
}

async function discardBlob(
  pathname: string,
  id: string,
  uploadId: string,
  context: ErrorContext
): Promise<boolean> {
  let finalError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await del(pathname);
      return true;
    } catch (error) {
      finalError = error;
    }
  }
  logServerError(finalError, {
    ...context,
    route: "/api/sessions/[id]/upload",
    method: "POST",
    sessionId: id,
    operation: "pdf_blob_cleanup",
    code: "blob_cleanup_failed",
    details: { uploadId }
  });
  return false;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const trace = startServerOperation({
    route: "/api/sessions/[id]/upload",
    method: "GET",
    sessionId: id,
    operation: "pdf_upload_status",
    stage: "story"
  });
  try {
    if (!(await canEditSession(id, readEditorToken(request, id)))) {
      throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
    }
    const session = await getSession(id);
    if (session) trace.setTraceId(traceIdForSession(session));
    const uploadId = z.uuid().parse(request.nextUrl.searchParams.get("uploadId"));
    const snapshot = await readUploadStatus(id, uploadId);
    if (!snapshot || snapshot.value.sessionId !== id) {
      throw new HttpError(410, "upload_status_expired", "This upload status is no longer available.");
    }
    return NextResponse.json(
      {
        upload: {
          status: snapshot.value.status,
          errorCode: snapshot.value.errorCode,
          requestId: snapshot.value.requestId
        }
      },
      {
        headers: {
          ...noStoreHeaders,
          ...trace.complete(200, { status: snapshot.value.status })
        }
      }
    );
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const trace = startServerOperation({
    route: "/api/sessions/[id]/upload",
    method: "POST",
    sessionId: id,
    operation: "pdf_upload",
    stage: "story"
  });

  try {
    await enforceRateLimit(`upload-request:${anonymousClientKey(request)}`, 40, 60);
    const body = (await request.json()) as unknown;
    const bodyType = body && typeof body === "object" && "type" in body ? (body as { type?: unknown }).type : undefined;

    if (bodyType === "try-me.client-upload-error") {
      await enforceRateLimit(`upload-error:${anonymousClientKey(request)}`, 20, 3600);
      if (!(await canEditSession(id, readEditorToken(request, id)))) {
        throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
      }
      const session = await getSession(id);
      if (session) trace.setTraceId(traceIdForSession(session));
      const report = clientErrorSchema.parse(body);
      const requestId = logServerError(new Error("Client PDF upload failed."), {
        ...trace.errorContext(),
        route: "/api/sessions/[id]/upload",
        method: "POST",
        sessionId: id,
        operation: "pdf_client_upload",
        status: report.status,
        code: "client_upload_failed",
        details: {
          clientCode: report.code,
          fileSizeBucket:
            report.fileSize < 1_000_000
              ? "under-1mb"
              : report.fileSize < 5_000_000
                ? "1mb-to-5mb"
                : "5mb-or-more"
        }
      });
      await recordUploadLifecycleEvent(
        id,
        "upload_client_failed",
        {
          requestId,
          status: report.status ?? 0,
          mode: "direct-browser-upload"
        },
        trace.errorContext()
      );
      return NextResponse.json(
        { ok: true, requestId },
        {
          status: 202,
          headers: { ...noStoreHeaders, ...trace.complete(202, { status: "accepted" }) }
        }
      );
    }

    const response = await handleUpload({
      request,
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await enforceRateLimit(`upload:${anonymousClientKey(request)}`, 8, 3600);
        if (sessionStoreMode === "upstash-redis") {
          throw new HttpError(
            503,
            "pdf_upload_store_unsupported",
            "PDF uploads are temporarily unavailable while storage is being upgraded."
          );
        }
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          throw new HttpError(403, "cross_origin_upload", "This upload request is not allowed.");
        }
        if (!(await canEditSession(id, readEditorToken(request, id)))) {
          throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
        }
        const session = await getSession(id);
        if (!session || session.answers.sourceName || session.answers.sourceUrl) {
          throw new HttpError(400, "invalid_upload_session", "This session does not accept PDF uploads.");
        }
        trace.setTraceId(traceIdForSession(session));
        const payload = parseClientPayload(clientPayload);
        if (payload.sessionId !== id || pathname !== uploadPath(id, payload.uploadId)) {
          throw new HttpError(400, "upload_path_mismatch", "The upload destination is invalid.");
        }

        const now = new Date().toISOString();
        await createUploadStatus({
          sessionId: id,
          uploadId: payload.uploadId,
          status: "pending",
          createdAt: now,
          updatedAt: now,
          attemptCount: 0
        });

        await recordUploadLifecycleEvent(
          id,
          "upload_token_issued",
          { requestId: trace.requestId, mode: "direct-browser-upload" },
          trace.errorContext()
        );

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: config.maxPdfBytes,
          validUntil: Date.now() + 10 * 60_000,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify(payload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseClientPayload(tokenPayload);
        const callbackSession = await getSession(id);
        if (callbackSession) trace.setTraceId(traceIdForSession(callbackSession));
        const expectedPath = uploadPath(id, payload.uploadId);
        if (payload.sessionId !== id || blob.pathname !== expectedPath) {
          if (!(await discardBlob(blob.pathname, id, payload.uploadId, trace.errorContext()))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
          throw new HttpError(400, "upload_path_mismatch", "The completed upload is invalid.");
        }

        const snapshot = await readUploadStatus(id, payload.uploadId);
        if (!snapshot || snapshot.value.sessionId !== id) {
          logServerError(new Error("Upload callback had no matching status record."), {
            ...trace.errorContext(),
            route: "/api/sessions/[id]/upload",
            method: "POST",
            sessionId: id,
            operation: "pdf_upload_callback",
            code: "upload_status_missing",
            details: { uploadId: payload.uploadId }
          });
          if (!(await discardBlob(blob.pathname, id, payload.uploadId, trace.errorContext()))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
          return;
        }
        if (snapshot.value.status === "complete" || snapshot.value.status === "failed") {
          await recordUploadLifecycleEvent(
            id,
            "upload_callback_replayed",
            { requestId: trace.requestId, status: snapshot.value.status },
            trace.errorContext()
          );
          if (snapshot.value.status === "failed") {
            await releaseSessionUpload(id, payload.uploadId);
          }
          if (!(await discardBlob(blob.pathname, id, payload.uploadId, trace.errorContext()))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
          return;
        }

        const leaseIsActive =
          snapshot.value.status === "processing" &&
          snapshot.value.leaseUntil &&
          Date.parse(snapshot.value.leaseUntil) > Date.now();
        if (leaseIsActive) {
          throw new HttpError(503, "upload_processing_in_progress", "The upload callback is already processing.");
        }

        const leaseOwner = randomUUID();
        const processingStatus: UploadStatus = {
          ...snapshot.value,
          status: "processing",
          updatedAt: new Date().toISOString(),
          leaseUntil: new Date(Date.now() + CALLBACK_LEASE_MS).toISOString(),
          leaseOwner,
          attemptCount: snapshot.value.attemptCount + 1,
          errorCode: undefined,
          requestId: undefined
        };
        let processingSucceeded = false;
        try {
          try {
            await writeUploadStatus(processingStatus, snapshot.etag);
          } catch (error) {
            if (error instanceof BlobPreconditionFailedError) {
              throw new HttpError(503, "upload_claim_conflict", "The upload callback is already processing.");
            }
            throw error;
          }

          if (!(await reserveSessionUpload(id, payload.uploadId))) {
            throw new HttpError(
              409,
              "upload_superseded",
              "Another PDF upload is already being processed for this experience."
            );
          }

          const recoveredSession = await getSession(id);
          if (
            recoveredSession?.answers.sourceUploadId === payload.uploadId &&
            recoveredSession.answers.sourceName === payload.originalName
          ) {
            processingSucceeded = true;
            await writeOwnedUploadStatus(
              {
                ...processingStatus,
                status: "complete",
                updatedAt: new Date().toISOString(),
                leaseUntil: undefined,
                leaseOwner: undefined,
                openAIFileId: undefined
              },
              leaseOwner
            );
            after(() => runStoryStage(id));
            if (!(await discardBlob(blob.pathname, id, payload.uploadId, trace.errorContext()))) {
              throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
            }
            return;
          }

          const metadata = await head(blob.pathname);
          const contentType = metadata.contentType.split(";", 1)[0]?.toLowerCase();
          if (metadata.size > config.maxPdfBytes) {
            throw new HttpError(400, "pdf_too_large", "That PDF is larger than the 10 MB V1 limit.");
          }
          if (contentType !== "application/pdf") {
            throw new HttpError(400, "invalid_pdf_type", "V1 accepts PDF files only.");
          }

          const stored = await get(blob.pathname, { access: "private", useCache: false });
          if (!stored || stored.statusCode !== 200) throw new Error("The uploaded PDF could not be read from storage.");
          const bytes = new Uint8Array(await new Response(stored.stream).arrayBuffer());
          if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
            throw new HttpError(400, "invalid_pdf_signature", "That file is not a valid PDF.");
          }

          const sourceTitle =
            (await extractPdfDocumentTitle(bytes, payload.originalName)) ?? pdfTitleFallback();

          let sourceOpenAIFileId = hasOpenAI ? processingStatus.openAIFileId : undefined;
          if (hasOpenAI && !sourceOpenAIFileId) {
            const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const uploaded = await client.files.create({
              file: await toFile(bytes, payload.originalName, { type: "application/pdf" }),
              purpose: "user_data",
              expires_after: { anchor: "created_at", seconds: 3600 }
            });
            sourceOpenAIFileId = uploaded.id;
            processingStatus.openAIFileId = sourceOpenAIFileId;
            await writeOwnedUploadStatus(processingStatus, leaseOwner);
          }

          const updated = await finalizePdfSource(id, {
            uploadId: payload.uploadId,
            sourceName: payload.originalName,
            sourceTitle,
            sourceOpenAIFileId
          });
          processingSucceeded = true;
          await writeOwnedUploadStatus(
            {
              ...processingStatus,
              status: "complete",
              updatedAt: new Date().toISOString(),
              leaseUntil: undefined,
              leaseOwner: undefined,
              openAIFileId: undefined
            },
            leaseOwner
          );
          if (updated.shouldGenerate) after(() => runStoryStage(id));

          await recordUploadLifecycleEvent(
            id,
            "upload_completed",
            {
              requestId: trace.requestId,
              byteSizeBucket:
                metadata.size < 1_000_000
                  ? "under-1mb"
                  : metadata.size < 5_000_000
                    ? "1mb-to-5mb"
                    : "5mb-to-limit",
              mode: sourceOpenAIFileId ? "openai-file" : "fixture-metadata"
            },
            trace.errorContext()
          );
          if (!(await discardBlob(blob.pathname, id, payload.uploadId, trace.errorContext()))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
        } catch (error) {
          if (processingSucceeded) throw error;
          if (
            error instanceof HttpError &&
            (error.code === "upload_claim_conflict" || error.code === "upload_claim_lost")
          ) {
            throw error;
          }
          const errorCode = error instanceof HttpError ? error.code : "upload_processing_failed";
          const requestId = logServerError(error, {
            ...trace.errorContext(),
            route: "/api/sessions/[id]/upload",
            method: "POST",
            sessionId: id,
            operation: "pdf_upload_callback",
            status: error instanceof HttpError ? error.status : 500,
            code: errorCode,
            details: { uploadId: payload.uploadId }
          });
          await recordUploadLifecycleEvent(
            id,
            "upload_processing_failed",
            { requestId, error: errorCode },
            trace.errorContext()
          );
          try {
            await writeOwnedUploadStatus(
              {
                ...processingStatus,
                status: "failed",
                updatedAt: new Date().toISOString(),
                leaseUntil: undefined,
                leaseOwner: undefined,
                openAIFileId: undefined,
                errorCode,
                requestId
              },
              leaseOwner
            );
            await releaseSessionUpload(id, payload.uploadId);
          } catch (statusError) {
            logServerError(statusError, {
              ...trace.errorContext(),
              route: "/api/sessions/[id]/upload",
              method: "POST",
              sessionId: id,
              operation: "pdf_upload_status",
              code: "upload_status_write_failed",
              details: { uploadId: payload.uploadId, targetStatus: "failed" }
            });
            throw statusError;
          }
          if (!(await discardBlob(blob.pathname, id, payload.uploadId, trace.errorContext()))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
        }
      }
    });

    return NextResponse.json(response, {
      headers: { ...noStoreHeaders, ...trace.complete(200) }
    });
  } catch (error) {
    return apiError(error, trace.errorContext());
  }
}
