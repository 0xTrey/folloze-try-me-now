import { afterEach, describe, expect, it } from "vitest";

import { patchSessionAnswers } from "@/lib/orchestrator";
import { deleteSession, putSession } from "@/lib/session-store";
import type { BrandProfile, TryMeSession } from "@/lib/types";

const ids = new Set<string>();

function campaignSession(id: string): TryMeSession {
  const now = "2026-08-28T12:00:00.000Z";
  return {
    id,
    editorTokenHash: "private-editor-hash",
    useCase: "campaign",
    companyDomain: "seller.example",
    status: "collecting",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: `https://example.test/e/${id}`,
    revision: 1,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "running" },
      story: { status: "pending" }
    },
    answers: { campaignType: "product" },
    audienceSuggestions: [],
    events: []
  };
}

function sellerBrand(): BrandProfile {
  return {
    domain: "seller.example",
    canonicalDomain: "seller.example",
    companyName: "Fixture Seller",
    title: "Fixture Seller",
    description: "Payroll, HR, and workforce management for employers.",
    publicContext: "Employer services and compliance support.",
    publicTopics: ["RUN Powered Payroll", "Workforce Now"],
    sourceUrl: "https://seller.example/",
    source: "fast-extractor",
    colors: ["#D0272D", "#FFFFFF", "#101820"],
    primaryColor: "#D0272D",
    accentColor: "#101820",
    surfaceColor: "#FFFFFF",
    imageUrls: []
  };
}

afterEach(async () => {
  await Promise.all([...ids].map((id) => deleteSession(id)));
  ids.clear();
});

describe("objective CTA propagation", () => {
  it("stores the selected objective CTA type instead of the recommended default", async () => {
    const id = `objective-cta-${Date.now()}`;
    ids.add(id);
    await putSession({
      ...campaignSession(id),
      brand: sellerBrand()
    });

    const baseline = await patchSessionAnswers(id, {
      promotedOffer: "RUN Powered Payroll",
      campaignType: "product"
    });
    const objectives = baseline.session.objectiveRecommendations ?? [];
    expect(objectives.length).toBeGreaterThanOrEqual(3);

    const recommended = objectives.find((candidate) => candidate.recommended);
    const selected = objectives.find((candidate) => !candidate.recommended);
    expect(recommended?.cta?.type).toBeTruthy();
    expect(selected?.cta?.type).toBeTruthy();
    expect(selected?.cta?.type).not.toBe(recommended?.cta?.type);

    const patched = await patchSessionAnswers(id, { objective: selected!.label });
    expect(patched.session.answers.objective).toBe(selected!.label);
    expect(patched.session.answers.ctaType).toBe(selected!.cta?.type);
    expect(patched.session.answers.ctaType).not.toBe(recommended?.cta?.type);
  });

  it("keeps each action family's CTA type when selected for campaign motion", async () => {
    const id = `objective-families-${Date.now()}`;
    ids.add(id);
    await putSession({
      ...campaignSession(id),
      brand: sellerBrand(),
      answers: { campaignType: "demand" }
    });

    const baseline = await patchSessionAnswers(id, {
      promotedOffer: "Advisory Services"
    });
    const objectives = baseline.session.objectiveRecommendations ?? [];
    expect(objectives.map((candidate) => candidate.cta?.type)).toEqual([
      "explore",
      "book-meeting",
      "download"
    ]);

    for (const candidate of objectives) {
      const patched = await patchSessionAnswers(id, { objective: candidate.label });
      expect(patched.session.answers.ctaType).toBe(candidate.cta?.type);
    }
  });
});
