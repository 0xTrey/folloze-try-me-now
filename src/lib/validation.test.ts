import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as dns } from "node:dns";

import {
  ApiResponseError,
  MAX_PDF_BYTES,
  PDF_UPLOAD_REJECTED_MESSAGE,
  readJsonResponse,
  validatePdfFile
} from "@/lib/client-response";
import { apiError } from "@/lib/http";
import {
  answersSchema,
  assertBusinessEmail,
  assertPublicHostname,
  assertSafePublicUrl,
  maskEmail,
  normalizeDomain,
  sessionOperationSchema,
  sessionWorkspacePatchSchema
} from "@/lib/validation";
import { createPinnedLookup } from "@/lib/safe-fetch";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

  it("rejects disposable email domains", () => {
    expect(() => assertBusinessEmail("person@mailinator.com")).toThrow("business email");
    expect(() => assertBusinessEmail("person@inbox.mailinator.com")).toThrow("business email");
  });

  it("allows an explicit server-side email or domain override", () => {
    vi.stubEnv(
      "TRY_ME_BUSINESS_EMAIL_ALLOWLIST",
      " qa@mailinator.com, @gmail.com, EXAMPLE-DISPOSABLE.TEST "
    );

    expect(assertBusinessEmail("QA@Mailinator.com")).toBe("qa@mailinator.com");
    expect(assertBusinessEmail("person@gmail.com")).toBe("person@gmail.com");
    expect(assertBusinessEmail("person@example-disposable.test")).toBe(
      "person@example-disposable.test"
    );
    expect(() => assertBusinessEmail("other@mailinator.com")).toThrow("business email");
  });
});

