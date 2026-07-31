import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPinnedPublicText } from "@/lib/safe-fetch";

vi.mock("@/lib/safe-fetch", () => ({ fetchPinnedPublicText: vi.fn() }));

import {
  isAllowedFollozePublicHost,
  parseFollozeGatewayOutput,
  readBackFollozePublicUrl,
  validateFollozePublicUrl
} from "@/lib/integrations/folloze";

describe("Folloze publication URL validation", () => {
  beforeEach(() => {
    vi.mocked(fetchPinnedPublicText).mockReset();
  });

  it("requires the gateway to return a public URL", async () => {
    await expect(validateFollozePublicUrl(undefined)).rejects.toThrow("public URL");
  });

  it("rejects non-HTTPS and private-host publication URLs", async () => {
    await expect(validateFollozePublicUrl("http://engage.folloze.com/demo")).rejects.toThrow(
      "Only public HTTPS URLs"
    );
    await expect(validateFollozePublicUrl("https://127.0.0.1/demo")).rejects.toThrow(
      "approved public hosts"
    );
  });

  it("accepts only the configured Folloze publication hosts", () => {
    expect(isAllowedFollozePublicHost("engage.folloze.com")).toBe(true);
    expect(isAllowedFollozePublicHost("experience.folloze.com")).toBe(true);
    expect(isAllowedFollozePublicHost("folloze.com.evil.example")).toBe(false);
    expect(isAllowedFollozePublicHost("example.com")).toBe(false);
  });

  it("requires the exact publication gateway response contract", () => {
    expect(
      parseFollozeGatewayOutput(
        JSON.stringify({
          status: "published",
          public_url: "https://engage.folloze.com/demo",
          board_id: "249999",
          artifact_revision: 7,
          artifact_digest: "a".repeat(64),
          warnings: []
        })
      )
    ).toMatchObject({
      status: "published",
      board_id: "249999",
      artifact_revision: 7,
      artifact_digest: "a".repeat(64)
    });

    expect(() =>
      parseFollozeGatewayOutput(
        JSON.stringify({
          status: "draft",
          public_url: "https://engage.folloze.com/demo",
          board_id: "249999",
          artifact_revision: 7,
          artifact_digest: "a".repeat(64)
        })
      )
    ).toThrow("invalid result");
    expect(() =>
      parseFollozeGatewayOutput(
        JSON.stringify({
          status: "published",
          public_url: "https://engage.folloze.com/demo",
          board_id: "249999",
          artifact_revision: 7,
          artifact_digest: "a".repeat(64),
          unexpected: true
        })
      )
    ).toThrow("invalid result");
  });

  it("accepts a URL only after an anonymous, bounded HTML readback", async () => {
    vi.mocked(fetchPinnedPublicText).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      text: "<!doctype html><html><head><title>Experience</title></head><body><main>Published Folloze experience</main></body></html>",
      finalUrl: new URL("https://experience.folloze.com/demo"),
      truncated: false
    });

    await expect(
      readBackFollozePublicUrl("https://engage.folloze.com/demo")
    ).resolves.toBe("https://experience.folloze.com/demo");

    expect(fetchPinnedPublicText).toHaveBeenCalledWith(
      new URL("https://engage.folloze.com/demo"),
      expect.objectContaining({
        maxBytes: 512_000,
        maxRedirects: 3,
        timeoutMs: 12_000,
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9" }
      })
    );
    const options = vi.mocked(fetchPinnedPublicText).mock.calls[0]?.[1];
    expect(() => options?.validateUrl?.(new URL("https://folloze.com.evil.example/demo"))).toThrow(
      "approved public hosts"
    );
  });

  it.each([
    [404, { "content-type": "text/html" }, "<!doctype html><html><body>Missing</body></html>", "anonymously"],
    [200, { "content-type": "application/json" }, '{"ok":true}', "HTML experience"],
    [200, { "content-type": "text/html" }, "<html><body>short</body></html>", "credible"],
    [
      200,
      { "content-type": "text/html" },
      "<!doctype html><html><body><form><input type=\"password\"></form>" + "x".repeat(100) + "</body></html>",
      "anonymously accessible"
    ]
  ])("rejects a non-credible public readback", async (status, headers, text, message) => {
    vi.mocked(fetchPinnedPublicText).mockResolvedValue({
      status,
      headers,
      text,
      finalUrl: new URL("https://engage.folloze.com/demo"),
      truncated: false
    });

    await expect(readBackFollozePublicUrl("https://engage.folloze.com/demo")).rejects.toThrow(
      message
    );
  });
});
