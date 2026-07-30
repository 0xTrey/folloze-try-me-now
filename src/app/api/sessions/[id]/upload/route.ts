import OpenAI, { toFile } from "openai";
import { BlobPreconditionFailedError, del, get, head, put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { config, hasOpenAI } from "@/lib/config";
import { apiError, HttpError, logServerError, noStoreHeaders } from "@/lib/http";
import { canEditSession, patchSessionAnswers, runStoryStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session-store";

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
  attemptCount: z.number().int().nonnegative(),
  openAIFileId: z.string().min(5).max(100).optional(),
  errorCode: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(),
  requestId: z.string().uuid().optional()
});

type UploadStatus = z.infer<typeof uploadStatusSchema>;

function editorToken(request: NextRequest, id: string): string | undefined {
  const value = request.cookies.get("tmn_editor")?.value;
  if (!value) return undefined;
  const [cookieId, token] = value.split(".", 2);
  return cookieId === id ? token : undefined;
}

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

async function discardBlob(pathname: string, id: string, uploadId: string): Promise<boolean> {
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
  try {
    if (!(await canEditSession(id, editorToken(request, id)))) {
      throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
    }
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
      { headers: noStoreHeaders }
    );
  } catch (error) {
    return apiError(error, {
      route: "/api/sessions/[id]/upload",
      method: "GET",
      sessionId: id,
      operation: "pdf_upload_status"
    });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as unknown;
    const bodyType = body && typeof body === "object" && "type" in body ? (body as { type?: unknown }).type : undefined;

    if (bodyType === "try-me.client-upload-error") {
      await enforceRateLimit(`upload-error:${anonymousClientKey(request)}`, 20, 3600);
      if (!(await canEditSession(id, editorToken(request, id)))) {
        throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
      }
      const report = clientErrorSchema.parse(body);
      const requestId = logServerError(new Error("Client PDF upload failed."), {
        route: "/api/sessions/[id]/upload",
        method: "POST",
        sessionId: id,
        operation: "pdf_client_upload",
        status: report.status,
        code: "client_upload_failed",
        details: { clientCode: report.code, fileSize: report.fileSize }
      });
      return NextResponse.json({ ok: true, requestId }, { status: 202, headers: noStoreHeaders });
    }

    const response = await handleUpload({
      request,
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await enforceRateLimit(`upload:${anonymousClientKey(request)}`, 8, 3600);
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          throw new HttpError(403, "cross_origin_upload", "This upload request is not allowed.");
        }
        if (!(await canEditSession(id, editorToken(request, id)))) {
          throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
        }
        const session = await getSession(id);
        if (!session || session.useCase !== "content" || session.answers.sourceName || session.answers.sourceUrl) {
          throw new HttpError(400, "invalid_upload_session", "This session does not accept PDF uploads.");
        }
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

        console.info(
          JSON.stringify({
            type: "try_me_upload_token_issued",
            at: new Date().toISOString(),
            sessionId: id,
            uploadId: payload.uploadId,
            maximumSizeInBytes: config.maxPdfBytes
          })
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
        const expectedPath = uploadPath(id, payload.uploadId);
        if (payload.sessionId !== id || blob.pathname !== expectedPath) {
          if (!(await discardBlob(blob.pathname, id, payload.uploadId))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
          throw new HttpError(400, "upload_path_mismatch", "The completed upload is invalid.");
        }

        const snapshot = await readUploadStatus(id, payload.uploadId);
        if (!snapshot || snapshot.value.sessionId !== id) {
          logServerError(new Error("Upload callback had no matching status record."), {
            route: "/api/sessions/[id]/upload",
            method: "POST",
            sessionId: id,
            operation: "pdf_upload_callback",
            code: "upload_status_missing",
            details: { uploadId: payload.uploadId }
          });
          if (!(await discardBlob(blob.pathname, id, payload.uploadId))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
          return;
        }
        if (snapshot.value.status === "complete" || snapshot.value.status === "failed") {
          console.info(
            JSON.stringify({
              type: "try_me_upload_callback_replayed",
              at: new Date().toISOString(),
              sessionId: id,
              uploadId: payload.uploadId,
              status: snapshot.value.status
            })
          );
          if (!(await discardBlob(blob.pathname, id, payload.uploadId))) {
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

        const processingStatus: UploadStatus = {
          ...snapshot.value,
          status: "processing",
          updatedAt: new Date().toISOString(),
          leaseUntil: new Date(Date.now() + 60_000).toISOString(),
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

          const recoveredSession = await getSession(id);
          if (recoveredSession?.answers.sourceName === payload.originalName) {
            processingSucceeded = true;
            await writeUploadStatus({
              ...processingStatus,
              status: "complete",
              updatedAt: new Date().toISOString(),
              leaseUntil: undefined,
              openAIFileId: undefined
            });
            after(() => runStoryStage(id));
            if (!(await discardBlob(blob.pathname, id, payload.uploadId))) {
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
            await writeUploadStatus(processingStatus);
          }

          const updated = await patchSessionAnswers(id, {
            sourceName: payload.originalName,
            sourceOpenAIFileId
          });
          processingSucceeded = true;
          await writeUploadStatus({
            ...processingStatus,
            status: "complete",
            updatedAt: new Date().toISOString(),
            leaseUntil: undefined,
            openAIFileId: undefined
          });
          if (updated.shouldGenerate) after(() => runStoryStage(id));

          console.info(
            JSON.stringify({
              type: "try_me_upload_completed",
              at: new Date().toISOString(),
              sessionId: id,
              uploadId: payload.uploadId,
              byteSize: metadata.size,
              mode: sourceOpenAIFileId ? "openai-file" : "fixture-metadata"
            })
          );
          if (!(await discardBlob(blob.pathname, id, payload.uploadId))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
        } catch (error) {
          if (processingSucceeded) throw error;
          if (error instanceof HttpError && error.code === "upload_claim_conflict") throw error;
          const errorCode = error instanceof HttpError ? error.code : "upload_processing_failed";
          const requestId = logServerError(error, {
            route: "/api/sessions/[id]/upload",
            method: "POST",
            sessionId: id,
            operation: "pdf_upload_callback",
            status: error instanceof HttpError ? error.status : 500,
            code: errorCode,
            details: { uploadId: payload.uploadId }
          });
          try {
            await writeUploadStatus({
              ...processingStatus,
              status: "failed",
              updatedAt: new Date().toISOString(),
              leaseUntil: undefined,
              openAIFileId: undefined,
              errorCode,
              requestId
            });
          } catch (statusError) {
            logServerError(statusError, {
              route: "/api/sessions/[id]/upload",
              method: "POST",
              sessionId: id,
              operation: "pdf_upload_status",
              code: "upload_status_write_failed",
              details: { uploadId: payload.uploadId, targetStatus: "failed" }
            });
            throw statusError;
          }
          if (!(await discardBlob(blob.pathname, id, payload.uploadId))) {
            throw new HttpError(503, "blob_cleanup_pending", "Upload cleanup is still in progress.");
          }
        }
      }
    });

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error, {
      route: "/api/sessions/[id]/upload",
      method: "POST",
      sessionId: id,
      operation: "pdf_upload"
    });
  }
}
