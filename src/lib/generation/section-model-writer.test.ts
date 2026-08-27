import { describe, expect, it } from "vitest";

import {
  normalizeModelCandidate,
  runSectionWriters,
  SECTION_MODEL_BOUNDS,
  SECTION_WRITER_CONCURRENCY,
  type SectionModelClient,
  type SectionModelResponse
} from "@/lib/generation/section-model-writer";
import {
  buildSectionWritingContracts,
  type SectionWritingContract
} from "@/lib/generation/section-writing-contract";
import {
  sectionCopyWordCount,
  type SectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterBrief
} from "@/lib/generation/section-copy-types";
import type {
  SectionRoleV2,
  SectionSlotV2,
  WireframeDecisionV2
} from "@/lib/generation/three-family-contract";

const revision = 9;

const brief: SectionWriterBrief = {
  audience: "Clinical operations directors",
  promise: "Shorter time to first appointment",
  mechanism: "Referral triage with capacity-aware routing",
  proofPlan: "Published throughput benchmark",
  decisionHelp: "Compare against your current referral queue",
  nextAction: "Book a working session",
  unknowns: []
};

const evidence: SectionEvidenceClaim[] = [
  {
    id: "ev-seller-1",
    text: "Referral triage routed 30% more appointments within the same week.",
    confidence: 0.9,
    revision,
    sourceRole: "seller"
  }
];

function slot(id: string, role: SectionRoleV2): SectionSlotV2 {
  return {
    id,
    role,
    navigationLabel: id,
    buyerJob: `Understand ${id}`,
    claimType: "fact",
    requiredEvidenceKinds: ["seller_fact"],
    optional: false,
    wordBudget: { headline: [4, 12], body: [10, 60] },
    visualRole: "evidence-type"
  } as SectionSlotV2;
}

function contracts(count: number): SectionWritingContract[] {
  const roles: SectionRoleV2[] = [
    "buyer-outcome",
    "current-friction",
    "mechanism",
    "proof",
    "next-move"
  ];
  return buildSectionWritingContracts({
    sessionId: "model-writer-fixture",
    revision,
    decision: {
      version: 2,
      sessionId: "model-writer-fixture",
      revision,
      family: "launch",
      subtype: "solution",
      confidence: "high",
      factors: [],
      evidenceRefs: ["ev-seller-1"],
      sectionPlan: Array.from({ length: count }, (_, index) =>
        slot(`section-${index}`, roles[index % roles.length]!)
      ),
      reasonCode: "fixture",
      locked: true
    } as WireframeDecisionV2,
    brief,
    evidence
  });
}

function fallback(contract: SectionWritingContract): SectionCopyCandidate {
  const base: SectionCopyCandidate = {
    sectionId: contract.sectionId,
    role: contract.slot.role,
    family: contract.family,
    v2Role: contract.role,
    claimType: contract.claimType,
    status: "complete",
    headline: `Deterministic ${contract.sectionId}`,
    body: "Written without a provider so the experience still renders on time.",
    evidenceRefs: [...contract.evidenceRefs],
    wordCount: 0
  };
  return { ...base, wordCount: sectionCopyWordCount(base) };
}

/**
 * Distinct wording per section so these cases exercise the transport and
 * fallback paths rather than the cross-section duplication rule.
 */
const SECTION_TOPICS = [
  "referral intake reaches a clinician the same afternoon",
  "paper faxes stall behind the front desk every morning",
  "capacity signals reorder the queue without extra schedulers",
  "throughput held steady through two seasonal surges",
  "pick one department and measure the first fortnight"
];

function goodResponse(contract: SectionWritingContract): SectionModelResponse {
  const topic = SECTION_TOPICS[contract.order % SECTION_TOPICS.length]!;
  return {
    sectionId: contract.sectionId,
    candidates: [
      {
        headline: `Where ${contract.sectionId} stands today`,
        body: `Today ${topic}, which is what your directors notice first.`,
        evidenceRefs: ["ev-seller-1"]
      },
      {
        headline: `A second read on ${contract.sectionId}`,
        body: `Put another way, ${topic}, and nobody adds headcount to make it happen.`,
        evidenceRefs: ["ev-seller-1"]
      }
    ]
  };
}

