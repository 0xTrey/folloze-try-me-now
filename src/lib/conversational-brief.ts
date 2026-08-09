export type ConversationalUseCase = "abm" | "campaign" | "content";
export type BriefConfidence = "high" | "medium" | "low";
export type BriefProvenanceKind = "explicit-url" | "explicit-domain" | "explicit-phrase";

export interface BriefProvenance {
  kind: BriefProvenanceKind;
  excerpt: string;
}

export interface BriefHint {
  value: string;
  confidence: BriefConfidence;
  provenance: BriefProvenance;
}

export interface ConversationalBriefInterpretation {
  useCase: ConversationalUseCase;
  normalizedIntent: string;
  sourceUrl?: BriefHint;
  domain?: BriefHint;
  targetAccount?: BriefHint;
  offer?: BriefHint;
  audience?: BriefHint;
  objective?: BriefHint;
  cta?: BriefHint;
  campaignType?: BriefHint;
  confidence: BriefConfidence;
}

const URL_CANDIDATE = /https?:\/\/[^\s<>"'`\])}]+/gi;
const DOMAIN_CANDIDATE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;
const PUBLIC_DOMAIN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const SENSITIVE_URL_PART = /(?:access[_-]?token|api[_-]?key|auth(?:entication)?|password|secret|signature|sig|token)=/i;

function normalizeIntent(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_000);
}

function hint(value: string, confidence: BriefConfidence, kind: BriefProvenanceKind, excerpt: string): BriefHint {
  return { value, confidence, provenance: { kind, excerpt } };
}

// This parser runs in the browser. Keep its syntactic domain check local so
// the client bundle never imports the server-only DNS and node:net validators.
function normalizePublicDomain(value: string): string {
  const candidate = value.trim().toLowerCase();
  const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  if (parsed.username || parsed.password || parsed.port) throw new Error("unsupported");
  const hostname = parsed.hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (!PUBLIC_DOMAIN.test(hostname)) throw new Error("not-public-domain");
  return hostname;
}

