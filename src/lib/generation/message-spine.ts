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
  evidence: MessageSpineEvidence[];
  unknowns: string[];
  editorial: {
    selectedAngle: "tension" | "upside" | "mechanism";
    rejectedAngles: Array<"tension" | "upside" | "mechanism">;
    specificityTerms: string[];
    prohibitedDeclarativeEvidenceIds: string[];
  };
}

export interface MessageSpineCopyCandidate {
  hero: string;
  mechanism: string;
  choices: [string, string, string];
  cta: string;
  evidenceIdsByUse: Partial<Record<MessageSpineSectionUse, string[]>>;
}

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
    proposition: {
      buyerJob: `Determine whether ${brief.offerOrSource.name} can support ${brief.campaignGoal.toLocaleLowerCase()}.`,
      ...(targetFacts.length ? { statusQuoTension: concise(targetFacts[0]!.claim, 180) } : {}),
      supportedChange: concise(brief.messageSpine.whyChange, 220),
      businessOutcome: concise(brief.campaignGoal, 140),
      sellerMechanism: concise(brief.messageSpine.sellerPromise, 220),
      boundedNextDecision: concise(brief.messageSpine.nextAction, 140)
    },
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
  return undefined;
}
