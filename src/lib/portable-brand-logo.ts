import { createHash } from "node:crypto";

import type { PortableBrandLogo } from "@/lib/types";

const MAX_PORTABLE_LOGO_BYTES = 350_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function isSafeBrandSvg(bytes: Uint8Array): boolean {
  if (!bytes.byteLength || bytes.byteLength > MAX_PORTABLE_LOGO_BYTES) return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  if (text.includes("\0")) return false;
  const root = text
    .replace(/^\uFEFF/, "")
    .trimStart()
    .replace(/^(?:<\?xml[^>]*>\s*)?/i, "")
    .replace(/^(?:<!--[\s\S]*?-->\s*)*/i, "");
  if (!/^<svg(?:\s|>)/i.test(root)) return false;

  return ![
    /<!\s*(?:doctype|entity)\b/i,
    /<\s*(?:script|foreignObject|iframe|object|embed|audio|video|image|feImage)\b/i,
    /\bon[a-z]+\s*=/i,
    /(?:href|xlink:href)\s*=\s*["']\s*(?!#)[^"']+/i,
    /\burl\s*\(\s*["']?\s*(?!#)[^)]+/i,
    /@import\b/i,
    /javascript\s*:/i
  ].some((pattern) => pattern.test(text));
}

function detectedMediaType(bytes: Uint8Array): PortableBrandLogo["mediaType"] | undefined {
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return "image/jpeg";
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.byteLength >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) {
    return "image/gif";
  }
  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) return "image/webp";
  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 4, 4) === "ftyp" &&
    ["avif", "avis"].includes(ascii(bytes, 8, 4))
  ) return "image/avif";
  if (isSafeBrandSvg(bytes)) return "image/svg+xml";
  return undefined;
}

export function portableBrandLogoFromBytes(
  bytes: Uint8Array,
  source: PortableBrandLogo["source"]
): PortableBrandLogo | undefined {
  if (!bytes.byteLength || bytes.byteLength > MAX_PORTABLE_LOGO_BYTES) return undefined;
  const mediaType = detectedMediaType(bytes);
  if (!mediaType) return undefined;
  return {
    mediaType,
    encoding: "base64",
    bytesBase64: Buffer.from(bytes).toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source
  };
}

export function portableBrandLogoFromSvg(
  svg: string,
  source: PortableBrandLogo["source"] = "official-inline-svg"
): PortableBrandLogo | undefined {
  return portableBrandLogoFromBytes(new TextEncoder().encode(svg), source);
}

export function decodePortableBrandLogo(asset: PortableBrandLogo): Uint8Array | undefined {
  if (
    asset.encoding !== "base64" ||
    !BASE64.test(asset.bytesBase64) ||
    !/^[a-f0-9]{64}$/.test(asset.sha256)
  ) return undefined;
  const bytes = new Uint8Array(Buffer.from(asset.bytesBase64, "base64"));
  if (
    !bytes.byteLength ||
    bytes.byteLength > MAX_PORTABLE_LOGO_BYTES ||
    detectedMediaType(bytes) !== asset.mediaType ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  ) return undefined;
  return bytes;
}
