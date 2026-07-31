import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

import { resolveSafePublicUrl, type ResolvedPublicUrl } from "@/lib/validation";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REQUEST_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization"
]);

export interface PinnedPublicTextResult {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
  finalUrl: URL;
  truncated: boolean;
}

export interface PinnedPublicBytesResult {
  status: number;
  headers: IncomingHttpHeaders;
  bytes: Uint8Array;
  finalUrl: URL;
  truncated: boolean;
}

export interface PinnedPublicTextOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  validateUrl?: (url: URL) => void | Promise<void>;
}

export function createPinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function assertAnonymousHeaders(headers: Record<string, string>): void {
  for (const name of Object.keys(headers)) {
    if (SENSITIVE_REQUEST_HEADERS.has(name.toLowerCase())) {
      throw new Error("Authenticated headers are not allowed for public readback.");
    }
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("The public URL read was aborted.");
}

async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function requestPinnedBytes(
  resolved: ResolvedPublicUrl,
  options: Required<Pick<PinnedPublicTextOptions, "timeoutMs" | "maxBytes">> &
    Pick<PinnedPublicTextOptions, "signal" | "headers">
): Promise<Omit<PinnedPublicBytesResult, "finalUrl">> {
  const headers = {
    Accept: "text/html,application/xhtml+xml,text/css;q=0.8,*/*;q=0.1",
    "Accept-Encoding": "identity",
    "User-Agent": "Folloze-Try-Me-Now/2.0 (+https://www.folloze.com/)",
    ...(options.headers ?? {})
  };
  assertAnonymousHeaders(headers);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (
      error?: Error,
      result?: Omit<PinnedPublicBytesResult, "finalUrl">
    ) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else if (result) resolve(result);
    };
    const hostname = resolved.hostname;
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname,
        port: 443,
        path: `${resolved.url.pathname}${resolved.url.search}`,
        method: "GET",
        headers,
        family: resolved.family,
        lookup: createPinnedLookup(resolved.address, resolved.family),
        servername: isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: true,
        agent: false,
        signal: options.signal
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (REDIRECT_STATUSES.has(status)) {
          finish(undefined, {
            status,
            headers: response.headers,
            bytes: new Uint8Array(),
            truncated: false
          });
          // Do not drain an attacker-controlled redirect body. We already have
          // the status and Location header needed for the next validated hop.
          response.destroy();
          return;
        }

        const declaredLength = Number.parseInt(
          headerValue(response.headers, "content-length") ?? "",
          10
        );
        const chunks: Uint8Array[] = [];
        let received = 0;
        if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
          response.destroy();
          finish(undefined, {
            status,
            headers: response.headers,
            bytes: new Uint8Array(),
            truncated: true
          });
          return;
        }

        response.on("data", (chunk: Buffer | Uint8Array | string) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const remaining = options.maxBytes - received;
          if (buffer.byteLength <= remaining) {
            chunks.push(buffer.subarray(0, remaining));
            received += buffer.byteLength;
            return;
          }
          if (remaining > 0) {
            chunks.push(buffer.subarray(0, remaining));
            received += remaining;
          }
          response.destroy();
          finish(undefined, {
            status,
            headers: response.headers,
            bytes: Buffer.concat(chunks, received),
            truncated: true
          });
        });
        response.on("end", () =>
          finish(undefined, {
            status,
            headers: response.headers,
            bytes: Buffer.concat(chunks, received),
            truncated: false
          })
        );
        response.on("error", (error) => finish(error));
      }
    );
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error("The public URL read timed out."));
    });
    request.on("error", (error) => finish(error));
    request.end();
  });
}

export async function fetchPinnedPublicBytes(
  startUrl: URL | string,
  options: PinnedPublicTextOptions = {}
): Promise<PinnedPublicBytesResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new Error("The public fetch redirect limit is invalid.");
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 5_000_000) {
    throw new Error("The public fetch byte limit is invalid.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("The public fetch timeout is invalid.");
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const operationSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let current = typeof startUrl === "string" ? new URL(startUrl) : new URL(startUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await withAbort(Promise.resolve(options.validateUrl?.(current)), operationSignal);
    // The address returned here is the exact address supplied to the TLS socket lookup.
    // DNS cannot be consulted again between the public-range check and connection.
    const resolved = await withAbort(resolveSafePublicUrl(current.toString()), operationSignal);
    const result = await requestPinnedBytes(resolved, {
      signal: operationSignal,
      headers: options.headers,
      timeoutMs,
      maxBytes
    });
    if (!REDIRECT_STATUSES.has(result.status)) {
      return { ...result, finalUrl: current };
    }

    const location = headerValue(result.headers, "location");
    if (!location) throw new Error("The public site redirected without a destination.");
    if (hop === maxRedirects) throw new Error("The public site redirected too many times.");
    current = new URL(location, current);
  }

  throw new Error("The public site redirected too many times.");
}

export async function fetchPinnedPublicText(
  startUrl: URL | string,
  options: PinnedPublicTextOptions = {}
): Promise<PinnedPublicTextResult> {
  const { bytes, ...result } = await fetchPinnedPublicBytes(startUrl, options);
  return {
    ...result,
    text: Buffer.from(bytes).toString("utf8")
  };
}
