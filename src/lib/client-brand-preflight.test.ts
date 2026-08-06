import { describe, expect, it, vi } from "vitest";

import type { PublicTryMeSession } from "@/lib/types";

import {
  SELLER_BRAND_PREFLIGHT_DELAY_MS,
  SellerBrandPreflightCoordinator,
  scheduleSellerBrandPreflight,
  sellerBrandPreflightKey
} from "./client-brand-preflight";

function session(id: string): PublicTryMeSession {
  return {
    id,
    supportRef: "TMN-PREFLIGHT",
    useCase: "abm",
    companyDomain: "acme.com",
    status: "collecting",
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
    temporaryUrl: `https://example.test/e/${id}`,
    revision: 1,
    stages: {
      brand: { status: "running" },
      audience: { status: "running" },
      story: { status: "pending" }
    },
    answers: {},
    audienceSuggestions: []
  };
}

describe("SellerBrandPreflightCoordinator", () => {
  it("uses a deliberate idle delay before starting browser-side preflight", () => {
    expect(SELLER_BRAND_PREFLIGHT_DELAY_MS).toBe(750);
  });

  it("cancels a scheduled preflight when the typed domain is superseded", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const cancel = scheduleSellerBrandPreflight(start);

    vi.advanceTimersByTime(500);
    cancel();
    vi.advanceTimersByTime(500);

    expect(start).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keys preflight work by both experience path and normalized domain", () => {
    expect(sellerBrandPreflightKey("abm", "acme.com")).toBe("abm:acme.com");
    expect(sellerBrandPreflightKey("campaign", "acme.com")).toBe("campaign:acme.com");
  });

  it("reuses one in-flight session creation for warmup and confirmation", async () => {
    let resolveStart!: (value: PublicTryMeSession) => void;
    const start = vi.fn(() => new Promise<PublicTryMeSession>((resolve) => {
      resolveStart = resolve;
    }));
    const refreshed = { ...session("session-1"), brand: {
      domain: "acme.com",
      companyName: "Acme",
      colors: ["#111111", "#ffffff"],
      primaryColor: "#111111",
      accentColor: "#ffffff",
      surfaceColor: "#ffffff",
      source: "brand-harvester" as const
    } };
    const refresh = vi.fn(async () => refreshed);
    const coordinator = new SellerBrandPreflightCoordinator(start, refresh);

    const warming = coordinator.warm("abm", "acme.com");
    const confirming = coordinator.confirm("abm", "acme.com");
    resolveStart(session("session-1"));

    await expect(warming).resolves.toMatchObject({ id: "session-1" });
    await expect(confirming).resolves.toBe(refreshed);
    expect(start).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("session-1");
  });

  it("retries a failed warmup when the visitor explicitly confirms", async () => {
    const start = vi.fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(session("session-2"));
    const refresh = vi.fn(async () => session("session-2"));
    const coordinator = new SellerBrandPreflightCoordinator(start, refresh);

    await expect(coordinator.warm("campaign", "acme.com")).rejects.toThrow("temporary network failure");
    await expect(coordinator.confirm("campaign", "acme.com")).resolves.toMatchObject({ id: "session-2" });
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("keeps the created session when the freshness read is interrupted", async () => {
    const created = session("session-3");
    const coordinator = new SellerBrandPreflightCoordinator(
      vi.fn(async () => created),
      vi.fn(async () => { throw new Error("offline"); })
    );

    await expect(coordinator.confirm("content", "acme.com")).resolves.toBe(created);
  });
});
