import { del, get, head, put } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSourceArtifact } from "@/lib/content-intelligence";
import { extractPdfSourceArtifact } from "@/lib/content-pdf";
import { canEditSession, finalizePdfSource } from "@/lib/orchestrator";
import { supportRefForTraceId } from "@/lib/observability";
import { getSession, updateSession } from "@/lib/session-store";

vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return { ...actual, del: vi.fn(), get: vi.fn(), head: vi.fn(), put: vi.fn() };
});

vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));

vi.mock("@/lib/orchestrator", () => ({
  canEditSession: vi.fn(),
  finalizePdfSource: vi.fn(),
  runStoryStage: vi.fn()
}));

vi.mock("@/lib/content-pdf", () => ({
  extractPdfSourceArtifact: vi.fn()
}));

vi.mock("@/lib/pdf-title", () => ({
  pdfTitleFallback: vi.fn(() => "Source document")
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    anonymousClientKey: vi.fn(() => "test-client"),
    enforceRateLimit: vi.fn()
  };
});

vi.mock("@/lib/session-store", () => ({
  getSession: vi.fn(),
  sessionStoreMode: "vercel-blob",
  updateSession: vi.fn()
}));

import { POST } from "./route";

const sessionId = "abcdefghijklmnopqrstuvwx12345678";
const uploadId = "123e4567-e89b-42d3-a456-426614174000";
const pathname = `try-me/uploads/${sessionId}/${uploadId}.pdf`;
const statusPathname = `try-me/upload-status/${sessionId}/${uploadId}.json`;
const payload = JSON.stringify({ sessionId, uploadId, originalName: "brief.pdf" });
const uploadTraceId = "private-upload-trace";
const readyPdfArtifact = createSourceArtifact({
  source: {
    kind: "uploaded-pdf",
    displayName: "brief.pdf",
    mediaType: "application/pdf"
  },
  extraction: {
    method: "pdf-text",
    status: "complete",
    truncated: false,
    pageCount: 3,
    extractedPageCount: 3,
    ocr: {
      status: "not-required",
      pageNumbers: [],
      reason: "Every inspected page contains a usable text layer."
    },
    warnings: []
  },
  content: {
    title: "The Now Platform Reference Guide",
    description: "A cited operating guide for connecting workflows, data, and measurable outcomes.",
    text: [
      "The Now Platform connects workflows, data, and experiences across the enterprise so teams can understand how operating decisions fit together.",
      "Research found that 42 percent of transformation teams need a clearer way to connect platform evidence to the next operating question.",
      "Teams should use the guide to compare capabilities, inspect supporting proof, and choose one governed next action for the buying group."
    ].join(" "),
    sections: [
      {
        id: "pdf_section_1",
        title: "Connect the enterprise",
        level: 1,
        order: 0,
        text: "The Now Platform connects workflows, data, and experiences across the enterprise so teams can understand how operating decisions fit together.",
        citationIds: ["pdf_page_1"]
      },
      {
        id: "pdf_section_2",
        title: "Inspect the evidence",
        level: 2,
        order: 1,
        text: "Research found that 42 percent of transformation teams need a clearer way to connect platform evidence to the next operating question.",
        citationIds: ["pdf_page_2"]
      },
      {
        id: "pdf_section_3",
        title: "Choose the next action",
        level: 2,
        order: 2,
        text: "Teams should use the guide to compare capabilities, inspect supporting proof, and choose one governed next action for the buying group.",
        citationIds: ["pdf_page_3"]
      }
    ],
    links: [],
    assets: [],
    citations: [
      {
        id: "pdf_page_1",
        locator: { kind: "pdf-page", page: 1, label: "Page 1" },
        excerpt: "The Now Platform connects workflows, data, and experiences across the enterprise."
      },
      {
        id: "pdf_page_2",
        locator: { kind: "pdf-page", page: 2, label: "Page 2" },
        excerpt: "Research found that 42 percent of transformation teams need a clearer path."
      },
      {
        id: "pdf_page_3",
        locator: { kind: "pdf-page", page: 3, label: "Page 3" },
        excerpt: "Teams should compare capabilities and choose one governed next action."
      }
    ]
  },
  createdAt: "2026-07-30T00:00:00.000Z"
});
let committedEventNames: string[] = [];

