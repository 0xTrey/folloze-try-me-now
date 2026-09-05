import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyBotToken } from "@/lib/bot-protection";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; vi.restoreAllMocks(); });

describe("verifyBotToken", () => {
  it("reports disabled explicitly and does not call the provider", async () => {
    process.env.TURNSTILE_ENABLED = "false";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await verifyBotToken("token")).toEqual({ status: "disabled", success: false, reason: "turnstile_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when enabled without a secret", async () => {
    process.env.TURNSTILE_ENABLED = "true";
    expect(await verifyBotToken("token")).toEqual({ status: "misconfigured", success: false, reason: "turnstile_secret_missing" });
  });

  it("posts only bounded token data to the fixed provider and checks action and hostname", async () => {
    process.env.TURNSTILE_ENABLED = "true";
    process.env.TURNSTILE_SECRET_KEY = "server-secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAME = "app.example";
    process.env.TURNSTILE_EXPECTED_ACTION = "session_create";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: "app.example", action: "session_create" }), { status: 200 }));
    expect(await verifyBotToken("client-token", "session_create")).toEqual({ status: "verified", success: true });
    expect(fetchMock).toHaveBeenCalledWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", expect.objectContaining({ method: "POST" }));
  });

  it("rejects oversized tokens before network access", async () => {
    process.env.TURNSTILE_ENABLED = "true";
    process.env.TURNSTILE_SECRET_KEY = "server-secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAME = "app.example";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await verifyBotToken("x".repeat(2049));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("turnstile_token_invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
