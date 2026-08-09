import { describe, expect, it } from "vitest";

import { interpretConversationalBrief } from "@/lib/conversational-brief";

describe("interpretConversationalBrief", () => {
  it("projects the video campaign prompt into reviewable, deterministic hints", () => {
    const brief = interpretConversationalBrief(
      "Build a landing page to promote my lawn care service for commercial property managers. I want people to request a service quote.",
      "campaign"
    );

    expect(brief).toMatchObject({
      useCase: "campaign",
      offer: { value: "lawn care service", confidence: "medium" },
      audience: { value: "commercial property managers", confidence: "high" },
      objective: { value: "Request a quote", confidence: "medium" },
      cta: { value: "Request a quote" },
      campaignType: { value: "product", confidence: "medium" },
      confidence: "high"
    });
  });

  it("keeps a named ABM account as a hint and accepts a public target domain", () => {
    const brief = interpretConversationalBrief(
      "Build an account experience for NVIDIA at https://www.nvidia.com/enterprise/ to introduce our AI infrastructure offer to platform architects.",
      "abm"
    );

    expect(brief).toMatchObject({
      sourceUrl: { value: "https://www.nvidia.com/enterprise/", confidence: "high" },
      domain: { value: "nvidia.com", confidence: "high" },
      targetAccount: { value: "NVIDIA", confidence: "medium" },
      audience: { value: "platform architects", confidence: "high" }
    });
  });

  it("uses a public content URL as a source candidate without inventing a story", () => {
    const brief = interpretConversationalBrief(
      "Turn https://www.cisco.com/c/en/us/products/security/hybrid-mesh-firewall.html into a buyer experience.",
      "content"
    );

    expect(brief).toMatchObject({
      sourceUrl: {
        value: "https://www.cisco.com/c/en/us/products/security/hybrid-mesh-firewall.html",
        confidence: "high",
        provenance: { kind: "explicit-url" }
      },
      domain: { value: "cisco.com", confidence: "high" }
    });
    expect(brief.offer).toBeUndefined();
    expect(brief.audience).toBeUndefined();
  });

  it("leaves ambiguous prompts uncommitted", () => {
    const brief = interpretConversationalBrief("Make something great for us", "campaign");

    expect(brief.confidence).toBe("low");
    expect(brief.sourceUrl).toBeUndefined();
    expect(brief.offer).toBeUndefined();
    expect(brief.objective).toBeUndefined();
  });

  it.each([
    "Turn http://localhost:3000/secret into an experience",
    "Use https://127.0.0.1/internal for this campaign",
    "Use https://user:password@example.com/private for this campaign",
    "Use https://example.com/brief?access_token=super-secret for this campaign"
  ])("does not accept unsafe or secret-bearing URLs: %s", (intent) => {
    const brief = interpretConversationalBrief(intent, "content");

    expect(brief.sourceUrl).toBeUndefined();
    expect(brief.domain).toBeUndefined();
  });

  it("removes benign query strings and fragments from an accepted URL", () => {
    const brief = interpretConversationalBrief(
      "Use https://example.com/research/report?utm_source=demo#summary to drive downloads.",
      "content"
    );

    expect(brief.sourceUrl?.value).toBe("https://example.com/research/report");
    expect(brief.objective?.value).toBe("Drive downloads");
  });
});
