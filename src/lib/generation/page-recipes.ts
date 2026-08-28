/**
 * The six page recipe contracts and the one switch that activates them.
 *
 * A recipe owns a semantic sequence and the job of each section. It does not own
 * the strategic family, the composition, or any visual decision: those are still
 * the existing three-family decision's to make, so a recipe only declares which
 * families it can compose under and is rejected when the decided family is not
 * one of them.
 *
 * All six contracts are defined and validated now. Only Product/Solution is
 * activated, and activation is read from `ACTIVATED_RECIPES` alone. A selection
 * for an inert recipe carries no sections, which is what keeps existing paths on
 * their current behavior instead of on a half-built recipe.
 */

import {
  THESIS_FIELD_ROLES,
  campaignThesisDigest,
  validateCampaignThesis,
  type CampaignThesis,
  type ThesisFieldRole,
  type ThesisRequirement,
  type ThesisValidation
} from "@/lib/generation/campaign-thesis";
import { compilerDigest } from "@/lib/generation/compiler-digest";
import type {
  CtaIdV2,
  SectionRoleV2,
  VisualRoleV2,
  WireframeFamilyV2
} from "@/lib/generation/three-family-contract";
import type { UseCase } from "@/lib/types";

export const PAGE_RECIPE_SCHEMA_VERSION = "1.0" as const;

export const PAGE_RECIPE_IDS = [
  "product-solution",
  "problem-category",
  "use-case-workflow",
  "content-resource",
  "event-webinar",
  "customer-proof"
] as const;
export type PageRecipeId = (typeof PAGE_RECIPE_IDS)[number];

/**
 * The one activation switch for this release. Product/Solution is the only
 * benchmarked recipe; the rest validate as contracts and stay inert.
 */
export const ACTIVATED_RECIPES: ReadonlySet<PageRecipeId> = new Set<PageRecipeId>([
  "product-solution"
]);

export function isActivatedRecipe(recipeId: PageRecipeId): boolean {
  return ACTIVATED_RECIPES.has(recipeId);
}

/* -------------------------------------------------------------------------- */
/* Contract                                                                    */
/* -------------------------------------------------------------------------- */

export interface RecipeSectionSpec {
  slotId: string;
  /** Internal job label. Never rendered, never shown to a visitor. */
  semanticJob: string;
  /** The belief or question this section moves the buyer from, and to. */
  buyerMovement: string;
  role: SectionRoleV2;
  visualRole: VisualRoleV2;
  /**
   * A required section always appears. An optional section appears only when its
   * gate is satisfied, so section count follows the argument rather than a quota.
   */
  required: boolean;
  thesisFields: readonly ThesisFieldRole[];
  allowedCtas?: readonly CtaIdV2[];
}

export interface PageRecipeContract {
  schemaVersion: typeof PAGE_RECIPE_SCHEMA_VERSION;
  id: PageRecipeId;
  version: string;
  /** Internal label for receipts and diagnostics, never buyer-facing. */
  label: string;
  /**
   * Which strategic families this sequence can compose under. The family itself
   * is decided elsewhere; the recipe only accepts or declines it.
   */
  compatibleStrategicFamilies: readonly WireframeFamilyV2[];
  requiredThesisFields: readonly ThesisFieldRole[];
  proofPolicy: ThesisRequirement["proofPolicy"];
  sectionRange: readonly [number, number];
  progression: readonly RecipeSectionSpec[];
  visibility: "internal";
}

function spec(
  slotId: string,
  semanticJob: string,
  buyerMovement: string,
  role: SectionRoleV2,
  visualRole: VisualRoleV2,
  required: boolean,
  thesisFields: readonly ThesisFieldRole[],
  allowedCtas?: readonly CtaIdV2[]
): RecipeSectionSpec {
  return {
    slotId,
    semanticJob,
    buyerMovement,
    role,
    visualRole,
    required,
    thesisFields,
    ...(allowedCtas ? { allowedCtas } : {})
  };
}

/**
 * The Product/Solution progression from the architecture package. The current
 * constraint is required because it gives the page an argument rather than a
 * catalog sequence. Steps four and six remain optional: each states something
 * the thesis may not know, and a section with nothing supported to say is
 * dropped rather than softened.
 */
