import { afterEach, describe, expect, it, vi } from "vitest";

import {
  emitObservabilityLog,
  sanitizeObservabilityMeta,
  sanitizeObservabilityText,
  supportRefForTraceId
} from "@/lib/observability";

describe("observability redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts credentials, visitor identifiers, URLs, bare domains, and editor cookies", () => {
    const key = `sk-proj-${"a".repeat(24)}`;
    const jwt = `eyJ${"a".repeat(12)}.${"b".repeat(12)}.${"c".repeat(12)}`;
    const safe = sanitizeObservabilityText(
      `Bearer secret-token buyer@example.com https://private.example/a.pdf cisco.com ${key} ${jwt} tmn_editor_session=token-value`
    );

    expect(safe).toContain("[redacted-authorization]");
    expect(safe).toContain("[redacted-email]");
    expect(safe).toContain("[redacted-url]");
    expect(safe).toContain("[redacted-domain]");
    expect(safe).toContain("[redacted-secret]");
    expect(safe).toContain("[redacted-jwt]");
    expect(safe).toContain("[redacted-editor-cookie]");
    expect(safe).not.toContain("secret-token");
    expect(safe).not.toContain("buyer@example.com");
    expect(safe).not.toContain("cisco.com");
    expect(safe).not.toContain(key);
  });

  it("drops sensitive fields while preserving bounded diagnostic primitives", () => {
    expect(
      sanitizeObservabilityMeta({
        requestId: "request-123",
        durationMs: 842,
        logoStrategy: "inline-svg-unportable",
        sourceContent: "private source body",
        editorToken: "private-editor-token",
        response_body: "private provider response"
      })
    ).toEqual({
      requestId: "request-123",
      durationMs: 842,
      logoStrategy: "inline-svg-unportable"
    });
  });

  it("emits one-line JSON with a stable event envelope and sanitized details", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitObservabilityLog("info", {
      type: "try_me_trace",
      event: "brand_harvest_completed",
      traceId: "session-123",
      details: {
        domain: "cisco.com",
        logoStrategy: "inline-svg-unportable",
        sourceKind: "abm-product",
        sourceUrl: "https://www.cisco.com/private"
      }
    });

    const parsed = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      type: "try_me_trace",
      event: "brand_harvest_completed",
      traceId: "session-123",
      details: {
        logoStrategy: "inline-svg-unportable",
        sourceKind: "abm-product"
      }
    });
    expect(JSON.stringify(parsed)).not.toContain("private");
  });

  it("drops unknown top-level and detail fields even when their values look harmless", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitObservabilityLog("info", {
      type: "try_me_trace",
      event: "brand_harvest_completed",
      traceId: "private-trace-123",
      customerLabel: "ACME",
      details: {
        logoStrategy: "semantic-image",
        innocentLookingCustomerField: "ACME"
      }
    });

    const logged = String(info.mock.calls[0]?.[0]);
    expect(logged).toContain('"logoStrategy":"semantic-image"');
    expect(logged).not.toContain("customerLabel");
    expect(logged).not.toContain("innocentLookingCustomerField");
    expect(logged).not.toContain("ACME");
  });

  it("hashes the complete trace ID before shortening the public support reference", () => {
    const first = supportRefForTraceId("legacy_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const second = supportRefForTraceId("legacy_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

    expect(first).toMatch(/^TMN-[A-F0-9]{12}$/);
    expect(second).toMatch(/^TMN-[A-F0-9]{12}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("LEGACY");
  });
});
