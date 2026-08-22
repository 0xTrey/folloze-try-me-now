import { getDomain, getDomainWithoutSuffix } from "tldts";

import type {
  EvidenceValue,
  ProductionArtifact
} from "@/lib/orchestration/worker-types";

function hostnameFromDomainLike(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return "";
  if (candidate.includes("@")) return "";
  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`)
      .hostname
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  } catch {
    return candidate
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      ?.replace(/\.$/, "") ?? "";
  }
}

/**
 * Return the registrable company domain while preserving the submitted host
 * everywhere else. This turns regional hosts such as usa.philips.com into
 * philips.com without breaking multi-part suffixes such as acme.co.uk.
 */
export function registrableCompanyDomain(value: string): string {
  const hostname = hostnameFromDomainLike(value);
  if (!hostname) return "";
  return getDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
}

/** The brand-bearing label from a domain, excluding regional subdomains. */
export function companyDomainStem(value: string): string {
  const registrable = registrableCompanyDomain(value);
  if (!registrable) return "";
  return getDomainWithoutSuffix(registrable, { allowPrivateDomains: true }) ??
    registrable.split(".")[0] ??
    "";
}

/** Whether two hosts are regional or application hosts of the same company domain. */
export function sharesRegistrableCompanyDomain(left: string, right: string): boolean {
  const leftDomain = registrableCompanyDomain(left);
  const rightDomain = registrableCompanyDomain(right);
  return Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
}

export type IdentityDomainEvidenceKind =
  | "alias"
  | "canonical-domain"
  | "redirect";

export interface IdentityDomainEvidence {
  kind: IdentityDomainEvidenceKind;
  domain: string;
  companyName?: string;
}

export interface NormalizeCompanyIdentityInput {
  sessionId: string;
  revision: number;
  submittedDomain: string;
  companyName?: EvidenceValue<string>;
  domainEvidence?: readonly EvidenceValue<IdentityDomainEvidence>[];
  /** Untrusted candidates are accepted only when corroborated by trusted evidence. */
  candidateAliases?: readonly string[];
  startedAt?: string;
  completedAt?: string;
}

export interface NormalizedCompanyIdentity {
  name: string;
  canonicalDomain: string;
  aliases: string[];
  rejectedAliases: string[];
  revisionFingerprint: string;
  evidence: {
    name: EvidenceValue<string>;
    canonicalDomain: EvidenceValue<string>;
    aliases: EvidenceValue<string>[];
  };
}

interface ParsedCompanyDomain {
  hostname: string;
  registrableDomain: string;
}

interface ParsedDomainEvidence {
  evidence: EvidenceValue<IdentityDomainEvidence>;
  hostname: string;
  registrableDomain: string;
}

const CROSS_DOMAIN_CONFIDENCE_FLOOR = 0.8;
const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function parseCompanyDomain(value: string): ParsedCompanyDomain | null {
  const hostname = hostnameFromDomainLike(value);
  if (!hostname || hostname.includes(" ") || !/^[a-z0-9.-]+$/i.test(hostname)) return null;
  const domain = getDomain(hostname, { allowPrivateDomains: true });
  if (!domain || !domain.includes(".")) return null;
  return { hostname, registrableDomain: domain };
}

function boundedConfidence(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function normalizeCompanyName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function fallbackIdentityName(domain: string): string {
  const stem = companyDomainStem(domain);
  return stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fnv1a64(value: string): string {
  let hash = FNV_OFFSET_64;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function identityRevisionFingerprint(
  revision: number,
  identity: Pick<NormalizedCompanyIdentity, "name" | "canonicalDomain" | "aliases">
): string {
  const canonicalValue = JSON.stringify({
    version: 1,
    revision,
    name: identity.name,
    canonicalDomain: identity.canonicalDomain,
    aliases: [...identity.aliases].sort()
  });
  return [0, 1, 2, 3]
    .map((salt) => fnv1a64(`${salt}:${canonicalValue}`))
    .join("");
}

function compareEvidence<T>(left: EvidenceValue<T>, right: EvidenceValue<T>): number {
  return boundedConfidence(right.confidence) - boundedConfidence(left.confidence)
    || left.source.localeCompare(right.source)
    || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value));
}

function failedIdentityArtifact(
  input: NormalizeCompanyIdentityInput,
  startedAt: string,
  completedAt: string,
  errorCode: string
): ProductionArtifact<NormalizedCompanyIdentity> {
  return {
    worker: "identity-normalizer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: "failed",
    evidenceRefs: [],
    confidence: 0,
    startedAt,
    completedAt,
    errorCode
  };
}

/**
 * Compile a revision-bound company identity from submitted and observed public
 * domain evidence. Cross-domain aliases are never inferred from spelling.
 */
export function normalizeCompanyIdentity(
  input: NormalizeCompanyIdentityInput
): ProductionArtifact<NormalizedCompanyIdentity> {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const startedAt = input.startedAt ?? completedAt;
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failedIdentityArtifact(input, startedAt, completedAt, "invalid_revision");
  }

  const submitted = parseCompanyDomain(input.submittedDomain);
  if (!submitted) {
    return failedIdentityArtifact(input, startedAt, completedAt, "invalid_submitted_domain");
  }

  const rejectedAliases: string[] = [];
  const parsedEvidence: ParsedDomainEvidence[] = [];
  for (const item of input.domainEvidence ?? []) {
    const parsed = parseCompanyDomain(item.value.domain);
    if (!parsed) {
      rejectedAliases.push(item.value.domain.trim().toLowerCase());
      continue;
    }
    const sameSubmittedCompany =
      parsed.registrableDomain === submitted.registrableDomain;
    if (
      !sameSubmittedCompany &&
      boundedConfidence(item.confidence) < CROSS_DOMAIN_CONFIDENCE_FLOOR
    ) {
      rejectedAliases.push(parsed.hostname);
      continue;
    }
    parsedEvidence.push({
      evidence: {
        ...item,
        confidence: boundedConfidence(item.confidence),
        value: {
          ...item.value,
          domain: parsed.hostname,
          ...(item.value.companyName
            ? { companyName: normalizeCompanyName(item.value.companyName) }
            : {})
        }
      },
      ...parsed
    });
  }

  const canonicalCandidate = parsedEvidence
    .filter(({ evidence }) =>
      evidence.value.kind === "canonical-domain" ||
      evidence.value.kind === "redirect"
    )
    .sort((left, right) => {
      const kindPriority = (kind: IdentityDomainEvidenceKind) =>
        kind === "canonical-domain" ? 2 : kind === "redirect" ? 1 : 0;
      return kindPriority(right.evidence.value.kind) - kindPriority(left.evidence.value.kind)
        || compareEvidence(left.evidence, right.evidence)
        || left.registrableDomain.localeCompare(right.registrableDomain);
    })[0];

  const canonicalDomain =
    canonicalCandidate?.registrableDomain ?? submitted.registrableDomain;
  const canonicalDomainEvidence: EvidenceValue<string> = canonicalCandidate
    ? {
        value: canonicalDomain,
        source: canonicalCandidate.evidence.source,
        confidence: canonicalCandidate.evidence.confidence,
        observedAt: canonicalCandidate.evidence.observedAt,
        revision: input.revision
      }
    : {
        value: canonicalDomain,
        source: "visitor_input",
        confidence: 0.65,
        observedAt: completedAt,
        revision: input.revision
      };

  const trustedRegistrableDomains = new Set([
    submitted.registrableDomain,
    ...parsedEvidence.map(({ registrableDomain }) => registrableDomain)
  ]);
  const aliasEvidence = new Map<string, EvidenceValue<string>>();
  const addAlias = (hostname: string, evidence: EvidenceValue<string>) => {
    if (hostname === canonicalDomain) return;
    const prior = aliasEvidence.get(hostname);
    if (!prior || compareEvidence(evidence, prior) < 0) {
      aliasEvidence.set(hostname, evidence);
    }
  };

  addAlias(submitted.hostname, {
    value: submitted.hostname,
    source: "visitor_input",
    confidence: 0.65,
    observedAt: completedAt,
    revision: input.revision
  });
  for (const item of parsedEvidence) {
    addAlias(item.hostname, {
      value: item.hostname,
      source: item.evidence.source,
      confidence: item.evidence.confidence,
      observedAt: item.evidence.observedAt,
      revision: input.revision
    });
  }

  for (const candidate of input.candidateAliases ?? []) {
    const parsed = parseCompanyDomain(candidate);
    if (!parsed) {
      rejectedAliases.push(candidate.trim().toLowerCase());
      continue;
    }
    if (!trustedRegistrableDomains.has(parsed.registrableDomain)) {
      rejectedAliases.push(parsed.hostname);
      continue;
    }
    addAlias(parsed.hostname, {
      value: parsed.hostname,
      source: "corroborated_alias",
      confidence: 0.65,
      observedAt: completedAt,
      revision: input.revision
    });
  }

  const aliases = [...aliasEvidence.keys()].sort();
  const aliasesWithEvidence = aliases.map((alias) => aliasEvidence.get(alias)!);
  const nameCandidates: EvidenceValue<string>[] = [];
  const suppliedName = input.companyName
    ? normalizeCompanyName(input.companyName.value)
    : "";
  if (input.companyName && suppliedName) {
    nameCandidates.push({
      ...input.companyName,
      value: suppliedName,
      confidence: boundedConfidence(input.companyName.confidence),
      revision: input.revision
    });
  }
  for (const item of parsedEvidence) {
    const companyName = item.evidence.value.companyName;
    if (!companyName) continue;
    nameCandidates.push({
      value: companyName,
      source: item.evidence.source,
      confidence: item.evidence.confidence,
      observedAt: item.evidence.observedAt,
      revision: input.revision
    });
  }
  const nameEvidence = nameCandidates.sort(compareEvidence)[0] ?? {
    value: fallbackIdentityName(canonicalDomain),
    source: canonicalDomainEvidence.source,
    confidence: Math.min(canonicalDomainEvidence.confidence, 0.5),
    observedAt: canonicalDomainEvidence.observedAt,
    revision: input.revision
  };

  const identityBase = {
    name: nameEvidence.value,
    canonicalDomain,
    aliases
  };
  const value: NormalizedCompanyIdentity = {
    ...identityBase,
    rejectedAliases: [...new Set(rejectedAliases.filter(Boolean))].sort(),
    revisionFingerprint: identityRevisionFingerprint(input.revision, identityBase),
    evidence: {
      name: nameEvidence,
      canonicalDomain: canonicalDomainEvidence,
      aliases: aliasesWithEvidence
    }
  };
  const evidenceRefs = [...new Set([
    canonicalDomainEvidence.source,
    nameEvidence.source,
    ...aliasesWithEvidence.map(({ source }) => source)
  ])].sort();

  return {
    worker: "identity-normalizer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: "complete",
    value,
    evidenceRefs,
    confidence: Math.min(
      canonicalDomainEvidence.confidence,
      nameEvidence.confidence
    ),
    startedAt,
    completedAt
  };
}