const PRODUCT_SOLUTION_PROGRESSION: readonly RecipeSectionSpec[] = [
  spec(
    "recognize-buyer-outcome",
    "recognize the buyer and the promised outcome",
    "From scanning to recognizing that this page is about their own job.",
    "buyer-outcome",
    "hero-image-or-type",
    true,
    ["seller", "offer", "audience", "audienceJob", "desiredOutcome", "promise"],
    ["book_meeting", "explore_use_case"]
  ),
  spec(
    "name-constraint",
    "name the current constraint in the buyer's language",
    "From recognizing the topic to accepting that the constraint is theirs.",
    "current-friction",
    "evidence-type",
    true,
    ["audienceJob", "currentState", "whyNow"]
  ),
  spec(
    "distinct-mechanism",
    "explain the seller's distinct mechanism",
    "From accepting the constraint to understanding how it is removed.",
    "mechanism",
    "workflow",
    true,
    ["seller", "offer", "mechanism", "promise"]
  ),
  spec(
    "relevant-use-cases",
    "show the most relevant use cases or workflow",
    "From understanding the mechanism to locating their own work inside it.",
    "use-cases",
    "path-selector",
    false,
    ["audience", "audienceJob", "mechanism"]
  ),
  spec(
    "proof-or-validation",
    "establish proof or a credible validation path",
    "From understanding the claim to judging whether it holds.",
    "proof",
    "proof-artifact",
    true,
    ["proof", "mechanism", "promise"],
    ["review_evidence", "plan_validation"]
  ),
  spec(
    "highest-value-objection",
    "answer the highest-value objection",
    "From judging the claim to resolving the reason not to act.",
    "evaluation-criteria",
    "criteria",
    false,
    ["objection", "audienceJob", "proof"]
  ),
  spec(
    "next-action",
    "make the next action the logical continuation",
    "From resolved objection to one bounded next step.",
    "next-move",
    "cta-panel",
    true,
    ["nextAction", "desiredOutcome", "audienceJob"],
    ["book_meeting", "explore_use_case", "review_evidence"]
  )
];

