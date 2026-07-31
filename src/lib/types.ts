export const USE_CASES = ["abm", "campaign", "content"] as const;

export type UseCase = (typeof USE_CASES)[number];
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
}

export interface ClaimResult {
  session: PublicTryMeSession;
  emailDelivery: "sent" | "skipped" | "failed";
  publishMode: "folloze" | "preview-only";
}
