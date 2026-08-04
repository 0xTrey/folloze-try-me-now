import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { logServerError } from "@/lib/http";
import {
  parseImageSlot,
  sourceImageUrlForSlot,
  type ImageSlot
} from "@/lib/image-delivery";
import {
  decodePortableBrandLogo,
  isSafeBrandSvg
} from "@/lib/portable-brand-logo";
import { fetchPinnedPublicBytes } from "@/lib/safe-fetch";
import { getSession } from "@/lib/session-store";
import type { TryMeSession } from "@/lib/types";
import {
  brandPresentationFor,
  verifiedBrandLogoFallbackFor,
  verifiedBrandProfileFor
} from "@/lib/verified-brand-profiles";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; slot: string }> };
type ImageKind = "avif" | "gif" | "jpeg" | "png" | "svg" | "webp";

const IMAGE_MAX_BYTES = 5_000_000;
const IMAGE_TIMEOUT_MS = 6_500;
const IMAGE_MAX_REDIRECTS = 2;
const SAFE_SESSION_ID = /^[a-z0-9_-]{1,128}$/i;

const deliveryHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
  "Timing-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow"
};

const errorHeaders = {
  ...deliveryHeaders,
  "Cache-Control": "private, no-store, max-age=0"
};

const mimeByKind: Record<ImageKind, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml; charset=utf-8",
  webp: "image/webp"
};

interface OriginalImageFallback {
  bytes: Uint8Array;
  kind: ImageKind;
}

type RequestedArtifactRevision =
  | { kind: "unversioned" }
  | { kind: "versioned"; value: number }
  | { kind: "invalid" };

function imageError(status: number, code: string, message: string, requestId?: string) {
  const headers = requestId
    ? { ...errorHeaders, "X-Request-Id": requestId }
    : errorHeaders;
  return NextResponse.json({ error: message, code, ...(requestId ? { requestId } : {}) }, {
    status,
    headers
  });
}

function loggedImageError(input: {
  status: number;
  code: string;
  message: string;
  logMessage: string;
  logCode: string;
  sessionId: string;
  operation: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}) {
  const requestId = logServerError(new Error(input.logMessage), {
    route: "/api/sessions/[id]/image/[slot]",
    method: "GET",
    sessionId: input.sessionId,
    operation: input.operation,
    status: input.status,
    code: input.logCode,
    details: input.details
  });
  return imageError(input.status, input.code, input.message, requestId);
}

function requestedArtifactRevision(request: Request): RequestedArtifactRevision {
  const entries = Array.from(new URL(request.url).searchParams.entries());
  if (entries.length === 0) return { kind: "unversioned" };
  if (entries.length !== 1 || entries[0]?.[0] !== "v") return { kind: "invalid" };

  const rawRevision = entries[0][1];
  if (!/^[1-9][0-9]{0,9}$/.test(rawRevision)) return { kind: "invalid" };
  const value = Number(rawRevision);
  return Number.isSafeInteger(value) && value <= 9_999_999_999
    ? { kind: "versioned", value }
    : { kind: "invalid" };
}

function currentArtifactRevision(session: TryMeSession): number | undefined {
  const value = session.qualityReceipt?.artifactRevision ?? session.experience?.artifactRevision;
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function isSafeSvg(bytes: Uint8Array): boolean {
  return isSafeBrandSvg(bytes);
}

function detectImageKind(bytes: Uint8Array): ImageKind | undefined {
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.byteLength >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) {
    return "gif";
  }
  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 4, 4) === "ftyp" &&
    ["avif", "avis"].includes(ascii(bytes, 8, 4))
  ) {
    return "avif";
  }
  if (bytes.byteLength >= 5 && isSafeSvg(bytes)) return "svg";
  return undefined;
}

function portableLogoForSlot(
  session: TryMeSession | null,
  slot: ImageSlot
): OriginalImageFallback | undefined {
  if (!session || !slot.endsWith("-logo")) return undefined;
  const profile = slot.startsWith("seller-") ? session.brand : session.targetBrand;
  if (!profile?.portableLogo) return undefined;
  const bytes = decodePortableBrandLogo(profile.portableLogo);
  const kind = bytes ? detectImageKind(bytes) : undefined;
  return bytes && kind ? { bytes, kind } : undefined;
}