const RECIPES: Record<PageRecipeId, PageRecipeContract> = {
  "product-solution": {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    id: "product-solution",
    version: "page-recipe-product-solution-v1.0.0",
    label: "Product or solution promotion",
    // The activated progression uses Launch roles. Guide has its own recipe
    // contract but remains inert until its distinct semantic sequence is wired.
    compatibleStrategicFamilies: ["launch"],
    requiredThesisFields: [
      "seller",
      "offer",
      "audience",
      "audienceJob",
      "promise",
      "mechanism",
      "nextAction"
    ],
    proofPolicy: "evidence-or-validation-question",
    sectionRange: [5, 7],
    progression: PRODUCT_SOLUTION_PROGRESSION,
    visibility: "internal"
  },
  "problem-category": {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    id: "problem-category",
    version: "page-recipe-problem-category-v1.0.0",
    label: "Problem or category education",
    compatibleStrategicFamilies: ["guide"],
    requiredThesisFields: ["seller", "audience", "audienceJob", "currentState", "nextAction"],
    proofPolicy: "evidence-or-validation-question",
    sectionRange: [4, 6],
    progression: [
      spec(
        "category-shift",
        "name the change that reframes the decision",
        "From current assumptions to a changed decision context.",
        "market-change",
        "hero-image-or-type",
        true,
        ["seller", "audience", "currentState", "whyNow"]
      ),
      spec(
        "stakes",
        "connect the change to what the buyer owns",
        "From abstract change to personal consequence.",
        "stakes",
        "evidence-type",
        true,
        ["audienceJob", "currentState", "desiredOutcome"]
      ),
      spec(
        "evaluation-criteria",
        "give observable evaluation criteria",
        "From concern to a way of judging options.",
        "evaluation-criteria",
        "criteria",
        true,
        ["objection", "audienceJob"]
      ),
      spec(
        "category-answer",
        "map the criteria to a supported approach",
        "From criteria to one defensible approach.",
        "solution-mapping",
        "workflow",
        false,
        ["offer", "mechanism", "promise"]
      ),
      spec(
        "validation",
        "offer proof or a validation path",
        "From approach to a way of testing it.",
        "validation-plan",
        "proof-artifact",
        false,
        ["proof", "mechanism"],
        ["review_evidence", "plan_validation"]
      ),
      spec(
        "continue",
        "continue the evaluation with one bounded step",
        "From judgement to a working session.",
        "evaluation-close",
        "cta-panel",
        true,
        ["nextAction", "desiredOutcome"],
        ["book_working_session", "review_evidence"]
      )
    ],
    visibility: "internal"
  },
  "use-case-workflow": {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    id: "use-case-workflow",
    version: "page-recipe-use-case-workflow-v1.0.0",
    label: "Use case or workflow",
    compatibleStrategicFamilies: ["launch", "guide"],
    requiredThesisFields: [
      "seller",
      "offer",
      "audience",
      "audienceJob",
      "mechanism",
      "nextAction"
    ],
    proofPolicy: "evidence-or-validation-question",
    sectionRange: [4, 6],
    progression: [
      spec(
        "workflow-owner",
        "name the workflow and who owns it",
        "From general interest to owning this workflow.",
        "buyer-outcome",
        "hero-image-or-type",
        true,
        ["seller", "offer", "audience", "audienceJob"]
      ),
      spec(
        "workflow-today",
        "describe how the work runs today",
        "From owning the workflow to seeing its cost.",
        "current-friction",
        "evidence-type",
        false,
        ["currentState", "audienceJob"]
      ),
      spec(
        "workflow-steps",
        "walk the supported steps",
        "From cost to a concrete alternative sequence.",
        "mechanism",
        "workflow",
        true,
        ["mechanism", "promise", "offer"]
      ),
      spec(
        "workflow-variants",
        "show adjacent applications",
        "From one sequence to their own variant of it.",
        "applications",
        "scenario-map",
        false,
        ["audienceJob", "mechanism"]
      ),
      spec(
        "workflow-proof",
        "show proof or a validation path for the sequence",
        "From plausible sequence to a checkable one.",
        "proof",
        "proof-artifact",
        true,
        ["proof", "mechanism"],
        ["review_evidence", "plan_validation"]
      ),
      spec(
        "workflow-next",
        "ask for the step that starts the workflow",
        "From checkable sequence to one bounded step.",
        "next-move",
        "cta-panel",
        true,
        ["nextAction", "desiredOutcome"],
        ["explore_use_case", "book_meeting"]
      )
    ],
    visibility: "internal"
  },
  "content-resource": {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    id: "content-resource",
    version: "page-recipe-content-resource-v1.0.0",
    label: "Content or resource",
    compatibleStrategicFamilies: ["guide"],
    requiredThesisFields: ["seller", "audience", "audienceJob", "offer", "nextAction"],
    proofPolicy: "evidence-or-validation-question",
    sectionRange: [4, 5],
    progression: [
      spec(
        "resource-question",
        "name the question the resource answers",
        "From browsing to a question they hold.",
        "market-change",
        "hero-image-or-type",
        true,
        ["seller", "offer", "audience", "audienceJob"]
      ),
      spec(
        "resource-stakes",
        "say why the question matters now",
        "From curiosity to a reason to read.",
        "stakes",
        "evidence-type",
        false,
        ["currentState", "whyNow", "desiredOutcome"]
      ),
      spec(
        "resource-contents",
        "state what the resource contains",
        "From reason to read to knowing what they get.",
        "resource",
        "proof-artifact",
        true,
        ["offer", "mechanism"],
        ["review_evidence"]
      ),
      spec(
        "resource-credibility",
        "establish who produced it and on what basis",
        "From contents to trusting the source.",
        "proof-depth",
        "proof-artifact",
        true,
        ["proof", "seller"],
        ["review_evidence"]
      ),
      spec(
        "resource-next",
        "ask for the access step",
        "From trust to one bounded access step.",
        "evaluation-close",
        "cta-panel",
        true,
        ["nextAction", "audienceJob"],
        ["review_evidence", "book_working_session"]
      )
    ],
    visibility: "internal"
  },
  "event-webinar": {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    id: "event-webinar",
    version: "page-recipe-event-webinar-v1.0.0",
    label: "Event or webinar registration",
    compatibleStrategicFamilies: ["launch"],
    requiredThesisFields: [
      "seller",
      "offer",
      "audience",
      "audienceJob",
      "promise",
      "nextAction"
    ],
    proofPolicy: "evidence-or-validation-question",
    sectionRange: [4, 5],
    progression: [
      spec(
        "event-promise",
        "name the session and what the attendee leaves with",
        "From an invitation to a reason to attend.",
        "buyer-outcome",
        "hero-image-or-type",
        true,
        ["seller", "offer", "audience", "promise"],
        ["register"]
      ),
      spec(
        "event-relevance",
        "say why this session matters to this buyer now",
        "From general interest to personal relevance.",
        "market-change",
        "evidence-type",
        false,
        ["audienceJob", "currentState", "whyNow"]
      ),
      spec(
        "event-agenda",
        "walk the supported agenda",
        "From relevance to knowing how the time is spent.",
        "mechanism",
        "workflow",
        true,
        ["mechanism", "promise"]
      ),
      spec(
        "event-credibility",
        "establish who is presenting and on what basis",
        "From agenda to trusting the speakers.",
        "proof",
        "proof-artifact",
        true,
        ["proof", "seller"],
        ["review_evidence"]
      ),
      spec(
        "event-register",
        "ask for registration",
        "From trust to registration.",
        "next-move",
        "cta-panel",
        true,
        ["nextAction", "desiredOutcome"],
        ["register", "book_meeting"]
      )
    ],
    visibility: "internal"
  },
  "customer-proof": {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    id: "customer-proof",
    version: "page-recipe-customer-proof-v1.0.0",
    label: "Customer proof",
    compatibleStrategicFamilies: ["launch", "align"],
    requiredThesisFields: [
      "seller",
      "offer",
      "audience",
      "audienceJob",
      "mechanism",
      "nextAction"
    ],
    // A proof page with no permitted proof evidence has nothing to be; it may
    // never substitute a validation question for the customer result itself.
    proofPolicy: "evidence-required",
    sectionRange: [4, 5],
    progression: [
      spec(
        "proof-subject",
        "name the customer situation and the reader it mirrors",
        "From a vendor story to a situation like their own.",
        "buyer-outcome",
        "hero-image-or-type",
        true,
        ["seller", "audience", "audienceJob", "proof"]
      ),
      spec(
        "proof-starting-point",
        "describe the starting constraint",
        "From recognition to a shared starting point.",
        "current-friction",
        "evidence-type",
        false,
        ["currentState", "audienceJob"]
      ),
      spec(
        "proof-result",
        "state only the referenced result",
        "From starting point to a referenced outcome.",
        "proof",
        "proof-artifact",
        true,
        ["proof", "promise"],
        ["review_evidence"]
      ),
      spec(
        "proof-mechanism",
        "explain what produced the result",
        "From outcome to a repeatable cause.",
        "proof-depth",
        "workflow",
        true,
        ["mechanism", "offer", "proof"]
      ),
      spec(
        "proof-next",
        "ask for the comparable next step",
        "From a repeatable cause to their own version of it.",
        "next-move",
        "cta-panel",
        true,
        ["nextAction", "desiredOutcome"],
        ["book_meeting", "plan_validation"]
      )
    ],
    visibility: "internal"
  }
};

