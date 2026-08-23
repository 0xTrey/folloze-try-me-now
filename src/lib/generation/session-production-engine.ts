import {
  brandProfileToBrandSystemEvidence,
  compileBrandSystemV2
} from "@/lib/brand-system";
import { normalizeCompanyIdentity } from "@/lib/domain-identity";
import {
  buildAudienceRecommendations,
  type AudienceRecommendationSet
} from "@/lib/generation/audience-recommendations";
import {
  compileGenericProductionPage,
  type GenericProductionEngineResult
} from "@/lib/generation/generic-production-engine";
import {
  rankMessageFrameworks,
  type MessageMotion
} from "@/lib/generation/message-spine";
import {
  recommendObjectiveCtas,
  type ObjectiveCtaEvidence,
  type ObjectiveCtaMotion
} from "@/lib/generation/objective-cta-recommendations";
import { compileProductionMessageSpine } from "@/lib/generation/production-message-spine";
import {
  applyV2SectionPlanToLegacySelection,
  selectThreeFamilyDecision,
  type ExperienceSubtypeV2
} from "@/lib/generation/three-family-contract";
import {
  selectWireframe,
  type WireframeSectionCount
} from "@/lib/generation/wireframe-library";
import type { ProductionArtifact, WorkerKind } from "@/lib/orchestration/worker-types";
import {
  buildCompanyResearchArtifact,
  type NormalizedCompanyEvidence
} from "@/lib/research/company-research";
import {
  reconcileLiveBriefEvidence,
  type VisitorLiveBriefEdits
} from "@/lib/research/evidence-reconciler";
import {
  rankOfferRecommendations,
  type ExtractedOfferEvidence,
  type OfferCampaignMotion,
  type OfferRecommendationSet
} from "@/lib/research/offer-recommendations";
import type { BrandProfile, CtaType, TryMeSession } from "@/lib/types";

function productionArtifact<T>(input: {
  worker: WorkerKind;
  sessionId: string;
  revision: number;
  value: T;
  status?: ProductionArtifact<T>["status"];
  evidenceRefs?: string[];
  confidence?: number;
  startedAt: string;
  completedAt: string;
}): ProductionArtifact<T> {
  return {
    worker: input.worker,
    sessionId: input.sessionId,
    revision: input.revision,
    status: input.status ?? "complete",
    value: input.value,
    evidenceRefs: input.evidenceRefs ?? [],
    confidence: input.confidence ?? 0.8,
    startedAt: input.startedAt,
    completedAt: input.completedAt
  };
}

function campaignMotion(session: TryMeSession): OfferCampaignMotion {
  if (session.answers.campaignType === "event") return "event";
  if (session.answers.campaignType === "product") return "product";
  return /\bindustr(?:y|ies)\b/i.test(session.answers.promotedOffer ?? "")
    ? "industry"
    : "solution";
}

function experienceSubtype(session: TryMeSession): Exclude<ExperienceSubtypeV2, "account"> {
  const motion = campaignMotion(session);
  if (motion === "event") {
    return /webinar/i.test(session.answers.eventSource ?? "") ? "webinar" : "event";
  }
  return motion;
}

function objectiveMotion(session: TryMeSession): ObjectiveCtaMotion {
  if (session.useCase === "abm") return "abm";
  if (session.answers.campaignType === "event") {
    return /webinar/i.test(session.answers.eventSource ?? "") ? "webinar" : "event";
  }
  if (session.answers.campaignType === "product") return "product";
  if (/\bindustr(?:y|ies)\b/i.test(session.answers.promotedOffer ?? "")) return "industry";
  return "campaign";
}

function messageMotion(session: TryMeSession): MessageMotion {
  if (session.useCase === "abm") return "account";
  if (session.useCase === "content") return "content";
  if (session.answers.campaignType === "event") return "event";
  return session.answers.campaignType === "product" ? "product" : "demand";
}

function selectedAudience(session: TryMeSession): {
  label: string;
  buyerRole: string;
  buyerJob: string;
} {
  const label =
    session.answers.customAudience ||
    session.answers.audience ||
    session.audienceRecommendations?.[0]?.label ||
    session.audienceSuggestions[0] ||
    "Buyer team";
  const recommendation = session.audienceRecommendations?.find(
    (candidate) => candidate.label === label
  );
  return {
    label,
    buyerRole: label,
    buyerJob:
      recommendation?.rationale ||
      "evaluate fit, evidence, implementation risk, and the next useful decision"
  };
}

