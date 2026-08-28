import { describe, expect, it } from "vitest";

import { compileCampaignThesis } from "@/lib/generation/campaign-thesis";
import type {
  CampaignThesis,
  ThesisEvidenceClaim,
  ThesisFieldProposal,
  ThesisFieldRole
} from "@/lib/generation/campaign-thesis";
import {
  ACTIVATED_RECIPES,
  PAGE_RECIPE_IDS,
  allPageRecipes,
  isActivatedRecipe,
  pageRecipe,
  productSolutionSectionPlan,
  selectPageRecipe,
  thesisRequirementForRecipe,
  validatePageRecipeContract,
  validateThesisForRecipe
} from "@/lib/generation/page-recipes";
import type { PageRecipeId, RecipeRoutingSignals } from "@/lib/generation/page-recipes";
import { defaultSectionPlanV2, selectThreeFamilyDecision } from "@/lib/generation/three-family-contract";

const ALL_USES = ["hero", "credibility", "urgency", "choice", "mechanism", "team", "cta"] as const;

interface SellerFixture {
  name: string;
  seller: string;
  offer: string;
  audience: string;
  audienceJob: string;
  currentState: string;
  desiredOutcome: string;
  promise: string;
  mechanism: string;
  proof: string;
  objection: string;
  nextAction: string;
}

const SELLERS: readonly SellerFixture[] = [
  {
    name: "cold chain",
    seller: "Cryolane",
    offer: "Lane Assurance",
    audience: "Cold-chain lane planners",
    audienceJob: "Hold every validated pharma lane inside its temperature window.",
    currentState: "Excursions surface after the pallet lands rather than while it moves.",
    desiredOutcome: "Catch a drifting reefer before the pallet warms.",
    promise: "Lane Assurance keeps each validated lane inside its window dock to dock.",
    mechanism:
      "Lane Assurance reads reefer telemetry at each segment and reroutes through the nearest validated cross-dock.",
    proof: "Twelve of forty pharma lanes recorded excursions above eight degrees.",
    objection: "Retrofitting telemetry onto leased reefers.",
    nextAction: "Book a lane audit for the two highest-excursion lanes."
  },
  {
    name: "reconciliation",
    seller: "Meridian Ledger",
    offer: "Close Reconciler",
    audience: "Controllers at multi-entity finance teams",
    audienceJob: "Close the books across seven entities without a manual tie-out week.",
    currentState: "Intercompany balances are tied out by hand in the final three days.",
    desiredOutcome: "Finish the close without a weekend tie-out.",
    promise: "Close Reconciler clears intercompany balances before the final review window.",
    mechanism:
      "Close Reconciler matches subledger journals against bank settlement files nightly and escalates only unmatched entries.",
    proof: "Published documentation covers seven entity structures and four settlement formats.",
    objection: "Whether an auditor accepts an automated match trail.",
    nextAction: "Book a close review with the controller who owns intercompany."
  },
  {
    name: "field service",
    seller: "Talloak",
    offer: "Route Commit",
    audience: "Dispatch supervisors at utility contractors",
    audienceJob: "Commit next-day crew routes that survive a morning emergency callout.",
    currentState: "One emergency callout invalidates the whole next-day route sheet.",
    desiredOutcome: "Keep committed routes intact when an emergency lands.",
    promise: "Route Commit holds the committed crew plan when an emergency callout lands.",
    mechanism:
      "Route Commit reserves float capacity per depot and reassigns only the crews within the callout radius.",
    proof: "Documentation describes depot float reservation and callout radius rules.",
    objection: "Whether union scheduling rules permit automated reassignment.",
    nextAction: "Book a dispatch walkthrough for one depot region."
  }
];

function claim(id: string, text: string, overrides: Partial<ThesisEvidenceClaim> = {}): ThesisEvidenceClaim {
  return {
    id,
    claim: text,
    status: "fact",
    confidence: "high",
    allowedUses: [...ALL_USES],
    prohibitedUses: [],
    buyerFacing: true,
    ...overrides
  };
}

function thesisFor(
  fixture: SellerFixture,
  overrides: Partial<Record<ThesisFieldRole, ThesisFieldProposal>> = {}
): CampaignThesis {
  const proposals: Partial<Record<ThesisFieldRole, ThesisFieldProposal>> = {
    seller: { value: fixture.seller, claimIds: ["ev-seller"] },
    offer: { value: fixture.offer, claimIds: ["ev-offer"] },
    audience: { value: fixture.audience, claimIds: ["ev-audience"] },
    audienceJob: { value: fixture.audienceJob, claimIds: ["ev-audience"] },
    currentState: { value: fixture.currentState, claimIds: ["ev-constraint"] },
    desiredOutcome: { value: fixture.desiredOutcome, claimIds: ["ev-offer"] },
    promise: { value: fixture.promise, claimIds: ["ev-offer", "ev-positioning"] },
    mechanism: { value: fixture.mechanism, claimIds: ["ev-positioning"] },
    proof: { value: fixture.proof, claimIds: ["ev-proof"] },
    objection: { value: fixture.objection, claimIds: ["ev-positioning"] },
    nextAction: { value: fixture.nextAction, claimIds: ["ev-cta"] },
    ...overrides
  };
  return compileCampaignThesis({
    revision: 12,
    evidence: {
      revision: 12,
      entities: [{ id: "en-seller", kind: "seller", canonicalName: fixture.seller }],
      claims: [
        claim("ev-seller", `${fixture.seller} publishes its own product documentation.`),
        claim("ev-offer", `${fixture.seller} documents ${fixture.offer}.`),
        claim("ev-audience", fixture.audienceJob, { status: "inference", confidence: "medium" }),
        claim("ev-constraint", fixture.currentState),
        claim("ev-positioning", fixture.mechanism, { status: "inference", confidence: "high" }),
        claim("ev-proof", fixture.proof),
        claim("ev-cta", fixture.nextAction, { status: "inference", confidence: "medium" })
      ]
    },
    proposals
  }).thesis;
}

