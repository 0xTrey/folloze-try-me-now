import type { CampaignGenerationContext } from "@/lib/generation/campaign-context";

export const MESSAGE_SPINE_SECTION_USES = [
  "hero",
  "credibility",
  "urgency",
  "choice",
  "mechanism",
  "team",
  "cta"
] as const;

export type MessageSpineSectionUse = (typeof MESSAGE_SPINE_SECTION_USES)[number];
export type MessageSpineEvidenceConfidence = "high" | "medium" | "low";
export type MessageRouteFamily = "account" | "campaign" | "content";

/**
 * Internal strategy jargon that must never appear in prospect-visible chrome.
 * Live Brief / traces may still use internal reason codes.
 */
export const BUYER_FACING_JARGON_PATTERN =
  /\b(?:account thesis|decision paths?|decision lens(?:es)?|supporting proof|narrative arc|stakeholder map|buying committee)\b/i;

export const BUYER_FACING_NAVIGATION = {
  account: [
    "Overview",
    "Why it matters",
    "Where to start",
    "How it works",
    "For your team",
    "Evidence",
    "Next step"
  ],
  campaign: [
    "Overview",
    "Why it matters",
    "Where to start",
    "How it works",
    "For your team",
    "Evidence",
    "Next step"
  ],
  content: ["Key finding", "Explore", "Chapters", "Apply it", "Source", "Next step"]
} as const;

export const BUYER_FACING_JARGON_REPLACEMENTS: Record<string, string> = {
  "account thesis": "Overview",
  "decision path": "Where to start",
  "decision paths": "Where to start",
  "decision lens": "Where to start",
  "decision lenses": "Where to start",
  "supporting proof": "Evidence",
  "narrative arc": "Why it matters",
  "stakeholder map": "For your team",
  "buying committee": "For your team"
};

export interface MessageSpineEvidence {
  id: string;
  claim: string;
  sourceType: "seller" | "target" | "source" | "visitor";
  confidence: MessageSpineEvidenceConfidence;
  allowedUses: MessageSpineSectionUse[];
}

/**
 * A bounded editorial plan created before prose generation. It records what
 * the writer is allowed to say and prevents the page from treating a brand
 * name, generic category, or low-confidence source as a complete argument.
 */
export interface MessageSpineV2 {
  entities: {
    seller: { name: string; category: string };
    target?: { name: string };
    offer: { name: string; authority: "visitor" | "public-source" | "seller-context" };
    audience: { role: string; ownedJob: string };
  };
  proposition: {
    buyerJob: string;
    statusQuoTension?: string;
    supportedChange: string;
    businessOutcome: string;
    sellerMechanism: string;
    boundedNextDecision: string;
  };
  /**
   * One resolved persuasion plan for the selected route. Model work fills
   * these slots; it does not invent page geometry.
   */
  composition: ResolvedMessageComposition;
  evidence: MessageSpineEvidence[];
  unknowns: string[];
  editorial: {
    selectedAngle: "tension" | "upside" | "mechanism";
    rejectedAngles: Array<"tension" | "upside" | "mechanism">;
    specificityTerms: string[];
    prohibitedDeclarativeEvidenceIds: string[];
  };
}

/**
 * Every generated output resolves these slots. Unsupported optional slots are
 * omitted rather than filled with generic filler.
 */
export interface ResolvedMessageComposition {
  family: MessageRouteFamily;
  contract: MessageRouteContractId;
  audience: string;
  tension?: string;
  promise: string;
  mechanism: string;
  proofPlan: string;
  decisionHelp: string;
  nextAction: string;
  whyNow?: string;
  omittedSlots: Array<"tension" | "whyNow">;
  buyerFacingLabels: readonly string[];
}

export type MessageRouteContractId =
  | "account-named-opportunity"
  | "campaign-offer-path"
  | "campaign-event-session"
  | "content-source-companion";

export interface MessageSpineCopyCandidate {
  hero: string;
  mechanism: string;
  choices: [string, string, string];
  cta: string;
  evidenceIdsByUse: Partial<Record<MessageSpineSectionUse, string[]>>;
}

