import { NextRequest, after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canEditSession,
  duplicateSession,
  patchSessionAnswers,
  patchSessionWorkspace,
  recordPreviewInteraction
} from "@/lib/orchestrator";
import { enforceRateLimit } from "@/lib/rate-limit";

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
  runStoryStage: vi.fn(),
  runTargetBrandStage: vi.fn()
}));

vi.mock("@/lib/rate-limit", () => ({
  anonymousClientKey: vi.fn(() => "test-client"),
  enforceRateLimit: vi.fn()
}));

vi.mock("@/lib/session-store", () => ({
  getSession: vi.fn(),
  toPublicSession: vi.fn()
}));

import { PATCH, POST } from "./route";

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
    vi.mocked(canEditSession).mockResolvedValue(true);
    vi.mocked(patchSessionAnswers).mockResolvedValue({
      session: publicSession,
      shouldGenerate: false
    } as never);
    vi.mocked(patchSessionWorkspace).mockResolvedValue({
      session: publicSession,
      shouldGenerate: false
    } as never);
    vi.mocked(recordPreviewInteraction).mockResolvedValue(publicSession as never);
    vi.mocked(duplicateSession).mockResolvedValue({
      session: { ...publicSession, id: "new-version-id" },
      editorToken: "new-editor-token",
      shouldGenerate: true
    } as never);
  });

  it("preserves the legacy raw answer PATCH", async () => {
    const response = await PATCH(
      request("PATCH", { audience: "Network operations leaders", objective: "Book a meeting" }),
      context
    );

    expect(response.status).toBe(200);
    expect(patchSessionAnswers).toHaveBeenCalledWith(sessionId, {
      audience: "Network operations leaders",
      objective: "Book a meeting"
    });
    expect(patchSessionWorkspace).not.toHaveBeenCalled();
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
    expect(duplicateSession).toHaveBeenCalledWith(sessionId, {
      operation: "duplicate",
      mode: "version",
      label: "Executive option"
    });
    expect(duplicateResponse.headers.get("set-cookie")).toContain(
      "tmn_editor=new-version-id.new-editor-token"
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
});
