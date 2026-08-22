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
}

export type WireframeRankingFactor =
  | "route"
  | "audience"
  | "offer"
  | "brandEvidence"
  | "assetQuality"
  | "proof"
  | "contentDensity"
  | "objective";

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
    }
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
      contentDensity: hints.contentDensity ?? inferredContentDensity(context)
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
      contentDensity: hints.contentDensity
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
