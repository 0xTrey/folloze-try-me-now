import { describe, expect, it } from "vitest";

import {
  MESSAGE_STRATEGY_VERSION,
  MESSAGING_COMPILER_SCHEMA_VERSION,
  MESSAGING_COMPILER_VERSION,
  STRATEGY_DIMENSION_WEIGHTS,
  compileEvidenceLedger,
  compilerConfidenceBand,
  compilerEvidenceFromLiveBrief,
  compilerEvidenceFromSessionItems,
  compilerEvidencePermissions,
  messageStrategyDigestSource,
  messagingCompilerDigestSource,
  validateMessagingCompilerArtifact
} from "@/lib/generation/messaging-compiler-contracts";
import type {
  CompilerEvidenceConfidence,
  CompilerEvidenceItem,
  CompilerEvidenceKind,
  MessageStrategyCandidate,
  MessagingCompilerArtifact,
  MessagingCompilerArtifactIssue,
  StrategyEvaluation
} from "@/lib/generation/messaging-compiler-contracts";
import type {
  LiveBriefFieldProvenance,
  MaterialLiveBriefEvidence
} from "@/lib/research/evidence-reconciler";
import type { SessionEvidenceItem } from "@/lib/types";

const revision = 1_204;

const laneAuditClaim =
  "Northbridge quality logs recorded excursions above eight degrees on twelve of forty pharma lanes.";
const laneAuditSource = "https://northbridge-pharma.example/quality-logs";

function sessionEvidence(
  id: string,
  overrides: Partial<SessionEvidenceItem> = {}
): SessionEvidenceItem {
  return {
    id,
    type: "public-operating-context",
    label: "Lane excursion audit",
    text: laneAuditClaim,
    sourceUrl: laneAuditSource,
    signals: ["cold-chain", "pharma-lanes"],
    disposition: "available",
    entityRole: "seller",
    confidence: "high",
    ...overrides
  };
}

function provenance(
  overrides: Partial<LiveBriefFieldProvenance> = {}
): LiveBriefFieldProvenance {
  return {
    authority: "public",
    semanticRole: "company-research",
    worker: "company-researcher",
    source: "company-researcher",
    observedAt: "2026-02-11T09:00:00.000Z",
    ...overrides
  };
}

function liveBriefEvidence(
  overrides: Partial<MaterialLiveBriefEvidence> = {}
): MaterialLiveBriefEvidence {
  return {
    revision,
    fields: {
      positioning: {
        revision,
        value: "Validated cold-chain lane coverage for pharma and biologics freight.",
        evidenceRefs: ["brief-ref-positioning"],
        confidence: 0.92,
        provenance: [provenance()],
        visitorEdited: false
      },
      category: {
        revision,
        value: "Cold-chain lane assurance",
        evidenceRefs: ["brief-ref-category"],
        confidence: 0.55,
        provenance: [
          provenance({
            authority: "visitor",
            semanticRole: "visitor-edit",
            worker: "visitor",
            source: "visitor-edit"
          })
        ],
        visitorEdited: true
      }
    },
    materialCompleteness: "incomplete",
    unresolvedFields: [],
    optionalEvidenceMissing: [],
    conflicts: [],
    ...overrides
  };
}

function ledgerItem(
  id: string,
  kind: CompilerEvidenceKind,
  confidence: CompilerEvidenceConfidence,
  overrides: Partial<CompilerEvidenceItem> = {}
): CompilerEvidenceItem {
  return {
    id,
    kind,
    claim: laneAuditClaim,
    sourceAuthority: "seller-official",
    sourceRef: laneAuditSource,
    confidence,
    ...compilerEvidencePermissions(kind, confidence),
    ...overrides
  };
}

function strategyCandidate(
  id: string,
  overrides: Partial<MessageStrategyCandidate> = {}
): MessageStrategyCandidate {
  return {
    id,
    version: MESSAGE_STRATEGY_VERSION,
    frameworkId: "problem-change",
    angle: "tension",
    audienceJob: "Hold every validated pharma lane inside its temperature window.",
    bigIdea: "Lane Assurance costs Northbridge less than the reefer failures it prevents.",
    promise: "Every validated pharma lane stays inside its window from dock to dock.",
    mechanism: "Reefer telemetry is read at each lane segment and a drifting compressor is flagged early.",
    proofPlan: "Lead with the referenced lane audit and state plainly where it stops.",
    objectionPlan: "Compare the flagged lanes against your own excursion log.",
    ctaLogic: "Book a lane audit for the two lanes carrying the most excursions.",
    evidenceRefs: ["ev-lane-audit"],
    unknowns: [],
    ...overrides
  };
}