function contentTypeHint(value: string | string[] | undefined): ImageKind | "generic" | "invalid" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "generic";
  const mime = raw.split(";", 1)[0]?.trim().toLowerCase();
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") {
    return "generic";
  }
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  if (mime === "image/svg+xml" || mime === "application/svg+xml") return "svg";
  return "invalid";
}

function extensionHint(url: URL): ImageKind | undefined {
  const extension = url.pathname.toLowerCase().match(/\.(avif|gif|jpe?g|png|svg|webp)$/)?.[1];
  return extension === "jpg" || extension === "jpeg" ? "jpeg" : extension as ImageKind | undefined;
}

function isExplicitHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function canonicalDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

async function readReviewedLogo(path: string): Promise<Uint8Array> {
  switch (path) {
    case "public/verified-brands/servicenow/homepage-header-logo.png":
      return new Uint8Array(await readFile(join(
        process.cwd(),
        "public",
        "verified-brands",
        "servicenow",
        "homepage-header-logo.png"
      )));
    case "public/verified-brands/medidata/official-wordmark.svg":
      return new Uint8Array(await readFile(join(
        process.cwd(),
        "public",
        "verified-brands",
        "medidata",
        "official-wordmark.svg"
      )));
    case "public/verified-brands/lilly/official-wordmark.svg":
      return new Uint8Array(await readFile(join(
        process.cwd(),
        "public",
        "verified-brands",
        "lilly",
        "official-wordmark.svg"
      )));
    default:
      throw new Error("The reviewed logo path is not registered for delivery.");
  }
}

async function verifiedLogoFallback(
  session: TryMeSession | null,
  slot: ImageSlot,
  sourceUrl: string
): Promise<OriginalImageFallback | undefined> {
  if (!session || !slot.endsWith("-logo")) return undefined;
  const profile = slot.startsWith("seller-") ? session.brand : session.targetBrand;
  if (!profile || profile.source !== "brand-harvester") return undefined;

  const fallback = verifiedBrandLogoFallbackFor(profile.domain, sourceUrl);
  if (!fallback) return undefined;
  try {
    const bytes = await readReviewedLogo(fallback.path);
    const kind = detectImageKind(bytes);
    if (!kind) throw new Error("The reviewed logo file is not a supported safe image.");
    return { bytes, kind };
  } catch (error) {
    logServerError(error, {
      route: "/api/sessions/[id]/image/[slot]",
      method: "GET",
      sessionId: session.id,
      operation: "verified_brand_logo_read",
      code: "verified_brand_logo_unavailable",
      details: { slot }
    });
    return undefined;
  }
}

