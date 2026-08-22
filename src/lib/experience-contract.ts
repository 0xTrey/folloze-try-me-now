import { createHash } from "node:crypto";

import {
  experienceDraftSchema,
  type ExperienceDraft
} from "@/lib/generation/experience-schema";
import { compilePersonalizationPlan } from "@/lib/generation/experience-renderers";
import type { GenericProductionPage } from "@/lib/generation/generic-production-engine";
import { selectWireframe } from "@/lib/generation/wireframe-library";
import {
  PREVIEW_INTERACTION_TYPES,
  type AudienceLensArtifact,
  type AudienceLensFinding,
  type CampaignBrief,
  type CampaignBriefField,
  type CampaignOfferSource,
  type ExperienceActionContract,
  type ExperienceContentContract,
  type ExperienceContentItem,
  type ExperienceDependency,
  type ExperienceRouteKind,
  type ExperienceSpec,
  type ExperienceSpecV2,
  type TryMeSession
} from "@/lib/types";
import { config } from "@/lib/config";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publicCitation(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function publicHost(value: string | undefined): string | undefined {
  const citation = publicCitation(value);
  if (!citation) return undefined;
  return new URL(citation).hostname.replace(/^www\./, "");
}

function safeDomToken(value: string): string {
  const token = value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return token || digest(value).slice(0, 12);
}

function campaignSubtypeFor(session: TryMeSession): ExperienceSpecV2["route"]["campaignSubtype"] {
  if (session.useCase !== "campaign") return undefined;
  if (session.answers.campaignType === "event") {
    return /webinar|virtual/i.test(session.answers.eventSource ?? "") ? "webinar" : "event";
  }
  if (session.answers.campaignType === "product") {
    return /launch|announce/i.test(session.answers.objective ?? "") ? "launch" : "product";
  }
  return /replay|follow[- ]?up|nurture/i.test(session.answers.objective ?? "")
    ? "replay"
    : "demand";
}

function primaryActionFor(
  session: TryMeSession,
  label: string,
  sourceUrl: string | undefined
): ExperienceActionContract {
  const intent = session.answers.ctaType ?? "explore";
  const configuredDestination = publicCitation(config.demoCtaUrl);
  const sourceDestination = publicCitation(sourceUrl);
  const prefersSource = ["register", "download", "explore"].includes(intent);
  const destination = (prefersSource ? sourceDestination : undefined) ?? configuredDestination;
  if (destination) {
    return {
      id: "primary-conversion",
      purpose: "primary-conversion",
      label,
      actionType: "external-link",
      destination,
      access: "public",
      analyticsEvent: "cta_click",
      analyticsOwner: "try-me-now",
      verification: prefersSource && !sourceDestination ? "fallback" : "verified",
      ...(prefersSource && !sourceDestination
        ? { fallbackReason: "No verified public source destination was available." }
        : {})
    };
  }
  return {
    id: "primary-conversion",
    purpose: "guided-exploration",
    label,
    actionType: "scroll",
    destination: "#supporting-resources",
    access: "public",
    analyticsEvent: "cta_click",
    analyticsOwner: "try-me-now",
    verification: "fallback",
    fallbackReason: "No verified external destination was available."
  };
}

function functionalContentFor(
  items: ExperienceContentItem[],
  sourceUrl: string | undefined
): {
  items: ExperienceContentItem[];
  actions: ExperienceActionContract[];
  contracts: ExperienceContentContract[];
} {
  const safeSource = publicCitation(sourceUrl);
  const actions = items.map((item, index): ExperienceActionContract => {
    const actionId = `content-${safeDomToken(item.id)}-${index + 1}`;
    return {
      id: actionId,
      purpose: safeSource ? "source-continuity" : "guided-exploration",
      label: item.actionLabel,
      actionType: safeSource ? "external-link" : "content-dialog",
      destination: safeSource ?? `#content-detail-${safeDomToken(item.id)}`,
      access: "public",
      analyticsEvent: "topic_select",
      analyticsOwner: "try-me-now",
      verification: safeSource ? "verified" : "fallback",
      contentItemId: item.id,
      ...(!safeSource
        ? { fallbackReason: "The source remains available as an in-experience detail." }
        : {})
    };
  });
  return {
    items: items.map((item, index) => ({ ...item, actionId: actions[index].id })),
    actions,
    contracts: items.map((item, index) => ({
      contentItemId: item.id,
      actionId: actions[index].id,
      sourceContinuity: safeSource ? "public-source" : "in-experience-detail",
      responsive: true,
      accessibleLabel: `${item.actionLabel}: ${item.title}`,
      verification: safeSource ? "verified" : "fallback"
    }))
  };
}

function boundedText(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const clipped = normalized.slice(0, max + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > max * 0.55 ? boundary : max).trim()}…`;
}

function designDnaFieldPaths(value: NonNullable<TryMeSession["brand"]>["designDna"]): string[] {
  if (!value) return [];
  return Object.entries(value)
    .filter(([key]) => !["version", "source", "confidence"].includes(key))
    .flatMap(([group, fields]) =>
      fields && typeof fields === "object"
        ? Object.entries(fields)
            .filter(([, fieldValue]) => fieldValue !== undefined)
            .map(([field]) => `${group}.${field}`)
        : []
    )
    .slice(0, 32);
}

function contentItemsFor(session: TryMeSession, draft: ExperienceDraft): ExperienceContentItem[] {
  const artifact = session.sourceArtifact;
  if (artifact && artifact.status !== "failed" && artifact.status !== "unreadable") {
    const citationById = new Map(
      artifact.content.citations.map((citation) => [citation.id, citation])
    );
    const sourceSections = artifact.content.sections
      .filter((section) => section.text.trim().length >= 24 && section.citationIds.length > 0)
      .slice(0, 3)
      .map((section, index): ExperienceContentItem => {
        const sourceLabel = section.citationIds
          .map((citationId) => citationById.get(citationId))
          .filter((citation) => Boolean(citation))
          .map((citation) =>
            citation!.locator.kind === "pdf-page"
              ? `Page ${citation!.locator.page}`
              : citation!.locator.label
          )[0];
        return {
          id: section.id,
          kind: "chapter",
          eyebrow: `Source chapter ${String(index + 1).padStart(2, "0")}`,
          title: boundedText(section.title, 96),
          summary: boundedText(section.text, 260),
          actionLabel: "Explore this chapter",
          sourceCitationIds: section.citationIds.slice(0, 8),
          ...(sourceLabel ? { sourceLabel } : {})
        };
      });
    if (sourceSections.length >= 2) return sourceSections;

    const claimItems = artifact.understanding.claims.slice(0, 3).map(
      (claim, index): ExperienceContentItem => ({
        id: claim.id,
        kind: claim.kind === "metric" ? "proof" : "insight",
        eyebrow:
          claim.kind === "metric"
            ? "Source proof"
            : claim.kind === "recommendation"
              ? "Recommended action"
              : "Core finding",
        title: boundedText(claim.text, 96),
        summary: boundedText(
          artifact.understanding.summary ?? artifact.understanding.premise ?? claim.text,
          260
        ),
        actionLabel: index === 0 ? "Explore the finding" : "See why it matters",
        sourceCitationIds: claim.citationIds.slice(0, 8)
      })
    );
    if (claimItems.length > 0) return claimItems;
  }

  return draft.sections.map((section, index) => ({
    id: `journey-${index + 1}`,
    kind: index === 2 ? "resource" : "insight",
    eyebrow: section.eyebrow,
    title: section.headline,
    summary: section.body,
    actionLabel: index === 2 ? "Choose this next step" : "Explore this signal",
    sourceCitationIds: [],
    illustrative: true
  }));
}

function field(
  input: Omit<CampaignBriefField, "citations"> & { citations?: Array<string | undefined> }
): CampaignBriefField {
  return {
    ...input,
    citations: (input.citations ?? [])
      .map(publicCitation)
      .filter((value): value is string => Boolean(value))
  };
}

const dependencies = {
  seller: ["seller-brand", "offer-source", "message-spine", "experience-sections", "cta"],
  target: ["target-research", "audience-lens", "message-spine", "experience-sections"],
  offer: ["offer-source", "message-spine", "experience-sections", "cta"],
  audience: ["message-spine", "experience-sections"],
  objective: ["message-spine", "experience-sections", "cta"]
} satisfies Record<string, ExperienceDependency[]>;

export function campaignBriefFor(
  session: TryMeSession,
  now = new Date().toISOString()
): CampaignBrief {
  const seller = session.brand;
  const target = session.targetBrand;
  const selectedAudience = session.audienceRecommendations?.find(
    (recommendation) => recommendation.id === session.selectedAudienceRecommendationId
  );
  const audience = session.answers.customAudience || session.answers.audience;
  const fields: CampaignBrief["fields"] = {
    seller: field({
      key: "seller",
      label: "Building as",
      value: seller?.companyName ?? session.companyDomain,
      provenance: seller ? "research" : "user",
      citations: [seller?.sourceUrl],
      userEdited: !seller,
      locked: false,
      required: true,
      dependencies: dependencies.seller
    })
  };

  if (session.answers.targetDomain) {
    fields.target = field({
      key: "target",
      label: "Building for",
      value: target?.companyName ?? session.answers.targetDomain,
      provenance: target ? "research" : "user",
      citations: [target?.sourceUrl],
      userEdited: !target,
      locked: false,
      required: session.useCase === "abm",
      dependencies: dependencies.target
    });
  }
  if (session.answers.promotedOffer) {
    fields.offer = field({
      key: "offer",
      label: "Promoting",
      value: session.answers.promotedOffer,
      provenance: session.campaignOfferSource?.status === "confirmed" ? "research" : "user",
      citations: [session.answers.offerSourceUrl],
      userEdited: true,
      locked: false,
      required: false,
      dependencies: dependencies.offer
    });
  }
  if (audience) {
    fields.audience = field({
      key: "audience",
      label: "For",
      value: audience,
      provenance: selectedAudience ? "inferred" : "user",
      citations: selectedAudience?.evidenceItemIds.map(
        (id) => session.evidenceItems?.find((item) => item.id === id)?.sourceUrl
      ),
      userEdited: !selectedAudience,
      locked: false,
      required: true,
      dependencies: dependencies.audience
    });
  }
  if (session.answers.objective) {
    fields.objective = field({
      key: "objective",
      label: "To achieve",
      value: session.answers.objective,
      provenance: "user",
      userEdited: true,
      locked: false,
      required: true,
      dependencies: dependencies.objective
    });
  }

  const fingerprint = digest(fields);
  const previous = session.campaignBrief;
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    revision: (previous?.revision ?? 0) + 1,
    fingerprint,
    updatedAt: now,
    fields
  };
}

function audienceCategory(type: NonNullable<TryMeSession["evidenceItems"]>[number]["type"]): AudienceLensFinding["category"] {
  if (type === "public-positioning") return "priority";
  if (type === "public-operating-context") return "challenge";
  return "buyer-concern";
}

export function audienceLensFor(
  session: TryMeSession,
  now = new Date().toISOString()
): AudienceLensArtifact {
  const account = session.targetBrand ?? session.brand;
  const findings = (session.evidenceItems ?? []).map((item) => ({
    id: item.id,
    category: audienceCategory(item.type),
    label: item.label,
    text: item.text,
    citationUrl: publicCitation(item.sourceUrl) ?? `https://${account?.domain ?? session.companyDomain}/`,
    disposition: item.disposition
  }));
  const next = {
    status:
      !findings.length && session.stages.audience.status === "running"
        ? "researching"
        : findings.length && account?.source !== "fallback"
          ? "ready"
          : "hypothesis",
    accountDomain: account?.domain ?? session.companyDomain,
    accountName: account?.companyName ?? session.companyDomain,
    findings
  } satisfies Omit<AudienceLensArtifact, "preparedAt">;
  const previous = session.audienceLens;
  const previousPayload = previous
    ? {
        status: previous.status,
        accountDomain: previous.accountDomain,
        accountName: previous.accountName,
        findings: previous.findings
      }
    : undefined;
  if (
    previous && JSON.stringify(previousPayload) === JSON.stringify(next)
  ) {
    return previous;
  }
  return { ...next, preparedAt: now };
}

