import { isIP } from "node:net";
import { promises as dns } from "node:dns";

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
    sourceUrl: z.string().max(1000).optional(),
    sourceName: z.string().max(255).optional()
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

const privateV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./
];

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "::" || address.startsWith("fc") || address.startsWith("fd")) {
    return true;
  }
  if (address.startsWith("fe80:")) return true;
  return privateV4.some((pattern) => pattern.test(address));
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = normalizeDomain(hostname);
  const records = await dns.lookup(normalized, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("That domain cannot be fetched safely.");
  }
}

export async function assertSafePublicUrl(value: string): Promise<URL> {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Only public HTTPS URLs are supported.");
  }
  await assertPublicHostname(parsed.hostname);
  return parsed;
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

export function assertBusinessEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1];
  if (!domain || consumerEmailDomains.has(domain)) {
    throw new Error("Use your business email to keep this experience.");
  }
  return normalized;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.min(Math.max(local.length - 2, 2), 8))}@${domain}`;
}