async function verifiedServiceNowHeroFallback(
  session: TryMeSession | null,
  slot: ImageSlot,
  sourceUrl: string
): Promise<OriginalImageFallback | undefined> {
  if (!session || !slot.endsWith("-image-0")) return undefined;
  const profile = slot.startsWith("seller-") ? session.brand : session.targetBrand;
  if (
    !profile ||
    profile.source !== "brand-harvester" ||
    canonicalDomain(profile.domain) !== "servicenow.com"
  ) {
    return undefined;
  }

  const verified = verifiedBrandProfileFor("servicenow.com");
  if (!verified || canonicalDomain(verified.domain) !== canonicalDomain(profile.domain)) {
    return undefined;
  }
  const expectedSource = verified.imageUrls[0];
  if (!expectedSource || sourceUrl !== expectedSource) return undefined;

  const presentation = brandPresentationFor(verified);
  const navy = verified.primaryColor;
  const green = verified.accentColor;
  const blue = presentation?.supportingAccentColor ?? "#52B8FF";
  const white = "#FFFFFF";
  const companyName = verified.companyName.replace(/[&<>"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${companyName} workflow composition"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${navy}"/><stop offset="1" stop-color="#07556B"/></linearGradient><linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF" stop-opacity=".98"/><stop offset="1" stop-color="#E8F7FA" stop-opacity=".94"/></linearGradient><radialGradient id="glow"><stop stop-color="${blue}" stop-opacity=".68"/><stop offset="1" stop-color="${blue}" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="42"/></filter></defs><rect width="1600" height="900" rx="48" fill="url(#bg)"/><circle cx="1320" cy="160" r="310" fill="url(#glow)" filter="url(#blur)"/><circle cx="190" cy="780" r="260" fill="${green}" opacity=".12" filter="url(#blur)"/><g opacity=".16" stroke="${white}"><path d="M0 180h1600M0 360h1600M0 540h1600M0 720h1600"/><path d="M200 0v900M400 0v900M600 0v900M800 0v900M1000 0v900M1200 0v900M1400 0v900"/></g><text x="104" y="126" fill="${green}" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" letter-spacing="4">WORKFLOW EXPERIENCE</text><text x="104" y="194" fill="${white}" font-family="Arial,Helvetica,sans-serif" font-size="54" font-weight="700">From enterprise signal to governed action.</text><path d="M278 463C410 302 565 302 690 430S970 572 1120 438 1320 330 1430 438" fill="none" stroke="${blue}" stroke-width="8" stroke-linecap="round" opacity=".9"/><path d="M278 463C410 624 565 624 690 496S970 354 1120 488 1320 596 1430 488" fill="none" stroke="${green}" stroke-width="8" stroke-linecap="round" opacity=".88"/><g font-family="Arial,Helvetica,sans-serif"><g transform="translate(102 366)"><rect width="286" height="194" rx="28" fill="url(#panel)"/><circle cx="54" cy="54" r="18" fill="${blue}"/><text x="86" y="62" fill="${navy}" font-size="25" font-weight="700">Enterprise data</text><text x="34" y="122" fill="#365966" font-size="20">Context enters the flow</text><rect x="34" y="148" width="190" height="12" rx="6" fill="${blue}" opacity=".32"/></g><g transform="translate(657 348)"><rect width="322" height="230" rx="34" fill="${green}"/><circle cx="61" cy="63" r="24" fill="${navy}"/><path d="M52 63l7 7 13-17" fill="none" stroke="${white}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="102" y="72" fill="${navy}" font-size="28" font-weight="700">Governed workflow</text><text x="44" y="132" fill="${navy}" font-size="22">Orchestrate the right action</text><rect x="44" y="166" width="234" height="18" rx="9" fill="${navy}" opacity=".18"/><rect x="44" y="198" width="168" height="12" rx="6" fill="${navy}" opacity=".12"/></g><g transform="translate(1209 366)"><rect width="286" height="194" rx="28" fill="url(#panel)"/><circle cx="54" cy="54" r="18" fill="${green}"/><text x="86" y="62" fill="${navy}" font-size="25" font-weight="700">Buyer outcome</text><text x="34" y="122" fill="#365966" font-size="20">Proof becomes visible</text><rect x="34" y="148" width="190" height="12" rx="6" fill="${green}" opacity=".38"/></g></g><g transform="translate(104 735)" font-family="Arial,Helvetica,sans-serif"><rect width="1392" height="88" rx="24" fill="#001E2B" opacity=".86"/><circle cx="54" cy="44" r="15" fill="${green}"/><text x="86" y="52" fill="${white}" font-size="24" font-weight="700">${companyName}</text><text x="302" y="52" fill="#C8E7EF" font-size="22">Data</text><circle cx="382" cy="44" r="5" fill="${blue}"/><text x="412" y="52" fill="#C8E7EF" font-size="22">Workflow</text><circle cx="525" cy="44" r="5" fill="${blue}"/><text x="555" y="52" fill="#C8E7EF" font-size="22">Security</text><circle cx="661" cy="44" r="5" fill="${blue}"/><text x="691" y="52" fill="#C8E7EF" font-size="22">Measurable action</text></g></svg>`;

  return { bytes: new TextEncoder().encode(svg), kind: "svg" };
}

function imageResponse(bytes: Uint8Array, kind: ImageKind): Response {
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: {
      ...deliveryHeaders,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": mimeByKind[kind]
    }
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: deliveryHeaders });
}