function evaluation(
  candidateId: string,
  overrides: Partial<StrategyEvaluation> = {}
): StrategyEvaluation {
  return {
    candidateId,
    total: 74.5,
    dimensions: {
      audienceRelevance: 16,
      offerSpecificity: 14,
      differentiation: 11.5,
      evidenceStrength: 18,
      narrativeCoherence: 10,
      ctaAlignment: 5
    },
    hardFailures: [],
    reasonCodes: ["angle_tension", "framework_problem-change"],
    ...overrides
  };
}

function compilerArtifact(
  overrides: Partial<MessagingCompilerArtifact> = {}
): MessagingCompilerArtifact {
  return {
    schemaVersion: MESSAGING_COMPILER_SCHEMA_VERSION,
    compilerVersion: MESSAGING_COMPILER_VERSION,
    briefRevision: revision,
    evidenceLedger: [
      ledgerItem("ev-lane-audit", "fact", "high"),
      ledgerItem("ev-reefer-telemetry", "fact", "medium")
    ],
    strategies: [
      strategyCandidate("strategy-tension"),
      strategyCandidate("strategy-proof", {
        angle: "proof",
        frameworkId: "proof-led-decision",
        evidenceRefs: ["ev-reefer-telemetry"]
      })
    ],
    evaluations: [evaluation("strategy-tension"), evaluation("strategy-proof")],
    selectedStrategyId: "strategy-tension",
    pagePlan: {
      family: "launch",
      sectionPlan: [
        { id: "launch-1", role: "buyer-outcome", strategyJobs: ["big-idea"] },
        { id: "launch-2", role: "current-friction", strategyJobs: ["tension"] },
        { id: "launch-5", role: "proof", strategyJobs: ["proof"] },
        { id: "launch-6", role: "next-move", strategyJobs: ["cta"] }
      ]
    },
    visibility: "internal",
    ...overrides
  };
}

describe("compiler evidence permissions", () => {
  it("strips the declarative uses from low-confidence evidence and forbids it as proof or urgency", () => {
    expect(compilerEvidencePermissions("fact", "low")).toEqual({
      allowedUses: ["choice", "cta", "mechanism", "team"],
      prohibitedUses: [
        "competitive-comparison",
        "declarative-claim",
        "proof-point",
        "urgency-claim"
      ]
    });
  });

  it("never lets an inference stand as a proof point", () => {
    expect(compilerEvidencePermissions("inference", "high")).toEqual({
      allowedUses: ["choice", "mechanism", "team"],
      prohibitedUses: ["competitive-comparison", "declarative-claim", "proof-point"]
    });
  });

  it("never lets visitor context stand as a proof point", () => {
    expect(compilerEvidencePermissions("visitor-context", "high")).toEqual({
      allowedUses: ["choice", "cta", "hero"],
      prohibitedUses: ["competitive-comparison", "proof-point"]
    });
  });

  it("keeps all seven section uses open to a high-confidence fact", () => {
    const permissions = compilerEvidencePermissions("fact", "high");

    expect(permissions.allowedUses).toEqual([
      "choice",
      "credibility",
      "cta",
      "hero",
      "mechanism",
      "team",
      "urgency"
    ]);
    expect(permissions.prohibitedUses).toEqual(["competitive-comparison"]);
  });
});

describe("session evidence adapter", () => {
  it("keeps excluded session evidence out of the ledger entirely", () => {
    const items = compilerEvidenceFromSessionItems([
      sessionEvidence("ev-lane-audit"),
      sessionEvidence("ev-rejected-lane-blog", { disposition: "excluded" }),
      sessionEvidence("ev-reefer-telemetry", { disposition: "pinned" })
    ]);

    expect(items.map(({ id }) => id)).toEqual(["ev-lane-audit", "ev-reefer-telemetry"]);
  });

  it("attributes target-role research to the target rather than to the seller", () => {
    const [targetItem] = compilerEvidenceFromSessionItems([
      sessionEvidence("ev-northbridge-quality", { entityRole: "target" })
    ]);
    const [sellerItem] = compilerEvidenceFromSessionItems([
      sessionEvidence("ev-cryolane-lanes", { entityRole: "seller" })
    ]);

    expect(targetItem!.sourceAuthority).toBe("target-official");
    expect(sellerItem!.sourceAuthority).toBe("seller-official");
  });

  it("treats session evidence with no stated confidence as medium", () => {
    const [item] = compilerEvidenceFromSessionItems([
      sessionEvidence("ev-lane-audit", { confidence: undefined })
    ]);

    expect(item!.confidence).toBe("medium");
    expect(item!.allowedUses).toEqual(
      compilerEvidencePermissions("fact", "medium").allowedUses
    );
  });
});

