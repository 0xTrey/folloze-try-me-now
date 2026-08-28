import type { SessionAnswers, SessionEvidenceItem } from "@/lib/types";

import {
  EVIDENCE_USE,
  evidenceClaimId,
  evidenceEntityId,
  evidenceGapCode,
  evidenceSourceRef,
  normalizeClaimText,
  normalizeEntityName,
  type EvidenceClaim,
  type EvidenceClaimCandidate,
  type EvidenceConfidence,
  type EvidenceEntity
} from "./evidence-graph";
import type { EvidenceTopicRequirement } from "./evidence-graph-executor";

export interface EvidenceSeedInput {
  revision: number;
  answers?: SessionAnswers;
  evidenceItems?: readonly SessionEvidenceItem[];
  /** Normalized seller domain. It anchors the seller entity id. */
  sellerCanonicalDomain?: string;
  sellerCompanyName?: string;
  /** Set for an ABM run so a missing target account is reported as a gap. */
  expectsTargetAccount?: boolean;
}

export interface EvidenceSeeds {
  entities: EvidenceEntity[];
  candidates: EvidenceClaimCandidate[];
  gaps: string[];
  requiredTopics: EvidenceTopicRequirement[];
}

const SEED_LANE = "visitor_answers";
const CURATED_LANE = "curated_evidence";

/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */

function normalizeHost(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim().toLocaleLowerCase();
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const host = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
    return host.includes(".") ? host : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Free-text answers are visitor-typed, so they may contain a pasted tracking
 * URL. Addresses are reduced to a bare host before the text is bounded, so no
 * query value can reach a claim.
 */
function boundedAnswerText(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const redacted = value.replace(
    /\bhttps?:\/\/[^\s<>"']+/gi,
    (match) => normalizeHost(match) ?? "a linked page"
  );
  const text = normalizeClaimText(redacted);
  return text.length >= 3 ? text : undefined;
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

/** Anchored on the domain so a lane that harvests the same host agrees. */
export function sellerEntityIdFor(canonicalDomain: string): string {
  return evidenceEntityId("seller", normalizeHost(canonicalDomain) ?? canonicalDomain);
}

/**
 * The target account is modelled as an `audience` entity because the fixed
 * `EvidenceGraph` kind union has no target kind. It stays a separate entity
 * from the seller, so target evidence can never read as a seller fact.
 */
export function targetEntityIdFor(targetDomain: string): string {
  return evidenceEntityId("audience", normalizeHost(targetDomain) ?? targetDomain);
}

export function offerEntityIdFor(offer: string): string {
  return evidenceEntityId("offer", offer);
}

export function audienceEntityIdFor(audience: string): string {
  return evidenceEntityId("audience", audience);
}

interface SeedSubjects {
  sellerId?: string;
  offerId?: string;
  audienceId?: string;
  targetId?: string;
  sourceId?: string;
}

function seedSubjects(input: EvidenceSeedInput): SeedSubjects {
  const answers = input.answers ?? {};
  const sellerHost = normalizeHost(input.sellerCanonicalDomain);
  const offer = boundedAnswerText(answers.promotedOffer);
  const audience = boundedAnswerText(answers.customAudience ?? answers.audience);
  const targetHost = normalizeHost(answers.targetDomain);
  const sourceHost = normalizeHost(answers.offerSourceUrl ?? answers.sourceUrl);
  return {
    ...(sellerHost ? { sellerId: sellerEntityIdFor(sellerHost) } : {}),
    ...(offer ? { offerId: offerEntityIdFor(offer) } : {}),
    ...(audience ? { audienceId: audienceEntityIdFor(audience) } : {}),
    ...(targetHost ? { targetId: targetEntityIdFor(targetHost) } : {}),
    ...(sourceHost ? { sourceId: evidenceEntityId("source", sourceHost) } : {})
  };
}

/**
 * Entities the visitor's own answers establish. Names are bounded, and the
 * seller keeps its domain as an alias so a harvested profile merges onto it.
 */
export function seedEntitiesFor(input: EvidenceSeedInput): EvidenceEntity[] {
  const answers = input.answers ?? {};
  const subjects = seedSubjects(input);
  const sellerHost = normalizeHost(input.sellerCanonicalDomain);
  const companyName = normalizeEntityName(input.sellerCompanyName ?? "");
  const offer = boundedAnswerText(answers.promotedOffer);
  const audience = boundedAnswerText(answers.customAudience ?? answers.audience);
  const targetHost = normalizeHost(answers.targetDomain);
  const sourceHost = normalizeHost(answers.offerSourceUrl ?? answers.sourceUrl);
  const entities: EvidenceEntity[] = [];

  if (subjects.sellerId && sellerHost) {
    entities.push({
      id: subjects.sellerId,
      kind: "seller",
      canonicalName: companyName || sellerHost,
      aliases: companyName && companyName !== sellerHost ? [sellerHost] : []
    });
  }
  if (subjects.offerId && offer) {
    entities.push({
      id: subjects.offerId,
      kind: "offer",
      canonicalName: normalizeEntityName(offer),
      aliases: []
    });
  }
  if (subjects.audienceId && audience) {
    entities.push({
      id: subjects.audienceId,
      kind: "audience",
      canonicalName: normalizeEntityName(audience),
      aliases: []
    });
  }
  if (subjects.targetId && targetHost) {
    entities.push({
      id: subjects.targetId,
      kind: "audience",
      canonicalName: targetHost,
      aliases: []
    });
  }
  if (subjects.sourceId && sourceHost) {
    entities.push({
      id: subjects.sourceId,
      kind: "source",
      canonicalName: sourceHost,
      aliases: []
    });
  }
  return entities;
}

/* -------------------------------------------------------------------------- */
/* Claims                                                                      */
/* -------------------------------------------------------------------------- */

interface SeedClaimInput {
  subjectId: string;
  topic: string;
  statement: string;
  status: EvidenceClaim["status"];
  confidence: EvidenceConfidence;
  authority: string;
  locator: string;
  allowedUses: readonly string[];
  prohibitedUses: readonly string[];
  buyerFacing: boolean;
  laneId: string;
}

function seedClaim(input: SeedClaimInput): EvidenceClaimCandidate | undefined {
  const statement = normalizeClaimText(input.statement);
  if (statement.length < 3) return undefined;
  return {
    topic: input.topic,
    laneId: input.laneId,
    claim: {
      id: evidenceClaimId({
        subjectId: input.subjectId,
        topic: input.topic,
        claim: statement
      }),
      subjectId: input.subjectId,
      claim: statement,
      status: input.status,
      confidence: input.confidence,
      sourceAuthority: input.authority,
      sourceRef: evidenceSourceRef({
        authority: input.authority,
        locator: input.locator
      }),
      allowedUses: [...input.allowedUses],
      prohibitedUses: [...input.prohibitedUses],
      buyerFacing: input.buyerFacing
    }
  };
}

/** A visitor assertion about their own business, once they affirmed it. */
function assertedStatus(confirmed: boolean | undefined): {
  status: EvidenceClaim["status"];
  confidence: EvidenceConfidence;
} {
  return confirmed === true
    ? { status: "fact", confidence: "high" }
    : { status: "inference", confidence: "medium" };
}

/** Buyer-facing business facts: usable as copy, never usable as proof. */
const BUYER_FACING_USES = {
  allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.internalReasoning],
  prohibitedUses: [EVIDENCE_USE.proofPoint],
  buyerFacing: true
} as const;

/** Page decisions and opinions: they steer the build, they are not copy. */
const INTERNAL_ONLY_USES = {
  allowedUses: [EVIDENCE_USE.internalReasoning],
  prohibitedUses: [
    EVIDENCE_USE.buyerFacingCopy,
    EVIDENCE_USE.headline,
    EVIDENCE_USE.proofPoint
  ],
  buyerFacing: false
} as const;

/**
 * Claims the visitor asserted through the intake answers.
 *
 * Every claim carries `visitor` authority, which is the top authority rank.
 * That is safe because reconciliation ranks claim status ahead of authority:
 * an unconfirmed answer is an `inference` and loses to a confirmed public
 * `fact` on the same topic, while a confirmed answer is a `fact` that
 * legitimately outranks a harvested one about the visitor's own business.
 *
 * CTA type and style are page decisions, not evidence, and produce no claim.
 * Presentation answers such as style, tone, layout, and asset selection are
 * ignored entirely.
 */
export function visitorAnswerClaims(
  input: EvidenceSeedInput
): EvidenceClaimCandidate[] {
  const answers = input.answers ?? {};
  const subjects = seedSubjects(input);
  const revision = input.revision;
  const candidates: Array<EvidenceClaimCandidate | undefined> = [];
  const locator = (field: string) => `visitor:${revision}:${field}`;

  const sellerName =
    normalizeEntityName(input.sellerCompanyName ?? "") ||
    normalizeHost(input.sellerCanonicalDomain) ||
    "";
  if (subjects.sellerId && sellerName) {
    candidates.push(
      seedClaim({
        subjectId: subjects.sellerId,
        topic: "seller_identity",
        statement: `The seller is ${sellerName}.`,
        ...assertedStatus(answers.sellerConfirmed),
        authority: "visitor",
        locator: locator("seller"),
        laneId: SEED_LANE,
        ...BUYER_FACING_USES
      })
    );
  }

  const offer = boundedAnswerText(answers.promotedOffer);
  if (offer && subjects.offerId) {
    candidates.push(
      seedClaim({
        subjectId: subjects.offerId,
        topic: "offer",
        statement: `The promoted offer is ${offer}.`,
        ...assertedStatus(answers.promotedOfferConfirmed),
        authority: "visitor",
        locator: locator("promotedOffer"),
        laneId: SEED_LANE,
        ...BUYER_FACING_USES
      })
    );
  }

  const offerSourceTitle = boundedAnswerText(answers.offerSourceTitle);
  const offerSourceSubject = subjects.sourceId ?? subjects.offerId;
  if (offerSourceTitle && offerSourceSubject) {
    const asserted = assertedStatus(answers.offerSourceConfirmed);
    candidates.push(
      seedClaim({
        subjectId: offerSourceSubject,
        topic: "offer_source",
        statement: `The offer is documented in "${offerSourceTitle}".`,
        status: asserted.status,
        confidence: asserted.status === "fact" ? "medium" : "low",
        authority: "visitor",
        locator: locator("offerSource"),
        laneId: SEED_LANE,
        ...INTERNAL_ONLY_USES
      })
    );
  }

  const audience = boundedAnswerText(answers.customAudience ?? answers.audience);
  if (audience && subjects.audienceId) {
    // No answer field confirms the audience, so it is never better than an
    // inference no matter how deliberately the visitor typed it.
    candidates.push(
      seedClaim({
        subjectId: subjects.audienceId,
        topic: "audience",
        statement: `The intended buyer is ${audience}.`,
        status: "inference",
        confidence: "medium",
        authority: "visitor",
        locator: locator("audience"),
        laneId: SEED_LANE,
        ...BUYER_FACING_USES
      })
    );
  }

  const objective = boundedAnswerText(answers.objective);
  if (objective && subjects.sellerId) {
    candidates.push(
      seedClaim({
        subjectId: subjects.sellerId,
        topic: "page_objective",
        statement: `The page objective is ${objective}.`,
        status: "inference",
        confidence: "high",
        authority: "visitor",
        locator: locator("objective"),
        laneId: SEED_LANE,
        ...INTERNAL_ONLY_USES
      })
    );
  }

  if (answers.campaignType && subjects.sellerId) {
    candidates.push(
      seedClaim({
        subjectId: subjects.sellerId,
        topic: "campaign_type",
        statement: `The campaign type is ${answers.campaignType}.`,
        status: "inference",
        confidence: "high",
        authority: "visitor",
        locator: locator("campaignType"),
        laneId: SEED_LANE,
        ...INTERNAL_ONLY_USES
      })
    );
  }

  const belief = boundedAnswerText(answers.messageBelief);
  if (belief && subjects.sellerId) {
    // An opinion the seller holds. It shapes the argument and can never be
    // cited as proof or reach the page as a stated fact.
    candidates.push(
      seedClaim({
        subjectId: subjects.sellerId,
        topic: "visitor_belief",
        statement: `The seller believes ${belief}.`,
        status: "inference",
        confidence: "low",
        authority: "visitor",
        locator: locator("messageBelief"),
        laneId: SEED_LANE,
        ...INTERNAL_ONLY_USES
      })
    );
  }

  const action = boundedAnswerText(answers.messageAction);
  if (action && subjects.sellerId) {
    candidates.push(
      seedClaim({
        subjectId: subjects.sellerId,
        topic: "desired_action",
        statement: `The desired buyer action is ${action}.`,
        status: "inference",
        confidence: "medium",
        authority: "visitor",
        locator: locator("messageAction"),
        laneId: SEED_LANE,
        ...INTERNAL_ONLY_USES
      })
    );
  }

  const targetHost = normalizeHost(answers.targetDomain);
  if (targetHost && subjects.targetId) {
    candidates.push(
      seedClaim({
        subjectId: subjects.targetId,
        topic: "target_account",
        statement: `The target account is ${targetHost}.`,
        ...assertedStatus(answers.targetConfirmed),
        authority: "visitor",
        locator: locator("targetDomain"),
        laneId: SEED_LANE,
        ...BUYER_FACING_USES
      })
    );
  }

  const sourceTitle = boundedAnswerText(answers.sourceTitle ?? answers.sourceName);
  const sourceSubject = subjects.sourceId ?? subjects.sellerId;
  if (sourceTitle && sourceSubject) {
    const asserted = assertedStatus(answers.sourceConfirmed);
    candidates.push(
      seedClaim({
        subjectId: sourceSubject,
        topic: "source_document",
        statement: `The supporting source is "${sourceTitle}".`,
        status: asserted.status,
        confidence: asserted.status === "fact" ? "medium" : "low",
        authority: "visitor",
        locator: locator("source"),
        laneId: SEED_LANE,
        ...INTERNAL_ONLY_USES
      })
    );
  }

  return candidates.filter(
    (candidate): candidate is EvidenceClaimCandidate => candidate !== undefined
  );
}

/* -------------------------------------------------------------------------- */
/* Curated evidence items                                                      */
/* -------------------------------------------------------------------------- */

function itemTopic(item: SessionEvidenceItem): string {
  const label = normalizeClaimText(item.label)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  // Positioning is single-valued, so competing statements reconcile to one.
  // Context and focus areas are lists, so each label keeps its own topic.
  if (item.type === "public-positioning") return "public_positioning";
  const base =
    item.type === "public-operating-context"
      ? "public_operating_context"
      : "public_focus_area";
  return label ? `${base}:${label}` : base;
}

function itemConfidence(item: SessionEvidenceItem): EvidenceConfidence {
  const base = item.confidence ?? "low";
  // Pinning is a visitor endorsement, so a pinned item is never ranked below
  // an equivalent available one.
  if (item.disposition === "pinned") return base === "low" ? "medium" : base;
  return base;
}

/**
 * Claims from public evidence the visitor curated.
 *
 * These keep official source authority rather than visitor authority: the
 * visitor selected them, they did not assert them. An excluded item is
 * dropped outright. A target-role item is attributed to the target entity and
 * stays internal, because this release builds a base experience rather than an
 * account-personalized variant.
 */
export function curatedEvidenceClaims(
  input: EvidenceSeedInput
): EvidenceClaimCandidate[] {
  const subjects = seedSubjects(input);
  return (input.evidenceItems ?? []).flatMap((item) => {
    if (item.disposition === "excluded") return [];
    const isTarget = item.entityRole === "target";
    const subjectId = isTarget ? subjects.targetId : subjects.sellerId;
    if (!subjectId) return [];
    const statement = boundedAnswerText(item.text);
    if (!statement) return [];
    const candidate = seedClaim({
      subjectId,
      topic: itemTopic(item),
      statement,
      status: "fact",
      confidence: itemConfidence(item),
      authority: isTarget ? "target_official" : "seller_official",
      locator: item.sourceUrl || item.id,
      laneId: CURATED_LANE,
      ...(isTarget ? INTERNAL_ONLY_USES : BUYER_FACING_USES)
    });
    return candidate ? [candidate] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* Gaps                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Named absences. A missing answer produces a gap and no claim, so the recipe
 * can omit the field honestly instead of reading a default.
 */
export function missingAnswerGaps(input: EvidenceSeedInput): string[] {
  const answers = input.answers ?? {};
  const gaps: string[] = [];
  if (!normalizeHost(input.sellerCanonicalDomain)) {
    gaps.push(evidenceGapCode("answers", "seller_missing"));
  }
  if (!boundedAnswerText(answers.promotedOffer)) {
    gaps.push(evidenceGapCode("answers", "offer_missing"));
  }
  if (!boundedAnswerText(answers.customAudience ?? answers.audience)) {
    gaps.push(evidenceGapCode("answers", "audience_missing"));
  }
  if (!boundedAnswerText(answers.objective)) {
    gaps.push(evidenceGapCode("answers", "objective_missing"));
  }
  if (!boundedAnswerText(answers.messageAction)) {
    gaps.push(evidenceGapCode("answers", "next_action_missing"));
  }
  if (input.expectsTargetAccount === true && !normalizeHost(answers.targetDomain)) {
    gaps.push(evidenceGapCode("answers", "target_account_missing"));
  }
  return [...new Set(gaps)].sort();
}

/**
 * Everything the coordinator needs to seed one executor call. Proof is the one
 * required topic: no intake answer can supply it, so it stays an explicit
 * unknown until a lane or a curated item resolves it.
 */
export function buildEvidenceSeeds(input: EvidenceSeedInput): EvidenceSeeds {
  const subjects = seedSubjects(input);
  const candidates = [
    ...visitorAnswerClaims(input),
    ...curatedEvidenceClaims(input)
  ];
  return {
    entities: seedEntitiesFor(input),
    candidates,
    gaps: missingAnswerGaps(input),
    requiredTopics: subjects.sellerId
      ? [{ subjectId: subjects.sellerId, topic: "proof" }]
      : []
  };
}
