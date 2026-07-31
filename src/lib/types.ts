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

export interface BrandProfile {
  domain: string;
  companyName: string;
  title?: string;
  description?: string;
  publicContext?: string;
  publicTopics: string[];
  logoUrl?: string;
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
  identity?: EntityIdentity;
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
  | "companyName"
  | "logoUrl"
  | "colors"
  | "primaryColor"
  | "accentColor"
  | "surfaceColor"
  | "source"
  | "identity"
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
  generationSource: "openai" | "deterministic-fallback";
  artifactRevision: number;
  artifactDigest: string;
}

export type PublicExperienceSummary = Pick<
  ExperienceModel,
  "title" | "headline" | "generationSource" | "artifactRevision"
> & { ready: true };

export interface SessionEvent {
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
  source: "seller-category-fallback" | "seller-target-synthesis";
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
  entityRole?: "target";
  confidence?: IntelligenceConfidence;
}

export interface SourceConfirmation {
  status: "unconfirmed" | "confirmed" | "rejected";
  confirmedAt?: string;
  sourceKind?: "public-url" | "uploaded-pdf" | "event-context" | "public-account";
  provenance?: "user-submitted" | "user-confirmed" | "system-extracted";
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
  confirmedAt?: string;
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
  };
  draft: Record<string, unknown>;
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
  "schemaVersion" | "revision" | "sourceBriefRevision" | "artifactDigest" | "renderers"
> & {
  sectionCount: number;
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

export interface TryMeSession {
  id: string;
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
  | "sourceFingerprint"
> & {
  answers: PublicSessionAnswers;
  brand?: PublicBrandProfile;
  targetBrand?: PublicBrandProfile;
  stages: Record<StageKey, PublicStageState>;
  experience?: PublicExperienceSummary;
  experienceSpec?: PublicExperienceSpecSummary;
  campaignOfferSource?: PublicCampaignOfferSource;
  claim?: PublicClaimState;
};

export interface CreateSessionInput {
  useCase: UseCase;
  companyDomain: string;
  exampleMode?: boolean;
  exampleKey?: string;
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
