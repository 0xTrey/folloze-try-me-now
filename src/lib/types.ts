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

export type UseCase = (typeof USE_CASES)[number];
export type ExperienceMode = (typeof EXPERIENCE_MODES)[number];
export type CtaType = (typeof CTA_TYPES)[number];
export type StyleVariant = (typeof STYLE_VARIANTS)[number];
export type ToneVariant = (typeof TONE_VARIANTS)[number];
export type LayoutVariant = (typeof LAYOUT_VARIANTS)[number];
export type ExperienceBlockId = (typeof EXPERIENCE_BLOCK_IDS)[number];
export type PreviewInteractionType = (typeof PREVIEW_INTERACTION_TYPES)[number];
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
}

export interface SessionAnswers {
  targetDomain?: string;
  audience?: string;
  customAudience?: string;
  objective?: string;
  campaignType?: "product" | "demand" | "event";
  eventSource?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourceOpenAIFileId?: string;
  sourceUploadId?: string;
  sourceUploadReservedAt?: string;
  exampleMode?: boolean;
  exampleKey?: string;
  sourceConfirmed?: boolean;
  messageBelief?: string;
  messageAction?: string;
  ctaType?: CtaType;
  ctaDestination?: string;
  styleVariant?: StyleVariant;
  toneVariant?: ToneVariant;
  layoutVariant?: LayoutVariant;
  selectedAssetIds?: string[];
}

export type PublicSessionAnswers = Omit<
  SessionAnswers,
  "sourceOpenAIFileId" | "sourceUploadId" | "sourceUploadReservedAt"
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
}

export interface SessionEvidenceItem {
  id: string;
  type: "public-positioning" | "public-operating-context" | "public-focus-area";
  label: string;
  text: string;
  sourceUrl: string;
  signals: string[];
  disposition: "available" | "pinned" | "excluded";
}

export interface SourceConfirmation {
  status: "unconfirmed" | "confirmed" | "rejected";
  confirmedAt?: string;
  sourceKind?: "public-url" | "uploaded-pdf" | "event-context" | "public-account";
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
  id: "copy" | "account-evidence" | "source-confirmation" | "cta" | "structure";
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
  availableAssets?: ExperienceAsset[];
  blockControls?: ExperienceBlockControl[];
  previewAnalytics?: PreviewAnalytics;
  qualityReceipt?: QualityReceipt;
  cockpit?: ClaimCockpitMetadata;
  lineage?: SessionLineage;
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
  | "stages"
  | "targetBrand"
> & {
  answers: PublicSessionAnswers;
  brand?: PublicBrandProfile;
  targetBrand?: PublicBrandProfile;
  stages: Record<StageKey, PublicStageState>;
  experience?: PublicExperienceSummary;
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
  blockControls?: ExperienceBlockControl[];
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
