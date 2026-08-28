import { describe, expect, it } from "vitest";

import { createSourceArtifact } from "@/lib/content-intelligence";
import {
  buildResearchQueryPlanV2,
  type ResearchQueryPlanV2
} from "@/lib/orchestration/research-query-plan-v2";

import {
  EVIDENCE_USE,
  evidenceClaimId,
  evidenceEntityId,
  evidenceGraphClaimSet,
  evidenceGraphDigest,
  evidenceSourceRef,
  type EvidenceClaimCandidate,
  type EvidenceEntity
} from "./evidence-graph";
import {
  executeEvidenceGraph,
  executeEvidenceGraphRun,
  type EvidenceLaneResult,
  type EvidenceLaneRunners,
  type ExecuteEvidenceGraphInput
} from "./evidence-graph-executor";
import { sourceArtifactEvidence } from "./evidence-lane-runners";

const RAW_BODY_SENTINEL =
  "RAWBODYSENTINEL every visitor deserves a faster onboarding path and this paragraph is the unbounded page body that must never leave the extractor boundary.";
const PROMPT_SENTINEL =
  "PROMPTSENTINEL You are a section writer. Return JSON with headline and body.";

const sellerId = evidenceEntityId("seller", "acme.example");
const offerId = evidenceEntityId("offer", "Workflow Automation Platform");

const sellerEntity: EvidenceEntity = {
  id: sellerId,
  kind: "seller",
  canonicalName: "acme.example",
  aliases: ["Acme"]
};

const offerEntity: EvidenceEntity = {
  id: offerId,
  kind: "offer",
  canonicalName: "Workflow Automation Platform",
  aliases: []
};

function plan(overrides: Partial<Parameters<typeof buildResearchQueryPlanV2>[0]> = {}): ResearchQueryPlanV2 {
  return buildResearchQueryPlanV2({
    sessionId: "session-evidence-graph",
    revision: 3,
    sellerDomain: "acme.example",
    companyName: "Acme",
    officialNavigationTerms: ["Products", "Solutions"],
    sourceUrls: ["https://acme.example/platform?utm_source=visitor"],
    ...overrides
  });
}

function candidate(input: {
  subjectId: string;
  topic: string;
  statement: string;
  laneId: string;
  authority?: string;
  buyerFacing?: boolean;
}): EvidenceClaimCandidate {
  const authority = input.authority ?? "seller_official";
  return {
    topic: input.topic,
    laneId: input.laneId,
    claim: {
      id: evidenceClaimId({
        subjectId: input.subjectId,
        topic: input.topic,
        claim: input.statement
      }),
      subjectId: input.subjectId,
      claim: input.statement,
      status: "fact",
      confidence: "high",
      sourceAuthority: authority,
      sourceRef: evidenceSourceRef({ authority, locator: input.laneId }),
      allowedUses: [EVIDENCE_USE.headline, EVIDENCE_USE.internalReasoning],
      prohibitedUses: [],
      buyerFacing: input.buyerFacing ?? true
    }
  };
}

function laneResult(result: EvidenceLaneResult) {
  return async () => result;
}

function baseInput(
  overrides: Partial<ExecuteEvidenceGraphInput> = {}
): ExecuteEvidenceGraphInput {
  return {
    plan: plan(),
    revision: 3,
    inputFingerprint: "fp-acme-r3",
    deadlineMs: 2_000,
    ...overrides
  };
}

const sellerLane: EvidenceLaneResult = {
  entities: [sellerEntity],
  candidates: [
    candidate({
      subjectId: sellerId,
      topic: "positioning",
      statement: "Acme runs approval workflows for regulated operations teams.",
      laneId: "seller_identity"
    })
  ]
};

const offerLane: EvidenceLaneResult = {
  entities: [offerEntity],
  candidates: [
    candidate({
      subjectId: offerId,
      topic: "offer",
      statement: "Acme sells a workflow automation platform.",
      laneId: "offer"
    })
  ],
  relationships: [
    {
      from: sellerId,
      to: offerId,
      kind: "sells",
      evidenceRefs: [
        evidenceClaimId({
          subjectId: offerId,
          topic: "offer",
          claim: "Acme sells a workflow automation platform."
        })
      ]
    }
  ]
};

