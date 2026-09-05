import { HttpError } from "@/lib/http";

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export function requireSameOriginJson(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "json_required", "Send this request as JSON.");
  }
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  // Sibling subdomains are not trusted. Non-browser API clients may omit both
  // headers, but still need JSON and the server-issued editor capability.
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new HttpError(403, "same_origin_required", "This request is not allowed.");
  }
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "same_origin_required", "This request is not allowed.");
  }
}

export async function readJsonBody(request: Pick<Request, "headers" | "body">, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Invalid JSON body limit.");
  const tooLarge = () => new HttpError(413, "request_too_large", "Request body is too large.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid_json", "Request body is invalid.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_json", "Request body is invalid.");
  } finally {
    reader.releaseLock();
  }
}