describe("live brief evidence adapter", () => {
  it("classifies a visitor-edited brief field as visitor context", () => {
    const items = compilerEvidenceFromLiveBrief(liveBriefEvidence());
    const category = items.find(({ id }) => id === "brief:category");

    expect(category).toMatchObject({
      kind: "visitor-context",
      sourceAuthority: "visitor",
      sourceRef: "brief-ref-category"
    });
    expect(category!.claim).toBe("Seller category: Cold-chain lane assurance");
    expect(category!.confidence).toBe(compilerConfidenceBand(0.55));
  });

  it("classifies a worker-derived brief field as an inference", () => {
    const items = compilerEvidenceFromLiveBrief(liveBriefEvidence());
    const positioning = items.find(({ id }) => id === "brief:positioning");

    expect(positioning).toMatchObject({
      kind: "inference",
      sourceAuthority: "public",
      sourceRef: "brief-ref-positioning"
    });
    expect(positioning!.confidence).toBe(compilerConfidenceBand(0.92));
    expect(positioning!.prohibitedUses).toContain("proof-point");
  });

  it("returns nothing when no reconciled brief evidence exists", () => {
    expect(compilerEvidenceFromLiveBrief(undefined)).toEqual([]);
  });
});

describe("evidence ledger compilation", () => {
  it("keeps the session classification when a brief field restates the same id", () => {
    const ledger = compileEvidenceLedger({
      sessionEvidence: [sessionEvidence("brief:category"), sessionEvidence("ev-lane-audit")],
      liveBriefEvidence: liveBriefEvidence()
    });

    expect(ledger.map(({ id }) => id)).toEqual([
      "brief:category",
      "brief:positioning",
      "ev-lane-audit"
    ]);
    expect(ledger[0]!.kind).toBe("fact");
    expect(ledger[1]!.kind).toBe("inference");
  });

  it("returns one ledger in a stable id order regardless of input order", () => {
    const first = compileEvidenceLedger({
      sessionEvidence: [
        sessionEvidence("ev-reefer-telemetry"),
        sessionEvidence("ev-lane-audit")
      ],
      liveBriefEvidence: liveBriefEvidence()
    });
    const second = compileEvidenceLedger({
      sessionEvidence: [
        sessionEvidence("ev-lane-audit"),
        sessionEvidence("ev-reefer-telemetry")
      ],
      liveBriefEvidence: liveBriefEvidence()
    });

    expect(first).toEqual(second);
    expect(first.map(({ id }) => id)).toEqual([
      "brief:category",
      "brief:positioning",
      "ev-lane-audit",
      "ev-reefer-telemetry"
    ]);
  });
});

