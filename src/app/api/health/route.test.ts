import { describe, expect, it } from "vitest";

import { isProductionCapable } from "@/lib/readiness";

const connectedServices = {
  databaseConnected: true,
  openAIConnected: true,
  follozePublishReady: true,
  resendConnected: true
};

describe("health production capability", () => {
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
});
