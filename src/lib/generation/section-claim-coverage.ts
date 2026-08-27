/**
 * What a sentence of generated copy asserts, and what would have to be cited
 * for it to be honest.
 *
 * Checking numbers alone is not enough. "The only platform built for hospital
 * operations" cites nothing and contains no digits, and "Your Q3 consolidation
 * programme needs this" invents an account fact just as freely as a fabricated
 * percentage does. Every kind below is detected from the copy itself and
 * matched against the evidence kinds that could support it.
 */

import type { EvidenceKindV2 } from "@/lib/generation/three-family-contract";
import type { SectionEvidenceClaim } from "@/lib/generation/section-copy-types";

export type CopyClaimKind =
  | "numeric"
  | "currency"
  | "comparative"
  | "qualitative"
  | "product"
  | "account"
  | "offer"
  | "audience";

export interface DetectedCopyClaim {
  kind: CopyClaimKind;
  /** The asserting fragment, used to explain a rejection without quoting copy. */
  text: string;
}

/** Evidence kinds that can support a claim of each kind. */
const SUPPORTING_EVIDENCE: Record<CopyClaimKind, readonly EvidenceKindV2[]> = {
  numeric: ["seller_fact", "target_fact", "proof", "offer", "visitor_input"],
  currency: ["seller_fact", "target_fact", "proof", "offer", "visitor_input"],
  comparative: ["proof", "seller_fact", "third_party_context"],
  qualitative: ["proof", "third_party_context"],
  product: ["seller_fact", "proof", "asset"],
  account: ["target_fact"],
  offer: ["offer"],
  audience: ["audience", "visitor_input"]
};

const NUMERIC =
  /\b\d[\d,.]*\s?(?:%|\b(?:percent|x|hours?|days?|weeks?|months?|years?|users?|customers?|teams?|sites?)\b)/gi;
const CURRENCY = /[$£€]\s?\d[\d,.]*(?:\s?[kmb]\b)?/gi;
const COMPARATIVE =
  /\b(?:\d+x|(?:faster|slower|cheaper|better|worse|more|less|fewer|higher|lower|stronger|safer)\b[^.!?]{0,48}?\bthan\b)/gi;
/**
 * Superlatives and category claims. These read as verifiable to a buyer even
 * though they name no figure, so they need third-party or proof evidence.
 */
const QUALITATIVE =
  /\b(?:the only|industry[- ]leading|world[- ]class|best[- ]in[- ]class|market[- ]leading|number one|#1|fastest|cheapest|safest|most (?:advanced|complete|trusted|secure)|unmatched|unparalleled)\b/gi;

/**
 * Kinds a claim could carry when it was recorded without an exact kind. Source
 * role is coarser than kind, so an unlabelled claim is treated as any kind its
 * role admits rather than as unusable.
 */
const ROLE_KINDS: Record<SectionEvidenceClaim["sourceRole"], readonly EvidenceKindV2[]> = {
  visitor: ["visitor_input"],
  seller: ["seller_fact"],
  target: ["target_fact"],
  offer: ["offer"],
  source: ["proof", "third_party_context"]
};

function possibleKinds(claim: SectionEvidenceClaim): readonly EvidenceKindV2[] {
  return claim.kind ? [claim.kind] : ROLE_KINDS[claim.sourceRole];
}

/** Terms distinctive enough that sharing them signals the same subject. */
function distinctiveTerms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 4)
  );
}

const SHARED_TERMS_FOR_ENTITY_CLAIM = 2;

function literalClaims(text: string): DetectedCopyClaim[] {
  const detected: DetectedCopyClaim[] = [];
  const scan = (pattern: RegExp, kind: CopyClaimKind) => {
    for (const match of text.matchAll(pattern)) {
      detected.push({ kind, text: match[0].trim() });
    }
  };
  scan(CURRENCY, "currency");
  scan(NUMERIC, "numeric");
  scan(COMPARATIVE, "comparative");
  scan(QUALITATIVE, "qualitative");
  return detected;
}

/**
 * Claims about a product, account, offer, or audience, recognized by the copy
 * discussing the same subject as evidence of that kind. Two distinctive shared
 * terms is the threshold: one is a coincidence of ordinary business vocabulary,
 * two means the sentence is describing that source's subject matter.
 */
function entityClaims(
  text: string,
  evidence: readonly SectionEvidenceClaim[]
): DetectedCopyClaim[] {
  const copyTerms = distinctiveTerms(text);
  if (!copyTerms.size) return [];
  const detected: DetectedCopyClaim[] = [];
  const byKind: Partial<Record<CopyClaimKind, string[]>> = {};

  for (const claim of evidence) {
    const kind = entityClaimKindFor(claim);
    if (!kind) continue;
    const shared = [...distinctiveTerms(claim.text)].filter((term) => copyTerms.has(term));
    if (shared.length < SHARED_TERMS_FOR_ENTITY_CLAIM) continue;
    byKind[kind] = [...(byKind[kind] ?? []), ...shared];
  }
  for (const [kind, shared] of Object.entries(byKind)) {
    detected.push({
      kind: kind as CopyClaimKind,
      text: [...new Set(shared)].sort().slice(0, 4).join(" ")
    });
  }
  return detected;
}

function entityClaimKindFor(claim: SectionEvidenceClaim): CopyClaimKind | undefined {
  const kinds = possibleKinds(claim);
  if (kinds.length !== 1) return undefined;
  switch (kinds[0]) {
    case "seller_fact":
    case "asset":
      return "product";
    case "target_fact":
      return "account";
    case "offer":
      return "offer";
    case "audience":
    case "visitor_input":
      return "audience";
    default:
      return undefined;
  }
}

/** Every claim the copy makes, in a stable order. */
export function detectCopyClaims(
  text: string,
  evidence: readonly SectionEvidenceClaim[]
): DetectedCopyClaim[] {
  return [...literalClaims(text), ...entityClaims(text, evidence)];
}

/**
 * Claims the cited evidence does not support.
 *
 * A literal claim needs an evidence text that actually contains it; a
 * paraphrase of a figure is still an invented figure. An entity claim needs a
 * citation of the right kind, because the subject is what has to be sourced.
 */
export function unsupportedCopyClaims(input: {
  text: string;
  citedRefs: readonly string[];
  evidence: readonly SectionEvidenceClaim[];
}): DetectedCopyClaim[] {
  const cited = new Set(input.citedRefs);
  const citedClaims = input.evidence.filter((claim) => cited.has(claim.id));
  return detectCopyClaims(input.text, input.evidence).filter((claim) => {
    const supporting = SUPPORTING_EVIDENCE[claim.kind];
    const usable = citedClaims.filter((evidence) =>
      possibleKinds(evidence).some((kind) => supporting.includes(kind))
    );
    if (!usable.length) return true;
    if (claim.kind === "product" || claim.kind === "account"
      || claim.kind === "offer" || claim.kind === "audience") {
      return false;
    }
    return !usable.some((evidence) =>
      evidence.text.toLocaleLowerCase().includes(claim.text.toLocaleLowerCase())
    );
  });
}