describe("messaging compiler artifact validation", () => {
  it("returns no issues for a well-formed artifact", () => {
    expect(validateMessagingCompilerArtifact(compilerArtifact())).toEqual([]);
  });

  it("rejects an artifact whose versions or brief revision cannot be trusted", () => {
    const mutations: Array<[MessagingCompilerArtifactIssue, MessagingCompilerArtifact]> = [
      [
        "invalid_schema_version",
        { ...compilerArtifact(), schemaVersion: "0.9" } as unknown as MessagingCompilerArtifact
      ],
      ["invalid_compiler_version", compilerArtifact({ compilerVersion: "messaging compiler 1" })],
      ["invalid_brief_revision", compilerArtifact({ briefRevision: -1 })]
    ];

    for (const [issue, artifact] of mutations) {
      expect(validateMessagingCompilerArtifact(artifact)).toContain(issue);
    }
  });

  it("rejects duplicated ids and evidence references that point nowhere", () => {
    const mutations: Array<[MessagingCompilerArtifactIssue, MessagingCompilerArtifact]> = [
      [
        "duplicate_evidence_id",
        compilerArtifact({
          evidenceLedger: [
            ledgerItem("ev-lane-audit", "fact", "high"),
            ledgerItem("ev-lane-audit", "fact", "medium"),
            ledgerItem("ev-reefer-telemetry", "fact", "medium")
          ]
        })
      ],
      [
        "duplicate_strategy_id",
        compilerArtifact({
          strategies: [
            strategyCandidate("strategy-tension"),
            strategyCandidate("strategy-tension", { angle: "upside" })
          ]
        })
      ],
      [
        "dangling_evidence_ref",
        compilerArtifact({
          strategies: [
            strategyCandidate("strategy-tension", { evidenceRefs: ["ev-lane-audit"] }),
            strategyCandidate("strategy-proof", {
              angle: "proof",
              evidenceRefs: ["ev-unlisted-cross-dock"]
            })
          ]
        })
      ]
    ];

    for (const [issue, artifact] of mutations) {
      expect(validateMessagingCompilerArtifact(artifact)).toContain(issue);
    }
  });

  it("rejects evaluations that do not line up one-to-one with the strategies", () => {
    const mutations: Array<[MessagingCompilerArtifactIssue, MessagingCompilerArtifact]> = [
      ["missing_evaluation", compilerArtifact({ evaluations: [evaluation("strategy-tension")] })],
      [
        "orphan_evaluation",
        compilerArtifact({
          evaluations: [
            evaluation("strategy-tension"),
            evaluation("strategy-proof"),
            evaluation("strategy-abandoned")
          ]
        })
      ],
      [
        "duplicate_evaluation",
        compilerArtifact({
          evaluations: [
            evaluation("strategy-tension"),
            evaluation("strategy-tension"),
            evaluation("strategy-proof")
          ]
        })
      ],
      [
        "non_finite_score",
        compilerArtifact({
          evaluations: [
            evaluation("strategy-tension", { total: Number.NaN }),
            evaluation("strategy-proof")
          ]
        })
      ],
      [
        "score_out_of_range",
        compilerArtifact({
          evaluations: [
            evaluation("strategy-tension", { total: 140.5 }),
            evaluation("strategy-proof")
          ]
        })
      ],
      [
        "score_out_of_range",
        compilerArtifact({
          evaluations: [
            evaluation("strategy-tension", {
              dimensions: {
                ...evaluation("strategy-tension").dimensions,
                differentiation: STRATEGY_DIMENSION_WEIGHTS.differentiation + 1
              }
            }),
            evaluation("strategy-proof")
          ]
        })
      ]
    ];

    for (const [issue, artifact] of mutations) {
      expect(validateMessagingCompilerArtifact(artifact)).toContain(issue);
    }
  });

  it("rejects a selection that names an absent or hard-failed strategy", () => {
    const mutations: Array<[MessagingCompilerArtifactIssue, MessagingCompilerArtifact]> = [
      ["invalid_selected_strategy", compilerArtifact({ selectedStrategyId: "strategy-upside" })],
      [
        "selected_strategy_failed",
        compilerArtifact({
          evaluations: [
            evaluation("strategy-tension", {
              total: 0,
              hardFailures: ["tension_not_evidence_bound"]
            }),
            evaluation("strategy-proof")
          ]
        })
      ]
    ];

    for (const [issue, artifact] of mutations) {
      expect(validateMessagingCompilerArtifact(artifact)).toContain(issue);
    }
  });

  it("rejects a page plan that leaves a section idle or argues one job twice", () => {
    const mutations: Array<[MessagingCompilerArtifactIssue, MessagingCompilerArtifact]> = [
      [
        "duplicate_section_id",
        compilerArtifact({
          pagePlan: {
            family: "launch",
            sectionPlan: [
              { id: "launch-1", role: "buyer-outcome", strategyJobs: ["big-idea"] },
              { id: "launch-1", role: "current-friction", strategyJobs: ["tension"] }
            ]
          }
        })
      ],
      [
        "section_without_strategy_job",
        compilerArtifact({
          pagePlan: {
            family: "launch",
            sectionPlan: [
              { id: "launch-1", role: "buyer-outcome", strategyJobs: ["big-idea"] },
              { id: "launch-2", role: "current-friction", strategyJobs: [] }
            ]
          }
        })
      ],
      [
        "duplicate_strategy_job",
        compilerArtifact({
          pagePlan: {
            family: "launch",
            sectionPlan: [
              { id: "launch-1", role: "buyer-outcome", strategyJobs: ["big-idea"] },
              { id: "launch-2", role: "current-friction", strategyJobs: ["big-idea"] }
            ]
          }
        })
      ]
    ];

    for (const [issue, artifact] of mutations) {
      expect(validateMessagingCompilerArtifact(artifact)).toContain(issue);
    }
  });
});

describe("digest-safe projections", () => {
  it("receipts the artifact by ids and counts without disclosing any claim text", () => {
    const serialized = JSON.stringify(messagingCompilerDigestSource(compilerArtifact()));

    expect(serialized).toContain("ev-lane-audit");
    expect(serialized).toContain("launch-1:buyer-outcome");
    expect(serialized).not.toContain("excursions above eight degrees");
    expect(serialized).not.toContain("northbridge-pharma.example");
  });

  it("carries the strategy directive slots while withholding ledger claims and source urls", () => {
    const strategy = strategyCandidate("strategy-tension");
    const serialized = JSON.stringify(messageStrategyDigestSource(strategy));

    expect(serialized).toContain(strategy.bigIdea);
    expect(serialized).toContain(strategy.proofPlan);
    expect(serialized).not.toContain("excursions above eight degrees");
    expect(serialized).not.toContain("northbridge-pharma.example");
  });
});
