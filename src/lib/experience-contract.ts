import { createHash } from "node:crypto";

import {
  experienceDraftSchema,
  type ExperienceDraft
} from "@/lib/generation/experience-schema";
import { CANONICAL_EXPERIENCE_STRUCTURE } from "@/lib/generation/campaign-context";
import {
  PREVIEW_INTERACTION_TYPES,
  type AudienceLensArtifact,
  type AudienceLensFinding,
  type CampaignBrief,
  type CampaignBriefField,
  type CampaignOfferSource,
  type ExperienceDependency,
  type ExperienceSpecV1,
  type TryMeSession
} from "@/lib/types";

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
  targetBrand?: TryMeSession["targetBrand"]
): ExperienceSpecV1 {
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
  const payload = {
    schemaVersion: "1.0" as const,
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
      ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {})
    },
    draft: canonicalDraft as Record<string, unknown>,
    cta: {
      intent: session.answers.ctaType ?? "explore",
      style: session.answers.ctaStyle ?? "solid",
      label: canonicalDraft.primaryCta
    },
    selectedAssetIds: [...(session.answers.selectedAssetIds ?? [])],
    evidenceItemIds: (session.evidenceItems ?? [])
      .filter((item) => item.disposition !== "excluded")
      .map((item) => item.id),
    curatedSections: structuredClone(session.curatedSections ?? []),
    analytics: { events: [...PREVIEW_INTERACTION_TYPES] },
    renderers: {
      web: { status: "ready" as const },
      folloze: { status: "not-requested" as const }
    }
  };
  return { ...payload, artifactDigest: digest(payload) };
}

export function draftFromExperienceSpec(spec: ExperienceSpecV1): ExperienceDraft {
  return canonicalizeExperienceDraft(experienceDraftSchema.parse(spec.draft));
}

export function canonicalizeExperienceDraft(draft: ExperienceDraft): ExperienceDraft {
  return {
    ...structuredClone(draft),
    wireframeName: CANONICAL_EXPERIENCE_STRUCTURE.wireframeName,
    experienceShape: CANONICAL_EXPERIENCE_STRUCTURE.experienceShape,
    sectionSequence: [...CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence]
  };
}