export type MessageCompositionQualityIssue =
  | "missing_audience"
  | "missing_promise"
  | "missing_mechanism"
  | "missing_proof_plan"
  | "missing_decision_help"
  | "missing_next_action"
  | "buyer_facing_jargon"
  | "generic_filler"
  | "unsupported_why_now";

export interface MessageCompositionQualityReview {
  status: "pass" | "soft-fail";
  issues: MessageCompositionQualityIssue[];
  /** Fail-soft: keep the best honest artifact; never blank the page. */
  composition: ResolvedMessageComposition;
}

const GENERIC_FILLER_PATTERN =
  /\b(?:make progress with confidence|a better way to move forward|unlock value|drive transformation|synerg(?:y|ies)|best[- ]in[- ]class|next[- ]level|holistic approach)\b/i;

const UNSUPPORTED_WHY_NOW_PATTERN =
  /\b(?:urgency is rising|act now before it(?:'s| is) too late|the market is shifting fast|now more than ever)\b/i;

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function concise(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,;:.]+$/g, "");
}

function tokens(value: string): string[] {
  return unique(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 4)
      .filter((token) => !new Set(["with", "that", "this", "from", "into", "their", "through", "company", "platform"]).has(token))
  );
}

function hasSpecificTerm(value: string, terms: string[]): boolean {
  const haystack = value.toLocaleLowerCase();
  return terms.some((term) => haystack.includes(term.toLocaleLowerCase()));
}

function offerAuthority(
  context: Omit<CampaignGenerationContext, "messageSpineV2">
): MessageSpineV2["entities"]["offer"]["authority"] {
  if (context.brief.offerOrSource.kind === "source") return "public-source";
  if (context.brief.offerOrSource.kind === "offer") return "visitor";
  return "seller-context";
}

function routeFamilyFor(
  context: Omit<CampaignGenerationContext, "messageSpineV2">
): MessageRouteFamily {
  const register = context.brief.campaignRegister;
  if (register === "one-to-one-abm") return "account";
  if (register === "content-magic") return "content";
  return "campaign";
}

function contractIdFor(
  family: MessageRouteFamily,
  context: Omit<CampaignGenerationContext, "messageSpineV2">
): MessageRouteContractId {
  if (family === "account") return "account-named-opportunity";
  if (family === "content") return "content-source-companion";
  if (context.brief.campaignSubtype === "event" || context.brief.eventContext) {
    return "campaign-event-session";
  }
  return "campaign-offer-path";
}

function isSupportedWhyNow(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  if (GENERIC_FILLER_PATTERN.test(value) || UNSUPPORTED_WHY_NOW_PATTERN.test(value)) return false;
  // Require an explicit visitor/public/source anchor rather than invented urgency.
  return /\b(?:visitor|supplied|approved source|event|promoted offer|public)\b/i.test(value);
}

function isSupportedTension(claim: string | undefined, confidence?: MessageSpineEvidenceConfidence): claim is string {
  if (!claim?.trim()) return false;
  if (confidence === "low") return false;
  if (GENERIC_FILLER_PATTERN.test(claim)) return false;
  return true;
}

/**
 * Replace banned internal labels with plain buyer language. Unknown jargon is
 * swapped to a safe fallback rather than left visible.
 */
export function sanitizeBuyerFacingLabel(label: string, fallback = "Overview"): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (!trimmed) return fallback;
  if (!BUYER_FACING_JARGON_PATTERN.test(trimmed)) return trimmed;

  const lower = trimmed.toLocaleLowerCase();
  for (const [jargon, replacement] of Object.entries(BUYER_FACING_JARGON_REPLACEMENTS)) {
    if (lower === jargon) return replacement;
  }
  // Longer labels that still contain internal jargon fail soft to the fallback
  // instead of producing mangled copy like "Choose the Where to start".
  return fallback;
}

export function containsBuyerFacingJargon(value: string): boolean {
  return BUYER_FACING_JARGON_PATTERN.test(value);
}