export function pageRecipe(recipeId: PageRecipeId): PageRecipeContract {
  return RECIPES[recipeId];
}

export function allPageRecipes(): PageRecipeContract[] {
  return PAGE_RECIPE_IDS.map((id) => RECIPES[id]);
}

export function thesisRequirementForRecipe(recipeId: PageRecipeId): ThesisRequirement {
  const recipe = RECIPES[recipeId];
  return {
    requiredFields: recipe.requiredThesisFields,
    proofPolicy: recipe.proofPolicy
  };
}

export function validateThesisForRecipe(
  thesis: CampaignThesis,
  recipeId: PageRecipeId
): ThesisValidation {
  return validateCampaignThesis(thesis, thesisRequirementForRecipe(recipeId));
}

/* -------------------------------------------------------------------------- */
/* Contract validation                                                         */
/* -------------------------------------------------------------------------- */

export type PageRecipeIssue =
  | "invalid_recipe_schema_version"
  | "invalid_recipe_version"
  | "invalid_section_range"
  | "progression_shorter_than_max_sections"
  | "required_sections_exceed_min_sections"
  | "duplicate_section_slot_id"
  | "duplicate_section_role"
  | "duplicate_semantic_job"
  | "section_without_thesis_field"
  | "unknown_thesis_field"
  | "required_thesis_field_unused"
  | "duplicate_allowed_cta"
  | "missing_strategic_family"
  | "missing_next_action_section";

const VERSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}-v\d+(?:\.\d+){0,2}$/;

/** Returns every problem rather than the first, so a bad contract fails loudly. */
export function validatePageRecipeContract(recipe: PageRecipeContract): PageRecipeIssue[] {
  const issues = new Set<PageRecipeIssue>();
  const [min, max] = recipe.sectionRange;

  if (recipe.schemaVersion !== PAGE_RECIPE_SCHEMA_VERSION) {
    issues.add("invalid_recipe_schema_version");
  }
  if (!VERSION_PATTERN.test(recipe.version)) issues.add("invalid_recipe_version");
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 4 || max > 8 || min > max) {
    issues.add("invalid_section_range");
  }
  if (recipe.progression.length < max) issues.add("progression_shorter_than_max_sections");
  if (recipe.compatibleStrategicFamilies.length === 0) issues.add("missing_strategic_family");

  const requiredCount = recipe.progression.filter((section) => section.required).length;
  if (requiredCount > min) issues.add("required_sections_exceed_min_sections");

  const slotIds = new Set<string>();
  const roles = new Set<SectionRoleV2>();
  const jobs = new Set<string>();
  const knownFields = new Set<string>(THESIS_FIELD_ROLES);
  const usedFields = new Set<ThesisFieldRole>();

  for (const section of recipe.progression) {
    if (slotIds.has(section.slotId)) issues.add("duplicate_section_slot_id");
    slotIds.add(section.slotId);
    if (roles.has(section.role)) issues.add("duplicate_section_role");
    roles.add(section.role);
    if (jobs.has(section.semanticJob)) issues.add("duplicate_semantic_job");
    jobs.add(section.semanticJob);
    if (section.thesisFields.length === 0) issues.add("section_without_thesis_field");
    for (const field of section.thesisFields) {
      if (!knownFields.has(field)) issues.add("unknown_thesis_field");
      usedFields.add(field);
    }
    const ctas = section.allowedCtas ?? [];
    if (new Set(ctas).size !== ctas.length) issues.add("duplicate_allowed_cta");
  }

  for (const field of recipe.requiredThesisFields) {
    if (!usedFields.has(field)) issues.add("required_thesis_field_unused");
  }

  const last = recipe.progression[recipe.progression.length - 1];
  if (!last?.required || !last.thesisFields.includes("nextAction") || !last.allowedCtas?.length) {
    issues.add("missing_next_action_section");
  }

  return [...issues].sort();
}

/* -------------------------------------------------------------------------- */
/* Section selection                                                           */
/* -------------------------------------------------------------------------- */

export interface RecipeSectionPlanEntry extends RecipeSectionSpec {
  order: number;
}

/**
 * Whether an optional section has anything supported to say. Each gate reads the
 * thesis only; a section is never included to reach a section count.
 */
const OPTIONAL_SECTION_GATES: Record<string, (thesis: CampaignThesis) => boolean> = {
  "name-constraint": (thesis) =>
    thesis.currentState.status !== "unknown" && thesis.currentState.buyerFacing,
  // The workflow section earns its place only when the buyer's job is both known
  // and sayable to a buyer, and there is a supported mechanism to show it against.
  "relevant-use-cases": (thesis) =>
    thesis.audienceJob.status !== "unknown" &&
    thesis.audienceJob.buyerFacing &&
    thesis.mechanism.status !== "unknown",
  "highest-value-objection": (thesis) =>
    thesis.objection.status !== "unknown" && thesis.objection.buyerFacing
};

