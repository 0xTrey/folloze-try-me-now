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
        brand: { status: "complete", attemptId: "private-attempt-id" },
        audience: { status: "running" },
        story: { status: "pending", inputFingerprint: "private-input-fingerprint" }
      },
      answers: {
        sourceName: "brief.pdf",
        sourceUrl: "https://example.com/private/report?access_token=private-query-token",
        eventSource: "Private customer event details",
        sourceOpenAIFileId: "file-private-source",
        sourceUploadId: "123e4567-e89b-42d3-a456-426614174000",
        sourceUploadReservedAt: "2026-07-30T00:00:00.000Z"
      },
      brand: {
        domain: "servicenow.com",
        companyName: "ServiceNow",
        logoUrl: "https://www.servicenow.com/content/dam/servicenow-assets/images/naas/servicenow-header-logo.svg",
        logoSourceUrl: "https://private-cdn.example/source-logo.svg?token=private-logo-token",
        portableLogo: {
          mediaType: "image/svg+xml",
          encoding: "base64",
          bytesBase64: "cHJpdmF0ZS1sb2dvLWJ5dGVz",
          sha256: "a".repeat(64),
          source: "official-inline-svg"
        },
        imageUrls: ["https://www.servicenow.com/content/dam/servicenow-assets/public/hero.jpg"],
        colors: ["#032D42", "#63DF4E", "#FFFFFF", "#00718F"],
        primaryColor: "#032D42",
        accentColor: "#63DF4E",
        surfaceColor: "#FFFFFF",
        publicTopics: ["Enterprise workflows"],
        sourceUrl: "https://www.servicenow.com/",
        source: "brand-harvester"
      },
      claim: {
        email: "private@example.com",
        emailMasked: "pr•••••@example.com",
        publishStatus: "published",
        emailStatus: "sent",
        follozeBoardId: "private-board-id",
        designerUrl: "https://designer.example/private-board"
      },
      experience: {
        title: "Safe public title",
        eyebrow: "Example",
        headline: "A safe public headline",
        subhead: "A sufficiently detailed safe public subhead.",
        thesisHeadline: "A safe thesis headline",
        thesisBody: "A sufficiently detailed safe thesis body.",
        primaryCta: "Continue",
        audienceLabel: "Business leaders",
        narrativeArc: "What should the team validate next?",
        sections: [],
        signalLabels: [],
        closingHeadline: "Choose the next useful step",
        closingBody: "A sufficiently detailed closing body.",
        html: "<!doctype html><script>private generated artifact</script>",
        generationSource: "deterministic-fallback",
        artifactRevision: 2,
        artifactDigest: "c".repeat(64)
      },
      audienceSuggestions: [],
      events: [{ name: "internal_failure", at: "2026-07-30T00:00:00.000Z", meta: { requestId: "private-request-id" } }]
    };

    const projected = toPublicSession(session);
    expect(projected).not.toHaveProperty("editorTokenHash");
    expect(projected).not.toHaveProperty("traceId");
    expect(projected.supportRef).toMatch(/^TMN-/);
    expect(projected.answers).toEqual({
      sourceName: "Uploaded PDF",
      sourceUrl: "https://source-provided.invalid/",
      eventSource: "Event details added"
    });
    expect(JSON.stringify(projected)).not.toContain("file-private-source");
    expect(JSON.stringify(projected)).not.toContain("123e4567-e89b-42d3-a456-426614174000");
    expect(JSON.stringify(projected)).not.toContain("private@example.com");
    expect(JSON.stringify(projected)).not.toContain("private-board-id");
    expect(JSON.stringify(projected)).not.toContain("designer.example");
    expect(JSON.stringify(projected)).not.toContain("private generated artifact");
    expect(JSON.stringify(projected)).not.toContain("private-attempt-id");
    expect(JSON.stringify(projected)).not.toContain("private-input-fingerprint");
    expect(JSON.stringify(projected)).not.toContain("private-request-id");
    expect(JSON.stringify(projected)).not.toContain("private-query-token");
    expect(JSON.stringify(projected)).not.toContain("Private customer event details");
    expect(JSON.stringify(projected)).not.toContain("private-logo-token");
    expect(JSON.stringify(projected)).not.toContain("cHJpdmF0ZS1sb2dvLWJ5dGVz");
    expect(projected).not.toHaveProperty("events");
    expect(projected.experience).toEqual({
      ready: true,
      title: "Safe public title",
      headline: "A safe public headline",
      generationSource: "deterministic-fallback",
      artifactRevision: 2
    });
    expect(projected.claim).toEqual({
      publishStatus: "published",
      emailStatus: "sent"
    });
    expect(projected.brand).toEqual({
      domain: "servicenow.com",
      companyName: "ServiceNow",
      logoUrl: "https://www.servicenow.com/content/dam/servicenow-assets/images/naas/servicenow-header-logo.svg",
      colors: ["#032D42", "#63DF4E", "#FFFFFF", "#00718F"],
      primaryColor: "#032D42",
      accentColor: "#63DF4E",
      surfaceColor: "#FFFFFF",
      source: "brand-harvester"
    });
    expect(projected.brand).not.toHaveProperty("sourceUrl");
    expect(projected.brand).not.toHaveProperty("imageUrls");
    expect(projected.brand).not.toHaveProperty("publicTopics");
  });
});

