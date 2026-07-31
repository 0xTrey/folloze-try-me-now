import { BlockList, isIP } from "node:net";
import { promises as dns } from "node:dns";

import disposableEmailDomains from "disposable-email-domains";
import { z } from "zod";

import {
  CTA_TYPES,
  EXPERIENCE_BLOCK_IDS,
  LAYOUT_VARIANTS,
  PREVIEW_INTERACTION_TYPES,
  STYLE_VARIANTS,
  TONE_VARIANTS,
  USE_CASES
} from "@/lib/types";

const domainPattern = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const createSessionSchema = z.object({
  useCase: z.enum(USE_CASES),
  companyDomain: z.string().min(3).max(300),
  exampleMode: z.boolean().optional(),
  exampleKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/).optional()
}).strict();

const httpsDestinationSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port
      );
    } catch {
      return false;
    }
  }, "Use a public HTTPS destination.");

const assetIdSchema = z.string().min(4).max(96).regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const answersSchema = z
  .object({
    targetDomain: z.string().max(300).optional(),
    audience: z.string().min(2).max(120).optional(),
    customAudience: z.string().min(2).max(160).optional(),
    objective: z.string().min(2).max(120).optional(),
    campaignType: z.enum(["product", "demand", "event"]).optional(),
    eventSource: z.string().max(1000).optional(),
    sourceUrl: z.string().max(1000).optional(),
    exampleMode: z.boolean().optional(),
    exampleKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
    sourceConfirmed: z.boolean().optional(),
    messageBelief: z.string().trim().min(4).max(240).optional(),
    messageAction: z.string().trim().min(2).max(160).optional(),
    ctaType: z.enum(CTA_TYPES).optional(),
    // An empty value is an explicit "clear" operation. The orchestrator removes
    // it from the stored answers so only validated HTTPS destinations persist.
    ctaDestination: z.union([httpsDestinationSchema, z.literal("")]).optional(),
    styleVariant: z.enum(STYLE_VARIANTS).optional(),
    toneVariant: z.enum(TONE_VARIANTS).optional(),
    layoutVariant: z.enum(LAYOUT_VARIANTS).optional(),
    selectedAssetIds: z.array(assetIdSchema).max(12).optional()
  })
  .strict();

const blockControlSchema = z
  .object({
    id: z.enum(EXPERIENCE_BLOCK_IDS),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    eyebrow: z.string().trim().min(2).max(52).optional(),
    headline: z.string().trim().min(4).max(160).optional(),
    body: z.string().trim().min(8).max(500).optional(),
    ctaLabel: z.string().trim().min(2).max(48).optional()
  })
  .strict();

export const sessionWorkspacePatchSchema = z
  .object({
    operation: z.literal("update-workspace"),
    answers: answersSchema.optional(),
    selectedAudienceRecommendationId: assetIdSchema.nullable().optional(),
    evidenceDecisions: z
      .array(
        z
          .object({
            id: assetIdSchema,
            disposition: z.enum(["available", "pinned", "excluded"])
          })
          .strict()
      )
      .max(12)
      .optional(),
    sourceConfirmation: z.enum(["unconfirmed", "confirmed", "rejected"]).optional(),
    blockControls: z.array(blockControlSchema).max(EXPERIENCE_BLOCK_IDS.length).optional()
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.answers ||
          value.selectedAudienceRecommendationId !== undefined ||
          value.evidenceDecisions ||
          value.sourceConfirmation ||
          value.blockControls
      ),
    "Include at least one workspace change."
  )
  .superRefine((value, context) => {
    const evidenceIds = value.evidenceDecisions?.map((decision) => decision.id) ?? [];
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      context.addIssue({ code: "custom", message: "Evidence decisions must be unique." });
    }
    const blockIds = value.blockControls?.map((control) => control.id) ?? [];
    if (new Set(blockIds).size !== blockIds.length) {
      context.addIssue({ code: "custom", message: "Block controls must be unique." });
    }
  });

export const sessionOperationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("preview-interaction"),
      event: z.enum(PREVIEW_INTERACTION_TYPES),
      elementId: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_.:-]*$/i).optional(),
      value: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9 _.,:+/-]*$/i).optional()
    })
    .strict(),
  z
    .object({
      operation: z.literal("duplicate"),
      mode: z.enum(["duplicate", "version"]),
      label: z.string().trim().min(2).max(80).optional()
    })
    .strict()
]);

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
