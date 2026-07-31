import { NextResponse } from "next/server";

import { logServerError } from "@/lib/http";
import { fetchPinnedPublicBytes } from "@/lib/safe-fetch";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; slot: string }> };
type FontSlot = "display" | "body";
type FontKind = "woff2" | "woff" | "ttf" | "otf";

const FONT_MAX_BYTES = 1_500_000;
const FONT_TIMEOUT_MS = 4_500;
const FONT_MAX_REDIRECTS = 2;
const SAFE_SESSION_ID = /^[a-z0-9_-]{1,128}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Timing-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow"
};

const errorHeaders = {
  ...corsHeaders,
  "Cache-Control": "private, no-store, max-age=0"
};

const mimeByKind: Record<FontKind, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf"
};

function fontError(status: number, code: string, message: string, requestId?: string) {
  const headers = requestId
    ? { ...errorHeaders, "X-Request-Id": requestId }
    : errorHeaders;
  return NextResponse.json({ error: message, code, ...(requestId ? { requestId } : {}) }, {
    status,
    headers
  });
}

function parseSlot(value: string): FontSlot | undefined {
  return value === "display" || value === "body" ? value : undefined;
}

function ascii(bytes: Uint8Array, length: number): string {
  return String.fromCharCode(...bytes.subarray(0, length));
}

function hasDeclaredWoffLength(bytes: Uint8Array, minimumHeaderBytes: number): boolean {
  if (bytes.byteLength < minimumHeaderBytes) return false;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, false) === bytes.byteLength;
}

function detectFontKind(bytes: Uint8Array): FontKind | undefined {
  if (bytes.byteLength < 4) return undefined;
  const signature = ascii(bytes, 4);
  if (signature === "wOF2" && hasDeclaredWoffLength(bytes, 48)) return "woff2";
  if (signature === "wOFF" && hasDeclaredWoffLength(bytes, 44)) return "woff";
  if (bytes.byteLength >= 12 && signature === "OTTO") return "otf";
  if (bytes.byteLength >= 12 && (signature === "true" || signature === "typ1")) return "ttf";
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00
  ) {
    return "ttf";
  }
  return undefined;
}

function contentTypeHint(value: string | string[] | undefined): FontKind | "generic" | "invalid" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "generic";
  const mime = raw.split(";", 1)[0]?.trim().toLowerCase();
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") return "generic";
  if (["font/woff2", "application/font-woff2", "application/x-font-woff2"].includes(mime)) return "woff2";
  if (["font/woff", "application/font-woff", "application/x-font-woff"].includes(mime)) return "woff";
  if (["font/ttf", "application/x-font-ttf"].includes(mime)) return "ttf";
  if (["font/otf", "application/x-font-opentype"].includes(mime)) return "otf";
  if (["font/sfnt", "application/font-sfnt"].includes(mime)) return "generic";
  return "invalid";
}

function extensionHint(url: URL): FontKind | undefined {
  const match = url.pathname.toLowerCase().match(/\.(woff2|woff|ttf|otf)$/);
  return match?.[1] as FontKind | undefined;
}

function sourceFontUrl(slot: FontSlot, session: Awaited<ReturnType<typeof getSession>>): string | undefined {
  if (!session?.brand) return undefined;
  return slot === "display" ? session.brand.displayFontUrl : session.brand.bodyFontUrl;
}

function isExplicitHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id, slot: rawSlot } = await context.params;
  const slot = parseSlot(rawSlot);
  if (!SAFE_SESSION_ID.test(id) || !slot) {
    return fontError(404, "font_not_found", "This font asset is unavailable.");
  }

  let sourceUrl: string | undefined;
  try {
    sourceUrl = sourceFontUrl(slot, await getSession(id));
  } catch {
    const requestId = logServerError(new Error("Font session lookup failed."), {
      route: "/api/sessions/[id]/font/[slot]",
      method: "GET",
      sessionId: id,
      operation: "font_proxy_lookup",
      code: "font_proxy_lookup_failed"
    });
    return fontError(503, "font_unavailable", "This font asset is temporarily unavailable.", requestId);
  }

  if (!sourceUrl || !isExplicitHttpsUrl(sourceUrl)) {
    return fontError(404, "font_not_found", "This font asset is unavailable.");
  }

  try {
    const result = await fetchPinnedPublicBytes(sourceUrl, {
      timeoutMs: FONT_TIMEOUT_MS,
      maxBytes: FONT_MAX_BYTES,
      maxRedirects: FONT_MAX_REDIRECTS,
      headers: {
        Accept: "font/woff2,font/woff,font/ttf,font/otf,application/octet-stream;q=0.8,*/*;q=0.1"
      }
    });
    if (result.status !== 200) {
      return fontError(502, "font_upstream_failed", "The source font could not be loaded.");
    }
    if (result.truncated) {
      return fontError(413, "font_too_large", "The source font is too large to deliver safely.");
    }

    const detected = detectFontKind(result.bytes);
    const contentHint = contentTypeHint(result.headers["content-type"]);
    const pathHint = extensionHint(result.finalUrl);
    if (
      !detected ||
      contentHint === "invalid" ||
      (contentHint !== "generic" && contentHint !== detected) ||
      (pathHint && pathHint !== detected)
    ) {
      return fontError(415, "invalid_font", "The source did not return a supported font.");
    }

    const body = Uint8Array.from(result.bytes).buffer;
    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Length": String(result.bytes.byteLength),
        "Content-Type": mimeByKind[detected]
      }
    });
  } catch (error) {
    const timedOut = error instanceof Error && /timed out|timeout/i.test(error.message);
    const requestId = logServerError(new Error(timedOut ? "Font proxy timed out." : "Font proxy fetch failed."), {
      route: "/api/sessions/[id]/font/[slot]",
      method: "GET",
      sessionId: id,
      operation: "font_proxy_fetch",
      code: timedOut ? "font_proxy_timeout" : "font_proxy_failed",
      details: { slot }
    });
    return fontError(
      timedOut ? 504 : 502,
      timedOut ? "font_timeout" : "font_upstream_failed",
      "The source font could not be loaded.",
      requestId
    );
  }
}
