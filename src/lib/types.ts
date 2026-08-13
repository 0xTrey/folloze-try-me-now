import type { SourceArtifact } from "@/lib/content-intelligence";
import type { WireframeSelectionV1 } from "@/lib/generation/wireframe-library";

export const USE_CASES = ["abm", "campaign", "content"] as const;
export const EXPERIENCE_MODES = ["custom", "example"] as const;
export const CTA_TYPES = [
  "book-meeting",
  "contact-sales",
  "register",
  "download",
  "explore",
  "custom"
] as const;
export const CTA_STYLES = ["solid", "outline", "text"] as const;
export const STYLE_VARIANTS = ["brand-led", "editorial", "technical", "minimal"] as const;
export const TONE_VARIANTS = ["executive", "technical", "provocative", "consultative"] as const;
export const LAYOUT_VARIANTS = ["narrative", "modular", "immersive", "compact"] as const;
export const EXPERIENCE_BLOCK_IDS = [
  "hero",
  "thesis",
  "decision-lenses",
  "guided-questions",
  "closing"
] as const;
export const PREVIEW_INTERACTION_TYPES = [
  "preview-opened",
  "section-viewed",
  "lens-selected",
  "cta-clicked",
  "share-started",
  "email-prompt-viewed"
] as const;
export const BRIEF_FIELD_PROVENANCE = ["user", "inferred", "research"] as const;
export const INTELLIGENCE_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const INTELLIGENCE_CONFIRMATION_STATUSES = [
  "confirmed",
  "needs-confirmation",
  "rejected"
] as const;
export const INTELLIGENCE_PROVENANCE_KINDS = [
  "user-input",
  "public-page",
  "brand-harvester",
  "verified-profile",
  "uploaded-source",
  "deterministic-fallback"
] as const;
export const BRIEF_FIELD_KEYS = ["seller", "target", "offer", "audience", "objective"] as const;
export const EXPERIENCE_DEPENDENCIES = [
  "seller-brand",
  "target-research",
  "audience-lens",
  "offer-source",
  "message-spine",
  "experience-sections",
  "cta"
] as const;
export const CURATED_SECTION_FAMILIES = [
  "proof",
  "customer-story",
  "faq",
  "resource-carousel",
  "assessment",
  "calculator",
  "cta"
] as const;

export type UseCase = (typeof USE_CASES)[number];
export type ExperienceMode = (typeof EXPERIENCE_MODES)[number];
export type CtaType = (typeof CTA_TYPES)[number];
export type CtaStyle = (typeof CTA_STYLES)[number];
export type StyleVariant = (typeof STYLE_VARIANTS)[number];
export type ToneVariant = (typeof TONE_VARIANTS)[number];
export type LayoutVariant = (typeof LAYOUT_VARIANTS)[number];
export type ExperienceBlockId = (typeof EXPERIENCE_BLOCK_IDS)[number];
export type PreviewInteractionType = (typeof PREVIEW_INTERACTION_TYPES)[number];
export type BriefFieldProvenance = (typeof BRIEF_FIELD_PROVENANCE)[number];
export type IntelligenceConfidence = (typeof INTELLIGENCE_CONFIDENCE_LEVELS)[number];
export type IntelligenceConfirmationStatus =
  (typeof INTELLIGENCE_CONFIRMATION_STATUSES)[number];
export type IntelligenceProvenanceKind =
  (typeof INTELLIGENCE_PROVENANCE_KINDS)[number];
export type BriefFieldKey = (typeof BRIEF_FIELD_KEYS)[number];
export type ExperienceDependency = (typeof EXPERIENCE_DEPENDENCIES)[number];
export type CuratedSectionFamily = (typeof CURATED_SECTION_FAMILIES)[number];
export type StageKey = "brand" | "audience" | "story";
export type StageStatus = "pending" | "running" | "complete" | "fallback" | "failed";
export type SessionStatus =
  | "collecting"
  | "generating"
  | "preview_provisional"
  | "preview_ready_unclaimed"
  | "claim_pending"
  | "claimed"
  | "generation_failed"
  | "claim_failed"
  | "expired";

