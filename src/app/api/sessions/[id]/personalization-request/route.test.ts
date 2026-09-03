import { after, NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { canEditSession } from "@/lib/orchestrator";
import {
  recoverPersonalizationFulfillment,
  runPersonalizationFulfillment
} from "@/lib/personalization-fulfillment";
import {
  addPersonalizationTargets,
  createPersonalizationRequest,
  getPersonalizationRequest
} from "@/lib/personalization-request-store";
import { selectDefaultPersonalizationTargets } from "@/lib/personalization-default-targets";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSession, updateSession } from "@/lib/session-store";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

vi.mock("@/lib/orchestrator", () => ({ canEditSession: vi.fn() }));
vi.mock("@/lib/personalization-fulfillment", () => ({
  recoverPersonalizationFulfillment: vi.fn(),
  runPersonalizationFulfillment: vi.fn()
}));
vi.mock("@/lib/personalization-request-store", () => ({
  addPersonalizationTargets: vi.fn(),
  createPersonalizationRequest: vi.fn(),
  getPersonalizationRequest: vi.fn(),
  toPublicPersonalizationRequest: vi.fn((value) => ({
    id: value.id,
    sessionId: value.sessionId,
    emailMasked: "b***@example.com",
    targets: value.targets,
    status: value.status
  }))
}));
vi.mock("@/lib/personalization-default-targets", () => ({
  selectDefaultPersonalizationTargets: vi.fn(() => [
    { domain: "one.com", role: "Finance leader" },
    { domain: "two.com", role: "Finance leader" },
    { domain: "three.com", role: "Finance leader" }
  ])
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  anonymousClientKey: vi.fn(() => "test-client"),
  enforceRateLimit: vi.fn()
}));
vi.mock("@/lib/session-store", () => ({
  getSession: vi.fn(),
  toPublicSession: vi.fn((value) => value),
  updateSession: vi.fn()
}));
vi.mock("@/lib/preview-lifecycle", () => ({
  canRevealFinalExperience: vi.fn(() => true)
}));

import { GET, PATCH, POST } from "./route";

const id = "baseline-session-id";
const digest = "a".repeat(64);
const context = { params: Promise.resolve({ id }) };
const baseline = {
  id,
  companyDomain: "seller.com",
  answers: { customAudience: "Finance leaders" },
  status: "preview_ready_unclaimed",
  experience: { readiness: "final", artifactRevision: 4, artifactDigest: digest },
  finalArtifact: { readiness: "final", artifactRevision: 4, artifactDigest: digest }
};
const privateRequest = {
  id: "request-id",
  sessionId: id,
  email: "buyer@example.com",
  targets: [],
  baselineArtifactRevision: 4,
  baselineArtifactDigest: digest,
  status: "awaiting_targets"
};

function request(method: "GET" | "POST" | "PATCH", body?: unknown) {
  return new NextRequest(
    `https://preview.example.com/api/sessions/${id}/personalization-request`,
    {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Cookie: `tmn_editor_${id}=editor-token`
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }
  );
}

describe("personalization request API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(canEditSession).mockResolvedValue(true);
    vi.mocked(getSession).mockResolvedValue(baseline as never);
    vi.mocked(updateSession).mockResolvedValue(baseline as never);
    vi.mocked(createPersonalizationRequest).mockResolvedValue(privateRequest as never);
    vi.mocked(addPersonalizationTargets).mockResolvedValue({
      ...privateRequest,
      status: "queued",
      targets: [{ id: "target-1", domain: "one.com", status: "pending" }]
    } as never);
    vi.mocked(getPersonalizationRequest).mockResolvedValue(privateRequest as never);
  });

  it("captures the business email against a saved, read-back final baseline", async () => {
    const response = await POST(request("POST", { email: "buyer@example.com" }), context);
    expect(response.status).toBe(201);
    expect(createPersonalizationRequest).toHaveBeenCalledWith({
      sessionId: id,
      email: "buyer@example.com",
      artifactRevision: 4,
      artifactDigest: digest
    });
    expect(updateSession).toHaveBeenCalledWith(id, expect.any(Function), {
      persist: true
    });
    const body = await response.json();
    expect(body.request.emailMasked).toBe("b***@example.com");
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
    expect(JSON.stringify(body)).not.toContain(digest);
  });

  it("queues exactly the submitted targets with the seller boundary and schedules fulfillment", async () => {
    const targets = [
      { domain: "one.com" },
      { domain: "two.com", role: "CFO" },
      { domain: "three.com" }
    ];
    const response = await PATCH(request("PATCH", { targets }), context);
    expect(response.status).toBe(202);
    expect(addPersonalizationTargets).toHaveBeenCalledWith(id, targets, "seller.com", {
      selectionMode: "manual"
    });
    expect(enforceRateLimit).toHaveBeenCalled();
    const callback = vi.mocked(after).mock.calls[0]?.[0];
    expect(callback).toBeTypeOf("function");
    await (callback as () => Promise<void>)();
    expect(runPersonalizationFulfillment).toHaveBeenCalledWith(id);
  });

  it("selects representative accounts without requiring target input", async () => {
    const response = await PATCH(request("PATCH", { autoSelect: true }), context);
    expect(response.status).toBe(202);
    expect(selectDefaultPersonalizationTargets).toHaveBeenCalledWith({
      requestId: privateRequest.id,
      sellerDomain: "seller.com",
      audience: "Finance leaders"
    });
    expect(addPersonalizationTargets).toHaveBeenCalledWith(
      id,
      [
        { domain: "one.com", role: "Finance leader" },
        { domain: "two.com", role: "Finance leader" },
        { domain: "three.com", role: "Finance leader" }
      ],
      "seller.com",
      { selectionMode: "representative" }
    );
  });

  it("recovers queued work during status polling and keeps the response private", async () => {
    vi.mocked(getPersonalizationRequest).mockResolvedValue({
      ...privateRequest,
      status: "generating"
    } as never);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    const callback = vi.mocked(after).mock.calls[0]?.[0];
    await (callback as () => Promise<void>)();
    expect(recoverPersonalizationFulfillment).toHaveBeenCalledWith(id);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
    expect(JSON.stringify(body)).not.toContain(digest);
  });

  it("does not queue targets when the frozen standard artifact changed", async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...baseline,
      experience: { ...baseline.experience, artifactDigest: "b".repeat(64) }
    } as never);
    const response = await PATCH(
      request("PATCH", {
        targets: [
          { domain: "one.com" },
          { domain: "two.com" },
          { domain: "three.com" }
        ]
      }),
      context
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("personalization_baseline_changed");
    expect(addPersonalizationTargets).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("keeps every operation behind the editor token", async () => {
    vi.mocked(canEditSession).mockResolvedValue(false);
    const response = await POST(request("POST", { email: "buyer@example.com" }), context);
    expect(response.status).toBe(403);
    expect(createPersonalizationRequest).not.toHaveBeenCalled();
  });
});