const productSignals: RecipeRoutingSignals = {
  useCase: "campaign",
  campaignType: "product",
  offerKind: "product",
  intent: "Promote the product to the buying team",
  objective: "Book a working review",
  strategicFamily: "launch"
};

describe("page recipe contracts", () => {
  it("defines all six recipes and validates each against the schema", () => {
    expect(allPageRecipes().map(({ id }) => id)).toEqual([...PAGE_RECIPE_IDS]);
    for (const recipe of allPageRecipes()) {
      expect(validatePageRecipeContract(recipe)).toEqual([]);
    }
  });

  it("activates only Product/Solution", () => {
    expect([...ACTIVATED_RECIPES]).toEqual(["product-solution"]);
    for (const id of PAGE_RECIPE_IDS) {
      expect(isActivatedRecipe(id)).toBe(id === "product-solution");
    }
  });

  it("keeps the strategic family separate from the recipe", () => {
    for (const recipe of allPageRecipes()) {
      expect(recipe.compatibleStrategicFamilies.length).toBeGreaterThan(0);
      for (const family of recipe.compatibleStrategicFamilies) {
        expect(["launch", "guide", "align"]).toContain(family);
      }
      expect(recipe).not.toHaveProperty("strategicFamily");
    }
  });

  it("reports contract problems rather than silently repairing them", () => {
    const recipe = pageRecipe("product-solution");
    const broken = {
      ...recipe,
      version: "ProductSolution1",
      sectionRange: [7, 4] as const,
      progression: [recipe.progression[0]!, recipe.progression[0]!]
    };

    expect(validatePageRecipeContract(broken)).toEqual([
      "duplicate_section_role",
      "duplicate_section_slot_id",
      "duplicate_semantic_job",
      "invalid_recipe_version",
      "invalid_section_range",
      "missing_next_action_section",
      "progression_shorter_than_max_sections",
      "required_thesis_field_unused"
    ]);
  });

  it("derives the thesis requirement from the recipe", () => {
    expect(thesisRequirementForRecipe("product-solution")).toEqual({
      requiredFields: [
        "seller",
        "offer",
        "audience",
        "audienceJob",
        "promise",
        "mechanism",
        "nextAction"
      ],
      proofPolicy: "evidence-or-validation-question"
    });
    expect(thesisRequirementForRecipe("customer-proof").proofPolicy).toBe("evidence-required");
  });
});

