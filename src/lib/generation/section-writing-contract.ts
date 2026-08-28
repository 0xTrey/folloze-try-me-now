import type { ThesisFieldRole } from "@/lib/generation/campaign-thesis";
import type {
  SectionBrief,
  SectionEvidenceClaim,
  SectionWriterBrief,
  SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type {
  ClaimTypeV2,
  CtaIdV2,
  EvidenceKindV2,
  SectionRoleV2,
  SectionSlotV2,
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

/**
 * Copy that talks about the page instead of to the reader. Distinct from the
 * banned phrases above: those are internal vocabulary, these are sentences
 * about the artifact, the brief, the evidence list, or the generation. Either
 * way the reader is being shown the machinery, so both reject.
 */
export const INTERNAL_NARRATION_PATTERNS: readonly RegExp[] = [
  /\bthis (?:page|experience|section|brief|microsite)\b/i,
  /\bthe (?:brief|prompt|template|generation process|section plan|word budget)\b/i,
  /\bthe evidence (?:provided|supplied|below|above|list)\b/i,
  /\b(?:generated|assembled|compiled) (?:for|by|from) (?:you|your|the)\b/i,
  /\bbased on (?:the|your) (?:brief|inputs?|answers?|responses?)\b/i,
  /\bwe (?:generated|compiled|assembled|drafted) (?:this|the)\b/i,
  /\bsource material\b/i
];

/**
 * Softer self-reference. It reads as a tour of the deliverable rather than an
 * argument, which is a persuasion penalty and not a factual failure, so it is
 * scored down instead of rejected.
 */
export const NARRATION_PENALTY_PATTERNS: readonly RegExp[] = [
  /\bbelow you(?:'ll| will) find\b/i,
  /\bcurated\b/i,
  /\bhand-?picked\b/i,
  /\bin this (?:overview|summary|write-?up|round-?up)\b/i,
  /\bread on\b/i,
  /\btailored (?:for|to) you\b/i,
  /\bwe(?:'ve| have) (?:put|pulled) together\b/i
];

/**
 * Urgency the page may only state when the argument actually owns a why-now.
 * A calendar reference the reader already lives with ("this quarter") is not
 * urgency; a manufactured deadline is.
 */
export const INVENTED_URGENCY_PATTERN =
  /\b(?:act now|last chance|limited time|limited availability|hurry|expires?|expiring|deadline|don't miss|do not miss|before it(?:'s| is) too late|only \d+ (?:spots?|seats?|days?|places?)\b)/i;

/**
 * A customer result stated as its own kind of authority. Deliberately narrow:
 * a figure or superlative is already caught by claim coverage, so this only has
 * to catch the uncitable version: "our customers see" with nobody named.
 */
export const CUSTOMER_RESULT_PATTERN =
  /\b(?:our (?:customers?|clients?)|customers? (?:report|see|saw|achieved?)|case stud(?:y|ies)|testimonials?|reference customers?)\b/i;

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

/**
 * The buyer movement each role owns when no recipe supplies one. Every section
 * has to move the reader from one stated belief to the next, so a section
 * without a recipe entry still gets an explicit movement rather than none.
 */
const ROLE_BUYER_MOVEMENT: Record<SectionRoleV2, string> = {
  "buyer-outcome": "From scanning the page to recognizing their own job in it.",
  "current-friction": "From recognizing the topic to accepting the constraint is theirs.",
  mechanism: "From accepting the constraint to understanding how it is removed.",
  "use-cases": "From understanding the mechanism to locating their own work inside it.",
  proof: "From understanding the claim to judging whether it holds.",
  "next-move": "From a held judgement to one bounded next step.",
  "market-change": "From current assumptions to a changed decision context.",
  stakes: "From an abstract change to a personal consequence.",
  "evaluation-criteria": "From concern to a way of judging the options.",
  "solution-mapping": "From criteria to one approach that answers them.",
  applications: "From one sequence to their own variant of it.",
  "evaluation-close": "From a formed judgement to the decision now on the table.",
  "shared-priority": "From a vendor pitch to a priority both sides already hold.",
  "account-relevance": "From a general priority to why it matters at this account.",
  "shared-opportunity": "From shared relevance to work the two sides could do.",
  "priority-paths": "From available work to the path worth starting first.",
  "validation-plan": "From a plausible claim to a test they could run.",
  "first-decision": "From the whole commitment to the first decision only.",
  "proof-depth": "From an accepted proof point to the detail behind it.",
  resource: "From a stated question to whether this material answers it."
};

/**
 * The thesis fields each role may read when no recipe scopes them. Least
 * privileged for the same reason as the strategy slots below: a section that
 * can see the whole thesis will argue the whole thesis.
 */
const ROLE_THESIS_FIELDS: Record<SectionRoleV2, readonly ThesisFieldRole[]> = {
  "buyer-outcome": ["seller", "offer", "audience", "audienceJob", "desiredOutcome", "promise"],
  "current-friction": ["audienceJob", "currentState"],
  mechanism: ["seller", "offer", "mechanism", "promise"],
  "use-cases": ["audience", "audienceJob", "mechanism"],
  proof: ["proof", "mechanism", "promise"],
  "next-move": ["nextAction", "desiredOutcome", "audienceJob"],
  "market-change": ["whyNow", "currentState", "audience"],
  stakes: ["audienceJob", "currentState", "desiredOutcome"],
  "evaluation-criteria": ["objection", "audienceJob"],
  "solution-mapping": ["offer", "mechanism", "promise"],
  applications: ["audienceJob", "mechanism"],
  "evaluation-close": ["nextAction", "desiredOutcome"],
  "shared-priority": ["audience", "audienceJob", "whyNow"],
  "account-relevance": ["audience", "currentState", "whyNow"],
  "shared-opportunity": ["offer", "promise", "mechanism"],
  "priority-paths": ["audienceJob", "objection"],
  "validation-plan": ["proof", "mechanism"],
  "first-decision": ["nextAction", "objection"],
  "proof-depth": ["proof", "seller"],
  resource: ["offer", "proof"]
};

/**
 * Ideas each role must leave to the section that owns them. Prompt-facing
 * vocabulary: enforcement is by the fixed patterns above, keyed off the
 * brief's own thesis fields, because term-matching a paraphrase of an idea
 * rejects honest copy about the same subject.
 */
const ROLE_PROHIBITED_IDEAS: Partial<Record<SectionRoleV2, readonly string[]>> = {
  "buyer-outcome": ["the mechanism in detail", "the proof point"],
  "current-friction": ["the seller's answer to the constraint", "the next action"],
  mechanism: ["the customer result", "the closing ask"],
  "use-cases": ["the proof point", "the closing ask"],
  proof: ["the closing ask", "a second unrelated claim"],
  "next-move": ["a restatement of the opening promise", "a new factual claim"],
  "market-change": ["the seller's reaction to the change", "a prediction"],
  stakes: ["fear language", "an invented deadline"],
  "evaluation-criteria": ["product features disguised as criteria"],
  "solution-mapping": ["a capability the evidence does not state"],
  applications: ["a repeat of another application"],
  "evaluation-close": ["reopening an earlier section"],
  "shared-priority": ["speculation about internal account plans"],
  "account-relevance": ["inferred headcount, spend, tooling, or org structure"],
  "shared-opportunity": ["a purchase framing"],
  "priority-paths": ["a path that cannot be started on its own"],
  "validation-plan": ["an outcome the test has not produced"],
  "first-decision": ["the whole commitment"],
  "proof-depth": ["a new proof claim"],
  resource: ["why the material is impressive"]
};

/**
 * Self-reference no section may use, in the words a writer can act on. The
 * detection lives in `INTERNAL_NARRATION_PATTERNS`.
 */
const INTERNAL_NARRATION_IDEAS: readonly string[] = [
  "the page, section, or experience itself",
  "the brief, prompt, or template behind the copy",
  "the research or generation process",
  "the evidence list supplied to the writer"
];

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
  /** The page-wide brief. Shared by every section. */
  brief: SectionWriterBrief;
  /**
   * This section's own brief: the one buyer movement it owns, the thesis fields
   * and evidence it may use, and what it may not say. Everything a writer or
   * reviewer needs to judge the section in isolation.
   */
  sectionBrief: SectionBrief;
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

/**
 * Recipe-level section metadata, carried by value so this module stays below
 * the recipe layer. A slot with no entry falls back to its own locked job and
 * the role defaults above.
 */
export interface SectionJobSource {
  slotId: string;
  semanticJob: string;
  buyerMovement: string;
  thesisFields?: readonly string[];
  visualRole?: string;
}

export interface BuildSectionContractsInput {
  sessionId: string;
  revision: number;
  decision: WireframeDecisionV2;
  brief: SectionWriterBrief;
  evidence: readonly SectionEvidenceClaim[];
  strategy?: SectionStrategyBinding;
  /** Section jobs and movements from the selected page recipe, when one ran. */
  sectionJobs?: readonly SectionJobSource[];
}

/**
 * Splits a section's scoped evidence into what it was built for and what it may
 * merely draw on.
 *
 * A claim that declares a kind the slot asked for is what the section exists to
 * cite. A claim admitted only because its source role is compatible is weaker
 * support, so it stays optional. The two together are exactly the scoped set:
 * nothing is added and nothing is dropped, which is what keeps a reference
 * outside the union a violation rather than a gap.
 */
function splitEvidenceByRequirement(
  slot: SectionSlotV2,
  evidence: readonly SectionEvidenceClaim[]
): { required: string[]; optional: string[] } {
  const declared = new Set(slot.requiredEvidenceKinds);
  const required: string[] = [];
  const optional: string[] = [];
  for (const claim of evidence) {
    if (claim.kind && declared.has(claim.kind)) required.push(claim.id);
    else optional.push(claim.id);
  }
  return { required: required.sort(), optional: optional.sort() };
}

/**
 * The job every slot carries, recipe-supplied or defaulted. Resolved for the
 * whole plan before any brief is built, because a section's own brief depends
 * on its neighbours' movements.
 */
function resolveSectionJobs(
  plan: readonly SectionSlotV2[],
  supplied: readonly SectionJobSource[]
): SectionJobSource[] {
  const bySlotId = new Map(supplied.map((entry) => [entry.slotId, entry]));
  return plan.map((slot) => {
    const entry = bySlotId.get(slot.id);
    return {
      slotId: slot.id,
      semanticJob: entry?.semanticJob?.trim() || slot.buyerJob,
      buyerMovement: entry?.buyerMovement?.trim() || ROLE_BUYER_MOVEMENT[slot.role],
      ...(entry?.thesisFields?.length ? { thesisFields: entry.thesisFields } : {}),
      ...(entry?.visualRole ? { visualRole: entry.visualRole } : {})
    };
  });
}

function buildSectionBrief(input: {
  slot: SectionSlotV2;
  evidence: readonly SectionEvidenceClaim[];
  brief: SectionWriterBrief;
  job: SectionJobSource;
  previous: SectionJobSource | undefined;
  next: SectionJobSource | undefined;
}): SectionBrief {
  const { slot, job } = input;
  const scope = splitEvidenceByRequirement(slot, input.evidence);
  const thesisFields = job.thesisFields?.length
    ? [...new Set(job.thesisFields)].sort()
    : [...ROLE_THESIS_FIELDS[slot.role]].sort();
  const previousConclusion = input.previous?.buyerMovement;
  const nextSetup = input.next?.buyerMovement;
  return {
    sectionId: slot.id,
    semanticJob: job.semanticJob,
    buyerMovement: job.buyerMovement,
    ...(previousConclusion ? { previousConclusion } : {}),
    ...(nextSetup ? { nextSetup } : {}),
    thesisFields,
    requiredEvidenceRefs: scope.required,
    optionalEvidenceRefs: scope.optional,
    prohibitedClaims: [
      ...new Set([...input.brief.unknowns, ...(input.brief.prohibitedClaims ?? [])])
    ].sort(),
    prohibitedIdeas: [
      ...new Set([
        ...INTERNAL_NARRATION_IDEAS,
        ...(ROLE_PROHIBITED_IDEAS[slot.role] ?? []),
        ...(input.brief.prohibitedIdeas ?? [])
      ])
    ].sort(),
    allowedCtas: [...(slot.allowedCtas ?? [])].sort(),
    visualRole: job.visualRole ?? slot.visualRole,
    wordBudget: {
      headline: [slot.wordBudget.headline[0], slot.wordBudget.headline[1]],
      body: [slot.wordBudget.body[0], slot.wordBudget.body[1]]
    }
  };
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
  const jobs = resolveSectionJobs(input.decision.sectionPlan, input.sectionJobs ?? []);

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
      sectionBrief: buildSectionBrief({
        slot,
        evidence,
        brief: input.brief,
        job: jobs[order]!,
        previous: jobs[order - 1],
        next: jobs[order + 1]
      }),
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
    strategySlotKeys: Object.keys(contract.strategySlots).sort(),
    // The brief's scope is receiptable; its wording is not. A movement or a
    // prohibited claim is prose written for this build, so only the shape of
    // the brief travels into the digest.
    sectionBrief: {
      sectionId: contract.sectionBrief.sectionId,
      thesisFields: [...contract.sectionBrief.thesisFields].sort(),
      requiredEvidenceRefs: [...contract.sectionBrief.requiredEvidenceRefs],
      optionalEvidenceRefs: [...contract.sectionBrief.optionalEvidenceRefs],
      prohibitedClaimCount: contract.sectionBrief.prohibitedClaims.length,
      prohibitedIdeaCount: contract.sectionBrief.prohibitedIdeas.length,
      allowedCtas: [...contract.sectionBrief.allowedCtas],
      visualRole: contract.sectionBrief.visualRole,
      wordBudget: contract.sectionBrief.wordBudget,
      hasPreviousConclusion: Boolean(contract.sectionBrief.previousConclusion),
      hasNextSetup: Boolean(contract.sectionBrief.nextSetup)
    }
  };
}

/** True when the text contains a phrase that exposes internal build mechanics. */
export function containsBannedInternalPhrase(value: string): boolean {
  return BANNED_INTERNAL_PHRASES.some((pattern) => pattern.test(value));
}

/** True when the copy discusses the artifact instead of the reader's situation. */
export function containsInternalNarration(value: string): boolean {
  return INTERNAL_NARRATION_PATTERNS.some((pattern) => pattern.test(value));
}

/** True when the copy reads as a tour of the deliverable. Scored, not rejected. */
export function readsAsInternallyNarrated(value: string): boolean {
  return NARRATION_PENALTY_PATTERNS.some((pattern) => pattern.test(value));
}
