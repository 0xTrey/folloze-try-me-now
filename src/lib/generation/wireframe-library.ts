import type { CampaignGenerationContext } from "@/lib/generation/campaign-context";
import type { ExperienceSpecV1, SessionAnswers, UseCase } from "@/lib/types";

export const wireframeFamilies = ["account", "campaign", "content"] as const;
export const compositionIds = [
  "editorial-split",
  "evidence-lead",
  "interactive-paths",
  "workflow-spine",
  "data-story",
  "chapter-journey"
] as const;

export const accountArchetypeIds = [
  "account-executive",
  "account-technical",
  "account-proof",
  "account-team",
  "account-workshop"
] as const;

export const campaignArchetypeIds = [
  "campaign-product",
  "campaign-demand",
  "campaign-use-case",
  "campaign-event",
  "campaign-proof",
  "campaign-nurture"
] as const;

export const contentArchetypeIds = [
  "content-report",
  "content-guide",
  "content-research",
  "content-technical",
  "content-webinar",
  "content-assessment"
] as const;

export const wireframeArchetypeIds = [
  ...accountArchetypeIds,
  ...campaignArchetypeIds,
  ...contentArchetypeIds
] as const;

export type WireframeFamily = (typeof wireframeFamilies)[number];
export type CompositionId = (typeof compositionIds)[number];
export type AccountArchetypeId = (typeof accountArchetypeIds)[number];
export type CampaignArchetypeId = (typeof campaignArchetypeIds)[number];
export type ContentArchetypeId = (typeof contentArchetypeIds)[number];
export type WireframeArchetypeId = (typeof wireframeArchetypeIds)[number];

export type WireframeSelectionReasonCode =
  | "account-technical-audience"
  | "account-approved-proof"
  | "account-multi-role"
  | "account-workshop-objective"
  | "account-default"
  | "campaign-event"
  | "campaign-customer-proof"
  | "campaign-nurture"
  | "campaign-use-case"
  | "campaign-product-source"
  | "campaign-default"
  | "content-video"
  | "content-assessment"
  | "content-research"
  | "content-technical"
  | "content-guide"
  | "content-default"
  | "visitor-selected";

export type WireframeContentPolicy = "persuasion" | "source-preserving";

export interface WireframeArchetypeMetadata {
  id: WireframeArchetypeId;
  referenceCode: `A${1 | 2 | 3 | 4 | 5}` | `C${1 | 2 | 3 | 4 | 5 | 6}` | `M${1 | 2 | 3 | 4 | 5 | 6}`;
  family: WireframeFamily;
  label: string;
  summary: string;
  defaultWhen: string;
  primaryCompositionId: CompositionId;
  supportingCompositionIds: readonly CompositionId[];
  sectionLabels: readonly [string, string, string, string, string, string, string];
  navigationLabels: readonly string[];
  ctaRule: string;
  contentPolicy: WireframeContentPolicy;
  compatibleAlternativeIds: readonly WireframeArchetypeId[];
}

const sharedNavigation = [
  "Overview",
  "Why it matters",
  "Where to start",
  "How it works",
  "For your team",
  "Evidence",
  "Next step"
] as const;

const contentNavigation = ["Key finding", "Explore", "Chapters", "Apply it", "Source", "Next step"] as const;

