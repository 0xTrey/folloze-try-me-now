import OpenAI, { toFile } from "openai";
import { del, get, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { config, hasOpenAI } from "@/lib/config";
import { apiError, HttpError, logServerError, noStoreHeaders } from "@/lib/http";
import { canEditSession, patchSessionAnswers, runStoryStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";

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

function editorToken(request: NextRequest, id: string): string | undefined {
  const value = request.cookies.get("tmn_editor")?.value;
  if (!value) return undefined;
  const [cookieId, token] = value.split(".", 2);
  return cookieId === id ? token : undefined;
}

function uploadPath(sessionId: string, uploadId: string): string {
  return `try-me/uploads/${sessionId}/${uploadId}.pdf`;
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

async function discardBlob(pathname: string, id: string, uploadId: string): Promise<void> {
  try {
    await del(pathname);
  } catch (error) {
    logServerError(error, {
      route: "/api/sessions/[id]/upload",
      method: "POST",
      sessionId: id,
      operation: "pdf_blob_cleanup",
      code: "blob_cleanup_failed",
      details: { uploadId }
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
        if (!(await canEditSession(id, editorToken(request, id)))) {
          throw new HttpError(403, "editor_inactive", "This editor session is no longer active.");
        }
        const payload = parseClientPayload(clientPayload);
        if (payload.sessionId !== id || pathname !== uploadPath(id, payload.uploadId)) {
          throw new HttpError(400, "upload_path_mismatch", "The upload destination is invalid.");
        }

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
          throw new HttpError(400, "upload_path_mismatch", "The completed upload is invalid.");
        }

        try {
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

          let sourceOpenAIFileId: string | undefined;
          if (hasOpenAI) {
            const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const uploaded = await client.files.create({
              file: await toFile(bytes, payload.originalName, { type: "application/pdf" }),
              purpose: "user_data",
              expires_after: { anchor: "created_at", seconds: 3600 }
            });
            sourceOpenAIFileId = uploaded.id;
          }

          const updated = await patchSessionAnswers(id, {
            sourceName: payload.originalName,
            sourceOpenAIFileId
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
          await discardBlob(blob.pathname, id, payload.uploadId);
        } catch (error) {
          if (error instanceof HttpError && error.status < 500) {
            await discardBlob(blob.pathname, id, payload.uploadId);
          }
          throw error;
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