export function campaignOfferSourceFor(
  session: TryMeSession
): CampaignOfferSource | undefined {
  const sourceUrl = publicCitation(session.answers.offerSourceUrl);
  if (!sourceUrl) return undefined;
  const url = new URL(sourceUrl);
  const sameSource = session.campaignOfferSource?.sourceUrl === sourceUrl;
  return {
    title: session.answers.offerSourceTitle || session.answers.promotedOffer,
    sourceUrl,
    sourceHost: url.hostname.replace(/^www\./, ""),
    status: session.answers.offerSourceConfirmed
      ? "confirmed"
      : sameSource && session.campaignOfferSource?.status === "rejected"
        ? "rejected"
        : "unconfirmed",
    intelligenceStatus: sameSource
      ? session.campaignOfferSource?.intelligenceStatus
      : "pending",
    confirmedAt: session.answers.offerSourceConfirmed
      ? session.campaignOfferSource?.confirmedAt ?? new Date().toISOString()
      : undefined
  };
}

export function syncCampaignContracts(session: TryMeSession): void {
  session.campaignOfferSource = campaignOfferSourceFor(session);
  session.audienceLens = audienceLensFor(session);
  session.campaignBrief = campaignBriefFor(session);
}

export function buildExperienceSpec(
  session: TryMeSession,
  draft: ExperienceDraft,
  brand: NonNullable<TryMeSession["brand"]>,
  targetBrand?: TryMeSession["targetBrand"],
  productionPage?: GenericProductionPage
): ExperienceSpecV2 {
  const createdAt = new Date().toISOString();
  const canonicalDraft = canonicalizeExperienceDraft(draft);
  const sourceBrief = session.campaignBrief ?? campaignBriefFor(session, createdAt);
  const audienceLens = session.audienceLens ?? audienceLensFor(session, createdAt);
  const sourceKind =
    session.sourceConfirmation?.sourceKind ??
    (session.answers.sourceUrl
      ? "public-url"
      : session.answers.sourceName
        ? "uploaded-pdf"
        : session.answers.eventSource
          ? "event-context"
          : session.campaignOfferSource?.sourceUrl
            ? "public-url"
            : undefined);
  const sourceStatus =
    session.sourceConfirmation?.status ??
    session.campaignOfferSource?.status ??
    (session.answers.sourceConfirmed || session.answers.offerSourceConfirmed
      ? "confirmed"
      : "unconfirmed");
  const sourceUrl =
    publicCitation(session.answers.sourceUrl) ??
    publicCitation(session.campaignOfferSource?.sourceUrl) ??
    publicCitation(session.answers.eventSource);
  const sourceTitle =
    session.answers.sourceTitle ??
    session.answers.offerSourceTitle ??
    session.answers.promotedOffer ??
    session.answers.sourceName;
  const functionalContent = functionalContentFor(
    contentItemsFor(session, canonicalDraft),
    sourceUrl
  );
  const contentItems = functionalContent.items;
  const sourceSignalText = [
    sourceTitle,
    session.sourceArtifact?.understanding.premise,
    ...(session.sourceArtifact?.understanding.topics ?? [])
  ]
    .filter(Boolean)
    .join(" ");
  const approvedQuantifiedProof = Boolean(
    canonicalDraft.persuasionFramework?.strategy.evidenceMap.some(
      (item) => item.kind === "proof" && /\d/.test(item.claim)
    )
  );
  const approvedCustomerStory =
    /customer (?:story|case)|case study|customer result/i.test(sourceSignalText);
  const wireframeSelection = productionPage?.composition ?? selectWireframe(
    {
      family: session.useCase === "abm" ? "account" : session.useCase,
      audience: session.answers.customAudience ?? session.answers.audience,
      objective: session.answers.objective,
      sourceTitle,
      sourceDescription: session.sourceArtifact?.understanding.premise,
      sourceUrl,
      sourceKind,
      sourceTopics: session.sourceArtifact?.understanding.topics,
      experiencePattern:
        session.sourceArtifact?.understanding.experiencePlan.pattern,
      campaignType: session.answers.campaignType,
      eventContext: session.answers.eventSource,
      promotedOffer: session.answers.promotedOffer,
      productDescription: session.answers.messageBelief,
      approvedQuantifiedProof,
      approvedCustomerStory,
      isSpecificUseCase: /\b(?:use case|workflow|process|operational outcome)\b/i.test(
        `${session.answers.objective ?? ""} ${session.answers.messageBelief ?? ""}`
      ),
      isNurture: /\b(?:follow[- ]?up|nurture|post[- ]?(?:launch|event))\b/i.test(
        session.answers.objective ?? ""
      )
    },
    { selectedBy: "system", locked: true }
  );
  const payload = {
    schemaVersion: "2.0" as const,
    revision:
      Math.max(session.experienceSpecRevision ?? 0, session.experienceSpec?.revision ?? 0) + 1,
    sourceBriefRevision: sourceBrief.revision,
    sourceBriefFingerprint: sourceBrief.fingerprint,
    createdAt,
    grounding: {
      seller: {
        source: brand.source,
        sourceUrl: publicCitation(brand.sourceUrl) ?? `https://${brand.domain}/`,
        ...(brand.identity?.confidence ? { confidence: brand.identity.confidence } : {})
      },
      ...(targetBrand
        ? {
            target: {
              source: targetBrand.source,
              sourceUrl:
                publicCitation(targetBrand.sourceUrl) ?? `https://${targetBrand.domain}/`,
              ...(targetBrand.identity?.confidence
                ? { confidence: targetBrand.identity.confidence }
                : {})
            }
          }
        : {}),
      ...(sourceKind
        ? {
            source: {
              kind: sourceKind,
              status: sourceStatus,
              ...(sourceTitle ? { title: sourceTitle } : {}),
              ...(publicHost(sourceUrl) ? { host: publicHost(sourceUrl) } : {})
            }
          }
        : {}),
      audience: {
        status: audienceLens.status,
        findingIds: audienceLens.findings
          .filter((finding) => finding.disposition !== "excluded")
          .map((finding) => finding.id)
      }
    },
    identities: {
      seller: { domain: brand.domain, name: brand.companyName },
      ...(targetBrand
        ? { target: { domain: targetBrand.domain, name: targetBrand.companyName } }
        : {}),
      ...(session.answers.promotedOffer
        ? {
            offer: {
              name: session.answers.promotedOffer,
              ...(session.campaignOfferSource?.sourceHost
                ? { sourceHost: session.campaignOfferSource.sourceHost }
                : {})
            }
          }
        : {})
    },
    brandTokens: {
      primaryColor: brand.primaryColor,
      accentColor: brand.accentColor,
      surfaceColor: brand.surfaceColor,
      ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
      ...(brand.logoUrlOnDark ? { logoUrlOnDark: brand.logoUrlOnDark } : {}),
      ...(brand.designDna
        ? {
            designDna: structuredClone(brand.designDna),
            designReceipt: {
              source: brand.designDna.source,
              confidence: brand.designDna.confidence,
              appliedFields: designDnaFieldPaths(brand.designDna)
            }
          }
        : {})
    },
    wireframeSelection,
    route: {
      kind: (session.useCase === "content" ? "content-magic" : session.useCase) as ExperienceRouteKind,
      ...(campaignSubtypeFor(session)
        ? { campaignSubtype: campaignSubtypeFor(session) }
        : {})
    },
    compositionRecipe: {
      family: wireframeSelection.family,
      archetypeId: wireframeSelection.archetypeId,
      compositionId: wireframeSelection.compositionId,
      selectedBy: "system" as const,
      locked: true as const
    },
    draft: canonicalDraft as Record<string, unknown>,
    contentItems,
    ...(session.sourceArtifact
      ? {
          sourceIntelligence: {
            artifactId: session.sourceArtifact.artifactId,
            digest: session.sourceArtifact.digest,
            status: session.sourceArtifact.status,
            confidence: session.sourceArtifact.confidence,
            ...(session.sourceArtifact.content.title
              ? { title: session.sourceArtifact.content.title }
              : {}),
            ...(session.sourceArtifact.understanding.premise
              ? { premise: session.sourceArtifact.understanding.premise }
              : {}),
            claimIds: session.sourceArtifact.understanding.claims.map((claim) => claim.id),
            citationCount: session.sourceArtifact.diagnostics.citationCount,
            experiencePattern: session.sourceArtifact.understanding.experiencePlan.pattern
          }
        }
      : {}),
    actions: [
      primaryActionFor(session, canonicalDraft.primaryCta, sourceUrl),
      ...functionalContent.actions
    ],
    contentContracts: functionalContent.contracts,
    ...(productionPage
      ? {
          production: {
            revision: productionPage.revision,
            status: "complete" as const,
            frameworkId: productionPage.framework.id,
            compositionId: productionPage.composition.compositionId,
            mediaIntent: productionPage.mediaIntent,
            sections: productionPage.sections.map((section) => ({
              id: section.sectionId,
              role: section.role,
              status: section.status,
              wordCount: section.wordCount,
              evidenceRefs: [...section.evidenceRefs]
            })),
            claimEvidenceCount: productionPage.claimToEvidence.length
          }
        }
      : {}),
    cta: {
      intent: session.answers.ctaType ?? "explore",
      style: session.answers.ctaStyle ?? "solid",
      label: canonicalDraft.primaryCta,
      actionId: "primary-conversion"
    },
    personalization: compilePersonalizationPlan({
      draft: canonicalDraft,
      seller: brand,
      ...(targetBrand ? { target: targetBrand } : {}),
      useCase: session.useCase,
      answers: session.answers,
      evidenceItems: session.evidenceItems,
      audienceRecommendations: session.audienceRecommendations
    }),
    selectedAssetIds: [...(session.answers.selectedAssetIds ?? [])],
    evidenceItemIds: (session.evidenceItems ?? [])
      .filter((item) => item.disposition !== "excluded")
      .map((item) => item.id),
    curatedSections: structuredClone(session.curatedSections ?? []),
    analytics: { events: [...PREVIEW_INTERACTION_TYPES] },
    renderers: {
      web: { status: "ready" as const, hosting: "app" as const },
      folloze: {
        status: "disabled" as const,
        reason: "public-runtime-html-only" as const
      }
    }
  };
  return { ...payload, artifactDigest: digest(payload) };
}

export function draftFromExperienceSpec(spec: ExperienceSpec): ExperienceDraft {
  return canonicalizeExperienceDraft(experienceDraftSchema.parse(spec.draft));
}

export function canonicalizeExperienceDraft(draft: ExperienceDraft): ExperienceDraft {
  // "Canonical" means one validated, versioned ExperienceSpec. It does not
  // mean forcing every campaign register through one generic page geometry.
  // The selected wireframe/shape is part of the approved spec and must survive
  // the web and future Folloze renderers unchanged.
  return experienceDraftSchema.parse(structuredClone(draft));
}