export async function GET(request: Request, context: RouteContext) {
  const { id, slot: rawSlot } = await context.params;
  const slot = parseImageSlot(rawSlot);
  if (!SAFE_SESSION_ID.test(id) || !slot) {
    return imageError(404, "image_not_found", "This image asset is unavailable.");
  }
  const requestedRevision = requestedArtifactRevision(request);
  if (requestedRevision.kind === "invalid") {
    return imageError(404, "image_not_found", "This image asset is unavailable.");
  }

  let session: TryMeSession | null = null;
  let sourceUrl: string | undefined;
  try {
    session = await getSession(id);
    sourceUrl = sourceImageUrlForSlot(session, slot as ImageSlot);
  } catch {
    const requestId = logServerError(new Error("Image session lookup failed."), {
      route: "/api/sessions/[id]/image/[slot]",
      method: "GET",
      sessionId: id,
      operation: "image_proxy_lookup",
      code: "image_proxy_lookup_failed"
    });
    return imageError(503, "image_unavailable", "This image asset is temporarily unavailable.", requestId);
  }

  if (
    requestedRevision.kind === "versioned" &&
    (!session || currentArtifactRevision(session) !== requestedRevision.value)
  ) {
    return imageError(404, "image_not_found", "This image asset is unavailable.");
  }

  const portableLogo = portableLogoForSlot(session, slot);
  if (portableLogo) return imageResponse(portableLogo.bytes, portableLogo.kind);

  if (!sourceUrl || !isExplicitHttpsUrl(sourceUrl)) {
    return imageError(404, "image_not_found", "This image asset is unavailable.");
  }

  const reviewedLogo = await verifiedLogoFallback(session, slot, sourceUrl);
  if (reviewedLogo) return imageResponse(reviewedLogo.bytes, reviewedLogo.kind);

  try {
    const result = await fetchPinnedPublicBytes(sourceUrl, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: IMAGE_MAX_BYTES,
      maxRedirects: IMAGE_MAX_REDIRECTS,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/gif;q=0.9,application/octet-stream;q=0.3,*/*;q=0.1"
      }
    });
    if (result.status !== 200) {
      const originalFallback = await verifiedServiceNowHeroFallback(session, slot, sourceUrl);
      if (originalFallback) return imageResponse(originalFallback.bytes, originalFallback.kind);
      return loggedImageError({
        status: 502,
        code: "image_upstream_failed",
        message: "The source image could not be loaded.",
        logMessage: "Image upstream returned a non-success status.",
        logCode: "image_proxy_upstream_status",
        sessionId: id,
        operation: "image_proxy_fetch",
        details: { slot, upstreamStatus: result.status }
      });
    }
    if (result.truncated) {
      return loggedImageError({
        status: 413,
        code: "image_too_large",
        message: "The source image is too large to deliver safely.",
        logMessage: "Image upstream response exceeded the delivery limit.",
        logCode: "image_proxy_too_large",
        sessionId: id,
        operation: "image_proxy_validation",
        details: { slot }
      });
    }

    const detected = detectImageKind(result.bytes);
    const contentHint = contentTypeHint(result.headers["content-type"]);
    const pathHint = extensionHint(result.finalUrl);
    if (
      !detected ||
      contentHint === "invalid" ||
      (contentHint !== "generic" && contentHint !== detected) ||
      // Modern CDNs legitimately negotiate AVIF/WebP for a .png/.jpg URL.
      // Explicit MIME must still match the detected bytes; the extension is a
      // security signal only when the upstream supplies no useful MIME.
      (contentHint === "generic" && pathHint && pathHint !== detected)
    ) {
      return loggedImageError({
        status: 415,
        code: "invalid_image",
        message: "The source did not return a supported image.",
        logMessage: "Image upstream response failed content validation.",
        logCode: "image_proxy_invalid_payload",
        sessionId: id,
        operation: "image_proxy_validation",
        details: {
          slot,
          detectedKind: detected ?? null,
          contentTypeHint: contentHint,
          extensionHint: pathHint ?? null
        }
      });
    }

    return imageResponse(result.bytes, detected);
  } catch (error) {
    const originalFallback = await verifiedServiceNowHeroFallback(session, slot, sourceUrl);
    if (originalFallback) return imageResponse(originalFallback.bytes, originalFallback.kind);
    const timedOut = error instanceof Error && /timed out|timeout/i.test(error.message);
    const requestId = logServerError(new Error(timedOut ? "Image proxy timed out." : "Image proxy fetch failed."), {
      route: "/api/sessions/[id]/image/[slot]",
      method: "GET",
      sessionId: id,
      operation: "image_proxy_fetch",
      code: timedOut ? "image_proxy_timeout" : "image_proxy_failed",
      details: { slot }
    });
    return imageError(
      timedOut ? 504 : 502,
      timedOut ? "image_timeout" : "image_upstream_failed",
      "The source image could not be loaded.",
      requestId
    );
  }
}