export interface StageState {
  status: StageStatus;
  attemptId?: string;
  inputFingerprint?: string;
  startedAt?: string;
  completedAt?: string;
  detail?: string;
  artifact?: string;
  errorCode?: string;
}

export interface IntelligenceProvenance {
  kind: IntelligenceProvenanceKind;
  sourceUrl?: string;
  detail: string;
}

/**
 * Identity evidence stays attached to the entity it describes. Seller and
 * target profiles may share a shape, but their evidence is never merged.
 */
export interface EntityIdentity {
  expectedDomain: string;
  canonicalDomain: string;
  canonicalName: string;
  confidence: IntelligenceConfidence;
  confirmationStatus: IntelligenceConfirmationStatus;
  confirmedBy?: "system" | "user";
  reasons: string[];
  provenance: IntelligenceProvenance[];
}

/**
 * A logo copied into the server-side session boundary after strict content
 * validation. The browser never receives these bytes in the session payload;
 * it receives a session-scoped first-party image route instead.
 */
export interface PortableBrandLogo {
  mediaType: "image/avif" | "image/gif" | "image/jpeg" | "image/png" | "image/svg+xml" | "image/webp";
  encoding: "base64";
  bytesBase64: string;
  sha256: string;
  source: "official-inline-svg" | "official-remote-asset" | "brandfetch";
}

export type BrandReadinessStatus = "ready" | "incomplete";

/**
 * A small, public-safe summary of the evidence behind a reconstructed brand.
 * Raw asset URLs, copied logo bytes, and extraction diagnostics stay server-side.
 */
export interface BrandReadiness {
  status: BrandReadinessStatus;
  identityReady: boolean;
  logoReady: boolean;
  paletteReady: boolean;
  designReady: boolean;
  sourceEvidenceReady: boolean;
  reasons: string[];
}

/**
 * Public-site design evidence reduced to a small, renderer-safe vocabulary.
 * The browser harvester may observe arbitrary CSS, but only these bounded
 * semantic tokens cross the runtime contract. Raw selectors, CSS strings,
 * pseudo-element content, and source markup never reach the renderer.
 */
export interface BrandDesignDNA {
  version: 1;
  source: "remote-harvester" | "verified-profile" | "legacy-presentation";
  confidence: IntelligenceConfidence;
  theme?: {
    hero: "light" | "dark";
    motif?: "none" | "soft-gradient" | "radial-glow" | "technical-grid";
  };
  colors?: {
    darkSurface?: string;
    softSurface?: string;
    supportingAccent?: string;
    lightSurfaceAccent?: string;
    lightText?: string;
    mutedText?: string;
    divider?: string;
    focus?: string;
  };
  typography?: {
    fallback?: "sans" | "serif";
    headingWeight?: number;
    bodyWeight?: number;
    headingLetterSpacingEm?: number;
    headingLineHeight?: number;
  };
  buttons?: {
    primaryBackground?: string;
    primaryText?: string;
    primaryHover?: string;
    primaryActive?: string;
    secondaryBorder?: string;
    secondaryText?: string;
    radiusPx?: number;
    heightPx?: number;
    borderWidthPx?: number;
  };
  cards?: {
    radiusPx?: number;
    borderWidthPx?: number;
    shadow?: "none" | "soft" | "strong";
  };
  spacing?: {
    contentMaxWidthPx?: number;
    sectionBlockPx?: number;
    gridGapPx?: number;
  };
}

