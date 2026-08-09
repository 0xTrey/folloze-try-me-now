import { expect, test, type Page } from "@playwright/test";

import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type {
  ExperienceDraft,
  PersuasionFramework,
} from "../../src/lib/generation/experience-schema";
import type { SessionAnswers, UseCase } from "../../src/lib/types";
import {
  deterministicSvg,
  experienceDraft,
  fixtureAssetOrigin,
  sellerBrand,
  targetBrand,
} from "./generated-experience-fixture";

async function fixtureAssets(page: Page): Promise<void> {
  await page.route(`${fixtureAssetOrigin}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: deterministicSvg,
    });
  });
}

const evidenceId = "seller.platform";

function imageBrief(
  purpose: string,
): PersuasionFramework["opening"]["imageBrief"] {
  return {
    purpose,
    assetType: "product-ui",
    source: "seller",
    caption: "Jitterbit Harmony platform",
    provenance: "Verified seller-owned product imagery",
  };
}

function frameworkDraft(useCase: Exclude<UseCase, "content">): ExperienceDraft {
  const persuasionFramework: PersuasionFramework = {
    strategy: {
      evidenceMap: [
        {
          id: evidenceId,
          kind: "seller-fact",
          claim:
            "Harmony connects applications, data, APIs, and workflows in one platform.",
          sourceUrl: sellerBrand.sourceUrl ?? null,
        },
        {
          id: "buyer.priority",
          kind: "visitor-input",
          claim:
            "The buying group wants a practical first integration priority.",
          sourceUrl: null,
        },
      ],
      messageSpine:
        "Help the buying group connect a concrete operating priority to a governed automation path.",
      selectedAngle: "differentiated-mechanism",
      angleRationale:
        "The mechanism makes the first useful decision specific and credible.",
    },
    opening: {
      eyebrow:
        useCase === "abm"
          ? "A focused case for Cisco"
          : "Introducing Jitterbit Harmony",
      headline: "Connect the work buyers care about without losing control.",
      body: "Give the buying group one clear route from an operating priority to a governed first workflow.",
      ctaLabel: "Choose where to start",
      evidenceIds: [evidenceId],
      imageBrief: imageBrief(
        "Show the seller platform in the context of the opening promise",
      ),
    },
    credibility: {
      eyebrow: "Why Jitterbit",
      headline:
        "One platform connects applications, data, APIs, and workflows.",
      fact: "Harmony combines integration, workflow automation, API management, and application development.",
      implication:
        "Teams can evaluate one operating model instead of stitching together isolated projects.",
      evidenceIds: [evidenceId],
      imageBrief: imageBrief(
        "Show the platform capability that supports the credibility claim",
      ),
    },
    urgency: {
      eyebrow: "Why this matters now",
      headline: "More disconnected automation creates more operating drag.",
      change:
        "Integration demand now spans more systems, teams, and AI-enabled workflows.",
      consequence:
        "Isolated projects make ownership, reuse, and governance harder to see.",
      reframe:
        "The better question is which first workflow can prove a shared operating model.",
      evidenceIds: [evidenceId, "buyer.priority"],
      imageBrief: imageBrief(
        "Visualize the shift from isolated workflows to a shared path",
      ),
    },
    startingPoints: {
      eyebrow: "Choose where to start",
      headline: "Start with the buyer job closest to the current priority.",
      intro:
        "Each path ends in a specific outcome and a question the buying group can validate.",
      choices: [
        "Connect systems",
        "Govern automation",
        "Prove a first workflow",
      ].map((label, index) => ({
        label,
        buyerJob: [
          "Connect applications and data around one operating priority.",
          "Keep ownership and policy visible as automation expands.",
          "Choose a cross-system workflow that can prove the operating model.",
        ][index]!,
        outcome: [
          "A shared map of the systems and teams involved.",
          "A visible model for ownership, reuse, and oversight.",
          "A bounded first use case with measurable evidence.",
        ][index]!,
        validationQuestion: [
          "Which systems must work together first?",
          "Where must ownership remain visible?",
          "Which workflow would make the case concrete?",
        ][index]!,
        evidenceIds: [evidenceId, "buyer.priority"],
        imageBrief: imageBrief(`Support the ${label.toLowerCase()} buyer path`),
      })) as PersuasionFramework["startingPoints"]["choices"],
    },
    mechanism: {
      eyebrow: "How the outcome is created",
      headline: "Move from priority to evidence in three practical steps.",
      intro:
        "Every step pairs an action with the capability and output the buyer can inspect.",
      steps: [
        {
          action: "Frame the priority",
          capability:
            "Map the applications, data, owners, and constraints involved.",
          output: "A shared definition of the first workflow.",
          evidenceIds: ["buyer.priority"],
        },
        {
          action: "Connect the path",
          capability:
            "Use reusable integrations and workflows inside one governed platform.",
          output: "A working cross-system path with ownership visible.",
          evidenceIds: [evidenceId],
        },
        {
          action: "Review the evidence",
          capability:
            "Inspect the result with the teams accountable for scale and control.",
          output: "A decision on whether and where to expand.",
          evidenceIds: [evidenceId, "buyer.priority"],
        },
      ],
      imageBrief: imageBrief(
        "Diagram the three-step path from priority to decision",
      ),
    },
    teamValue: {
      eyebrow: "What each team needs",
      headline: "Give each stakeholder a reason to believe the same plan.",
      intro:
        "The story changes by role while the operating decision stays shared.",
      roles: [
        "Application leaders",
        "Security and governance",
        "Business sponsors",
      ].map((role, index) => ({
        role,
        decision: [
          "Which integrations should become reusable capabilities?",
          "Where should policy and ownership stay visible?",
          "Which first workflow is worth funding and measuring?",
        ][index]!,
        risk: [
          "More one-off connections increase maintenance overhead.",
          "Expansion without visible controls creates avoidable exposure.",
          "A broad transformation promise delays useful evidence.",
        ][index]!,
        benefit: [
          "A clearer route to reuse across applications and teams.",
          "Governance that stays present as workflows expand.",
          "A bounded first move tied to an observable result.",
        ][index]!,
        evidenceNeeded: [
          "A working map of the systems, owners, and reusable components.",
          "Visible policy, access, and ownership checkpoints.",
          "A defined outcome, timeline, and review decision.",
        ][index]!,
        evidenceIds: [evidenceId, "buyer.priority"],
      })) as PersuasionFramework["teamValue"]["roles"],
    },
    nextStep: {
      eyebrow: "The first useful move",
      headline: "Map one workflow before committing to a wider program.",
      body: "Bring the right owners together around one priority, the systems involved, and the evidence needed for the next decision.",
      scope: "One cross-system workflow",
      activity: "A focused working session",
      deliverable: "A workflow and ownership map",
      resultingDecision: "Whether and where to run a bounded pilot",
      ctaLabel:
        useCase === "abm"
          ? "Map the first use case"
          : "Plan the launch conversation",
      evidenceIds: [evidenceId, "buyer.priority"],
      imageBrief: imageBrief(
        "Show the concrete output of the first working session",
      ),
    },
  };

  return {
    ...experienceDraft,
    campaignRegister: useCase === "abm" ? "one-to-one-abm" : "campaign-product",
    persuasionFramework,
  };
}

function generatedHtml(input: {
  useCase: UseCase;
  answers: SessionAnswers;
  withTarget?: boolean;
}): string {
  const selectedTarget = input.withTarget ? targetBrand : undefined;
  const draft =
    input.useCase === "content"
      ? experienceDraft
      : frameworkDraft(input.useCase);
  return renderExperienceHtml({
    draft,
    brand: sellerBrand,
    targetBrand: selectedTarget,
    useCase: input.useCase,
    answers: input.answers,
  });
}

const expectedOrder = [
  "experience-overview",
  "credibility-anchor",
  "why-change-now",
  "starting-points",
  "outcome-mechanism",
  "team-value",
  "next-step",
];

for (const scenario of [
  {
    name: "account",
    useCase: "abm" as const,
    withTarget: true,
    answers: {
      targetDomain: "cisco.com",
      audience: "Infrastructure, security, and application leaders",
      objective: "Book a working session",
    },
  },
  {
    name: "campaign",
    useCase: "campaign" as const,
    withTarget: false,
    answers: {
      campaignType: "product" as const,
      promotedOffer: "Jitterbit Harmony",
      audience: "Integration and automation leaders",
      objective: "Launch or announce",
    },
  },
]) {
  test(`${scenario.name} renders the seven buyer jobs as one desktop experience`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await fixtureAssets(page);
    await page.setContent(generatedHtml(scenario), {
      waitUntil: "domcontentloaded",
    });

    const order = await page
      .locator("[data-journey-section]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-journey-section")),
      );
    expect(order).toEqual(expectedOrder);
    await expect(page.locator("body")).toHaveClass(/framework-seven/);
    await expect(page.locator("[data-fallback-kind]")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(page.locator(".role-grid article")).toHaveCount(3);
    await expect(page.locator(".mechanism-steps article")).toHaveCount(3);

    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      root: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(layout.root).toBeLessThanOrEqual(layout.viewport);
    expect(layout.body).toBeLessThanOrEqual(layout.viewport);

    const firstNav = page.locator(".journey-links button").first();
    const [railBox, firstBox] = await Promise.all([
      page.locator(".journey-links").boundingBox(),
      firstNav.boundingBox(),
    ]);
    expect(railBox).not.toBeNull();
    expect(firstBox).not.toBeNull();
    expect(firstBox!.x).toBeGreaterThanOrEqual(railBox!.x - 1);

    await page.locator('.journey-links button[data-scroll-target="team-value"]').click();
    await expect
      .poll(() =>
        page
          .locator("#team-value")
          .evaluate((node) => Math.round(node.getBoundingClientRect().top)),
      )
      .toBeLessThan(170);

    const buyerCopy = await page.locator("main").innerText();
    expect(buyerCopy).not.toMatch(
      /account thesis|decision paths?|supporting proof|the visitor|public operating context|form field/i,
    );
  });
}

test("content keeps its existing source-companion contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixtureAssets(page);
  await page.setContent(
    generatedHtml({
      useCase: "content",
      answers: {
        sourceName: "The governed automation field guide.pdf",
        sourceUrl: "https://example.com/governed-automation-guide",
        audience: "Application leaders",
        objective: "Educate buyers",
      },
    }),
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.locator("body")).not.toHaveClass(/framework-seven/);
  await expect(page.locator(".signature-canonical")).toBeVisible();
  await expect(page.locator("#experience-thesis")).toBeVisible();
  await expect(page.locator("#supporting-resources")).toBeVisible();
  await expect(page.locator("#credibility-anchor")).toHaveCount(0);
});