describe("executeEvidenceGraph", () => {
  it("executes fake lanes into one typed, deterministic graph", async () => {
    const lanes: EvidenceLaneRunners = {
      seller_identity: laneResult(sellerLane),
      offer: laneResult(offerLane)
    };
    const graph = await executeEvidenceGraph(
      baseInput({ lanes, now: () => 1_000 })
    );

    expect(graph.schemaVersion).toBe("1.0");
    expect(graph.revision).toBe(3);
    expect(graph.inputFingerprint).toBe("fp-acme-r3");
    expect(graph.entities.map(({ kind }) => kind).sort()).toEqual(["offer", "seller"]);
    expect(graph.claims).toHaveLength(2);
    expect(graph.claims.every((claim) => claim.status === "fact")).toBe(true);
    expect(graph.relationships).toEqual([
      expect.objectContaining({ from: sellerId, to: offerId, kind: "sells" })
    ]);
    expect(graph.timings.total).toBe(0);
    expect(graph.timings).toHaveProperty("lane_offer");

    const again = await executeEvidenceGraph(
      baseInput({ lanes, now: () => 1_000 })
    );
    expect(evidenceGraphDigest(again)).toBe(evidenceGraphDigest(graph));
  });

  it("drops a relationship whose evidence or endpoint does not resolve", async () => {
    const graph = await executeEvidenceGraph(
      baseInput({
        lanes: {
          offer: laneResult({
            ...offerLane,
            relationships: [
              { from: sellerId, to: offerId, kind: "sells", evidenceRefs: ["clm_missing"] }
            ]
          })
        }
      })
    );

    expect(graph.relationships).toEqual([]);
    expect(graph.gaps).toContain("relationships:pruned");
  });

  it("records a gap for a lane with no runner instead of inventing a claim", async () => {
    const run = await executeEvidenceGraphRun(
      baseInput({ lanes: { offer: laneResult(offerLane) } })
    );

    expect(run.graph.gaps).toContain("seller_identity:skipped");
    expect(run.graph.gaps).toContain("proof:skipped");
    expect(run.graph.claims).toHaveLength(1);
    expect(
      run.receipts.filter((receipt) => receipt.outcome === "skipped").length
    ).toBeGreaterThan(0);
  });

  it("adds an explicit unknown claim for a required topic with no evidence", async () => {
    const graph = await executeEvidenceGraph(
      baseInput({
        lanes: { offer: laneResult(offerLane) },
        requiredTopics: [{ subjectId: sellerId, topic: "proof" }]
      })
    );

    const unknown = graph.claims.find((claim) => claim.status === "unknown");
    expect(unknown).toMatchObject({
      subjectId: sellerId,
      confidence: "low",
      buyerFacing: false,
      allowedUses: []
    });
    expect(unknown?.prohibitedUses).toContain(EVIDENCE_USE.buyerFacingCopy);
    expect(graph.gaps.some((gap) => gap.startsWith("unknown:"))).toBe(true);
  });

  it("omits the unknown claim once the required topic resolves", async () => {
    const graph = await executeEvidenceGraph(
      baseInput({
        lanes: {
          proof: laneResult({
            entities: [sellerEntity],
            candidates: [
              candidate({
                subjectId: sellerId,
                topic: "proof",
                statement: "Acme published a named customer outcome.",
                laneId: "proof"
              })
            ]
          })
        },
        requiredTopics: [{ subjectId: sellerId, topic: "proof" }]
      })
    );

    expect(graph.claims.some((claim) => claim.status === "unknown")).toBe(false);
    expect(graph.gaps.some((gap) => gap.startsWith("unknown:"))).toBe(false);
  });
});