function resolveComposition(
  context: Omit<CampaignGenerationContext, "messageSpineV2">,
  evidence: MessageSpineEvidence[],
  proposition: MessageSpineV2["proposition"]
): ResolvedMessageComposition {
  const family = routeFamilyFor(context);
  const contract = contractIdFor(family, context);
  const { brief } = context;
  const targetFact = evidence.find((item) => item.sourceType === "target" && item.confidence !== "low");
  const omittedSlots: Array<"tension" | "whyNow"> = [];

  const tension = isSupportedTension(proposition.statusQuoTension, targetFact?.confidence)
    ? concise(proposition.statusQuoTension!, 180)
    : undefined;
  if (!tension) omittedSlots.push("tension");

  const whyNow = isSupportedWhyNow(brief.messageSpine.whyNow)
    ? concise(brief.messageSpine.whyNow!, 180)
    : undefined;
  if (!whyNow) omittedSlots.push("whyNow");

  const proofPlan =
    family === "content"
      ? concise(
          `Use only claims grounded in ${brief.sourceTitle ?? "the approved source"} and cite the source when a finding is shown.`,
          220
        )
      : concise(brief.messageSpine.proofPolicy, 220);

  const decisionHelp =
    family === "account"
      ? concise(
          `Help ${brief.audience} choose one validation question ${brief.targetAccount ? `for ${brief.targetAccount.name}` : "for the account"} before expanding scope.`,
          200
        )
      : family === "content"
        ? concise(
            `Help ${brief.audience} apply one supported finding from ${brief.sourceTitle ?? "the source"} to their next decision.`,
            200
          )
        : concise(
            `Help ${brief.audience} pick one useful path through ${brief.offerOrSource.name} without inventing unsupported proof.`,
            200
          );

  return {
    family,
    contract,
    audience: brief.audience,
    ...(tension ? { tension } : {}),
    promise: concise(proposition.supportedChange, 220),
    mechanism: concise(proposition.sellerMechanism, 220),
    proofPlan,
    decisionHelp,
    nextAction: concise(proposition.boundedNextDecision || brief.messageSpine.nextAction, 140),
    ...(whyNow ? { whyNow } : {}),
    omittedSlots,
    buyerFacingLabels: BUYER_FACING_NAVIGATION[family]
  };
}

/**
 * Bounded quality gate. Soft-fails omit unsupported or jargon-bearing fields
 * instead of inventing filler or blocking the preview.
 */
export function reviewMessageCompositionQuality(
  composition: ResolvedMessageComposition
): MessageCompositionQualityReview {
  const issues: MessageCompositionQualityIssue[] = [];
  let next: ResolvedMessageComposition = {
    ...composition,
    omittedSlots: [...composition.omittedSlots],
    buyerFacingLabels: composition.buyerFacingLabels.map((label) => sanitizeBuyerFacingLabel(label))
  };

  const required: Array<[keyof ResolvedMessageComposition, MessageCompositionQualityIssue]> = [
    ["audience", "missing_audience"],
    ["promise", "missing_promise"],
    ["mechanism", "missing_mechanism"],
    ["proofPlan", "missing_proof_plan"],
    ["decisionHelp", "missing_decision_help"],
    ["nextAction", "missing_next_action"]
  ];
  for (const [key, issue] of required) {
    const value = next[key];
    if (typeof value !== "string" || !value.trim()) issues.push(issue);
  }

  const inspected = [next.audience, next.promise, next.mechanism, next.proofPlan, next.decisionHelp, next.nextAction, next.tension, next.whyNow]
    .filter((value): value is string => Boolean(value));
  if (inspected.some(containsBuyerFacingJargon)) {
    issues.push("buyer_facing_jargon");
    next = {
      ...next,
      audience: sanitizeBuyerFacingLabel(next.audience, "The selected audience"),
      promise: sanitizeBuyerFacingLabel(next.promise, "A supported change the buyer can evaluate"),
      mechanism: sanitizeBuyerFacingLabel(next.mechanism, "How the outcome is created"),
      proofPlan: sanitizeBuyerFacingLabel(next.proofPlan, "Evidence the team should validate"),
      decisionHelp: sanitizeBuyerFacingLabel(next.decisionHelp, "Choose one useful next decision"),
      nextAction: sanitizeBuyerFacingLabel(next.nextAction, "Take the next step"),
      ...(next.tension
        ? { tension: sanitizeBuyerFacingLabel(next.tension, "Why the current approach is costly") }
        : {}),
      ...(next.whyNow ? { whyNow: sanitizeBuyerFacingLabel(next.whyNow, "Why this timing matters") } : {})
    };
  }

  if (inspected.some((value) => GENERIC_FILLER_PATTERN.test(value))) {
    issues.push("generic_filler");
    if (next.tension && GENERIC_FILLER_PATTERN.test(next.tension)) {
      const { tension: _removed, ...rest } = next;
      next = {
        ...rest,
        omittedSlots: unique([...next.omittedSlots, "tension"])
      };
    }
  }

  if (next.whyNow && (UNSUPPORTED_WHY_NOW_PATTERN.test(next.whyNow) || GENERIC_FILLER_PATTERN.test(next.whyNow))) {
    issues.push("unsupported_why_now");
    const { whyNow: _removed, ...rest } = next;
    next = {
      ...rest,
      omittedSlots: unique([...next.omittedSlots, "whyNow"])
    };
  }

  return {
    status: issues.length ? "soft-fail" : "pass",
    issues,
    composition: next
  };
}