export interface BrandProfile {
  domain: string;
  /** Canonical public hostname after a verified first-party redirect or provider match. */
  canonicalDomain?: string;
  /** Verified host aliases that may supply first-party source evidence for this brand. */
  domainAliases?: string[];
  companyName: string;
  title?: string;
  description?: string;
  publicContext?: string;
  publicTopics: string[];
  logoUrl?: string;
  /** Alternate logo artwork intended for dark surfaces. */
  logoUrlOnDark?: string;
  /** Original HTTPS logo source retained only for the server-side image proxy. */
  logoSourceUrl?: string;
  /** Validated logo bytes retained only in the server-side session record. */
  portableLogo?: PortableBrandLogo;
  imageUrls: string[];
  colors: string[];
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  displayFontFamily?: string;
  bodyFontFamily?: string;
  displayFontUrl?: string;
  bodyFontUrl?: string;
  sourceUrl: string;
  source: "brand-harvester" | "fast-extractor" | "fallback";
  /** Bounded design-system evidence used by standardized experience renderers. */
  designDna?: BrandDesignDNA;
  identity?: EntityIdentity;
  readiness?: BrandReadiness;
  /** Server-only receipt explaining bounded brand and logo extraction decisions. */
  diagnostics?: {
    logo: {
      strategy:
        | "semantic-image"
        | "favicon"
        | "inline-svg-portable"
        | "inline-svg-unportable"
        | "official-remote-portable"
        | "brandfetch-portable"
        | "brandfetch-brand-api"
        | "brandfetch-logo-api"
        | "remote-profile"
        | "verified-profile"
        | "none";
      imageCandidateCount: number;
      rejectedImageCount: number;
      inlineSvgCandidateCount: number;
      selectedScore?: number;
      /** Candidate layer that supplied the selected logo, without exposing its URL. */
      selectedSource?:
        | "semantic-image"
        | "json-ld"
        | "itemprop"
        | "css"
        | "meta"
        | "link-icon"
        | "remote-profile"
        | "brandfetch"
        | "verified-profile";
      /** Number of remote candidates whose bytes were checked before selection. */
      validationAttempted?: number;
      /** Number of candidates rejected for status, size, or non-image bytes. */
      validationRejected?: number;
      /** True after all configured logo-resolution layers have been exhausted. */
      resolutionComplete?: boolean;
    };
    palette?: {
      strategy:
        | "verified-profile"
        | "semantic-tokens"
        | "source-rules"
        | "metadata"
        | "frequency"
        | "brandfetch"
        | "remote-profile"
        | "fallback";
      confidence: IntelligenceConfidence;
      candidateCount: number;
      semanticCandidateCount: number;
      rejectedCandidateCount: number;
      gradientCandidateCount: number;
      /** True after all configured palette-resolution layers have been exhausted. */
      resolutionComplete?: boolean;
    };
    stylesheetAttempted?: number;
    stylesheetSucceeded?: number;
    /** Bounded Brandfetch enrichment receipt. Raw provider payloads and URLs are excluded. */
    brandfetch?: {
      qualityTier: "high" | "medium" | "low" | "unknown";
      claimed?: boolean;
      logoCandidateCount: number;
      logoValidationAttempted: number;
      logoValidationRejected: number;
      colorCount: number;
      fontCount: number;
      imageCount: number;
      industryCount: number;
    };
    /** Public-safe completeness receipt from the browser-backed design pass. */
    designFidelity?: {
      designReady: boolean;
      score: number;
      missing: string[];
      harvestRequestId?: string;
      desktopRendered?: boolean;
      mobileRendered?: boolean;
      screenshotEvidenceCount?: number;
      buttonVariantCount?: number;
      layoutCandidateCount?: number;
    };
    /** Aggregate provider receipt. No page text, credentials, or asset URLs. */
    providers?: {
      publicPage: "succeeded" | "failed";
      publicPageAttempts: number;
      remoteBrowser: "succeeded" | "failed" | "not_configured";
      brandfetch: "succeeded" | "failed" | "not_configured" | "not_needed";
      /** Configured means the browser hotlink was issued; onLoad/onError confirms rendering. */
      brandfetchLogoApi?: "configured" | "not_configured";
      brandfetchBrandApi?:
        | "succeeded"
        | "not_found"
        | "unauthorized"
        | "rate_limited"
        | "invalid_response"
        | "failed"
        | "not_configured"
        | "not_needed";
      verifiedFallback: boolean;
    };
  };
}