function selectedCta(session: TryMeSession): { type: CtaType; label: string } {
  const recommendation = session.objectiveRecommendations?.find(({ recommended }) => recommended);
  return {
    type: session.answers.ctaType ?? recommendation?.cta?.type ?? "book-meeting",
    label:
      recommendation?.cta?.label ||
      (session.answers.campaignType === "event" ? "Register now" : "Book a meeting")
  };
}

function offerEvidence(brand: BrandProfile, motion: OfferCampaignMotion): ExtractedOfferEvidence[] {
  return [
    ...(brand.title
      ? [{
          ref: `official:offer:title:${brand.domain}`,
          label: brand.title,
          kind: motion === "event" ? "event" as const : motion,
          source: "homepage" as const,
          sourceUrl: brand.sourceUrl,
          confidence: brand.source === "fallback" ? 0.3 : 0.72
        }]
      : []),
    ...brand.publicTopics.slice(0, 4).map((label, index) => ({
      ref: `official:offer:topic:${index}`,
      label,
      kind: motion === "event" ? "topic" as const : motion,
      source: "homepage" as const,
      sourceUrl: brand.sourceUrl,
      confidence: brand.source === "fallback" ? 0.25 : Math.max(0.42, 0.68 - index * 0.06)
    }))
  ];
}

function companyEvidence(
  brand: BrandProfile,
  revision: number,
  observedAt: string
): NormalizedCompanyEvidence[] {
  const authority =
    brand.source === "fallback" ? "third-party" as const : "company-official-site" as const;
  return [
    { field: "company" as const, value: brand.description },
    { field: "category" as const, value: brand.publicTopics[0] },
    { field: "positioning" as const, value: brand.publicContext }
  ].flatMap(({ field, value }) =>
    value
      ? [{
          id: `official:company:${field}`,
          revision,
          field,
          value,
          confidence: brand.source === "fallback" ? 0.3 : 0.75,
          source: {
            authority,
            url: brand.sourceUrl,
            observedAt
          }
        }]
      : []
  );
}

function objectiveEvidence(
  session: TryMeSession,
  revision: number
): ObjectiveCtaEvidence[] {
  const motion = objectiveMotion(session);
  if (!session.answers.objective && !session.answers.eventSource) return [];
  const signal =
    motion === "abm"
      ? "abm-active-evaluation"
      : motion === "event"
        ? "event-registration-open"
        : motion === "webinar"
          ? "webinar-registration-open"
          : motion === "product"
            ? "product-evaluation"
            : motion === "industry"
              ? "industry-priority"
              : "campaign-offer";
  return [{
    id: "visitor:objective",
    revision,
    signal,
    provenance: "visitor-input",
    confidence: 0.95
  }];
}

function visitorEdits(
  session: TryMeSession,
  brand: BrandProfile,
  revision: number,
  observedAt: string
): VisitorLiveBriefEdits {
  const audience = selectedAudience(session);
  const cta = selectedCta(session);
  const offer = session.answers.promotedOffer;
  const objective = session.answers.objective;
  const edit = <T>(value: T, evidenceRef: string) => ({
    value,
    evidenceRef,
    confidence: 1,
    editedAt: observedAt,
    editedAtRevision: revision
  });
  return {
    companyName: edit(brand.companyName, "visitor:seller-company"),
    canonicalDomain: edit(brand.canonicalDomain ?? brand.domain, "visitor:seller-domain"),
    ...(offer
      ? { offer: edit({ label: offer, kind: campaignMotion(session) }, "visitor:offer") }
      : {}),
    ...(session.answers.audience || session.answers.customAudience
      ? { audience: edit(audience, "visitor:audience") }
      : {}),
    ...(objective ? { objective: edit(objective, "visitor:objective") } : {}),
    cta: edit(cta, "visitor:cta")
  };
}

function sectionCountFor(session: TryMeSession, brand: BrandProfile): WireframeSectionCount {
  if (
    session.useCase === "content" ||
    (session.sourceArtifact?.understanding.claims.length ?? 0) >= 6
  ) {
    return 8;
  }
  if (
    brand.source === "fallback" &&
    brand.imageUrls.length === 0 &&
    (session.evidenceItems?.length ?? 0) < 2
  ) {
    return 4;
  }
  return 6;
}

