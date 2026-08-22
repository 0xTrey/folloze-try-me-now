import { NextRequest, after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canEditSession,
  duplicateSession,
  patchSessionAnswers,
  patchSessionWorkspace,
  recordPreviewInteraction,
  runPreviewEnrichmentWave
} from "@/lib/orchestrator";
import { enforceRateLimit } from "@/lib/rate-limit";
import { supportRefForTraceId } from "@/lib/observability";
import { getSession } from "@/lib/session-store";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

vi.mock("@/lib/orchestrator", () => ({
  canEditSession: vi.fn(),
  duplicateSession: vi.fn(),
  patchSessionAnswers: vi.fn(),
  patchSessionWorkspace: vi.fn(),
  recordPreviewInteraction: vi.fn(),
  recoverSessionWork: vi.fn(),
  runPreviewEnrichmentWave: vi.fn(),
  runStoryStage: vi.fn(),
  runTargetBrandStage: vi.fn()
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  anonymousClientKey: vi.fn(() => "test-client"),
  enforceRateLimit: vi.fn()
}));

vi.mock("@/lib/session-store", () => ({
  getSession: vi.fn(),
  toPublicSession: vi.fn()
}));

import { GET, PATCH, POST } from "./route";

const sessionId = "session-workspace-route";

function request(method: "PATCH" | "POST", body: unknown, includeCookie = true): NextRequest {
  return new NextRequest(`https://preview.example.com/api/sessions/${sessionId}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(includeCookie ? { Cookie: `tmn_editor=${sessionId}.editor-token` } : {})
    },
    body: JSON.stringify(body)
  });
}

const context = { params: Promise.resolve({ id: sessionId }) };
const publicSession = {
  id: sessionId,
  status: "collecting",
  answers: {},
  audienceSuggestions: []
};

describe("session workspace API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(canEditSession).mockResolvedValue(true);
    vi.mocked(patchSessionAnswers).mockResolvedValue({
      session: publicSession,
      shouldGenerate: false,
      traceId: "private-source-trace"
    } as never);
    vi.mocked(patchSessionWorkspace).mockResolvedValue({
      session: publicSession,
      shouldGenerate: false,
      traceId: "private-source-trace"
    } as never);
    vi.mocked(recordPreviewInteraction).mockResolvedValue(publicSession as never);
    vi.mocked(duplicateSession).mockResolvedValue({
      session: { ...publicSession, id: "new-version-id" },
      editorToken: "new-editor-token",
      shouldGenerate: true,
      traceId: "private-child-trace"
    } as never);
  });

  it("returns a correlated 410 after the anonymous preview has expired", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const response = await GET(
      new NextRequest(`https://preview.example.com/api/sessions/${sessionId}`),
      context
    );
    const body = (await response.json()) as { code: string; requestId: string };

    expect(response.status).toBe(410);
    expect(body.code).toBe("expired");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("preserves the legacy raw answer PATCH", async () => {
    const response = await PATCH(
      request("PATCH", { audience: "Network operations leaders", objective: "Book a meeting" }),
      context
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-support-ref")).toBe(
      supportRefForTraceId("private-source-trace")
    );
    expect(patchSessionAnswers).toHaveBeenCalledWith(sessionId, {
      audience: "Network operations leaders",
      objective: "Book a meeting"
    });
    expect(patchSessionWorkspace).not.toHaveBeenCalled();
  });

  it("starts source intelligence as soon as a public content URL is submitted", async () => {
    const sourceUrl = "https://example.com/reports/automation-guide";
    const response = await PATCH(request("PATCH", { sourceUrl }), context);

    expect(response.status).toBe(200);
    const sourceCallback = vi.mocked(after).mock.calls
      .map(([callback]) => callback)
      .find((callback) => typeof callback === "function");
    expect(sourceCallback).toBeTypeOf("function");
    await (sourceCallback as () => Promise<void>)();
    expect(runPreviewEnrichmentWave).toHaveBeenCalledWith(sessionId, { includeStory: false });
  });

  it("starts offer intelligence as soon as a campaign product URL is submitted", async () => {
    const offerSourceUrl = "https://example.com/products/automation-cloud";
    const response = await PATCH(request("PATCH", { offerSourceUrl }), context);

    expect(response.status).toBe(200);
    const sourceCallback = vi.mocked(after).mock.calls
      .map(([callback]) => callback)
      .find((callback) => typeof callback === "function");
    expect(sourceCallback).toBeTypeOf("function");
    await (sourceCallback as () => Promise<void>)();
    expect(runPreviewEnrichmentWave).toHaveBeenCalledWith(sessionId, { includeStory: false });
  });

  it("accepts one coherent workspace mutation for creative controls", async () => {
    const body = {
      operation: "update-workspace",
      answers: {
        messageBelief: "Cisco can govern automation across connected infrastructure.",
        ctaType: "book-meeting",
        ctaStyle: "outline",
        toneVariant: "technical"
      },
      evidenceDecisions: [{ id: "evidence_network", disposition: "pinned" }],
      sourceConfirmation: "confirmed",
      blockControls: [{ id: "hero", locked: true }]
    };
    const response = await PATCH(request("PATCH", body), context);

    expect(response.status).toBe(200);
    expect(patchSessionWorkspace).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        answers: expect.objectContaining({ ctaType: "book-meeting" }),
        sourceConfirmation: "confirmed"
      })
    );
    expect(patchSessionAnswers).not.toHaveBeenCalled();
  });

  it("records preview telemetry and creates versions through the same operation endpoint", async () => {
    const interactionResponse = await POST(
      request("POST", {
        operation: "preview-interaction",
        event: "lens-selected",
        elementId: "decision-lens-2"
      }),
      context
    );
    expect(interactionResponse.status).toBe(200);
    expect(recordPreviewInteraction).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ event: "lens-selected" })
    );
    expect(enforceRateLimit).toHaveBeenCalledWith(
      `operation:${sessionId}:test-client`,
      120,
      3600
    );

    const duplicateResponse = await POST(
      request("POST", { operation: "duplicate", mode: "version", label: "Executive option" }),
      context
    );
    expect(duplicateResponse.status).toBe(201);
    expect(duplicateResponse.headers.get("x-support-ref")).toBe(
      supportRefForTraceId("private-child-trace")
    );
    expect(duplicateSession).toHaveBeenCalledWith(sessionId, {
      operation: "duplicate",
      mode: "version",
      label: "Executive option"
    });
    expect(duplicateResponse.headers.get("set-cookie")).toContain(
      "tmn_editor_new-version-id=new-editor-token"
    );
    expect(after).toHaveBeenCalled();
  });

  it("keeps every mutation behind the editor-token boundary", async () => {
    vi.mocked(canEditSession).mockResolvedValue(false);
    const response = await PATCH(request("PATCH", { objective: "Book a meeting" }, false), context);

    expect(response.status).toBe(403);
    expect(patchSessionAnswers).not.toHaveBeenCalled();
    expect(patchSessionWorkspace).not.toHaveBeenCalled();
  });

  it("uses the session-scoped cookie when legacy and current tabs coexist", async () => {
    const scopedRequest = new NextRequest(
      `https://preview.example.com/api/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `tmn_editor=other-session.legacy-token; tmn_editor_${sessionId}=scoped-token`
        },
        body: JSON.stringify({ objective: "Book a meeting" })
      }
    );

    const response = await PATCH(scopedRequest, context);

    expect(response.status).toBe(200);
    expect(canEditSession).toHaveBeenCalledWith(sessionId, "scoped-token");
  });
});
