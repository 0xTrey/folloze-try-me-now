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
  logoUrl?: string;
  colors: string[];
  primaryColor: string;
  accentColor: string;
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
}

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
  primaryCta: string;
  audienceLabel: string;
  narrativeArc: string;
  sections: ExperienceSection[];
  signalLabels: string[];
  html: string;
  generationSource: "openai" | "deterministic-fallback";
}

export interface SessionEvent {
  name: string;
  at: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface ClaimState {
  email?: string;
  emailMasked?: string;
  emailStatus?: "pending" | "sent" | "skipped" | "failed";
  publishStatus?: "pending" | "published" | "preview-only" | "failed";
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

export type PublicTryMeSession = Omit<TryMeSession, "claim" | "editorTokenHash"> & {
  claim?: Omit<ClaimState, "email">;
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
