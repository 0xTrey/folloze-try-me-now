import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orchestrator", () => ({ canEditSession: vi.fn() }));
vi.mock("@/lib/session-store", () => ({ getSession: vi.fn(), toPublicSession: vi.fn(() => ({ id: "ready-session", companyDomain: "example.com" })) }));
vi.mock("@/lib/personalization-request-store", () => ({ getPersonalizationRequest: vi.fn(), toPublicPersonalizationRequest: vi.fn(() => ({ id: "request-1", status: "ready", targets: [] })) }));
import { canEditSession } from "@/lib/orchestrator";
import { getSession, toPublicSession } from "@/lib/session-store";
import { getPersonalizationRequest } from "@/lib/personalization-request-store";
import { GET } from "./route";

const context = { params: Promise.resolve({ id: "ready-session" }) };
const request = () => new NextRequest("https://preview.example/api/sessions/ready-session/resume", { headers: { cookie: "tmn_editor_ready-session=owner-token" } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ id: "ready-session", editorTokenHash: "private-hash" } as never);
  vi.mocked(canEditSession).mockResolvedValue(true);
  vi.mocked(getPersonalizationRequest).mockResolvedValue(undefined);
});
describe("owner-only experience resume", () => {
  it("returns only public session and request projections with no-store headers", async () => {
    vi.mocked(getPersonalizationRequest).mockResolvedValue({ id: "request-1", email: "private@example.com" } as never);
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ session: { id: "ready-session", companyDomain: "example.com" }, request: { id: "request-1", status: "ready", targets: [] } });
    expect(canEditSession).toHaveBeenCalledWith("ready-session", "owner-token");
  });
  it("rejects a non-owner without projecting session or request data", async () => {
    vi.mocked(canEditSession).mockResolvedValue(false);
    const response = await GET(request(), context);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toMatch(/private-hash|private@example/);
    expect(toPublicSession).not.toHaveBeenCalled();
    expect(getPersonalizationRequest).not.toHaveBeenCalled();
  });
  it("reports expiration without accepting a stale cookie", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(410);
    expect(canEditSession).not.toHaveBeenCalled();
  });
  it("fails closed on a store failure", async () => {
    vi.mocked(getSession).mockRejectedValue(new Error("private internal failure"));
    const response = await GET(request(), context);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private internal failure");
  });
});
