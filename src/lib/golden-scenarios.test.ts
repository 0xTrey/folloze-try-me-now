import { describe, expect, it } from "vitest";

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import { resolvePublicCompanyName } from "@/lib/company-name";
import { compileCampaignContext } from "@/lib/generation/campaign-context";
import { choosePdfDocumentTitle } from "@/lib/pdf-title";
import type { BrandProfile } from "@/lib/types";

function brand(
  domain: string,
  companyName: string,
  input: Partial<BrandProfile> = {}
): BrandProfile {
  return {
    domain,
    companyName,
    description: `${companyName} public company context.`,
    publicTopics: [],
    imageUrls: [],
    colors: ["#10233F", "#5B5BFF", "#FFFFFF"],
    primaryColor: "#10233F",
    accentColor: "#5B5BFF",
    surfaceColor: "#FFFFFF",
    sourceUrl: `https://${domain}/`,
    source: "brand-harvester",
    ...input
  };
}

describe("golden customer scenarios", () => {
  it("keeps a single-company Pebble campaign grounded in Pebble", () => {
    const pebble = brand("pebble.com", "Pebble", {
      description: "Pebble creates focused consumer technology and connected product experiences.",
      publicTopics: ["Consumer technology", "Connected products"]
    });

    const context = compileCampaignContext({
      brand: pebble,
      useCase: "campaign",
      answers: {
        campaignType: "product",
        promotedOffer: "Pebble product launch",
        audience: "Consumer technology buyers",
        objective: "Explore the launch"
      }
    });

    expect(context.brief.seller).toMatchObject({ domain: "pebble.com", name: "Pebble" });
    expect(context.brief.targetAccount).toBeNull();
    expect(context.designContext.brandOwner).toBe("Pebble");
    expect(context.brief.messageSpine.recognizableContext).toContain(
      "Consumer technology buyers"
    );
  });

  it("never swaps the Chase seller and Target account identities", () => {
    const chase = brand("chase.com", "Chase", {
      description: "Banking, payments, cards, and treasury services.",
      publicTopics: ["Payments", "Treasury", "Commercial banking"]
    });
    const target = brand("target.com", "Target", {
      description: "Retail stores, digital commerce, fulfillment, and guest experience.",
      publicTopics: ["Retail", "Digital commerce", "Fulfillment", "Guest experience"]
    });

    const context = compileCampaignContext({
      brand: chase,
      targetBrand: target,
      useCase: "abm",
      answers: {
        targetDomain: "target.com",
        audience: "Retail commerce and finance leaders",
        objective: "Align the buying group"
      }
    });

    expect(context.brief.seller).toMatchObject({ domain: "chase.com", name: "Chase" });
    expect(context.brief.targetAccount).toMatchObject({ domain: "target.com", name: "Target" });
    expect(context.designContext.brandOwner).toBe("Chase");
    expect(context.brief.messageSpine.recognizableContext).toMatch(/^Target and /);
  });

  it("makes Folloze for NVIDIA audiences specific to NVIDIA's operating context", () => {
    const folloze = brand("folloze.com", "Folloze", {
      description: "Account-based buyer experiences for demand generation and revenue marketing.",
      publicTopics: ["Account-based marketing", "Buyer experience", "Revenue marketing"]
    });
    const nvidia = brand("nvidia.com", "NVIDIA", {
      description:
        "Accelerated computing, AI factories, enterprise AI, robotics, simulation, and data center platforms.",
      publicTopics: ["Accelerated computing", "AI factories", "Enterprise AI", "Robotics"]
    });

    const audiences = audienceSuggestionsFor(folloze, nvidia);

    expect(audiences).toHaveLength(4);
    expect(new Set(audiences).size).toBe(4);
    expect(audiences).not.toEqual(audienceSuggestionsFor(folloze));
    expect(audiences.join(" ")).toMatch(/AI|data|robot|comput/i);
    expect(audiences.join(" ")).toMatch(/marketing|journey|buyer|campaign/i);
    expect(audiences.every((audience) => !/^NVIDIA\b/i.test(audience))).toBe(true);
  });

  it("preserves the ServiceNow wordmark casing from a lowercase page title", () => {
    expect(
      resolvePublicCompanyName({
        domain: "servicenow.com",
        html: "<!doctype html><title>servicenow - put AI to work</title>",
        title: "servicenow - put AI to work"
      })
    ).toBe("ServiceNow");
  });

  it("anchors an elder-care robotics experience to its approved source", () => {
    const seller = brand("carelab.example", "CareLab", {
      description: "Research on assistive robotics and aging services.",
      publicTopics: ["Assistive robotics", "Aging services"]
    });
    const context = compileCampaignContext({
      brand: seller,
      useCase: "content",
      answers: {
        sourceName: "robotics-final-v7.pdf",
        sourceTitle: "Humanoid Robots in Elder Care",
        audience: "Senior living innovation leaders",
        objective: "Increase content engagement"
      },
      sourceContent: {
        sourceUrl: "https://carelab.example/research/elder-care-robotics",
        title: "Humanoid Robots in Elder Care",
        excerpt:
          "The report examines where assistive robots may support care teams while preserving human judgment and resident dignity."
      }
    });

    expect(context.brief.sourceTitle).toBe("Humanoid Robots in Elder Care");
    expect(context.brief.proofMode).toBe("source-content");
    expect(context.brief.authority.content).toContain("Humanoid Robots in Elder Care");
    expect(context.brief.messageSpine.recognizableContext).toContain(
      "Humanoid Robots in Elder Care"
    );
  });

  it("uses a real PDF title instead of leaking an upload filename", () => {
    const title = choosePdfDocumentTitle({
      metadataTitle: "ebk-now-platform-reference-guide.pdf",
      originalName: "ebk-now-platform-reference-guide.pdf",
      lines: [
        { text: "Now Platform", fontSize: 34, y: 720, pageHeight: 792 },
        { text: "Reference Guide", fontSize: 34, y: 676, pageHeight: 792 },
        { text: "servicenow.com", fontSize: 10, y: 42, pageHeight: 792 }
      ]
    });

    expect(title).toBe("Now Platform Reference Guide");
    expect(title).not.toContain("ebk-now-platform-reference-guide.pdf");
  });
});
