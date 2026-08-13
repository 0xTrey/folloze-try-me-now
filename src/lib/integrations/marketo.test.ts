import { afterEach, describe, expect, it, vi } from "vitest";

async function integration(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./marketo");
}

const session = {
  id: "session_12345678", useCase: "abm", companyDomain: "seller.example", answers: {
    targetDomain: "target.example", campaignType: "product", ctaType: "book-meeting"
  }, analytics: { visitorId: "tmv_1234567890abcdef", browserSessionId: "tmb_1234567890abcdef", utm: { source: "linkedin" } },
  previewAnalytics: { totalInteractions: 4, counts: {} }
} as never;

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Marketo lead sync", () => {
  it("does not make a network call while disabled", async () => {
    const { syncMarketoLead } = await integration({ MARKETO_MODE: "disabled" });
    const fetcher = vi.fn();
    await expect(syncMarketoLead({ email: "buyer@company.com", session, fetcher })).resolves.toBe("disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends allowlisted claim metadata and survives a custom-activity failure", async () => {
    const { syncMarketoLead } = await integration({
      MARKETO_MODE: "sync", MARKETO_REST_ENDPOINT: "https://123-ABC-456.mktorest.com",
      MARKETO_CLIENT_ID: "client", MARKETO_CLIENT_SECRET: "secret", MARKETO_CUSTOM_ACTIVITY_TYPE_ID: "1001"
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ id: 42 }] })))
      .mockResolvedValue(new Response(JSON.stringify({ success: false })));
    await expect(syncMarketoLead({ email: "buyer@company.com", session, fetcher })).resolves.toBe("activity-fallback");
    expect(fetcher).toHaveBeenCalledTimes(4);
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(body.input[0]).toMatchObject({ email: "buyer@company.com", tryMeUtmSource: "linkedin", tryMeEngagementCount: 4 });
    expect(JSON.stringify(body)).not.toContain("html");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