export async function compileSessionProductionPage(input: {
  session: TryMeSession;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  providerStartedAtMs: number;
  currentTimeMs?: number;
}): Promise<GenericProductionEngineResult> {
  const { session, brand } = input;
  const revision = session.revision;
  const observedAt = new Date().toISOString();
  const startedAt = session.stages.story.startedAt ?? observedAt;
  const completedAt = observedAt;
  const identityArtifact = normalizeCompanyIdentity({
    sessionId: session.id,
    revision,
    submittedDomain: session.companyDomain,
    companyName: {
      value: brand.companyName,
      source: brand.sourceUrl,
      confidence: brand.source === "fallback" ? 0.4 : 0.9,
      observedAt,
      revision
    },
    domainEvidence: [{
      value: {
        kind: "canonical-domain",
        domain: brand.canonicalDomain ?? brand.domain,
        companyName: brand.companyName
      },
      source: brand.sourceUrl,
      confidence: brand.source === "fallback" ? 0.4 : 0.9,
      observedAt,
      revision
    }],
    candidateAliases: brand.domainAliases,
    startedAt,
    completedAt
  });
  const companyArtifact = buildCompanyResearchArtifact({
    sessionId: session.id,
    revision,
    activeRevision: revision,
    evidence: companyEvidence(brand, revision, observedAt),
    startedAt,
    now: () => new Date(completedAt)
  });
  const offerSet = rankOfferRecommendations({
    revision,
    motion: campaignMotion(session),
    eventSubtype:
      campaignMotion(session) === "event"
        ? /webinar/i.test(session.answers.eventSource ?? "") ? "webinar" : "event"
        : undefined,
    suppliedUrl: session.answers.offerSourceUrl,
    visitorOverride: session.answers.promotedOffer
      ? {
          label: session.answers.promotedOffer,
          evidenceRef: "visitor:offer",
          sourceUrl: session.answers.offerSourceUrl,
          confidence: 1
        }
      : undefined,
    evidence: offerEvidence(brand, campaignMotion(session))
  });
  const offerArtifact = productionArtifact<OfferRecommendationSet>({
    worker: "offer-researcher",
    sessionId: session.id,
    revision,
    value: offerSet,
    status: offerSet.status,
    evidenceRefs: offerSet.evidenceRefs,
    confidence: offerSet.confidence,
    startedAt,
    completedAt
  });
  const audienceArtifact = buildAudienceRecommendations({
    sessionId: session.id,
    revision,
    activeRevision: revision,
    route: session.useCase === "abm" ? "named-account" : "generic-campaign",
    seller: brand,
    target: input.targetBrand,
    offerLabel: session.answers.promotedOffer,
    evidenceItems: session.evidenceItems,
    generatedAt: completedAt
  });
  const objectiveArtifact = recommendObjectiveCtas({
    sessionId: session.id,
    revision,
    activeRevision: revision,
    motion: objectiveMotion(session),
    evidence: objectiveEvidence(session, revision),
    startedAt,
    completedAt
  });
  const evidenceArtifact = reconcileLiveBriefEvidence({
    sessionId: session.id,
    revision,
    identityArtifacts: [identityArtifact],
    companyResearchArtifacts: [companyArtifact],
    offerRecommendationArtifacts: [offerArtifact],
    audienceRecommendationArtifacts: [
      audienceArtifact as ProductionArtifact<AudienceRecommendationSet>
    ],
    objectiveCtaArtifacts: [objectiveArtifact],
    visitorEdits: visitorEdits(session, brand, revision, observedAt),
    startedAt,
    completedAt
  });
  const identity = identityArtifact.value ?? {
    name: brand.companyName,
    canonicalDomain: brand.canonicalDomain ?? brand.domain,
    aliases: brand.domainAliases ?? []
  };
  const brandArtifact = compileBrandSystemV2({
    sessionId: session.id,
    revision,
    activeRevision: revision,
    identity: {
      name: identity.name,
      canonicalDomain: identity.canonicalDomain,
      aliases: identity.aliases
    },
    sources: [brandProfileToBrandSystemEvidence(brand, {
      revision,
      observedAt,
      confidence: brand.source === "fallback" ? 0.35 : 0.85
    })],
    startedAt,
    completedAt
  });
  const evidence = evidenceArtifact.value;
  const audience = evidence?.fields.audience?.value ?? selectedAudience(session);
  const offer = evidence?.fields.offer?.value.label ?? session.answers.promotedOffer ?? brand.companyName;
  const objective =
    evidence?.fields.objective?.value ?? session.answers.objective ?? "Start a useful conversation";
  const cta = evidence?.fields.cta?.value ?? selectedCta(session);
  const framework = rankMessageFrameworks({
    motion: messageMotion(session),
    audience: audience.label,
    objective,
    cta: cta.label,
    offerMaturity: session.answers.promotedOffer ? "confirmed" : "unconfirmed",
    proofDensity: (session.evidenceItems?.length ?? 0) >= 3 ? "rich" : "sparse",
    contentVolume: session.sourceArtifact ? "deep" : "standard",
    decisionComplexity: session.useCase === "abm" ? "high" : "medium"
  });
  const frameworkArtifact = productionArtifact({
    worker: "framework-ranker",
    sessionId: session.id,
    revision,
    value: framework,
    evidenceRefs: evidenceArtifact.evidenceRefs,
    startedAt,
    completedAt
  });
  const familyDecision = selectThreeFamilyDecision({
    sessionId: session.id,
    revision,
    useCase: session.useCase,
    campaignType: session.answers.campaignType,
    eventSubtype:
      session.answers.campaignType === "event"
        ? /webinar/i.test(session.answers.eventSource ?? "")
          ? "webinar"
          : "event"
        : undefined,
    offerKind: experienceSubtype(session),
    intent: `${session.answers.objective ?? ""} ${session.answers.promotedOffer ?? ""}`,
    targetDomain: session.answers.targetDomain,
    firstDecision:
      session.useCase === "abm"
        ? session.answers.messageBelief ?? session.answers.objective
        : undefined,
    evidenceRefs: evidenceArtifact.evidenceRefs,
    proofEvidenceRefs: (session.evidenceItems ?? [])
      .filter((item) => item.disposition !== "excluded")
      .map((item) => item.id),
    assetEvidenceRefs: brandArtifact.value?.imagery.selected.map(
      ({ evidenceRef }) => evidenceRef
    ),
    includeProofDepth: (session.evidenceItems?.length ?? 0) >= 2,
    includeResource: Boolean(
      session.answers.sourceUrl ||
      session.answers.offerSourceUrl ||
      session.answers.eventSource
    )
  });
  const familyDecisionArtifact = productionArtifact({
    worker: "wireframe-ranker",
    sessionId: session.id,
    revision,
    value: familyDecision,
    evidenceRefs: [...familyDecision.evidenceRefs],
    confidence:
      familyDecision.confidence === "high"
        ? 0.9
        : familyDecision.confidence === "medium"
          ? 0.7
          : 0.4,
    startedAt,
    completedAt
  });
  const legacySelection = selectWireframe({
    family: session.useCase === "abm" ? "account" : session.useCase,
    campaignType: session.answers.campaignType,
    audience: audience.label,
    objective,
    promotedOffer: offer,
    approvedQuantifiedProof: false,
    approvedCustomerStory: false,
    contentDensity: session.sourceArtifact ? "rich" : "moderate",
    messageStructure: framework.selected.id === "problem-change"
      ? "problem-solution"
      : framework.selected.id === "technical-validation"
        ? "technical-sequence"
        : "single-idea",
    proofAvailability: (session.evidenceItems?.length ?? 0) >= 3 ? "strong" : "limited",
    decisionComplexity: session.useCase === "abm" ? "high" : "medium",
    sellerDensity:
      (brand.designDna?.spacing?.sectionBlockPx ?? 80) <= 72
        ? "dense"
        : (brand.designDna?.spacing?.sectionBlockPx ?? 80) >= 112
          ? "sparse"
          : "balanced",
    sectionCount: sectionCountFor(session, brand),
    assetQuality: brand.imageUrls.length > 0 ? "high" : "none",
    sellerLogoAvailable: Boolean(brand.logoUrl || brand.portableLogo)
  }, { selectedBy: "system", locked: true });
  const selection = applyV2SectionPlanToLegacySelection(
    legacySelection,
    familyDecision
  );
  const compositionArtifact = productionArtifact({
    worker: "wireframe-ranker",
    sessionId: session.id,
    revision,
    value: selection,
    evidenceRefs: brandArtifact.evidenceRefs,
    startedAt,
    completedAt
  });
  const messageSpineArtifact = compileProductionMessageSpine({
    sessionId: session.id,
    revision,
    activeRevision: revision,
    evidenceArtifact,
    frameworkArtifact,
    compositionArtifact,
    startedAt,
    completedAt
  });

  return compileGenericProductionPage({
    sessionId: session.id,
    revision,
    activeRevision: revision,
    startedAt,
    completedAt,
    providerWindow: {
      startedAtMs: input.providerStartedAtMs,
      currentTimeMs: input.currentTimeMs ?? Date.now()
    },
    evidenceArtifact,
    brandArtifact,
    familyDecisionArtifact,
    compositionArtifact,
    messageSpineArtifact,
    allowVisualRepair: true
  }, {
    currentRevision: () => session.revision
  });
}
