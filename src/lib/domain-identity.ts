import { getDomain, getDomainWithoutSuffix } from "tldts";

function hostnameFromDomainLike(value: string): string {
  const candidate = value.trim().toLocaleLowerCase();
  if (!candidate) return "";
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