export function compileMessageSpine(
  context: Omit<CampaignGenerationContext, "messageSpineV2">
): MessageSpineV2 {
  const { brief } = context;
  const targetEvidence = brief.accountEvidence.evidenceItems;
  const sellerEvidence: MessageSpineEvidence[] = [
    {
      id: "seller.mechanism",
      claim: concise(brief.messageSpine.sellerPromise, 240),
      sourceType: "seller",
      confidence: brief.proofMode === "mechanism-only" ? "medium" : "high",
      allowedUses: ["hero", "credibility", "mechanism", "team", "cta"]
    }
  ];
  const targetFacts: MessageSpineEvidence[] = targetEvidence.map((item, index) => ({
    id: `target.${index + 1}`,
    claim: concise(item.text, 240),
    sourceType: "target",
    confidence: item.confidence,
    allowedUses: ["hero", "credibility", "urgency", "choice", "team"]
  }));
  const sourceFacts: MessageSpineEvidence[] =
    brief.offerOrSource.kind === "source" && brief.sourceTitle
      ? [
          {
            id: "source.title",
            claim: brief.sourceTitle,
            sourceType: "source",
            confidence: brief.sourceGrounding.confidence,
            allowedUses: ["hero", "credibility", "choice", "cta"]
          }
        ]
      : [];
  const visitorFacts: MessageSpineEvidence[] = [
    {
      id: "visitor.audience",
      claim: `${brief.audience} are the selected audience.`,
      sourceType: "visitor",
      confidence: "high",
      allowedUses: ["hero", "choice", "team", "cta"]
    },
    {
      id: "visitor.objective",
      claim: `The requested outcome is ${brief.campaignGoal}.`,
      sourceType: "visitor",
      confidence: "high",
      allowedUses: ["cta"]
    }
  ];
  const evidence = [...sellerEvidence, ...targetFacts, ...sourceFacts, ...visitorFacts];
  const selectedAngle: MessageSpineV2["editorial"]["selectedAngle"] = targetFacts.length
    ? "tension"
    : sourceFacts.length
      ? "upside"
      : "mechanism";
  const targetTerms = targetEvidence.flatMap((item) => item.signals);
  const sourceTerms = sourceFacts.flatMap((item) => tokens(item.claim));
  const sellerTerms = tokens(brief.seller.offer).slice(0, 3);
  const specificityTerms = unique([...targetTerms, ...sourceTerms, ...sellerTerms]).slice(0, 8);
  const unknowns = unique([
    ...brief.accountEvidence.unresolvedAxes,
    ...(brief.offerOrSource.confirmationStatus === "confirmed"
      ? []
      : ["The offer claim needs confirmation before it is stated as fact."])
  ]);

  const proposition: MessageSpineV2["proposition"] = {
    buyerJob: `Determine whether ${brief.offerOrSource.name} can support ${brief.campaignGoal.toLocaleLowerCase()}.`,
    ...(targetFacts.length && isSupportedTension(targetFacts[0]!.claim, targetFacts[0]!.confidence)
      ? { statusQuoTension: concise(targetFacts[0]!.claim, 180) }
      : {}),
    supportedChange: concise(brief.messageSpine.whyChange, 220),
    businessOutcome: concise(brief.campaignGoal, 140),
    sellerMechanism: concise(brief.messageSpine.sellerPromise, 220),
    boundedNextDecision: concise(brief.messageSpine.nextAction, 140)
  };

  const compositionReview = reviewMessageCompositionQuality(
    resolveComposition(context, evidence, proposition)
  );

  return {
    entities: {
      seller: { name: brief.seller.name, category: brief.seller.category },
      ...(brief.targetAccount ? { target: { name: brief.targetAccount.name } } : {}),
      offer: { name: brief.offerOrSource.name, authority: offerAuthority(context) },
      audience: {
        role: brief.audience,
        ownedJob: `Evaluate ${brief.offerOrSource.name} against ${brief.campaignGoal.toLocaleLowerCase()}.`
      }
    },
    proposition,
    composition: compositionReview.composition,
    evidence,
    unknowns,
    editorial: {
      selectedAngle,
      rejectedAngles: (["tension", "upside", "mechanism"] as const).filter(
        (angle) => angle !== selectedAngle
      ),
      specificityTerms,
      prohibitedDeclarativeEvidenceIds: evidence
        .filter((item) => item.confidence === "low")
        .map((item) => item.id)
    }
  };
}