export interface SessionAnswers {
  sellerConfirmed?: boolean;
  targetDomain?: string;
  targetConfirmed?: boolean;
  audience?: string;
  customAudience?: string;
  objective?: string;
  campaignType?: "product" | "demand" | "event";
  eventSource?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourceTitle?: string;
  sourceOpenAIFileId?: string;
  sourceUploadId?: string;
  sourceUploadReservedAt?: string;
  promotedOffer?: string;
  promotedOfferConfirmed?: boolean;
  offerSourceUrl?: string;
  offerSourceTitle?: string;
  offerSourceConfirmed?: boolean;
  exampleMode?: boolean;
  exampleKey?: string;
  sourceConfirmed?: boolean;
  sourceTopicConfirmed?: boolean;
  messageBelief?: string;
  messageAction?: string;
  ctaType?: CtaType;
  ctaStyle?: CtaStyle;
  styleVariant?: StyleVariant;
  toneVariant?: ToneVariant;
  layoutVariant?: LayoutVariant;
  selectedAssetIds?: string[];
}

export type PublicSessionAnswers = Omit<
  SessionAnswers,
  | "sourceOpenAIFileId"
  | "sourceUploadId"
  | "sourceUploadReservedAt"
  | "offerSourceUrl"
>;

export type PublicStageState = Pick<
  StageState,
  "status" | "completedAt" | "detail" | "artifact" | "errorCode"
>;

export type PublicBrandProfile = Pick<
  BrandProfile,
  | "domain"
  | "canonicalDomain"
  | "domainAliases"
  | "companyName"
  | "logoUrl"
  | "logoUrlOnDark"
  | "colors"
  | "primaryColor"
  | "accentColor"
  | "surfaceColor"
  | "source"
  | "readiness"
>;

export interface ExperienceSection {
  eyebrow: string;
  headline: string;
  body: string;
  proof: string;
}

export interface ExperienceModel {
  title: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  thesisHeadline: string;
  thesisBody: string;
  primaryCta: string;
  audienceLabel: string;
  narrativeArc: string;
  sections: ExperienceSection[];
  signalLabels: string[];
  closingHeadline: string;
  closingBody: string;
  html: string;
  readiness?: "provisional" | "final";
  generationSource: "openai" | "deterministic-fallback";
  artifactRevision: number;
  artifactDigest: string;
}

export type PublicExperienceSummary = Pick<
  ExperienceModel,
  "title" | "headline" | "readiness" | "generationSource" | "artifactRevision"
> & { ready: true };

