import type {
  SectionEvidenceClaim,
  SectionWriterBrief,
  SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type {
  ClaimTypeV2,
  CtaIdV2,
  EvidenceKindV2,
  SectionRoleV2,
  WireframeDecisionV2,
  WireframeFamilyV2
} from "@/lib/generation/three-family-contract";
import { adaptSectionSlotV2 } from "@/lib/generation/section-copy-types";

export const SECTION_PROMPT_REGISTRY_VERSION = "section-prompts-v1.0.0";
export const SECTION_WRITING_CONTRACT_VERSION = "section-writing-contract-v1";

/** Candidates requested per section in a single structured response. */
export const SECTION_CANDIDATES_PER_SLOT = 2;

/**
 * Phrases that describe the build rather than the buyer's situation. They read
 * as internal mechanics in a customer-facing experience, so a candidate that
 * contains one is rejected before scoring.
 */
export const BANNED_INTERNAL_PHRASES: readonly RegExp[] = [
  /\baccount thesis\b/i,
  /\bbest-in-class\b/i,
  /\bbuying committee\b/i,
  /\bdecision lens\b/i,
  /\bdecision path\b/i,
  /\bevidence pack\b/i,
  /\bexperience receipt\b/i,
  /\bmessage spine\b/i,
  /\bnarrative arc\b/i,
  /\bprepared for\b/i,
  /\bseamless\b/i,
  /\bsection role\b/i,
  /\bstakeholder map\b/i,
  /\bsupporting proof\b/i,
  /\btransform your business\b/i,
  /\bunlock value\b/i,
  /\bwireframe\b/i
];

export interface SectionPromptSpec {
  /** Stable per-role prompt identity. Bump when the instruction text changes. */
  version: string;
  /** What this section must accomplish for the reader. */
  objective: string;
  /** Ordered writing rules handed to the provider verbatim. */
  directives: readonly string[];
  /** Claim types this role may assert. */
  allowedClaimTypes: readonly ClaimTypeV2[];
}

function prompt(
  version: string,
  objective: string,
  directives: readonly string[],
  allowedClaimTypes: readonly ClaimTypeV2[]
): SectionPromptSpec {
  return { version, objective, directives, allowedClaimTypes };
}

const EVIDENCE_RULE =
  "Every factual statement must cite an evidence id from the supplied list. Write nothing you cannot cite.";
const VOICE_RULE =
  "Write to the named audience in plain second person. No vendor superlatives, no filler adjectives.";

/**
 * One prompt per section role. Roles differ in job, so they cannot share a
 * template: a proof section that inherits an opening prompt produces the
 * generic filler this registry exists to eliminate.
 */
export const SECTION_PROMPT_REGISTRY: Record<SectionRoleV2, SectionPromptSpec> = {
  "buyer-outcome": prompt(
    "buyer-outcome-v1.0.0",
    "State the specific outcome this audience gets, in their language.",
    [
      "Name the outcome, not the product category.",
      "Anchor the headline to the audience's own measure of success.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  "current-friction": prompt(
    "current-friction-v1.0.0",
    "Describe the friction the audience lives with today without blaming them.",
    [
      "Describe the current workflow cost concretely.",
      "Do not propose the solution here.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  mechanism: prompt(
    "mechanism-v1.0.0",
    "Explain how the outcome is actually produced.",
    [
      "Explain the mechanism in sequence, not as a feature list.",
      "Tie each step to the outcome named earlier.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  "use-cases": prompt(
    "use-cases-v1.0.0",
    "Offer distinct entry points so the reader can self-select.",
    [
      "Each option must address a different job, not a restatement.",
      "Label options by the reader's job, never by an internal index.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication", "instruction"]
  ),
  proof: prompt(
    "proof-v1.0.0",
    "Present verifiable evidence that the outcome has happened before.",
    [
      "Use only cited facts. Never estimate, round, or infer a figure.",
      "If no proof evidence exists, omit the section rather than assert one.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact"]
  ),
  "next-move": prompt(
    "next-move-v1.0.0",
    "Ask for one specific next step the reader can take now.",
    [
      "Name one action and what happens after it.",
      "Do not restate the opening promise.",
      VOICE_RULE
    ],
    ["instruction", "implication"]
  ),
  "market-change": prompt(
    "market-change-v1.0.0",
    "Name the shift that makes this decision urgent now.",
    [
      "Describe the change, not the vendor's reaction to it.",
      "Avoid predictions that no cited evidence supports.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  stakes: prompt(
    "stakes-v1.0.0",
    "Make the cost of inaction concrete for this audience.",
    [
      "Quantify only with cited figures.",
      "Do not use fear language or invented deadlines.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  "evaluation-criteria": prompt(
    "evaluation-criteria-v1.0.0",
    "Give the reader the criteria a good decision needs.",
    [
      "State criteria the reader can apply to any vendor, including others.",
      "Do not disguise product features as criteria.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "instruction"]
  ),
  "solution-mapping": prompt(
    "solution-mapping-v1.0.0",
    "Map the stated criteria to what is actually delivered.",
    [
      "Map one criterion at a time to one capability.",
      "Leave a gap visible rather than filling it with a claim.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  applications: prompt(
    "applications-v1.0.0",
    "Show where this applies inside the reader's own operation.",
    [
      "Ground each application in a named workflow.",
      "Each application must be distinct from the others.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  "evaluation-close": prompt(
    "evaluation-close-v1.0.0",
    "Close the evaluation with the single decision now on the table.",
    [
      "State the decision, then the action that resolves it.",
      "Do not reopen earlier sections.",
      VOICE_RULE
    ],
    ["instruction", "implication"]
  ),
  "shared-priority": prompt(
    "shared-priority-v1.0.0",
    "Name the priority both organizations already share.",
    [
      "Reference the named account only from cited public evidence.",
      "Do not speculate about internal account plans.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication"]
  ),
  "account-relevance": prompt(
    "account-relevance-v1.0.0",
    "Explain why this matters to this account specifically.",
    [
      "Every account statement needs a cited public source.",
      "Never infer headcount, spend, tooling, or org structure.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact"]
  ),
  "shared-opportunity": prompt(
    "shared-opportunity-v1.0.0",
    "Describe the opportunity available to both sides.",
    [
      "Frame the opportunity as joint work, not a purchase.",
      "Support scope claims with cited evidence.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "implication", "hypothesis"]
  ),
  "priority-paths": prompt(
    "priority-paths-v1.0.0",
    "Offer prioritized paths the account can start with.",
    [
      "Order paths by the reader's likely urgency.",
      "Each path must be independently startable.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["implication", "instruction"]
  ),
  "validation-plan": prompt(
    "validation-plan-v1.0.0",
    "Propose how the reader can validate the claim themselves.",
    [
      "Describe a test the reader runs, with an observable result.",
      "Do not promise an outcome the test has not produced.",
      VOICE_RULE
    ],
    ["instruction", "hypothesis"]
  ),
  "first-decision": prompt(
    "first-decision-v1.0.0",
    "Isolate the first decision, separate from the whole commitment.",
    [
      "Keep the decision small enough to make in one meeting.",
      "State explicitly what is not being decided yet.",
      VOICE_RULE
    ],
    ["instruction", "implication"]
  ),
  "proof-depth": prompt(
    "proof-depth-v1.0.0",
    "Go one level deeper on the evidence already presented.",
    [
      "Add detail to a cited proof point; do not introduce a new claim.",
      "If depth is unavailable, omit rather than pad.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact"]
  ),
  resource: prompt(
    "resource-v1.0.0",
    "Describe the referenced material so the reader knows whether to open it.",
    [
      "Summarize what the material contains, not why it is impressive.",
      "Only describe material present in the cited evidence.",
      EVIDENCE_RULE,
      VOICE_RULE
    ],
    ["fact", "instruction"]
  )
};

export interface SectionWritingContract {
  version: typeof SECTION_WRITING_CONTRACT_VERSION;
  registryVersion: string;
  sessionId: string;
  revision: number;
  sectionId: string;
  family: WireframeFamilyV2;
  role: SectionRoleV2;
  claimType: ClaimTypeV2;
  order: number;
  required: boolean;
  slot: SectionWriterSlot;
  prompt: SectionPromptSpec;
  /** Evidence this section may cite. Anything outside it is an invalid ref. */
  evidence: readonly SectionEvidenceClaim[];
  evidenceRefs: readonly string[];
  allowedCtas: readonly CtaIdV2[];
  candidateCount: number;
  brief: SectionWriterBrief;
  /**
   * The one job this section owns in the selected strategy. Distinct per
   * section, so a section that has nothing left to argue omits rather than
   * restating a point another section already made.
   */
  strategyJobs: readonly string[];
  /** The strategy slots this role may draw on. Everything else is withheld. */
  strategySlots: Partial<Record<StrategySlotKey, string>>;
  /** Present only when a strategy was bound. Gates the review specificity checks. */
  strategySubject?: { audienceLabel: string; offerLabel: string };
}

export const STRATEGY_SLOT_KEYS = [
  "bigIdea",
  "audienceJob",
  "tension",
  "promise",
  "mechanism",
  "proofPlan",
  "objectionPlan",
  "ctaLogic",
  "whyNow"
] as const;
export type StrategySlotKey = (typeof STRATEGY_SLOT_KEYS)[number];

/**
 * Which strategy slots each role is permitted to see. A proof section that can
 * read the CTA logic will drift into closing; withholding the slot is cheaper
 * than detecting the drift afterwards.
 */
const ROLE_STRATEGY_SLOTS: Record<SectionRoleV2, readonly StrategySlotKey[]> = {
  "buyer-outcome": ["bigIdea", "promise", "audienceJob"],
  "current-friction": ["tension", "audienceJob"],
  mechanism: ["mechanism", "promise"],
  "use-cases": ["audienceJob", "mechanism"],
  proof: ["proofPlan", "objectionPlan"],
  "next-move": ["ctaLogic", "promise"],
  "market-change": ["whyNow", "bigIdea"],
  stakes: ["tension", "objectionPlan"],
  "evaluation-criteria": ["objectionPlan", "audienceJob"],
  "solution-mapping": ["mechanism", "promise"],
  applications: ["audienceJob", "mechanism"],
  "evaluation-close": ["ctaLogic", "proofPlan"],
  "shared-priority": ["audienceJob", "whyNow", "bigIdea"],
  "account-relevance": ["tension", "whyNow", "audienceJob"],
  "shared-opportunity": ["bigIdea", "promise", "mechanism"],
  "priority-paths": ["audienceJob", "objectionPlan"],
  "validation-plan": ["proofPlan", "mechanism"],
  "first-decision": ["ctaLogic", "objectionPlan"],
  "proof-depth": ["proofPlan", "objectionPlan"],
  resource: ["proofPlan", "objectionPlan"]
};

function strategySlotsForRole(
  role: SectionRoleV2,
  strategy: SectionStrategyBinding | undefined
): Partial<Record<StrategySlotKey, string>> {
  if (!strategy) return {};
  const permitted = ROLE_STRATEGY_SLOTS[role] ?? [];
  const slots: Partial<Record<StrategySlotKey, string>> = {};
  for (const key of permitted) {
    const value = strategy.slots[key]?.trim();
    if (value) slots[key] = value;
  }
  return slots;
}

/**
 * The role a claim of each kind comes from. Used only to place legacy claims
 * that predate the explicit `kind` field; a claim that declares its kind is
 * matched on that kind exactly.
 */
const EVIDENCE_KIND_SOURCE_ROLE: Partial<
  Record<EvidenceKindV2, SectionEvidenceClaim["sourceRole"]>
> = {
  seller_fact: "seller",
  target_fact: "target",
  offer: "offer",
  audience: "visitor",
  proof: "source",
  visitor_input: "visitor",
  third_party_context: "source"
};

/**
 * The selected strategy, projected for section binding. Carried by value so a
 * contract cannot reach back into the compiler artifact and read the ledger.
 */
export interface SectionStrategyBinding {
  slots: Partial<Record<StrategySlotKey, string>>;
  /** Section id to the single job that section owns. */
  jobsBySectionId: Readonly<Record<string, readonly string[]>>;
  /** Who the page is for and what it is about, for the review gates. */
  audienceLabel: string;
  offerLabel: string;
}

export interface BuildSectionContractsInput {
  sessionId: string;
  revision: number;
  decision: WireframeDecisionV2;
  brief: SectionWriterBrief;
  evidence: readonly SectionEvidenceClaim[];
  strategy?: SectionStrategyBinding;
}

/**
 * Builds one contract per locked section. Runs after wireframe lock so the
 * section set, order, and claim types are already fixed and a writer cannot
 * change the structure of the experience.
 */
export function buildSectionWritingContracts(
  input: BuildSectionContractsInput
): SectionWritingContract[] {
  if (input.decision.revision !== input.revision) return [];
  const currentEvidence = input.evidence.filter(
    (claim) => claim.revision === input.revision
  );

  return input.decision.sectionPlan.map((slot, order) => {
    const promptSpec = SECTION_PROMPT_REGISTRY[slot.role];
    const allowedKinds = new Set(slot.requiredEvidenceKinds);
    const allowedRoles = new Set(
      slot.requiredEvidenceKinds
        .map((kind) => EVIDENCE_KIND_SOURCE_ROLE[kind])
        .filter((role): role is SectionEvidenceClaim["sourceRole"] => Boolean(role))
    );
    // A section may only cite evidence of the kinds its slot declares. With no
    // declared kind the section writes without asserting anything verifiable.
    const evidence = allowedKinds.size
      ? currentEvidence.filter((claim) =>
          claim.kind ? allowedKinds.has(claim.kind) : allowedRoles.has(claim.sourceRole)
        )
      : [];
    const writerSlot = adaptSectionSlotV2(
      input.decision.family,
      slot,
      order,
      evidence.map(({ id }) => id)
    );
    return {
      version: SECTION_WRITING_CONTRACT_VERSION,
      registryVersion: SECTION_PROMPT_REGISTRY_VERSION,
      sessionId: input.sessionId,
      revision: input.revision,
      sectionId: slot.id,
      family: input.decision.family,
      role: slot.role,
      claimType: slot.claimType,
      order,
      required: !slot.optional,
      slot: writerSlot,
      prompt: promptSpec,
      evidence,
      evidenceRefs: evidence.map(({ id }) => id).sort(),
      allowedCtas: [...(slot.allowedCtas ?? [])],
      candidateCount: SECTION_CANDIDATES_PER_SLOT,
      brief: input.brief,
      strategyJobs: input.strategy?.jobsBySectionId[slot.id] ?? [],
      strategySlots: strategySlotsForRole(slot.role, input.strategy),
      ...(input.strategy
        ? {
            strategySubject: {
              audienceLabel: input.strategy.audienceLabel,
              offerLabel: input.strategy.offerLabel
            }
          }
        : {})
    } satisfies SectionWritingContract;
  });
}

/** Digest-safe projection of a contract. Prompt text and copy stay out. */
export function sectionContractDigestSource(
  contract: SectionWritingContract
): unknown {
  return {
    version: contract.version,
    registryVersion: contract.registryVersion,
    promptVersion: contract.prompt.version,
    sectionId: contract.sectionId,
    family: contract.family,
    role: contract.role,
    claimType: contract.claimType,
    order: contract.order,
    required: contract.required,
    evidenceRefs: [...contract.evidenceRefs],
    allowedCtas: [...contract.allowedCtas].sort(),
    wordBudget: contract.slot.wordBudget,
    headlineWordBudget: contract.slot.headlineWordBudget ?? null,
    candidateCount: contract.candidateCount,
    // Job names and slot keys are vocabulary, not copy, so they can be
    // receipted. The slot values behind them stay out of the digest source.
    strategyJobs: [...contract.strategyJobs].sort(),
    strategySlotKeys: Object.keys(contract.strategySlots).sort()
  };
}

/** True when the text contains a phrase that exposes internal build mechanics. */
export function containsBannedInternalPhrase(value: string): boolean {
  return BANNED_INTERNAL_PHRASES.some((pattern) => pattern.test(value));
}
