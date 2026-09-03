import { createHash } from "node:crypto";

import { getDomain } from "tldts";

import { normalizeDomain } from "@/lib/validation";
import type { PersonalizationTargetInput } from "@/lib/personalization-request-store";

// These are bounded, public demo accounts. They are deliberately defaults for
// an illustrative experience, not a claim about visitor intent or account fit.
const DEFAULT_TARGETS = [
  ["cisco.com", "Technology leader"],
  ["target.com", "Retail operations leader"],
  ["unitedhealthgroup.com", "Healthcare operations leader"],
  ["toyota.com", "Manufacturing transformation leader"],
  ["salesforce.com", "Revenue Operations leader"],
  ["adobe.com", "Digital Experience leader"],
  ["servicenow.com", "IT Operations leader"],
  ["lenovo.com", "Infrastructure leader"],
  ["nike.com", "Customer experience leader"],
  ["nvidia.com", "AI Infrastructure leader"]
] as const;

function roleFromAudience(audience: string | undefined, fallback: string): string {
  if (!audience) return fallback;
  const value = audience.replace(/\s+/g, " ").trim();
  if (!value || value.length > 120) return fallback;
  if (/finance|cfo|controller|accounting/i.test(value)) return "Finance leader";
  if (/it|technology|cio|platform|infrastructure/i.test(value)) return "IT leader";
  if (/revenue|sales|marketing|demand/i.test(value)) return "Revenue leader";
  if (/operations|operational/i.test(value)) return "Operations leader";
  return fallback;
}

export function selectDefaultPersonalizationTargets(input: {
  requestId: string;
  sellerDomain: string;
  audience?: string;
}): [PersonalizationTargetInput, PersonalizationTargetInput, PersonalizationTargetInput] {
  const seller = normalizeDomain(input.sellerDomain);
  const sellerRegistrableDomain = getDomain(seller) ?? seller;
  const pool = DEFAULT_TARGETS.filter(([domain]) =>
    (getDomain(domain) ?? domain) !== sellerRegistrableDomain
  );
  const seed = createHash("sha256").update(input.requestId).digest().readUInt32BE(0);
  const start = seed % pool.length;
  const selected = Array.from({ length: 3 }, (_, index) => pool[(start + index) % pool.length]!);
  return selected.map(([domain, fallback]) => ({
    domain,
    role: roleFromAudience(input.audience, fallback)
  })) as [PersonalizationTargetInput, PersonalizationTargetInput, PersonalizationTargetInput];
}