function sectionsForRecipe(
  recipe: PageRecipeContract,
  thesis: CampaignThesis
): RecipeSectionPlanEntry[] {
  const [, max] = recipe.sectionRange;
  const kept = recipe.progression.filter((section) => {
    if (section.required) return true;
    const gate = OPTIONAL_SECTION_GATES[section.slotId];
    return gate ? gate(thesis) : false;
  });
  return kept.slice(0, max).map((section, index) => ({ ...section, order: index + 1 }));
}

/** Exposed for fixtures and receipts: the plan Product/Solution would produce. */
export function productSolutionSectionPlan(thesis: CampaignThesis): RecipeSectionPlanEntry[] {
  return sectionsForRecipe(RECIPES["product-solution"], thesis);
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

export interface RecipeRoutingSignals {
  useCase?: UseCase;
  campaignType?: "product" | "solution" | "demand" | "event";
  offerKind?: "product" | "offer" | "solution" | "industry" | "event" | "webinar";
  eventSubtype?: "event" | "webinar";
  intent?: string;
  objective?: string;
  /** The already-decided strategic family, when one has been decided. */
  strategicFamily?: WireframeFamilyV2;
}

export interface PageRecipeSelectionInput {
  thesis: CampaignThesis;
  signals: RecipeRoutingSignals;
}

export interface RejectedPageRecipe {
  recipeId: PageRecipeId;
  reasonCode: string;
}

export interface PageRecipeSelection {
  schemaVersion: typeof PAGE_RECIPE_SCHEMA_VERSION;
  recipeId: PageRecipeId;
  recipeVersion: string;
  /** Binds the selection to the thesis it was made for, so a receipt is checkable. */
  thesisDigest: string;
  /**
   * True only when the routed recipe is in `ACTIVATED_RECIPES`, its family is
   * compatible, and the thesis satisfies it. Callers keep their current behavior
   * whenever this is false.
   */
  activated: boolean;
  sections: RecipeSectionPlanEntry[];
  rejected: RejectedPageRecipe[];
  thesisValidation: ThesisValidation;
  reasonCodes: string[];
  digest: string;
  visibility: "internal";
}

/**
 * Routing patterns stay narrow on purpose. A term broad enough to appear in an
 * ordinary product description would divert that page to an inert recipe and
 * silently drop it back to the pre-recipe behavior, so only wording that names
 * the motion itself is matched here.
 */
const EVENT_PATTERN = /\b(?:event|webinar|register|registration|rsvp|attend|livestream)\b/;
const CUSTOMER_PROOF_PATTERN =
  /\b(?:case stud(?:y|ies)|customer stor(?:y|ies)|customer proof|success stor(?:y|ies)|reference customer|testimonial)\b/;
const CONTENT_PATTERN =
  /\b(?:report|ebook|e-book|whitepaper|white paper|(?:buyer'?s|field|practical) guide|resource hub|download|newsletter|template)\b/;
const WORKFLOW_PATTERN = /\b(?:use case|use cases|workflow|workflows|playbook)\b/;
const CATEGORY_PATTERN =
  /\b(?:category|market shift|industry landscape|why change|state of|(?:market|industry) trends|category maturity)\b/;

function routingText(signals: RecipeRoutingSignals): string {
  return `${signals.intent ?? ""} ${signals.objective ?? ""}`.trim().toLocaleLowerCase();
}

interface RoutedRecipe {
  recipeId: PageRecipeId;
  reasonCode: string;
}

/**
 * First match wins, in a fixed order, so identical signals always route to the
 * same recipe. Product/Solution is the terminal default, matching the existing
 * promotion default in the three-family decision.
 */
function routeRecipe(signals: RecipeRoutingSignals): RoutedRecipe {
  const text = routingText(signals);

  if (
    signals.eventSubtype ||
    signals.campaignType === "event" ||
    signals.offerKind === "event" ||
    signals.offerKind === "webinar" ||
    EVENT_PATTERN.test(text)
  ) {
    return { recipeId: "event-webinar", reasonCode: "route_registration_intent" };
  }
  // An explicit Product or Solution choice is the visitor's strongest routing
  // signal. Product names routinely include words such as "workflow" or
  // "guide"; allowing those incidental terms to win would silently prevent
  // the only active Product/Solution recipe from reaching production writers.
  if (
    signals.campaignType === "product" ||
    signals.campaignType === "solution" ||
    signals.offerKind === "product" ||
    signals.offerKind === "solution"
  ) {
    return { recipeId: "product-solution", reasonCode: "route_explicit_product_solution" };
  }
  if (CUSTOMER_PROOF_PATTERN.test(text)) {
    return { recipeId: "customer-proof", reasonCode: "route_customer_proof_intent" };
  }
  if (signals.useCase === "content" || CONTENT_PATTERN.test(text)) {
    return { recipeId: "content-resource", reasonCode: "route_content_intent" };
  }
  if (WORKFLOW_PATTERN.test(text)) {
    return { recipeId: "use-case-workflow", reasonCode: "route_workflow_intent" };
  }
  if (
    CATEGORY_PATTERN.test(text) ||
    signals.offerKind === "industry" ||
    signals.campaignType === "demand"
  ) {
    return { recipeId: "problem-category", reasonCode: "route_category_education_intent" };
  }
  return { recipeId: "product-solution", reasonCode: "route_product_solution_default" };
}

export function selectPageRecipe(input: PageRecipeSelectionInput): PageRecipeSelection {
  const routed = routeRecipe(input.signals);
  const recipe = RECIPES[routed.recipeId];
  const reasonCodes = new Set<string>([routed.reasonCode, `recipe_${routed.recipeId}`]);

  const activatedRecipe = isActivatedRecipe(routed.recipeId);
  if (!activatedRecipe) reasonCodes.add("recipe_not_activated");

  const familyCompatible =
    !input.signals.strategicFamily ||
    recipe.compatibleStrategicFamilies.includes(input.signals.strategicFamily);
  if (!familyCompatible) reasonCodes.add("strategic_family_incompatible");

  const thesisValidation = validateThesisForRecipe(input.thesis, routed.recipeId);
  for (const issue of thesisValidation.issues) reasonCodes.add(issue);

  const eligible = activatedRecipe && familyCompatible && thesisValidation.valid;
  const planned = eligible ? sectionsForRecipe(recipe, input.thesis) : [];
  const [min, max] = recipe.sectionRange;
  // Unreachable while the contract validates, and load-bearing if it ever stops:
  // a page outside its own range must not reach the renderer.
  const inRange = planned.length >= min && planned.length <= max;
  if (eligible && !inRange) reasonCodes.add("section_count_out_of_range");

  const activated = eligible && inRange;
  const sections = activated ? planned : [];
  for (const section of sections) reasonCodes.add(`section_${section.slotId}`);

  const rejected: RejectedPageRecipe[] = PAGE_RECIPE_IDS.filter((id) => id !== routed.recipeId).map(
    (id) => ({
      recipeId: id,
      reasonCode: isActivatedRecipe(id) ? "route_signal_absent" : "route_signal_absent_and_inert"
    })
  );

  const selection: Omit<PageRecipeSelection, "digest"> = {
    schemaVersion: PAGE_RECIPE_SCHEMA_VERSION,
    recipeId: routed.recipeId,
    recipeVersion: recipe.version,
    thesisDigest: campaignThesisDigest(input.thesis),
    activated,
    sections,
    rejected,
    thesisValidation,
    reasonCodes: [...reasonCodes].sort(),
    visibility: "internal"
  };

  return {
    ...selection,
    digest: pageRecipeSelectionDigest(selection)
  };
}

/** Digest-safe projection: ids, order, and codes only. */
export function pageRecipeSelectionDigest(
  selection: Omit<PageRecipeSelection, "digest">
): string {
  return `rc_${compilerDigest("page-recipe-selection-v1", {
    schemaVersion: selection.schemaVersion,
    recipeId: selection.recipeId,
    recipeVersion: selection.recipeVersion,
    thesisDigest: selection.thesisDigest,
    activated: selection.activated,
    sections: selection.sections.map(({ slotId, order, role }) => `${order}:${slotId}:${role}`),
    reasonCodes: selection.reasonCodes,
    thesisValid: selection.thesisValidation.valid
  })}`;
}