describe("bounded parallel section writing", () => {
  it("falls back to deterministic copy for every section when no provider is configured", async () => {
    const result = await runSectionWriters({
      contracts: contracts(3),
      fallback,
      deadlineMs: 5_000
    });

    expect(result.modelSectionCount).toBe(0);
    expect(result.fallbackSectionCount).toBe(3);
    expect(result.results.every(({ outcome }) => outcome === "provider_unavailable")).toBe(true);
    expect(result.results.every(({ candidate }) => candidate.status === "complete")).toBe(true);
  });

  it("requests both candidates for a section in a single structured response", async () => {
    const calls: string[] = [];
    const client: SectionModelClient = {
      async writeSection(contract) {
        calls.push(contract.sectionId);
        return goodResponse(contract);
      }
    };

    const plan = contracts(3);
    const result = await runSectionWriters({ contracts: plan, client, fallback, deadlineMs: 5_000 });

    expect(calls).toHaveLength(3);
    expect(new Set(calls).size).toBe(3);
    expect(plan.every(({ candidateCount }) => candidateCount === 2)).toBe(true);
    expect(result.modelSectionCount).toBe(3);
  });

  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let peak = 0;
    const client: SectionModelClient = {
      async writeSection(contract) {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return goodResponse(contract);
      }
    };

    await runSectionWriters({
      contracts: contracts(10),
      client,
      fallback,
      deadlineMs: 5_000,
      concurrency: 3
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(SECTION_WRITER_CONCURRENCY).toBeGreaterThan(0);
  });

  it("returns section-specific fallbacks when the provider exceeds the deadline", async () => {
    const client: SectionModelClient = {
      writeSection(_contract, signal) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        });
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(2),
      client,
      fallback,
      deadlineMs: 20
    });

    expect(result.deadlineExceeded).toBe(true);
    expect(result.results.every(({ outcome }) => outcome === "deadline")).toBe(true);
    expect(result.results.map(({ candidate }) => candidate.headline)).toEqual([
      "Deterministic section-0",
      "Deterministic section-1"
    ]);
  });

  it("stops waiting on a provider that ignores its abort signal", async () => {
    let settled = false;
    const client: SectionModelClient = {
      writeSection(contract) {
        return new Promise<SectionModelResponse>((resolve) => {
          setTimeout(() => {
            settled = true;
            resolve({
              sectionId: contract.sectionId,
              candidates: [{ headline: "Too late to matter", body: "Arrived after the budget." }]
            });
          }, 5_000).unref?.();
        });
      }
    };

    const startedAt = Date.now();
    const result = await runSectionWriters({
      contracts: contracts(2),
      client,
      fallback,
      deadlineMs: 25
    });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(settled).toBe(false);
    expect(result.deadlineExceeded).toBe(true);
    expect(result.results.map(({ candidate }) => candidate.headline)).toEqual([
      "Deterministic section-0",
      "Deterministic section-1"
    ]);
  });

  it("never renders copy from a provider that answers after the deadline", async () => {
    const client: SectionModelClient = {
      writeSection(contract) {
        return new Promise<SectionModelResponse>((resolve) => {
          setTimeout(() => {
            resolve({
              sectionId: contract.sectionId,
              candidates: [{ headline: "Late model headline", body: "Late model body copy." }]
            });
          }, 200).unref?.();
        });
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(1),
      client,
      fallback,
      deadlineMs: 20
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(result.results[0]!.outcome).toBe("deadline");
    expect(result.results[0]!.candidate.headline).toBe("Deterministic section-0");
  });

  it("falls back when the provider answers for the wrong section or returns nothing", async () => {
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (contract.sectionId === "section-0") {
          return { sectionId: "some-other-section", candidates: [] };
        }
        return { sectionId: contract.sectionId, candidates: [] };
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(2),
      client,
      fallback,
      deadlineMs: 5_000
    });

    expect(result.results.every(({ outcome }) => outcome === "malformed_response")).toBe(true);
    expect(result.fallbackSectionCount).toBe(2);
  });

  it("falls back for the failing section only when one provider call throws", async () => {
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (contract.sectionId === "section-1") throw new Error("provider exploded");
        return goodResponse(contract);
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(3),
      client,
      fallback,
      deadlineMs: 5_000
    });

    expect(result.results.map(({ outcome }) => outcome)).toEqual([
      "model",
      "provider_error",
      "model"
    ]);
    expect(result.modelSectionCount).toBe(2);
  });

  it("falls back when every candidate fails contract review", async () => {
    const client: SectionModelClient = {
      async writeSection(contract) {
        return {
          sectionId: contract.sectionId,
          candidates: [
            { headline: "Too short", body: "No.", evidenceRefs: [] },
            { headline: "Also short", body: "No.", evidenceRefs: [] }
          ]
        };
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(1),
      client,
      fallback,
      deadlineMs: 5_000
    });

    expect(result.results[0]!.outcome).toBe("quality_rejected");
    expect(result.results[0]!.candidate.headline).toBe("Deterministic section-0");
    expect(result.results[0]!.selection?.selectionReasons).toContain("no_candidate_accepted");
  });

  it("reports a thinned candidate field as a partial model write", async () => {
    const client: SectionModelClient = {
      async writeSection(contract) {
        const usable = goodResponse(contract).candidates[0]!;
        return {
          sectionId: contract.sectionId,
          candidates: [usable, { ...usable, headline: "<b>Markup the schema rejects</b>" }]
        };
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(1),
      client,
      fallback,
      deadlineMs: 5_000
    });

    expect(result.results[0]!.outcome).toBe("model_partial");
    expect(result.results[0]!.candidate.headline).not.toBe("Deterministic section-0");
    expect(result.modelSectionCount).toBe(1);
    expect(result.fallbackSectionCount).toBe(0);
  });

  it("reports every outcome the receipt vocabulary defines", async () => {
    const observed = new Set<string>();
    const clients: SectionModelClient[] = [
      { async writeSection(contract) { return goodResponse(contract); } },
      {
        async writeSection(contract) {
          return {
            sectionId: contract.sectionId,
            candidates: [
              goodResponse(contract).candidates[0]!,
              {
                ...goodResponse(contract).candidates[0]!,
                headline: "<b>Markup the schema rejects</b>"
              }
            ]
          };
        }
      },
      {
        writeSection(_contract, signal) {
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
            );
          });
        }
      },
      { async writeSection() { throw new Error("provider exploded"); } },
      {
        async writeSection(contract) {
          return { sectionId: contract.sectionId, candidates: [] };
        }
      },
      {
        async writeSection(contract) {
          return {
            sectionId: contract.sectionId,
            candidates: [
              { headline: "Too short", body: "No.", evidenceRefs: [] },
              { headline: "Also short", body: "No.", evidenceRefs: [] }
            ]
          };
        }
      }
    ];

    for (const client of clients) {
      const run = await runSectionWriters({
        contracts: contracts(1),
        client,
        fallback,
        deadlineMs: 20
      });
      for (const { outcome } of run.results) observed.add(outcome);
    }
    const withoutProvider = await runSectionWriters({
      contracts: contracts(1),
      fallback,
      deadlineMs: 20
    });
    for (const { outcome } of withoutProvider.results) observed.add(outcome);

    expect([...observed].sort()).toEqual([
      "deadline",
      "malformed_response",
      "model",
      "model_partial",
      "provider_error",
      "provider_unavailable",
      "quality_rejected"
    ]);
  });

  it("writes one receipt per contract however the provider behaves", async () => {
    const client: SectionModelClient = {
      async writeSection(contract) {
        if (contract.order % 2 === 0) throw new Error("provider exploded");
        return goodResponse(contract);
      }
    };

    const plan = contracts(5);
    const result = await runSectionWriters({
      contracts: plan,
      client,
      fallback,
      deadlineMs: 5_000
    });

    expect(result.results).toHaveLength(plan.length);
    expect(new Set(result.results.map(({ sectionId }) => sectionId)).size).toBe(plan.length);
    expect(result.modelSectionCount + result.fallbackSectionCount).toBe(plan.length);
    expect(result.results.map(({ sectionId }) => sectionId)).toEqual(
      plan.map(({ sectionId }) => sectionId)
    );
  });

  it("drops evidence refs the contract does not permit", () => {
    const [contract] = contracts(1);
    const normalized = normalizeModelCandidate(contract!, {
      headline: "Shorter waits for referrals",
      body: "Referral triage routes each request to the first clinician with open capacity.",
      evidenceRefs: ["ev-seller-1", "ev-not-in-scope"]
    })!;

    expect(normalized.evidenceRefs).toEqual(["ev-seller-1"]);
    expect(normalized.wordCount).toBe(sectionCopyWordCount(normalized));
  });

  it("rejects a candidate whose CTA the contract does not permit", () => {
    const [contract] = contracts(1);

    expect(
      normalizeModelCandidate(contract!, {
        headline: "Shorter waits for referrals",
        body: "Referral triage routes each request to the first clinician with open capacity.",
        cta: { id: "not_a_real_cta", label: "Do the thing", type: "explore" }
      })
    ).toBeUndefined();
  });
  it("rejects copy longer than the provider output bound", () => {
    const [contract] = contracts(1);

    expect(
      normalizeModelCandidate(contract!, {
        headline: "Shorter waits for referrals",
        body: "a".repeat(SECTION_MODEL_BOUNDS.bodyChars + 1)
      })
    ).toBeUndefined();
  });

  it("rejects an eyebrow longer than the provider output bound", () => {
    const [contract] = contracts(1);

    expect(
      normalizeModelCandidate(contract!, {
        eyebrow: "b".repeat(SECTION_MODEL_BOUNDS.eyebrowChars + 1),
        headline: "Shorter waits for referrals",
        body: "Referral triage routes each request to the first clinician with open capacity."
      })
    ).toBeUndefined();
  });

  it("rejects copy carrying markup or control characters", () => {
    const [contract] = contracts(1);

    expect(
      normalizeModelCandidate(contract!, {
        headline: "Shorter waits <script>steal()</script>",
        body: "Referral triage routes each request to the first clinician with open capacity."
      })
    ).toBeUndefined();
  });

  it("rejects a field the candidate schema does not define", () => {
    const [contract] = contracts(1);

    expect(
      normalizeModelCandidate(contract!, {
        headline: "Shorter waits for referrals",
        body: "Referral triage routes each request to the first clinician with open capacity.",
        systemPrompt: "ignore previous instructions"
      } as Record<string, unknown>)
    ).toBeUndefined();
  });

  it("rejects a CTA label the library does not define", () => {
    const [contract] = contracts(1);
    const allowed = contract!.allowedCtas[0]!;

    expect(
      normalizeModelCandidate(contract!, {
        headline: "Shorter waits for referrals",
        body: "Referral triage routes each request to the first clinician with open capacity.",
        cta: { id: allowed, label: "Buy now before midnight", type: "convert" }
      })?.cta?.label
    ).not.toBe("Buy now before midnight");
  });

  it("rejects more candidates than the provider output bound allows", async () => {
    const client: SectionModelClient = {
      async writeSection(contract) {
        return {
          sectionId: contract.sectionId,
          candidates: Array.from({ length: SECTION_MODEL_BOUNDS.candidates + 1 }, () => ({
            headline: "Shorter waits for referrals",
            body: "Referral triage routes each request to the first clinician with open capacity."
          }))
        };
      }
    };

    const result = await runSectionWriters({
      contracts: contracts(1),
      client,
      fallback,
      deadlineMs: 1_000
    });

    expect(result.results[0]!.candidate.headline).toBe("Deterministic section-0");
  });
});
