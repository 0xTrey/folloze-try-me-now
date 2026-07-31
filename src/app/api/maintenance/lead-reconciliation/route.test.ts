import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listLeadsNeedingReconciliation } from "@/lib/lead-store";
import { reconcileLeadSession } from "@/lib/orchestrator";

vi.mock("@/lib/lead-store", () => ({
  leadStoreMode: "neon-postgres",
  listLeadsNeedingReconciliation: vi.fn()
}));

vi.mock("@/lib/orchestrator", () => ({
  reconcileLeadSession: vi.fn()
}));

import { GET } from "./route";

function request(authorization?: string) {
  return new NextRequest("https://preview.example.com/api/maintenance/lead-reconciliation", {
    headers: authorization ? { Authorization: authorization } : undefined
  });
}

describe("lead reconciliation maintenance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it.each([undefined, "Bearer wrong-secret"])(
    "fails closed without the exact cron bearer secret",
    async (authorization) => {
      const response = await GET(request(authorization));
      const body = (await response.json()) as { code: string; requestId: string };

      expect(response.status).toBe(401);
      expect(body.code).toBe("cron_unauthorized");
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(listLeadsNeedingReconciliation).not.toHaveBeenCalled();
      expect(reconcileLeadSession).not.toHaveBeenCalled();
    }
  );

  it("reconciles every pending lead and reports aggregate outcomes only", async () => {
    vi.mocked(listLeadsNeedingReconciliation).mockResolvedValue([
      "session-reconciled",
      "session-stale",
      "session-failed"
    ]);
    vi.mocked(reconcileLeadSession)
      .mockResolvedValueOnce("reconciled")
      .mockResolvedValueOnce("stale")
      .mockRejectedValueOnce(new Error("session store unavailable"));

    const response = await GET(request("Bearer test-cron-secret"));
    const body = (await response.json()) as Record<string, number | boolean>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      scanned: 3,
      reconciled: 1,
      stale: 1,
      failed: 1
    });
    expect(reconcileLeadSession).toHaveBeenCalledTimes(3);
    const infoLog = String(vi.mocked(console.info).mock.calls[0]?.[0]);
    expect(infoLog).toContain('"scanned":3');
    expect(infoLog).not.toContain("session-reconciled");
    expect(infoLog).not.toContain("session-stale");
  });

  it("returns a correlated 500 when the ledger scan fails", async () => {
    vi.mocked(listLeadsNeedingReconciliation).mockRejectedValue(new Error("database unavailable"));

    const response = await GET(request("Bearer test-cron-secret"));
    const body = (await response.json()) as { code: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe("internal_error");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain(
      "scheduled_lead_reconciliation"
    );
  });
});
