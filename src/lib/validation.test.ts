import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiResponseError,
  MAX_PDF_BYTES,
  PDF_UPLOAD_REJECTED_MESSAGE,
  readJsonResponse,
  validatePdfFile
} from "@/lib/client-response";
import { apiError } from "@/lib/http";
import { assertBusinessEmail, maskEmail, normalizeDomain } from "@/lib/validation";

afterEach(() => vi.restoreAllMocks());

describe("normalizeDomain", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["HTTPS://WWW.Acme.com/", "acme.com"],
    ["  subdomain.acme.co.uk  ", "subdomain.acme.co.uk"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["localhost", "127.0.0.1", "https://user:pass@acme.com", "acme.com:8443", "not a domain"])(
    "rejects unsafe or non-company hostname %s",
    (input) => {
      expect(() => normalizeDomain(input)).toThrow();
    }
  );
});

describe("business email claim", () => {
  it("normalizes business email and masks it for client display", () => {
    const email = assertBusinessEmail("  Trey@Folloze.com ");
    expect(email).toBe("trey@folloze.com");
    expect(maskEmail(email)).toBe("tr••@folloze.com");
  });

  it.each(["person@gmail.com", "person@outlook.com", "person@proton.me"])(
    "rejects consumer mailbox %s",
    (email) => {
      expect(() => assertBusinessEmail(email)).toThrow("business email");
    }
  );
});

describe("client API responses", () => {
  it("turns a plain-text 413 into a useful upload error instead of a JSON SyntaxError", async () => {
    const response = new Response("Request Entity Too Large", {
      status: 413,
      headers: { "Content-Type": "text/plain" }
    });

    await expect(readJsonResponse(response, "Upload failed.")).rejects.toMatchObject({
      name: "ApiResponseError",
      status: 413,
      code: "http_413",
      message: PDF_UPLOAD_REJECTED_MESSAGE
    });
  });

  it("preserves a structured API error and request ID", async () => {
    const response = Response.json(
      { error: "Check that field.", code: "invalid_input", requestId: "request-123" },
      { status: 400 }
    );

    await expect(readJsonResponse(response)).rejects.toEqual(
      expect.objectContaining<ApiResponseError>({
        name: "ApiResponseError",
        status: 400,
        code: "invalid_input",
        requestId: "request-123",
        message: "Check that field."
      })
    );
  });

  it("reports an unreadable successful response without exposing parser output", async () => {
    await expect(readJsonResponse(new Response("not-json"))).rejects.toThrow(
      "The server returned an unreadable response. Please try again."
    );
  });
});

describe("PDF validation", () => {
  it("accepts a PDF with the correct extension, type, size, and signature", async () => {
    const file = new File(["%PDF-1.7\nvalid"], "brief.pdf", { type: "application/pdf" });
    await expect(validatePdfFile(file)).resolves.toBeUndefined();
  });

  it("rejects a PDF larger than the advertised 10 MB limit", async () => {
    const file = new File([new Uint8Array(MAX_PDF_BYTES + 1)], "large.pdf", {
      type: "application/pdf"
    });
    await expect(validatePdfFile(file)).rejects.toThrow("larger than the 10 MB");
  });

  it.each([
    [new File(["%PDF-1.7"], "renamed.txt", { type: "application/pdf" }), "PDF files only"],
    [new File(["not a pdf"], "renamed.pdf", { type: "application/pdf" }), "not a valid PDF"]
  ])("rejects invalid PDF input", async (file, message) => {
    await expect(validatePdfFile(file)).rejects.toThrow(message);
  });
});

describe("server error logging", () => {
  it("returns a correlated request ID and redacts sensitive message content", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiError(
      new Error("Could not process secret.pdf for person@example.com from https://example.com/private"),
      {
        route: "/api/sessions/[id]/upload",
        method: "POST",
        sessionId: "session-123",
        operation: "pdf_upload"
      }
    );
    const body = (await response.json()) as { requestId: string };
    const logged = String(errorLog.mock.calls[0]?.[0]);

    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(logged).toContain(body.requestId);
    expect(logged).toContain('"operation":"pdf_upload"');
    expect(logged).toContain("[redacted-pdf]");
    expect(logged).toContain("[redacted-email]");
    expect(logged).toContain("[redacted-url]");
    expect(logged).not.toContain("secret.pdf");
    expect(logged).not.toContain("person@example.com");
    expect(logged).not.toContain("example.com/private");
  });
});
