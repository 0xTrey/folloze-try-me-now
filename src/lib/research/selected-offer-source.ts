import {
  isEvidenceBackedOfferEvidence,
  type ExtractedOfferEvidence
} from "./offer-recommendations";

function labelKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Resolves only one unambiguous, seller-owned official offer URL. */
export function selectedOfferSourceUrl(input: {
  label?: string;
  evidence: readonly ExtractedOfferEvidence[];
  sellerDomains: readonly string[];
}): string | undefined {
  const selected = labelKey(input.label ?? "");
  if (!selected) return undefined;
  const domains = new Set(input.sellerDomains.map((value) => value.replace(/^www\./i, "").toLowerCase()));
  const matches = input.evidence.filter((item) => {
    if (item.source !== "official-page" && item.source !== "supplied-url") return false;
    if (labelKey(item.label) !== selected || !item.sourceUrl || item.confidence < 0.55 || !isEvidenceBackedOfferEvidence(item)) return false;
    try {
      const url = new URL(item.sourceUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      const path = url.pathname.replace(/\/+$/, "").toLowerCase();
      if (!domains.has(host) || !path || path === "/") return false;
      if (/\/(?:about|insights|news|blog|articles?|resources?|contact|careers|industries?)(?:\/|$)/i.test(path)) return false;
      return true;
    } catch { return false; }
  });
  const urls = [...new Set(matches.map((item) => {
    const url = new URL(item.sourceUrl!);
    url.hash = "";
    url.search = "";
    return url.toString();
  }))];
  return urls.length === 1 ? urls[0] : undefined;
}
