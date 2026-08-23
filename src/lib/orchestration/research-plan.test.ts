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
      sessionId: "session-stable-domain",
      revision: 4,
      useCase: "campaign",
      companyDomain: "ServiceTitan.com",
      companyName: "ServiceTitan",
      officialNavigationTerms: ["Industries", "Products", "Webinars"],
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
    expect(plan.queryPlan).toMatchObject({
      sessionId: "session-stable-domain",
      revision: 4,
      sellerDomain: "servicetitan.com"
    });
    expect([
      ...plan.queryPlan!.sellerQueries,
      ...plan.queryPlan!.offerQueries,
      ...plan.queryPlan!.audienceQueries,
      ...plan.queryPlan!.proofQueries
    ].map(({ intent }) => intent)).toEqual(expect.arrayContaining([
      "company_positioning",
      "official_products",
      "official_solutions",
      "official_industries",
      "events_and_resources",
      "buyer_roles_and_jobs",
      "proof_and_demonstrations"
    ]));
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

  it("scopes single-flight dedupe to session and revision", () => {
    const current = planEarlyResearch({
      sessionId: "session-flight",
      revision: 8,
      useCase: "campaign",
      companyDomain: "example.com",
      answers: {}
    }).jobs[0]!;
    const duplicate = { ...current };
    const newer = { ...current, revision: 9 };

    expect(dedupeResearchJobs([current, duplicate, newer])).toEqual([
      current,
      newer
    ]);
    expect(researchFlightKey(current)).toBe(
      "session-flight:8:seller:example.com"
    );
    expect(researchFlightKey(newer)).toBe(
      "session-flight:9:seller:example.com"
    );
  });

  it("bounds every lane by the shared attempt deadline and starts no work after cutoff", () => {
    const bounded = planEarlyResearch({
      sessionId: "session-deadline",
      revision: 2,
      useCase: "abm",
      companyDomain: "seller.example",
      answers: {
        targetDomain: "target.example",
        sourceUrl: "https://seller.example/product"
      },
      nowMs: 50_000,
      attemptDeadlineAt: 53_500
    });

    expect(bounded.jobs).toHaveLength(3);
    expect(bounded.jobs.every(({ timeoutMs }) => timeoutMs === 3_500)).toBe(true);
    expect(bounded.deadlineAt).toBe(53_500);

    const expired = planEarlyResearch({
      sessionId: "session-deadline",
      revision: 2,
      useCase: "campaign",
      companyDomain: "seller.example",
      answers: {},
      nowMs: 60_000,
      attemptDeadlineAt: 60_000
    });

    expect(expired.jobs).toEqual([]);
    expect(expired.fallbackCode).toBe("research_attempt_deadline_elapsed");
    expect(expired.queryPlan?.sellerQueries.length).toBeGreaterThan(0);
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
