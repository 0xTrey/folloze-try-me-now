import { describe, expect, it } from "vitest";

import type { PublicBrandProfile, PublicTryMeSession, StageStatus, UseCase } from "@/lib/types";
import {
  buildMoments,
  audienceRecommendationCopy,
  campaignIntakeComplete,
  canSkipStreamingCampaign,
  ctaValueForSession,
  defaultPersonalizationVariantFor,
  describePreviewAnalyticsEvent,
  entryPathOptions,
  northpeakWorkedStates,
  getAssemblyPreviewKey,
  getBuildPanelCopy,
  getGuidedQuestionCopy,
  getRevealCopy,
  getRevealShellHeadline,
  isCampaignOfferSourceUrl,
  liveBriefFilledCount,
  objectiveContextPrompt,
  overviewRowsFor,
  personalizationVariantOptionsFor,
  preservePreviewDuringRegeneration,
  previewBoundaryScrollDelta,
  recommendedObjectiveFor,
  shouldAutoConfirmSource,
  streamingCampaignPatchForIntent,
  streamingCampaignQuestions,
  streamingCampaignSkipPatch
} from "./try-me-now-app";

function brand(domain: string, companyName: string): PublicBrandProfile {
  return {
    domain,
    companyName,
    colors: ["#10243e", "#ff5c35"],
    primaryColor: "#10243e",
    accentColor: "#ff5c35",
    surfaceColor: "#ffffff",
    source: "brand-harvester"
  };
}

function session(
  useCase: UseCase,
  overrides: Partial<PublicTryMeSession> = {},
  stageStatuses: Partial<Record<"brand" | "audience" | "story", StageStatus>> = {}
): PublicTryMeSession {
  return {
    id: "session-1",
    supportRef: "TMN-TESTSESSION1",
    useCase,
    companyDomain: "jitterbit.com",
    status: "collecting",
    createdAt: "2026-07-30T20:00:00.000Z",
    updatedAt: "2026-07-30T20:00:00.000Z",
    temporaryUrl: "https://example.test/e/session-1",
    revision: 1,
    stages: {
      brand: { status: stageStatuses.brand ?? "complete" },
      audience: { status: stageStatuses.audience ?? "pending" },
      story: { status: stageStatuses.story ?? "pending" }
    },
    answers: {},
    brand: brand("jitterbit.com", "Jitterbit"),
    audienceSuggestions: [],
    ...overrides
  };
}