function requestFor(body: unknown): NextRequest {
  return new NextRequest(`https://preview.example.com/api/sessions/${sessionId}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `tmn_editor=${sessionId}.editor-token`,
      Origin: "https://preview.example.com"
    },
    body: JSON.stringify(body)
  });
}

function routeContext() {
  return { params: Promise.resolve({ id: sessionId }) };
}

function privateBlobResult(body: string | Uint8Array, blobPath: string, contentType: string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return {
    statusCode: 200 as const,
    stream: new Blob([arrayBuffer]).stream(),
    headers: new Headers(),
    blob: {
      url: `https://private.example/${blobPath}`,
      downloadUrl: `https://private.example/${blobPath}?download=1`,
      pathname: blobPath,
      contentDisposition: "attachment",
      cacheControl: "private, max-age=60",
      uploadedAt: new Date(),
      etag: "status-etag",
      contentType,
      size: bytes.byteLength
    }
  };
}

describe("PDF client upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(canEditSession).mockResolvedValue(true);
    committedEventNames = [];
    vi.mocked(getSession).mockResolvedValue({
      id: sessionId,
      traceId: uploadTraceId,
      useCase: "content",
      answers: { sourceUploadId: uploadId },
      events: []
    } as never);
    vi.mocked(updateSession).mockImplementation(async (_id, updater) => {
      const updated = await updater({
        id: sessionId,
        traceId: uploadTraceId,
        useCase: "content",
        answers: { sourceUploadId: uploadId },
        events: []
      } as never);
      committedEventNames.push(...(updated.events ?? []).map((event) => event.name));
      return updated as never;
    });
    vi.mocked(put).mockResolvedValue({} as never);
    vi.mocked(del).mockResolvedValue(undefined);
    vi.mocked(extractPdfSourceArtifact).mockResolvedValue(readyPdfArtifact);
  });

  it("issues a short-lived private PDF-only token without sending PDF bytes through the Function", async () => {
    let issuedOptions: Record<string, unknown> | undefined;
    vi.mocked(handleUpload).mockImplementation(async (options) => {
      if (options.body.type !== "blob.generate-client-token") throw new Error("Unexpected event");
      issuedOptions = await options.onBeforeGenerateToken(
        options.body.payload.pathname,
        options.body.payload.clientPayload,
        false
      );
      return { type: "blob.generate-client-token", clientToken: "short-lived-token" };
    });

    const response = await POST(
      requestFor({
        type: "blob.generate-client-token",
        payload: { pathname, clientPayload: payload, multipart: false }
      }),
      routeContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-support-ref")).toBe(
      supportRefForTraceId(uploadTraceId)
    );
    expect(committedEventNames).toContain("upload_token_issued");
    expect(canEditSession).toHaveBeenCalledWith(sessionId, "editor-token");
    expect(issuedOptions).toMatchObject({
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 10 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false
    });
    expect(Number(issuedOptions?.validUntil)).toBeGreaterThan(Date.now());
    expect(put).toHaveBeenCalledWith(
      statusPathname,
      expect.any(String),
      expect.objectContaining({ access: "private", allowOverwrite: false })
    );
    const functionBody = vi.mocked(handleUpload).mock.calls[0]?.[0].body;
    expect(functionBody).not.toHaveProperty("file");
    expect(JSON.stringify(functionBody).length).toBeLessThan(2_000);
  });

  it.each(["abm", "campaign"] as const)(
    "issues the same private PDF token for optional %s context",
    async (useCase) => {
      vi.mocked(getSession).mockResolvedValue({
        id: sessionId,
        traceId: uploadTraceId,
        useCase,
        answers: {},
        events: []
      } as never);
      let issuedOptions: Record<string, unknown> | undefined;
      vi.mocked(handleUpload).mockImplementation(async (options) => {
        if (options.body.type !== "blob.generate-client-token") throw new Error("Unexpected event");
        issuedOptions = await options.onBeforeGenerateToken(
          options.body.payload.pathname,
          options.body.payload.clientPayload,
          false
        );
        return { type: "blob.generate-client-token", clientToken: "short-lived-token" };
      });

      const response = await POST(
        requestFor({
          type: "blob.generate-client-token",
          payload: { pathname, clientPayload: payload, multipart: false }
        }),
        routeContext()
      );

      expect(response.status).toBe(200);
      expect(issuedOptions).toMatchObject({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: false,
        allowOverwrite: false
      });
    }
  );

  it("refuses to issue an upload token when the editor cookie is invalid", async () => {
    vi.mocked(canEditSession).mockResolvedValue(false);
    vi.mocked(handleUpload).mockImplementation(async (options) => {
      if (options.body.type !== "blob.generate-client-token") throw new Error("Unexpected event");
      await options.onBeforeGenerateToken(pathname, payload, false);
      return { type: "blob.generate-client-token", clientToken: "never-issued" };
    });

    const response = await POST(
      requestFor({
        type: "blob.generate-client-token",
        payload: { pathname, clientPayload: payload, multipart: false }
      }),
      routeContext()
    );
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("editor_inactive");
    expect(put).not.toHaveBeenCalled();
  });

  it("validates the stored PDF, completes the correlated status, and deletes the private artifact", async () => {
    const statusRecord = JSON.stringify({
      sessionId,
      uploadId,
      status: "pending",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      attemptCount: 0
    });
    vi.mocked(get).mockImplementation(async (blobPath) => {
      if (blobPath === pathname) {
        return privateBlobResult("%PDF-1.7\nfixture", pathname, "application/pdf") as never;
      }
      const latestStatusBody = [...vi.mocked(put).mock.calls]
        .reverse()
        .find(([writtenPath]) => writtenPath === statusPathname)?.[1];
      return privateBlobResult(
        typeof latestStatusBody === "string" ? latestStatusBody : statusRecord,
        statusPathname,
        "application/json"
      ) as never;
    });
    vi.mocked(head).mockResolvedValue({ size: 18, contentType: "application/pdf" } as never);
    vi.mocked(finalizePdfSource).mockResolvedValue({
      session: { answers: { sourceName: "brief.pdf" } },
      shouldGenerate: false
    } as never);
    vi.mocked(handleUpload).mockImplementation(async (options) => {
      if (options.body.type !== "blob.upload-completed") throw new Error("Unexpected event");
      await options.onUploadCompleted?.({
        blob: options.body.payload.blob,
        tokenPayload: options.body.payload.tokenPayload
      });
      return { type: "blob.upload-completed", response: "ok" };
    });

    const response = await POST(
      requestFor({
        type: "blob.upload-completed",
        payload: {
          blob: {
            url: "https://private.example/upload",
            downloadUrl: "https://private.example/upload?download=1",
            pathname,
            contentType: "application/pdf",
            contentDisposition: "attachment"
          },
          tokenPayload: payload
        }
      }),
      routeContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-support-ref")).toBe(
      supportRefForTraceId(uploadTraceId)
    );
    expect(committedEventNames).toContain("upload_completed");
    expect(finalizePdfSource).toHaveBeenCalledWith(sessionId, {
      uploadId,
      sourceName: "brief.pdf",
      sourceTitle: "The Now Platform Reference Guide",
      sourceOpenAIFileId: undefined,
      sourceArtifact: readyPdfArtifact
    });
    expect(put).toHaveBeenCalledWith(
      statusPathname,
      expect.stringContaining('"status":"complete"'),
      expect.objectContaining({ access: "private", allowOverwrite: true })
    );
    const processingStatus = vi.mocked(put).mock.calls
      .filter(([writtenPath]) => writtenPath === statusPathname)
      .map(([, body]) => JSON.parse(String(body)) as { status: string; leaseOwner?: string; leaseUntil?: string })
      .find((status) => status.status === "processing");
    expect(processingStatus?.leaseOwner).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(processingStatus?.leaseUntil ?? "") - Date.now()).toBeGreaterThan(300_000);
    expect(del).toHaveBeenCalledWith(pathname);
  });

  it("does not let a same-named upload complete a different reserved upload", async () => {
    const otherUploadId = "223e4567-e89b-42d3-a456-426614174000";
    const statusRecord = JSON.stringify({
      sessionId,
      uploadId,
      status: "pending",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      attemptCount: 0
    });
    vi.mocked(updateSession).mockResolvedValue({
      useCase: "content",
      answers: { sourceName: "brief.pdf", sourceUploadId: otherUploadId }
    } as never);
    vi.mocked(get).mockImplementation(async () => {
      const latestStatusBody = [...vi.mocked(put).mock.calls]
        .reverse()
        .find(([writtenPath]) => writtenPath === statusPathname)?.[1];
      return privateBlobResult(
        typeof latestStatusBody === "string" ? latestStatusBody : statusRecord,
        statusPathname,
        "application/json"
      ) as never;
    });
    vi.mocked(handleUpload).mockImplementation(async (options) => {
      if (options.body.type !== "blob.upload-completed") throw new Error("Unexpected event");
      await options.onUploadCompleted?.({
        blob: options.body.payload.blob,
        tokenPayload: options.body.payload.tokenPayload
      });
      return { type: "blob.upload-completed", response: "ok" };
    });

    const response = await POST(
      requestFor({
        type: "blob.upload-completed",
        payload: {
          blob: {
            url: "https://private.example/upload",
            downloadUrl: "https://private.example/upload?download=1",
            pathname,
            contentType: "application/pdf",
            contentDisposition: "attachment"
          },
          tokenPayload: payload
        }
      }),
      routeContext()
    );

    expect(response.status).toBe(200);
    expect(finalizePdfSource).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith(
      statusPathname,
      expect.stringContaining('"errorCode":"upload_superseded"'),
      expect.objectContaining({ access: "private", allowOverwrite: true })
    );
    expect(del).toHaveBeenCalledWith(pathname);
  });
});
