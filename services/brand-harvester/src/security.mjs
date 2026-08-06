import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_PROTOCOLS = new Set(["https:"]);
const ALLOWED_PORTS = new Set(["", "443"]);

function ipv4Number(address) {
  return address.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(value, base, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (ipv4Number(base) & mask);
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    const blocked = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4]
    ];
    return !blocked.some(([base, prefix]) => inIpv4Range(value, base, prefix));
  }
  if (family === 6) {
    const normalized = address.toLowerCase().split("%")[0];
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    if (normalized.startsWith("ff")) return false;
    if (normalized.startsWith("2001:db8")) return false;
    if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
    return true;
  }
  return false;
}

export function parseSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_source_url");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_source_url");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new Error("source_url_must_use_https");
  if (url.username || url.password) throw new Error("source_url_credentials_not_allowed");
  if (!ALLOWED_PORTS.has(url.port)) throw new Error("source_url_port_not_allowed");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("source_url_host_not_public");
  }
  if (net.isIP(url.hostname) && !isPublicAddress(url.hostname)) throw new Error("source_url_host_not_public");
  url.hash = "";
  return url;
}

export async function assertPublicUrl(value, lookup = dns.lookup) {
  const url = parseSourceUrl(value);
  if (net.isIP(url.hostname)) {
    if (!isPublicAddress(url.hostname)) throw new Error("source_url_host_not_public");
    return url;
  }
  let records;
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("source_url_dns_failed");
  }
  if (!Array.isArray(records) || records.length === 0 || records.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("source_url_host_not_public");
  }
  return url;
}

export function publicUrlWithoutQuery(value) {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