describe("Try Me Now experience copy", () => {
  it("preselects a contextual objective without submitting it", () => {
    expect(recommendedObjectiveFor(session("abm"))).toBe("Accelerate an opportunity");
    expect(recommendedObjectiveFor(session("campaign", { answers: { campaignType: "product" } }))).toBe("Launch or announce");
    expect(recommendedObjectiveFor(session("campaign", { answers: { campaignType: "event" } }))).toBe("Drive registrations");
    expect(recommendedObjectiveFor(session("campaign", { answers: { campaignType: "demand" } }))).toBe("Generate demand");
    expect(recommendedObjectiveFor(session("content"))).toBe("Increase content engagement");
  });

  it("auto-confirms only after source intelligence has grounded the submitted content", () => {
    expect(shouldAutoConfirmSource(session("content", { answers: { sourceUrl: "https://jitterbit.com/report" } }))).toBe(false);
    const sourceInsight: NonNullable<PublicTryMeSession["sourceInsight"]> = {
      status: "ready",
      confidence: "high",
      title: "Integration Report",
      premise: "A cited report about integration operations.",
      topics: ["integration"],
      claims: [],
      extraction: {
        method: "html-static",
        status: "complete",
        ocrStatus: "not-required",
        warnings: []
      },
      experiencePattern: "guided-brief",
      moduleKinds: ["hero"],
      assetCount: 0,
      citationCount: 2
    };
    expect(shouldAutoConfirmSource(session("content", {
      answers: { sourceUrl: "https://jitterbit.com/report" },
      sourceInsight
    }))).toBe(true);
    expect(shouldAutoConfirmSource(session("content", {
      answers: { sourceUrl: "https://jitterbit.com/report" },
      sourceInsight,
      sourceConfirmation: { status: "confirmed" }
    }))).toBe(false);
  });

  it("routes each watch-example action to a verified public Folloze board", () => {
    expect(entryPathOptions.abm).toMatchObject({
      title: "Build a 1:1 account experience",
      actionLabel: "Build a 1:1 account experience",
      exampleLabel: "See a Northpeak account experience",
      exampleUrl: "https://experience.folloze.com/northpeak--folloze",
      previewImage: "/entry/abm-preview.webp",
      previewAlt: "Northpeak account experience tailored for a named buyer account"
    });
    expect(entryPathOptions.campaign).toMatchObject({
      title: "Launch a campaign landing page",
      actionLabel: "Launch a campaign landing page",
      exampleLabel: "See a Northpeak personalized campaign",
      exampleUrl: "https://engage.folloze.com/120367",
      previewAlt: "Northpeak-branded personalized campaign landing page"
    });
    expect(entryPathOptions.content).toMatchObject({
      eyebrow: "Content Magic",
      title: "Make content interactive",
      actionLabel: "Make content interactive",
      exampleLabel: "See a Northpeak Content Magic example",
      exampleUrl: "https://engage.folloze.com/120367",
      previewImage: "/entry/content-preview.webp"
    });
    expect(JSON.stringify(entryPathOptions)).not.toMatch(/Aprio|ServiceNow|Cisco|aprio-for-georgia-pacific|servicenow-ai-platform|cisco-hmf/i);
  });

  it("exposes optional Northpeak worked states without making them the primary entry", () => {
    expect(northpeakWorkedStates).toEqual([
      {
        id: "account",
        label: "See a Northpeak account experience",
        href: "https://experience.folloze.com/northpeak--folloze"
      },
      {
        id: "campaign",
        label: "See a Northpeak personalized campaign",
        href: "https://engage.folloze.com/120367"
      }
    ]);
  });

  it("turns one event sentence into the existing event campaign contract", () => {
    const patch = streamingCampaignPatchForIntent(
      "Promote our September 18 AI Buyer Journey webinar for enterprise marketing leaders.",
      "event"
    );
    expect(patch).toMatchObject({
      campaignType: "event",
      promotedOffer: "September 18 AI Buyer Journey webinar",
      eventSource: "September 18 AI Buyer Journey webinar",
      ctaType: "register"
    });
    expect(patch.objective).toBeUndefined();
  });

  it("accepts a public product URL as the whole first campaign answer", () => {
    const patch = streamingCampaignPatchForIntent("https://example.com/ai-control-tower", "campaign");
    expect(patch).toMatchObject({
      campaignType: "product",
      promotedOffer: "AI Control Tower",
      offerSourceUrl: "https://example.com/ai-control-tower",
      offerSourceConfirmed: true
    });
    expect(patch.objective).toBeUndefined();
  });

  it("asks a goal after offer and audience instead of committing an inferred objective", () => {
    const questions = streamingCampaignQuestions(
      "campaign",
      ["Enterprise architects", "Operations leaders", "Executive sponsors"],
      ["Launch or announce", "Generate demand", "Book meetings"],
      ["AI Control Tower", "Operations platform", "Product overview"],
      {
        offer: "AI Control Tower",
        audience: "Enterprise architects",
        objective: "Launch or announce"
      }
    );
    expect(questions.map((question) => question.id)).toEqual(["intent", "audience", "goal"]);
    expect(questions.every((question) => question.choices)).toBe(true);
    expect(questions.every((question) => question.choices?.length === 3)).toBe(true);
    expect(questions.map((question) => question.recommendedChoice)).toEqual([
      "AI Control Tower",
      "Enterprise architects",
      "Launch or announce"
    ]);
    expect(questions[2]?.choices).toContain("Launch or announce");
  });

  it("fills inferred Live Brief rows instead of leaving them waiting", () => {
    const rows = overviewRowsFor(session("campaign", {
      answers: { campaignType: "product", promotedOffer: "Harmony" },
      audienceSuggestions: ["Data and AI platform leaders"]
    }));
    expect(rows.find((row) => row.key === "offer")?.value).toBe("Harmony");
    expect(rows.find((row) => row.key === "audience")?.value).toBe("Data and AI platform leaders");
    expect(rows.find((row) => row.key === "audience")?.provenance).toBe("inferred");
    expect(rows.find((row) => row.key === "objective")?.value).toBe("Launch or announce");
    expect(rows.find((row) => row.key === "objective")?.provenance).toBe("inferred");
    expect(rows.find((row) => row.key === "experienceType")?.value).toBe("Product campaign");
    expect(rows.some((row) => !row.value && row.key !== "offer")).toBe(false);
  });

  it("lets the visitor skip to preview once three signals include a named offer", () => {
    expect(canSkipStreamingCampaign(session("campaign"))).toBe(false);
    expect(liveBriefFilledCount(session("campaign"))).toBeGreaterThanOrEqual(2);
    const readyToSkip = session("campaign", {
      answers: { campaignType: "product", promotedOffer: "Harmony" },
      audienceSuggestions: ["Enterprise architects"]
    });
    expect(canSkipStreamingCampaign(readyToSkip)).toBe(true);
    expect(streamingCampaignSkipPatch(readyToSkip, "campaign")).toMatchObject({
      audience: "Enterprise architects",
      objective: "Launch or announce"
    });
  });

  it("keeps the campaign intake open until the campaign shape and named offer are available", () => {
    expect(campaignIntakeComplete(session("campaign"))).toBe(false);
    expect(campaignIntakeComplete(session("campaign", {
      answers: { campaignType: "product" }
    }))).toBe(false);
    expect(campaignIntakeComplete(session("campaign", {
      answers: { campaignType: "product", promotedOffer: "Ford Pro Intelligence" }
    }))).toBe(true);
    expect(campaignIntakeComplete(session("campaign", {
      answers: { campaignType: "product" },
      campaignOfferSource: {
        sourceHost: "fordpro.com",
        status: "unconfirmed"
      }
    }))).toBe(false);
    expect(campaignIntakeComplete(session("campaign", {
      answers: { campaignType: "product", promotedOfferConfirmed: true },
      campaignOfferSource: {
        title: "Ford Pro Intelligence",
        sourceHost: "fordpro.com",
        status: "unconfirmed",
        intelligenceStatus: "ready"
      }
    }))).toBe(true);
    expect(campaignIntakeComplete(session("campaign", {
      answers: { campaignType: "event", promotedOffer: "Enterprise Automation Summit" }
    }))).toBe(false);
    expect(campaignIntakeComplete(session("campaign", {
      answers: {
        campaignType: "event",
        promotedOffer: "Enterprise Automation Summit",
        eventSource: "September 12 live webinar"
      }
    }))).toBe(true);
  });

  it("accepts only a clean public-looking HTTPS offer URL in the campaign UI", () => {
    expect(isCampaignOfferSourceUrl("https://6sense.com/platform/revvyai/")).toBe(true);
    expect(isCampaignOfferSourceUrl("http://6sense.com/platform/revvyai/")).toBe(false);
    expect(isCampaignOfferSourceUrl("https://user:secret@6sense.com/platform/revvyai/")).toBe(false);
    expect(isCampaignOfferSourceUrl("https://localhost/product")).toBe(false);
    expect(isCampaignOfferSourceUrl("not a URL")).toBe(false);
  });

  it("asks one objective-dependent question without adding another mandatory setup stage", () => {
    expect(objectiveContextPrompt("Launch or announce", "Ford Pro Intelligence").label).toContain(
      "Ford Pro Intelligence"
    );
    expect(objectiveContextPrompt("Drive registrations", "Enterprise Automation Summit").label).toMatch(
      /attendees/i
    );
    expect(objectiveContextPrompt("Book meetings").label).toMatch(/conversation/i);
  });

  it("never presents an unsupported audience hypothesis as evidence-backed", () => {
    const recommendation = {
      id: "audience-1",
      label: "Fleet operations leaders",
      rationale: "A useful role hypothesis.",
      evidenceItemIds: [],
      confidence: "hypothesis" as const,
      source: "seller-category-fallback" as const
    };
    expect(audienceRecommendationCopy({
      recommendation,
      evidenceCount: 0,
      companyName: "Ford",
      offer: "Ford Pro Intelligence",
      isPrimary: true
    })).toMatch(/Suggested starting point.*no supporting public signal/i);
    expect(audienceRecommendationCopy({
      recommendation: {
        ...recommendation,
        source: "seller-public-evidence",
        confidence: "medium",
        evidenceItemIds: ["evidence-1"]
      },
      evidenceCount: 1,
      companyName: "Ford",
      offer: "Ford Pro Intelligence",
      isPrimary: true
    })).toMatch(/Best-supported fit/i);
  });

  it("uses the generated ABM headline and names the seller, account, buyer, and objective", () => {
    const result = getRevealCopy(session("abm", {
      status: "preview_ready_unclaimed",
      answers: {
        targetDomain: "cisco.com",
        audience: "Enterprise architecture leaders",
        objective: "Accelerate an opportunity"
      },
      targetBrand: brand("cisco.com", "Cisco"),
      experience: {
        ready: true,
        title: "Jitterbit for Cisco",
        headline: "Connect Cisco's next operating model without adding another maze.",
        generationSource: "openai",
        artifactRevision: 1
      }
    }));

    expect(result.headline).toBe("Connect Cisco's next operating model without adding another maze.");
    expect(result.kicker).toContain("Jitterbit × Cisco");
    expect(result.summary).toContain("enterprise architecture leaders");
    expect(result.summary).toContain("accelerate an opportunity");
    expect(result.receipts.map(({ label }) => label).join(" ")).toMatch(/Jitterbit.*Cisco/);
  });

  it("makes a content reveal specific to the actual source", () => {
    const result = getRevealCopy(session("content", {
      answers: {
        sourceName: "2026 Integration Benchmark.pdf",
        audience: "Automation platform owners",
        objective: "Increase content engagement"
      }
    }));

    expect(result.kicker).toContain("2026 Integration Benchmark");
    expect(result.headline).toContain("2026 Integration Benchmark");
    expect(result.summary).toContain("automation platform owners");
    expect(result.summary).toContain("increase content engagement");
  });

  it("uses the extracted document title instead of the private PDF filename", () => {
    const result = getRevealCopy(session("content", {
      answers: {
        sourceName: "ebk-now-platform-reference-guide.pdf",
        sourceTitle: "Now Platform Reference Guide",
        audience: "Data and AI platform leaders",
        objective: "Increase content engagement"
      }
    }));

    expect(result.kicker).toContain("Now Platform Reference Guide");
    expect(result.headline).toContain("Now Platform Reference Guide");
    expect(JSON.stringify(result)).not.toContain("ebk-now-platform-reference-guide");
  });

  it("keeps the campaign reveal private and avoids brand-name word collisions", () => {
    const campaign = session("campaign", {
      companyDomain: "servicenow.com",
      brand: brand("servicenow.com", "ServiceNow"),
      answers: {
        campaignType: "product",
        audience: "Data and AI platform leaders",
        objective: "Generate demand",
        ctaType: "explore",
        ctaStyle: "solid"
      }
    });

    expect(getRevealShellHeadline(campaign)).toBe(
      "Your ServiceNow product campaign is ready to explore."
    );
    expect(getRevealCopy(campaign).summary).toBe(
      "A private product campaign preview for data and AI platform leaders, built to generate demand."
    );
  });

  it("keeps the CTA editor aligned with the generated product campaign action", () => {
    const campaign = session("campaign", {
      answers: {
        campaignType: "product",
        audience: "Data and AI platform leaders",
        objective: "Generate demand",
        ctaType: "explore",
        ctaStyle: "solid"
      }
    });

    expect(ctaValueForSession(campaign)).toEqual({
      type: "content",
      label: "Explore the first use case",
      style: "solid"
    });
  });

  it("changes the live-build promise with the actual session state", () => {
    const harvesting = getBuildPanelCopy(session("abm", {}, { brand: "running" }));
    expect(harvesting.headline).toBe("Reading Jitterbit while you keep moving.");

    const needsAccount = getBuildPanelCopy(session("abm"));
    expect(needsAccount.headline).toContain("name the account");

    const targetHarvest = getBuildPanelCopy(session("abm", {
      answers: { targetDomain: "cisco.com" }
    }));
    expect(targetHarvest.headline).toBe("Reading Cisco against Jitterbit.");

    const needsObjective = getBuildPanelCopy(session("abm", {
      answers: { targetDomain: "cisco.com", audience: "CIO transformation leaders" },
      targetBrand: brand("cisco.com", "Cisco")
    }, { audience: "complete" }));
    expect(needsObjective.headline).toBe("The buyer is set. Give the experience one job.");

    const needsOffer = getBuildPanelCopy(session("campaign", {
      answers: { campaignType: "product" }
    }));
    expect(needsOffer.headline).toBe("The campaign shape is ready. Name the offer.");
  });

  it("never presents incomplete brand evidence as ready", () => {
    const incomplete = session("campaign", {
      brand: {
        ...brand("jitterbit.com", "Jitterbit"),
        readiness: {
          status: "incomplete",
          identityReady: true,
          logoReady: false,
          paletteReady: false,
          designReady: false,
          sourceEvidenceReady: true,
          reasons: ["No verified logo was captured.", "The palette is still provisional."]
        }
      }
    }, { brand: "fallback" });

    const brandMoment = buildMoments(incomplete)[0];
    expect(brandMoment.title).toBe("Brand evidence needs review");
    expect(brandMoment.detail).toContain("No verified logo was captured.");
    expect(brandMoment.artifact).toBe("Jitterbit · logo, palette needs review");
    expect(brandMoment.title).not.toMatch(/ready/i);
  });

  it("asks account- and source-specific guided questions", () => {
    const abm = getGuidedQuestionCopy(session("abm", {
      answers: { targetDomain: "cisco.com" },
      targetBrand: brand("cisco.com", "Cisco")
    }));
    expect(abm.audienceTitle).toContain("Cisco");
    expect(abm.audienceBody).toContain("Jitterbit");

    const content = getGuidedQuestionCopy(session("content", {
      answers: { sourceName: "API Transformation Playbook.pdf" }
    }));
    expect(content.audienceTitle).toContain("API Transformation Playbook");
    expect(content.objectiveTitle).toContain("API Transformation Playbook");

    const campaign = getGuidedQuestionCopy(session("campaign", {
      answers: { campaignType: "product", promotedOffer: "Ford Pro Intelligence" }
    }));
    expect(campaign.audienceTitle).toContain("Ford Pro Intelligence");
    expect(campaign.objectiveTitle).toContain("Ford Pro Intelligence");
  });

  // Regression: QA ISSUE-001. Analytics writes increment the session revision,
  // but they must not remount the generated preview and emit another section view.
  it("keeps the preview mounted across analytics-only session revisions", () => {
    const initial = session("campaign", {
      revision: 4,
      experience: {
        ready: true,
        title: "Campaign",
        headline: "A campaign headline",
        generationSource: "openai",
        artifactRevision: 2
      }
    });
    const analyticsUpdate = { ...initial, revision: 5 };
    const regenerated = {
      ...analyticsUpdate,
      experience: { ...analyticsUpdate.experience!, artifactRevision: 3 }
    };

    expect(getAssemblyPreviewKey(analyticsUpdate)).toBe(getAssemblyPreviewKey(initial));
    expect(getAssemblyPreviewKey(regenerated)).not.toBe(getAssemblyPreviewKey(initial));
  });

  it("keeps the last complete preview visible while a replacement regenerates", () => {
    const current = session("campaign", {
      status: "preview_ready_unclaimed",
      answers: { audience: "Revenue leaders", objective: "Generate demand" },
      experience: {
        ready: true,
        title: "Existing campaign",
        headline: "The current complete story",
        generationSource: "openai",
        artifactRevision: 3
      }
    });
    const regenerating = session("campaign", {
      status: "generating",
      revision: 8,
      answers: { audience: "Revenue leaders", objective: "Generate demand", toneVariant: "consultative" }
    });

    const visible = preservePreviewDuringRegeneration(current, regenerating);
    expect(visible.status).toBe("generating");
    expect(visible.answers.toneVariant).toBe("consultative");
    expect(visible.experience).toEqual(current.experience);
    expect(preservePreviewDuringRegeneration(undefined, regenerating).experience).toBeUndefined();
  });

  it("accepts only bounded scroll handoffs from the generated preview", () => {
    expect(previewBoundaryScrollDelta({
      source: "folloze-experience",
      action: "preview_scroll_boundary",
      deltaY: 720
    })).toBe(720);
    expect(previewBoundaryScrollDelta({
      source: "folloze-experience",
      action: "preview_scroll_boundary",
      deltaY: 20_000
    })).toBe(1_600);
    expect(previewBoundaryScrollDelta({
      source: "folloze-experience",
      action: "preview_scroll_boundary",
      deltaY: -20_000
    })).toBe(-1_600);
    expect(previewBoundaryScrollDelta({
      source: "other-frame",
      action: "preview_scroll_boundary",
      deltaY: 500
    })).toBeUndefined();
    expect(previewBoundaryScrollDelta({
      source: "folloze-experience",
      action: "preview_scroll_boundary",
      deltaY: Number.NaN
    })).toBeUndefined();
  });

  it("turns bounded preview context into semantic engagement labels", () => {
    expect(describePreviewAnalyticsEvent("section_view", { sectionId: "supporting-resources" })).toEqual({
      label: "Viewed Evidence",
      detail: "The visitor reached a new part of the buyer journey."
    });
    expect(describePreviewAnalyticsEvent("topic_select", { lensId: "lens-2" }).label).toBe(
      "Selected decision lens 3"
    );
    expect(describePreviewAnalyticsEvent("cta_click", { ctaId: "close-primary" })).toEqual({
      label: "Tested the closing CTA",
      detail: "This preview captured next-step intent without leaving or losing the experience."
    });
  });

  it("exposes personalization preview options without regenerating the session", () => {
    const withVariants = session("abm", {
      experienceSpec: {
        schemaVersion: "2.0",
        revision: 1,
        sourceBriefRevision: 1,
        artifactDigest: "digest",
        renderers: {
          web: { status: "ready", hosting: "app" },
          folloze: { status: "disabled", reason: "public-runtime-html-only" }
        },
        sectionCount: 3,
        contentItemCount: 2,
        personalizationVariantIds: [
          "generic",
          "account",
          "account_industry",
          "account_industry_persona_a",
          "account_industry_persona_b"
        ],
        personalizationDefaultVariantId: "account"
      }
    });
    expect(personalizationVariantOptionsFor(withVariants).map((item) => item.id)).toEqual([
      "generic",
      "account",
      "account_industry",
      "account_industry_persona_a",
      "account_industry_persona_b"
    ]);
    expect(defaultPersonalizationVariantFor(withVariants)).toBe("account");
  });
});