describe("evidence graph deadlines", () => {
  it("turns an overrunning lane into a gap and returns before the deadline", async () => {
    const deadlineMs = 300;
    const startedAt = Date.now();
    const run = await executeEvidenceGraphRun(
      baseInput({
        deadlineMs,
        reconcileReserveMs: 80,
        lanes: {
          seller_identity: laneResult(sellerLane),
          offer: () => new Promise<EvidenceLaneResult>(() => {})
        }
      })
    );
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(deadlineMs);
    expect(run.graph.gaps).toContain("offer:timeout");
    expect(run.graph.claims).toHaveLength(1);
    expect(run.graph.claims[0]?.subjectId).toBe(sellerId);
    expect(
      run.receipts.find((receipt) => receipt.laneId === "offer")?.outcome
    ).toBe("timeout");
  });

  it("aborts the lane signal when its budget elapses", async () => {
    let abortedForLane = false;
    await executeEvidenceGraphRun(
      baseInput({
        deadlineMs: 160,
        reconcileReserveMs: 60,
        lanes: {
          offer: (context) =>
            new Promise<EvidenceLaneResult>((resolve) => {
              context.signal.addEventListener("abort", () => {
                abortedForLane = true;
                resolve({});
              });
            })
        }
      })
    );

    expect(abortedForLane).toBe(true);
  });

  it("runs lanes in parallel rather than in sequence", async () => {
    const laneDelayMs = 120;
    const slowLane = (): Promise<EvidenceLaneResult> =>
      new Promise((resolve) => setTimeout(() => resolve(sellerLane), laneDelayMs));
    const startedAt = Date.now();
    await executeEvidenceGraphRun(
      baseInput({
        deadlineMs: 2_000,
        lanes: {
          seller_identity: slowLane,
          offer: slowLane,
          audience: slowLane,
          proof: slowLane,
          source: slowLane
        }
      })
    );

    expect(Date.now() - startedAt).toBeLessThan(laneDelayMs * 3);
  });

  it("times out every lane when the deadline is already spent", async () => {
    const run = await executeEvidenceGraphRun(
      baseInput({
        deadlineMs: 0,
        lanes: { seller_identity: laneResult(sellerLane), offer: laneResult(offerLane) }
      })
    );

    expect(run.graph.claims).toEqual([]);
    expect(run.graph.gaps).toContain("offer:timeout");
    expect(run.graph.gaps).toContain("seller_identity:timeout");
  });

  it("records an error outcome without a claim when a lane throws", async () => {
    const run = await executeEvidenceGraphRun(
      baseInput({
        lanes: {
          offer: async () => {
            throw new Error("provider unavailable");
          }
        }
      })
    );

    expect(run.graph.claims).toEqual([]);
    expect(run.graph.gaps).toContain("offer:error");
  });

  it("returns a claim-free stale graph when the revision moved on", async () => {
    const graph = await executeEvidenceGraph(
      baseInput({
        revision: 3,
        activeRevision: 4,
        lanes: {
          offer: async () => {
            throw new Error("lanes must not run for a stale revision");
          }
        }
      })
    );

    expect(graph.claims).toEqual([]);
    expect(graph.entities).toEqual([]);
    expect(graph.gaps).toEqual(["revision:stale"]);
  });
});

describe("material evidence changes the graph contract", () => {
  const materialFact = candidate({
    subjectId: offerId,
    topic: "mechanism",
    statement: "Acme routes every approval through one auditable policy engine.",
    laneId: "offer"
  });

  async function graphWith(candidates: EvidenceClaimCandidate[]) {
    return executeEvidenceGraphRun(
      baseInput({
        now: () => 5_000,
        lanes: {
          seller_identity: laneResult(sellerLane),
          offer: laneResult({ ...offerLane, candidates: [...(offerLane.candidates ?? []), ...candidates] })
        }
      })
    );
  }

  it("changes the digest and the derived claim set when a material fact is added", async () => {
    const without = await graphWith([]);
    const withFact = await graphWith([materialFact]);

    expect(withFact.digest).not.toBe(without.digest);
    expect(evidenceGraphClaimSet(withFact.graph)).not.toEqual(
      evidenceGraphClaimSet(without.graph)
    );
    expect(evidenceGraphClaimSet(withFact.graph)).toHaveLength(
      evidenceGraphClaimSet(without.graph).length + 1
    );
    expect(
      withFact.graph.claims.some((claim) =>
        claim.claim.includes("auditable policy engine")
      )
    ).toBe(true);
  });

  it("returns to the original digest and claim set when the fact is removed", async () => {
    const before = await graphWith([]);
    await graphWith([materialFact]);
    const after = await graphWith([]);

    expect(after.digest).toBe(before.digest);
    expect(evidenceGraphClaimSet(after.graph)).toEqual(
      evidenceGraphClaimSet(before.graph)
    );
  });

  it("keeps the digest stable when only timings move", async () => {
    const early = await executeEvidenceGraphRun(
      baseInput({ now: () => 1_000, lanes: { offer: laneResult(offerLane) } })
    );
    let tick = 0;
    const late = await executeEvidenceGraphRun(
      baseInput({
        now: () => (tick += 37),
        lanes: { offer: laneResult(offerLane) }
      })
    );

    expect(late.graph.timings).not.toEqual(early.graph.timings);
    expect(late.digest).toBe(early.digest);
  });
});

