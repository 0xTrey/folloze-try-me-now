import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import { promises as dns } from "node:dns";

import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ request: requestMock }));

import { fetchPinnedPublicBytes, fetchPinnedPublicText } from "@/lib/safe-fetch";

interface FakeResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Uint8Array;
}

function installFakeHttps(responses: FakeResponse[]): RequestOptions[] {
  const requests: RequestOptions[] = [];
  requestMock.mockImplementation(
    (options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      requests.push(options);
      const request = new EventEmitter() as EventEmitter & {
        setTimeout: (timeout: number, handler: () => void) => ClientRequest;
        destroy: (error?: Error) => ClientRequest;
        end: () => void;
      };
      request.setTimeout = () => request as unknown as ClientRequest;
      request.destroy = (error?: Error) => {
        if (error) request.emit("error", error);
        return request as unknown as ClientRequest;
      };
      request.end = () => {
        const fixture = responses.shift();
        if (!fixture) throw new Error("Missing fake HTTPS response.");
        const response = new PassThrough() as PassThrough & IncomingMessage;
        Object.assign(response, {
          statusCode: fixture.status,
          headers: fixture.headers
        });
        callback(response);
        response.end(fixture.body);
      };
      return request as unknown as ClientRequest;
    }
  );
  return requests;
}

describe("pinned public fetch", () => {
  beforeEach(() => {
    requestMock.mockReset();
    vi.restoreAllMocks();
  });

  it("pins each validated address into TLS lookup and repins every redirect", async () => {
    vi.spyOn(dns, "lookup")
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }] as never);
    const requests = installFakeHttps([
      {
        status: 302,
        headers: { location: "https://redirect.example/final" },
        body: ""
      },
      {
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<!doctype html><html><body>ok</body></html>"
      }
    ]);

    const result = await fetchPinnedPublicText("https://www.example.com/start", {
      maxRedirects: 2
    });

    expect(result.finalUrl.toString()).toBe("https://redirect.example/final");
    expect(dns.lookup).toHaveBeenNthCalledWith(1, "www.example.com", {
      all: true,
      verbatim: true
    });
    expect(dns.lookup).toHaveBeenNthCalledWith(2, "redirect.example", {
      all: true,
      verbatim: true
    });

    const firstLookup = requests[0]?.lookup;
    const secondLookup = requests[1]?.lookup;
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    firstLookup?.("www.example.com", { all: false }, firstCallback);
    secondLookup?.("redirect.example", { all: false }, secondCallback);
    expect(firstCallback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(secondCallback).toHaveBeenCalledWith(null, "1.1.1.1", 4);
  });

  it("rejects sensitive headers before opening a connection", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue(
      [{ address: "93.184.216.34", family: 4 }] as never
    );
    installFakeHttps([]);

    await expect(
      fetchPinnedPublicText("https://www.example.com", {
        headers: { Cookie: "session=secret" }
      })
    ).rejects.toThrow("Authenticated headers");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("bounds DNS resolution and the complete redirect chain with one wall-clock deadline", async () => {
    vi.spyOn(dns, "lookup").mockReturnValue(new Promise(() => undefined) as never);
    installFakeHttps([]);

    await expect(
      fetchPinnedPublicText("https://www.example.com", { timeoutMs: 1 })
    ).rejects.toThrow();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("preserves binary bytes and enforces the byte cap without UTF-8 conversion", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue(
      [{ address: "93.184.216.34", family: 4 }] as never
    );
    installFakeHttps([
      {
        status: 200,
        headers: { "content-type": "font/woff2" },
        body: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff])
      },
      {
        status: 200,
        headers: { "content-type": "font/woff2" },
        body: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff])
      }
    ]);

    const font = await fetchPinnedPublicBytes("https://www.example.com/font.woff2", {
      maxBytes: 6
    });
    expect([...font.bytes]).toEqual([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff]);
    expect(font.truncated).toBe(false);

    const capped = await fetchPinnedPublicBytes("https://www.example.com/font.woff2", {
      maxBytes: 5
    });
    expect([...capped.bytes]).toEqual([0x77, 0x4f, 0x46, 0x32, 0x00]);
    expect(capped.truncated).toBe(true);
  });
});
