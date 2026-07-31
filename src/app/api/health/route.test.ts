import { describe, expect, it } from "vitest";

import { isProductionCapable, productionReadiness } from "@/lib/readiness";

import { GET } from "./route";

const connectedServices = {
  databaseConnected: true,
  openAIConnected: true,
  distributedRateLimits: true,
  follozePublishReady: true,
  resendConnected: true
};

describe("health production capability", () => {
  it("exposes the limiter mode and makes distributed protection a required gate", async () => {
    const response = GET();
    const health = await response.json();

    expect(health.services.rateLimiter).toEqual({
      mode: "memory-local",
      distributed: false
    });
    expect(health.readiness.required.distributedRateLimits).toBe(false);
    expect(health.readiness.blockers).toContain("distributedRateLimits");
  });

  it("accepts the Blob CAS session store when every required service is connected", () => {
    expect(
      isProductionCapable({ sessionStoreMode: "vercel-blob", ...connectedServices })
    ).toBe(true);
  });

  it("rejects Redis-only sessions even when every other service is connected", () => {
    expect(
      isProductionCapable({ sessionStoreMode: "upstash-redis", ...connectedServices })
    ).toBe(false);
  });

  it("rejects process-memory sessions", () => {
    expect(
      isProductionCapable({ sessionStoreMode: "memory-demo", ...connectedServices })
    ).toBe(false);
  });

  it("treats Folloze publication and transactional email as optional V1 integrations", () => {
    expect(
      isProductionCapable({
        sessionStoreMode: "vercel-blob",
        ...connectedServices,
        follozePublishReady: false,
        resendConnected: false
      })
    ).toBe(true);
  });

  it("still requires durable lead storage and OpenAI generation", () => {
    expect(
      isProductionCapable({
        sessionStoreMode: "vercel-blob",
        ...connectedServices,
        databaseConnected: false
      })
    ).toBe(false);
    expect(
      isProductionCapable({
        sessionStoreMode: "vercel-blob",
        ...connectedServices,
        distributedRateLimits: false
      })
    ).toBe(false);
    expect(
      isProductionCapable({
        sessionStoreMode: "vercel-blob",
        ...connectedServices,
        openAIConnected: false
      })
    ).toBe(false);
  });

  it("uses durable lead capability rather than requiring a specific database vendor", () => {
    expect(
      isProductionCapable({
        sessionStoreMode: "vercel-blob",
        ...connectedServices,
        databaseConnected: false,
        durableLeadStore: true
      })
    ).toBe(true);
    expect(
      isProductionCapable({
        sessionStoreMode: "vercel-blob",
        ...connectedServices,
        durableLeadStore: false
      })
    ).toBe(false);
  });

  it("reports required blockers separately from optional Folloze and Resend integrations", () => {
    expect(
      productionReadiness({
        sessionStoreMode: "vercel-blob",
        durableLeadStore: true,
        openAIConnected: true,
        distributedRateLimits: true,
        follozePublishReady: false,
        resendConnected: false
      })
    ).toEqual({
      productionCapable: true,
      required: {
        durableSessions: true,
        durableLeads: true,
        openAI: true,
        distributedRateLimits: true
      },
      optional: { follozePublication: false, transactionalEmail: false },
      blockers: []
    });
  });
});