/**
 * Future generation and repair passes can call this before accepting prose.
 * It operates only on the compact candidate shape so the renderer and current
 * OpenAI response contract remain untouched in this first implementation.
 */
export function messageSpineCopyFailure(
  spine: MessageSpineV2,
  candidate: MessageSpineCopyCandidate
): string | undefined {
  const usedEvidence = Object.entries(candidate.evidenceIdsByUse).flatMap(([use, ids]) =>
    (ids ?? []).map((id) => ({ use: use as MessageSpineSectionUse, id }))
  );
  const knownIds = new Set(spine.evidence.map((item) => item.id));
  if (usedEvidence.some(({ id }) => !knownIds.has(id))) return "message_spine_unknown_evidence";
  if (
    usedEvidence.some(
      ({ use, id }) =>
        ["hero", "credibility", "urgency"].includes(use) &&
        spine.editorial.prohibitedDeclarativeEvidenceIds.includes(id)
    )
  ) {
    return "message_spine_low_confidence_declarative";
  }
  if (spine.editorial.specificityTerms.length && !hasSpecificTerm(candidate.hero, spine.editorial.specificityTerms)) {
    return "message_spine_generic_hero";
  }
  const normalizedChoices = candidate.choices.map((choice) => choice.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  if (new Set(normalizedChoices).size !== normalizedChoices.length) return "message_spine_repeated_choice";
  if (normalizedChoices.some((choice) => choice.split(/\s+/).length < 3)) return "message_spine_thin_choice";
  const offerTerms = tokens(spine.entities.offer.name);
  const mechanismTerms = tokens(spine.proposition.sellerMechanism);
  if (
    !hasSpecificTerm(`${candidate.hero} ${candidate.mechanism}`, offerTerms) ||
    !hasSpecificTerm(candidate.mechanism, mechanismTerms)
  ) {
    return "message_spine_offer_or_mechanism_missing";
  }
  const genericCta = /^(learn more|explore|continue|submit|get started|click here)$/i;
  if (genericCta.test(candidate.cta.trim()) || candidate.cta.trim().split(/\s+/).length < 2) {
    return "message_spine_cta_missing_deliverable";
  }
  const candidateCopy = [candidate.hero, candidate.mechanism, ...candidate.choices, candidate.cta].join(" ");
  if (containsBuyerFacingJargon(candidateCopy)) return "message_spine_buyer_facing_jargon";
  if (GENERIC_FILLER_PATTERN.test(candidateCopy)) return "message_spine_generic_filler";
  return undefined;
}