function publicHttpsUrl(candidate: string): string | undefined {
  const cleaned = candidate.replace(TRAILING_PUNCTUATION, "");
  try {
    const parsed = new URL(cleaned);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      SENSITIVE_URL_PART.test(parsed.search)
    ) return undefined;
    // Validate against the shared public-domain rules without canonicalizing
    // the URL host; the source fetcher must receive the URL the visitor gave.
    normalizePublicDomain(parsed.hostname);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function firstPublicHttpsUrl(intent: string): BriefHint | undefined {
  for (const match of intent.matchAll(URL_CANDIDATE)) {
    const url = publicHttpsUrl(match[0]);
    if (url) return hint(url, "high", "explicit-url", match[0]);
  }
  return undefined;
}

function firstPublicDomain(intent: string, url?: BriefHint): BriefHint | undefined {
  if (url) {
    return hint(new URL(url.value).hostname.replace(/^www\./i, ""), "high", "explicit-domain", url.provenance.excerpt);
  }
  // Do not rescue a hostname from a rejected URL (credentials, a local host,
  // or a secret-bearing query must result in no candidate at all).
  const withoutUrls = intent.replace(URL_CANDIDATE, " ");
  for (const match of withoutUrls.matchAll(DOMAIN_CANDIDATE)) {
    try {
      const domain = normalizePublicDomain(match[0]);
      return hint(domain, "high", "explicit-domain", match[0]);
    } catch {
      // A domain-looking token is not evidence until it passes the shared validator.
    }
  }
  return undefined;
}

function phraseAfter(intent: string, expression: RegExp): string | undefined {
  const match = expression.exec(intent);
  const value = match?.[1]?.replace(/\s+/g, " ").trim().replace(TRAILING_PUNCTUATION, "");
  return value && value.length >= 2 && value.length <= 160 ? value : undefined;
}

function extractAudience(intent: string): BriefHint | undefined {
  const matched = phraseAfter(
    intent,
    /\b(?:for|targeting|to)\s+(?:the\s+)?([a-z][a-z\s&/-]{1,100}?(?:leaders|managers|owners|architects|executives|operators|professionals|buyers|teams|decision-makers|decision makers|prospects))\b/i
  );
  const value = matched?.replace(/^.*\b(?:for|targeting|to)\s+/i, "");
  return value ? hint(value, "high", "explicit-phrase", value) : undefined;
}

function extractObjective(intent: string): { objective?: BriefHint; cta?: BriefHint } {
  const rules: Array<[RegExp, string, string]> = [
    [/\b(?:request|drive|generate)\s+(?:a\s+)?(?:service\s+)?quote\b/i, "Request a quote", "Request a quote"],
    [/\b(?:book|schedule)\s+(?:a\s+)?(?:meeting|demo|conversation)\b/i, "Book a meeting", "Book a meeting"],
    [/\b(?:register|registration|sign\s*up)\b/i, "Drive registrations", "Register"],
    [/\bdrive\s+downloads\b/i, "Drive downloads", "Download"],
    [/\b(?:download|get)\s+(?:the\s+)?(?:report|guide|asset|content)\b/i, "Drive downloads", "Download"],
    [/\b(?:launch|promote|introduce|announce)\b/i, "Generate demand", "Explore the offer"]
  ];
  for (const [expression, objective, cta] of rules) {
    const match = expression.exec(intent);
    if (match) {
      return {
        objective: hint(objective, "medium", "explicit-phrase", match[0]),
        cta: hint(cta, "medium", "explicit-phrase", match[0])
      };
    }
  }
  return {};
}

function extractCampaignType(intent: string): BriefHint | undefined {
  const rules: Array<[RegExp, string]> = [
    [/\b(?:event|webinar|virtual summit)\b/i, "event"],
    [/\b(?:demand generation|demand gen)\b/i, "demand"],
    [/\b(?:product|solution|landing page|launch)\b/i, "product"]
  ];
  for (const [expression, value] of rules) {
    const match = expression.exec(intent);
    if (match) return hint(value, "medium", "explicit-phrase", match[0]);
  }
  return undefined;
}

function extractOffer(intent: string): BriefHint | undefined {
  const value = phraseAfter(
    intent,
    /\b(?:promote|launch|introduce|announce)\s+(?:my\s+|our\s+|the\s+)?([^,.!?]+?)(?:\s+(?:for|to|targeting)\s+|$)/i
  );
  return value ? hint(value, "medium", "explicit-phrase", value) : undefined;
}

function extractTargetAccount(intent: string, domain?: BriefHint): BriefHint | undefined {
  const value = phraseAfter(
    intent,
    /\b(?:for|targeting)\s+(?:the\s+)?(?:account\s+)?([A-Z][A-Za-z0-9&.' -]{1,80})(?:\s+(?:at|account|team|buyers|leaders)|[,.!?]|$)/
  );
  if (value) return hint(value, "medium", "explicit-phrase", value);
  if (domain) return hint(domain.value, "high", "explicit-domain", domain.provenance.excerpt);
  return undefined;
}

function overallConfidence(hints: Array<BriefHint | undefined>): BriefConfidence {
  if (hints.some((candidate) => candidate?.confidence === "high")) return "high";
  if (hints.some((candidate) => candidate?.confidence === "medium")) return "medium";
  return "low";
}

/**
 * Safely projects one short natural-language entry into a reviewable brief.
 * It is deliberately deterministic: it never performs I/O, invokes an LLM,
 * mutates a session, or treats a weak pattern match as verified research.
 */
export function interpretConversationalBrief(
  rawIntent: string,
  useCase: ConversationalUseCase
): ConversationalBriefInterpretation {
  const normalizedIntent = normalizeIntent(rawIntent);
  const sourceUrl = firstPublicHttpsUrl(normalizedIntent);
  const domain = firstPublicDomain(normalizedIntent, sourceUrl);
  const objective = extractObjective(normalizedIntent);
  const audience = extractAudience(normalizedIntent);
  const campaignType = useCase === "campaign" ? extractCampaignType(normalizedIntent) : undefined;
  const offer = useCase === "content" ? undefined : extractOffer(normalizedIntent);
  const targetAccount = useCase === "abm" ? extractTargetAccount(normalizedIntent, domain) : undefined;

  return {
    useCase,
    normalizedIntent,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(domain ? { domain } : {}),
    ...(targetAccount ? { targetAccount } : {}),
    ...(offer ? { offer } : {}),
    ...(audience ? { audience } : {}),
    ...(objective.objective ? { objective: objective.objective } : {}),
    ...(objective.cta ? { cta: objective.cta } : {}),
    ...(campaignType ? { campaignType } : {}),
    confidence: overallConfidence([sourceUrl, domain, targetAccount, offer, audience, objective.objective, campaignType])
  };
}