describe("evidence graph privacy", () => {
  const sourceArtifact = createSourceArtifact({
    source: {
      kind: "public-url",
      sourceUrl: "https://acme.example/platform?utm_source=visitor",
      finalUrl: "https://acme.example/platform?utm_source=visitor",
      mediaType: "text/html"
    },
    extraction: {
      method: "html-static",
      status: "complete",
      truncated: false,
      ocr: { status: "not-required", pageNumbers: [], reason: "HTML source." },
      warnings: []
    },
    content: {
      title: "Acme workflow automation platform",
      description: "Approval workflows for regulated operations teams.",
      text: `${RAW_BODY_SENTINEL.repeat(3)} ${PROMPT_SENTINEL}`,
      sections: [],
      links: [],
      assets: [],
      citations: []
    },
    createdAt: "2026-08-27T12:00:00.000Z"
  });

  it("keeps source bodies, markup, prompts, and query URLs out of the graph", async () => {
    const laneEvidence = sourceArtifactEvidence({
      laneId: "source",
      artifact: sourceArtifact
    });
    const run = await executeEvidenceGraphRun(
      baseInput({
        lanes: {
          source: laneResult(laneEvidence),
          offer: laneResult({
            ...offerLane,
            candidates: [
              candidate({
                subjectId: offerId,
                topic: "offer",
                statement: "<b>Acme sells a workflow automation platform.</b>",
                laneId: "offer"
              })
            ]
          })
        }
      })
    );

    const serializedGraph = JSON.stringify(run.graph);
    const serializedTrace = JSON.stringify(run.trace);
    for (const serialized of [serializedGraph, serializedTrace]) {
      expect(serialized).not.toContain("RAWBODYSENTINEL");
      expect(serialized).not.toContain("PROMPTSENTINEL");
      expect(serialized).not.toContain("utm_source");
      expect(serialized).not.toContain("https://acme.example");
      expect(serialized).not.toMatch(/<[a-z/]/i);
    }
    expect(serializedGraph).toContain("Acme sells a workflow automation platform.");
    expect(serializedTrace).not.toContain("Acme");
    expect(run.trace).toMatchObject({
      schemaVersion: "1.0",
      revision: 3,
      claimCount: run.graph.claims.length
    });
    expect(run.trace.inputFingerprintDigest).not.toContain("fp-acme-r3");
    expect(run.trace.lanes.every((lane) => /^[a-z0-9_]+$/.test(lane.laneId))).toBe(true);
  });

  it("reports an unreadable source as a gap rather than a claim", () => {
    const unreadable = createSourceArtifact({
      source: { kind: "public-url", sourceUrl: "https://acme.example/", mediaType: "text/html" },
      extraction: {
        method: "html-static",
        status: "complete",
        truncated: false,
        ocr: { status: "not-required", pageNumbers: [], reason: "HTML source." },
        warnings: []
      },
      content: {
        title: "Acme",
        text: "too short",
        sections: [],
        links: [],
        assets: [],
        citations: []
      }
    });

    expect(sourceArtifactEvidence({ laneId: "source", artifact: unreadable })).toEqual({
      entities: [],
      candidates: [],
      gaps: ["source:unreadable"],
      outcome: "empty"
    });
  });
});
