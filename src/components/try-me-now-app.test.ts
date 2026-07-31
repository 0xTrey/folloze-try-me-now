import { describe, expect, it } from "vitest";

import type { PublicBrandProfile, PublicTryMeSession, StageStatus, UseCase } from "@/lib/types";
import {
  ceremonyDuration,
  getBuildPanelCopy,
  getGuidedQuestionCopy,
  getRevealCopy
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
    expect(result.summary).toContain("Enterprise architecture leaders");
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
    expect(result.summary).toContain("Automation platform owners");
    expect(result.summary).toContain("increase content engagement");
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
});
