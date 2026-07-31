import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { canEditSession, claimSession } from "@/lib/orchestrator";

vi.mock("@/lib/orchestrator", () => ({
  canEditSession: vi.fn(),
  claimSession: vi.fn()
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  anonymousClientKey: vi.fn(() => "claim-test-client"),
  enforceRateLimit: vi.fn()
}));

import { POST } from "./route";

const id = "claim-route-session";
const context = { params: Promise.resolve({ id }) };

function request(body: unknown, cookie = `tmn_editor_${id}=scoped-editor-token`) {
  return new NextRequest(`https://preview.example.com/api/sessions/${id}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/sessions/[id]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(canEditSession).mockResolvedValue(true);
    vi.mocked(claimSession).mockResolvedValue({
      session: { id, status: "claimed" },
      emailDelivery: "skipped",
      publishMode: "preview-only"
    } as never);
  });

  it.each([
    {},
    { email: "person@gmail.com" },
    { email: "person@mailinator.com" }
  ])("rejects %s email before the lead workflow can run", async (body) => {
    const response = await POST(request(body), context);

    expect(response.status).toBe(400);
    expect(claimSession).not.toHaveBeenCalled();
  });

  it("starts exactly one save workflow for a valid business email", async () => {
    const response = await POST(request({ email: "Buyer@Folloze.com" }), context);

    expect(response.status).toBe(200);
    expect(canEditSession).toHaveBeenCalledWith(id, "scoped-editor-token");
    expect(claimSession).toHaveBeenCalledOnce();
    expect(claimSession).toHaveBeenCalledWith(id, "buyer@folloze.com");
  });

  it("keeps pre-deploy legacy editor cookies readable", async () => {
    const response = await POST(
      request({ email: "buyer@folloze.com" }, `tmn_editor=${id}.legacy-token`),
      context
    );

    expect(response.status).toBe(200);
    expect(canEditSession).toHaveBeenCalledWith(id, "legacy-token");
  });
});
