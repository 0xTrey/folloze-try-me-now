import { describe, expect, it } from "vitest";

import type { PublicBrandProfile, PublicTryMeSession, StageStatus, UseCase } from "@/lib/types";
import {
  ceremonyDuration,
  ctaValueForSession,
  entryPathOptions,
  getAssemblyPreviewKey,
  getBuildPanelCopy,
  getGuidedQuestionCopy,
  getRevealCopy,
  getRevealShellHeadline,
  previewBoundaryScrollDelta
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
  it("routes each watch-example action to a verified public Folloze board", () => {
    expect(entryPathOptions.abm).toMatchObject({
      exampleLabel: "Watch Tribe Connect for HARMAN",
      exampleUrl: "https://experience.folloze.com/tribe-connect-for-harman"
    });
    expect(entryPathOptions.campaign).toMatchObject({
      title: "Launch a Campaign",
      exampleLabel: "Watch Folloze + Claude launch",
      exampleUrl: "https://experience.folloze.com/folloze-claude-launch"
    });
    expect(entryPathOptions.content).toMatchObject({
      exampleLabel: "Watch Cisco HMF become an experience",
      exampleUrl: "https://engage.folloze.com/cisco-hmf-example"
    });
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
  });

  it("bypasses the ceremony when reduced motion is requested", () => {
    expect(ceremonyDuration(true)).toBe(0);
    expect(ceremonyDuration(false)).toBe(4_800);
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
});
