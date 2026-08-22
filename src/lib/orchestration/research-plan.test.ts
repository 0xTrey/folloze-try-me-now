import { describe, expect, it } from "vitest";

import {
  dedupeResearchJobs,
  isMaterialBriefEligible,
  planEarlyResearch,
  researchFlightKey
} from "./research-plan";

describe("planEarlyResearch", () => {
  it("starts seller brand work from a normalized valid domain before confirmation", () => {
    const plan = planEarlyResearch({
      useCase: "campaign",
      companyDomain: "ServiceTitan.com",
      answers: {}
    });

    expect(plan.generationEligible).toBe(false);
    expect(plan.sellerAuthorityKey).toBe("servicetitan.com");
    expect(plan.jobs).toEqual([
      expect.objectContaining({
        worker: "brand-enrichment",
        role: "seller",
        key: "servicetitan.com",
        reason: "seller_domain_stabilized"
      })
    ]);
  });

  it("plans separate target evidence without replacing seller authority", () => {
    const plan = planEarlyResearch({
      useCase: "abm",
      companyDomain: "folloze.com",
      answers: { targetDomain: "acme.com" }
    });

    expect(plan.sellerAuthorityPreserved).toBe(true);
    expect(plan.targetEvidenceKey).toBe("acme.com");
    expect(plan.jobs.map((job) => [job.role, job.worker, job.key])).toEqual([
      ["seller", "brand-enrichment", "folloze.com"],
      ["target", "account-research", "acme.com"]
    ]);
    expect(plan.jobs.find((job) => job.role === "target")?.worker).not.toBe("brand-enrichment");
  });

  it("triggers source work when a public URL stabilizes", () => {
    const plan = planEarlyResearch({
      useCase: "content",
      companyDomain: "cisco.com",
      answers: { sourceUrl: "https://www.cisco.com/c/en/us/products.html" }
    });

    expect(plan.jobs.map((job) => job.reason)).toEqual([
      "seller_domain_stabilized",
      "source_url_stabilized"
    ]);
  });

  it("skips completed flights and dedupes identical jobs", () => {
    const plan = planEarlyResearch({
      useCase: "abm",
      companyDomain: "folloze.com",
      answers: {
        targetDomain: "acme.com",
        sourceUrl: "https://folloze.com/product"
      },
      completedKeys: ["seller:folloze.com"]
    });
    const duplicated = dedupeResearchJobs([
      ...plan.jobs,
      ...plan.jobs
    ]);

    expect(plan.jobs.map((job) => researchFlightKey(job))).toEqual([
      "target:acme.com",
      "source:https://folloze.com/product"
    ]);
    expect(duplicated).toHaveLength(2);
  });

  it("marks generation eligible only after the material brief is complete", () => {
    expect(
      isMaterialBriefEligible("campaign", {
        audience: "Demand leaders",
        objective: "Increase qualified engagement",
        campaignType: "demand",
        promotedOffer: "Buyer Experience Platform"
      })
    ).toBe(true);
    expect(
      planEarlyResearch({
        useCase: "campaign",
        companyDomain: "folloze.com",
        answers: { audience: "Demand leaders" }
      }).generationEligible
    ).toBe(false);
  });
});