const accountArchetypes = [
  {
    id: "account-executive",
    referenceCode: "A1",
    family: "account",
    label: "Executive account narrative",
    summary: "A focused, cross-functional case for a named account.",
    defaultWhen: "The account opportunity is strategic or cross-functional and no specialist signal is stronger.",
    primaryCompositionId: "editorial-split",
    supportingCompositionIds: [],
    sectionLabels: [
      "Opportunity for the account",
      "The strongest reason to believe",
      "Why this matters now",
      "Three priorities worth exploring",
      "How the outcome is created",
      "What each team needs",
      "Map the first useful move"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Offer a working session with a named deliverable.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["account-team", "account-workshop"]
  },
  {
    id: "account-technical",
    referenceCode: "A2",
    family: "account",
    label: "Technical evaluation",
    summary: "A validation path for technical owners, constraints, requirements, and evidence.",
    defaultWhen: "The audience includes architecture, security, data, infrastructure, IT, or platform leadership.",
    primaryCompositionId: "workflow-spine",
    supportingCompositionIds: [],
    sectionLabels: [
      "Technical outcome for the account",
      "Verified platform or architecture anchor",
      "Constraints the team must resolve",
      "Three validation tracks",
      "Architecture or workflow sequence",
      "Requirements, risks, and evidence by owner",
      "Scope a technical validation session"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Offer an architecture review, technical workshop, or bounded pilot definition.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["account-executive", "account-team"]
  },
  {
    id: "account-proof",
    referenceCode: "A3",
    family: "account",
    label: "Proof-led business case",
    summary: "A named-account business case grounded in approved evidence and measurable outcomes.",
    defaultWhen: "Approved customer evidence, quantified outcomes, or strong first-party proof exists.",
    primaryCompositionId: "evidence-lead",
    supportingCompositionIds: [],
    sectionLabels: [
      "Supported result and its relevance",
      "What changed for the reference customer",
      "Why the status quo remains expensive or risky",
      "Three implications for the account",
      "Mechanism behind the result",
      "Evidence the team should validate",
      "Build the account-specific business case"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Offer a business-case workshop or proof review with a concrete output.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["account-executive", "account-technical"]
  },
  {
    id: "account-team",
    referenceCode: "A4",
    family: "account",
    label: "Buying-team alignment",
    summary: "One shared outcome with useful entry points for every role involved in the decision.",
    defaultWhen: "Three or more distinct roles influence the decision or the goal is to educate the buying group.",
    primaryCompositionId: "interactive-paths",
    supportingCompositionIds: [],
    sectionLabels: [
      "One shared outcome for the account",
      "Common reason to believe",
      "Why alignment matters now",
      "Choose a role or priority",
      "Shared operating mechanism",
      "Decision, risk, benefit, and evidence by role",
      "Align on the first decision"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Offer a multi-role working session with an alignment map.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["account-executive", "account-technical"]
  },
  {
    id: "account-workshop",
    referenceCode: "A5",
    family: "account",
    label: "Innovation workshop",
    summary: "A discovery-led experience that turns an emerging opportunity into testable hypotheses.",
    defaultWhen: "The initiative is emerging, discovery-led, or framed around a new capability.",
    primaryCompositionId: "editorial-split",
    supportingCompositionIds: ["interactive-paths"],
    sectionLabels: [
      "Opportunity worth exploring",
      "Evidence that the opportunity is real",
      "Why the window matters",
      "Three hypotheses to test",
      "What the teams would map together",
      "Workshop inputs and outputs",
      "Run the innovation workshop"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Offer a workshop whose deliverable and decision are explicit.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["account-executive", "account-team"]
  }
] as const satisfies readonly WireframeArchetypeMetadata[];

const campaignArchetypes = [
  {
    id: "campaign-product",
    referenceCode: "C1",
    family: "campaign",
    label: "Product introduction",
    summary: "A product promise organized around audience use cases and supported operating change.",
    defaultWhen: "The visitor supplies a product page, product document, or explicit product description.",
    primaryCompositionId: "editorial-split",
    supportingCompositionIds: [],
    sectionLabels: [
      "Product promise for the selected audience",
      "Strongest supported reason to believe",
      "The operating change behind the launch",
      "Three use cases or starting points",
      "How the product creates the outcome",
      "Value and evidence by role",
      "Choose the first use case"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Invite the visitor to explore a use case, request a demonstration, or plan an evaluation.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["campaign-use-case", "campaign-demand"]
  },
  {
    id: "campaign-demand",
    referenceCode: "C2",
    family: "campaign",
    label: "Demand and category education",
    summary: "A problem-led campaign that helps buyers understand a category and choose a useful path.",
    defaultWhen: "The objective is awareness, education, or demand creation and the offer is broader than one product.",
    primaryCompositionId: "interactive-paths",
    supportingCompositionIds: [],
    sectionLabels: [
      "The problem worth understanding",
      "What credible evidence says",
      "Why the old approach persists",
      "Choose the problem closest to you",
      "A better operating model",
      "What changes for each team",
      "Continue with one useful action"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Invite the visitor to explore, assess, or discuss the selected problem.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["campaign-use-case", "campaign-product"]
  },
  {
    id: "campaign-use-case",
    referenceCode: "C3",
    family: "campaign",
    label: "Use-case solution campaign",
    summary: "A workflow-led campaign for one buyer job and one promised outcome.",
    defaultWhen: "The input names a specific buyer job, workflow, or operational outcome.",
    primaryCompositionId: "workflow-spine",
    supportingCompositionIds: [],
    sectionLabels: [
      "One buyer job and one promised outcome",
      "Capability that makes the outcome credible",
      "Where the current workflow breaks",
      "Three ways into the use case",
      "Action, capability, and output sequence",
      "Ownership and evidence by role",
      "Scope the first workflow"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Invite the visitor to map, validate, or pilot the workflow.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["campaign-product", "campaign-demand"]
  },
  {
    id: "campaign-event",
    referenceCode: "C4",
    family: "campaign",
    label: "Event or webinar",
    summary: "An agenda-led page that makes the value of attending or continuing obvious.",
    defaultWhen: "The input includes event details, a registration objective, or a webinar source.",
    primaryCompositionId: "chapter-journey",
    supportingCompositionIds: [],
    sectionLabels: [
      "Why this session is worth the time",
      "Speaker, source, or topic credibility",
      "Why the topic matters now",
      "Three reasons to attend or keep exploring",
      "Agenda, chapters, or takeaways",
      "Who should join and what they will leave with",
      "Register or continue the conversation"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Invite the visitor to register, watch, or continue with one topic.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["campaign-nurture", "campaign-demand"]
  },
  {
    id: "campaign-proof",
    referenceCode: "C5",
    family: "campaign",
    label: "Customer proof campaign",
    summary: "An evidence-led customer story that turns an approved result into transferable lessons.",
    defaultWhen: "An approved customer story or quantified outcome is the primary source.",
    primaryCompositionId: "evidence-lead",
    supportingCompositionIds: [],
    sectionLabels: [
      "Approved outcome",
      "Customer or source credibility",
      "Before and after",
      "Three lessons for the audience",
      "Mechanism behind the result",
      "What another team should validate",
      "Explore a similar path"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Invite the visitor to review the evidence, explore the use case, or plan a proof session.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["campaign-use-case", "campaign-demand"]
  },
  {
    id: "campaign-nurture",
    referenceCode: "C6",
    family: "campaign",
    label: "Launch follow-up and nurture",
    summary: "A guided resource journey that sustains engagement after an event or announcement.",
    defaultWhen: "The objective is follow-up, continued engagement, or resource discovery after a launch or event.",
    primaryCompositionId: "chapter-journey",
    supportingCompositionIds: ["interactive-paths"],
    sectionLabels: [
      "What changed or what to remember",
      "Strongest supporting fact",
      "Why it matters after the announcement",
      "Choose an interest path",
      "Resources arranged as a guided sequence",
      "Questions to bring to the next conversation",
      "Take the next useful action"
    ],
    navigationLabels: sharedNavigation,
    ctaRule: "Invite the visitor to open a resource, compare paths, or schedule follow-up.",
    contentPolicy: "persuasion",
    compatibleAlternativeIds: ["campaign-event", "campaign-demand"]
  }
] as const satisfies readonly WireframeArchetypeMetadata[];

const contentArchetypes = [
  {
    id: "content-report",
    referenceCode: "M1",
    family: "content",
    label: "Executive report",
    summary: "A source-grounded executive path through the central takeaway, argument, and evidence.",
    defaultWhen: "The source is a report, white paper, executive brief, or long-form PDF without a stronger specialist signal.",
    primaryCompositionId: "editorial-split",
    supportingCompositionIds: [],
    sectionLabels: [
      "Source identity and the central takeaway",
      "Executive summary in three points",
      "The argument behind the takeaway",
      "Choose a finding to explore",
      "Evidence and cited excerpts",
      "What the findings may mean for your team",
      "Read the source or continue the conversation"
    ],
    navigationLabels: contentNavigation,
    ctaRule: "Keep the original source accessible and offer one relevant continuation action.",
    contentPolicy: "source-preserving",
    compatibleAlternativeIds: ["content-guide", "content-research"]
  },
  {
    id: "content-guide",
    referenceCode: "M2",
    family: "content",
    label: "Playbook and guide",
    summary: "An interactive application path through a source-authored process, checklist, or framework.",
    defaultWhen: "The source teaches a process, framework, checklist, or set of practices.",
    primaryCompositionId: "interactive-paths",
    supportingCompositionIds: [],
    sectionLabels: [
      "What the guide helps the reader do",
      "The core principle",
      "Choose a chapter or job",
      "Guided steps from the source",
      "Examples, checklists, or supporting excerpts",
      "Apply the guide to one situation",
      "Keep the original guide or use the framework"
    ],
    navigationLabels: contentNavigation,
    ctaRule: "Offer the original guide or a way to apply its framework.",
    contentPolicy: "source-preserving",
    compatibleAlternativeIds: ["content-report", "content-assessment"]
  },
  {
    id: "content-research",
    referenceCode: "M3",
    family: "content",
    label: "Research and benchmark explorer",
    summary: "A cited data story that lets visitors explore findings without inventing a benchmark or score.",
    defaultWhen: "The source contains primary research, survey data, benchmarks, or several cited findings.",
    primaryCompositionId: "data-story",
    supportingCompositionIds: [],
    sectionLabels: [
      "The most important cited finding",
      "Research scope and credibility",
      "Three findings worth exploring",
      "Interactive benchmark or finding explorer",
      "What the evidence supports and does not support",
      "Locate your own situation without inventing a score",
      "Read the methodology or discuss the implication"
    ],
    navigationLabels: contentNavigation,
    ctaRule: "Offer the methodology, original research, or a discussion of one supported implication.",
    contentPolicy: "source-preserving",
    compatibleAlternativeIds: ["content-report", "content-assessment"]
  },
  {
    id: "content-technical",
    referenceCode: "M4",
    family: "content",
    label: "Technical document walkthrough",
    summary: "A source-cited path through architecture, prerequisites, workflows, and validation.",
    defaultWhen: "The source is a product brief, architecture guide, technical paper, implementation guide, or reference document.",
    primaryCompositionId: "workflow-spine",
    supportingCompositionIds: [],
    sectionLabels: [
      "System outcome described by the source",
      "Architecture or component overview",
      "Constraints and prerequisites",
      "Choose a technical path",
      "Workflow, architecture, or implementation sequence",
      "Validation checklist with cited source references",
      "Open the source or scope a technical review"
    ],
    navigationLabels: contentNavigation,
    ctaRule: "Offer the original source or a bounded technical review.",
    contentPolicy: "source-preserving",
    compatibleAlternativeIds: ["content-guide", "content-report"]
  },
  {
    id: "content-webinar",
    referenceCode: "M5",
    family: "content",
    label: "Webinar and video companion",
    summary: "A chaptered companion that preserves the recording while surfacing its strongest moments.",
    defaultWhen: "The source is a webinar, presentation recording, transcript, or chaptered video.",
    primaryCompositionId: "chapter-journey",
    supportingCompositionIds: [],
    sectionLabels: [
      "Topic, speaker, and central idea",
      "Why the speaker or source is credible",
      "Key takeaways",
      "Chapter or clip navigator",
      "Supporting resources and cited moments",
      "Questions worth carrying forward",
      "Watch the full source or continue with one topic"
    ],
    navigationLabels: contentNavigation,
    ctaRule: "Keep the complete recording accessible and offer continuation by topic.",
    contentPolicy: "source-preserving",
    compatibleAlternativeIds: ["content-report", "content-guide"]
  },
  {
    id: "content-assessment",
    referenceCode: "M6",
    family: "content",
    label: "Assessment workbench",
    summary: "A transparent, source-backed diagnostic that helps the visitor apply a framework.",
    defaultWhen: "The objective is evaluation, qualification, self-assessment, or applying a source framework.",
    primaryCompositionId: "data-story",
    supportingCompositionIds: ["interactive-paths"],
    sectionLabels: [
      "Framework or decision the source helps evaluate",
      "Source-backed dimensions",
      "Guided diagnostic questions",
      "Transparent result or maturity pattern",
      "Gaps, implications, and cited recommendations",
      "Suggested next actions with no invented certainty",
      "Save the result or apply it in a working session"
    ],
    navigationLabels: contentNavigation,
    ctaRule: "Offer a saved result or a working session that applies the cited framework.",
    contentPolicy: "source-preserving",
    compatibleAlternativeIds: ["content-guide", "content-research"]
  }
] as const satisfies readonly WireframeArchetypeMetadata[];

export const wireframeLibrary = [
  ...accountArchetypes,
  ...campaignArchetypes,
  ...contentArchetypes
] as const satisfies readonly WireframeArchetypeMetadata[];

const wireframeById = new Map<WireframeArchetypeId, WireframeArchetypeMetadata>(
  wireframeLibrary.map((wireframe) => [wireframe.id, wireframe])
);

export function getWireframeArchetype(id: WireframeArchetypeId): WireframeArchetypeMetadata {
  const wireframe = wireframeById.get(id);
  if (!wireframe) throw new Error(`Unknown wireframe archetype: ${id}`);
  return wireframe;
}

export function listWireframeArchetypes(family?: WireframeFamily): readonly WireframeArchetypeMetadata[] {
  return family ? wireframeLibrary.filter((wireframe) => wireframe.family === family) : wireframeLibrary;
}

export type WireframeBrandEvidenceStrength = "strong" | "moderate" | "weak" | "none";
export type WireframeAssetQuality = "high" | "medium" | "low" | "none";
export type WireframeContentDensity = "rich" | "moderate" | "sparse";
export type WireframeMessageStructure =
  | "single-idea"
  | "problem-solution"
  | "proof-led"
  | "multi-path"
  | "technical-sequence"
  | "chaptered";
export type WireframeProofAvailability = "strong" | "limited" | "none";
export type WireframeInteractionOpportunity = "rich" | "light" | "none";
export type WireframeSellerGeometry = "sparse-neutral" | "balanced-brand" | "branded-proof";
export type WireframeSellerDensity = "dense" | "balanced" | "sparse";
export type WireframeCampaignMotion = "demonstrative" | "guided" | "quiet";
export type WireframeDecisionComplexity = "high" | "medium" | "low";
export type WireframeSectionCount = 4 | 5 | 6 | 7 | 8;

export interface WireframeSelectionSignals {
  family: WireframeFamily;
  audience?: string;
  objective?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourceUrl?: string;
  sourceKind?: string;
  sourceTopics?: readonly string[];
  experiencePattern?: string;
  campaignType?: SessionAnswers["campaignType"];
  eventContext?: string;
  promotedOffer?: string;
  productDescription?: string;
  approvedQuantifiedProof?: boolean;
  approvedCustomerStory?: boolean;
  decisionRoleCount?: number;
  isSpecificUseCase?: boolean;
  isNurture?: boolean;
  /** Verified seller brand evidence strength; never invents missing brand facts. */
  brandEvidenceStrength?: WireframeBrandEvidenceStrength;
  /** Source-owned imagery / logo readiness used only as a soft ranking boost. */
  assetQuality?: WireframeAssetQuality;
  /** Approved source / offer text density; sparse content prefers simpler archetypes. */
  contentDensity?: WireframeContentDensity;
  /** Message organization inferred upstream or supplied by an internal reviewer. */
  messageStructure?: WireframeMessageStructure;
  proofAvailability?: WireframeProofAvailability;
  interactionOpportunity?: WireframeInteractionOpportunity;
  sellerGeometry?: WireframeSellerGeometry;
  sellerDensity?: WireframeSellerDensity;
  campaignMotion?: WireframeCampaignMotion;
  decisionComplexity?: WireframeDecisionComplexity;
  /** Internal planning constraint. The result remains bounded to four through eight sections. */
  sectionCount?: WireframeSectionCount;
  sellerLogoAvailable?: boolean;
}

export type WireframeRankingFactor =
  | "route"
  | "audience"
  | "offer"
  | "brandEvidence"
  | "assetQuality"
  | "proof"
  | "contentDensity"
  | "objective"
  | "messageStructure"
  | "contentVolume"
  | "proofAvailability"
  | "imageryAvailability"
  | "interactionOpportunity"
  | "sellerGeometry"
  | "sellerDensity"
  | "campaignMotion"
  | "decisionComplexity";

export interface WireframeRankingScore {
  archetypeId: WireframeArchetypeId;
  compositionId: CompositionId;
  score: number;
  factors: Partial<Record<WireframeRankingFactor, number>>;
  reasonCode: WireframeSelectionReasonCode;
  reason: string;
}

export interface WireframeSelectionOptions {
  requestedArchetypeId?: WireframeArchetypeId;
  selectedBy?: "system" | "visitor";
  locked?: boolean;
}

export type WireframeSectionRole =
  | "hero"
  | "context"
  | "mechanism"
  | "proof"
  | "pathways"
  | "agenda"
  | "chapter-navigation"
  | "decision-support"
  | "resources"
  | "seller-validation"
  | "next-action";

export type WireframeComponentSlot =
  | "headline-group"
  | "logo-lockup"
  | "image-hero"
  | "video-stage"
  | "proof-artifact"
  | "typographic-hero"
  | "diagram-hero"
  | "narrative-copy"
  | "fact-pair"
  | "metric-strip"
  | "proof-ledger"
  | "evidence-diagram"
  | "choice-cards"
  | "process-diagram"
  | "step-sequence"
  | "agenda-list"
  | "chapter-index"
  | "decision-matrix"
  | "resource-list"
  | "seller-facts"
  | "cta-panel";

export type WireframeAllowedInteraction =
  | "none"
  | "anchor-scroll"
  | "expand-details"
  | "select-path"
  | "focus-step"
  | "filter-findings"
  | "seek-chapter"
  | "play-source"
  | "open-source"
  | "primary-cta";

export type WireframeCompositionReasonCode =
  | "section-count-4-compact"
  | "section-count-5-focused"
  | "section-count-6-balanced"
  | "section-count-7-detailed"
  | "section-count-8-complex"
  | "message-single-idea"
  | "message-problem-solution"
  | "message-proof-led"
  | "message-multi-path"
  | "message-technical-sequence"
  | "message-chaptered"
  | "proof-strong"
  | "proof-limited"
  | "proof-none"
  | "imagery-available"
  | "imagery-fallback-type"
  | "imagery-fallback-diagram"
  | "seller-sparse-neutral"
  | "seller-balanced-brand"
  | "seller-branded-proof"
  | "motion-quiet"
  | "motion-guided"
  | "motion-demonstrative"
  | "decision-low"
  | "decision-medium"
  | "decision-high";

export interface WireframeSectionPlan {
  role: WireframeSectionRole;
  label: string;
  wordBudget: {
    min: number;
    max: number;
  };
  componentSlots: WireframeComponentSlot[];
  allowedInteractions: WireframeAllowedInteraction[];
}

export interface WireframeCompositionAlternative {
  archetypeId: WireframeArchetypeId;
  compositionId: CompositionId;
  score: number;
  sectionCount: WireframeSectionCount;
  reasonCodes: WireframeCompositionReasonCode[];
}

export interface WireframeCompositionPlanV1 {
  version: 1;
  archetypeId: WireframeArchetypeId;
  compositionId: CompositionId;
  sectionCount: WireframeSectionCount;
  sections: WireframeSectionPlan[];
  totalWordBudget: {
    min: number;
    max: number;
  };
  score: number;
  alternatives: WireframeCompositionAlternative[];
  reasonCodes: WireframeCompositionReasonCode[];
  /** Internal-only contract. This plan must not become a prospect-facing chooser. */
  visibility: "internal";
}

export interface WireframeSelectionV1 {
  version: 1;
  family: WireframeFamily;
  archetypeId: WireframeArchetypeId;
  compositionId: CompositionId;
  reasonCode: WireframeSelectionReasonCode;
  reason: string;
  alternativeIds: WireframeArchetypeId[];
  selectedBy: "system" | "visitor";
  locked: boolean;
  /** Internal explainability only; never shown as a prospect template picker. */
  ranking?: {
    selectedScore: number;
    candidates: WireframeRankingScore[];
  };
  compositionPlan: WireframeCompositionPlanV1;
}

interface SelectedArchetype {
  id: WireframeArchetypeId;
  reasonCode: WireframeSelectionReasonCode;
  reason: string;
}

function normalizedSignalText(signals: WireframeSelectionSignals): string {
  return [
    signals.audience,
    signals.objective,
    signals.sourceTitle,
    signals.sourceDescription,
    signals.sourceUrl,
    signals.sourceKind,
    ...(signals.sourceTopics ?? []),
    signals.experiencePattern,
    signals.eventContext,
    signals.promotedOffer,
    signals.productDescription
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function inferredDecisionRoleCount(audience = ""): number {
  const normalized = audience.trim();
  if (!normalized) return 0;
  const roles = normalized
    .split(/,|;|\band\b|&|\//i)
    .map((role) => role.trim())
    .filter((role) => role.length >= 3);
  return new Set(roles).size;
}

function selectAccountArchetype(signals: WireframeSelectionSignals, text: string): SelectedArchetype {
  const audience = (signals.audience ?? "").toLocaleLowerCase();
  const objective = (signals.objective ?? "").toLocaleLowerCase();
  if (/architect|architecture|security|cyber|data|infrastructure|\bit\b|technical|platform|engineering/.test(audience) ||
      /architect|technical|security|pilot|validation/.test(objective)) {
    return {
      id: "account-technical",
      reasonCode: "account-technical-audience",
      reason: "Using a technical evaluation layout because the audience or objective centers on technical validation."
    };
  }
  if (signals.approvedQuantifiedProof) {
    return {
      id: "account-proof",
      reasonCode: "account-approved-proof",
      reason: "Using a proof-led business case because approved quantified evidence is available."
    };
  }
  const roleCount = signals.decisionRoleCount ?? inferredDecisionRoleCount(signals.audience);
  if (roleCount >= 3 || /buying group|buying team|cross-functional|align(?:ment)?/.test(text)) {
    return {
      id: "account-team",
      reasonCode: "account-multi-role",
      reason: "Using a buying-team alignment layout because several roles need a shared path through the decision."
    };
  }
  if (/workshop|discover|discovery|innovation|emerging|hypothes|ideation/.test(objective)) {
    return {
      id: "account-workshop",
      reasonCode: "account-workshop-objective",
      reason: "Using an innovation workshop layout because the objective is exploratory rather than a fixed evaluation."
    };
  }
  return {
    id: "account-executive",
    reasonCode: "account-default",
    reason: "Using an executive account narrative because the opportunity is strategic and cross-functional."
  };
}

function selectCampaignArchetype(signals: WireframeSelectionSignals, text: string): SelectedArchetype {
  if (signals.campaignType === "event" || signals.eventContext || /webinar|conference|summit|event|register|registration|rsvp|attend/.test(text)) {
    return {
      id: "campaign-event",
      reasonCode: "campaign-event",
      reason: "Using an event layout because the brief includes event context or an attendance action."
    };
  }
  if (signals.approvedCustomerStory) {
    return {
      id: "campaign-proof",
      reasonCode: "campaign-customer-proof",
      reason: "Using a customer proof layout because an approved customer story is the primary evidence."
    };
  }
  if (signals.isNurture || /follow[- ]?up|nurture|post[- ]?(?:launch|event)|keep engaging|continued engagement/.test(text)) {
    return {
      id: "campaign-nurture",
      reasonCode: "campaign-nurture",
      reason: "Using a follow-up journey because the goal is continued engagement after a launch or event."
    };
  }
  if (signals.isSpecificUseCase || /use case|workflow|process|buyer job|operational outcome/.test(text)) {
    return {
      id: "campaign-use-case",
      reasonCode: "campaign-use-case",
      reason: "Using a use-case campaign because the brief names a specific workflow or buyer job."
    };
  }
  if (signals.campaignType === "product" || signals.promotedOffer || signals.productDescription || signals.sourceUrl || /product brief|product page|introduce a product|launch a product/.test(text)) {
    return {
      id: "campaign-product",
      reasonCode: "campaign-product-source",
      reason: "Using a product introduction because the brief includes a product source or product description."
    };
  }
  return {
    id: "campaign-demand",
    reasonCode: "campaign-default",
    reason: "Using a demand and category education layout because the offer is broader than one product."
  };
}

function selectContentArchetype(signals: WireframeSelectionSignals, text: string): SelectedArchetype {
  if (/webinar|video|recording|transcript|speaker|episode|podcast/.test(text)) {
    return {
      id: "content-webinar",
      reasonCode: "content-video",
      reason: "Using a webinar and video companion because the source is time-based or transcript-led."
    };
  }
  if (signals.experiencePattern === "assessment" || /assessment|scorecard|self[- ]?assess|qualification|diagnostic|maturity/.test(text)) {
    return {
      id: "content-assessment",
      reasonCode: "content-assessment",
      reason: "Using an assessment workbench because the source provides a framework the visitor can apply."
    };
  }
  if (/benchmark|survey|primary research|research report|study|dataset|data[- ]heavy|methodology|statistic/.test(text)) {
    return {
      id: "content-research",
      reasonCode: "content-research",
      reason: "Using a research explorer because cited findings and data are the source's primary value."
    };
  }
  if (/architecture|technical|implementation|reference guide|product brief|developer|api|configuration|deployment/.test(text)) {
    return {
      id: "content-technical",
      reasonCode: "content-technical",
      reason: "Using a technical walkthrough because the source describes architecture, implementation, or validation."
    };
  }
  if (/playbook|guide|checklist|framework|how[- ]?to|best practice|step[- ]by[- ]step/.test(text)) {
    return {
      id: "content-guide",
      reasonCode: "content-guide",
      reason: "Using a playbook and guide layout because the source teaches a process or framework."
    };
  }
  return {
    id: "content-report",
    reasonCode: "content-default",
    reason: "Using an executive report layout because it preserves the source argument without imposing a campaign structure."
  };
}

interface ResolvedCompositionSignals {
  messageStructure: WireframeMessageStructure;
  proofAvailability: WireframeProofAvailability;
  interactionOpportunity: WireframeInteractionOpportunity;
  sellerGeometry: WireframeSellerGeometry;
  sellerDensity: WireframeSellerDensity;
  campaignMotion: WireframeCampaignMotion;
  decisionComplexity: WireframeDecisionComplexity;
  sectionCount: WireframeSectionCount;
  hasImagery: boolean;
  hasLogo: boolean;
}

const compositionMotion: Record<CompositionId, WireframeCampaignMotion> = {
  "editorial-split": "quiet",
  "evidence-lead": "guided",
  "interactive-paths": "guided",
  "workflow-spine": "guided",
  "data-story": "quiet",
  "chapter-journey": "demonstrative"
};

function resolveMessageStructure(
  signals: WireframeSelectionSignals,
  text: string
): WireframeMessageStructure {
  if (signals.messageStructure) return signals.messageStructure;
  if (
    signals.campaignType === "event" ||
    /webinar|video|recording|conference|summit|agenda|chapter/.test(text)
  ) {
    return "chaptered";
  }
  if (
    signals.approvedQuantifiedProof ||
    signals.approvedCustomerStory ||
    /customer proof|case stud|benchmark|research|measurable outcome/.test(text)
  ) {
    return "proof-led";
  }
  if (
    signals.isSpecificUseCase ||
    /technical|architecture|implementation|workflow|validation|process/.test(text)
  ) {
    return "technical-sequence";
  }
  const roleCount = signals.decisionRoleCount ?? inferredDecisionRoleCount(signals.audience);
  if (roleCount >= 3 || /choose|role|path|buying team|cross-functional/.test(text)) {
    return "multi-path";
  }
  if (signals.contentDensity === "sparse") return "single-idea";
  return "problem-solution";
}

function resolveDecisionComplexity(
  signals: WireframeSelectionSignals,
  messageStructure: WireframeMessageStructure
): WireframeDecisionComplexity {
  if (signals.decisionComplexity) return signals.decisionComplexity;
  const roleCount = signals.decisionRoleCount ?? inferredDecisionRoleCount(signals.audience);
  if (
    roleCount >= 4 ||
    messageStructure === "technical-sequence" ||
    signals.experiencePattern === "assessment"
  ) {
    return "high";
  }
  if (roleCount >= 2 || messageStructure === "multi-path" || messageStructure === "proof-led") {
    return "medium";
  }
  return "low";
}

function resolveCompositionSignals(
  signals: WireframeSelectionSignals
): ResolvedCompositionSignals {
  const text = normalizedSignalText(signals);
  const messageStructure = resolveMessageStructure(signals, text);
  const proofAvailability =
    signals.proofAvailability ??
    (signals.approvedQuantifiedProof || signals.approvedCustomerStory
      ? "strong"
      : /evidence|proof|research|benchmark|source|citation|customer/.test(text)
        ? "limited"
        : "none");
  const decisionComplexity = resolveDecisionComplexity(signals, messageStructure);
  const interactionOpportunity =
    signals.interactionOpportunity ??
    (messageStructure === "multi-path" || signals.experiencePattern === "assessment"
      ? "rich"
      : messageStructure === "chaptered" || decisionComplexity === "medium"
        ? "light"
        : "none");
  const sellerGeometry =
    signals.sellerGeometry ??
    (signals.brandEvidenceStrength === "strong" && proofAvailability === "strong"
      ? "branded-proof"
      : signals.contentDensity === "sparse" &&
          (!signals.brandEvidenceStrength ||
            signals.brandEvidenceStrength === "none" ||
            signals.brandEvidenceStrength === "weak")
        ? "sparse-neutral"
        : "balanced-brand");
  const sellerDensity =
    signals.sellerDensity ??
    (signals.contentDensity === "rich"
      ? "dense"
      : signals.contentDensity === "sparse"
        ? "sparse"
        : "balanced");
  const campaignMotion =
    signals.campaignMotion ??
    (messageStructure === "chaptered"
      ? "demonstrative"
      : interactionOpportunity === "rich" || messageStructure === "technical-sequence"
        ? "guided"
        : "quiet");
  const sectionCount =
    signals.sectionCount ??
    (signals.contentDensity === "sparse" &&
    decisionComplexity === "low" &&
    messageStructure !== "chaptered"
      ? 4
      : decisionComplexity === "high" &&
          (signals.contentDensity === "rich" || sellerDensity === "dense")
        ? 8
        : 6);

  return {
    messageStructure,
    proofAvailability,
    interactionOpportunity,
    sellerGeometry,
    sellerDensity,
    campaignMotion,
    decisionComplexity,
    sectionCount,
    hasImagery: signals.assetQuality !== undefined && signals.assetQuality !== "none",
    hasLogo: signals.sellerLogoAvailable ?? signals.brandEvidenceStrength === "strong"
  };
}

function compositionFitFactors(
  compositionId: CompositionId,
  signals: WireframeSelectionSignals
): Pick<
  Record<WireframeRankingFactor, number>,
  | "messageStructure"
  | "contentVolume"
  | "proofAvailability"
  | "imageryAvailability"
  | "interactionOpportunity"
  | "sellerGeometry"
  | "sellerDensity"
  | "campaignMotion"
  | "decisionComplexity"
> {
  const resolved = resolveCompositionSignals(signals);
  const messageMatches: Record<WireframeMessageStructure, readonly CompositionId[]> = {
    "single-idea": ["editorial-split"],
    "problem-solution": ["editorial-split", "workflow-spine"],
    "proof-led": ["evidence-lead", "data-story"],
    "multi-path": ["interactive-paths", "data-story"],
    "technical-sequence": ["workflow-spine"],
    chaptered: ["chapter-journey"]
  };
  const volumeMatches =
    resolved.sectionCount <= 5
      ? (["editorial-split", "evidence-lead"] as const)
      : resolved.sectionCount >= 7
        ? (["workflow-spine", "interactive-paths", "data-story", "chapter-journey"] as const)
        : compositionIds;
  const proofScore =
    resolved.proofAvailability === "strong"
      ? compositionId === "evidence-lead" || compositionId === "data-story"
        ? 10
        : 4
      : resolved.proofAvailability === "limited"
        ? compositionId === "evidence-lead" || compositionId === "data-story"
          ? 5
          : 3
        : compositionId === "evidence-lead" || compositionId === "data-story"
          ? -6
          : 4;
  const imageryScore = resolved.hasImagery
    ? compositionId === "editorial-split" ||
      compositionId === "evidence-lead" ||
      compositionId === "chapter-journey"
      ? 6
      : 3
    : compositionId === "workflow-spine" || compositionId === "data-story"
      ? 6
      : compositionId === "editorial-split"
        ? 5
        : compositionId === "chapter-journey"
          ? -3
          : 2;
  const interactionScore =
    resolved.interactionOpportunity === "rich"
      ? compositionId === "interactive-paths" ||
        compositionId === "data-story" ||
        compositionId === "chapter-journey"
        ? 8
        : 2
      : resolved.interactionOpportunity === "light"
        ? compositionId === "interactive-paths" ||
          compositionId === "workflow-spine" ||
          compositionId === "chapter-journey"
          ? 5
          : 3
        : compositionId === "editorial-split" || compositionId === "evidence-lead"
          ? 5
          : 0;
  const geometryScore =
    resolved.sellerGeometry === "sparse-neutral"
      ? compositionId === "editorial-split"
        ? 8
        : 1
      : resolved.sellerGeometry === "branded-proof"
        ? compositionId === "evidence-lead"
          ? 8
          : compositionId === "editorial-split"
            ? 5
            : 2
        : 4;
  const densityScore =
    resolved.sellerDensity === "sparse"
      ? compositionId === "editorial-split"
        ? 7
        : 1
      : resolved.sellerDensity === "dense"
        ? compositionId === "workflow-spine" ||
          compositionId === "interactive-paths" ||
          compositionId === "data-story"
          ? 7
          : 2
        : 4;
  const decisionScore =
    resolved.decisionComplexity === "high"
      ? compositionId === "workflow-spine" ||
        compositionId === "interactive-paths" ||
        compositionId === "data-story"
        ? 8
        : 1
      : resolved.decisionComplexity === "medium"
        ? compositionId === "evidence-lead" ||
          compositionId === "interactive-paths" ||
          compositionId === "workflow-spine"
          ? 5
          : 3
        : compositionId === "editorial-split" || compositionId === "evidence-lead"
          ? 5
          : 1;

  return {
    messageStructure: messageMatches[resolved.messageStructure].includes(compositionId) ? 10 : -2,
    contentVolume: (volumeMatches as readonly CompositionId[]).includes(compositionId) ? 8 : -2,
    proofAvailability: proofScore,
    imageryAvailability: imageryScore,
    interactionOpportunity: interactionScore,
    sellerGeometry: geometryScore,
    sellerDensity: densityScore,
    campaignMotion: compositionMotion[compositionId] === resolved.campaignMotion ? 6 : 0,
    decisionComplexity: decisionScore
  };
}

function softSignalBoosts(signals: WireframeSelectionSignals, archetypeId: WireframeArchetypeId): Partial<Record<WireframeRankingFactor, number>> {
  const metadata = getWireframeArchetype(archetypeId);
  const brand = signals.brandEvidenceStrength ?? "none";
  const assets = signals.assetQuality ?? "none";
  const density = signals.contentDensity ?? "moderate";
  const factors: Partial<Record<WireframeRankingFactor, number>> = {};

  const brandBoost =
    brand === "strong" ? 8 : brand === "moderate" ? 4 : brand === "weak" ? 1 : 0;
  if (brandBoost && (metadata.primaryCompositionId === "editorial-split" || metadata.primaryCompositionId === "evidence-lead")) {
    factors.brandEvidence = brandBoost;
  } else if (brandBoost) {
    factors.brandEvidence = Math.max(1, Math.floor(brandBoost / 2));
  }

  const assetBoost = assets === "high" ? 7 : assets === "medium" ? 3 : assets === "low" ? 1 : 0;
  if (assetBoost && (metadata.primaryCompositionId === "evidence-lead" || metadata.primaryCompositionId === "editorial-split")) {
    factors.assetQuality = assetBoost;
  } else if (assetBoost && metadata.primaryCompositionId === "data-story") {
    factors.assetQuality = Math.max(1, Math.floor(assetBoost / 2));
  }

  if (density === "rich") {
    factors.contentDensity =
      metadata.primaryCompositionId === "chapter-journey" ||
      metadata.primaryCompositionId === "data-story" ||
      metadata.primaryCompositionId === "workflow-spine"
        ? 6
        : 2;
  } else if (density === "sparse") {
    factors.contentDensity =
      metadata.primaryCompositionId === "editorial-split" || metadata.primaryCompositionId === "interactive-paths"
        ? 5
        : -4;
  } else {
    factors.contentDensity = 1;
  }

  return factors;
}

function scoreArchetypeAgainstRule(
  archetypeId: WireframeArchetypeId,
  rule: SelectedArchetype,
  signals: WireframeSelectionSignals
): WireframeRankingScore {
  const metadata = getWireframeArchetype(archetypeId);
  const factors: Partial<Record<WireframeRankingFactor, number>> = {
    route: 100
  };

  if (archetypeId === rule.id) {
    factors.audience = 40;
    factors.offer = 30;
    factors.objective = 30;
    factors.proof = signals.approvedQuantifiedProof || signals.approvedCustomerStory ? 20 : 10;
  } else {
    // Compatible alternatives stay eligible but cannot outrank the documented rule winner
    // unless soft signals are extreme — keep deterministic priority intact.
    const ruleAlternatives = getWireframeArchetype(rule.id).compatibleAlternativeIds;
    const alternativeIndex = ruleAlternatives.indexOf(archetypeId);
    factors.audience = alternativeIndex >= 0 ? 12 - alternativeIndex * 2 : 4;
    factors.offer = 4;
    factors.objective = 4;
    factors.proof = signals.approvedQuantifiedProof || signals.approvedCustomerStory ? 6 : 2;
  }

  const soft = softSignalBoosts(signals, archetypeId);
  for (const [key, value] of Object.entries(soft) as Array<[WireframeRankingFactor, number]>) {
    factors[key] = (factors[key] ?? 0) + value;
  }
  const compositionFit = compositionFitFactors(metadata.primaryCompositionId, signals);
  for (const [key, value] of Object.entries(compositionFit) as Array<
    [WireframeRankingFactor, number]
  >) {
    factors[key] = (factors[key] ?? 0) + value;
  }

  const score = Object.values(factors).reduce((sum, value) => sum + (value ?? 0), 0);
  return {
    archetypeId,
    compositionId: metadata.primaryCompositionId,
    score,
    factors,
    reasonCode: archetypeId === rule.id ? rule.reasonCode : rule.reasonCode,
    reason: archetypeId === rule.id
      ? rule.reason
      : `Compatible alternative to ${rule.id} with score ${score}.`
  };
}

/**
 * Rank reviewed compositions inside one route family. Prospects never see this
 * catalog; the highest explainable score becomes the locked system selection.
 */
export function rankWireframeCandidates(signals: WireframeSelectionSignals): WireframeRankingScore[] {
  const text = normalizedSignalText(signals);
  const rule =
    signals.family === "account"
      ? selectAccountArchetype(signals, text)
      : signals.family === "campaign"
        ? selectCampaignArchetype(signals, text)
        : selectContentArchetype(signals, text);

  return listWireframeArchetypes(signals.family)
    .map((wireframe) => scoreArchetypeAgainstRule(wireframe.id, rule, signals))
    .sort((left, right) => right.score - left.score || left.archetypeId.localeCompare(right.archetypeId));
}

const compositionSectionRoles: Record<
  CompositionId,
  readonly [
    WireframeSectionRole,
    WireframeSectionRole,
    WireframeSectionRole,
    WireframeSectionRole,
    WireframeSectionRole,
    WireframeSectionRole,
    WireframeSectionRole,
    "next-action"
  ]
> = {
  "editorial-split": [
    "hero",
    "context",
    "mechanism",
    "proof",
    "pathways",
    "decision-support",
    "seller-validation",
    "next-action"
  ],
  "evidence-lead": [
    "hero",
    "proof",
    "context",
    "mechanism",
    "decision-support",
    "resources",
    "seller-validation",
    "next-action"
  ],
  "interactive-paths": [
    "hero",
    "pathways",
    "context",
    "mechanism",
    "proof",
    "decision-support",
    "resources",
    "next-action"
  ],
  "workflow-spine": [
    "hero",
    "mechanism",
    "context",
    "proof",
    "decision-support",
    "pathways",
    "resources",
    "next-action"
  ],
  "data-story": [
    "hero",
    "proof",
    "context",
    "pathways",
    "mechanism",
    "decision-support",
    "resources",
    "next-action"
  ],
  "chapter-journey": [
    "hero",
    "agenda",
    "chapter-navigation",
    "context",
    "proof",
    "decision-support",
    "resources",
    "next-action"
  ]
};

const sectionRoleLabels: Record<WireframeSectionRole, string> = {
  hero: "Opening promise",
  context: "Recognizable context",
  mechanism: "How the outcome is created",
  proof: "Evidence and validation",
  pathways: "Ways to explore",
  agenda: "Agenda and takeaways",
  "chapter-navigation": "Chapters and moments",
  "decision-support": "Decision support",
  resources: "Supporting resources",
  "seller-validation": "Seller credibility",
  "next-action": "Next useful action"
};

const sectionWordBudgets: Record<
  WireframeSectionRole,
  { min: number; max: number }
> = {
  hero: { min: 35, max: 75 },
  context: { min: 55, max: 115 },
  mechanism: { min: 65, max: 140 },
  proof: { min: 45, max: 110 },
  pathways: { min: 45, max: 105 },
  agenda: { min: 40, max: 95 },
  "chapter-navigation": { min: 35, max: 85 },
  "decision-support": { min: 55, max: 125 },
  resources: { min: 30, max: 80 },
  "seller-validation": { min: 30, max: 70 },
  "next-action": { min: 25, max: 55 }
};

function sectionRolesFor(
  compositionId: CompositionId,
  count: WireframeSectionCount
): WireframeSectionRole[] {
  const sequence = compositionSectionRoles[compositionId];
  return [...sequence.slice(0, count - 1), "next-action"];
}

function heroMediaSlot(
  compositionId: CompositionId,
  resolved: ResolvedCompositionSignals
): WireframeComponentSlot {
  if (!resolved.hasImagery) {
    return compositionId === "workflow-spine" || compositionId === "data-story"
      ? "diagram-hero"
      : "typographic-hero";
  }
  if (compositionId === "chapter-journey") return "video-stage";
  if (compositionId === "evidence-lead") return "proof-artifact";
  return "image-hero";
}

function componentSlotsFor(
  role: WireframeSectionRole,
  compositionId: CompositionId,
  resolved: ResolvedCompositionSignals
): WireframeComponentSlot[] {
  if (role === "hero") {
    return [
      "headline-group",
      ...(resolved.hasLogo ? (["logo-lockup"] as const) : []),
      heroMediaSlot(compositionId, resolved)
    ];
  }
  if (role === "context") return ["narrative-copy"];
  if (role === "mechanism") {
    return compositionId === "workflow-spine"
      ? ["step-sequence", "process-diagram"]
      : ["process-diagram"];
  }
  if (role === "proof") {
    if (resolved.proofAvailability === "strong") {
      return resolved.hasImagery
        ? ["fact-pair", "proof-artifact"]
        : ["fact-pair", "evidence-diagram"];
    }
    return ["proof-ledger", "evidence-diagram"];
  }
  if (role === "pathways") return ["choice-cards"];
  if (role === "agenda") return ["agenda-list"];
  if (role === "chapter-navigation") return ["chapter-index"];
  if (role === "decision-support") return ["decision-matrix"];
  if (role === "resources") return ["resource-list"];
  if (role === "seller-validation") return ["seller-facts"];
  return ["cta-panel"];
}

function allowedInteractionsFor(
  role: WireframeSectionRole,
  compositionId: CompositionId,
  resolved: ResolvedCompositionSignals
): WireframeAllowedInteraction[] {
  if (role === "next-action") return ["primary-cta"];
  if (role === "hero") {
    return compositionId === "chapter-journey" && resolved.hasImagery
      ? ["play-source", "anchor-scroll"]
      : ["anchor-scroll"];
  }
  if (role === "proof") {
    return resolved.interactionOpportunity === "none"
      ? ["open-source"]
      : ["expand-details", "open-source"];
  }
  if (role === "pathways") {
    return resolved.interactionOpportunity === "none" ? ["none"] : ["select-path"];
  }
  if (role === "mechanism") {
    return resolved.interactionOpportunity === "rich" ? ["focus-step"] : ["none"];
  }
  if (role === "chapter-navigation") {
    return resolved.hasImagery ? ["seek-chapter"] : ["anchor-scroll"];
  }
  if (role === "resources") return ["open-source"];
  if (role === "decision-support" && resolved.interactionOpportunity === "rich") {
    return ["filter-findings"];
  }
  return ["none"];
}

function compositionReasonCodes(
  resolved: ResolvedCompositionSignals,
  compositionId: CompositionId
): WireframeCompositionReasonCode[] {
  const countReason: Record<WireframeSectionCount, WireframeCompositionReasonCode> = {
    4: "section-count-4-compact",
    5: "section-count-5-focused",
    6: "section-count-6-balanced",
    7: "section-count-7-detailed",
    8: "section-count-8-complex"
  };
  const messageReason: Record<
    WireframeMessageStructure,
    WireframeCompositionReasonCode
  > = {
    "single-idea": "message-single-idea",
    "problem-solution": "message-problem-solution",
    "proof-led": "message-proof-led",
    "multi-path": "message-multi-path",
    "technical-sequence": "message-technical-sequence",
    chaptered: "message-chaptered"
  };
  const proofReason: Record<
    WireframeProofAvailability,
    WireframeCompositionReasonCode
  > = {
    strong: "proof-strong",
    limited: "proof-limited",
    none: "proof-none"
  };
  const sellerReason: Record<
    WireframeSellerGeometry,
    WireframeCompositionReasonCode
  > = {
    "sparse-neutral": "seller-sparse-neutral",
    "balanced-brand": "seller-balanced-brand",
    "branded-proof": "seller-branded-proof"
  };
  const motionReason: Record<
    WireframeCampaignMotion,
    WireframeCompositionReasonCode
  > = {
    quiet: "motion-quiet",
    guided: "motion-guided",
    demonstrative: "motion-demonstrative"
  };
  const decisionReason: Record<
    WireframeDecisionComplexity,
    WireframeCompositionReasonCode
  > = {
    low: "decision-low",
    medium: "decision-medium",
    high: "decision-high"
  };
  const imageryReason: WireframeCompositionReasonCode = resolved.hasImagery
    ? "imagery-available"
    : compositionId === "workflow-spine" || compositionId === "data-story"
      ? "imagery-fallback-diagram"
      : "imagery-fallback-type";

  return [
    countReason[resolved.sectionCount],
    messageReason[resolved.messageStructure],
    proofReason[resolved.proofAvailability],
    imageryReason,
    sellerReason[resolved.sellerGeometry],
    motionReason[resolved.campaignMotion],
    decisionReason[resolved.decisionComplexity]
  ];
}

function compositionPlanFromRanking(
  signals: WireframeSelectionSignals,
  archetypeId: WireframeArchetypeId,
  ranked: readonly WireframeRankingScore[]
): WireframeCompositionPlanV1 {
  const metadata = getWireframeArchetype(archetypeId);
  if (metadata.family !== signals.family) {
    throw new Error(
      `Wireframe ${metadata.id} belongs to ${metadata.family}, not ${signals.family}`
    );
  }
  const resolved = resolveCompositionSignals(signals);
  const roles = sectionRolesFor(metadata.primaryCompositionId, resolved.sectionCount);
  const labels = [
    ...metadata.sectionLabels.slice(0, Math.min(roles.length - 1, 6)),
    ...(roles.length === 8 ? [sectionRoleLabels[roles[6]!]] : []),
    metadata.sectionLabels[6]
  ];
  const densityMultiplier =
    resolved.sellerDensity === "dense"
      ? 1.15
      : resolved.sellerDensity === "sparse"
        ? 0.8
        : 1;
  const sections = roles.map((role, index): WireframeSectionPlan => {
    const baseBudget = sectionWordBudgets[role];
    return {
      role,
      label: labels[index] ?? sectionRoleLabels[role],
      wordBudget: {
        min: Math.round(baseBudget.min * densityMultiplier),
        max: Math.round(baseBudget.max * densityMultiplier)
      },
      componentSlots: componentSlotsFor(role, metadata.primaryCompositionId, resolved),
      allowedInteractions: allowedInteractionsFor(
        role,
        metadata.primaryCompositionId,
        resolved
      )
    };
  });
  const selectedScore =
    ranked.find((candidate) => candidate.archetypeId === archetypeId)?.score ?? 0;
  const alternativeIdSet = new Set(metadata.compatibleAlternativeIds);
  const alternatives = ranked
    .filter((candidate) => alternativeIdSet.has(candidate.archetypeId))
    .slice(0, 2)
    .map((candidate): WireframeCompositionAlternative => ({
      archetypeId: candidate.archetypeId,
      compositionId: candidate.compositionId,
      score: candidate.score,
      sectionCount: resolved.sectionCount,
      reasonCodes: compositionReasonCodes(resolved, candidate.compositionId)
    }));

  return {
    version: 1,
    archetypeId,
    compositionId: metadata.primaryCompositionId,
    sectionCount: resolved.sectionCount,
    sections,
    totalWordBudget: sections.reduce(
      (total, section) => ({
        min: total.min + section.wordBudget.min,
        max: total.max + section.wordBudget.max
      }),
      { min: 0, max: 0 }
    ),
    score: selectedScore,
    alternatives,
    reasonCodes: compositionReasonCodes(resolved, metadata.primaryCompositionId),
    visibility: "internal"
  };
}

/**
 * Builds the internal, deterministic section plan for the highest-ranked
 * reviewed archetype, or for an explicitly supplied compatible archetype.
 */
export function buildWireframeCompositionPlan(
  signals: WireframeSelectionSignals,
  archetypeId?: WireframeArchetypeId
): WireframeCompositionPlanV1 {
  const ranked = rankWireframeCandidates(signals);
  return compositionPlanFromRanking(
    signals,
    archetypeId ?? ranked[0]!.archetypeId,
    ranked
  );
}

function alternativesFor(id: WireframeArchetypeId): WireframeArchetypeId[] {
  const wireframe = getWireframeArchetype(id);
  return wireframe.compatibleAlternativeIds
    .filter((alternativeId) => getWireframeArchetype(alternativeId).family === wireframe.family)
    .slice(0, 2);
}

export function selectWireframe(
  signals: WireframeSelectionSignals,
  options: WireframeSelectionOptions = {}
): WireframeSelectionV1 {
  const requested = options.requestedArchetypeId
    ? getWireframeArchetype(options.requestedArchetypeId)
    : null;
  if (requested && requested.family !== signals.family) {
    throw new Error(
      `Wireframe ${requested.id} belongs to ${requested.family}, not ${signals.family}`
    );
  }

  const ranked = rankWireframeCandidates(signals);
  const selected = requested
    ? {
        id: requested.id,
        reasonCode: "visitor-selected" as const,
        reason: `Using ${requested.label.toLocaleLowerCase()} because the visitor selected this compatible layout.`,
        score: ranked.find((item) => item.archetypeId === requested.id)?.score ?? 0
      }
    : {
        id: ranked[0]!.archetypeId,
        reasonCode: ranked[0]!.reasonCode,
        reason: ranked[0]!.reason,
        score: ranked[0]!.score
      };
  const metadata = getWireframeArchetype(selected.id);

  return {
    version: 1,
    family: signals.family,
    archetypeId: selected.id,
    compositionId: metadata.primaryCompositionId,
    reasonCode: selected.reasonCode,
    reason: selected.reason,
    alternativeIds: alternativesFor(selected.id),
    selectedBy: requested ? "visitor" : options.selectedBy ?? "system",
    locked: options.locked ?? false,
    ranking: {
      selectedScore: selected.score,
      candidates: ranked
    },
    compositionPlan: compositionPlanFromRanking(signals, selected.id, ranked)
  };
}

export type WireframeSelectionHints = Pick<
  WireframeSelectionSignals,
  | "approvedQuantifiedProof"
  | "approvedCustomerStory"
  | "decisionRoleCount"
  | "isSpecificUseCase"
  | "isNurture"
  | "productDescription"
  | "brandEvidenceStrength"
  | "assetQuality"
  | "contentDensity"
  | "messageStructure"
  | "proofAvailability"
  | "interactionOpportunity"
  | "sellerGeometry"
  | "sellerDensity"
  | "campaignMotion"
  | "decisionComplexity"
  | "sectionCount"
  | "sellerLogoAvailable"
>;

function familyForUseCase(useCase: UseCase): WireframeFamily {
  return useCase === "abm" ? "account" : useCase;
}

function inferredBrandEvidenceStrength(
  context: CampaignGenerationContext
): WireframeBrandEvidenceStrength {
  const colors = [
    context.designContext.colorSystem.primary,
    context.designContext.colorSystem.accent,
    context.designContext.colorSystem.surface
  ].filter(Boolean).length;
  const typography = Boolean(
    context.designContext.typography.display || context.designContext.typography.body
  );
  if (colors >= 3 && typography && context.designContext.imagery.sourceOwnedImageCount >= 2) {
    return "strong";
  }
  if (colors >= 2 || context.designContext.imagery.sourceOwnedImageCount >= 1) return "moderate";
  if (colors >= 1) return "weak";
  return "none";
}

function inferredAssetQuality(context: CampaignGenerationContext): WireframeAssetQuality {
  const count = context.designContext.imagery.sourceOwnedImageCount;
  if (count >= 3) return "high";
  if (count === 2) return "medium";
  if (count === 1) return "low";
  return "none";
}

function inferredContentDensity(context: CampaignGenerationContext): WireframeContentDensity {
  const topics = context.brief.sourceGrounding.topics.length;
  const hasSourceBody = Boolean(
    context.brief.sourceTitle || context.brief.messageSpine.recognizableContext
  );
  if (topics >= 3 || (hasSourceBody && topics >= 2)) return "rich";
  if (!hasSourceBody && topics === 0) return "sparse";
  return "moderate";
}

export function selectWireframeForCampaignContext(input: {
  useCase: UseCase;
  answers: SessionAnswers;
  context: CampaignGenerationContext;
  hints?: WireframeSelectionHints;
  options?: WireframeSelectionOptions;
}): WireframeSelectionV1 {
  const { useCase, answers, context, hints = {}, options } = input;
  return selectWireframe(
    {
      family: familyForUseCase(useCase),
      audience: context.brief.audience,
      objective: context.brief.campaignGoal,
      sourceTitle: context.brief.sourceTitle ?? undefined,
      sourceDescription: context.brief.messageSpine.recognizableContext,
      sourceUrl: context.brief.sourceGrounding.sourceUrl,
      sourceKind: context.brief.sourceGrounding.kind,
      sourceTopics: context.brief.sourceGrounding.topics,
      campaignType: context.brief.campaignSubtype ?? answers.campaignType,
      eventContext: context.brief.eventContext ?? undefined,
      promotedOffer: answers.promotedOffer,
      productDescription: hints.productDescription ?? answers.messageBelief,
      approvedQuantifiedProof: hints.approvedQuantifiedProof,
      approvedCustomerStory: hints.approvedCustomerStory,
      decisionRoleCount: hints.decisionRoleCount,
      isSpecificUseCase: hints.isSpecificUseCase,
      isNurture: hints.isNurture,
      brandEvidenceStrength: hints.brandEvidenceStrength ?? inferredBrandEvidenceStrength(context),
      assetQuality: hints.assetQuality ?? inferredAssetQuality(context),
      contentDensity: hints.contentDensity ?? inferredContentDensity(context),
      messageStructure: hints.messageStructure,
      proofAvailability: hints.proofAvailability,
      interactionOpportunity: hints.interactionOpportunity,
      sellerGeometry: hints.sellerGeometry,
      sellerDensity: hints.sellerDensity,
      campaignMotion: hints.campaignMotion,
      decisionComplexity: hints.decisionComplexity,
      sectionCount: hints.sectionCount,
      sellerLogoAvailable: hints.sellerLogoAvailable
    },
    options
  );
}

export function selectWireframeForExperienceSpec(input: {
  useCase: UseCase;
  spec: ExperienceSpecV1;
  answers?: SessionAnswers;
  hints?: WireframeSelectionHints;
  options?: WireframeSelectionOptions;
}): WireframeSelectionV1 {
  const { useCase, spec, answers = {}, hints = {}, options } = input;
  const sourceIntelligence = spec.sourceIntelligence;
  return selectWireframe(
    {
      family: familyForUseCase(useCase),
      audience: answers.customAudience ?? answers.audience,
      objective: answers.objective,
      sourceTitle: sourceIntelligence?.title ?? spec.grounding.source?.title,
      sourceDescription: sourceIntelligence?.premise,
      sourceKind: spec.grounding.source?.kind,
      experiencePattern: sourceIntelligence?.experiencePattern,
      campaignType: answers.campaignType,
      eventContext: answers.eventSource,
      promotedOffer: answers.promotedOffer ?? spec.identities.offer?.name,
      productDescription: hints.productDescription ?? answers.messageBelief,
      approvedQuantifiedProof: hints.approvedQuantifiedProof,
      approvedCustomerStory: hints.approvedCustomerStory,
      decisionRoleCount: hints.decisionRoleCount,
      isSpecificUseCase: hints.isSpecificUseCase,
      isNurture: hints.isNurture,
      brandEvidenceStrength: hints.brandEvidenceStrength,
      assetQuality: hints.assetQuality,
      contentDensity: hints.contentDensity,
      messageStructure: hints.messageStructure,
      proofAvailability: hints.proofAvailability,
      interactionOpportunity: hints.interactionOpportunity,
      sellerGeometry: hints.sellerGeometry,
      sellerDensity: hints.sellerDensity,
      campaignMotion: hints.campaignMotion,
      decisionComplexity: hints.decisionComplexity,
      sectionCount: hints.sectionCount,
      sellerLogoAvailable: hints.sellerLogoAvailable
    },
    options
  );
}

export const legacyWireframeNames = [
  "canonical-desktop-experience",
  "abm-account-microsite",
  "demand-generation-landing-page",
  "product-launch-landing-page",
  "event-awareness-follow-up",
  "content-resource-companion",
  "content-assessment-workbench"
] as const;

export type LegacyWireframeName = (typeof legacyWireframeNames)[number];

const legacyWireframeCompatibility: Record<
  Exclude<LegacyWireframeName, "canonical-desktop-experience">,
  WireframeArchetypeId
> = {
  "abm-account-microsite": "account-executive",
  "demand-generation-landing-page": "campaign-demand",
  "product-launch-landing-page": "campaign-product",
  "event-awareness-follow-up": "campaign-event",
  "content-resource-companion": "content-report",
  "content-assessment-workbench": "content-assessment"
};

const canonicalDefaultByFamily: Record<WireframeFamily, WireframeArchetypeId> = {
  account: "account-executive",
  campaign: "campaign-demand",
  content: "content-report"
};

export function archetypeForLegacyWireframe(
  legacyName: LegacyWireframeName,
  family?: WireframeFamily
): WireframeArchetypeId | null {
  if (legacyName === "canonical-desktop-experience") {
    return family ? canonicalDefaultByFamily[family] : null;
  }
  const compatibleArchetype = legacyWireframeCompatibility[legacyName];
  if (
    family &&
    getWireframeArchetype(compatibleArchetype).family !== family
  ) {
    return canonicalDefaultByFamily[family];
  }
  return compatibleArchetype;
}
