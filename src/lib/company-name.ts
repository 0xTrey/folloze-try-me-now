const MIXED_CASE_COMPANY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  datadog: "DataDog",
  docusign: "DocuSign",
  github: "GitHub",
  hubspot: "HubSpot",
  linkedin: "LinkedIn",
  mongodb: "MongoDB",
  netsuite: "NetSuite",
  paypal: "PayPal",
  salesloft: "SalesLoft",
  servicenow: "ServiceNow",
  youtube: "YouTube",
  zoominfo: "ZoomInfo"
});

const entityKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function domainRoot(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").split(".")[0] ?? "";
}

function cleanCandidate(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/\.(?:com|net|org)\s*$/i, "")
    .trim();
}

function matchingName(value: string | undefined, domain: string): string | undefined {
  if (!value) return undefined;
  const cleaned = cleanCandidate(value);
  if (!cleaned) return undefined;
  const rootKey = entityKey(domainRoot(domain));
  if (!rootKey) return undefined;

  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= Math.min(6, words.length - start); length += 1) {
      const phrase = words.slice(start, start + length).join(" ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
      if (entityKey(phrase) === rootKey) return phrase;
    }
  }

  return entityKey(cleaned) === rootKey ? cleaned : undefined;
}

function titleCandidates(title: string | undefined): string[] {
  if (!title) return [];
  return [title, ...title.split(/[|–—·]/)].map(cleanCandidate).filter(Boolean);
}

function structuredOrganizationNames(html: string): string[] {
  const names: string[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const queue: unknown[] = [JSON.parse(match[1].trim())];
      for (let inspected = 0; queue.length && inspected < 500; inspected += 1) {
        const value = queue.shift();
        if (Array.isArray(value)) {
          queue.push(...value.slice(0, 100));
          continue;
        }
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        const isOrganization = types.some(
          (type) => typeof type === "string" && /^(?:organization|corporation|brand)$/i.test(type)
        );
        if (isOrganization && typeof record.name === "string") names.push(record.name);
        queue.push(...Object.values(record).slice(0, 100));
      }
    } catch {
      // Invalid public metadata is ignored; the harvester has lower-priority signals.
    }
  }
  return names;
}

export function fallbackCompanyName(domain: string): string {
  const root = domainRoot(domain);
  const knownName = MIXED_CASE_COMPANY_NAMES[entityKey(root)];
  if (knownName) return knownName;
  return root
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolvePublicCompanyName(input: {
  domain: string;
  html: string;
  ogSiteName?: string;
  title?: string;
}): string {
  const knownName = MIXED_CASE_COMPANY_NAMES[entityKey(domainRoot(input.domain))];
  const candidates = [
    input.ogSiteName,
    ...structuredOrganizationNames(input.html),
    ...titleCandidates(input.title)
  ];
  const matched = candidates
    .map((candidate) => matchingName(candidate, input.domain))
    .find((candidate): candidate is string => Boolean(candidate));

  // Public page metadata establishes identity; the small registry only repairs
  // casing for names whose capitalization cannot be inferred from the domain.
  return knownName ?? matched ?? fallbackCompanyName(input.domain);
}
