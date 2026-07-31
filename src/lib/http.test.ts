import { afterEach, describe, expect, it, vi } from "vitest";

import { logServerError } from "@/lib/http";

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
});