describe("selectPageRecipe", () => {
  it("routes three materially different sellers to an activated Product/Solution recipe", () => {
    for (const fixture of SELLERS) {
      const selection = selectPageRecipe({ thesis: thesisFor(fixture), signals: productSignals });

      expect(selection.recipeId).toBe("product-solution");
      expect(selection.activated).toBe(true);
      expect(selection.thesisValidation.valid).toBe(true);
      expect(selection.reasonCodes).toContain("route_explicit_product_solution");
      expect(selection.sections.length).toBeGreaterThanOrEqual(4);
      expect(selection.sections.length).toBeLessThanOrEqual(7);
      expect(selection.rejected.map(({ recipeId }) => recipeId).sort()).toEqual(
        PAGE_RECIPE_IDS.filter((id) => id !== "product-solution").sort()
      );
    }

    const digests = SELLERS.map(
      (fixture) => selectPageRecipe({ thesis: thesisFor(fixture), signals: productSignals }).digest
    );
    expect(new Set(digests).size).toBe(SELLERS.length);
  });

  it("keeps ordinary product wording on the activated recipe", () => {
    const thesis = thesisFor(SELLERS[1]!);
    const ordinary: readonly string[] = [
      "Promote the close process automation product",
      "Book a working session with the controller",
      "Solve the intercompany tie-out problem"
    ];

    for (const intent of ordinary) {
      const selection = selectPageRecipe({ thesis, signals: { ...productSignals, intent } });
      expect(selection.recipeId).toBe("product-solution");
      expect(selection.activated).toBe(true);
    }
  });

  it("is deterministic for identical inputs", () => {
    const thesis = thesisFor(SELLERS[0]!);
    const first = selectPageRecipe({ thesis, signals: productSignals });
    const second = selectPageRecipe({ thesis, signals: productSignals });

    expect(second).toEqual(first);
    expect(second.digest).toBe(first.digest);
  });

  it("follows the argument instead of padding to a section quota", () => {
    const fixture = SELLERS[0]!;
    const full = selectPageRecipe({ thesis: thesisFor(fixture), signals: productSignals });
    expect(full.sections).toHaveLength(7);

    const thin = selectPageRecipe({
      thesis: thesisFor(fixture, {
        currentState: { claimIds: [] },
        objection: { claimIds: [] }
      }),
      signals: productSignals
    });

    expect(thin.sections).toHaveLength(6);
    expect(thin.sections.map(({ slotId }) => slotId)).toEqual([
      "recognize-buyer-outcome",
      "name-constraint",
      "distinct-mechanism",
      "relevant-use-cases",
      "proof-or-validation",
      "next-action"
    ]);
    expect(thin.sections.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("declines when a required thesis field does not resolve", () => {
    const fixture = SELLERS[1]!;
    const selection = selectPageRecipe({
      thesis: thesisFor(fixture, {
        currentState: { claimIds: [] },
        objection: { claimIds: [] },
        audienceJob: { value: fixture.audienceJob, claimIds: ["ev-audience-internal"] }
      }),
      signals: productSignals
    });

    // The buyer job is required, so an unsupported one fails the recipe outright
    // rather than shipping a page with three sections.
    expect(selection.activated).toBe(false);
    expect(selection.sections).toEqual([]);
    expect(selection.reasonCodes).toContain("missing_required_thesis_field_audienceJob");
  });

  it("declines to activate when the decided strategic family is incompatible", () => {
    const selection = selectPageRecipe({
      thesis: thesisFor(SELLERS[0]!),
      signals: { ...productSignals, strategicFamily: "align" }
    });

    expect(selection.recipeId).toBe("product-solution");
    expect(selection.activated).toBe(false);
    expect(selection.sections).toEqual([]);
    expect(selection.reasonCodes).toContain("strategic_family_incompatible");
  });

  it("declines to activate when the thesis does not satisfy the recipe", () => {
    const selection = selectPageRecipe({
      thesis: thesisFor(SELLERS[2]!, { mechanism: { claimIds: [] } }),
      signals: productSignals
    });

    expect(selection.activated).toBe(false);
    expect(selection.sections).toEqual([]);
    expect(selection.thesisValidation.issues).toContain("missing_required_thesis_field_mechanism");
  });
});

describe("inert recipes", () => {
  const inertRoutes: ReadonlyArray<{ signals: RecipeRoutingSignals; recipeId: PageRecipeId }> = [
    {
      signals: { useCase: "campaign", campaignType: "event", intent: "Register for the webinar" },
      recipeId: "event-webinar"
    },
    {
      signals: { useCase: "campaign", intent: "Publish the customer story for the segment" },
      recipeId: "customer-proof"
    },
    { signals: { useCase: "content", intent: "Promote the benchmark report" }, recipeId: "content-resource" },
    {
      signals: { useCase: "campaign", intent: "Show the reconciliation workflow" },
      recipeId: "use-case-workflow"
    },
    {
      signals: { useCase: "campaign", intent: "Explain the category shift" },
      recipeId: "problem-category"
    }
  ];

  it("routes each non-activated recipe without producing any sections", () => {
    for (const { signals, recipeId } of inertRoutes) {
      const selection = selectPageRecipe({ thesis: thesisFor(SELLERS[0]!), signals });

      expect(selection.recipeId).toBe(recipeId);
      expect(selection.activated).toBe(false);
      expect(selection.sections).toEqual([]);
      expect(selection.reasonCodes).toContain("recipe_not_activated");
    }
  });

  it("leaves the existing three-family routing untouched for those inputs", () => {
    const decision = selectThreeFamilyDecision({
      sessionId: "session-inert",
      revision: 3,
      useCase: "content",
      intent: "Promote the benchmark report"
    });

    expect(decision.family).toBe("guide");
    expect(decision.reasonCode).toBe("v2-education-evaluation-guide");
    expect(decision.sectionPlan).toEqual(defaultSectionPlanV2("guide"));
  });

  it("validates an inert recipe's thesis requirement without activating it", () => {
    const thesis = thesisFor(SELLERS[0]!);

    expect(validateThesisForRecipe(thesis, "customer-proof").valid).toBe(true);
    expect(
      selectPageRecipe({
        thesis,
        signals: { useCase: "campaign", intent: "Publish the customer story" }
      }).activated
    ).toBe(false);
  });
});

describe("productSolutionSectionPlan", () => {
  it("assigns one distinct semantic job and buyer movement per section", () => {
    const sections = productSolutionSectionPlan(thesisFor(SELLERS[0]!));
    const jobs = sections.map(({ semanticJob }) => semanticJob);
    const movements = sections.map(({ buyerMovement }) => buyerMovement);

    expect(new Set(jobs).size).toBe(sections.length);
    expect(new Set(movements).size).toBe(sections.length);
    expect(sections[0]!.slotId).toBe("recognize-buyer-outcome");
    expect(sections[sections.length - 1]!.slotId).toBe("next-action");
  });
});