describe("public URL safety", () => {
  it("resolves the exact requested hostname without stripping www", async () => {
    const lookup = vi
      .spyOn(dns, "lookup")
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);

    await expect(assertSafePublicUrl("https://www.example.com/path")).resolves.toMatchObject({
      hostname: "www.example.com"
    });
    expect(lookup).toHaveBeenCalledWith("www.example.com", { all: true, verbatim: true });
  });

  it.each([
    "100.64.0.1",
    "100.127.255.254",
    "::ffff:10.0.0.1",
    "::ffff:c0a8:101",
    "::a00:1",
    "fe80::1",
    "fe90::1",
    "febf::1",
    "fec0::1",
    "2001::1",
    "2001:db8::1",
    "2002:a00:1::",
    "ff02::1"
  ])("rejects non-public literal address %s", async (address) => {
    await expect(assertPublicHostname(address)).rejects.toThrow("cannot be fetched safely");
  });

  it.each([
    "100.64.0.1",
    "::ffff:172.16.0.1",
    "fe9f::1",
    "3fff::1"
  ])("rejects a hostname when DNS returns non-public address %s", async (address) => {
    vi.spyOn(dns, "lookup").mockResolvedValue(
      [{ address, family: address.includes(":") ? 6 : 4 }] as never
    );

    await expect(assertPublicHostname("www.example.com")).rejects.toThrow(
      "cannot be fetched safely"
    );
  });

  it.each(["8.8.8.8", "2606:4700:4700::1111"])(
    "allows public literal address %s",
    async (address) => {
      await expect(assertPublicHostname(address)).resolves.toBeUndefined();
    }
  );

  it("creates a connection lookup that cannot perform a second DNS resolution", () => {
    const lookup = createPinnedLookup("93.184.216.34", 4);
    const callback = vi.fn();

    lookup("rebound.example", { all: false }, callback);

    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });
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
  it("does not allow clients to inject a server-owned PDF filename", () => {
    expect(() => answersSchema.parse({ sourceName: "unprocessed.pdf" })).toThrow();
  });

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

describe("expanded session workspace validation", () => {
  it("keeps the legacy answer patch contract valid", () => {
    expect(
      answersSchema.parse({
        targetDomain: "cisco.com",
        audience: "Network operations leaders",
        objective: "Book a meeting"
      })
    ).toEqual({
      targetDomain: "cisco.com",
      audience: "Network operations leaders",
      objective: "Book a meeting"
    });
  });

  it("accepts the full creative control foundation in one bounded workspace mutation", () => {
    expect(
      sessionWorkspacePatchSchema.parse({
        operation: "update-workspace",
        answers: {
          exampleMode: true,
          exampleKey: "jitterbit-cisco",
          messageBelief: "Cisco can govern automation across connected infrastructure.",
          messageAction: "Plan the first architecture workshop",
          ctaType: "book-meeting",
          ctaStyle: "outline",
          styleVariant: "brand-led",
          toneVariant: "technical",
          layoutVariant: "narrative",
          selectedAssetIds: ["asset_1234"]
        },
        selectedAudienceRecommendationId: "audience_1234",
        evidenceDecisions: [
          { id: "evidence_1234", disposition: "pinned" },
          { id: "evidence_5678", disposition: "excluded" }
        ],
        sourceConfirmation: "confirmed",
        blockControls: [
          {
            id: "hero",
            locked: true,
            headline: "Make Cisco automation accountable by design."
          }
        ]
      })
    ).toMatchObject({
      operation: "update-workspace",
      sourceConfirmation: "confirmed"
    });
  });

  it("rejects legacy CTA destinations and duplicate evidence or block decisions", () => {
    expect(() =>
      answersSchema.parse({
        ctaType: "book-meeting",
        ctaDestination: "javascript:alert(1)"
      })
    ).toThrow();
    expect(() =>
      sessionWorkspacePatchSchema.parse({
        operation: "update-workspace",
        evidenceDecisions: [
          { id: "evidence_same", disposition: "pinned" },
          { id: "evidence_same", disposition: "excluded" }
        ]
      })
    ).toThrow("unique");
    expect(() =>
      sessionWorkspacePatchSchema.parse({
        operation: "update-workspace",
        blockControls: [
          { id: "hero", locked: true },
          { id: "hero", visible: false }
        ]
      })
    ).toThrow("unique");
  });

  it("does not accept a CTA destination in the public answer contract", () => {
    expect(() =>
      answersSchema.parse({ ctaDestination: "https://jitterbit.com/contact" })
    ).toThrow();
  });

  it("accepts only the supported CTA visual treatments without requiring a URL", () => {
    expect(
      answersSchema.parse({ ctaType: "book-meeting", ctaStyle: "outline" })
    ).toEqual({ ctaType: "book-meeting", ctaStyle: "outline" });
    expect(() =>
      answersSchema.parse({ ctaType: "register", ctaStyle: "neon" })
    ).toThrow();
  });

  it("uses one operation contract for preview telemetry and duplicate/version creation", () => {
    expect(
      sessionOperationSchema.parse({
        operation: "preview-interaction",
        event: "lens-selected",
        elementId: "decision-lens-2",
        value: "Automation control"
      })
    ).toMatchObject({ event: "lens-selected" });
    expect(
      sessionOperationSchema.parse({
        operation: "duplicate",
        mode: "version",
        label: "Executive option"
      })
    ).toMatchObject({ mode: "version" });
    expect(() =>
      sessionOperationSchema.parse({
        operation: "preview-interaction",
        event: "email-captured"
      })
    ).toThrow();
  });
});

describe("server error logging", () => {
  it("returns a correlated request ID without serializing sensitive provider content", async () => {
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
    expect(logged).not.toContain("secret.pdf");
    expect(logged).not.toContain("person@example.com");
    expect(logged).not.toContain("example.com/private");
    expect(logged).not.toContain("message");
  });

  it("does not return an unknown integration error message to the browser", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiError(new Error("Provider rejected secret.pdf with internal detail"), {
      operation: "pdf_upload"
    });
    const body = (await response.json()) as { error: string; code: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe("internal_error");
    expect(body.error).toBe("We could not complete that request. Please try again.");
    expect(body.error).not.toContain("internal detail");
    expect(body.requestId).toBe(response.headers.get("x-request-id"));
  });
});
