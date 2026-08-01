import { afterEach, describe, expect, it, vi } from "vitest";

import { apiError, HttpError, logServerError, startServerOperation } from "@/lib/http";
import { RateLimitUnavailableError } from "@/lib/rate-limit";

describe("structured error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never serializes provider error messages with private source identifiers", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logServerError(
      new Error(
        "file-privateSource1234 failed for buyer@example.com at https://example.com/brief.pdf"
      ),
      {
        operation: "test",
        details: { providerMessage: "Could not read file-privateSource1234" }
      }
    );

    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged).not.toContain("file-privateSource1234");
    expect(logged).not.toContain("buyer@example.com");
    expect(logged).not.toContain("example.com");
    expect(logged).not.toContain("message");
  });

  it("never serializes provider messages containing modern OpenAI secrets", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const standardKey = `sk-${"a".repeat(24)}`;
    const projectKey = `sk-proj-${"b".repeat(24)}`;
    const nonSecretText = "provider retry kept sk-short and sk-proj-demo visible";

    logServerError(new Error(`${nonSecretText}: ${standardKey}`), {
      operation: "test",
      details: { providerMessage: `Project authentication failed for ${projectKey}` }
    });

    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged).not.toContain(standardKey);
    expect(logged).not.toContain(projectKey);
    expect(logged).not.toContain(nonSecretText);
    expect(logged).not.toContain("providerMessage");
  });

  it("fails closed with a retryable 503 when distributed request protection is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = apiError(new RateLimitUnavailableError(), {
      route: "/api/sessions",
      method: "POST"
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      code: "request_protection_unavailable"
    });
  });

  it("correlates successful requests without logging the public session locator", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const trace = startServerOperation({
      route: "/api/sessions/[id]",
      method: "PATCH",
      sessionId: "public-session-locator",
      operation: "update_session"
    });
    trace.setTraceId("private-trace-1234567890");

    const headers = trace.complete(200, { outcome: "updated" });
    const logs = info.mock.calls.map(([line]) => String(line)).join("\n");

    expect(headers["X-Request-Id"]).toBe(trace.requestId);
    expect(headers["X-Support-Ref"]).toMatch(/^TMN-/);
    expect(logs).toContain(trace.requestId);
    expect(logs).toContain("private-trace-1234567890");
    expect(logs).not.toContain("public-session-locator");
  });

  it("does not error-log expected client rejections", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = apiError(new HttpError(403, "editor_forbidden", "Not active."), {
      route: "/api/sessions/[id]",
      method: "PATCH",
      sessionId: "public-session-locator"
    });

    expect(response.status).toBe(403);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("public-session-locator");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