describe("PDF source finalization", () => {
  function session(
    id: string,
    answers: TryMeSession["answers"],
    useCase: TryMeSession["useCase"] = "content"
  ): TryMeSession {
    return {
      id,
      editorTokenHash: "private-editor-hash",
      useCase,
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
        sourceTitle: "Buyer Automation Guide",
        sourceOpenAIFileId: "file-private-source"
      });
      const stored = await getSession(id);

      expect(result.session.answers).toEqual({
        sourceName: "Uploaded PDF",
        sourceTitle: "Buyer Automation Guide",
        sourceConfirmed: true
      });
      expect(stored?.answers).toMatchObject({
        sourceName: "brief.pdf",
        sourceTitle: "Buyer Automation Guide",
        sourceOpenAIFileId: "file-private-source",
        sourceUploadId: uploadId,
        sourceConfirmed: true
      });
      expect(stored?.sourceConfirmation).toMatchObject({
        status: "confirmed",
        sourceKind: "uploaded-pdf",
        provenance: "user-submitted"
      });
    } finally {
      await deleteSession(id);
    }
  });

  it.each([
    {
      useCase: "abm" as const,
      answers: {
        targetDomain: "buyer.example",
        audience: "Platform leaders",
        objective: "Start a working session",
        promotedOffer: "Folloze Buyer Experience Platform"
      }
    },
    {
      useCase: "campaign" as const,
      answers: {
        audience: "Demand generation leaders",
        objective: "Increase qualified engagement",
        campaignType: "demand" as const,
        promotedOffer: "Folloze Buyer Experience Platform"
      }
    }
  ])("adds optional PDF context to $useCase without changing its identity", async ({ useCase, answers }) => {
    const id = `finalize-pdf-${useCase}`;
    const uploadId = "123e4567-e89b-42d3-a456-426614174000";
    await putSession(session(id, { ...answers, sourceUploadId: uploadId }, useCase));

    try {
      const result = await finalizePdfSource(id, {
        uploadId,
        sourceName: "context.pdf",
        sourceTitle: "Approved campaign context",
        sourceOpenAIFileId: "file-private-context"
      });
      const stored = await getSession(id);

      expect(result.shouldGenerate).toBe(true);
      expect(stored).toMatchObject({
        useCase,
        companyDomain: "example.com",
        answers: {
          ...answers,
          sourceName: "context.pdf",
          sourceTitle: "Approved campaign context",
          sourceOpenAIFileId: "file-private-context",
          sourceUploadId: uploadId,
          sourceConfirmed: true
        },
        sourceConfirmation: {
          status: "confirmed",
          sourceKind: "uploaded-pdf",
          provenance: "user-submitted"
        }
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
