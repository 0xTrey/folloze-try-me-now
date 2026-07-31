import { BlockList, isIP } from "node:net";
import { promises as dns } from "node:dns";

import disposableEmailDomains from "disposable-email-domains";
import { z } from "zod";

import { USE_CASES } from "@/lib/types";

const domainPattern = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const createSessionSchema = z.object({
  useCase: z.enum(USE_CASES),
  companyDomain: z.string().min(3).max(300)
});

export const answersSchema = z
  .object({
    targetDomain: z.string().max(300).optional(),
    audience: z.string().min(2).max(120).optional(),
    customAudience: z.string().min(2).max(160).optional(),
    objective: z.string().min(2).max(120).optional(),
    campaignType: z.enum(["product", "demand", "event"]).optional(),
    eventSource: z.string().max(1000).optional(),
    sourceUrl: z.string().max(1000).optional()
  })
  .strict();

export const claimSchema = z.object({
  email: z.string().trim().email().max(320)
});

export function normalizeDomain(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate) throw new Error("Enter a company domain.");

  let hostname: string;
  try {
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (parsed.username || parsed.password || parsed.port) throw new Error("unsupported");
    hostname = parsed.hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    throw new Error("Enter a domain like acme.com.");
  }

  if (!domainPattern.test(hostname) || isIP(hostname)) {
    throw new Error("Enter a public company domain like acme.com.");
  }

  return hostname;
}

const nonPublicAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  nonPublicAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 96],
  ["::ffff:0:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:3::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8]
] as const) {
  nonPublicAddresses.addSubnet(network, prefix, "ipv6");
}

nonPublicAddresses.addAddress("::", "ipv6");
nonPublicAddresses.addAddress("::1", "ipv6");

function normalizeHostnameForSafety(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  const hostname = candidate.startsWith("[") && candidate.endsWith("]")
    ? candidate.slice(1, -1)
    : candidate;

  if (!hostname || (!isIP(hostname) && !domainPattern.test(hostname))) {
    throw new Error("That domain cannot be fetched safely.");
  }

  return hostname;
}

function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return true;
  return nonPublicAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  await resolvePublicHostname(hostname);
}

export interface ResolvedPublicHostname {
  hostname: string;
  address: string;
  family: 4 | 6;
}

export async function resolvePublicHostname(hostname: string): Promise<ResolvedPublicHostname> {
  const normalized = normalizeHostnameForSafety(hostname);
  const literalFamily = isIP(normalized);
  if (literalFamily) {
    if (isNonPublicAddress(normalized)) {
      throw new Error("That domain cannot be fetched safely.");
    }
    return {
      hostname: normalized,
      address: normalized,
      family: literalFamily as 4 | 6
    };
  }

  const records = await dns.lookup(normalized, { all: true, verbatim: true });
  const usableRecords = records.filter(
    (record): record is { address: string; family: 4 | 6 } =>
      (record.family === 4 || record.family === 6) && !isNonPublicAddress(record.address)
  );
  if (!records.length || usableRecords.length !== records.length) {
    throw new Error("That domain cannot be fetched safely.");
  }

  const selected = usableRecords[0];
  if (!selected) throw new Error("That domain cannot be fetched safely.");
  return {
    hostname: normalized,
    address: selected.address,
    family: selected.family
  };
}

export interface ResolvedPublicUrl extends ResolvedPublicHostname {
  url: URL;
}

export async function resolveSafePublicUrl(value: string): Promise<ResolvedPublicUrl> {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Only public HTTPS URLs are supported.");
  }
  const resolved = await resolvePublicHostname(parsed.hostname);
  return { url: parsed, ...resolved };
}

export async function assertSafePublicUrl(value: string): Promise<URL> {
  return (await resolveSafePublicUrl(value)).url;
}

const consumerEmailDomains = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "ymail.com"
]);

const disposableEmailDomainSet = new Set<string>(disposableEmailDomains);

function emailDomainIsListed(domain: string, blockedDomains: Set<string>): boolean {
  const labels = domain.split(".");
  for (let index = 0; index < labels.length - 1; index += 1) {
    if (blockedDomains.has(labels.slice(index).join("."))) return true;
  }
  return false;
}

function businessEmailIsAllowlisted(email: string, domain: string): boolean {
  const entries = (process.env.TRY_ME_BUSINESS_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return entries.some((entry) => entry === email || entry.replace(/^@/, "") === domain);
}

export function assertBusinessEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1];
  if (!domain) {
    throw new Error("Use your business email to keep this experience.");
  }
  if (businessEmailIsAllowlisted(normalized, domain)) return normalized;
  if (
    emailDomainIsListed(domain, consumerEmailDomains) ||
    emailDomainIsListed(domain, disposableEmailDomainSet)
  ) {
    throw new Error("Use your business email to keep this experience.");
  }
  return normalized;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.min(Math.max(local.length - 2, 2), 8))}@${domain}`;
}
