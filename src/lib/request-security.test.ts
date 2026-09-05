import { describe, expect, it, vi } from "vitest";

import { readJsonBody, requireSameOriginJson } from "@/lib/request-security";

const request = (headers: Record<string, string> = {}, body = "{}") =>
  new Request("https://builder.example/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
  });

describe("browser JSON request boundary", () => {
  it("accepts same-origin and non-browser JSON clients", () => {
    expect(() => requireSameOriginJson(request())).not.toThrow();
    expect(() => requireSameOriginJson(request({
      origin: "https://builder.example", "sec-fetch-site": "same-origin"
    }))).not.toThrow();
  });

  it.each([
    { origin: "https://attacker.example" },
    { origin: "null" },
    { origin: "https://builder.example.attacker.example" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "content-type": "text/plain" },
    { "content-type": "application/x-www-form-urlencoded" }
  ] as Array<Record<string, string>>)("rejects unsafe request headers %j", (headers) => {
    expect(() => requireSameOriginJson(request(headers))).toThrow();
  });

  it("parses bounded UTF-8 JSON without trusting declared length", async () => {
    await expect(readJsonBody(request({}, '{"value":"café"}'))).resolves.toEqual({ value: "café" });
    await expect(readJsonBody(request({ "content-length": "1" }, '{"oversize":true}'), 5))
      .rejects.toMatchObject({ status: 413, code: "request_too_large" });
  });

  it("rejects malformed or empty JSON with a safe 400", async () => {
    await expect(readJsonBody(request({}, "not-json"))).rejects.toMatchObject({ status: 400 });
    await expect(readJsonBody(request({}, ""))).rejects.toMatchObject({ status: 400 });
  });

  it("cancels a chunked stream as soon as its byte limit is crossed", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
      },
      cancel
    });
    const streamed = new Request("https://builder.example/api/sessions", {
      method: "POST", body: stream, duplex: "half"
    } as RequestInit);
    await expect(readJsonBody(streamed, 10)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
