import { afterEach, describe, expect, it, vi } from "vitest";

import { apiError, logServerError } from "@/lib/http";
import { RateLimitUnavailableError } from "@/lib/rate-limit";

describe("structured error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts private source identifiers and visitor content", () => {
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
    expect(logged).toContain("[redacted-file-id]");
    expect(logged).toContain("[redacted-email]");
    expect(logged).toContain("[redacted-url]");
    expect(logged).not.toContain("file-privateSource1234");
    expect(logged).not.toContain("buyer@example.com");
  });

  it("redacts modern OpenAI secret formats while preserving non-secret text", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const standardKey = `sk-${"a".repeat(24)}`;
    const projectKey = `sk-proj-${"b".repeat(24)}`;
    const nonSecretText = "provider retry kept sk-short and sk-proj-demo visible";

    logServerError(new Error(`${nonSecretText}: ${standardKey}`), {
      operation: "test",
      details: { providerMessage: `Project authentication failed for ${projectKey}` }
    });

    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged.match(/\[redacted-secret\]/g)).toHaveLength(2);
    expect(logged).not.toContain(standardKey);
    expect(logged).not.toContain(projectKey);
    expect(logged).toContain(nonSecretText);
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
});