export interface SessionEvent {
  id?: string;
  name: string;
  at: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface AudienceRecommendation {
  id: string;
  label: string;
  rationale: string;
  evidenceItemIds: string[];
  confidence: "high" | "medium" | "hypothesis";
  source:
    | "seller-category-fallback"
    | "seller-public-evidence"
    | "seller-target-synthesis";
  confirmationStatus?: IntelligenceConfirmationStatus;
  targetName?: string;
  evidenceSummary?: string;
}

export interface SessionEvidenceItem {
  id: string;
  type: "public-positioning" | "public-operating-context" | "public-focus-area";
  label: string;
  text: string;
  sourceUrl: string;
  signals: string[];
  disposition: "available" | "pinned" | "excluded";
  entityRole?: "seller" | "target";
  confidence?: IntelligenceConfidence;
}

export interface SourceConfirmation {
  status: "unconfirmed" | "confirmed" | "rejected";
  confirmedAt?: string;
  sourceKind?: "public-url" | "uploaded-pdf" | "event-context" | "public-account";
  provenance?: "user-submitted" | "user-confirmed" | "system-extracted";
}

/**
 * Editor-safe summary of source understanding. Full extracted text and raw
 * citation excerpts remain server-side on TryMeSession.sourceArtifact.
 */
export interface PublicSourceInsight {
  status: SourceArtifact["status"];
  confidence: SourceArtifact["confidence"];
  title?: string;
  premise?: string;
  topics: string[];
  claims: Array<{
    id: string;
    text: string;
    sourceLabels: string[];
  }>;
  extraction: {
    method: SourceArtifact["extraction"]["method"];
    status: SourceArtifact["extraction"]["status"];
    pageCount?: number;
    extractedPageCount?: number;
    ocrStatus: SourceArtifact["extraction"]["ocr"]["status"];
    warnings: string[];
  };
  experiencePattern: SourceArtifact["understanding"]["experiencePlan"]["pattern"];
  moduleKinds: SourceArtifact["understanding"]["experiencePlan"]["modules"][number]["kind"][];
  assetCount: number;
  citationCount: number;
}

export interface SourceGrounding {
  kind: "public-url" | "uploaded-pdf" | "event-context" | "none";
  title?: string;
  sourceUrl?: string;
  sourceHost?: string;
  topics: string[];
  confidence: IntelligenceConfidence;
  confirmationStatus: IntelligenceConfirmationStatus;
  provenance: IntelligenceProvenance[];
  reason: string;
}

export interface ExperienceAsset {
  id: string;
  kind: "seller-logo" | "seller-image" | "target-logo" | "target-image";
  label: string;
  url: string;
  source: "seller" | "target";
}

export interface ExperienceBlockControl {
  id: ExperienceBlockId;
  visible?: boolean;
  locked?: boolean;
  eyebrow?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
}

export interface PreviewAnalytics {
  totalInteractions: number;
  lastInteractionAt?: string;
  counts: Partial<Record<PreviewInteractionType, number>>;
  lastElementId?: string;
}

export interface QualityReceiptCheck {
  id:
    | "copy"
    | "identity"
    | "account-evidence"
    | "source-confirmation"
    | "source-grounding"
    | "claims"
    | "cta"
    | "structure";
  label: string;
  status: "passed" | "warning" | "not-applicable";
  detail: string;
}

export interface QualityReceipt {
  status: "passed" | "needs-review";
  checkedAt: string;
  artifactRevision: number;
  checks: QualityReceiptCheck[];
}

export interface ClaimCockpitMetadata {
  savedAt: string;
  companyDomain: string;
  targetDomain?: string;
  audience?: string;
  objective?: string;
  ctaType?: CtaType;
  ctaStyle?: CtaStyle;
  styleVariant?: StyleVariant;
  toneVariant?: ToneVariant;
  layoutVariant?: LayoutVariant;
  qualityStatus?: QualityReceipt["status"];
  artifactRevision: number;
  versionNumber: number;
  previewInteractions: number;
}

export interface SessionLineage {
  rootSessionId: string;
  parentSessionId?: string;
  duplicatedFromSessionId?: string;
  versionNumber: number;
  label?: string;
}

export interface CampaignBriefField {
  key: BriefFieldKey;
  label: string;
  value: string;
  provenance: BriefFieldProvenance;
  citations: string[];
  userEdited: boolean;
  locked: boolean;
  required: boolean;
  dependencies: ExperienceDependency[];
}

export interface CampaignBrief {
  revision: number;
  fingerprint: string;
  updatedAt: string;
  fields: Partial<Record<BriefFieldKey, CampaignBriefField>>;
}

export interface AudienceLensFinding {
  id: string;
  category: "priority" | "challenge" | "buyer-concern";
  label: string;
  text: string;
  citationUrl: string;
  disposition: SessionEvidenceItem["disposition"];
}

export interface AudienceLensArtifact {
  status: "researching" | "ready" | "hypothesis";
  accountDomain: string;
  accountName: string;
  preparedAt: string;
  findings: AudienceLensFinding[];
}

export interface CampaignOfferSource {
  title?: string;
  sourceUrl: string;
  sourceHost: string;
  status: "unconfirmed" | "confirmed" | "rejected";
  /** Public-safe progress for the background offer/source extraction pass. */
  intelligenceStatus?: "pending" | "researching" | "ready" | "failed";
  confirmedAt?: string;
}

export interface ExperienceContentItem {
  id: string;
  kind: "insight" | "chapter" | "proof" | "resource";
  eyebrow: string;
  title: string;
  summary: string;
  actionLabel: string;
  sourceCitationIds: string[];
  sourceLabel?: string;
  illustrative?: boolean;
}

export interface ExperienceSourceIntelligence {
  artifactId: string;
  digest: string;
  status: SourceArtifact["status"];
  confidence: SourceArtifact["confidence"];
  title?: string;
  premise?: string;
  claimIds: string[];
  citationCount: number;
  experiencePattern: SourceArtifact["understanding"]["experiencePlan"]["pattern"];
}

export type PublicCampaignOfferSource = Omit<CampaignOfferSource, "sourceUrl">;

export interface CuratedSectionControl {
  id: string;
  family: CuratedSectionFamily;
  position: number;
  visible: boolean;
  locked: boolean;
  instruction?: string;
}

/**
 * Versioned intermediate artifact shared by renderers. V1 deliberately records
 * the native Folloze renderer as not requested; creating or publishing a board
 * remains a separate, explicitly authorized lifecycle operation.
 */
export interface ExperienceSpecV1 {
  schemaVersion: "1.0";
  revision: number;
  sourceBriefRevision: number;
  sourceBriefFingerprint: string;
  createdAt: string;
  artifactDigest: string;
  grounding: {
    seller: {
      source: BrandProfile["source"];
      sourceUrl: string;
      confidence?: IntelligenceConfidence;
    };
    target?: {
      source: BrandProfile["source"];
      sourceUrl: string;
      confidence?: IntelligenceConfidence;
    };
    source?: {
      kind: NonNullable<SourceConfirmation["sourceKind"]>;
      status: SourceConfirmation["status"];
      title?: string;
      host?: string;
    };
    audience: {
      status: AudienceLensArtifact["status"];
      findingIds: string[];
    };
  };
  identities: {
    seller: { domain: string; name: string };
    target?: { domain: string; name: string };
    offer?: { name: string; sourceHost?: string };
  };
  brandTokens: {
    primaryColor: string;
    accentColor: string;
    surfaceColor: string;
    logoUrl?: string;
    logoUrlOnDark?: string;
    /** Added compatibly to V1 specs; legacy persisted specs may omit it. */
    designDna?: BrandDesignDNA;
    /** Renderer-facing receipt for deterministic QA of harvested token use. */
    designReceipt?: {
      source: BrandDesignDNA["source"];
      confidence: BrandDesignDNA["confidence"];
      appliedFields: string[];
    };
  };
  /** Backend-selected layout receipt. Legacy persisted specs may omit it. */
  wireframeSelection?: WireframeSelectionV1;
  draft: Record<string, unknown>;
  /** Added compatibly to V1 specs; legacy persisted sessions may not include it. */
  contentItems?: ExperienceContentItem[];
  sourceIntelligence?: ExperienceSourceIntelligence;
  cta: {
    intent: CtaType;
    style: CtaStyle;
    label: string;
  };
  selectedAssetIds: string[];
  evidenceItemIds: string[];
  curatedSections: CuratedSectionControl[];
  analytics: { events: PreviewInteractionType[] };
  renderers: {
    web: { status: "ready" };
    folloze: { status: "not-requested" };
  };
}

export type PublicExperienceSpecSummary = Pick<
  ExperienceSpecV1,
  | "schemaVersion"
  | "revision"
  | "sourceBriefRevision"
  | "artifactDigest"
  | "renderers"
  | "wireframeSelection"
> & {
  sectionCount: number;
  contentItemCount: number;
  sourceStatus?: ExperienceSourceIntelligence["status"];
};

export interface ClaimState {
  attemptId?: string;
  startedAt?: string;
  email?: string;
  emailMasked?: string;
  emailStatus?: "pending" | "not-attempted" | "sent" | "skipped" | "failed";
  publishStatus?: "pending" | "not-attempted" | "published" | "preview-only" | "failed";
  follozeBoardId?: string;
  designerUrl?: string;
}

export interface SessionAnalyticsIdentity {
  visitorId: string;
  browserSessionId: string;
  /** Bounded landing attribution only; no referrer path or raw query string. */
  utm?: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
}

export interface TryMeSession {
  id: string;
  /** Server-only correlation ID. Never expose the public session URL as an ops identifier. */
  traceId?: string;
  /** Server-only first-party product analytics correlation. It grants no session access. */
  analytics?: SessionAnalyticsIdentity;
  editorTokenHash: string;
  useCase: UseCase;
  companyDomain: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  claimedAt?: string;
  temporaryUrl: string;
  liveUrl?: string;
  revision: number;
  stages: Record<StageKey, StageState>;
  answers: SessionAnswers;
  brand?: BrandProfile;
  targetBrand?: BrandProfile;
  audienceSuggestions: string[];
  experienceMode?: ExperienceMode;
  exampleKey?: string;
  audienceRecommendations?: AudienceRecommendation[];
  selectedAudienceRecommendationId?: string;
  evidenceItems?: SessionEvidenceItem[];
  sourceConfirmation?: SourceConfirmation;
  /** Server-only normalized extraction and understanding artifact. */
  sourceArtifact?: SourceArtifact;
  /** Internal digest proving source confirmation belongs to the current source. */
  sourceFingerprint?: string;
  availableAssets?: ExperienceAsset[];
  blockControls?: ExperienceBlockControl[];
  previewAnalytics?: PreviewAnalytics;
  qualityReceipt?: QualityReceipt;
  cockpit?: ClaimCockpitMetadata;
  lineage?: SessionLineage;
  campaignBrief?: CampaignBrief;
  audienceLens?: AudienceLensArtifact;
  campaignOfferSource?: CampaignOfferSource;
  curatedSections?: CuratedSectionControl[];
  experienceSpecRevision?: number;
  experienceSpec?: ExperienceSpecV1;
  experience?: ExperienceModel;
  claim?: ClaimState;
  events: SessionEvent[];
}

export type PublicClaimState = Pick<
  ClaimState,
  "emailStatus" | "publishStatus"
>;

export type PublicTryMeSession = Omit<
  TryMeSession,
  | "answers"
  | "brand"
  | "claim"
  | "editorTokenHash"
  | "events"
  | "experience"
  | "experienceSpec"
  | "experienceSpecRevision"
  | "campaignOfferSource"
  | "stages"
  | "targetBrand"
  | "traceId"
  | "analytics"
  | "sourceFingerprint"
  | "sourceArtifact"
> & {
  supportRef: string;
  answers: PublicSessionAnswers;
  brand?: PublicBrandProfile;
  targetBrand?: PublicBrandProfile;
  stages: Record<StageKey, PublicStageState>;
  experience?: PublicExperienceSummary;
  experienceSpec?: PublicExperienceSpecSummary;
  campaignOfferSource?: PublicCampaignOfferSource;
  sourceInsight?: PublicSourceInsight;
  claim?: PublicClaimState;
};

export interface CreateSessionInput {
  useCase: UseCase;
  companyDomain: string;
  exampleMode?: boolean;
  exampleKey?: string;
  analytics?: SessionAnalyticsIdentity;
}

export interface SessionWorkspacePatch {
  answers?: SessionAnswers;
  selectedAudienceRecommendationId?: string | null;
  evidenceDecisions?: Array<{
    id: string;
    disposition: SessionEvidenceItem["disposition"];
  }>;
  sourceConfirmation?: SourceConfirmation["status"];
  offerSourceConfirmation?: CampaignOfferSource["status"];
  blockControls?: ExperienceBlockControl[];
  curatedSections?: CuratedSectionControl[];
}

export interface PreviewInteractionInput {
  event: PreviewInteractionType;
  elementId?: string;
  value?: string;
}

export interface DuplicateSessionInput {
  mode: "duplicate" | "version";
  label?: string;
}

export interface ClaimResult {
  session: PublicTryMeSession;
  emailDelivery: "sent" | "skipped" | "failed";
  publishMode: "folloze" | "preview-only";
}
