import { describe, expect, it } from "vitest";

import { finalizePdfSource, isGenerationReady } from "@/lib/orchestrator";
import { deleteSession, getSession, putSession, toPublicSession } from "@/lib/session-store";
import type { TryMeSession } from "@/lib/types";

describe("isGenerationReady", () => {
  const common = {
    audience: "Demand generation leaders",
    objective: "Book meetings"
  };

  it("requires a target account for 1:1 ABM", () => {
    expect(isGenerationReady("abm", common)).toBe(false);
    expect(isGenerationReady("abm", { ...common, targetDomain: "target.com" })).toBe(true);
  });

  it("keeps events inside the campaign path and requires event facts", () => {
    expect(isGenerationReady("campaign", { ...common, campaignType: "product" })).toBe(true);
    expect(isGenerationReady("campaign", { ...common, campaignType: "event" })).toBe(false);
    expect(
      isGenerationReady("campaign", {
        ...common,
        campaignType: "event",
        eventSource: "September 12 webinar for revenue leaders"
      })
    ).toBe(true);
  });

  it("requires a content URL or uploaded source", () => {
    expect(isGenerationReady("content", common)).toBe(false);
    expect(isGenerationReady("content", { ...common, sourceUrl: "https://example.com/report" })).toBe(true);
    expect(isGenerationReady("content", { ...common, sourceName: "report.pdf" })).toBe(true);
  });
});

describe("public session projection", () => {
  it("never exposes editor credentials or OpenAI file identifiers", () => {
    const session: TryMeSession = {
      id: "session-id",
      editorTokenHash: "private-editor-hash",
      useCase: "content",
      companyDomain: "example.com",
      status: "collecting",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      temporaryUrl: "https://example.com/e/session-id",
      revision: 1,
      stages: {
        brand: { status: "complete" },
        audience: { status: "running" },
        story: { status: "pending" }
      },
      answers: {
        sourceName: "brief.pdf",
        sourceOpenAIFileId: "file-private-source",
        sourceUploadId: "123e4567-e89b-42d3-a456-426614174000",
        sourceUploadReservedAt: "2026-07-30T00:00:00.000Z"
      },
      audienceSuggestions: [],
      events: []
    };

    const projected = toPublicSession(session);
    expect(projected).not.toHaveProperty("editorTokenHash");
    expect(projected.answers).toEqual({ sourceName: "brief.pdf" });
    expect(JSON.stringify(projected)).not.toContain("file-private-source");
    expect(JSON.stringify(projected)).not.toContain("123e4567-e89b-42d3-a456-426614174000");
  });
});

describe("PDF source finalization", () => {
  function session(id: string, answers: TryMeSession["answers"]): TryMeSession {
    return {
      id,
      editorTokenHash: "private-editor-hash",
      useCase: "content",
      companyDomain: "example.com",
      status: "collecting",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      temporaryUrl: `https://example.com/e/${id}`,
      revision: 1,
      stages: {
        brand: { status: "complete" },
        audience: { status: "running" },
        story: { status: "pending" }
      },
      answers,
      audienceSuggestions: [],
      events: []
    };
  }

  it("atomically finalizes only the reserved upload ID", async () => {
    const id = "finalize-pdf-success";
    const uploadId = "123e4567-e89b-42d3-a456-426614174000";
    await putSession(session(id, { sourceUploadId: uploadId }));

    try {
      const result = await finalizePdfSource(id, {
        uploadId,
        sourceName: "brief.pdf",
        sourceOpenAIFileId: "file-private-source"
      });
      const stored = await getSession(id);

      expect(result.session.answers).toEqual({ sourceName: "brief.pdf" });
      expect(stored?.answers).toMatchObject({
        sourceName: "brief.pdf",
        sourceOpenAIFileId: "file-private-source",
        sourceUploadId: uploadId
      });
    } finally {
      await deleteSession(id);
    }
  });

  it("rejects finalization after a different source wins", async () => {
    const id = "finalize-pdf-conflict";
    const uploadId = "123e4567-e89b-42d3-a456-426614174000";
    await putSession(
      session(id, {
        sourceUploadId: uploadId,
        sourceUrl: "https://example.com/report"
      })
    );

    try {
      await expect(
        finalizePdfSource(id, { uploadId, sourceName: "brief.pdf" })
      ).rejects.toMatchObject({ code: "upload_superseded", status: 409 });
    } finally {
      await deleteSession(id);
    }
  });
});
